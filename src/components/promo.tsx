// Home screen promo banners (carousel) and the "Trusted by" partner strip.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { useI18n } from '@/i18n';
import type { StringKey } from '@/i18n';
import type { Partner, PromoBanner } from '@/lib/types';
import { asset } from '@/lib/assets';

import { Button, cn } from '@/components/ui';
import { IconArrow, IconBack, IconChevron } from '@/components/icons';

/** Asset path ("img/…") or uploaded data URL → usable src. */
export const imageSrc = (s: string) => (/^(data:|blob:|https?:)/.test(s) ? s : asset(s));

const TONES: Record<PromoBanner['tone'], { box: string; sub: string; chip: string; btn: 'inverse' | 'primary'; dot: string }> = {
  ink: { box: 'bg-[#111] text-white', sub: 'text-white/65', chip: 'bg-white/10 text-white/80', btn: 'inverse', dot: 'bg-white' },
  accent: { box: 'accent-grad text-white', sub: 'text-white/80', chip: 'bg-black/15 text-white', btn: 'inverse', dot: 'bg-white' },
  sand: { box: 'bg-[#E8E0D2] text-[#111]', sub: 'text-[#111]/65', chip: 'bg-[#111]/8 text-[#111]/70', btn: 'primary', dot: 'bg-[#111]' },
  paper: { box: 'bg-white text-[#111] shadow-[0_0_0_1px_rgba(17,17,17,.06)]', sub: 'text-[#111]/60', chip: 'bg-[#111]/6 text-[#111]/70', btn: 'primary', dot: 'bg-[#111]' },
};

export function useBannerText(b: PromoBanner) {
  const { lang } = useI18n();
  const tr = lang === 'en' ? undefined : b.i18n?.[lang];
  return { eyebrow: tr?.eyebrow || b.eyebrow, title: tr?.title || b.title, subtitle: tr?.subtitle || b.subtitle, cta: tr?.cta || b.cta };
}

function BannerArt({ images, active }: { images: string[]; active: boolean }) {
  if (!images.length) return null;
  if (images.length === 1) {
    return (
      <div className="absolute inset-y-0 right-0 w-full md:w-[58%]" aria-hidden>
        <img src={imageSrc(images[0])} alt="" loading="lazy" className={cn('size-full object-cover transition-transform duration-[6000ms] ease-out', active ? 'scale-[1.06]' : 'scale-100')}
          style={{ maskImage: 'linear-gradient(90deg, transparent 0%, #000 38%)', WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 38%)' }} />
      </div>
    );
  }
  const pos = ['right-[30%] top-[14%] rotate-[-7deg]', 'right-[6%] top-[8%] rotate-[5deg] z-10', 'right-[17%] bottom-[-6%] rotate-[-2deg] z-20'];
  return (
    <div className="absolute inset-y-0 right-0 hidden w-[52%] md:block" aria-hidden>
      {images.slice(0, 3).map((src, i) => (
        <div key={src + i} className={cn('absolute size-[150px] overflow-hidden rounded-[26px] bg-white shadow-[0_24px_50px_-18px_rgba(0,0,0,.55)] transition-all duration-700 ease-[var(--ease-emph)] lg:size-[176px]', pos[i],
          active ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0')} style={{ transitionDelay: active ? `${120 + i * 110}ms` : '0ms' }}>
          <img src={imageSrc(src)} alt="" loading="lazy" className="size-full object-cover" />
        </div>
      ))}
    </div>
  );
}

function MobileArt({ images }: { images: string[] }) {
  if (images.length < 2) return null;
  return (
    <div className="mt-5 flex gap-2.5 md:hidden" aria-hidden>
      {images.slice(0, 3).map((src, i) => <div key={src + i} className="aspect-square min-w-0 flex-1 overflow-hidden rounded-[18px] bg-white"><img src={imageSrc(src)} alt="" loading="lazy" className="size-full object-cover" /></div>)}
    </div>
  );
}

function Slide({ banner, index, total, active, preview }: { banner: PromoBanner; index: number; total: number; active: boolean; preview?: boolean }) {
  const { t } = useI18n();
  const tx = useBannerText(banner);
  const tone = TONES[banner.tone] || TONES.ink;
  const single = banner.images.length === 1;
  return (
    <div role="group" aria-roledescription={t('promo.slide')} aria-label={`${index + 1} / ${total}`} inert={!active || undefined}
      className={cn('relative w-full shrink-0 snap-start overflow-hidden rounded-[30px]', tone.box, preview ? 'min-h-[230px]' : 'min-h-[340px] md:min-h-[300px]')}>
      {single ? <div className="absolute inset-0 md:hidden" aria-hidden><img src={imageSrc(banner.images[0])} alt="" loading="lazy" className="size-full object-cover opacity-40" /><div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/65 to-black/15" /></div> : null}
      <BannerArt images={banner.images} active={active} />
      <div className={cn('relative z-10 flex h-full flex-col justify-end p-6 md:w-[52%] md:justify-center md:p-10', single && 'max-md:text-white', preview && 'md:p-7')}>
        <div className={cn('flex flex-wrap items-center gap-2 transition-all duration-500', active ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}>
          <span className={cn('rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]', single ? 'max-md:bg-white/15 max-md:text-white' : '', tone.chip)}>{t('promo.label')}</span>
          <span className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', single ? 'max-md:text-white/75' : '', tone.sub)}>{tx.eyebrow}</span>
        </div>
        <h3 className={cn('display mt-4 text-balance text-[26px] leading-[1.02] transition-all delay-75 duration-500 md:text-[34px] lg:text-[40px]', active ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0', preview && 'md:text-[28px]')}>{tx.title}</h3>
        {tx.subtitle ? <p className={cn('mt-3 max-w-[44ch] text-[14.5px] leading-relaxed transition-all delay-150 duration-500', single ? 'max-md:text-white/75' : '', tone.sub, active ? 'opacity-100' : 'opacity-0')}>{tx.subtitle}</p> : null}
        <div className={cn('mt-6 transition-all delay-200 duration-500', active ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0')}>
          {preview ? <span className={cn('inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold', tone.btn === 'inverse' ? 'bg-white text-[#111]' : 'bg-[#111] text-white')}>{tx.cta}<IconArrow className="size-4" aria-hidden /></span>
            : <Button to={banner.link} variant={single ? 'inverse' : tone.btn} size="lg" iconRight={IconArrow}>{tx.cta}</Button>}
        </div>
        {!single ? <MobileArt images={banner.images} /> : null}
      </div>
    </div>
  );
}

/** Static single-slide preview, used by the admin editor. */
export function PromoBannerPreview({ banner }: { banner: PromoBanner }) {
  return <div className="pointer-events-none"><Slide banner={banner} index={0} total={1} active preview /></div>;
}

const INTERVAL = 6500;

export function PromoCarousel({ banners }: { banners: PromoBanner[] }) {
  const { t } = useI18n();
  const track = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const n = banners.length;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches); on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const go = useCallback((i: number) => {
    const el = track.current; if (!el || !n) return;
    const next = (i + n) % n;
    el.scrollTo({ left: next * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
    setIndex(next);
  }, [n, reduced]);

  // Keep the index in sync with swipes / scroll-snap.
  useEffect(() => {
    const el = track.current; if (!el) return;
    let raf = 0;
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); setIndex((p) => (p === i ? p : Math.min(n - 1, Math.max(0, i)))); }); };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [n]);

  // Autoplay: paused on hover/focus, hidden tab, or reduced motion.
  useEffect(() => {
    if (paused || reduced || n < 2) return;
    const id = window.setTimeout(() => { if (!document.hidden) go(index + 1); }, INTERVAL);
    return () => window.clearTimeout(id);
  }, [index, paused, reduced, n, go]);

  if (!n) return null;
  return (
    <section className="reveal relative mt-8" aria-roledescription={t('promo.carousel')} aria-label={t('promo.title')}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onKeyDown={(e: KeyboardEvent<HTMLElement>) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1); } }}>
      <div ref={track} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-[30px]" style={{ scrollbarWidth: 'none' } as CSSProperties}>
        {banners.map((b, i) => <Slide key={b.id} banner={b} index={i} total={n} active={i === index} />)}
      </div>
      {n > 1 ? (
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5" role="tablist" aria-label={t('promo.title')}>
            {banners.map((b, i) => (
              <button key={b.id} type="button" role="tab" aria-selected={i === index} aria-label={`${i + 1} / ${n}`} onClick={() => go(i)}
                className={cn('relative h-1.5 overflow-hidden rounded-full bg-mist-3 transition-all duration-500', i === index ? 'w-12' : 'w-5 hover:bg-faint')}>
                {i === index ? <span key={`${index}-${paused}`} className={cn('absolute inset-y-0 left-0 rounded-full bg-ink', reduced || paused ? 'w-full' : 'promo-progress')} style={{ ['--dur' as string]: `${INTERVAL}ms` }} /> : null}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="num text-[12px] text-muted">{String(index + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}</span>
            <button type="button" onClick={() => go(index - 1)} aria-label={t('common.previous')} className="press hidden size-9 place-items-center rounded-full bg-paper shadow-[var(--shadow-soft)] transition hover:bg-mist-2 md:grid"><IconBack className="size-4" aria-hidden /></button>
            <button type="button" onClick={() => go(index + 1)} aria-label={t('common.next')} className="press hidden size-9 place-items-center rounded-full bg-paper shadow-[var(--shadow-soft)] transition hover:bg-mist-2 md:grid"><IconChevron className="size-4" aria-hidden /></button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ---------------- Partner logos ----------------
// Original geometric marks for the placeholder partners. Uploaded logos replace them.
const MARKS: Record<string, { color: string; font: string; upper?: boolean; svg: ReactNode }> = {
  rails: { color: '#2F6FDB', font: 'font-display tracking-[0.06em]', upper: true, svg: <><path d="M6 27 C10 17 14 11 16 5" /><path d="M16 27 C19 17 21 11 22 5" /><path d="M8 21h11M10 15.5h10M12.5 10h8.5" strokeWidth="2" /></> },
  seal: { color: '#C0392B', font: 'font-semibold tracking-tight', svg: <><rect x="5" y="5" width="22" height="22" rx="5" /><path d="M11 11h10M11 16h10M11 21h10M16 11v10" /></> },
  dunes: { color: '#C2612A', font: 'font-display tracking-[0.02em]', upper: true, svg: <><path d="M3 22c5-8 9-8 13 0" /><path d="M12 22c5-11 11-11 17 0" /><path d="M3 26h26" /></> },
  hex: { color: '#1F8A70', font: 'font-semibold tracking-[-0.01em]', svg: <><path d="M16 4 26.4 10v12L16 28 5.6 22V10z" /><circle cx="16" cy="16" r="4.5" /></> },
  gul: { color: '#8E2C48', font: 'font-display tracking-[0.04em]', upper: true, svg: <><rect x="8" y="8" width="16" height="16" rx="1.5" /><rect x="8" y="8" width="16" height="16" rx="1.5" transform="rotate(45 16 16)" /><circle cx="16" cy="16" r="2.5" fill="currentColor" stroke="none" /></> },
  bridge: { color: '#5B4BDB', font: 'font-bold tracking-tight', svg: <><path d="M3 22h26" /><path d="M5 22c3-10 19-10 22 0" /><path d="M11 22v-6M16 22v-8M21 22v-6" /></> },
  gate: { color: '#111111', font: 'font-display tracking-[0.08em]', upper: true, svg: <><path d="M7 27V11l9-6 9 6v16" /><path d="M12 27v-9h8v9" /></> },
  box: { color: '#A0742A', font: 'font-semibold tracking-tight', svg: <><path d="M16 4 27 9.5v13L16 28 5 22.5v-13z" /><path d="M5 9.5 16 15l11-5.5M16 15v13" /></> },
  river: { color: '#0E7C9B', font: 'font-medium tracking-tight', svg: <><path d="M4 10c4-3 8 3 12 0s8 3 12 0" /><path d="M4 16c4-3 8 3 12 0s8 3 12 0" /><path d="M4 22c4-3 8 3 12 0s8 3 12 0" /></> },
  shield: { color: '#2D5BA8', font: 'font-semibold tracking-[-0.01em]', svg: <><path d="M16 4 26 8v7c0 6.5-4.3 11-10 13-5.7-2-10-6.5-10-13V8z" /><path d="M10 17c2-2 4 2 6 0s4 2 6 0" /></> },
};

export function PartnerLogo({ partner, className }: { partner: Partner; className?: string }) {
  if (partner.logo) return <img src={imageSrc(partner.logo)} alt={partner.name} className={cn('h-9 w-auto max-w-[160px] object-contain', className)} loading="lazy" />;
  const m = MARKS[partner.mark || ''] || MARKS.hex;
  return (
    <span className={cn('inline-flex items-center gap-2.5 whitespace-nowrap', className)} style={{ ['--brand' as string]: m.color }} role="img" aria-label={partner.name}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0 transition-colors duration-300 group-hover:text-[var(--brand)]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{m.svg}</svg>
      <span className={cn('text-[17px] leading-none', m.font, m.upper && 'text-[14px] uppercase')} aria-hidden>{partner.name}</span>
    </span>
  );
}

const KIND_KEYS: Record<Partner['kind'], StringKey> = {
  logistics: 'trust.kind.logistics', payments: 'trust.kind.payments', manufacturing: 'trust.kind.manufacturing', customs: 'trust.kind.customs',
  auto: 'trust.kind.auto', insurance: 'trust.kind.insurance', marketplace: 'trust.kind.marketplace',
};
export const partnerKindKey = (k: Partner['kind']) => KIND_KEYS[k];

function LogoTile({ p }: { p: Partner }) {
  const inner = <PartnerLogo partner={p} />;
  const cls = 'group grid h-[88px] min-w-[220px] shrink-0 place-items-center rounded-[22px] bg-paper px-7 text-ink/55 shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-0.5 hover:text-ink hover:shadow-[var(--shadow-lift)] [&_img]:opacity-60 [&_img]:grayscale [&_img]:transition hover:[&_img]:opacity-100 hover:[&_img]:grayscale-0';
  if (p.url && /^https:\/\//.test(p.url)) return <a href={p.url} target="_blank" rel="noopener noreferrer" className={cls} title={p.name}>{inner}</a>;
  return <div className={cls} title={p.name}>{inner}</div>;
}

export function TrustedBy({ partners }: { partners: Partner[] }) {
  const { t, tk } = useI18n();
  if (!partners.length) return null;
  const half = Math.ceil(partners.length / 2);
  const rows = partners.length > 5 ? [partners.slice(0, half), partners.slice(half)] : [partners];
  const kinds = [...new Set(partners.map((p) => p.kind))];
  const demo = partners.some((p) => p.demo);
  return (
    <section className="reveal mt-16" aria-labelledby="trusted-title">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl">
          <div className="eyebrow mb-2 flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" aria-hidden />{t('trust.eyebrow')}</div>
          <h2 id="trusted-title" className="headline text-[28px] md:text-[36px]">{t('trust.title')}</h2>
          <p className="mt-2 text-[15px] text-muted">{t('trust.sub')}</p>
        </div>
        <ul className="flex flex-wrap gap-1.5">{kinds.map((k) => <li key={k} className="rounded-full bg-mist-2 px-3 py-1.5 text-[12px] font-medium text-graphite">{tk(KIND_KEYS[k])}</li>)}</ul>
      </div>
      <div className="marquee-mask -mx-4 space-y-3 overflow-hidden px-4 py-1 md:mx-0 md:px-0">
        {rows.map((row, r) => (
          <div key={r} className={cn('marquee flex w-max gap-3', r % 2 && 'marquee-rev')} style={{ ['--marquee-dur' as string]: `${Math.max(24, row.length * 7)}s` }}>
            {[...row, ...row].map((p, i) => <div key={`${p.id}-${i}`} aria-hidden={i >= row.length || undefined} className="contents">{i >= row.length ? <div inert className="contents"><LogoTile p={p} /></div> : <LogoTile p={p} />}</div>)}
          </div>
        ))}
      </div>
      {demo ? <p className="mt-4 text-[12px] text-faint">{t('trust.demo_note')}</p> : null}
    </section>
  );
}

