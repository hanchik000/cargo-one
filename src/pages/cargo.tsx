import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate, useLocation, useParams, useQueryParam } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { cargoService, STAGE_GROUP, trackingService } from '@/services/cargoService';
import { useAuth } from '@/state/auth';
import type { Shipment } from '@/lib/types';
import { Badge, Button, Checkbox, cn, EmptyState, ErrorState, FileCard, KV, Notice, PageHeader, SectionTitle, Skeleton, SkeletonRows, StatCard, StatusBadge, Tabs, useToast } from '@/components/ui';
import { ShipmentLine, ShipmentProgress, ShipmentTimeline, statusKey, stageToLine } from '@/components/commerce';
import { usePageTitle } from '@/components/shell';
import { IconArrow, IconCargo, IconContainer, IconInfo, IconLayers, IconPackage, IconPlane, IconSearch, IconTrain, IconWarehouse, IconZap, IconCheck, IconPin, IconTrack } from '@/components/icons';
import { asset } from '@/lib/assets';
import { Img } from '@/components/ui';

type Group = 'all' | 'china_warehouse' | 'consolidation' | 'in_transit' | 'customs' | 'turkmenistan' | 'delivered';
const GROUPS: Group[] = ['all', 'china_warehouse', 'consolidation', 'in_transit', 'customs', 'turkmenistan', 'delivered'];
const MODE_ICON = { rail: IconTrain, truck: IconCargo, air: IconPlane };

/** Big logistics card: China → Warehouse → Consolidated → Turkmenistan → Delivered. */
export function ShipmentHero({ s, title }: { s: Shipment; title?: string }) {
  const { t, tk, date } = useI18n();
  const Icon = MODE_ICON[s.mode];
  const nodes = [t('line.china'), t('line.warehouse'), t('line.consolidated'), t('line.turkmenistan'), t('line.delivered')];
  const pos = stageToLine(s.stage);
  const eta = new Date(s.eta);
  return (
    <section className="relative overflow-hidden rounded-[32px] bg-[#111] p-6 text-white md:p-8">
      <div className="dot-grid-dark absolute inset-0" aria-hidden />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow flex items-center gap-2 text-white/50"><Icon className="size-3.5" aria-hidden />{title || t('cargo.active_shipment')}</div>
          <div className="mono mt-2 text-[22px] font-semibold tracking-tight md:text-[26px]">{s.trackingNumber}</div>
          <div className="mt-1 text-[13px] text-white/55">{s.kind === 'vehicle' ? t('cargo.vehicle_shipment') : s.supplierName} · {s.carrier}</div>
        </div>
        <div className="flex gap-6 text-right">
          <div><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">{t('common.status')}</div><div className="mt-1 text-[15px] font-semibold uppercase tracking-[0.04em] text-accent-2">{tk(`stage.${s.stage}`)}</div></div>
          <div><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">{t('cargo.eta')}</div><div className="display mt-1 text-[22px] uppercase leading-none">{s.stage === 'delivered' ? '✓' : `${eta.getDate()} ${eta.toLocaleString(undefined, { month: 'short' })}`}</div></div>
        </div>
      </div>
      {/* Mobile: vertical chain. Desktop: horizontal Cargo Line. */}
      <ol className="relative mt-7 space-y-0 md:hidden">
        {nodes.map((n, i) => {
          const done = i < Math.floor(pos) || s.stage === 'delivered';
          const here = i === Math.floor(pos) && s.stage !== 'delivered';
          return (
            <li key={n} className="relative flex items-center gap-4 pb-5 last:pb-0">
              {i < nodes.length - 1 ? <span className={cn('absolute left-[9px] top-5 h-full w-[2px]', i < Math.floor(pos) ? 'bg-white/70' : 'bg-white/12')} aria-hidden /> : null}
              <span className={cn('relative z-10 grid size-5 shrink-0 place-items-center rounded-full', here ? 'accent-grad animate-pulse-ring' : done ? 'bg-white text-[#111]' : 'bg-[#111] ring-2 ring-white/20')}>{done && !here ? <IconCheck className="size-3" aria-hidden /> : null}</span>
              <span className={cn('text-[14px] font-semibold uppercase tracking-[0.04em]', here ? 'text-white' : done ? 'text-white/80' : 'text-white/35')}>{n}</span>
              {here ? <span className="ml-auto rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold">{t('cargo.now')}</span> : null}
            </li>
          );
        })}
      </ol>
      <div className="relative mt-9 hidden md:block"><ShipmentLine stage={s.stage} dark /></div>
      <div className="relative mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-[13px] text-white/60">
        <span className="inline-flex items-center gap-1.5"><IconPin className="size-3.5" aria-hidden />{s.events[s.events.length - 1]?.location || '—'}</span>
        <span>{s.stage === 'delivered' ? t('cargo.delivered_on', { date: date(s.events[s.events.length - 1]?.at || s.eta) }) : t('cargo.eta_on', { date: date(s.eta) })}</span>
      </div>
    </section>
  );
}

function ShipmentRow({ s, active, onSelect }: { s: Shipment; active?: boolean; onSelect?: () => void }) {
  const { t, tk, date } = useI18n();
  const Icon = MODE_ICON[s.mode];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', active ? 'bg-white/15' : 'bg-mist')}><Icon className="size-[18px]" aria-hidden /></span>
          <div className="min-w-0">
            <div className="mono truncate text-[14px] font-semibold">{s.trackingNumber}</div>
            <div className={cn('truncate text-[12px]', active ? 'text-white/55' : 'text-muted')}>{s.kind === 'vehicle' ? t('cargo.vehicle_shipment') : s.supplierName} · {t('cargo.packages_n', { n: s.packages.length || 1 })}</div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn('text-[11.5px] font-semibold uppercase tracking-[0.04em]', s.stage === 'delivered' ? (active ? 'text-white' : 'text-ok') : active ? 'text-accent-2' : 'text-accent')}>{tk(`stage.${s.stage}`)}</div>
          <div className={cn('text-[11.5px]', active ? 'text-white/50' : 'text-muted')}>{s.stage === 'delivered' ? date(s.events[s.events.length - 1]?.at || s.eta) : `${t('cargo.eta')} ${date(s.eta)}`}</div>
        </div>
      </div>
      <div className="mt-4"><ShipmentProgress stage={s.stage} dark={active} /></div>
    </>
  );
  const cls = cn('block w-full rounded-[22px] p-4 text-left transition-all duration-300', active ? 'bg-[#111] text-white shadow-[var(--shadow-lift)]' : 'bg-paper shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-lift)]');
  return onSelect ? <button type="button" onClick={onSelect} aria-pressed={active} className={cls}>{body}</button> : <Link to={`/cargo/${s.id}`} className={cls}>{body}</Link>;
}

export function CargoPage() {
  const { t, tk, money, date, num } = useI18n();
  usePageTitle(t('nav.cargo'), t('meta.cargo'));
  const [g, setG] = useQueryParam('group');
  const group = (g || 'all') as Group;
  const q = useQuery(() => cargoService.dashboard(), []);
  const [selected, setSelected] = useState('');
  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: 0, china_warehouse: 0, consolidation: 0, in_transit: 0, customs: 0, turkmenistan: 0, delivered: 0 };
    for (const s of q.data?.shipments || []) { c.all++; const k = STAGE_GROUP[s.stage]; if (k !== 'pre') c[k as Group]++; }
    return c;
  }, [q.data]);
  const all = q.data?.shipments || [];
  const list = all.filter((s) => group === 'all' || STAGE_GROUP[s.stage] === group);
  const activeList = all.filter((s) => s.stage !== 'delivered');
  const focus = all.find((s) => s.id === selected) || activeList[0] || all[0];
  return (
    <div>
      <PageHeader display eyebrow={t('cargo.eyebrow')} title={t('cargo.my_cargo')} subtitle={t('cargo.subtitle')}
        actions={<><Button variant="secondary" icon={IconSearch} to="/track">{t('nav.track')}</Button><Button icon={IconLayers} to="/cargo/consolidate">{t('cargo.consolidate')}</Button></>} />
      {q.loading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !all.length ? (
        <EmptyState icon={IconCargo} title={t('cargo.empty')} body={t('cargo.empty_body')} action={<Button to="/shop">{t('nav.shop')}</Button>} />
      ) : (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            {[[t('cargo.active_shipments'), activeList.length, IconCargo], [t('cargo.group.china_warehouse'), counts.china_warehouse, IconWarehouse], [t('cargo.group.customs'), counts.customs, IconContainer], [t('cargo.group.delivered'), counts.delivered, IconPackage]].map(([label, n, Icon], i) => {
              const I = Icon as typeof IconCargo;
              return <div key={i} className={cn('flex items-center gap-3 rounded-full py-2 pl-2 pr-5', i === 0 ? 'bg-[#111] text-white' : 'bg-paper shadow-[var(--shadow-soft)]')}><span className={cn('grid size-9 place-items-center rounded-full', i === 0 ? 'accent-grad' : 'bg-mist')}><I className="size-4" aria-hidden /></span><span className="num text-[20px] font-semibold">{n as number}</span><span className={cn('text-[12.5px]', i === 0 ? 'text-white/60' : 'text-muted')}>{label as string}</span></div>;
            })}
          </div>
          {q.data!.waiting.length >= 2 ? (
            <Link to="/cargo/consolidate" className="lift mb-6 flex items-center gap-4 rounded-[24px] bg-accent-soft p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-full accent-grad text-white"><IconLayers className="size-5" aria-hidden /></span>
              <div className="flex-1"><div className="font-semibold">{t('cargo.consolidate_prompt', { n: q.data!.waiting.length })}</div><div className="text-[13px] text-muted">{t('cargo.consolidate_prompt_sub')}</div></div>
              <IconArrow className="size-5" aria-hidden />
            </Link>
          ) : null}
          {/* Mobile & tablet: active shipment hero + list. */}
          <div className="xl:hidden">
            {focus ? <Link to={`/cargo/${focus.id}`} className="block"><ShipmentHero s={focus} /></Link> : null}
            <Tabs value={group} onChange={(v) => setG(v === 'all' ? '' : v)} items={GROUPS.map((x) => ({ value: x, label: t(`cargo.group.${x}`), count: counts[x] }))} className="mb-5 mt-8" label={t('nav.cargo')} />
            {list.length ? <div className="stagger grid gap-3 md:grid-cols-2">{list.map((s) => <ShipmentRow key={s.id} s={s} />)}</div>
              : <EmptyState icon={IconCargo} title={t('cargo.empty')} body={t('cargo.empty_body')} />}
          </div>
          {/* Desktop: shipments | tracking | details */}
          <div className="hidden gap-5 xl:grid xl:grid-cols-[320px_1fr_300px]">
            <aside aria-label={t('cargo.shipments')} className="space-y-2.5">
              <Tabs value={group} onChange={(v) => setG(v === 'all' ? '' : v)} items={GROUPS.slice(0, 4).map((x) => ({ value: x, label: t(`cargo.group.${x}`), count: counts[x] }))} label={t('nav.cargo')} className="mb-2" />
              {list.map((s) => <ShipmentRow key={s.id} s={s} active={focus?.id === s.id} onSelect={() => setSelected(s.id)} />)}
              {!list.length ? <p className="p-4 text-sm text-muted">{t('cargo.empty')}</p> : null}
            </aside>
            {focus ? (
              <section key={focus.id} className="animate-rise min-w-0 space-y-5">
                <ShipmentHero s={focus} />
                <div className="card p-6"><div className="mb-5 flex items-center justify-between"><h2 className="text-[17px] font-semibold uppercase tracking-[0.04em]">{t('orders.timeline')}</h2><Link to={`/cargo/${focus.id}`} className="text-[13px] font-semibold underline underline-offset-4">{t('orders.details')}</Link></div><ShipmentTimeline shipment={focus} compact /></div>
              </section>
            ) : <div />}
            {focus ? (
              <aside className="space-y-3">
                <div className="card p-5">
                  <div className="eyebrow mb-2">{t('cargo.details')}</div>
                  <KV k={t('cargo.supplier')} v={focus.supplierName} mono={false} />
                  <KV k={t('cargo.packages')} v={focus.packages.length || 1} />
                  <KV k={t('cargo.weight')} v={`${num(focus.weightKg, 1)} kg`} />
                  <KV k={t('cargo.volume')} v={`${num(focus.volumeM3, 3)} m³`} />
                  <KV k={t('cargo.eta')} v={date(focus.eta)} mono={false} />
                  <KV k={t('cargo.cost')} v={money(focus.costTMT, 'TMT')} strong />
                </div>
                <div className="overflow-hidden rounded-[24px] bg-[#111]"><Img src={asset('img/hero/cargo-wide.webp')} alt="" className="aspect-[16/10] bg-transparent" /></div>
                <Button full variant="secondary" icon={IconTrack} to={`/track?q=${focus.trackingNumber}`}>{t('nav.track')}</Button>
                <p className="px-1 text-[12px] text-muted">{tk(`stage.${focus.stage}.desc`)}</p>
              </aside>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function DemoAdvance({ shipment }: { shipment: Shipment }) {
  const { t } = useI18n();
  const toast = useToast();
  const adv = useAction(cargoService.advance);
  if (shipment.stage === 'delivered') return null;
  return (
    <div className="rounded-[22px] border-[1.5px] border-dashed border-mist-3 p-5">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><IconZap className="size-4" aria-hidden />{t('demo.controls')}</div>
      <p className="mb-3 text-[12px] text-muted">{t('demo.advance_body')}</p>
      <Button size="sm" variant="secondary" loading={adv.pending} onClick={async () => { const r = await adv.run(shipment.id); if (r) toast(t('demo.advanced')); }}>{t('demo.advance')}</Button>
    </div>
  );
}

export function ShipmentPage() {
  const { id } = useParams();
  const { t, tk, money, date, num } = useI18n();
  const q = useQuery(() => cargoService.get(id), [id]);
  usePageTitle(q.data?.shipment.trackingNumber || t('nav.cargo'));
  if (q.loading) return <SkeletonRows count={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  const { shipment: s, orders, warehouse } = q.data;
  return (
    <div>
      <PageHeader back={{ to: '/cargo', label: t('nav.cargo') }} eyebrow={t(`cargo.mode.${s.mode}`)} title={<span className="mono">{s.trackingNumber}</span>}
        actions={<Badge tone={s.stage === 'delivered' ? 'ok' : 'dark'}>{tk(`stage.${s.stage}`)}</Badge>} />
      <ShipmentHero s={s} title={`${warehouse.name} → ${s.destination}`} />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="card p-6 md:p-8"><h2 className="mb-6 text-[17px] font-semibold uppercase tracking-[0.04em]">{t('orders.timeline')}</h2><ShipmentTimeline shipment={s} /></section>
        <aside className="space-y-3">
          <div className="card p-5">
            <KV k={t('cargo.supplier')} v={s.supplierName} mono={false} />
            <KV k={t('cargo.warehouse')} v={warehouse.name} mono={false} />
            <KV k={t('cargo.tracking')} v={<span className="mono">{s.trackingNumber}</span>} />
            <KV k={t('cargo.packages')} v={s.packages.length || 1} />
            <KV k={t('cargo.weight')} v={`${num(s.weightKg, 1)} kg`} />
            <KV k={t('cargo.volume')} v={`${num(s.volumeM3, 3)} m³`} />
            <KV k={t('cargo.eta')} v={date(s.eta)} mono={false} />
            <KV k={t('cargo.cost')} v={money(s.costTMT, 'TMT')} strong />
          </div>
          {orders.length ? <div className="card p-5"><div className="eyebrow mb-2">{t('nav.orders')}</div>{orders.map((o) => <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center justify-between py-2 text-sm hover:underline"><span className="mono">{o.number}</span><StatusBadge status={o.status} label={tk(statusKey('order', o.status))} /></Link>)}</div> : null}
          {s.packages.length ? <div className="card p-5"><div className="eyebrow mb-2">{t('cargo.packages')}</div>{s.packages.map((p) => <div key={p.id} className="flex justify-between gap-3 py-2 text-[13px]"><span className="flex min-w-0 items-center gap-2"><IconPackage className="size-4 shrink-0 text-muted" aria-hidden /><span className="truncate">{p.label}</span></span><span className="num shrink-0 text-muted">{p.weightKg} kg</span></div>)}</div> : null}
          <div className="space-y-2"><div className="eyebrow px-1">{t('orders.documents')}</div>{s.documents.length ? s.documents.map((d) => <FileCard key={d} name={d} meta={t('orders.doc_meta')} />) : <p className="text-sm text-muted">{t('orders.no_documents')}</p>}</div>
          <DemoAdvance shipment={s} />
        </aside>
      </div>
    </div>
  );
}

export function ConsolidatePage() {
  const { t, money, num } = useI18n();
  usePageTitle(t('cargo.consolidate'));
  const toast = useToast();
  const q = useQuery(() => cargoService.dashboard(), []);
  const [sel, setSel] = useState<string[]>([]);
  const cons = useAction(cargoService.consolidate);
  const waiting = q.data?.waiting || [];
  useEffect(() => { if (q.data && !sel.length) setSel(q.data.waiting.map((p) => p.id)); }, [q.data?.waiting.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = waiting.filter((p) => sel.includes(p.id));
  const pv = cargoService.preview(picked);
  const go = async () => {
    const s = await cons.run(sel);
    if (s) { toast(t('cargo.consolidated_toast')); navigate(`/cargo/${s.id}`); }
  };
  return (
    <div>
      <PageHeader back={{ to: '/cargo', label: t('nav.cargo') }} eyebrow={t('cargo.eyebrow')} title={t('cargo.consolidate')} subtitle={t('cargo.consolidate_sub')} />
      {q.loading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : waiting.length < 2 ? (
        <EmptyState icon={IconLayers} title={t('cargo.consolidate_empty')} body={t('cargo.consolidate_empty_body')} action={<Button to="/shop">{t('nav.shop')}</Button>} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <ol className="card mb-8 grid items-center gap-3 p-5 text-center text-[12px] md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]" aria-label={t('cargo.flow')}>
              <li className="space-y-1">{picked.slice(0, 3).map((p, i) => <div key={p.id} className="truncate rounded-[8px] bg-mist px-2 py-1.5">{t('cargo.order_letter', { l: String.fromCharCode(65 + i) })}</div>)}{picked.length > 3 ? <div className="text-faint">+{picked.length - 3}</div> : null}</li>
              <li aria-hidden className="text-faint">→</li>
              <li className="rounded-[16px] bg-mist p-3"><IconWarehouse className="mx-auto mb-1 size-5" aria-hidden />{t('cargo.c1_warehouse')}</li>
              <li aria-hidden className="text-faint">→</li>
              <li className="rounded-[16px] bg-mist p-3"><IconLayers className="mx-auto mb-1 size-5" aria-hidden />{t('cargo.consolidate_step')}</li>
              <li aria-hidden className="text-faint">→</li>
              <li className="rounded-[16px] accent-grad p-3 text-white"><IconPackage className="mx-auto mb-1 size-5" aria-hidden />{t('cargo.one_shipment')}</li>
            </ol>
            <SectionTitle title={t('cargo.waiting_title')} sub={t('cargo.waiting_sub')} />
            <ul className="space-y-2">
              {waiting.map((p) => (
                <li key={p.id} className={cn('rounded-[22px] bg-paper p-5 transition-all duration-300', sel.includes(p.id) ? 'shadow-[0_0_0_2px_var(--color-ink),var(--shadow-lift)]' : 'shadow-[var(--shadow-soft)]')}>
                  <Checkbox checked={sel.includes(p.id)} onChange={(v) => setSel((s) => (v ? [...s, p.id] : s.filter((x) => x !== p.id)))}
                    label={p.label} description={<span className="num">{num(p.weightKg, 1)} kg · {num(p.volumeM3, 3)} m³ · {t('cargo.received_at_hub')}</span>} />
                </li>
              ))}
            </ul>
          </div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="relative overflow-hidden rounded-[28px] bg-[#111] p-6 text-white">
              <div className="dot-grid-dark absolute inset-0" aria-hidden />
              <div className="relative eyebrow text-white/50">{t('cargo.one_shipment')}</div>
              <div className="relative mt-4 [&_span]:text-white/90">
                <KV k={t('cargo.packages')} v={picked.length} />
                <KV k={t('cargo.combined_weight')} v={`${num(pv.weightKg, 1)} kg`} />
                <KV k={t('cargo.combined_volume')} v={`${num(pv.volumeM3, 3)} m³`} />
                <KV k={t('cargo.separate_cost')} v={<span className="line-through">{money(pv.separateTMT, 'TMT')}</span>} />
                <KV k={t('cargo.cargo_price')} v={money(pv.combinedTMT, 'TMT')} strong />
              </div>
              <div className="relative mt-4 rounded-[18px] bg-white/[0.07] p-4">
                <div className="text-[12px] text-white/60">{t('cargo.estimated_saving')}</div>
                <div className="price text-[30px] text-accent-2">{money(pv.savingTMT, 'TMT')}</div>
              </div>
              <Button variant="accent" size="lg" full className="relative mt-5" loading={cons.pending} disabled={picked.length < 2} onClick={go}>{t('cargo.consolidate_cta')}</Button>
              {picked.length < 2 ? <p className="mt-2 text-center text-[12px] text-white/50">{t('cargo.select_two')}</p> : null}
              {cons.error ? <p className="mt-2 text-[12px] text-[#ff9b9b]">{t('error.body')}</p> : null}
            </div>
            <div className="mt-3"><Notice tone="neutral" icon={IconInfo}>{t('cargo.consolidate_note')}</Notice></div>
          </aside>
        </div>
      )}
    </div>
  );
}

export function TrackPage() {
  const { t, tk, date } = useI18n();
  usePageTitle(t('nav.track'), t('meta.track'));
  const { query } = useLocation();
  const { user } = useAuth();
  const [input, setInput] = useState(query.get('q') || '');
  const [term, setTerm] = useState(query.get('q') || '');
  useEffect(() => { const v = query.get('q') || ''; setInput(v); setTerm(v); }, [query.get('q')]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useQuery(() => trackingService.find(term), [term], { enabled: !!term });
  const r = res.data;
  const owner = !!(user && r?.shipment && (r.shipment.userId === user.id || user.role === 'admin'));
  return (
    <div>
      <PageHeader display eyebrow={t('track.eyebrow')} title={t('track.title')} subtitle={t('track.subtitle')} />
      <form role="search" className="mb-8 flex max-w-2xl gap-2 rounded-full bg-paper p-1.5 shadow-[var(--shadow-lift)]" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); const v = input.trim(); if (v) navigate(`/track?q=${encodeURIComponent(v)}`, { replace: true }); }}>
        <div className="relative flex-1">
          <IconSearch className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input value={input} onChange={(e: { target: HTMLInputElement }) => setInput(e.target.value)} placeholder={t('track.placeholder')} aria-label={t('track.placeholder')} className="mono h-12 w-full rounded-full bg-transparent pl-12 pr-3 text-[16px] uppercase outline-none" />
        </div>
        <Button type="submit">{t('track.action')}</Button>
      </form>
      {!term ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[['track.by_order', 'CO-10028'], ['track.by_tracking', 'C1TM821761'], ['track.by_reservation', 'AUTO-5012']].map(([k, ex]) => (
            <button key={k} type="button" onClick={() => navigate(`/track?q=${ex}`, { replace: true })} className="card lift group p-6 text-left">
              <span className="grid size-11 place-items-center rounded-full bg-mist transition-colors group-hover:bg-ink group-hover:text-on-ink"><IconTrack className="size-5" aria-hidden /></span>
              <div className="mt-6 text-[15px] font-semibold uppercase tracking-[0.03em]">{t(k as 'track.by_order')}</div>
              <div className="mono mt-1 text-[13px] text-muted">{t('track.example', { ex })}</div>
            </button>
          ))}
        </div>
      ) : res.loading ? <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-64" /></div>
        : res.error ? <ErrorState error={res.error} onRetry={res.reload} />
        : !r ? <EmptyState icon={IconSearch} title={t('track.not_found')} body={t('track.not_found_body')} />
        : (
          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <section>
              {r.shipment ? (
                <>
                  <ShipmentHero s={r.shipment} title={r.shipment.stage === 'delivered' ? t('track.delivered') : t('cargo.tracking')} />
                  <div className="card mt-6 p-6 md:p-8"><ShipmentTimeline shipment={r.shipment} /></div>
                </>
              ) : <Notice tone="warn">{t('track.no_shipment_yet')}</Notice>}
            </section>
            <aside className="space-y-3">
              {r.order ? <div className="card p-5"><div className="eyebrow mb-2">{t('orders.order')}</div><div className="num font-semibold">{r.order.number}</div><div className="mt-2"><StatusBadge status={r.order.status} label={tk(statusKey('order', r.order.status))} /></div>{user && r.order.userId === user.id ? <Button className="mt-4" variant="secondary" size="sm" to={`/orders/${r.order.id}`}>{t('orders.details')}</Button> : null}</div> : null}
              {r.reservation ? <div className="card p-5"><div className="eyebrow mb-2">{t('auto.reservation')}</div><div className="num font-semibold">{r.reservation.number}</div><div className="mt-1 text-sm text-muted">{tk(`auto.step.${r.reservation.step}`)}</div>{user && r.reservation.userId === user.id ? <Button className="mt-4" variant="secondary" size="sm" to={`/auto/reservations/${r.reservation.id}`}>{t('orders.details')}</Button> : null}</div> : null}
              {r.shipment && owner ? <DemoAdvance shipment={r.shipment} /> : null}
              {!owner ? <Notice tone="neutral" icon={IconInfo}>{t('track.public_note')}</Notice> : null}
            </aside>
          </div>
        )}
    </div>
  );
}
