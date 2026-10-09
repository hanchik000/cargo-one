import { useMemo, useState } from 'react';
import { leadKnown, presentedPrice, pricingStatus } from '@/lib/catalog';
import type { ReactNode } from 'react';
import type { Car, CarInspection, CostBreakdown, InspectionItemKey, Product, QuoteOption, Shipment, ShipmentStage, Supplier } from '@/lib/types';
import { useI18n, useT } from '@/i18n';
import type { StringKey } from '@/i18n';
import { currentHref, Link, navigate } from '@/lib/router';
import { estimateProduct, deliveryWindow, carCost } from '@/lib/pricing';
import { db } from '@/services/db';
import { favoriteService } from '@/services/accountServices';
import { isVerified } from '@/services/vehicleService';
import { STAGES } from '@/data/seed';
import { useAuth } from '@/state/auth';
import { useDbRevision } from '@/lib/hooks';
import { Badge, Button, cn, KV, Notice, ScoreBadge, ScoreRing, StatusBadge, useToast, VerifiedBadge, VerifiedSeal } from './ui';
import { CarVisual, ProductVisual, SupplierLogo } from './visuals';
import { IconBattery, IconCheck, IconClock, IconCompare, IconDot, IconDrop, IconHeart, IconInfo, IconPin, IconWarn, IconX, IconFile, IconDown, IconArrow, IconShield, IconScanFace } from './icons';
import { vipService } from '@/services/vipService';

/** Favorites toggle that sends signed-out users to login. */
export function FavoriteButton({ kind, refId, label, className, onDark }: { kind: 'product' | 'supplier' | 'car' | 'search'; refId: string; label?: string; className?: string; onDark?: boolean }) {
  const t = useT();
  const toast = useToast();
  const { user } = useAuth();
  useDbRevision();
  const active = favoriteService.ids(kind).has(refId);
  const [burst, setBurst] = useState(0);
  return (
    <button type="button" aria-pressed={active} aria-label={active ? t('fav.remove') : t('fav.add')} title={active ? t('fav.remove') : t('fav.add')}
      onClick={async (e: { preventDefault(): void; stopPropagation(): void }) => {
        e.preventDefault(); e.stopPropagation();
        if (!user) { navigate(`/login?next=${encodeURIComponent(currentHref())}`); return; }
        const added = await favoriteService.toggle(kind, refId, label);
        if (added) setBurst((b) => b + 1);
        toast(added ? t('fav.added') : t('fav.removed'), 'ok', added ? { label: t('nav.favorites'), to: '/favorites' } : undefined);
      }}
      className={cn('press grid size-10 place-items-center rounded-full transition-colors', onDark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white/90 text-[#111] shadow-[0_4px_14px_-6px_rgba(17,17,17,.35)] backdrop-blur hover:bg-white', className)}>
      <IconHeart key={burst} className={cn('size-[18px]', active && 'animate-pop fill-current text-bad')} aria-hidden />
    </button>
  );
}

export function useUserVip() {
  const { user } = useAuth();
  useDbRevision();
  return !!user && vipService.isActive(user.id);
}

/** Visual product card: big image, title, China price vs estimated landed price, delivery, supplier score. */
export function ProductCard({ product, compact, reason, onCompare, comparing, variant = 'tile' }: { product: Product; compact?: boolean; reason?: string; onCompare?: () => void; comparing?: boolean; variant?: 'tile' | 'wide' }) {
  const { t, money } = useI18n();
  const settings = db().content.settings;
  const vip = useUserVip();
  const status = pricingStatus(product);
  const shown = presentedPrice(product);
  const est = status === 'estimate' ? estimateProduct(product, 1, settings, { vip }) : null;
  const sup = db().suppliers.find((s) => s.id === product.supplierId);
  const score = sup && sup.score != null ? sup.score : null;
  const [dmin, dmax] = deliveryWindow(product);
  const lead = leadKnown(product) ? <span className="inline-flex items-center gap-1"><IconClock className="size-3.5" aria-hidden />{t('delivery.days', { min: dmin, max: dmax })}</span> : null;
  const drop = product.oldPriceCNY && shown?.currency === 'CNY' ? Math.round((1 - product.priceCNY / product.oldPriceCNY) * 100) : 0;
  const priceText = shown ? money(shown.amount, shown.currency) : t('cat.price_unavailable');
  const tm = status === 'estimate' && est ? <>≈ {money(est.totalTMT, 'TMT', { decimals: 0 })}</> : status === 'incomplete' ? t('cat.not_calculated') : null;
  if (variant === 'wide') {
    return (
      <article className="card group lift relative grid grid-cols-[42%_1fr] overflow-hidden">
        <Link to={`/shop/${product.id}`} aria-label={product.title} className="block"><ProductVisual icon={product.icon} image={product.images[0]} title={product.title} rounded={false} className="aspect-[4/5] h-full w-full" /></Link>
        <div className="flex min-w-0 flex-col justify-between gap-4 p-5">
          <div>
            <div className="flex flex-wrap gap-1.5">{product.verified ? <VerifiedBadge size="sm" label={t('badge.verified_supplier_short')} /> : null}{drop > 0 ? <Badge tone="metal" icon={IconDrop}>−{drop}%</Badge> : null}{product.sample ? <Badge tone="warn">{t('cat.sample_data')}</Badge> : null}</div>
            <Link to={`/shop/${product.id}`} className="mt-3 line-clamp-2 block text-[17px] font-semibold leading-snug tracking-tight hover:underline">{product.title}</Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">{score != null ? <ScoreBadge score={score} /> : null}{lead}</div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className={cn('price leading-none', shown ? 'text-[24px]' : 'text-[16px] text-muted')}>{priceText}</div>
              {tm ? <div className="mt-1.5 text-[12px] text-muted">{t('price.tm_short')} <span className="num font-semibold text-ink">{tm}</span></div> : null}
            </div>
            <Button size="sm" to={`/shop/${product.id}`} iconRight={IconArrow}>{t('common.open')}</Button>
          </div>
        </div>
        <div className="absolute left-3 top-3"><FavoriteButton kind="product" refId={product.id} /></div>
      </article>
    );
  }
  return (
    <article className={cn('group relative flex flex-col', compact ? 'w-[176px] md:w-[220px]' : '')}>
      <Link to={`/shop/${product.id}`} className="lift block rounded-[22px]" aria-label={product.title}>
        <div className="relative">
          <ProductVisual icon={product.icon} image={product.images[0]} title={product.title} className="aspect-[4/5] w-full rounded-[22px]" />
          <div className="absolute bottom-2.5 left-2.5 flex flex-wrap gap-1">
            {drop > 0 ? <Badge tone="dark" icon={IconDrop}>−{drop}%</Badge> : null}
            {product.tryOn ? <Badge tone="glass" icon={IconScanFace}>{t('tryon.badge')}</Badge> : null}
            {product.sample ? <Badge tone="warn">{t('cat.sample_data')}</Badge> : null}
            {reason ? <Badge tone="glass">{reason}</Badge> : null}
          </div>
          {product.verified ? <span className="absolute left-2.5 top-2.5" title={t('badge.verified_supplier')}><VerifiedSeal className="size-7 drop-shadow-[0_3px_8px_rgba(0,0,0,.2)]" /><span className="sr-only">{t('badge.verified_supplier')}</span></span> : null}
        </div>
      </Link>
      <div className="absolute right-2.5 top-2.5 flex flex-col gap-1.5">
        <FavoriteButton kind="product" refId={product.id} />
        {onCompare ? (
          <button type="button" onClick={onCompare} aria-pressed={comparing} aria-label={t('compare.toggle')} title={t('compare.toggle')} className={cn('press grid size-10 place-items-center rounded-full transition-colors', comparing ? 'bg-ink text-on-ink' : 'bg-white/90 text-[#111] shadow-[0_4px_14px_-6px_rgba(17,17,17,.35)] hover:bg-white')}>
            <IconCompare className="size-[18px]" aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="mt-3 space-y-1.5 px-1">
        <Link to={`/shop/${product.id}`} className="line-clamp-2 min-h-[2.6em] text-[14px] font-medium leading-snug tracking-[-0.01em] hover:underline">{product.title}</Link>
        <div className="flex items-baseline gap-2">
          <span className={cn('price', shown ? 'text-[19px]' : 'text-[14px] text-muted')}>{priceText}</span>
          {drop > 0 ? <span className="num text-xs text-faint line-through">{money(product.oldPriceCNY!, 'CNY')}</span> : null}
        </div>
        {tm ? (
          <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[11.5px] shadow-[inset_0_0_0_1px_var(--color-line)]" title={status === 'estimate' ? t('cat.estimate_label') : t('cat.total_incomplete_body')}>
            <span className={cn('size-1.5 shrink-0 rounded-full', status === 'estimate' ? 'bg-accent' : 'bg-faint')} aria-hidden /><span className="truncate text-muted">{t('price.tm_short')}</span><span className="num font-semibold text-ink">{tm}</span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[12px] text-muted">
          {lead}
          {score != null ? <ScoreBadge score={score} label={t('score.short')} /> : null}
        </div>
      </div>
    </article>
  );
}

/** The CARGO ONE "total": China price on top, estimated landed total in Turkmenistan as the hero number. */
export function TotalBlock({ chinaPrice, totalTMT, note, dark, children, qtyLabel }: { chinaPrice?: ReactNode; totalTMT: number; note?: string; dark?: boolean; children?: ReactNode; qtyLabel?: ReactNode }) {
  const { t, money } = useI18n();
  return (
    <div className={cn('relative overflow-hidden rounded-[24px] p-5 md:p-6', dark ? 'bg-[#111] text-white' : 'bg-paper shadow-[var(--shadow-soft)]')}>
      {chinaPrice != null ? (
        <div className={cn('flex items-baseline justify-between gap-3 border-b pb-4', dark ? 'border-white/10' : 'border-line')}>
          <span className={cn('eyebrow', dark && 'text-white/50')}>{t('price.china_price')}</span>
          <span className="price text-[22px]">{chinaPrice}</span>
        </div>
      ) : null}
      <div className={chinaPrice != null ? 'pt-4' : ''}>
        <div className="flex items-center justify-between gap-2">
          <span className={cn('eyebrow flex items-center gap-2', dark ? 'text-white/50' : '')}><span className="size-1.5 rounded-full bg-accent" aria-hidden />{t('price.est_in_tm')}</span>
          <Badge tone={dark ? 'glass' : 'neutral'}>{t('price.estimated')}</Badge>
        </div>
        <div className="mt-2 flex items-baseline gap-2"><span className="price text-[36px] leading-none md:text-[40px]">{money(totalTMT, 'TMT', { decimals: 0 })}</span>{qtyLabel ? <span className={cn('text-[13px]', dark ? 'text-white/50' : 'text-muted')}>{qtyLabel}</span> : null}</div>
        <div className={cn('mt-1.5 text-[12.5px]', dark ? 'text-white/55' : 'text-muted')}>{note || t('price.incl_cargo')}</div>
      </div>
      {children}
    </div>
  );
}

/** Product price → final price breakdown. Never hides costs; uncertain parts are marked ESTIMATED. */
export function PriceBlock({ costs, title, note, dark }: { costs: CostBreakdown; title?: string; note?: string; dark?: boolean }) {
  const { t, money } = useI18n();
  const parts: [string, number][] = [[t('price.goods'), costs.goodsTMT], [t('price.service_fee'), costs.serviceTMT], [t('price.cargo'), costs.cargoTMT], [t('price.duties'), costs.dutiesTMT]];
  const total = Math.max(1, costs.totalTMT);
  const tones = ['bg-ink', 'bg-accent', 'bg-metal', 'bg-faint'];
  return (
    <div className={cn('rounded-[24px] p-5 md:p-6', dark ? 'bg-[#111] text-white' : 'bg-paper shadow-[var(--shadow-soft)]')}>
      <div className="mb-3 flex items-center justify-between">
        <span className={cn('eyebrow', dark && 'text-white/55')}>{title || t('price.breakdown')}</span>
        <Badge tone={dark ? 'glass' : 'neutral'}>{t('price.estimated')}</Badge>
      </div>
      <div className="mb-4 flex h-2 overflow-hidden rounded-full" aria-hidden>{parts.map(([k, v], i) => <div key={k} className={cn('grow-x h-full', tones[i])} style={{ width: `${(v / total) * 100}%`, animationDelay: `${i * 80}ms` }} />)}</div>
      <div className={cn(dark && '[&_span]:text-white/90')}>
        {parts.map(([k, v], i) => <KV key={k} k={<span className="inline-flex items-center gap-2"><span className={cn('size-2 rounded-full', tones[i])} aria-hidden />{k}</span>} v={money(v, 'TMT')} />)}
      </div>
      <div className={cn('mt-2 border-t pt-4', dark ? 'border-white/15' : 'border-line')}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">{t('price.total_est')}</span>
          <span className="price text-[24px]">{money(costs.totalTMT, 'TMT')}</span>
        </div>
      </div>
      <p className={cn('mt-3 text-[12px] leading-relaxed', dark ? 'text-white/50' : 'text-muted')}>{note || t('price.note')}</p>
    </div>
  );
}

export function SupplierCard({ supplier, action }: { supplier: Supplier; action?: ReactNode }) {
  const t = useT();
  const { tk } = useI18n();
  return (
    <article className="card lift flex flex-col gap-5 p-5">
      <div className="flex items-start gap-3.5">
        <SupplierLogo monogram={supplier.monogram} size={52} />
        <div className="min-w-0 flex-1">
          <Link to={`/suppliers/${supplier.id}`} className="block truncate text-[16px] font-semibold tracking-tight hover:underline">{supplier.name}</Link>
          <div className="truncate text-xs text-muted">{supplier.nameCn}</div>
          <div className="mt-1 flex items-center gap-1 text-xs text-muted"><IconPin className="size-3.5" aria-hidden />{supplier.city}, {supplier.province}</div>
        </div>
        <FavoriteButton kind="supplier" refId={supplier.id} className="bg-mist! shadow-none!" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {supplier.verified ? <VerifiedBadge size="sm" label={t('badge.verified_supplier')} /> : <Badge tone="warn">{t('supplier.unverified')}</Badge>}
        {supplier.categories.slice(0, 3).map((c) => <Badge key={c}>{tk(`cat.${c}`)}</Badge>)}
      </div>
      <dl className="grid grid-cols-3 gap-2 rounded-[18px] bg-mist p-3 text-center">
        <div><dt className="text-[11px] text-muted">{t('score.short')}</dt><dd className="num text-[20px] font-semibold">{supplier.score}</dd></div>
        <div><dt className="text-[11px] text-muted">{t('supplier.response')}</dt><dd className="num text-[20px] font-semibold">{supplier.responseHours}h</dd></div>
        <div><dt className="text-[11px] text-muted">{t('supplier.years')}</dt><dd className="num text-[20px] font-semibold">{supplier.yearsActive}</dd></div>
      </dl>
      {action}
    </article>
  );
}

export function CarCard({ car, inspection, onCompare, comparing, dark }: { car: Car; inspection?: CarInspection | null; onCompare?: () => void; comparing?: boolean; dark?: boolean }) {
  const { t, money, num, tk } = useI18n();
  const verified = isVerified(car, inspection ? [inspection] : []);
  const cost = carCost(car, db().content.settings);
  return (
    <article className={cn('group relative flex flex-col overflow-hidden rounded-[24px]', dark ? 'bg-[#1a1a1b] text-white ring-1 ring-white/[0.06]' : 'bg-paper shadow-[var(--shadow-soft)]', 'lift')}>
      <Link to={`/auto/${car.id}`} className="block" aria-label={`${car.brand} ${car.model}`}>
        <CarVisual car={car} image={car.images[0]} rounded={false} className="aspect-[16/10] w-full" modelNote={t('auto.model_photo_short')} />
      </Link>
      <div className="absolute left-3 top-3 flex gap-1">
        {verified ? <VerifiedBadge size="sm" onDark label={t('badge.cargo_verified')} /> : car.condition === 'new' ? <Badge tone="glass">{t('auto.new_factory')}</Badge> : <Badge tone={car.verification === 'rejected' ? 'bad' : 'warn'} className="bg-white/90">{tk(`verif.${car.verification}`)}</Badge>}
      </div>
      <div className="absolute right-3 top-3 flex gap-1.5">
        {onCompare ? <button type="button" onClick={onCompare} aria-pressed={comparing} aria-label={t('compare.toggle')} className={cn('press grid size-10 place-items-center rounded-full', comparing ? 'bg-white text-[#111]' : 'bg-white/10 text-white backdrop-blur hover:bg-white/20')}><IconCompare className="size-[18px]" aria-hidden /></button> : null}
        <FavoriteButton kind="car" refId={car.id} label={`${car.brand} ${car.model}`} onDark />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={cn('text-[11px] font-semibold uppercase tracking-[0.12em]', dark ? 'text-white/45' : 'text-muted')}>{car.brand}</div>
            <Link to={`/auto/${car.id}`} className="block truncate text-[17px] font-semibold tracking-tight hover:underline">{car.model}</Link>
            <div className={cn('num mt-1 text-[12.5px]', dark ? 'text-white/55' : 'text-muted')}>{car.year} · {num(car.mileageKm)} km · {tk(`fuel.${car.fuel}`)}{car.batteryKwh ? ` · ${car.batteryKwh} kWh` : ''}</div>
          </div>
          {inspection && verified ? <span className={cn('num grid size-11 shrink-0 place-items-center rounded-full text-[14px] font-bold', dark ? 'bg-white/10' : 'bg-mist')} title={t('insp.score')}>{inspection.score}</span> : null}
        </div>
        <div className={cn('mt-auto flex items-end justify-between gap-3 border-t pt-4', dark ? 'border-white/10' : 'border-line')}>
          <div>
            <div className="price text-[20px] leading-none">{money(car.priceUSD, 'USD')}</div>
            <div className={cn('mt-1.5 text-[12px]', dark ? 'text-white/55' : 'text-muted')}>{t('auto.tm_est')} <span className={cn('num font-semibold', dark ? 'text-white' : 'text-ink')}>{money(cost.totalUSD, 'USD')}</span></div>
          </div>
          {car.reservedBy ? <Badge tone="info">{t('auto.reserved')}</Badge> : <IconArrow className={cn('size-5 transition-transform group-hover:translate-x-1', dark ? 'text-white/40' : 'text-faint')} aria-hidden />}
        </div>
      </div>
    </article>
  );
}

export function CarCostBlock({ car, dark }: { car: Car; dark?: boolean }) {
  const { t, money } = useI18n();
  const c = carCost(car, db().content.settings);
  return (
    <div className={cn('rounded-[24px] p-5 md:p-6', dark ? 'bg-[#1a1a1b] text-white ring-1 ring-white/[0.06]' : 'bg-paper shadow-[var(--shadow-soft)]')}>
      <div className="mb-2 flex items-center justify-between"><span className={cn('eyebrow', dark && 'text-white/50')}>{t('auto.total_price')}</span><Badge tone={dark ? 'glass' : 'neutral'}>{t('price.estimated')}</Badge></div>
      <div className={cn(dark && '[&_span]:text-white/85')}>
        <KV k={t('auto.cost.vehicle')} v={money(c.vehicleUSD, 'USD')} />
        <KV k={t('auto.cost.china_logistics')} v={money(c.chinaLogisticsUSD, 'USD')} />
        <KV k={t('auto.cost.inspection')} v={c.inspectionUSD ? money(c.inspectionUSD, 'USD') : t('auto.cost.included')} />
        <KV k={t('auto.cost.cargo')} v={money(c.cargoUSD, 'USD')} />
        <KV k={t('auto.cost.mandatory', { pct: c.mandatoryPct })} v={money(c.mandatoryUSD, 'USD')} />
        <KV k={t('auto.cost.service')} v={money(c.serviceUSD, 'USD')} />
      </div>
      <div className={cn('mt-2 border-t pt-4', dark ? 'border-white/15' : 'border-line')}>
        <div className="flex items-baseline justify-between"><span className="font-semibold">{t('auto.cost.total')}</span><span className="price text-[26px]">{money(c.totalUSD, 'USD')}</span></div>
        <div className={cn('num mt-0.5 text-right text-[12px]', dark ? 'text-white/50' : 'text-muted')}>≈ {money(c.totalTMT, 'TMT', { decimals: 0 })}</div>
      </div>
      <p className={cn('mt-3 text-[12px] leading-relaxed', dark ? 'text-white/45' : 'text-muted')}>{t('auto.cost.note')}</p>
    </div>
  );
}

// ---------------- CARGO LINE ----------------
export interface LineNode { label: string; sub?: string }
/** The CARGO LINE: China → Turkmenistan as a line of nodes. `progress` is a float index into nodes. */
export function CargoLine({ nodes, progress, dark, compact, className, animate = true }: { nodes: LineNode[]; progress: number; dark?: boolean; compact?: boolean; className?: string; animate?: boolean }) {
  const n = nodes.length;
  const pct = n > 1 ? Math.max(0, Math.min(1, progress / (n - 1))) * 100 : 0;
  const cur = Math.round(progress);
  return (
    <div className={cn('relative', className)}>
      <div className="relative mx-[9px] h-[18px]">
        <div className={cn('absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full', dark ? 'bg-white/15' : 'bg-mist-3')} aria-hidden />
        <div className={cn('absolute left-0 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-gradient-to-r', dark ? 'from-white/70 to-accent-2' : 'from-ink to-accent', animate && 'grow-x')} style={{ width: `${pct}%` }} aria-hidden />
        {animate && pct > 2 && pct < 100 ? <span className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_4px_rgba(194,97,42,.18)] animate-[cl-run_2.6s_var(--ease-emph)_infinite]" style={{ ['--to' as string]: `${pct}%` }} aria-hidden /> : null}
        {nodes.map((node, i) => {
          const done = i < cur || (i === cur && pct >= 100);
          const here = i === cur && pct < 100;
          return (
            <span key={i} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${n > 1 ? (i / (n - 1)) * 100 : 0}%` }} aria-hidden>
              <span className={cn('block rounded-full transition-all duration-500', here ? 'size-[14px] bg-accent animate-pulse-ring' : done ? cn('size-[10px]', dark ? 'bg-white' : 'bg-ink') : cn('size-[10px] ring-2', dark ? 'bg-[#111] ring-white/25' : 'bg-paper ring-mist-3'))} />
            </span>
          );
        })}
      </div>
      {!compact ? (
        <ol className="mt-2.5 flex justify-between gap-1">
          {nodes.map((node, i) => (
            <li key={i} className={cn('min-w-0 text-[11.5px] leading-tight', i === 0 ? 'text-left' : i === n - 1 ? 'text-right' : 'hidden text-center sm:block', i <= cur ? (dark ? 'text-white' : 'text-ink') : dark ? 'text-white/40' : 'text-faint')} style={{ width: `${100 / n}%` }}>
              <span className="block truncate font-semibold">{node.label}</span>
              {node.sub ? <span className={cn('block truncate', dark ? 'text-white/45' : 'text-muted')}>{node.sub}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      <style>{'@keyframes cl-run{0%{left:0;opacity:0}15%{opacity:1}85%{opacity:1}100%{left:var(--to);opacity:0}}'}</style>
    </div>
  );
}

/** Maps the 13 logistics stages onto the 5-node Cargo Line. */
export const LINE_STAGES: ShipmentStage[][] = [
  ['order_created', 'payment_confirmed', 'supplier_confirmed', 'production'],
  ['china_warehouse'],
  ['consolidated', 'departed_china', 'in_transit'],
  ['customs', 'arrived_tm', 'local_hub', 'out_for_delivery'],
  ['delivered'],
];
export function stageToLine(stage: ShipmentStage): number {
  const i = LINE_STAGES.findIndex((g) => g.includes(stage));
  if (i < 0) return 0;
  const g = LINE_STAGES[i];
  return i + (g.length > 1 ? g.indexOf(stage) / g.length : 0);
}
export function ShipmentLine({ stage, dark, compact }: { stage: ShipmentStage; dark?: boolean; compact?: boolean }) {
  const t = useT();
  const nodes: LineNode[] = [{ label: t('line.china') }, { label: t('line.warehouse') }, { label: t('line.consolidated') }, { label: t('line.turkmenistan') }, { label: t('line.delivered') }];
  return <CargoLine nodes={nodes} progress={stageToLine(stage)} dark={dark} compact={compact} />;
}

/** Vertical shipment timeline with all 13 stages; completed ones carry their events. */
export function ShipmentTimeline({ shipment, compact, dark }: { shipment: Pick<Shipment, 'events' | 'stage'>; compact?: boolean; dark?: boolean }) {
  const { tk, date, t } = useI18n();
  const reached = STAGES.indexOf(shipment.stage);
  const skipConsolidated = !shipment.events.some((e) => e.stage === 'consolidated') && reached > STAGES.indexOf('consolidated');
  const stages = STAGES.filter((s) => !(s === 'consolidated' && skipConsolidated));
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <ol className="stagger relative" aria-label={tk('orders.timeline')}>
      {stages.map((st, i) => {
        const idx = STAGES.indexOf(st);
        const done = idx <= reached;
        const current = st === shipment.stage;
        const evs = shipment.events.filter((e) => e.stage === st);
        const ev = evs[evs.length - 1];
        if (compact && !done && !current && i > stages.indexOf(shipment.stage) + 2) return null;
        return (
          <li key={st} className="relative flex gap-4 pb-6 last:pb-0">
            {i < stages.length - 1 ? <span className={cn('absolute left-[11px] top-6 h-[calc(100%-16px)] w-[2px] rounded-full', idx < reached ? (dark ? 'bg-white/70' : 'bg-ink') : dark ? 'bg-white/10' : 'bg-mist-3')} aria-hidden>{idx < reached ? <span className="timeline-line absolute inset-0 rounded-full" /> : null}</span> : null}
            <span className={cn('relative z-10 grid size-6 shrink-0 place-items-center rounded-full', current ? 'accent-grad animate-pulse-ring' : done ? (dark ? 'bg-white text-[#111]' : 'bg-ink text-on-ink') : dark ? 'bg-[#111] ring-2 ring-white/15' : 'bg-paper ring-2 ring-mist-3')}>
              {done && !current ? <IconCheck className="size-3.5" aria-hidden /> : current ? <span className="size-2 rounded-full bg-white" /> : null}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className={cn('text-[14.5px]', done ? 'font-semibold' : dark ? 'text-white/35' : 'text-faint')}>{tk(`stage.${st}`)}{current ? <span className="ml-2 align-middle"><Badge tone="metal">{t('cargo.now')}</Badge></span> : null}</span>
                {ev ? <span className={cn('num text-[12px]', dark ? 'text-white/50' : 'text-muted')}>{date(ev.at)} · {time(ev.at)}</span> : null}
              </div>
              {ev ? <div className={cn('mt-0.5 text-[12.5px]', dark ? 'text-white/55' : 'text-muted')}><span className="inline-flex items-center gap-1"><IconPin className="size-3" aria-hidden />{ev.location}</span>{ev.note ? ` — ${ev.note}` : ''}{!compact ? <span className={cn('block', dark ? 'text-white/35' : 'text-faint')}>{tk(`stage.${st}.desc`)}</span> : null}</div> : null}
              {evs.length > 1 && !compact ? evs.slice(0, -1).map((e) => <div key={e.id} className={cn('text-[12px]', dark ? 'text-white/35' : 'text-faint')}>{date(e.at, true)} · {e.location}{e.note ? ` — ${e.note}` : ''}</div>) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function ShipmentProgress({ stage, dark }: { stage: ShipmentStage; dark?: boolean }) {
  return <ShipmentLine stage={stage} dark={dark} compact />;
}

// ---------------- Inspection certificate ----------------
const SEED_SUMMARIES = ['Vehicle does not meet CARGO ONE verification standard.', 'Passed with notes. Items listed below are disclosed in full.', 'Passed. No material issues found.', 'Inspection completed by CARGO ONE.', 'Осмотр выполнен CARGO ONE.', 'Barlagy CARGO ONE geçirdi.'];
export const INSPECTION_GROUPS: { key: string; items: InspectionItemKey[] }[] = [
  { key: 'body', items: ['body', 'paint', 'lights'] },
  { key: 'engine', items: ['engine'] },
  { key: 'transmission', items: ['transmission', 'road_test'] },
  { key: 'electronics', items: ['electronics', 'ac', 'diagnostics'] },
  { key: 'battery', items: ['ev_battery', 'charging'] },
  { key: 'interior', items: ['interior'] },
  { key: 'suspension', items: ['suspension', 'brakes', 'tires'] },
  { key: 'documents', items: ['vin', 'documents'] },
  { key: 'history', items: ['ownership', 'accident', 'mileage'] },
];
type GroupState = 'passed' | 'attention' | 'failed' | 'na';

/** Full CARGO ONE inspection report. Data is application/demo data and labelled as such. */
export function InspectionReport({ inspection, car }: { inspection: CarInspection; car: Car }) {
  const { t, tk, date, num } = useI18n();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'issues'>('all');
  const applicable = inspection.items.filter((i) => i.status !== 'na');
  const checks = applicable.reduce((s, i) => s + i.points, 0);
  const groups = INSPECTION_GROUPS.map((g) => {
    const items = g.items.map((k) => inspection.items.find((i) => i.key === k)).filter(Boolean) as CarInspection['items'];
    const app = items.filter((i) => i.status !== 'na');
    const state: GroupState = !app.length ? 'na' : app.some((i) => i.status === 'fail') ? 'failed' : app.some((i) => i.status === 'note') ? 'attention' : 'passed';
    return { ...g, items, state };
  }).filter((g) => filter === 'all' || g.state === 'attention' || g.state === 'failed');
  const passed = inspection.result !== 'failed';
  const stateCls: Record<GroupState, string> = { passed: 'bg-ok/10 text-ok', attention: 'bg-warn/12 text-warn', failed: 'bg-bad/10 text-bad', na: 'bg-mist-2 text-faint' };
  return (
    <section aria-labelledby="insp-title" className="overflow-hidden rounded-[28px] bg-paper shadow-[var(--shadow-soft)]">
      <div className="relative overflow-hidden bg-[#111] p-6 text-white md:p-8">
        <div className="dot-grid-dark absolute inset-0" aria-hidden />
        <div className="absolute -right-24 -top-24 size-72 rounded-full border border-white/[0.06]" aria-hidden /><div className="absolute -right-10 -top-10 size-44 rounded-full border border-white/[0.06]" aria-hidden />
        <div className="relative grid gap-6 md:grid-cols-[auto_1fr_auto] md:items-center">
          <ScoreRing score={inspection.score} label={t('insp.score')} size={128} dark caption="/100" />
          <div>
            <div className="flex items-center gap-2">
              {passed ? <VerifiedSeal className="size-7" onDark /> : <span className="grid size-7 place-items-center rounded-full bg-bad"><IconX className="size-4" aria-hidden /></span>}
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/70">{passed ? t('insp.cert_title') : t('insp.report')}</span>
            </div>
            <h2 id="insp-title" className="display mt-3 text-[26px] uppercase leading-tight md:text-[32px]">{t('insp.point_inspection', { n: checks })}</h2>
            <p className="mt-2 max-w-md text-sm text-white/60">{tk(`insp.summary.${inspection.result}`)}</p>
            {!SEED_SUMMARIES.includes(inspection.summary) && inspection.summary ? <p className="mt-1 text-sm text-white/80">“{inspection.summary}”</p> : null}
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <StatusBadge status={inspection.result} label={tk(`insp.result.${inspection.result}`)} />
            <span className="mono text-[11px] text-white/45">№ {inspection.id.toUpperCase()}</span>
            <span className={cn('max-w-[220px] text-[11px] leading-snug md:text-right', inspection.result === 'failed' ? 'text-[#ff9b9b]' : 'text-white/45')}>{t('insp.demo_label')}</span>
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
        {[
          [t('insp.vin'), <span className="mono break-all">{inspection.vin}</span>],
          [t('insp.date'), date(inspection.date)],
          [t('insp.inspector'), `${inspection.inspector} · ${inspection.inspectorId}`],
          [t('insp.location'), inspection.location],
          [t('insp.owners'), car.owners || '—'],
          [t('insp.mileage_verified'), `${num(car.mileageKm)} km`],
          [t('insp.paint'), `${inspection.paintMicrons[0]}–${inspection.paintMicrons[1]} µm`],
          [t('insp.media'), t('insp.media_value', { photos: inspection.photos, min: inspection.videoMinutes })],
        ].map(([k, v], i) => (
          <div key={i} className="bg-paper p-4"><dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{k}</dt><dd className="mt-1 text-sm font-medium">{v}</dd></div>
        ))}
      </dl>
      <div className="p-5 md:p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-[17px] font-semibold tracking-tight">{t('insp.checklist')}</h3>
          <div className="flex gap-1 rounded-full bg-mist p-1 text-[12px]">
            {(['all', 'issues'] as const).map((f) => <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn('rounded-full px-3.5 py-1.5 font-semibold', filter === f ? 'bg-paper shadow-sm' : 'text-muted')}>{f === 'all' ? t('common.all') : t('insp.issues_only')}</button>)}
          </div>
        </div>
        <ul className="stagger grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <li key={g.key} className={cn('rounded-[18px] bg-mist/70 transition-colors', open === g.key && 'bg-mist sm:col-span-2 lg:col-span-3')}>
              <button type="button" aria-expanded={open === g.key} onClick={() => setOpen(open === g.key ? null : g.key)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                <span className="text-[13px] font-semibold uppercase tracking-[0.08em]">{t(`insp.group.${g.key}` as StringKey)}</span>
                <span className="flex items-center gap-2"><span className={cn('rounded-full px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.08em]', stateCls[g.state])}>{t(`insp.state.${g.state}` as StringKey)}</span><IconDown className={cn('size-4 text-muted transition-transform', open === g.key && 'rotate-180')} aria-hidden /></span>
              </button>
              {open === g.key ? (
                <ul className="animate-rise divide-y divide-line px-4 pb-3">
                  {g.items.map((it) => (
                    <li key={it.key} className="flex items-start gap-3 py-3">
                      <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full', it.status === 'ok' ? 'bg-ok/12 text-ok' : it.status === 'note' ? 'bg-warn/12 text-warn' : it.status === 'fail' ? 'bg-bad/12 text-bad' : 'bg-mist-2 text-faint')}>
                        {it.status === 'ok' ? <IconCheck className="size-3" aria-hidden /> : it.status === 'note' ? <IconInfo className="size-3" aria-hidden /> : it.status === 'fail' ? <IconX className="size-3" aria-hidden /> : <IconDot className="size-3" aria-hidden />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium">{tk(`insp.item.${it.key}`)}</span>
                          <span className="text-[12px] text-muted">{tk(`insp.status.${it.status}`)} · <span className="num">{t('insp.checks', { n: it.points })}</span></span>
                        </div>
                        {it.note ? <p className="mt-0.5 text-[13px] text-muted">{it.note}</p> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5 text-[12px]"><IconFile className="size-3.5" aria-hidden />{t('insp.photos', { n: inspection.photos })}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5 text-[12px]"><IconFile className="size-3.5" aria-hidden />{t('insp.video', { n: inspection.videoMinutes })}</span>
          {car.fuel === 'ev' ? <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1.5 text-[12px]"><IconBattery className="size-3.5" aria-hidden />{t('insp.battery_soh', { n: car.batteryHealth ?? '—' })}</span> : null}
        </div>
        <div className="mt-5"><Notice tone="neutral" icon={IconWarn}>{t('insp.method_note')}</Notice></div>
      </div>
    </section>
  );
}

export function QuoteCard({ option, supplier, rank, onCompare, comparing, actions }: { option: QuoteOption; supplier?: Supplier; rank: number; onCompare: () => void; comparing: boolean; actions: ReactNode }) {
  const { t, tk, money } = useI18n();
  const best = rank === 0;
  return (
    <article className={cn('animate-rise relative overflow-hidden rounded-[24px] p-5 md:p-6', best ? 'bg-[#111] text-white' : 'bg-paper shadow-[var(--shadow-soft)]')} style={{ animationDelay: `${rank * 110}ms` }}>
      {best ? <div className="dot-grid-dark pointer-events-none absolute inset-0" aria-hidden /> : null}
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {supplier ? <SupplierLogo monogram={supplier.monogram} size={46} dark={!best} /> : null}
          <div>
            <Link to={`/suppliers/${option.supplierId}`} className="text-[16px] font-semibold tracking-tight hover:underline">{supplier?.name}</Link>
            <div className={cn('flex items-center gap-1.5 text-xs', best ? 'text-white/55' : 'text-muted')}><IconPin className="size-3" aria-hidden />{supplier?.city}{supplier?.verified ? <span className="inline-flex items-center gap-1"> · <IconShield className="size-3" aria-hidden />{t('badge.verified')}</span> : null}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={best ? 'accent' : 'metal'}>{tk(`ai.rec.${option.recommendation}`)}</Badge>
          <span className={cn('num rounded-full px-2.5 py-1 text-[12px] font-semibold', best ? 'bg-white/10' : 'bg-mist')} title={t('ai.fit_hint')}>{t('ai.fit', { n: option.fitScore })}</span>
        </div>
      </div>
      <dl className="relative mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
        {[
          [t('ai.supplier_score'), <span className="num">{supplier?.score ?? '—'}</span>],
          [t('common.moq'), <span className="num">{option.moq}</span>],
          [t('ai.unit_price'), <span className="num">{money(option.unitPriceUSD, 'USD', { decimals: 2 })}</span>],
          [t('ai.production'), <span className="num">{t('common.days', { n: option.productionDays })}</span>],
          [t('ai.shipping'), <span className="num">{money(option.shippingUSD, 'USD')} · {t('common.days', { n: option.shippingDays })}</span>],
          [t('ai.quality'), tk(`ai.quality.${option.quality}`)],
        ].map(([k, v], i) => <div key={i}><dt className={cn('text-[10.5px] font-semibold uppercase tracking-[0.1em]', best ? 'text-white/45' : 'text-muted')}>{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>)}
      </dl>
      <div className={cn('relative mt-5 flex items-end justify-between gap-3 rounded-[18px] p-4', best ? 'bg-white/[0.06]' : 'bg-mist')}>
        <div><div className={cn('text-[10.5px] font-semibold uppercase tracking-[0.1em]', best ? 'text-white/45' : 'text-muted')}>{t('ai.total_est')}</div><div className="price text-[26px] leading-tight">{money(option.totalUSD, 'USD')}</div></div>
        <ul className="flex flex-wrap justify-end gap-1.5">
          {option.reasons.slice(0, 3).map((r) => { const [k, v] = r.split(':'); return <li key={r}><Badge tone={k === 'over_budget' ? 'warn' : k === 'within_budget' ? 'ok' : best ? 'glass' : 'neutral'}>{tk(`ai.reason.${k}`, { v })}</Badge></li>; })}
        </ul>
      </div>
      <div className="relative mt-5 flex flex-wrap gap-2">
        <Button size="sm" variant={comparing ? (best ? 'inverse' : 'primary') : best ? 'inverse' : 'secondary'} icon={IconCompare} onClick={onCompare} className={best && !comparing ? 'bg-white/10! text-white! hover:bg-white/20!' : undefined}>{comparing ? t('compare.added') : t('compare.action')}</Button>
        {actions}
      </div>
    </article>
  );
}

/** Comparison table for products (used by Shop, Find, Favorites). */
export function ProductCompare({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) {
  const { t, money } = useI18n();
  const products = useMemo(() => ids.map((id) => db().products.find((p) => p.id === id)).filter(Boolean) as Product[], [ids]);
  const s = db().content.settings;
  if (!products.length) return <p className="text-sm text-muted">{t('compare.empty')}</p>;
  const rows: [string, (p: Product) => ReactNode][] = [
    [t('compare.price'), (p) => { const sp = presentedPrice(p); return sp ? money(sp.amount, sp.currency) : t('cat.price_unavailable'); }],
    [t('price.final_est'), (p) => (pricingStatus(p) === 'estimate' ? <strong>{money(estimateProduct(p, 1, s).totalTMT, 'TMT', { decimals: 0 })}</strong> : <span className="text-muted">{t('cat.not_calculated')}</span>)],
    [t('score.supplier'), (p) => db().suppliers.find((x) => x.id === p.supplierId)?.score ?? '—'],
    [t('score.product'), (p) => (p.demo && p.score ? p.score : '—')],
    [t('compare.delivery'), (p) => { if (!leadKnown(p)) return t('cat.lead_unknown'); const [a, b] = deliveryWindow(p); return t('delivery.days', { min: a, max: b }); }],
    [t('common.moq'), (p) => p.moq],
    [t('compare.rating'), (p) => (p.reviews.length ? `${p.rating} (${p.reviews.length})${p.demo ? ` · ${t('cat.demo_data')}` : ''}` : '—')],
    [t('compare.verified'), (p) => (p.verified ? t('common.yes') : t('common.no'))],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <thead>
          <tr>
            <th scope="col" className="w-36" />
            {products.map((p) => (
              <th key={p.id} scope="col" className="px-2 pb-3 align-top font-normal">
                <ProductVisual icon={p.icon} image={p.images[0]} className="mb-2 aspect-square w-full max-w-[150px]" />
                <Link to={`/shop/${p.id}`} className="line-clamp-2 font-semibold hover:underline">{p.title}</Link>
                <button type="button" onClick={() => onRemove(p.id)} className="mt-1 text-[12px] text-muted underline underline-offset-2">{t('common.remove')}</button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label} className="border-t border-line">
              <th scope="row" className="py-3 pr-3 font-normal text-muted">{label}</th>
              {products.map((p) => <td key={p.id} className="num px-2 py-3">{fn(p)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CarCompare({ ids, onRemove }: { ids: string[]; onRemove: (id: string) => void }) {
  const { t, money, num, tk } = useI18n();
  const d = db();
  const cars = ids.map((id) => d.cars.find((c) => c.id === id)).filter(Boolean) as Car[];
  if (!cars.length) return <p className="text-sm text-muted">{t('compare.empty')}</p>;
  const insp = (c: Car) => d.inspections.find((i) => i.id === c.inspectionId);
  const rows: [string, (c: Car) => ReactNode][] = [
    [t('auto.cost.vehicle'), (c) => money(c.priceUSD, 'USD')],
    [t('auto.cost.total'), (c) => <strong>{money(carCost(c, d.content.settings).totalUSD, 'USD')}</strong>],
    [t('auto.year'), (c) => c.year],
    [t('auto.mileage'), (c) => `${num(c.mileageKm)} km`],
    [t('auto.fuel'), (c) => tk(`fuel.${c.fuel}`)],
    [t('auto.battery'), (c) => (c.batteryKwh ? `${c.batteryKwh} kWh` : '—')],
    [t('insp.score'), (c) => (isVerified(c, d.inspections) ? insp(c)?.score : '—')],
    [t('auto.accident'), (c) => tk(`accident.${c.accident}`)],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-[13px]">
        <thead><tr><th className="w-36" />{cars.map((c) => <th key={c.id} className="px-2 pb-3 align-top font-normal"><CarVisual car={c} image={c.images[0]} className="mb-2 aspect-[16/10] w-full max-w-[200px]" /><Link to={`/auto/${c.id}`} className="font-semibold hover:underline">{c.brand} {c.model}</Link><button type="button" onClick={() => onRemove(c.id)} className="ml-2 text-[12px] text-muted underline">{t('common.remove')}</button></th>)}</tr></thead>
        <tbody>{rows.map(([label, fn]) => <tr key={label} className="border-t border-line"><th scope="row" className="py-3 pr-3 font-normal text-muted">{label}</th>{cars.map((c) => <td key={c.id} className="num px-2 py-3">{fn(c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function statusKey(domain: 'order' | 'payment' | 'invoice' | 'ticket' | 'quote' | 'supplier' | 'user' | 'promo' | 'gb' | 'vip', status: string) {
  return `status.${domain}.${status}` as StringKey;
}
