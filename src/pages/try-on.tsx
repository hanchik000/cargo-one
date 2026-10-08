// AR try-on studio: live camera (on-device tracking), photo upload, or the demo mannequin.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent as RChangeEvent, KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent } from 'react';
import { useI18n } from '@/i18n';
import type { StringKey } from '@/i18n';
import { Link, navigate, useQueryParam } from '@/lib/router';
import { asset, IS_STATIC_DEMO } from '@/lib/assets';
import { useDbRevision } from '@/lib/hooks';
import { estimateProduct } from '@/lib/pricing';
import type { Product, TryOnKind } from '@/lib/types';
import { db } from '@/services/db';
import { useCart } from '@/state/cart';
import { Button, cn, useToast } from '@/components/ui';
import { usePageTitle } from '@/components/shell';
import { LogoMark } from '@/components/brand';
import {
  IconBack, IconCamera, IconCart, IconCheck, IconDownload, IconFlipCamera, IconImage, IconPerson, IconRetry, IconRotateL, IconRotateR,
  IconScanFace, IconShare, IconSpinner, IconX, IconZoomIn, IconZoomOut, IconMove, IconArrow, IconLock,
} from '@/components/icons';
import { detect, loadEngine, TrackingError } from '@/features/tryon/engine';
import type { Landmarks } from '@/features/tryon/engine';
import { drawPlacement, KIND, loadSprites, mannequinLandmarks, NO_ADJUST, place, smooth } from '@/features/tryon/compose';
import type { Adjust, Miss, Placement, SpriteImages } from '@/features/tryon/compose';

type Mode = 'start' | 'camera' | 'photo' | 'model';
type Status = 'idle' | 'loading' | 'analyzing' | 'searching' | 'tracking' | 'ready' | 'error';
type ErrKey = 'denied' | 'no_camera' | 'busy' | 'insecure' | 'unsupported' | 'camera_failed' | 'webgl' | 'load_failed' | 'no_person' | 'bad_photo';

declare global { interface Window { claude?: { use(name: string): Promise<unknown> } } }

const MISS_KEY: Record<Miss, StringKey> = { no_face: 'tryon.miss.face', no_body: 'tryon.miss.body', no_arm: 'tryon.miss.arm', no_feet: 'tryon.miss.feet' };
const KIND_KEY = (k: TryOnKind) => `tryon.kind.${k}` as StringKey;
const spriteSrc = (name: string) => asset(`img/tryon/${name}.webp`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cameraError(e: unknown): ErrKey {
  if (IS_STATIC_DEMO) return 'unsupported'; // the published preview never grants the camera
  const n = (e as { name?: string })?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return 'denied';
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'no_camera';
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return 'busy';
  return 'camera_failed';
}

export function TryOnPage() {
  const { t, tk, money } = useI18n();
  useDbRevision();
  const toast = useToast();
  const cart = useCart();
  const [pid, setPid] = useQueryParam('p');
  const items = useMemo(() => db().products.filter((p) => p.tryOn && p.published), []);
  const product: Product = items.find((p) => p.id === pid) || items[0];
  const kind = product.tryOn as TryOnKind;
  usePageTitle(t('tryon.title'));

  const [mode, setMode] = useState<Mode>('start');
  const [status, setStatus] = useState<Status>('idle');
  const [err, setErr] = useState<ErrKey | null>(null);
  const [miss, setMiss] = useState<Miss | null>(null);
  const [adjusts, setAdjusts] = useState<Partial<Record<TryOnKind, Adjust>>>({});
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [multiCam, setMultiCam] = useState(false);
  const [shot, setShot] = useState<{ url: string; blob: Blob } | null>(null);
  const [tools, setTools] = useState(false);
  const adjust = adjusts[kind] || NO_ADJUST;

  const canvas = useRef<HTMLCanvasElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const photo = useRef<{ img: HTMLCanvasElement; lm: Landmarks } | null>(null);
  const mannequin = useRef<Record<string, HTMLImageElement>>({});
  const live = useRef<Landmarks | null>(null);
  const sprites = useRef<SpriteImages | null>(null);
  const lastPlacement = useRef<Placement | null>(null);
  const dirty = useRef(true);
  const missRef = useRef<Miss | null>(null);
  const placedRef = useRef(false);
  const [placed, setPlaced] = useState(false);
  const state = useRef({ mode, kind, adjust, facing });
  state.current = { mode, kind, adjust, facing };
  const tracking = useRef(0); // generation counter for the detection loop

  // Sprites for the selected item.
  useEffect(() => {
    let off = false;
    sprites.current = null; dirty.current = true;
    loadSprites(kind, spriteSrc).then((s) => { if (!off) { sprites.current = s; dirty.current = true; } }).catch(() => {});
    return () => { off = true; };
  }, [kind]);
  useEffect(() => { dirty.current = true; }, [adjust, mode]);
  useEffect(() => { placedRef.current = false; setPlaced(false); }, [mode, kind]);

  const stopCamera = useCallback(() => {
    tracking.current++;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null; live.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  // ---------- render loop ----------
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const c = canvas.current; const s = state.current;
      if (!c || s.mode === 'start') return;
      let src: CanvasImageSource | null = null; let w = 0, h = 0; let lm: Landmarks | null = null; let mirror = false;
      if (s.mode === 'camera') {
        const v = video.current; if (!v || v.readyState < 2 || !v.videoWidth) return;
        src = v; w = v.videoWidth; h = v.videoHeight; lm = live.current; mirror = s.facing === 'user';
      } else if (s.mode === 'photo') {
        if (!photo.current) return;
        if (!dirty.current) return;
        src = photo.current.img; w = src.width; h = src.height; lm = photo.current.lm;
      } else {
        const name = KIND[s.kind].group === 'face' ? 'mannequin-close' : 'mannequin-full';
        const img = mannequin.current[name]; if (!img || !img.complete) return;
        if (!dirty.current) return;
        src = img; w = img.naturalWidth; h = img.naturalHeight; lm = mannequinLandmarks(name);
      }
      dirty.current = false;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const ctx = c.getContext('2d'); if (!ctx) return;
      ctx.setTransform(mirror ? -1 : 1, 0, 0, 1, mirror ? w : 0, 0);
      ctx.drawImage(src, 0, 0, w, h);
      let m: Miss | null = null;
      lastPlacement.current = null;
      if (lm && sprites.current) {
        const p = place(s.kind, lm);
        if (typeof p === 'string') { m = p; lastPlacement.current = null; }
        else { drawPlacement(ctx, p, sprites.current, s.adjust); lastPlacement.current = p; }
      } else if (s.mode === 'camera' && !lm) m = KIND[s.kind].group === 'face' ? 'no_face' : 'no_body';
      if (m !== missRef.current) { missRef.current = m; setMiss(m); }
      const ok = !!lastPlacement.current && !m;
      if (ok !== placedRef.current) { placedRef.current = ok; setPlaced(ok); }
      if (s.mode === 'camera') setStatus((st) => (st === 'loading' || st === 'error' ? st : m ? 'searching' : 'tracking'));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ---------- sources ----------
  const startCamera = useCallback(async (face: 'user' | 'environment' = facing) => {
    stopCamera(); setErr(null); setShot(null); setMode('camera'); setStatus('loading');
    if (!window.isSecureContext) { setErr('insecure'); setStatus('error'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setErr('unsupported'); setStatus('error'); return; }
    const gen = ++tracking.current;
    try {
      const [ms, engine] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } } }),
        loadEngine(),
      ]);
      if (gen !== tracking.current) { ms.getTracks().forEach((tr) => tr.stop()); return; }
      stream.current = ms;
      const v = video.current!; v.srcObject = ms; v.muted = true; v.playsInline = true; await v.play();
      try { const devs = await navigator.mediaDevices.enumerateDevices(); setMultiCam(devs.filter((d) => d.kind === 'videoinput').length > 1); } catch { /* ignore */ }
      setStatus('searching');
      // Detection loop: one frame at a time, as fast as the device allows.
      while (gen === tracking.current) {
        if (v.readyState >= 2 && !document.hidden) {
          try { const lm = await detect(engine, v, KIND[state.current.kind].need); if (gen !== tracking.current) break; live.current = smooth(live.current, lm); dirty.current = true; } catch { await sleep(200); }
        } else await sleep(120);
        await sleep(0);
      }
    } catch (e) {
      if (gen !== tracking.current) return;
      stopCamera();
      setErr(e instanceof TrackingError ? (e.code === 'webgl_unavailable' ? 'webgl' : 'load_failed') : cameraError(e)); setStatus('error');
    }
  }, [facing, stopCamera]);

  const onPhoto = useCallback(async (file: File | undefined) => {
    if (!file) return;
    stopCamera(); setErr(null); setShot(null); setMode('photo'); setStatus('analyzing'); photo.current = null;
    try {
      if (!/^image\//.test(file.type)) throw new Error('bad_photo');
      const url = URL.createObjectURL(file);
      const img = new Image(); img.src = url; await img.decode();
      const k = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const engine = await loadEngine();
      const lm = await detect(engine, c, { face: true, body: true }, true);
      photo.current = { img: c, lm }; dirty.current = true;
      if (!lm.face && !lm.body) { setErr('no_person'); setStatus('ready'); return; }
      setStatus('ready');
    } catch (e) {
      setErr(e instanceof TrackingError ? (e.code === 'webgl_unavailable' ? 'webgl' : 'load_failed') : 'bad_photo'); setStatus('error');
    }
  }, [stopCamera]);

  const startModel = useCallback(() => {
    stopCamera(); setErr(null); setShot(null); setMode('model'); setStatus('ready');
    for (const name of ['mannequin-full', 'mannequin-close']) {
      if (mannequin.current[name]) continue;
      const img = new Image(); img.onload = () => { dirty.current = true; }; img.src = asset(`img/tryon/${name}.webp`); mannequin.current[name] = img;
    }
    dirty.current = true;
  }, [stopCamera]);

  // Default for the static demo (no camera there): show the mannequin right away.
  useEffect(() => { if (IS_STATIC_DEMO) startModel(); }, [startModel]);

  // ---------- adjust ----------
  const setAdj = (fn: (a: Adjust) => Adjust) => setAdjusts((m) => ({ ...m, [kind]: fn(m[kind] || NO_ADJUST) }));
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<number | null>(null);
  const toCanvas = (dx: number, dy: number) => {
    const c = canvas.current!; const r = c.getBoundingClientRect(); const k = c.width / r.width;
    const mirror = state.current.mode === 'camera' && state.current.facing === 'user';
    return [dx * k * (mirror ? -1 : 1), dy * k] as const;
  };
  const onPointerDown = (e: RPointerEvent<HTMLCanvasElement>) => { if (mode === 'start') return; e.currentTarget.setPointerCapture(e.pointerId); pointers.current.set(e.pointerId, [e.clientX, e.clientY]); };
  const onPointerMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId); if (!prev || !lastPlacement.current) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch.current) { const f = d / pinch.current; setAdj((x) => ({ ...x, scale: Math.min(2.5, Math.max(0.4, x.scale * f)) })); }
      pinch.current = d; return;
    }
    const [dx, dy] = toCanvas(e.clientX - prev[0], e.clientY - prev[1]); const ref = lastPlacement.current.ref || 100;
    setAdj((x) => ({ ...x, dx: x.dx + dx / ref, dy: x.dy + dy / ref }));
  };
  const onPointerUp = (e: RPointerEvent<HTMLCanvasElement>) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };
  const zoom = (f: number) => setAdj((x) => ({ ...x, scale: Math.min(2.5, Math.max(0.4, x.scale * f)) }));
  const rotate = (deg: number) => setAdj((x) => ({ ...x, rot: x.rot + (deg * Math.PI) / 180 }));
  const reset = () => setAdjusts((m) => ({ ...m, [kind]: NO_ADJUST }));
  const onKey = (e: RKeyboardEvent<HTMLCanvasElement>) => {
    const step = 0.02; const map: Record<string, () => void> = {
      ArrowLeft: () => setAdj((x) => ({ ...x, dx: x.dx - step })), ArrowRight: () => setAdj((x) => ({ ...x, dx: x.dx + step })),
      ArrowUp: () => setAdj((x) => ({ ...x, dy: x.dy - step })), ArrowDown: () => setAdj((x) => ({ ...x, dy: x.dy + step })),
      '+': () => zoom(1.06), '=': () => zoom(1.06), '-': () => zoom(1 / 1.06), '[': () => rotate(-4), ']': () => rotate(4),
    };
    const fn = map[e.key]; if (fn) { e.preventDefault(); fn(); }
  };

  // ---------- snapshot ----------
  const snap = () => {
    const c = canvas.current; if (!c || mode === 'start') return;
    dirty.current = true;
    c.toBlob((blob) => { if (blob) setShot({ blob, url: URL.createObjectURL(blob) }); }, 'image/jpeg', 0.92);
  };
  useEffect(() => () => { if (shot) URL.revokeObjectURL(shot.url); }, [shot]);
  const fileName = `cargo-one-tryon-${product.id}.jpg`;
  const save = async () => {
    if (!shot) return;
    if (IS_STATIC_DEMO) {
      try {
        const d = (await window.claude?.use('downloads')) as { save(r: { filename: string; data: Blob }): Promise<unknown> } | null | undefined;
        if (!d) { toast(t('tryon.save_unavailable'), 'info'); return; }
        await d.save({ filename: fileName, data: shot.blob }); toast(t('tryon.saved'), 'ok');
      } catch (e) { if ((e as { code?: string })?.code !== 'declined') toast(t('tryon.save_unavailable'), 'info'); }
      return;
    }
    const a = document.createElement('a'); a.href = shot.url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  };
  const shareFile = shot && typeof navigator !== 'undefined' && 'canShare' in navigator ? new File([shot.blob], fileName, { type: 'image/jpeg' }) : null;
  const canShare = !!shareFile && !IS_STATIC_DEMO && navigator.canShare?.({ files: [shareFile] });
  const share = async () => { if (shareFile) { try { await navigator.share({ files: [shareFile], title: product.title }); } catch { /* cancelled */ } } };

  const est = estimateProduct(product, 1, db().content.settings);
  const active = mode !== 'start';
  const statusText = status === 'loading' ? t('tryon.status.loading') : status === 'analyzing' ? t('tryon.status.analyzing')
    : miss ? t(MISS_KEY[miss]) : mode === 'model' ? t('tryon.status.model') : mode === 'photo' ? t('tryon.status.photo') : status === 'tracking' ? t('tryon.status.tracking') : '';

  return (
    <div className="on-dark fixed inset-0 z-[60] flex flex-col bg-[#0b0b0c] text-white md:flex-row">
      <section data-testid="tryon-stage" data-mode={mode} data-status={status} data-placed={active && placed && status !== 'loading' && status !== 'analyzing' ? '1' : '0'} className="relative flex min-h-0 flex-1 flex-col">
        {/* top bar */}
        <header className="relative z-20 flex items-center gap-2 px-3 pb-2 pt-[max(12px,env(safe-area-inset-top))] md:px-5">
          <button type="button" onClick={() => (window.history.length > 1 ? window.history.back() : navigate('/shop'))} aria-label={t('common.back')} className="press grid size-10 place-items-center rounded-full bg-white/10 hover:bg-white/15"><IconBack className="size-5" aria-hidden /></button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[15px] font-semibold"><IconScanFace className="size-4 text-accent-2" aria-hidden />{t('tryon.title')}<span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">Beta</span></div>
            <div className="truncate text-[12px] text-white/55">{product.title}</div>
          </div>
          <div role="tablist" aria-label={t('tryon.source')} className="hidden rounded-full bg-white/10 p-1 sm:flex">
            {([['camera', IconCamera, () => startCamera()], ['photo', IconImage, () => fileInput.current?.click()], ['model', IconPerson, startModel]] as const).map(([m, Icon, fn]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={fn} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium transition', mode === m ? 'bg-white text-[#111]' : 'text-white/70 hover:text-white')}><Icon className="size-3.5" aria-hidden />{t(`tryon.mode.${m}` as StringKey)}</button>
            ))}
          </div>
        </header>

        {/* stage */}
        <div className="relative mx-3 mb-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[28px] bg-[#151517] md:mx-5">
          <video ref={video} className="hidden" playsInline muted aria-hidden />
          <canvas ref={canvas} tabIndex={active ? 0 : -1} aria-label={t('tryon.canvas_label', { item: product.title })} role="img"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKey}
            onWheel={(e: { deltaY: number }) => { if (active) zoom(Math.exp(-e.deltaY * 0.0012)); }}
            className={cn('max-h-full max-w-full touch-none select-none object-contain outline-none transition-opacity duration-500', active ? 'opacity-100' : 'opacity-0', active && 'cursor-grab active:cursor-grabbing')} />

          {!active ? (
            <div className="absolute inset-0 grid place-items-center overflow-y-auto p-4 md:p-5">
              <div className="animate-rise w-full max-w-md text-center">
                <div className="relative mx-auto mb-4 grid size-16 place-items-center rounded-[22px] bg-white/5 ring-1 ring-white/10 md:mb-6 md:size-24 md:rounded-[30px]">
                  <IconScanFace className="size-8 text-accent-2 md:size-11" aria-hidden />
                  <span className="absolute inset-0 animate-[pulse-ring_2.4s_ease-out_infinite] rounded-[inherit] ring-1 ring-accent-2/40" aria-hidden />
                </div>
                <h1 className="display text-balance text-[23px] leading-tight md:text-[34px]">{t('tryon.start.title')}</h1>
                <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-white/65 md:mt-3 md:text-[15px]">{t('tryon.start.body')}</p>
                <div className="mt-5 flex flex-col gap-2 md:mt-7 md:gap-2.5">
                  <Button size="lg" variant="accent" full icon={IconCamera} onClick={() => startCamera()}>{t('tryon.start.camera')}</Button>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button size="md" variant="inverse" full icon={IconImage} onClick={() => fileInput.current?.click()}>{t('tryon.start.photo')}</Button>
                    <Button size="md" variant="ghost" full icon={IconPerson} className="bg-white/10 text-white hover:bg-white/15" onClick={startModel}>{t('tryon.start.model')}</Button>
                  </div>
                </div>
                <p className="mt-4 flex items-center justify-center gap-1.5 text-[11.5px] text-white/45"><IconLock className="size-3.5" aria-hidden />{t('tryon.privacy')}</p>
              </div>
            </div>
          ) : null}

          {/* status + hint */}
          {active && statusText ? (
            <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-4">
              <div className={cn('flex max-w-full items-center gap-2 rounded-full px-3.5 py-2 text-[12.5px] font-medium backdrop-blur-md', miss ? 'bg-black/60 text-white' : 'bg-black/45 text-white/90')}>
                {status === 'loading' || status === 'analyzing' ? <IconSpinner className="size-3.5 animate-spin" aria-hidden />
                  : miss ? <span className="size-2 rounded-full bg-amber-400" aria-hidden /> : <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,.25)]" aria-hidden />}
                <span className="truncate">{statusText}</span>
              </div>
            </div>
          ) : null}

          {err ? (
            <div role="alert" className="absolute inset-x-3 bottom-24 mx-auto max-w-md rounded-[22px] bg-[#1f1f22]/95 p-4 text-[14px] shadow-2xl ring-1 ring-white/10 backdrop-blur">
              <div className="font-semibold">{t(`tryon.err.${err}.title` as StringKey)}</div>
              <p className="mt-1 text-white/65">{t(`tryon.err.${err}.body` as StringKey)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {err !== 'no_person' && err !== 'bad_photo' && err !== 'insecure' && err !== 'unsupported' ? <Button size="sm" variant="inverse" icon={IconRetry} onClick={() => startCamera()}>{t('common.retry')}</Button> : null}
                <Button size="sm" variant="ghost" className="bg-white/10 text-white" icon={IconImage} onClick={() => fileInput.current?.click()}>{t('tryon.start.photo')}</Button>
                <Button size="sm" variant="ghost" className="bg-white/10 text-white" icon={IconPerson} onClick={startModel}>{t('tryon.start.model')}</Button>
              </div>
            </div>
          ) : null}

          {/* adjust tools */}
          {active && tools ? (
            <div className="animate-pop absolute right-3 top-14 flex flex-col gap-1.5 rounded-[20px] bg-black/55 p-1.5 backdrop-blur-md" role="toolbar" aria-label={t('tryon.adjust')}>
              {([[IconZoomIn, () => zoom(1.08), 'tryon.bigger'], [IconZoomOut, () => zoom(1 / 1.08), 'tryon.smaller'], [IconRotateL, () => rotate(-4), 'tryon.rotate_l'], [IconRotateR, () => rotate(4), 'tryon.rotate_r'], [IconRetry, reset, 'tryon.reset']] as const).map(([Icon, fn, k]) => (
                <button key={k} type="button" onClick={fn} aria-label={t(k as StringKey)} title={t(k as StringKey)} className="press grid size-10 place-items-center rounded-full text-white hover:bg-white/15"><Icon className="size-[18px]" aria-hidden /></button>
              ))}
            </div>
          ) : null}

          {/* bottom controls */}
          {active ? (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/60 to-transparent px-4 pb-4 pt-10">
              <button type="button" onClick={() => setTools((v) => !v)} aria-pressed={tools} aria-label={t('tryon.adjust')} className={cn('press grid size-12 place-items-center rounded-full backdrop-blur', tools ? 'bg-white text-[#111]' : 'bg-white/15 text-white hover:bg-white/25')}><IconMove className="size-5" aria-hidden /></button>
              <button type="button" onClick={snap} aria-label={t('tryon.snap')} className="press group grid size-[72px] place-items-center rounded-full ring-4 ring-white/80 transition hover:ring-white">
                <span className="size-[56px] rounded-full bg-white transition group-active:scale-90" />
              </button>
              {mode === 'camera' && multiCam ? (
                <button type="button" onClick={() => { const f = facing === 'user' ? 'environment' : 'user'; setFacing(f); startCamera(f); }} aria-label={t('tryon.flip')} className="press grid size-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"><IconFlipCamera className="size-5" aria-hidden /></button>
              ) : mode === 'photo' ? (
                <button type="button" onClick={() => fileInput.current?.click()} aria-label={t('tryon.change_photo')} className="press grid size-12 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25"><IconImage className="size-5" aria-hidden /></button>
              ) : <span className="size-12" aria-hidden />}
            </div>
          ) : null}
          {active ? <p className="pointer-events-none absolute bottom-[92px] left-0 right-0 hidden text-center text-[11.5px] text-white/50 md:block">{t('tryon.drag_hint')}</p> : null}
        </div>
        {/* mobile source switch */}
        {active ? (
          <div className="flex justify-center gap-1 px-3 pb-2 sm:hidden" role="tablist" aria-label={t('tryon.source')}>
            {([['camera', IconCamera, () => startCamera()], ['photo', IconImage, () => fileInput.current?.click()], ['model', IconPerson, startModel]] as const).map(([m, Icon, fn]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={fn} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium', mode === m ? 'bg-white text-[#111]' : 'bg-white/10 text-white/75')}><Icon className="size-3.5" aria-hidden />{t(`tryon.mode.${m}` as StringKey)}</button>
            ))}
          </div>
        ) : null}
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e: RChangeEvent<HTMLInputElement>) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} data-testid="tryon-file" />
      </section>

      {/* item panel */}
      <aside className="max-h-[38vh] shrink-0 overflow-y-auto border-t border-white/10 bg-[#111113] px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 md:max-h-none md:w-[372px] md:border-l md:border-t-0 md:px-5 md:pt-6" aria-label={t('tryon.pick')}>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/55">{t('tryon.pick')}</h2><span className="num text-[12px] text-white/40">{items.length}</span></div>
        <ul className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:px-0">
          {items.map((p) => (
            <li key={p.id} className="shrink-0">
              <button type="button" onClick={() => setPid(p.id)} aria-pressed={p.id === product.id} className={cn('press group block w-[92px] text-left md:w-full')}>
                <span className={cn('block aspect-square overflow-hidden rounded-[18px] bg-white ring-2 ring-offset-2 ring-offset-[#111113] transition', p.id === product.id ? 'ring-accent-2' : 'ring-transparent group-hover:ring-white/30')}>
                  <img src={asset(`img/products/${p.id}-0.webp`)} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </span>
                <span className="mt-1.5 block truncate text-[11.5px] font-medium text-white/80">{tk(KIND_KEY(p.tryOn!))}</span>
              </button>
            </li>
          ))}
        </ul>
        <div key={product.id} className="animate-rise mt-5 rounded-[22px] bg-white/[0.04] p-4 ring-1 ring-white/10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-2">{tk(KIND_KEY(kind))}</div>
          <h3 className="mt-1 text-[17px] font-semibold leading-snug">{product.title}</h3>
          <div className="mt-3 flex items-end justify-between gap-3">
            <div><div className="price text-[22px] leading-none">{money(product.priceCNY, 'CNY')}</div><div className="mt-1 text-[12px] text-white/50">{t('price.tm_short')} ≈ {money(est.totalTMT, 'TMT', { decimals: 0 })}</div></div>
            <Link to={`/shop/${product.id}`} className="inline-flex items-center gap-1 text-[13px] text-white/70 hover:text-white">{t('tryon.view_product')}<IconArrow className="size-3.5" aria-hidden /></Link>
          </div>
          <Button className="mt-4" full size="lg" variant="inverse" icon={IconCart} onClick={() => { cart.add({ productId: product.id, qty: 1 }); toast(t('cart.added'), 'ok', { label: t('nav.cart'), to: '/cart' }); }}>{t('product.add_to_cart')}</Button>
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed text-white/40">{t('tryon.disclaimer')}</p>
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-white/40"><LogoMark size={14} onDark />{t('tryon.privacy')}</p>
      </aside>

      {/* snapshot sheet */}
      {shot ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4 backdrop-blur" role="dialog" aria-modal="true" aria-label={t('tryon.snap_title')}>
          <div className="animate-pop w-full max-w-md rounded-[28px] bg-[#18181a] p-4 ring-1 ring-white/10">
            <div className="mb-3 flex items-center justify-between"><div className="font-semibold">{t('tryon.snap_title')}</div><button type="button" onClick={() => setShot(null)} aria-label={t('common.close')} className="grid size-9 place-items-center rounded-full bg-white/10"><IconX className="size-4" aria-hidden /></button></div>
            <img src={shot.url} alt={t('tryon.canvas_label', { item: product.title })} className="max-h-[60vh] w-full rounded-[18px] object-contain" />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="inverse" icon={IconDownload} onClick={save}>{t('tryon.save')}</Button>
              {canShare ? <Button variant="ghost" className="bg-white/10 text-white" icon={IconShare} onClick={share}>{t('tryon.share')}</Button>
                : <Button variant="ghost" className="bg-white/10 text-white" icon={IconCheck} onClick={() => setShot(null)}>{t('common.done')}</Button>}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
