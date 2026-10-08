import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate, useLocation, useParams, useQueryParam } from '@/lib/router';
import { useAction, useDebounced, useQuery } from '@/lib/hooks';
import { vehicleService, isVerified } from '@/services/vehicleService';
import type { CarCategory, CarQuery } from '@/services/vehicleService';
import { useAuth } from '@/state/auth';
import { useCompare } from '@/state/cart';
import { carCost } from '@/lib/pricing';
import { db } from '@/services/db';
import { AUTO_FLOW } from '@/lib/types';
import type { Car, CarInspection } from '@/lib/types';
import { Badge, Button, Checkbox, Chip, cn, EmptyState, ErrorState, Input, KV, MiniSelect, Modal, Notice, PageHeader, SectionTitle, Sheet, SkeletonGrid, SkeletonRows, Tabs, useToast, VerifiedBadge } from '@/components/ui';
import { CarCard, CarCompare, CarCostBlock, CargoLine, FavoriteButton, InspectionReport, ShipmentProgress } from '@/components/commerce';
import { asset } from '@/lib/assets';
import { Img, ScoreRing, VerifiedSeal } from '@/components/ui';
import { CarVisual } from '@/components/visuals';
import { PaymentMethodPicker } from '@/components/forms';
import { usePageTitle } from '@/components/shell';
import { IconAI, IconArrow, IconBattery, IconCheck, IconCompare, IconFilter, IconGauge, IconInspect, IconLock, IconSearch, IconWarn, IconZap, IconCalendar, IconFuel, IconInfo, IconShield, IconBack, IconChevron } from '@/components/icons';
import { useRef } from 'react';
import type React from 'react';

const CATS: CarCategory[] = ['', 'new', 'used', 'ev', 'hybrid', 'commercial'];
type F = { brand: string; model: string; minYear: string; maxPrice: string; maxMileage: string; fuel: string; minBattery: string; drive: string; body: string; accident: '' | 'none' | 'no_major'; verifiedOnly: boolean };
const EMPTY: F = { brand: '', model: '', minYear: '', maxPrice: '', maxMileage: '', fuel: '', minBattery: '', drive: '', body: '', accident: '', verifiedOnly: false };

function AutoFilters({ f, setF, brands }: { f: F; setF: (f: F) => void; brands: string[] }) {
  const { t, tk } = useI18n();
  const num = (k: keyof F) => (v: string) => setF({ ...f, [k]: v.replace(/\D/g, '') });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MiniSelect label={t('auto.brand')} value={f.brand} onChange={(v) => setF({ ...f, brand: v })} options={[{ value: '', label: `${t('auto.brand')}: ${t('common.any')}` }, ...brands.map((b) => ({ value: b, label: b }))]} />
      <MiniSelect label={t('auto.fuel')} value={f.fuel} onChange={(v) => setF({ ...f, fuel: v })} options={[{ value: '', label: `${t('auto.fuel')}: ${t('common.any')}` }, ...(['ev', 'hybrid', 'petrol', 'diesel'] as const).map((x) => ({ value: x, label: tk(`fuel.${x}`) }))]} />
      <MiniSelect label={t('auto.body')} value={f.body} onChange={(v) => setF({ ...f, body: v })} options={[{ value: '', label: `${t('auto.body')}: ${t('common.any')}` }, ...(['sedan', 'suv', 'hatch', 'van', 'pickup'] as const).map((x) => ({ value: x, label: tk(`body.${x}`) }))]} />
      <MiniSelect label={t('auto.drive')} value={f.drive} onChange={(v) => setF({ ...f, drive: v })} options={[{ value: '', label: `${t('auto.drive')}: ${t('common.any')}` }, ...(['fwd', 'rwd', 'awd'] as const).map((x) => ({ value: x, label: x.toUpperCase() }))]} />
      <Input label={t('auto.model')} value={f.model} onChange={(v) => setF({ ...f, model: v })} />
      <Input label={t('auto.min_year')} value={f.minYear} onChange={num('minYear')} inputMode="numeric" placeholder="2022" />
      <Input label={t('auto.max_price')} value={f.maxPrice} onChange={num('maxPrice')} inputMode="numeric" prefix="$" />
      <Input label={t('auto.max_mileage')} value={f.maxMileage} onChange={num('maxMileage')} inputMode="numeric" placeholder="50000" />
      <Input label={t('auto.min_battery')} value={f.minBattery} onChange={num('minBattery')} inputMode="numeric" placeholder="60" />
      <MiniSelect label={t('auto.accident')} value={f.accident} onChange={(v) => setF({ ...f, accident: v })} className="self-end" options={[{ value: '', label: `${t('auto.accident')}: ${t('common.any')}` }, { value: 'none', label: t('auto.no_accident') }, { value: 'no_major', label: t('auto.no_major') }]} />
      <div className="self-end rounded-[16px] bg-paper px-4 py-3 hairline sm:col-span-2"><Checkbox label={t('auto.verified_only')} checked={f.verifiedOnly} onChange={(v) => setF({ ...f, verifiedOnly: v })} /></div>
    </div>
  );
}

function toQuery(cat: CarCategory, f: F, sort: string): CarQuery {
  return {
    category: cat, brand: f.brand || undefined, model: f.model || undefined, minYear: f.minYear ? Number(f.minYear) : undefined, maxPrice: f.maxPrice ? Number(f.maxPrice) : undefined,
    maxMileage: f.maxMileage ? Number(f.maxMileage) : undefined, fuel: (f.fuel || '') as CarQuery['fuel'], minBattery: f.minBattery ? Number(f.minBattery) : undefined,
    drive: (f.drive || '') as CarQuery['drive'], body: (f.body || '') as CarQuery['body'], noAccident: f.accident === 'none', noMajorAccident: f.accident === 'no_major', verifiedOnly: f.verifiedOnly,
    sort: (sort || 'score') as CarQuery['sort'],
  };
}

export function AutoPage() {
  const { t, tk } = useI18n();
  usePageTitle(t('nav.auto'), t('meta.auto'));
  const { query } = useLocation();
  const [cat, setCat] = useQueryParam('category');
  const [f, setF] = useState<F>({ ...EMPTY, verifiedOnly: query.get('verified') === '1' });
  const [sort, setSort] = useState('score');
  const [sheet, setSheet] = useState(false);
  const [ai, setAi] = useState('');
  const df = useDebounced(f, 300);
  const cmp = useCompare('car');
  const brands = useQuery(() => vehicleService.brands(), []);
  const list = useQuery(() => vehicleService.list(toQuery(cat as CarCategory, df, sort)), [cat, df, sort]);
  const active = Object.entries(f).filter(([k, v]) => v && v !== EMPTY[k as keyof F]).length;
  const featured = (list.data?.cars || []).filter((c) => isVerified(c, list.data!.inspections)).slice(0, 8);
  const railRef = useRef<HTMLDivElement | null>(null);
  const chips: { key: string; label: string; on: boolean; go: () => void }[] = [
    { key: 'all', label: t('common.all'), on: !cat && !f.verifiedOnly, go: () => { setCat(''); setF({ ...f, verifiedOnly: false }); } },
    { key: 'verified_used', label: t('auto.cat.verified_used'), on: cat === 'used' && f.verifiedOnly, go: () => { setCat('used'); setF({ ...f, verifiedOnly: true }); } },
    ...(['new', 'ev', 'hybrid', 'commercial'] as const).map((c) => ({ key: c, label: t(`auto.cat.${c}`), on: cat === c && !f.verifiedOnly, go: () => { setCat(c); setF({ ...f, verifiedOnly: false }); } })),
  ];
  return (
    <div>
      <section className="relative -mx-4 -mt-4 overflow-hidden md:-mx-8 md:-mt-6 lg:mx-0 lg:mt-0 lg:rounded-[32px]">
        <Img src={asset('img/hero/auto-hero.webp')} alt={t('auto.hero_alt')} eager className="absolute inset-0 bg-[#0e0e0f]" imgClassName="object-cover object-[60%_50%]" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0e0e0f] via-[#0e0e0f]/70 to-transparent" aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e0f] via-transparent to-transparent" aria-hidden />
        <div className="relative px-5 pb-8 pt-16 text-white md:px-12 md:pb-12 md:pt-28">
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.18em] text-white/60"><VerifiedSeal className="size-6" onDark />CARGO ONE AUTO</div>
          <h1 className="display mt-5 max-w-2xl text-[34px] uppercase md:text-[60px]">{t('auto.hero')}</h1>
          <p className="mt-3 max-w-xl text-[15px] text-white/65">{t('auto.hero_sub')}</p>
          <form className="mt-7 flex max-w-2xl gap-2 rounded-full bg-white/95 p-1.5 pl-5 text-[#111] shadow-[var(--shadow-float)] backdrop-blur" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); navigate(`/auto/search?q=${encodeURIComponent(ai || t('auto.search_example'))}`); }}>
            <IconAI className="size-5 shrink-0 self-center text-[#6f6f6a]" aria-hidden />
            <input value={ai} onChange={(e: { target: HTMLInputElement }) => setAi(e.target.value)} placeholder={t('auto.ai_placeholder')} aria-label={t('auto.ai_placeholder')} className="h-12 min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-[#9a9a95]" />
            <Button type="submit" variant="accent" iconRight={IconArrow}><span className="hidden sm:inline">{t('auto.ai_search')}</span></Button>
          </form>
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-white/60"><span className="inline-flex items-center gap-1.5"><IconInspect className="size-4 text-accent-2" aria-hidden />{t('auto.promise_inspect')}</span><span className="inline-flex items-center gap-1.5"><IconCheck className="size-4 text-accent-2" aria-hidden />{t('auto.promise_price')}</span><span className="inline-flex items-center gap-1.5"><IconLock className="size-4 text-accent-2" aria-hidden />{t('auto.promise_deposit')}</span></div>
        </div>
      </section>
      <nav aria-label={t('nav.auto')} className="rail -mx-4 mt-8 gap-2 px-4 md:mx-0 md:px-0">
        {chips.map((c) => <button key={c.key} type="button" aria-pressed={c.on} onClick={c.go} className={cn('press h-11 whitespace-nowrap rounded-full px-5 text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors', c.on ? 'bg-ink text-on-ink' : 'bg-paper hairline hover:bg-mist-2')}>{c.label}</button>)}
      </nav>
      {featured.length && !active ? (
        <section className="mt-10">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div><div className="eyebrow mb-1.5">{t('auto.featured_eyebrow')}</div><h2 className="text-[20px] font-semibold uppercase tracking-[0.02em] md:text-[22px]">{t('home.sec.verified_auto')}</h2></div>
            <div className="hidden gap-1.5 md:flex">
              <button type="button" aria-label={t('common.previous')} onClick={() => railRef.current?.scrollBy({ left: -400, behavior: 'smooth' })} className="press grid size-10 place-items-center rounded-full bg-paper hairline"><IconBack className="size-4" aria-hidden /></button>
              <button type="button" aria-label={t('common.next')} onClick={() => railRef.current?.scrollBy({ left: 400, behavior: 'smooth' })} className="press grid size-10 place-items-center rounded-full bg-paper hairline"><IconChevron className="size-4" aria-hidden /></button>
            </div>
          </div>
          <div ref={railRef} className="rail -mx-4 gap-4 px-4 pb-2 md:mx-0 md:px-0">{featured.map((c) => <div key={c.id} className="w-[300px] md:w-[400px]"><CarCard car={c} inspection={list.data!.inspections.find((i) => i.id === c.inspectionId)} onCompare={() => cmp.toggle(c.id)} comparing={cmp.has(c.id)} /></div>)}</div>
        </section>
      ) : null}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[20px] font-semibold uppercase tracking-[0.02em]">{t('auto.all_cars')} <span className="num ml-1 text-[14px] font-medium text-muted">{list.data?.cars.length ?? ''}</span></h2>
        <div className="flex gap-2">
          <MiniSelect label={t('shop.sort')} value={sort} onChange={setSort} options={[{ value: 'score', label: t('auto.sort_score') }, { value: 'price_asc', label: t('sort.price_asc') }, { value: 'price_desc', label: t('sort.price_desc') }, { value: 'year', label: t('auto.sort_year') }, { value: 'mileage', label: t('auto.sort_mileage') }]} />
          <Button size="sm" variant="secondary" icon={IconFilter} onClick={() => setSheet(true)} className="lg:hidden">{t('shop.filters')}{active ? ` · ${active}` : ''}</Button>
        </div>
      </div>
      <div className="mt-5 hidden rounded-[24px] bg-paper p-5 lg:block"><AutoFilters f={f} setF={setF} brands={brands.data || []} />{active ? <Button variant="link" size="sm" className="mt-3" onClick={() => setF(EMPTY)}>{t('shop.reset_filters')}</Button> : null}</div>
      <div className="mt-8">
        {list.loading ? <SkeletonGrid count={6} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3" /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} />
          : !list.data?.cars.length ? <EmptyState title={t('auto.empty')} body={t('auto.empty_body')} action={<Button variant="secondary" onClick={() => setF(EMPTY)}>{t('shop.reset_filters')}</Button>} />
          : <div className="stagger grid gap-5 md:grid-cols-2 xl:grid-cols-3">{list.data.cars.map((c) => <CarCard key={c.id} car={c} inspection={list.data!.inspections.find((i) => i.id === c.inspectionId)} onCompare={() => cmp.toggle(c.id)} comparing={cmp.has(c.id)} />)}</div>}
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('shop.filters')} footer={<><Button variant="secondary" full onClick={() => setF(EMPTY)}>{t('shop.reset_filters')}</Button><Button full onClick={() => setSheet(false)}>{t('shop.show_n', { n: list.data?.cars.length ?? 0 })}</Button></>}>
        <AutoFilters f={f} setF={setF} brands={brands.data || []} />
      </Sheet>
      {cmp.ids.length ? (
        <div className="animate-rise fixed inset-x-3 bottom-[96px] z-30 mx-auto flex max-w-xl items-center gap-3 rounded-full bg-white p-2 pl-5 text-[#111] shadow-[var(--shadow-float)] lg:bottom-6 lg:left-[280px]">
          <IconCompare className="size-4 text-accent" aria-hidden /><span className="flex-1 text-sm font-medium">{t('compare.bar', { n: cmp.ids.length })}</span>
          <button type="button" onClick={cmp.clear} className="px-3 py-2 text-[13px] text-[#6f6f6a] hover:text-[#111]">{t('common.clear')}</button>
          <Button size="sm" to="/auto/compare" className="bg-[#111]! text-white!">{t('compare.open')}</Button>
        </div>
      ) : null}
      <p className="mt-10 text-[12px] text-faint">{tk('auto.data_note')}</p>
    </div>
  );
}

export function ReserveModal({ car, open, onClose }: { car: Car; open: boolean; onClose: () => void }) {
  const { t, tk, money } = useI18n();
  const toast = useToast();
  const [methodId, setMethodId] = useState('');
  const [agree, setAgree] = useState(false);
  const reserve = useAction(vehicleService.reserve);
  const [failed, setFailed] = useState('');
  return (
    <Modal open={open} onClose={onClose} title={t('auto.reserve_title')} description={`${car.brand} ${car.model} · ${car.year}`}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button variant="metal" disabled={!methodId || !agree} loading={reserve.pending} icon={IconLock} onClick={async () => {
        setFailed('');
        const r = await reserve.run(car.id, methodId);
        if (r?.payment.status === 'succeeded') { toast(t('auto.reserved_toast')); onClose(); navigate(`/auto/reservations/${r.reservation.id}`); }
        else if (r) setFailed(r.payment.failureReason || t('checkout.payment_failed'));
      }}>{t('auto.pay_deposit', { amount: money(1000, 'USD') })}</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-muted">{t('auto.reserve_body')}</p>
        <PaymentMethodPicker value={methodId} onChange={setMethodId} allow={['card', 'wallet', 'partner']} />
        <Checkbox label={t('auto.reserve_agree')} description={t('auto.reserve_agree_desc')} checked={agree} onChange={setAgree} />
        {failed ? <Notice tone="bad">{failed}</Notice> : null}
        {reserve.error ? <Notice tone="bad">{tk(`err.${(reserve.error as { code?: string }).code || 'server_error'}`)}</Notice> : null}
      </div>
    </Modal>
  );
}

export function CarPage() {
  const { id } = useParams();
  const { t, tk, num, money } = useI18n();
  const q = useQuery(() => vehicleService.get(id), [id]);
  const { user } = useAuth();
  const [view, setView] = useState(1);
  const [reserve, setReserve] = useState(false);
  const cmp = useCompare('car');
  usePageTitle(q.data ? `${q.data.car.brand} ${q.data.car.model} ${q.data.car.year}` : t('nav.auto'));
  if (q.loading) return <SkeletonRows count={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  const { car, inspection, verified } = q.data;
  const reservedByOther = !!car.reservedBy && car.reservedBy !== user?.id;
  const canReserve = !reservedByOther && (car.condition === 'new' || verified);
  const specs: [string, string | number][] = [
    [t('auto.year'), car.year], [t('auto.mileage'), `${num(car.mileageKm)} km`], [t('auto.fuel'), tk(`fuel.${car.fuel}`)], [t('auto.body'), tk(`body.${car.body}`)],
    [t('auto.drive'), car.drive.toUpperCase()], [t('auto.color'), car.color], [t('auto.owners'), car.owners || '—'], [t('auto.accident'), tk(`accident.${car.accident}`)],
    ...(car.batteryKwh ? [[t('auto.battery'), `${car.batteryKwh} kWh`] as [string, string], [t('auto.range'), `${car.rangeKm} km`] as [string, string], [t('auto.battery_health'), `${car.batteryHealth}%`] as [string, string]] : []),
    [t('auto.location'), `${car.location}, CN`], ['VIN', car.vin],
  ];
  const reserveClick = () => (user ? setReserve(true) : navigate(`/login?next=/auto/${car.id}`));
  return (
    <div className="pb-28 md:pb-0">
      <nav className="mb-5 flex items-center gap-1.5 text-[13px] text-muted" aria-label={t('common.breadcrumb')}><Link to="/auto" className="hover:text-ink">{t('nav.auto')}</Link><IconChevron className="size-3.5" aria-hidden /><span>{car.brand}</span></nav>
      <section className="grid items-start gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div>
          <div className="relative overflow-hidden rounded-[28px] bg-[#0e0e0f]">
            <CarVisual key={car.images[view]?.id} car={car} image={car.images[view]} rounded={false} className="aspect-[16/10] w-full" />
            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              {verified ? <VerifiedBadge size="lg" onDark label={t('badge.cargo_verified')} /> : car.condition === 'new' ? <Badge tone="glass">{t('auto.new_factory')}</Badge> : <Badge tone={car.verification === 'rejected' ? 'bad' : 'warn'} icon={IconWarn} className="bg-white/90">{tk(`verif.${car.verification}`)}</Badge>}
            </div>
            {verified && inspection ? <div className="absolute bottom-4 right-4 hidden items-center gap-3 rounded-full bg-black/55 py-1.5 pl-1.5 pr-4 text-white backdrop-blur md:flex"><span className="num grid size-10 place-items-center rounded-full bg-white text-[14px] font-bold text-[#111]">{inspection.score}</span><span className="text-[12px] font-semibold uppercase tracking-[0.1em]">{t('insp.score')}</span></div> : null}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2" role="tablist" aria-label={t('product.gallery')}>
            {car.images.map((im, i) => <button key={im.id} type="button" role="tab" aria-selected={view === i} aria-label={tk(`auto.view.${im.view}`)} onClick={() => setView(i)} className={cn('press overflow-hidden rounded-[16px] transition', view === i ? 'ring-2 ring-ink ring-offset-2 ring-offset-mist' : 'opacity-55 hover:opacity-100')}><CarVisual car={car} image={im} className="aspect-[16/10] w-full" rounded={false} /></button>)}
          </div>
          <p className="mt-2 text-[11.5px] text-faint">{t('auto.media_note', { photos: inspection?.photos ?? 0 })}</p>
        </div>
        <div className="lg:sticky lg:top-24">
          <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted">{car.brand}</div>
          <h1 className="headline mt-1 text-[32px] md:text-[42px]">{car.model}</h1>
          {car.reservedBy ? <div className="mt-2"><Badge tone="info">{car.reservedBy === user?.id ? t('auto.reserved_by_you') : t('auto.reserved')}</Badge></div> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {[[IconCalendar, String(car.year)], [IconGauge, `${num(car.mileageKm)} km`], [car.fuel === 'ev' ? IconBattery : IconFuel, tk(`fuel.${car.fuel}`)], ...(car.batteryKwh ? [[IconZap, `${car.batteryKwh} kWh · ${car.rangeKm} km`]] : [])].map(([I, v], i) => { const Ic = I as typeof IconCalendar; return <span key={i} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-paper px-3.5 text-[13px] font-medium hairline"><Ic className="size-4 text-muted" aria-hidden /><span className="num">{v as string}</span></span>; })}
          </div>
          <div className="mt-6"><CarCostBlock car={car} /></div>
          <div className="mt-4 hidden gap-2 md:flex">
            <Button size="lg" variant="accent" className="flex-1" icon={IconLock} disabled={!canReserve} onClick={reserveClick}>{t('auto.reserve')}</Button>
            <Button size="lg" variant="secondary" icon={IconCompare} onClick={() => cmp.toggle(car.id)}>{cmp.has(car.id) ? t('compare.added') : t('compare.action')}</Button>
            <FavoriteButton kind="car" refId={car.id} label={`${car.brand} ${car.model}`} className="size-14! bg-paper! text-ink! hairline" />
          </div>
          {!canReserve ? <div className="mt-3"><Notice tone="warn">{reservedByOther ? t('auto.reserved_other') : t('auto.cannot_reserve')}</Notice></div> : null}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="insp-title">
        {inspection ? <InspectionReport inspection={inspection} car={car} /> : (
          <div className="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:p-8">
            <span className="grid size-14 shrink-0 place-items-center rounded-full bg-mist-2"><IconInspect className="size-6 text-muted" aria-hidden /></span>
            <div>
              <h2 id="insp-title" className="text-[18px] font-semibold">{car.condition === 'new' ? t('auto.new_no_inspection') : car.verification === 'pending' ? t('auto.inspection_scheduled') : t('auto.no_inspection')}</h2>
              <p className="mt-1 text-sm text-muted">{car.condition === 'new' ? t('auto.new_no_inspection_body') : t('auto.no_inspection_body')}</p>
            </div>
          </div>
        )}
      </section>

      <section className="mt-12">
        <SectionTitle title={t('auto.flow_title')} sub={t('auto.flow_sub')} />
        <div className="card overflow-x-auto px-5 py-6 md:px-8"><div className="min-w-[640px]"><CargoLine nodes={AUTO_FLOW.map((s) => ({ label: tk(`auto.step.${s}`) }))} progress={0} animate={false} /></div></div>
      </section>

      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle title={t('auto.specs')} />
          <dl className="card divide-y divide-line px-5">{specs.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-3.5 text-sm"><dt className="text-muted">{k}</dt><dd className="num break-all text-right font-medium">{v}</dd></div>)}</dl>
        </div>
        <div>
          <SectionTitle title={t('auto.why_verified')} />
          <ul className="space-y-2.5">
            {(['inspect', 'price', 'deposit'] as const).map((k, i) => <li key={k} className="card flex items-start gap-4 p-5"><span className="grid size-10 shrink-0 place-items-center rounded-full accent-grad text-white">{[<IconShield key="a" className="size-5" aria-hidden />, <IconCheck key="b" className="size-5" aria-hidden />, <IconLock key="c" className="size-5" aria-hidden />][i]}</span><div className="pt-2 text-[14px] font-medium">{t(`auto.promise_${k}`)}</div></li>)}
          </ul>
        </div>
      </section>

      <div className="fixed inset-x-3 bottom-[96px] z-30 mx-auto flex max-w-[460px] items-center gap-2 rounded-[26px] bg-paper p-2 shadow-[var(--shadow-float)] ring-1 ring-line md:hidden">
        <div className="min-w-0 flex-1 pl-3"><div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{t('auto.cost.total')}</div><div className="price truncate text-[17px]">{money(carCost(car, db().content.settings).totalUSD, 'USD')}</div></div>
        <Button variant="accent" icon={IconLock} disabled={!canReserve} onClick={reserveClick}>{t('auto.reserve')}</Button>
      </div>
      <ReserveModal car={car} open={reserve} onClose={() => setReserve(false)} />
    </div>
  );
}

function ParsedChip({ children, icon: Icon }: { children: React.ReactNode; icon?: typeof IconCalendar }) {
  return <span className="inline-flex h-11 items-center gap-2 rounded-full bg-paper px-4 text-[13px] font-bold uppercase tracking-[0.06em] hairline">{Icon ? <Icon className="size-4 text-accent" aria-hidden /> : null}{children}</span>;
}

export function AutoSearchPage() {
  const { t, tk, money, num, date } = useI18n();
  usePageTitle(t('auto.ai_search'), t('meta.auto_search'));
  const { query } = useLocation();
  const [input, setInput] = useState(query.get('q') || '');
  const [term, setTerm] = useState(query.get('q') || '');
  const cmp = useCompare('car');
  const { user } = useAuth();
  const [reserveCar, setReserveCar] = useState<Car | null>(null);
  const res = useQuery(() => vehicleService.aiSearch(term), [term], { enabled: term.trim().length >= 3, live: false });
  useEffect(() => { const v = query.get('q') || ''; if (v !== term) { setTerm(v); setInput(v); } }, [query.get('q')]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = () => { if (input.trim().length >= 3) navigate(`/auto/search?q=${encodeURIComponent(input.trim())}`, { replace: true }); };
  const s = db().content.settings;
  const insp = (c: Car): CarInspection | undefined => res.data?.inspections.find((i) => i.id === c.inspectionId);
  return (
    <div>
      <PageHeader display back={{ to: '/auto', label: t('nav.auto') }} eyebrow="CARGO ONE AUTO" title={t('auto.ai_search')} subtitle={t('auto.ai_search_sub')} />
      <form className="mb-6 rounded-[28px] bg-paper p-2.5 shadow-[var(--shadow-lift)] ring-1 ring-line" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); submit(); }}>
        <label htmlFor="auto-ai" className="sr-only">{t('auto.ai_placeholder')}</label>
        <div className="flex items-end gap-2">
          <span className="mb-2 ml-2 grid size-10 shrink-0 place-items-center rounded-full accent-grad text-white"><IconAI className="size-5" aria-hidden /></span>
          <textarea id="auto-ai" value={input} onChange={(e: { target: HTMLTextAreaElement }) => setInput(e.target.value)} rows={2} placeholder={t('auto.search_example')} onKeyDown={(e: { key: string; shiftKey: boolean; preventDefault(): void }) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            className="min-h-[60px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[16px] leading-relaxed text-ink outline-none placeholder:text-faint md:text-[18px]" />
          <Button variant="accent" size="lg" icon={IconSearch} type="submit" disabled={input.trim().length < 3}><span className="hidden sm:inline">{t('common.search')}</span></Button>
        </div>
      </form>
      {!term ? (
        <div className="flex flex-wrap gap-2">{[t('auto.search_example'), t('auto.search_example_2'), t('auto.search_example_3')].map((e) => <button key={e} type="button" onClick={() => navigate(`/auto/search?q=${encodeURIComponent(e)}`, { replace: true })} className="press rounded-full bg-paper px-4 py-2.5 text-left text-[13px] hairline hover:bg-mist-2">“{e}”</button>)}</div>
      ) : res.loading ? <SkeletonRows count={4} /> : res.error ? <ErrorState error={res.error} onRetry={res.reload} /> : res.data ? (
        <div>
          <div className="mb-8">
            <div className="eyebrow mb-3 flex items-center gap-2"><span className="size-1.5 rounded-full bg-accent" aria-hidden />{t('auto.understood')}</div>
            <div className="stagger flex flex-wrap gap-2">
              {res.data.parsed.understood.length ? [
                res.data.parsed.verifiedOnly ? <span key="v" className="inline-flex h-11 items-center gap-2 rounded-full bg-ink pl-1.5 pr-4 text-[13px] font-bold uppercase tracking-[0.06em] text-on-ink"><VerifiedSeal className="size-8" onDark />{t('badge.cargo_verified')}</span> : null,
                res.data.parsed.brand ? <ParsedChip key="b">{res.data.parsed.brand}</ParsedChip> : null,
                res.data.parsed.fuel ? <ParsedChip key="f" icon={res.data.parsed.fuel === 'ev' ? IconBattery : IconFuel}>{tk(`fuel.${res.data.parsed.fuel}`)}</ParsedChip> : null,
                res.data.parsed.minYear ? <ParsedChip key="y" icon={IconCalendar}>{res.data.parsed.minYear}+</ParsedChip> : null,
                res.data.parsed.maxMileage != null ? <ParsedChip key="m" icon={IconGauge}>&lt; {num(res.data.parsed.maxMileage)} km</ParsedChip> : null,
                res.data.parsed.maxPrice ? <ParsedChip key="p">&lt; {money(res.data.parsed.maxPrice, 'USD')}</ParsedChip> : null,
                res.data.parsed.noMajorAccident ? <ParsedChip key="na" icon={IconShield}>{t('auto.no_major')}</ParsedChip> : null,
                res.data.parsed.noAccident ? <ParsedChip key="nn" icon={IconShield}>{t('auto.no_accident')}</ParsedChip> : null,
                res.data.parsed.body ? <ParsedChip key="bd">{tk(`body.${res.data.parsed.body}`)}</ParsedChip> : null,
                res.data.parsed.drive ? <ParsedChip key="d">{res.data.parsed.drive.toUpperCase()}</ParsedChip> : null,
                res.data.parsed.category ? <ParsedChip key="c">{t(`auto.cat.${res.data.parsed.category as 'new' | 'used'}`)}</ParsedChip> : null,
              ] : <span className="text-sm text-muted">{t('auto.nothing_parsed')}</span>}
            </div>
            {res.data.relaxed ? <p className="mt-3 text-[13px] text-warn">{t('auto.relaxed')}</p> : null}
          </div>
          {!res.data.cars.length ? <EmptyState title={t('auto.empty')} body={t('auto.ai_empty_body')} action={<Button to="/auto">{t('auto.browse_all')}</Button>} /> : (
            <ul className="space-y-3">
              {res.data.cars.map((c, i) => {
                const cost = carCost(c, s); const ins = insp(c); const verified = isVerified(c, res.data!.inspections);
                return (
                  <li key={c.id} className="animate-rise card grid gap-5 overflow-hidden p-3 md:grid-cols-[320px_1fr_auto] md:p-3 md:pr-6" style={{ animationDelay: `${i * 80}ms` }}>
                    <Link to={`/auto/${c.id}`} className="block overflow-hidden rounded-[20px]"><CarVisual car={c} image={c.images[0]} rounded={false} className="aspect-[16/10] w-full" /></Link>
                    <div className="px-2 py-1 md:px-0 md:py-3">
                      <div className="flex flex-wrap items-center gap-2">{verified ? <VerifiedBadge size="sm" label={t('badge.cargo_verified')} /> : c.condition === 'new' ? <Badge tone="dark">{t('auto.new_factory')}</Badge> : <Badge tone="warn">{tk(`verif.${c.verification}`)}</Badge>}{verified && ins ? <span className="num text-[12px]">{t('insp.score')} <b>{ins.score}</b>/100</span> : null}</div>
                      <Link to={`/auto/${c.id}`} className="mt-2 block text-[20px] font-semibold tracking-tight hover:underline">{c.brand} {c.model}</Link>
                      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-3">
                        <div><dt className="text-muted">{t('auto.year')}</dt><dd className="num">{c.year}</dd></div>
                        <div><dt className="text-muted">{t('auto.mileage')}</dt><dd className="num">{num(c.mileageKm)} km</dd></div>
                        <div><dt className="text-muted">{t('auto.battery')}</dt><dd className="num">{c.batteryKwh ? `${c.batteryKwh} kWh` : '—'}</dd></div>
                        <div><dt className="text-muted">{t('auto.cost.vehicle')}</dt><dd className="num">{money(c.priceUSD, 'USD')}</dd></div>
                        <div><dt className="text-muted">{t('auto.cost.cargo')}</dt><dd className="num">{money(cost.cargoUSD, 'USD')}</dd></div>
                        <div><dt className="text-muted">{t('auto.est_delivery')}</dt><dd>{date(new Date(Date.now() + 28 * 86_400_000).toISOString())}</dd></div>
                      </dl>
                    </div>
                    <div className="flex flex-col justify-between gap-3 px-2 pb-2 md:items-end md:px-0 md:py-3">
                      <div className="md:text-right"><div className="text-[11px] uppercase tracking-[0.08em] text-muted">{t('auto.cost.total')}</div><div className="price text-[26px]">{money(cost.totalUSD, 'USD')}</div></div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" to={`/auto/${c.id}`}>{t('find.view')}</Button>
                        <Button size="sm" variant={cmp.has(c.id) ? 'primary' : 'secondary'} icon={IconCompare} onClick={() => cmp.toggle(c.id)}>{t('compare.action')}</Button>
                        <Button size="sm" variant="accent" disabled={!(verified || c.condition === 'new') || (!!c.reservedBy && c.reservedBy !== user?.id)} onClick={() => (user ? setReserveCar(c) : navigate(`/login?next=${encodeURIComponent(`/auto/search?q=${term}`)}`))}>{t('auto.reserve')}</Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {cmp.ids.length >= 2 ? <Button className="mt-6" to="/auto/compare" icon={IconCompare}>{t('compare.open')} ({cmp.ids.length})</Button> : null}
          <div className="mt-6"><Notice tone="neutral" icon={IconInfo}>{t('auto.ai_mock_note')}</Notice></div>
        </div>
      ) : null}
      {reserveCar ? <ReserveModal car={reserveCar} open onClose={() => setReserveCar(null)} /> : null}
    </div>
  );
}

export function AutoComparePage() {
  const { t } = useI18n();
  usePageTitle(t('compare.title'));
  const cmp = useCompare('car');
  return (
    <div>
      <PageHeader display title={t('compare.title')} back={{ to: '/auto', label: t('nav.auto') }} actions={cmp.ids.length ? <Button variant="secondary" onClick={cmp.clear}>{t('common.clear')}</Button> : null} />
      {cmp.ids.length ? <div className="card p-5"><CarCompare ids={cmp.ids} onRemove={cmp.toggle} /></div> : <EmptyState icon={IconCompare} title={t('compare.empty')} body={t('compare.empty_body_cars')} action={<Button to="/auto">{t('nav.auto')}</Button>} />}
    </div>
  );
}

export function ReservationPage() {
  const { id } = useParams();
  const { t, tk, money, date } = useI18n();
  const toast = useToast();
  const q = useQuery(() => vehicleService.reservation(id), [id]);
  const adv = useAction(vehicleService.advanceReservation);
  usePageTitle(q.data?.reservation.number || t('auto.reservation'));
  if (q.loading) return <SkeletonRows count={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  const { reservation: r, car, shipment } = q.data;
  const idx = AUTO_FLOW.indexOf(r.step);
  return (
    <div>
      <PageHeader back={{ to: '/profile?section=cars', label: t('profile.cars') }} eyebrow={t('auto.reservation')} title={<span className="mono">{r.number}</span>} subtitle={`${car.brand} ${car.model} · ${car.year}`}
        actions={<Badge tone={r.step === 'delivery' ? 'ok' : 'dark'}>{tk(`auto.step.${r.step}`)}</Badge>} />
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <section className="card p-6 md:p-8">
          <ol className="stagger">
            {AUTO_FLOW.map((s, i) => {
              const h = r.history.filter((x) => x.step === s).pop();
              return (
                <li key={s} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < AUTO_FLOW.length - 1 ? <span className={cn('absolute left-[11px] top-6 h-[calc(100%-14px)] w-[2px] rounded-full', i < idx ? 'bg-ink' : 'bg-mist-3')} aria-hidden /> : null}
                  <span className={cn('relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold', i < idx ? 'bg-ink text-on-ink' : i === idx ? 'accent-grad text-white animate-pulse-ring' : 'bg-paper text-faint ring-2 ring-mist-3')}>{i < idx ? <IconCheck className="size-3.5" aria-hidden /> : i + 1}</span>
                  <div className="flex-1"><div className="flex justify-between gap-3"><span className={cn('text-sm', i <= idx ? 'font-semibold' : 'text-faint')}>{tk(`auto.step.${s}`)}</span>{h ? <span className="num text-[12px] text-muted">{date(h.at, true)}</span> : null}</div><p className={cn('text-[12.5px]', i <= idx ? 'text-muted' : 'text-faint')}>{tk(`auto.step.${s}.desc`)}</p></div>
                </li>
              );
            })}
          </ol>
        </section>
        <aside className="space-y-4">
          <Link to={`/auto/${car.id}`} className="card lift block overflow-hidden"><CarVisual car={car} image={car.images[0]} className="aspect-[16/10] w-full" rounded={false} /><div className="p-4"><div className="font-semibold">{car.brand} {car.model}</div><div className="text-[12px] text-muted">{t('auto.deposit_paid', { amount: money(r.depositUSD, 'USD') })}</div></div></Link>
          {shipment ? <div className="card p-5"><div className="eyebrow mb-2">{t('cargo.tracking')}</div><div className="num font-semibold">{shipment.trackingNumber}</div><div className="my-4"><ShipmentProgress stage={shipment.stage} /></div><Button size="sm" variant="secondary" to={`/track?q=${r.number}`}>{t('orders.track')}</Button></div> : null}
          <CarCostBlock car={car} />
          {r.step !== 'delivery' ? (
            <div className="rounded-[22px] border-[1.5px] border-dashed border-mist-3 p-5">
              <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold"><IconZap className="size-4" aria-hidden />{t('demo.controls')}</div>
              <p className="mb-3 text-[12px] text-muted">{t('demo.advance_auto_body')}</p>
              <Button size="sm" variant="secondary" loading={adv.pending} onClick={async () => { const x = await adv.run(r.id); if (x) toast(t('demo.advanced')); }}>{t('demo.advance')}</Button>
            </div>
          ) : null}
          <Button variant="secondary" full to={`/support?category=vehicle&ref=${r.number}`}>{t('orders.contact_support')}</Button>
        </aside>
      </div>
    </div>
  );
}
