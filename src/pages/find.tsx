import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { currentHref, Link, navigate, useLocation } from '@/lib/router';
import { useAction } from '@/lib/hooks';
import { useVoiceInput } from '@/lib/voice';
import { searchService } from '@/services/searchService';
import type { FindMode, FindResult } from '@/services/searchService';
import { supplierService } from '@/services/supplierService';
import { db } from '@/services/db';
import { useAuth } from '@/state/auth';
import { useCart, useCompare } from '@/state/cart';
import { deliveryWindow } from '@/lib/pricing';
import { Badge, Button, cn, EmptyState, ErrorState, Input, Modal, Notice, PageHeader, Progress, Tabs, Textarea, UploadBox, useToast } from '@/components/ui';
import { FavoriteButton } from '@/components/commerce';
import { CompareBar } from './shop';
import { ProductVisual, SupplierLogo } from '@/components/visuals';
import { usePageTitle } from '@/components/shell';
import { IconCart, IconCompare, IconEye, IconImage, IconLink, IconMic, IconScan, IconSend, IconVideo, IconFile, IconInfo } from '@/components/icons';

const MODES: FindMode[] = ['image', 'url', 'video', 'text', 'voice'];
const MODE_ICON = { image: IconImage, url: IconLink, video: IconVideo, text: IconFile, voice: IconMic };

function ResultCard({ r, index }: { r: FindResult; index: number }) {
  const { t, tk, money } = useI18n();
  const cart = useCart();
  const cmp = useCompare('product');
  const toast = useToast();
  const { user } = useAuth();
  const [req, setReq] = useState(false);
  const [qty, setQty] = useState(String(r.product.moq));
  const [notes, setNotes] = useState('');
  const send = useAction(supplierService.requestQuote);
  const sup = db().suppliers.find((s) => s.id === r.product.supplierId)!;
  const [a, b] = deliveryWindow(r.product);
  const qtyErr = !/^\d+$/.test(qty) || Number(qty) < 1 ? t('form.invalid_qty') : null;
  const best = index === 0;
  return (
    <article className={cn('animate-rise flex flex-col overflow-hidden rounded-[28px]', best ? 'bg-[#111] text-white shadow-[var(--shadow-lift)]' : 'bg-paper shadow-[var(--shadow-soft)]')} style={{ animationDelay: `${index * 120}ms` }}>
      <div className="flex items-end justify-between gap-3 px-5 pb-4 pt-5">
        <div>
          <div className={cn('text-[11px] font-bold uppercase tracking-[0.14em]', best ? 'text-accent-2' : 'text-muted')}>{tk(`find.label.${r.label}`)}</div>
          <div className="display mt-1 text-[30px] leading-none">{Math.round(r.similarity * 100)}%<span className={cn('ml-2 font-sans text-[12px] font-semibold uppercase tracking-[0.1em]', best ? 'text-white/50' : 'text-muted')}>{t('find.match')}</span></div>
        </div>
        <FavoriteButton kind="product" refId={r.product.id} onDark={best} />
      </div>
      <Link to={`/shop/${r.product.id}`} className="group mx-3 block overflow-hidden rounded-[22px]" aria-label={r.product.title}>
        <ProductVisual icon={r.product.icon} image={r.product.images[0]} title={r.product.title} className="aspect-[4/5] w-full" rounded={false} />
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <Link to={`/shop/${r.product.id}`} className="line-clamp-2 text-[16px] font-semibold leading-snug hover:underline">{r.product.title}</Link>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div><div className={cn('text-[10.5px] font-semibold uppercase tracking-[0.1em]', best ? 'text-white/45' : 'text-muted')}>{t('price.china_price')}</div><div className="price text-[22px] leading-tight">{money(r.product.priceCNY, 'CNY')}</div></div>
          <div className="text-right"><div className={cn('text-[10.5px] font-semibold uppercase tracking-[0.1em]', best ? 'text-white/45' : 'text-muted')}>{t('price.tm_short')}</div><div className="price text-[16px] leading-tight">≈ {money(r.finalTMT, 'TMT', { decimals: 0 })}</div></div>
        </div>
        <dl className={cn('mt-4 grid grid-cols-2 gap-y-2 rounded-[18px] p-3.5 text-[12.5px]', best ? 'bg-white/[0.06]' : 'bg-mist')}>
          <dt className={best ? 'text-white/50' : 'text-muted'}>{t('find.supplier')}</dt><dd className="flex items-center justify-end gap-1.5 truncate text-right font-medium"><SupplierLogo monogram={sup.monogram} size={20} />{sup.name.split(' ').slice(0, 2).join(' ')}</dd>
          <dt className={best ? 'text-white/50' : 'text-muted'}>{t('score.supplier')}</dt><dd className="num text-right font-semibold">{r.supplierScore}</dd>
          <dt className={best ? 'text-white/50' : 'text-muted'}>{t('common.moq')}</dt><dd className="num text-right">{r.product.moq}</dd>
          <dt className={best ? 'text-white/50' : 'text-muted'}>{t('product.delivery')}</dt><dd className="text-right">{t('delivery.days', { min: a, max: b })}</dd>
        </dl>
        <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
          <Button size="sm" variant={best ? 'accent' : 'primary'} icon={IconCart} onClick={() => { cart.add({ productId: r.product.id, variantId: r.product.variants[0]?.id, qty: r.product.moq }); toast(t('cart.added'), 'ok', { label: t('nav.cart'), to: '/cart' }); }}>{t('product.add_short')}</Button>
          <Button size="sm" variant={best ? 'inverse' : 'secondary'} icon={IconEye} to={`/shop/${r.product.id}`}>{t('find.view')}</Button>
          <Button size="sm" variant={cmp.has(r.product.id) ? (best ? 'inverse' : 'primary') : best ? 'ghost' : 'secondary'} className={best && !cmp.has(r.product.id) ? 'text-white ring-1 ring-white/15 hover:bg-white/10' : undefined} icon={IconCompare} onClick={() => cmp.toggle(r.product.id)}>{t('compare.action')}</Button>
          <Button size="sm" variant={best ? 'ghost' : 'secondary'} className={best ? 'text-white ring-1 ring-white/15 hover:bg-white/10' : undefined} icon={IconSend} onClick={() => (user ? setReq(true) : navigate(`/login?next=${encodeURIComponent(currentHref())}`))}>{t('find.request')}</Button>
        </div>
      </div>
      <Modal open={req} onClose={() => setReq(false)} title={t('find.request_title')} description={r.product.title}
        footer={<><Button variant="secondary" onClick={() => setReq(false)}>{t('common.cancel')}</Button><Button loading={send.pending} disabled={!!qtyErr} onClick={async () => {
          const q = await send.run({ supplierId: sup.id, productTitle: r.product.title, qty: Number(qty), notes: `${t('find.request_note_prefix')} ${notes}`.trim(), kind: 'quote' });
          if (q) { setReq(false); toast(t('find.request_sent'), 'ok', user?.role === 'business' ? { label: t('nav.business'), to: '/business?tab=quotes' } : { label: t('nav.notifications'), to: '/notifications' }); }
        }}>{t('find.request_send')}</Button></>}>
        <div className="space-y-4">
          <p className="text-sm text-muted">{t('find.request_body')}</p>
          <Input label={t('product.quantity')} value={qty} onChange={(v) => setQty(v.replace(/\D/g, ''))} inputMode="numeric" error={qtyErr} />
          <Textarea label={t('find.request_notes')} value={notes} onChange={setNotes} rows={3} optional placeholder={t('find.request_notes_ph')} />
          {send.error ? <Notice tone="bad">{t('form.server_error')}</Notice> : null}
        </div>
      </Modal>
    </article>
  );
}

export function FindPage() {
  const { t, tk, lang } = useI18n();
  usePageTitle(t('nav.find'), t('meta.find'));
  const { query } = useLocation();
  const initialMode = (MODES.includes(query.get('mode') as FindMode) ? query.get('mode') : 'image') as FindMode;
  const [mode, setMode] = useState<FindMode>(initialMode);
  const [file, setFile] = useState<{ name: string; url?: string; size: number } | null>(null);
  const [url, setUrl] = useState(query.get('url') || '');
  const [text, setText] = useState(query.get('text') || '');
  const [fileErr, setFileErr] = useState('');
  const [progress, setProgress] = useState(0);
  const find = useAction(searchService.find);
  const [result, setResult] = useState<Awaited<ReturnType<typeof searchService.find>> | null>(null);
  const voice = useVoiceInput(lang, (s) => { setText(s); setMode('voice'); });
  const resultsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { if (query.get('url') && mode === 'url') void run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (file?.url) URL.revokeObjectURL(file.url); }, [file]);

  const urlErr = mode === 'url' && url && !/^https?:\/\/\S+\.\S+/.test(url) ? t('form.invalid_url') : null;
  const ready = mode === 'image' || mode === 'video' ? !!file : mode === 'url' ? !!url && !urlErr : text.trim().length >= 3;

  async function run() {
    setProgress(8);
    const timer = setInterval(() => setProgress((p) => Math.min(92, p + 7)), 140);
    const r = await find.run({ mode, text: text.trim(), url: url.trim(), fileName: file?.name });
    clearInterval(timer); setProgress(100);
    if (r) { setResult(r); setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80); }
  }
  const onFile = (f: File) => {
    setFileErr('');
    const isVideo = mode === 'video';
    if (isVideo ? !f.type.startsWith('video/') : !f.type.startsWith('image/')) { setFileErr(isVideo ? t('find.err_video') : t('find.err_image')); return; }
    if (f.size > (isVideo ? 100 : 15) * 1024 * 1024) { setFileErr(t('find.err_size')); return; }
    setFile({ name: f.name, size: f.size, url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined });
    setResult(null);
  };
  const examples = [t('find.example_1'), t('find.example_2'), t('find.example_3')];

  const block = (m: 'photo' | 'url' | 'text') => (m === 'photo' ? mode === 'image' || mode === 'video' : m === 'url' ? mode === 'url' : mode === 'text' || mode === 'voice');
  const blockCls = (on: boolean) => cn('relative rounded-[24px] transition-all duration-300', on ? 'bg-paper shadow-[0_0_0_2px_var(--color-ink),var(--shadow-lift)]' : 'bg-paper shadow-[var(--shadow-soft)] opacity-80 hover:opacity-100');
  const pick = (m: FindMode) => { if (m !== mode) { setMode(m); setResult(null); setFileErr(''); } };
  return (
    <div className="pb-24 lg:pb-0">
      <PageHeader display eyebrow={t('find.eyebrow')} title={t('find.title')} subtitle={t('find.subtitle')} />
      <section className="grid gap-4 lg:grid-cols-[1.25fr_1fr]" aria-label={t('find.input')}>
        <div className={blockCls(block('photo'))} onClick={() => !block('photo') && pick('image')}>
          <div className="flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]"><span className="mono text-faint">01</span>{t('find.block.photo')}</div>
            <div className="flex gap-1 rounded-full bg-mist p-1" role="tablist" aria-label={t('find.input')}>
              {(['image', 'video'] as const).map((m) => { const Icon = MODE_ICON[m]; return <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={(e: { stopPropagation(): void }) => { e.stopPropagation(); pick(m); if (m !== mode) setFile(null); }} className={cn('flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold', mode === m ? 'bg-paper shadow-sm' : 'text-muted')}><Icon className="size-3.5" aria-hidden />{tk(`find.mode.${m}`)}</button>; })}
            </div>
          </div>
          <div className="p-3 md:p-4">
            {file && block('photo') ? (
              <div className="relative overflow-hidden rounded-[20px] bg-[#111]">
                {file.url ? <img src={file.url} alt={file.name} className="img-in aspect-[4/3] w-full object-contain" /> : <div className="grid aspect-video place-items-center text-white/70"><IconVideo className="size-10" aria-hidden /></div>}
                {find.pending ? <div className="absolute inset-0 overflow-hidden"><div className="absolute inset-x-0 h-28 animate-[scan_1.4s_ease-in-out_infinite_alternate] bg-gradient-to-b from-transparent via-accent/45 to-transparent" /><div className="dot-grid-dark absolute inset-0" /></div> : null}
                <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-full bg-[#111]/80 py-2 pl-4 pr-2 text-[12px] text-white backdrop-blur">
                  <span className="truncate">{file.name}</span>
                  <button type="button" onClick={() => { setFile(null); setResult(null); }} className="shrink-0 rounded-full bg-white/10 px-3 py-1 font-semibold hover:bg-white/20">{t('find.replace')}</button>
                </div>
              </div>
            ) : (
              <UploadBox large title={mode === 'video' ? t('find.drop_video') : t('find.drop_photo')} accept={mode === 'video' ? 'video/*' : 'image/*'} onFile={(f) => { pick(mode === 'video' ? 'video' : 'image'); onFile(f); }} label={mode === 'video' ? t('find.upload_video') : t('find.upload_photo')} hint={mode === 'video' ? t('find.upload_video_hint') : t('find.upload_photo_hint')} icon={mode === 'video' ? IconVideo : IconScan} capture={mode === 'image'} />
            )}
            {fileErr ? <p className="mt-3 px-2 text-[13px] text-bad" role="alert">{fileErr}</p> : null}
          </div>
        </div>
        <div className="grid gap-4">
          <div className={cn(blockCls(block('url')), 'p-5')} onClick={() => !block('url') && pick('url')}>
            <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]"><span className="mono text-faint">02</span>{t('find.block.link')}</div>
            <Input label={t('find.paste_link')} value={url} onChange={(v) => { pick('url'); setUrl(v); }} placeholder="https://v.douyin.com/…" error={urlErr} hint={t('find.link_hint')} inputMode="url" />
          </div>
          <div className={cn(blockCls(block('text')), 'p-5')} onClick={() => !block('text') && pick('text')}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em]"><span className="mono text-faint">03</span>{t('find.block.describe')}</div>
              <Button size="sm" variant={voice.listening ? 'danger' : 'soft'} icon={IconMic} onClick={() => { pick('voice'); if (voice.listening) voice.stop(); else voice.start(); }}>{voice.listening ? t('find.voice_stop') : tk('find.mode.voice')}</Button>
            </div>
            <Textarea label={mode === 'voice' ? t('find.voice_transcript') : t('find.describe')} value={text} onChange={(v) => { if (mode !== 'voice') pick('text'); setText(v); }} rows={3} placeholder={t('find.describe_ph')} />
            {voice.unsupported && mode === 'voice' ? <div className="mt-3"><Notice tone="neutral">{t('find.voice_unsupported')}</Notice></div> : null}
            <div className="mt-3 flex flex-wrap gap-1.5">{examples.map((e) => <button key={e} type="button" onClick={() => { pick('text'); setText(e); }} className="press rounded-full bg-mist px-3 py-1.5 text-left text-[12px] text-muted hover:bg-mist-2 hover:text-ink">“{e}”</button>)}</div>
          </div>
        </div>
      </section>
      <div className="fixed inset-x-3 bottom-[96px] z-30 mx-auto max-w-[460px] rounded-[26px] bg-paper p-2 shadow-[var(--shadow-float)] lg:static lg:mx-0 lg:mt-5 lg:max-w-none lg:bg-transparent lg:p-0 lg:shadow-none">
        <div className="flex items-center gap-3">
          {find.pending ? <div className="hidden flex-1 lg:block"><Progress value={progress} accent label={t('find.searching')} /></div> : <p className="hidden flex-1 text-[12.5px] text-muted lg:block">{t('find.mock_note')}</p>}
          <Button size="lg" full className="lg:w-auto lg:px-10" disabled={!ready} loading={find.pending} icon={IconScan} onClick={run}>{t('find.action')}</Button>
        </div>
      </div>

      <section ref={resultsRef} aria-live="polite" aria-label={t('find.results')} className="mt-10 scroll-mt-24">
        {find.error ? <ErrorState error={find.error} onRetry={run} />
          : !result ? (
            <div className="rounded-[28px] border-[1.5px] border-dashed border-mist-3 p-8 text-center md:p-12">
              <h2 className="text-lg font-semibold">{t('find.empty_title')}</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t('find.empty_body')}</p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">{(['best_match', 'cheaper', 'premium'] as const).map((l, i) => <span key={l} className={cn('rounded-full px-4 py-2 text-[12px] font-bold uppercase tracking-[0.1em]', i === 0 ? 'bg-[#111] text-white' : 'bg-paper shadow-[var(--shadow-soft)]')}>{tk(`find.label.${l}`)}</span>)}</div>
            </div>
          ) : !result.results.length ? <EmptyState title={t('find.no_results')} body={t('find.no_results_body')} action={<Button to="/ai-buyer">{t('home.qa.ai_buyer')}</Button>} />
          : (
            <div>
              <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                <h2 className="text-[22px] font-semibold uppercase tracking-[0.02em]">{t('find.results_title', { n: result.results.length })}</h2>
                <Badge icon={IconInfo}>{t('find.detected', { cat: tk(`cat.${result.category}`) })}</Badge>
              </div>
              <div className="grid gap-4 md:grid-cols-3">{result.results.map((r, i) => <ResultCard key={r.product.id} r={r} index={i} />)}</div>
              <div className="mt-6 flex flex-wrap gap-2"><Button variant="secondary" to={`/shop/category/${result.category}`}>{t('find.more_in_cat')}</Button><Button variant="secondary" to="/ai-buyer">{t('find.ask_ai_bulk')}</Button></div>
            </div>
          )}
      </section>
      <style>{'@keyframes scan{from{top:-30%}to{top:100%}}'}</style>
      <CompareBar />
    </div>
  );
}
