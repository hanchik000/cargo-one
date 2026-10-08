import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate } from '@/lib/router';
import { useDbRevision, useDebounced, useQuery } from '@/lib/hooks';
import { useVoiceInput } from '@/lib/voice';
import { asset } from '@/lib/assets';
import { productService } from '@/services/productService';
import { groupBuyService, tierFor } from '@/services/groupBuyService';
import { vehicleService, isVerified } from '@/services/vehicleService';
import { cargoService } from '@/services/cargoService';
import { contentService } from '@/services/accountServices';
import { vipService } from '@/services/vipService';
import { PromoCarousel, TrustedBy } from '@/components/promo';
import { searchService } from '@/services/searchService';
import { useAuth } from '@/state/auth';
import { useRecentlyViewed } from '@/state/cart';
import { db } from '@/services/db';
import { Badge, Button, cn, Img, Notice, Progress, SectionTitle, Skeleton, StatusBadge } from '@/components/ui';
import { CarCard, CargoLine, ProductCard, ShipmentLine } from '@/components/commerce';
import { ProductVisual } from '@/components/visuals';
import { useCity, usePageTitle } from '@/components/shell';
import {
  IconAI, IconArrow, IconAuto, IconFactory, IconUsers, IconBack, IconCargo, IconChevron, IconImage, IconLink, IconMic, IconScan, IconSearch, IconSparkles, IconTimer, IconTrack, IconWallet,
} from '@/components/icons';
import { namedIcon } from '@/components/icons';
import type { HomeSection, Product } from '@/lib/types';
import type { RailBasis } from '@/services/productService';
import type { IconType } from 'react-icons';

const isUrl = (s: string) => /^https?:\/\/\S+/i.test(s.trim()) || /^(www\.|[a-z0-9-]+\.(com|cn|net)\/)/i.test(s.trim());

/** "What are you looking for?" — the primary entry point: search, photo, link or AI. */
function SearchModule() {
  const { t, tk, lang } = useI18n();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const voice = useVoiceInput(lang, (text) => setQ(text));
  const dq = useDebounced(q, 120);
  const hits = useMemo(() => (dq.trim().length >= 2 ? searchService.unified(dq).slice(0, 6) : []), [dq]);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setFocus(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);
  const submit = () => {
    const s = q.trim();
    if (!s) return;
    if (isUrl(s)) navigate(`/find?mode=url&url=${encodeURIComponent(s.startsWith('http') ? s : `https://${s}`)}`);
    else navigate(`/shop?q=${encodeURIComponent(s)}`);
  };
  // Suggestions come from editorially featured products — they are not a popularity ranking.
  const suggestions = useMemo(() => [...new Set(db().products.filter((p) => p.featured && p.published).map((p) => p.keywords[0] || p.title))].slice(0, 6), []);
  const chips: { label: string; icon: IconType; to: string }[] = [
    { label: t('home.chip.photo'), icon: IconImage, to: '/find?mode=image' },
    { label: t('home.chip.link'), icon: IconLink, to: '/find?mode=url' },
    { label: t('home.chip.ai'), icon: IconSparkles, to: '/ai-buyer' },
  ];
  const open = focus && (hits.length > 0 || q.trim().length < 2);
  return (
    <section className="relative pt-2 md:pt-6">
      <div className="eyebrow mb-3 flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" aria-hidden />{t('brand.tagline')}</div>
      <h1 className="display max-w-4xl text-[30px] uppercase md:text-[54px]">{t('home.hero')}</h1>
      <div ref={box} className="relative mt-6 max-w-3xl md:mt-8">
        <form onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); submit(); }} role="search"
          className={cn('relative z-20 flex items-center gap-1 rounded-full bg-paper p-1.5 pl-5 transition-all duration-500 [transition-timing-function:var(--ease-out-soft)]', focus ? 'shadow-[0_0_0_2px_var(--color-ink),var(--shadow-lift)] md:scale-[1.01]' : 'shadow-[var(--shadow-lift)]')}>
          <IconSearch className="size-5 shrink-0 text-muted" aria-hidden />
          <input value={q} onFocus={() => setFocus(true)} onChange={(e: { target: HTMLInputElement }) => setQ(e.target.value)} placeholder={t('home.search_placeholder')} aria-label={t('home.search_placeholder')}
            className="h-12 min-w-0 flex-1 bg-transparent px-2 text-[16px] outline-none placeholder:text-faint md:h-14 md:text-[17px]" />
          <button type="button" onClick={voice.listening ? voice.stop : voice.start} className={cn('press grid size-11 shrink-0 place-items-center rounded-full', voice.listening ? 'bg-bad text-white' : 'hover:bg-mist')} aria-label={t('find.voice')} aria-pressed={voice.listening} title={t('find.voice')}><IconMic className="size-5" aria-hidden /></button>
          <Button type="submit" size="md" className="h-12! md:h-14! md:px-7" iconRight={IconArrow}><span className="hidden sm:inline">{t('common.search')}</span></Button>
        </form>
        {open ? (
          <div className="animate-pop absolute inset-x-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-[24px] bg-paper p-2 shadow-[var(--shadow-float)]">
            {hits.length ? (
              <ul role="listbox" aria-label={t('search.results')}>
                {hits.map((h) => (
                  <li key={h.kind + h.id}><Link to={h.href} className="flex items-center justify-between gap-3 rounded-[16px] px-4 py-3 hover:bg-mist">
                    <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{h.title}</span><span className="block truncate text-[12px] text-muted">{tk(`search.kind.${h.kind}`)}</span></span><IconArrow className="size-4 shrink-0 text-faint" aria-hidden />
                  </Link></li>
                ))}
                <li className="mt-1 flex gap-2 border-t border-line px-2 pt-2"><Button size="sm" variant="soft" icon={IconSearch} to={`/shop?q=${encodeURIComponent(q)}`}>{t('search.in_shop')}</Button><Button size="sm" variant="soft" icon={IconAI} to={`/ai-buyer?q=${encodeURIComponent(q)}`}>{t('search.ask_ai')}</Button></li>
              </ul>
            ) : (
              <div className="p-3">
                <div className="eyebrow mb-2.5">{t('home.suggested')}</div>
                <div className="flex flex-wrap gap-2">{suggestions.map((k) => <Link key={k} to={`/shop?q=${encodeURIComponent(k)}`} className="press rounded-full bg-mist px-3.5 py-2 text-[13px] font-medium hover:bg-mist-2">{k}</Link>)}</div>
              </div>
            )}
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <Link key={c.to} to={c.to} className="press inline-flex h-10 items-center gap-2 rounded-full bg-paper pl-1.5 pr-4 text-[13px] font-semibold shadow-[var(--shadow-soft)] hover:bg-white">
              <span className="grid size-7 place-items-center rounded-full bg-ink text-on-ink"><c.icon className="size-3.5" aria-hidden /></span>{c.label}
            </Link>
          ))}
          <span className="hidden text-[12.5px] text-muted md:inline">{t('home.search_hint')}</span>
        </div>
        {voice.unsupported ? <div className="mt-3 max-w-xl"><Notice tone="neutral">{t('find.voice_unsupported')}</Notice></div> : null}
      </div>
    </section>
  );
}

/** Compact action rail: the five things CARGO ONE does. */
function ActionRail() {
  const { t } = useI18n();
  const items: { label: string; sub: string; icon: IconType; to: string; dark?: boolean }[] = [
    { label: t('nav.find'), sub: t('home.act.find'), icon: IconScan, to: '/find' },
    { label: t('nav.ai_buyer'), sub: t('home.act.ai'), icon: IconAI, to: '/ai-buyer' },
    { label: t('nav.group_buy'), sub: t('home.act.group'), icon: IconUsers, to: '/group-buy' },
    { label: t('nav.business'), sub: t('home.act.business'), icon: IconFactory, to: '/business' },
    { label: t('nav.auto'), sub: t('home.act.auto'), icon: IconAuto, to: '/auto', dark: true },
  ];
  return (
    <nav aria-label={t('home.actions')} className="rail stagger -mx-4 mt-8 gap-3 px-4 pb-1 md:mx-0 md:grid md:grid-flow-row md:grid-cols-5 md:px-0">
      {items.map((a) => (
        <Link key={a.to} to={a.to} className={cn('press group flex w-[132px] flex-col gap-6 rounded-[24px] p-4 transition-all duration-300 md:w-auto md:p-5', a.dark ? 'bg-[#111] text-white hover:bg-[#1c1c1d]' : 'bg-paper shadow-[var(--shadow-soft)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]')}>
          <span className={cn('grid size-11 place-items-center rounded-full transition-transform duration-500 group-hover:scale-110', a.dark ? 'accent-grad text-white' : 'bg-mist text-ink group-hover:bg-ink group-hover:text-on-ink')}><a.icon className="size-5" aria-hidden /></span>
          <span>
            <span className="block text-[14px] font-semibold uppercase tracking-[0.04em]">{a.label}</span>
            <span className={cn('mt-0.5 block text-[12px] leading-snug', a.dark ? 'text-white/55' : 'text-muted')}>{a.sub}</span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** Functional hero: what the platform does, one CTA, a real visual and the Cargo Line. */
function PlatformHero() {
  const { t } = useI18n();
  const lines = [t('home.hero.l1'), t('home.hero.l2'), t('home.hero.l3'), t('home.hero.l4')];
  return (
    <section className="relative mt-10 overflow-hidden rounded-[32px] bg-[#111] text-white md:mt-14">
      <div className="dot-grid-dark absolute inset-0" aria-hidden />
      <div className="relative grid md:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col justify-between gap-10 p-6 pb-0 md:p-12 md:pb-12">
          <div>
            <div className="eyebrow flex items-center gap-2 text-white/50"><span className="size-1.5 rounded-full bg-accent-2" aria-hidden />CARGO ONE</div>
            <h2 className="display mt-5 text-[34px] uppercase md:text-[52px]">{t('home.hero.title_1')}<br /><span className="text-accent-grad">{t('home.hero.title_2')}</span></h2>
            <ul className="stagger mt-6 space-y-1.5 text-[16px] text-white/70 md:text-[18px]">{lines.map((l, i) => <li key={l} className="flex items-center gap-3"><span className="mono text-[11px] text-white/35">0{i + 1}</span>{l}</li>)}</ul>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Button variant="accent" size="lg" to="/shop" iconRight={IconArrow}>{t('home.hero.cta')}</Button>
              <Button variant="inverse" size="lg" to="/ai-buyer" icon={IconAI} className="bg-white/10! text-white! ring-1 ring-white/15 hover:bg-white/20!">{t('nav.ai_buyer')}</Button>
            </div>
          </div>
          <div className="hidden md:block"><CargoLine dark nodes={[{ label: 'Yiwu', sub: t('line.china') }, { label: 'Khorgos', sub: t('home.hero.border') }, { label: 'Almaty–Tashkent', sub: t('home.hero.rail') }, { label: 'Ashgabat', sub: t('line.turkmenistan') }]} progress={2.35} /></div>
        </div>
        <div className="relative min-h-[300px] md:min-h-[520px]">
          <Img src={asset('img/hero/cargo-hero.webp')} alt={t('home.hero.img_alt')} eager className="absolute inset-0 bg-transparent [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_88%,transparent)] md:[mask-image:linear-gradient(to_right,transparent,black_18%)]" imgClassName="animate-float object-cover" />
        </div>
        <div className="px-6 pb-7 md:hidden"><CargoLine dark compact nodes={[{ label: 'CN' }, { label: '' }, { label: '' }, { label: 'TM' }]} progress={2.35} /></div>
      </div>
    </section>
  );
}

function Rail({ title, sub, to, children, loading, eyebrow, dark }: { title: string; sub?: string; to?: string; children: ReactNode; loading?: boolean; eyebrow?: string; dark?: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });
  return (
    <section className="reveal mt-14">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <div className={cn('eyebrow mb-1.5', dark && 'text-white/45')}>{eyebrow}</div> : null}
          <h2 className="text-[20px] font-semibold uppercase tracking-[0.02em] md:text-[22px]">{title}</h2>
          {sub ? <p className={cn('mt-0.5 text-[13px]', dark ? 'text-white/50' : 'text-muted')}>{sub}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {to ? <Link to={to} className={cn('press mr-1 inline-flex h-10 items-center gap-1 rounded-full px-4 text-[13px] font-semibold', dark ? 'bg-white/10 hover:bg-white/15' : 'bg-paper shadow-[var(--shadow-soft)] hover:bg-white')}>{t('common.see_all')}<IconArrow className="size-3.5" aria-hidden /></Link> : null}
          <button type="button" onClick={() => scroll(-1)} aria-label={t('common.previous')} className={cn('press hidden size-10 place-items-center rounded-full md:grid', dark ? 'bg-white/10 hover:bg-white/15' : 'bg-paper shadow-[var(--shadow-soft)]')}><IconBack className="size-4" aria-hidden /></button>
          <button type="button" onClick={() => scroll(1)} aria-label={t('common.next')} className={cn('press hidden size-10 place-items-center rounded-full md:grid', dark ? 'bg-white/10 hover:bg-white/15' : 'bg-paper shadow-[var(--shadow-soft)]')}><IconChevron className="size-4" aria-hidden /></button>
        </div>
      </div>
      {loading ? <div className="rail gap-4">{Array.from({ length: 5 }, (_, i) => <div key={i} className="w-[176px] space-y-2 md:w-[220px]"><Skeleton className="aspect-[4/5] rounded-[22px]" /><Skeleton className="h-4 w-3/4" /></div>)}</div>
        : <div ref={ref} className="rail -mx-4 gap-4 px-4 pb-3 md:mx-0 md:px-0">{children}</div>}
    </section>
  );
}

function ActiveShipment() {
  const { t, tk, date } = useI18n();
  const q = useQuery(() => cargoService.dashboard(), []);
  const active = q.data?.shipments.filter((s) => s.stage !== 'delivered') || [];
  if (!active.length) return null;
  const s = active[0];
  return (
    <Link to={`/cargo/${s.id}`} className="card lift group mt-8 block overflow-hidden p-5 md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="grid size-12 place-items-center rounded-full bg-ink text-on-ink"><IconCargo className="size-5" aria-hidden /></span>
          <div>
            <div className="eyebrow">{t('home.your_shipment')}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[16px] font-semibold"><span className="mono">{s.trackingNumber}</span><StatusBadge status="in_transit" label={tk(`stage.${s.stage}`)} /></div>
          </div>
        </div>
        <div className="text-right">
          <div className="eyebrow">{t('cargo.eta')}</div>
          <div className="text-[20px] font-semibold uppercase tracking-tight">{date(s.eta)}</div>
          {active.length > 1 ? <Badge className="mt-1">{t('home.more_shipments', { n: active.length - 1 })}</Badge> : null}
        </div>
      </div>
      <div className="mt-6"><ShipmentLine stage={s.stage} /></div>
    </Link>
  );
}

function GroupBuyRail() {
  const { t, money, rel } = useI18n();
  const q = useQuery(() => groupBuyService.list(), []);
  const open = (q.data || []).filter((x) => x.gb.status === 'open');
  return (
    <Rail title={t('home.sec.group_buy')} sub={t('home.sec.group_buy_sub')} to="/group-buy" loading={q.loading}>
      {open.map(({ gb, product }) => {
        const tier = tierFor(gb);
        return (
          <Link key={gb.id} to={`/group-buy/${gb.id}`} className="card lift group flex w-[300px] flex-col gap-4 p-4 md:w-[340px]">
            <div className="flex gap-3.5">
              <ProductVisual icon={product.icon} image={product.images[0]} className="size-24 shrink-0 rounded-[18px]" />
              <div className="min-w-0">
                <div className="line-clamp-2 text-[14px] font-semibold leading-snug">{gb.title}</div>
                <div className="mt-2 flex items-baseline gap-2"><span className="price text-[20px]">{money(tier.current.priceCNY, 'CNY')}</span><span className="num text-xs text-faint line-through">{money(gb.tiers[0].priceCNY, 'CNY')}</span></div>
                {tier.next ? <div className="mt-0.5 text-[12px] text-muted">{t('gb.next_level')} <span className="num font-semibold text-accent">{money(tier.next.priceCNY, 'CNY')}</span></div> : null}
              </div>
            </div>
            <div>
              <Progress value={gb.currentQty} max={gb.targetQty} label={t('gb.progress')} accent />
              <div className="mt-2 flex justify-between text-[12px] text-muted">
                <span className="num font-semibold text-ink">{gb.currentQty} / {gb.targetQty}</span>
                <span className="inline-flex items-center gap-1"><IconTimer className="size-3.5" aria-hidden />{rel(gb.endsAt)}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </Rail>
  );
}

function VerifiedAutoBand() {
  const { t } = useI18n();
  const q = useQuery(() => vehicleService.list({ verifiedOnly: true, sort: 'score' }), []);
  const cars = (q.data?.cars || []).filter((c) => isVerified(c, q.data!.inspections)).slice(0, 8);
  return (
    <section className="reveal relative -mx-4 mt-16 overflow-hidden bg-[#0e0e0f] px-4 pb-10 pt-2 text-white md:mx-0 md:rounded-[32px] md:px-8 md:pb-10">
      <Img src={asset('img/hero/auto-hero.webp')} alt="" className="absolute inset-x-0 top-0 h-[260px] bg-transparent opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent)] md:h-[360px]" />
      <div className="relative pt-36 md:pt-48">
        <Rail dark eyebrow="CARGO ONE AUTO" title={t('home.sec.verified_auto')} sub={t('home.sec.verified_auto_sub')} to="/auto?verified=1" loading={q.loading}>
          {cars.map((c) => <div key={c.id} className="w-[290px] md:w-[330px]"><CarCard dark car={c} inspection={q.data!.inspections.find((i) => i.id === c.inspectionId)} /></div>)}
        </Rail>
      </div>
    </section>
  );
}

function PlatformSteps() {
  const { t } = useI18n();
  const steps: { k: 'find' | 'buy' | 'pay' | 'cargo'; icon: IconType }[] = [{ k: 'find', icon: IconScan }, { k: 'buy', icon: IconSparkles }, { k: 'pay', icon: IconWallet }, { k: 'cargo', icon: IconCargo }];
  return (
    <section className="reveal mt-16 rounded-[32px] bg-paper p-6 shadow-[var(--shadow-soft)] md:p-12">
      <div className="grid gap-8 md:grid-cols-[1fr_1.4fr] md:gap-14">
        <div>
          <div className="eyebrow">{t('home.how.eyebrow')}</div>
          <h2 className="display mt-3 text-[26px] uppercase md:text-[36px]">{t('home.how.title')}</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted">{t('home.how.body')}</p>
          <div className="mt-7 flex flex-wrap gap-2"><Button to="/shop" iconRight={IconArrow}>{t('home.how.cta_shop')}</Button><Button to="/ai-buyer" variant="secondary" icon={IconAI}>{t('home.qa.ai_buyer')}</Button></div>
        </div>
        <ol className="relative grid gap-3 sm:grid-cols-2">
          {steps.map(({ k, icon: Icon }, i) => (
            <li key={k} className="relative rounded-[24px] bg-mist p-5">
              <div className="flex items-center justify-between"><span className="grid size-11 place-items-center rounded-full bg-paper shadow-[var(--shadow-soft)]"><Icon className="size-5" aria-hidden /></span><span className="mono text-[12px] text-faint">0{i + 1}</span></div>
              <div className="mt-6 text-[15px] font-semibold uppercase tracking-[0.03em]">{t(`home.how.${k}`)}</div>
              <div className="mt-1 text-[13px] leading-relaxed text-muted">{t(`home.how.${k}_sub`)}</div>
            </li>
          ))}
          <li className="text-[12px] text-muted sm:col-span-2">{t('home.how.transparent')}</li>
        </ol>
      </div>
    </section>
  );
}

/** Orders, supplier payments and cargo: supporting services, kept compact below the marketplace. */
function SupportingServices({ signedIn }: { signedIn: boolean }) {
  const { t } = useI18n();
  const items: { label: string; sub: string; icon: IconType; to: string }[] = [
    { label: t('nav.orders'), sub: t('home.act.track'), icon: IconTrack, to: signedIn ? '/orders' : '/track' },
    { label: t('nav.pay'), sub: t('home.act.pay'), icon: IconWallet, to: '/pay' },
    { label: t('nav.cargo'), sub: t('home.act.track_label'), icon: IconCargo, to: signedIn ? '/cargo' : '/track' },
  ];
  return (
    <section className="reveal mt-14" aria-labelledby="home-supporting">
      <div className="mb-4">
        <h2 id="home-supporting" className="text-[20px] font-semibold uppercase tracking-[0.02em] md:text-[22px]">{t('home.supporting')}</h2>
        <p className="mt-0.5 text-[13px] text-muted">{t('home.supporting_sub')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {items.map((a) => (
          <Link key={a.label} to={a.to} className="press flex items-center gap-3 rounded-[20px] bg-paper p-4 shadow-[var(--shadow-soft)] hover:bg-white">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-mist"><a.icon className="size-[18px]" aria-hidden /></span>
            <span className="min-w-0"><span className="block text-[14px] font-semibold">{a.label}</span><span className="block truncate text-[12px] text-muted">{a.sub}</span></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Categories() {
  const { t, tk } = useI18n();
  useDbRevision();
  const cats = db().categories.filter((c) => c.visible).sort((a, b) => a.order - b.order);
  return (
    <section className="reveal mt-14">
      <SectionTitle title={t('home.categories')} />
      <nav aria-label={t('home.categories')} className="rail -mx-4 gap-2 px-4 md:mx-0 md:flex md:flex-wrap md:px-0">
        {cats.map((c) => {
          const Icon = namedIcon(c.icon);
          return (
            <Link key={c.id} to={`/shop/category/${c.id}`} className="press inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-paper pl-2 pr-4 text-[13px] font-semibold shadow-[var(--shadow-soft)] transition-colors hover:bg-ink hover:text-on-ink">
              <span className="grid size-7 place-items-center rounded-full bg-mist text-ink"><Icon className="size-4" strokeWidth={1.6} aria-hidden /></span>{tk(`cat.${c.id}`)}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}

export function HomePage() {
  const { t, tk, lang } = useI18n();
  usePageTitle('', t('meta.home'));
  const { user } = useAuth();
  const [city] = useCity();
  const recent = useRecentlyViewed();
  const rails = useQuery(() => productService.rails(recent.ids), [recent.ids.join(','), lang], { live: false });
  useDbRevision();
  const content = contentService.get();
  // VIP includes "no ads": promo banners are hidden for active members.
  const banners = user && vipService.isActive(user.id) ? [] : [...(content.promoBanners || [])].filter((b) => b.enabled).sort((a, b) => a.order - b.order);
  const partners = [...(content.partners || [])].filter((p) => p.visible).sort((a, b) => a.order - b.order);
  const sections = [...content.homeSections].filter((s) => s.visible).sort((a, b) => a.order - b.order);
  const r = rails.data;
  const card = (p: Product, reason?: string) => <ProductCard key={p.id} product={p} compact reason={reason} />;
  const basis = (b?: RailBasis) => (b ? tk(`basis.${b}`) : undefined);

  const render = (s: HomeSection) => {
    switch (s.key) {
      case 'trending':
        // Shown only when there is real view data: no invented trends.
        return r && r.trending.basis !== 'insufficient_data' && r.trending.items.length ? <Rail key={s.key} title={t('home.sec.trending')} sub={basis(r.trending.basis)} to="/shop" loading={rails.loading}>{r.trending.items.map((p) => card(p))}</Rail> : null;
      case 'popular':
        return <Rail key={s.key} title={t('home.sec.popular_plain')} sub={basis(r?.popular.basis)} to="/shop?sort=score" loading={rails.loading}>{r?.popular.items.map((p) => card(p))}</Rail>;
      case 'new_arrivals':
        return <Rail key={s.key} title={t('home.sec.new_arrivals')} sub={t('home.sec.new_arrivals_sub')} to="/shop?sort=newest" loading={rails.loading}>{r?.newArrivals.items.map((p) => card(p))}</Rail>;
      case 'best_value':
        return <Rail key={s.key} title={t('home.sec.best_value')} sub={basis(r?.bestValue.basis)} to="/shop?sort=price_asc" loading={rails.loading}>{r?.bestValue.items.map((p) => card(p))}</Rail>;
      case 'fast_delivery':
        return <Rail key={s.key} title={t('home.sec.fast_delivery')} sub={basis(r?.fastDelivery.basis)} to="/shop?sort=delivery" loading={rails.loading}>{r?.fastDelivery.items.map((p) => card(p))}</Rail>;
      case 'verified_suppliers':
        return <Rail key={s.key} title={t('home.sec.verified_suppliers')} sub={basis(r?.verifiedSuppliers.basis)} to="/suppliers" loading={rails.loading}>{r?.verifiedSuppliers.items.map((p) => card(p))}</Rail>;
      case 'recommended':
        return <Rail key={s.key} title={t('home.sec.recommended')} sub={r?.recommended.basedOn ? t('home.sec.because_viewed', { title: r.recommended.basedOn }) : basis('editorial')} loading={rails.loading}>{r?.recommended.items.map((p) => card(p, r.recommended.basedOn ? t('reco.similar') : undefined))}</Rail>;
      case 'price_drops':
        return <Rail key={s.key} title={t('home.sec.price_drops')} sub={basis(r?.priceDrops.basis)} to="/shop?drops=1" loading={rails.loading}>{r?.priceDrops.items.map((p) => card(p))}</Rail>;
      case 'group_buy': return <GroupBuyRail key={s.key} />;
      case 'verified_auto': return <VerifiedAutoBand key={s.key} />;
      case 'business_picks':
        return <Rail key={s.key} title={t('home.sec.business')} sub={t('home.sec.business_sub')} to="/shop/category/business" loading={rails.loading}>{r?.business.items.map((p) => card(p))}</Rail>;
    }
  };

  return (
    <div>
      <SearchModule />
      <Categories />
      <ActionRail />
      {banners.length ? <PromoCarousel banners={banners} /> : null}
      {sections.map(render)}
      <SupportingServices signedIn={!!user} />
      {user ? <ActiveShipment /> : null}
      <PlatformHero />
      <PlatformSteps />
      <TrustedBy partners={partners} />
    </div>
  );
}
