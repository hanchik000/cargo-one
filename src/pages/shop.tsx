import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate, useLocation, useParams, useQueryParam } from '@/lib/router';
import { useDebounced, useQuery } from '@/lib/hooks';
import { productService } from '@/services/productService';
import type { ProductSort } from '@/services/productService';
import { favoriteService } from '@/services/accountServices';
import { db } from '@/services/db';
import { useAuth } from '@/state/auth';
import { useCart, useCompare, useRecentlyViewed } from '@/state/cart';
import { estimateProduct, deliveryWindow } from '@/lib/pricing';
import type { CategoryId, Product, Supplier } from '@/lib/types';
import { canOrder, leadKnown, presentedPrice, pricingStatus } from '@/lib/catalog';
import {
  Badge, Button, Checkbox, Chip, cn, Disclosure, EmptyState, ErrorState, IconButton, Input, KV, MiniSelect, Modal, PageHeader, QtyStepper, ScoreBadge, ScoreBar, SectionTitle, Sheet,
  Notice, Skeleton, SkeletonGrid, Tabs, useToast, VerifiedBadge,
} from '@/components/ui';
import { CargoLine, FavoriteButton, PriceBlock, ProductCard, ProductCompare, TotalBlock, useUserVip } from '@/components/commerce';
import { ProductVisual, SupplierLogo } from '@/components/visuals';
import { usePageTitle } from '@/components/shell';
import { IconScanFace, IconBookmark, IconCart, IconClock, IconCompare, IconFilter, IconSearch, IconStar, IconX, IconArrow, IconDrop, IconZap, IconShield, IconCargo, IconFactory, IconFile, IconCopy, IconSort, IconChevron } from '@/components/icons';
import { namedIcon } from '@/components/icons';

const CATS: CategoryId[] = ['electronics', 'fashion', 'home', 'beauty', 'kids', 'auto', 'tools', 'industrial', 'business'];

interface Filters { minPrice: string; maxPrice: string; minScore: string; inStock: boolean; verifiedOnly: boolean; fast: boolean; drops: boolean; ar: boolean }
const EMPTY_FILTERS: Filters = { minPrice: '', maxPrice: '', minScore: '', inStock: false, verifiedOnly: false, fast: false, drops: false, ar: false };

function FilterPanel({ f, setF }: { f: Filters; setF: (f: Filters) => void }) {
  const { t } = useI18n();
  const priceErr = f.minPrice && f.maxPrice && Number(f.minPrice) > Number(f.maxPrice) ? t('shop.price_range_error') : null;
  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="eyebrow mb-3">{t('shop.price_range')}</legend>
        <div className="grid grid-cols-2 gap-2">
          <Input label={t('shop.min')} value={f.minPrice} onChange={(v) => setF({ ...f, minPrice: v.replace(/\D/g, '') })} inputMode="numeric" prefix="¥" />
          <Input label={t('shop.max')} value={f.maxPrice} onChange={(v) => setF({ ...f, maxPrice: v.replace(/\D/g, '') })} inputMode="numeric" prefix="¥" error={priceErr} />
        </div>
      </fieldset>
      <fieldset>
        <legend className="eyebrow mb-3">{t('score.supplier')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {['', '80', '85', '90'].map((s) => <Chip size="sm" key={s} active={f.minScore === s} onClick={() => setF({ ...f, minScore: s })}>{s ? `${s}+` : t('common.any')}</Chip>)}
        </div>
      </fieldset>
      <fieldset className="space-y-3.5">
        <legend className="eyebrow mb-3">{t('shop.availability')}</legend>
        <Checkbox label={t('shop.in_stock')} checked={f.inStock} onChange={(v) => setF({ ...f, inStock: v })} />
        <Checkbox label={t('shop.verified_only')} checked={f.verifiedOnly} onChange={(v) => setF({ ...f, verifiedOnly: v })} />
        <Checkbox label={t('shop.fast_dispatch')} description={t('shop.fast_dispatch_desc')} checked={f.fast} onChange={(v) => setF({ ...f, fast: v })} />
        <Checkbox label={t('shop.price_drops')} checked={f.drops} onChange={(v) => setF({ ...f, drops: v })} />
        <Checkbox label={t('tryon.filter')} description={t('tryon.filter_desc')} checked={f.ar} onChange={(v) => setF({ ...f, ar: v })} />
      </fieldset>
    </div>
  );
}

export function CompareBar() {
  const { t } = useI18n();
  const cmp = useCompare('product');
  if (!cmp.ids.length) return null;
  return (
    <div className="animate-rise fixed inset-x-3 bottom-[96px] z-30 mx-auto flex max-w-xl items-center gap-3 rounded-full bg-[#111] p-2 pl-5 text-white shadow-[var(--shadow-float)] lg:bottom-6 lg:left-[280px]">
      <IconCompare className="size-4 text-accent-2" aria-hidden />
      <span className="flex-1 text-sm font-medium">{t('compare.bar', { n: cmp.ids.length })}</span>
      <button type="button" onClick={cmp.clear} className="rounded-full px-3 py-2 text-[13px] text-white/60 hover:text-white">{t('common.clear')}</button>
      <Button variant="inverse" size="sm" to="/compare">{t('compare.open')}</Button>
    </div>
  );
}

function CategoryRail({ category, setCategory }: { category: string; setCategory: (c: string) => void }) {
  const { t, tk } = useI18n();
  return (
    <nav aria-label={t('shop.category')} className="rail -mx-4 gap-2 px-4 pb-1 md:mx-0 md:px-0">
      <Chip active={!category} onClick={() => setCategory('')}>{t('common.all')}</Chip>
      {CATS.map((c) => {
        const cat = db().categories.find((x) => x.id === c);
        const Icon = namedIcon(cat?.icon || 'Package');
        return (
          <button key={c} type="button" onClick={() => setCategory(c)} aria-pressed={category === c}
            className={cn('press inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full pl-1.5 pr-4 text-[13px] font-semibold transition-colors', category === c ? 'bg-ink text-on-ink' : 'bg-paper hairline hover:bg-mist')}>
            <span className={cn('grid size-7 place-items-center rounded-full', category === c ? 'bg-white/15' : 'bg-mist')}><Icon className="size-3.5" aria-hidden /></span>{tk(`cat.${c}`)}
          </button>
        );
      })}
    </nav>
  );
}

export function ShopPage() {
  const { t, tk, lang } = useI18n();
  const params = useParams();
  const { query } = useLocation();
  const [q, setQ] = useQueryParam('q');
  const [sort, setSort] = useQueryParam('sort');
  const [input, setInput] = useState(q);
  const category = (params.category || '') as CategoryId | '';
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS, drops: query.get('drops') === '1', ar: query.get('ar') === '1' });
  const [pages, setPages] = useState(1);
  const [sheet, setSheet] = useState(false);
  const cmp = useCompare('product');
  const { user } = useAuth();
  const toast = useToast();
  const dFilters = useDebounced(filters, 300);
  useEffect(() => setInput(q), [q]);
  useEffect(() => setPages(1), [q, sort, category, dFilters]);
  usePageTitle(category ? tk(`cat.${category}`) : t('nav.shop'), t('meta.shop'));

  const list = useQuery(() => productService.list({
    q, category, sort: (sort || undefined) as ProductSort | undefined, page: pages, pageSize: 24,
    minPrice: dFilters.minPrice ? Number(dFilters.minPrice) : undefined, maxPrice: dFilters.maxPrice ? Number(dFilters.maxPrice) : undefined,
    minScore: dFilters.minScore ? Number(dFilters.minScore) : undefined, inStock: dFilters.inStock, verifiedOnly: dFilters.verifiedOnly, maxLeadDays: dFilters.fast ? 3 : undefined,
    drops: dFilters.drops, tryOn: dFilters.ar,
  }), [q, sort, category, dFilters, pages, lang], { live: false });

  // Infinite loading: pages are fetched one at a time and appended (server-side pagination).
  const [acc, setAcc] = useState<Product[]>([]);
  useEffect(() => {
    const d = list.data;
    if (!d) return;
    setAcc((prev) => (d.page <= 1 ? d.items : [...prev, ...d.items.filter((x) => !prev.some((y) => y.id === x.id))]));
  }, [list.data]);

  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !list.data?.hasMore) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && !list.loading) setPages((p) => p + 1); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.data?.hasMore, list.loading]);

  const activeCount = Object.entries(filters).filter(([k, v]) => v && v !== EMPTY_FILTERS[k as keyof Filters]).length;
  const setCategory = (c: string) => navigate(`${c ? `/shop/category/${c}` : '/shop'}${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const sortOptions: { value: string; label: string }[] = [
    { value: '', label: t('sort.recommended') }, { value: 'price_asc', label: t('sort.price_asc') }, { value: 'price_desc', label: t('sort.price_desc') },
    { value: 'score', label: t('sort.score') }, { value: 'delivery', label: t('sort.delivery') }, { value: 'newest', label: t('sort.newest') },
  ];
  const plain = !q && !activeCount && !sort && pages === 1;
  const items = acc;
  const featured = plain ? items.filter((p) => p.featured).slice(0, 2) : [];
  const rest = plain ? items.filter((p) => !featured.includes(p)) : items;

  return (
    <div>
      <PageHeader eyebrow={t('shop.eyebrow')} title={category ? tk(`cat.${category}`) : q ? t('shop.results_for', { q }) : t('shop.title')} subtitle={t('shop.subtitle')} />
      <div className="sticky top-[64px] z-20 -mx-4 mb-6 space-y-3 bg-mist/90 px-4 py-3 backdrop-blur-md md:-mx-8 md:px-8">
        <form role="search" onSubmit={(e: { preventDefault(): void }) => { e.preventDefault(); setQ(input.trim()); }} className="flex gap-2">
          <div className="relative flex-1">
            <IconSearch className="absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />
            <input value={input} onChange={(e: { target: HTMLInputElement }) => setInput(e.target.value)} placeholder={t('shop.search_placeholder')} aria-label={t('shop.search_placeholder')} className="h-12 w-full rounded-full bg-paper pl-11 pr-11 text-[15px] shadow-[var(--shadow-soft)] outline-none transition focus:shadow-[0_0_0_2px_var(--color-ink),var(--shadow-soft)]" />
            {input ? <button type="button" onClick={() => { setInput(''); setQ(''); }} className="absolute right-3 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-mist hover:text-ink" aria-label={t('common.clear')}><IconX className="size-4" aria-hidden /></button> : null}
          </div>
          <Button type="submit" className="hidden sm:inline-flex">{t('common.search')}</Button>
        </form>
        <CategoryRail category={category} setCategory={setCategory} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" icon={IconFilter} onClick={() => setSheet(true)} className="lg:hidden">{t('shop.filters')}{activeCount ? ` · ${activeCount}` : ''}</Button>
          <MiniSelect label={t('shop.sort')} value={sort} onChange={setSort} options={sortOptions} icon={IconSort} />
          {q && user ? <Button variant="ghost" size="sm" icon={IconBookmark} onClick={async () => { await favoriteService.toggle('search', q, q); toast(t('shop.search_saved'), 'ok', { label: t('nav.favorites'), to: '/favorites?tab=search' }); }}>{t('shop.save_search')}</Button> : null}
          <span className="num ml-auto text-[13px] font-medium text-muted">{list.data ? t('shop.count', { n: list.data.total }) : ''}</span>
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
        <aside className="hidden lg:block" aria-label={t('shop.filters')}>
          <div className="panel sticky top-[230px] p-5">
            <div className="mb-5 flex items-center justify-between"><span className="text-[15px] font-semibold">{t('shop.filters')}</span>{activeCount ? <button type="button" className="text-[12px] font-semibold text-muted underline underline-offset-4 hover:text-ink" onClick={() => setFilters(EMPTY_FILTERS)}>{t('shop.reset_filters')}</button> : null}</div>
            <FilterPanel f={filters} setF={setFilters} />
          </div>
        </aside>
        <section aria-live="polite" className="min-w-0">
          {list.loading && !list.data ? <SkeletonGrid count={9} className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3" />
            : list.error ? <ErrorState error={list.error} onRetry={list.reload} />
            : !items.length ? (
              <EmptyState icon={IconSearch} title={t('shop.empty')} body={t('shop.empty_body')}
                action={<div className="flex flex-wrap justify-center gap-2"><Button variant="secondary" onClick={() => { setFilters(EMPTY_FILTERS); setQ(''); }}>{t('shop.reset_filters')}</Button><Button to={`/find?mode=text&text=${encodeURIComponent(q)}`}>{t('shop.try_find')}</Button><Button variant="secondary" to={`/ai-buyer?q=${encodeURIComponent(q)}`}>{t('search.ask_ai')}</Button></div>} />
            ) : (
              <>
                {featured.length ? <div className="stagger mb-9 grid gap-4 xl:grid-cols-2">{featured.map((p) => <ProductCard key={p.id} product={p} variant="wide" />)}</div> : null}
                <div className="stagger grid grid-cols-2 gap-x-3 gap-y-9 md:grid-cols-3 md:gap-x-4">
                  {rest.map((p) => <ProductCard key={p.id} product={p} onCompare={() => cmp.toggle(p.id)} comparing={cmp.has(p.id)} />)}
                </div>
                <div ref={sentinel} className="mt-12 flex justify-center">
                  {list.data!.hasMore ? <Button variant="secondary" loading={list.loading} onClick={() => setPages((p) => p + 1)}>{t('common.load_more')}</Button>
                    : <span className="inline-flex items-center gap-2 text-[13px] text-faint"><span className="h-px w-8 bg-mist-3" aria-hidden />{t('shop.end')}<span className="h-px w-8 bg-mist-3" aria-hidden /></span>}
                </div>
              </>
            )}
        </section>
      </div>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('shop.filters')}
        footer={<><Button variant="secondary" full onClick={() => setFilters(EMPTY_FILTERS)}>{t('shop.reset_filters')}</Button><Button full onClick={() => setSheet(false)}>{t('shop.show_n', { n: list.data?.total ?? 0 })}</Button></>}>
        <FilterPanel f={filters} setF={setFilters} />
      </Sheet>
      <CompareBar />
    </div>
  );
}

function Gallery({ product }: { product: Product }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const rail = useRef<HTMLDivElement | null>(null);
  const go = (n: number) => { setI(n); const el = rail.current; if (el && el.scrollWidth > el.clientWidth + 4) el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' }); };
  return (
    <div className="md:sticky md:top-24 md:grid md:grid-cols-[84px_1fr] md:gap-3">
      <div className="hidden flex-col gap-2.5 md:flex" role="tablist" aria-label={t('product.gallery')}>
        {product.images.map((img, n) => (
          <button key={img.id} type="button" role="tab" aria-selected={i === n} aria-label={`${t('product.image')} ${n + 1}`} onClick={() => go(n)} className={cn('press overflow-hidden rounded-[16px] transition', i === n ? 'ring-2 ring-ink ring-offset-2 ring-offset-mist' : 'opacity-60 hover:opacity-100')}>
            <ProductVisual icon={product.icon} image={img} className="aspect-square w-full" rounded={false} />
          </button>
        ))}
      </div>
      <div className="relative">
        {/* Mobile: swipeable rail. Desktop: crossfading stage. */}
        <div ref={rail} className="rail -mx-4 auto-cols-[100%] md:hidden" onScroll={(e: { currentTarget: HTMLDivElement }) => { const el = e.currentTarget; setI(Math.round(el.scrollLeft / el.clientWidth)); }}>
          {product.images.map((img, n) => <div key={img.id} className="w-screen"><ProductVisual icon={product.icon} image={img} title={product.title} eager={n === 0} className="aspect-[4/5] w-full" rounded={false} /></div>)}
        </div>
        <div className="hidden md:block">
          <ProductVisual key={product.images[i]?.id} icon={product.icon} image={product.images[i]} title={product.title} eager large className="aspect-[4/5] w-full rounded-[28px] lg:aspect-square" />
        </div>
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5 md:hidden" aria-hidden>{product.images.map((img, n) => <span key={img.id} className={cn('h-1.5 rounded-full transition-all duration-300', n === i ? 'w-6 bg-ink' : 'w-1.5 bg-ink/25')} />)}</div>
      </div>
    </div>
  );
}

const LANG_NAMES: Record<string, string> = { en: 'English', ru: 'Русский', tk: 'Türkmen', zh: '中文' };

/** Notices for data that is not real or not current: demo seed, sample fixture import, draft, stale or failed sync. */
function ProvenanceNotices({ p }: { p: Product }) {
  const { t, date } = useI18n();
  return (
    <div className="mt-4 space-y-2">
      {p.sample ? <Notice tone="warn" title={t('cat.sample_data')}>{t('cat.sample_data_body')}</Notice> : null}
      {p.demo ? <Notice tone="neutral" title={t('cat.demo_data')}>{t('cat.demo_data_body')}</Notice> : null}
      {p.status && p.status !== 'published' ? <Notice tone="warn">{t('cat.draft')}</Notice> : null}
      {p.source?.syncStatus === 'error' ? <Notice tone="bad">{t('cat.sync_error', { code: p.source.lastError || '—' })}</Notice>
        : p.source?.stale ? <Notice tone="warn">{t('cat.stale')} · {t('cat.synced')}: {p.source.syncedAt ? date(p.source.syncedAt, true) : t('cat.never')}</Notice> : null}
      {p.localized?.fallback ? <Notice tone="info">{t('cat.fallback', { lang: LANG_NAMES[p.localized.titleLang || ''] || p.localized.titleLang || '—' })}</Notice> : null}
    </div>
  );
}

/** Where the data came from and how fresh it is. External URLs were validated on import (https only). */
function SourcePanel({ p }: { p: Product }) {
  const { t, money, date } = useI18n();
  const src = p.source;
  return (
    <div className="text-ink">
      {!src ? <p className="text-sm text-muted">{t('cat.curated')}</p> : (
        <>
          <KV k={t('cat.source_name')} v={src.label} mono={false} />
          <KV k={t('cat.source_id')} v={src.productId} />
          <KV k={t('cat.source_price')} v={src.price ? money(src.price.amountMinor / 100, src.price.currency) : t('cat.price_unavailable')} />
          <KV k={t('cat.synced')} v={src.syncedAt ? date(src.syncedAt, true) : t('cat.never')} />
          {src.sourceUpdatedAt ? <KV k={t('cat.source_updated')} v={date(src.sourceUpdatedAt, true)} /> : null}
          {src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold underline underline-offset-4">{t('cat.source_link')}<IconArrow className="size-3.5" aria-hidden /></a> : null}
        </>
      )}
      {p.updatedAt ? <KV k={t('cat.updated')} v={date(p.updatedAt, true)} /> : null}
      {p.localized?.machine ? <p className="mt-2 text-[12px] text-muted">{t('cat.machine')}</p> : null}
    </div>
  );
}

/** Seller block. Verification comes only from recorded document checks; unknown sellers get no invented metrics. */
function SellerPanel({ supplier }: { supplier: Supplier | null }) {
  const { t, tk } = useI18n();
  if (!supplier) return <p className="text-sm text-muted">{t('cat.seller_unknown')}</p>;
  const level = supplier.trust?.level ?? (supplier.verified ? 1 : 0);
  const docs = (supplier.trust?.basis || []).map((b) => b.document).join(', ');
  return (
    <div>
      <Link to={`/suppliers/${supplier.id}`} className="flex items-center gap-4 rounded-[18px] bg-mist p-4 text-ink hover:bg-mist-2">
        <SupplierLogo monogram={supplier.monogram} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{supplier.name}</div>
          <div className="text-xs text-muted">{[supplier.city, supplier.yearsActive != null ? t('supplier.years_n', { n: supplier.yearsActive }) : null, supplier.responseRate != null ? t('supplier.response_rate', { n: supplier.responseRate }) : null].filter(Boolean).join(' · ')}</div>
        </div>
        <IconArrow className="size-4" aria-hidden />
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
        {level > 0 ? <VerifiedBadge size="sm" label={t('cat.trust_level', { n: level })} /> : <Badge tone="warn">{t('cat.seller_unverified')}</Badge>}
        <span className="text-muted">{tk(`cat.trust.${level}`)}</span>
      </div>
      {level === 0 ? <p className="mt-2 text-[13px] text-muted">{t('cat.seller_unverified_body')}</p> : docs ? <p className="mt-2 text-[12px] text-muted">{t('cat.trust_basis', { docs })}</p> : null}
      {supplier.score != null ? (
        <div className="mt-4"><ScoreBar score={supplier.score} label={t('score.supplier')} note={supplier.trust?.demo ? t('cat.score_demo') : t('score.estimate_note')} /></div>
      ) : null}
    </div>
  );
}

export function ProductPage() {
  const { id } = useParams();
  const { t, tk, money, date, lang } = useI18n();
  const q = useQuery(() => productService.get(id), [id, lang], { live: false });
  const alts = useQuery(() => productService.alternatives(id), [id, lang], { live: false });
  const recent = useRecentlyViewed();
  const cart = useCart();
  const toast = useToast();
  const vip = useUserVip();
  const [variant, setVariant] = useState('');
  const [qty, setQty] = useState(1);
  const [delivery, setDelivery] = useState<'standard' | 'express'>('standard');
  const [reviewsOpen, setReviewsOpen] = useState(false);
  useEffect(() => {
    if (!q.data) return;
    recent.push(id);
    void productService.recordView(id);
    if (!variant) setVariant(q.data.product.variants[0]?.id || '');
    setQty((n) => Math.max(n, q.data!.product.moq || 1));
  }, [q.data?.product.id]); // eslint-disable-line react-hooks/exhaustive-deps
  usePageTitle(q.data?.product.title || t('nav.shop'), q.data ? `${q.data.product.title} — ${t('meta.product')}` : undefined);
  const status = q.data ? pricingStatus(q.data.product) : 'unavailable';
  const est = useMemo(() => (q.data && status === 'estimate' ? estimateProduct(q.data.product, qty, db().content.settings, { vip, delivery }, variant) : null), [q.data, qty, vip, delivery, variant, status]);

  if (q.loading) return <div className="grid gap-10 md:grid-cols-2"><Skeleton className="aspect-square rounded-[28px]" /><div className="space-y-3"><Skeleton className="h-10 w-3/4" /><Skeleton className="h-8 w-1/3" /><Skeleton className="h-48 rounded-[24px]" /></div></div>;
  if (q.error || !q.data) {
    const code = (q.error as { code?: string } | null)?.code;
    if (code === 'not_found' || code === 'invalid_id') return <EmptyState icon={IconSearch} title={tk(`err.${code}`)} body={t('shop.empty_body')} action={<Button to="/shop" iconRight={IconArrow}>{t('nav.shop')}</Button>} />;
    return <ErrorState error={q.error} onRetry={q.reload} />;
  }
  const { product: p, supplier } = q.data;
  const shown = presentedPrice(p);
  const v = p.variants.find((x) => x.id === variant);
  const unit = shown ? shown.amount + (v?.priceDeltaCNY ?? 0) : null;
  const known = leadKnown(p);
  const [dmin, dmax] = deliveryWindow(p, delivery);
  const stockKnown = p.availability ? p.availability !== 'unknown' : true;
  const maxQty = Math.max(p.moq || 1, Math.min(999, stockKnown ? (v?.stock ?? p.stock) || 999 : 999));
  const orderable = canOrder(p);
  const add = () => { if (!orderable) return; cart.add({ productId: p.id, variantId: variant || undefined, qty }); toast(t('cart.added'), 'ok', { label: t('nav.cart'), to: '/cart' }); };
  const buyNow = () => { if (!orderable) return; cart.add({ productId: p.id, variantId: variant || undefined, qty }); navigate('/checkout'); };
  const share = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); toast(t('product.link_copied')); } catch { toast(url, 'info'); }
  };
  const drop = p.oldPriceCNY && shown?.currency === 'CNY' ? Math.round((1 - p.priceCNY / p.oldPriceCNY) * 100) : 0;
  const fx = p.pricing?.fx;
  const availabilityText = p.availability === 'unknown' ? t('cat.availability_unknown') : p.availability === 'out_of_stock' || (!p.availability && p.stock <= 0) ? t('cat.out_of_stock') : t('cat.in_stock_n', { n: v?.stock ?? p.stock });
  const goodsTmt = p.pricing?.goodsMinor != null ? money(p.pricing.goodsMinor / 100, 'TMT', { decimals: 0 }) : null;

  const priceArea = status === 'unavailable' ? (
    <div className="rounded-[24px] bg-paper p-5 shadow-[var(--shadow-soft)] md:p-6">
      <div className="eyebrow">{t('price.china_price')}</div>
      <div className="mt-2 text-[24px] font-semibold">{t('cat.price_unavailable')}</div>
      <p className="mt-2 text-[13px] text-muted">{t('cat.price_unavailable_body')}</p>
    </div>
  ) : status === 'incomplete' ? (
    <div className="rounded-[24px] bg-paper p-5 shadow-[var(--shadow-soft)] md:p-6">
      <div className="flex items-baseline justify-between gap-3 border-b border-line pb-4"><span className="eyebrow">{t('price.china_price')}</span><span className="price text-[22px]">{unit != null && shown ? money(unit, shown.currency) : '—'}</span></div>
      <div className="pt-4">
        <div className="flex items-center justify-between gap-2"><span className="eyebrow">{t('price.est_in_tm')}</span><Badge tone="warn">{t('cat.total_incomplete')}</Badge></div>
        {goodsTmt ? <div className="mt-2 text-[15px] font-semibold">{t('cat.goods_tmt', { amount: goodsTmt })}</div> : null}
        <p className="mt-1.5 text-[12.5px] text-muted">{t('cat.total_incomplete_body')}</p>
      </div>
    </div>
  ) : (
    <TotalBlock chinaPrice={<span className="flex items-baseline gap-2">{drop > 0 ? <span className="num text-[14px] font-normal text-faint line-through">{money(p.oldPriceCNY!, 'CNY')}</span> : null}{unit != null && shown ? money(unit, shown.currency) : '—'}</span>}
      totalTMT={est?.totalTMT ?? 0} note={t('cat.estimate_label')} qtyLabel={qty > 1 ? t('product.for_n', { n: qty }) : undefined} />
  );
  const actions = (cls: string) => (
    <div className={cls}>
      <Button size="lg" onClick={buyNow} className="flex-1" disabled={!orderable}>{t('product.buy_now')}</Button>
      <Button size="lg" variant="secondary" icon={IconCart} onClick={add} className="flex-1" disabled={!orderable}>{t('product.add_to_cart')}</Button>
    </div>
  );

  return (
    <div className="pb-28 md:pb-0">
      <nav className="mb-5 flex items-center gap-1.5 text-[13px] text-muted" aria-label={t('common.breadcrumb')}>
        <Link to="/shop" className="hover:text-ink">{t('nav.shop')}</Link><IconChevron className="size-3.5" aria-hidden />
        <Link to={`/shop/category/${p.categoryId}`} className="hover:text-ink">{tk(`cat.${p.categoryId}`)}</Link>
      </nav>
      <div className="grid items-start gap-8 md:grid-cols-[1.1fr_1fr] lg:gap-14">
        <div className="-mt-1 md:mt-0">
          <Gallery product={p} />
          {p.tryOn ? (
            <Link to={`/try-on?p=${p.id}`} className="press group mt-3 flex items-center gap-3 rounded-[22px] bg-ink p-3 pr-4 text-on-ink shadow-[var(--shadow-lift)] transition hover:-translate-y-0.5">
              <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-white/10"><IconScanFace className="size-5 text-accent-2" aria-hidden /><span className="absolute inset-0 animate-[pulse-ring_2.4s_ease-out_infinite] rounded-full ring-1 ring-accent-2/50" aria-hidden /></span>
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">{t('tryon.cta_long')}</span><span className="block truncate text-[12px] opacity-60">{t('tryon.privacy')}</span></span>
              <IconArrow className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {p.verified ? <VerifiedBadge size="sm" label={t('badge.verified_supplier')} /> : null}
              {drop > 0 ? <Badge tone="dark" icon={IconDrop}>−{drop}%</Badge> : null}
              {p.sample ? <Badge tone="warn">{t('cat.sample_data')}</Badge> : null}
              {p.demo ? <Badge>{t('cat.demo_data')}</Badge> : null}
              {p.localized?.machine ? <Badge tone="info">{t('cat.machine')}</Badge> : null}
            </div>
            <div className="flex gap-1.5">
              <IconButton icon={IconCopy} label={t('product.share')} onClick={share} className="bg-paper shadow-[var(--shadow-soft)]" size="sm" />
              <FavoriteButton kind="product" refId={p.id} />
            </div>
          </div>
          <h1 className="headline mt-4 text-[28px] md:text-[38px]">{p.title}</h1>
          {p.brand ? <div className="mt-1 text-[13px] text-muted">{p.brand}</div> : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-muted">
            {p.reviews.length ? <button type="button" onClick={() => setReviewsOpen(true)} className="inline-flex items-center gap-1.5 hover:text-ink"><IconStar className="size-4 fill-current text-ink" aria-hidden /><span className="num font-semibold text-ink">{p.rating}</span>· {t('product.reviews_n', { n: p.reviews.length })}</button> : <span>{t('cat.no_reviews')}</span>}
            {supplier?.score != null ? <ScoreBadge score={supplier.score} /> : null}
            <span className="inline-flex items-center gap-1"><IconClock className="size-3.5" aria-hidden />{known ? t('delivery.days', { min: dmin, max: dmax }) : t('cat.lead_unknown')}</span>
          </div>
          <ProvenanceNotices p={p} />

          <div className="mt-6">{priceArea}</div>
          <div className="mt-2 px-1 text-[12px] text-muted">{t('product.per_unit')} · {t('common.moq')} <span className="num">{p.moq}</span> · {availabilityText}</div>
          {fx && status !== 'unavailable' ? <div className="mt-1 px-1 text-[11.5px] text-faint">{t('cat.fx_line', { pair: fx.pair, rate: fx.rate, source: fx.source === 'demo_default' ? t('cat.fx_demo') : fx.source || '—', date: fx.asOf ? date(fx.asOf) : '—' })}{p.pricing?.logistics.tariffIsDemo ? ` · ${t('cat.tariff_demo')}` : ''}</div> : null}

          {p.variants.length > 1 ? (
            <fieldset className="mt-7">
              <legend className="eyebrow mb-3">{t('product.variant')}</legend>
              <div className="flex flex-wrap gap-2">{p.variants.map((x) => <Chip key={x.id} active={variant === x.id} onClick={() => setVariant(x.id)}>{x.name}{x.priceDeltaCNY ? ` ${x.priceDeltaCNY > 0 ? '+' : '−'}${Math.abs(x.priceDeltaCNY)}` : ''}</Chip>)}</div>
            </fieldset>
          ) : null}
          <div className="mt-6 flex flex-wrap items-end gap-5">
            <div><div className="eyebrow mb-2">{t('product.quantity')}</div><QtyStepper value={qty} onChange={setQty} min={p.moq || 1} max={maxQty} label={t('product.quantity')} size="lg" /></div>
            <div>
              <div className="eyebrow mb-2">{t('product.delivery')}</div>
              <Tabs value={delivery} onChange={setDelivery} items={[{ value: 'standard', label: t('delivery.standard') }, { value: 'express', label: t('delivery.express') }]} label={t('product.delivery')} />
            </div>
          </div>
          <div className="mt-6 rounded-[20px] bg-paper p-4 shadow-[var(--shadow-soft)]">
            <div className="mb-3 flex items-center justify-between text-[13px]"><span className="font-semibold">{known ? t('product.delivery_estimate', { min: dmin, max: dmax }) : t('cat.lead_unknown')}</span><span className="text-muted">{delivery === 'express' ? t('delivery.express') : t('delivery.standard')}</span></div>
            <CargoLine nodes={[{ label: supplier?.city || '—' }, { label: 'Yiwu' }, { label: delivery === 'express' ? t('product.air') : t('product.rail') }, { label: 'Ashgabat' }]} progress={0} animate={false} />
            <p className="mt-3 text-[11.5px] text-muted">{t('cat.delivery_estimate_note')}</p>
          </div>

          {actions('mt-6 hidden gap-2.5 md:flex')}
          {!orderable ? <div className="mt-3"><Notice tone="info">{t('cat.cannot_order')}</Notice></div> : null}

          <div className="mt-8 rounded-[24px] bg-paper px-5 shadow-[var(--shadow-soft)]">
            {p.description ? (
              <Disclosure title={t('cat.description')} icon={IconFile} defaultOpen>
                <p className="whitespace-pre-line text-sm text-ink">{p.description}</p>
              </Disclosure>
            ) : null}
            <Disclosure title={t('product.sec.supplier')} icon={IconFactory} meta={supplier?.score != null ? <span className="num hidden text-[13px] font-semibold sm:inline">{supplier.score}</span> : undefined}>
              <SellerPanel supplier={supplier} />
            </Disclosure>
            <Disclosure title={t('product.specs')} icon={IconFile}>
              {p.specs.length ? <dl className="divide-y divide-line">{p.specs.map(([k, val], i) => <div key={`${k}-${i}`} className="flex justify-between gap-4 py-2.5 text-sm"><dt>{k}</dt><dd className="text-right font-medium text-ink">{val}</dd></div>)}</dl> : <p className="text-sm text-muted">—</p>}
            </Disclosure>
            <Disclosure title={t('cat.source')} icon={IconShield} meta={p.source?.stale || p.source?.syncStatus === 'error' ? <Badge tone="warn">{t('cat.stale')}</Badge> : undefined}>
              <SourcePanel p={p} />
            </Disclosure>
            <Disclosure title={t('product.delivery')} icon={IconClock}>
              <p>{known ? `${t('product.delivery_estimate', { min: dmin, max: dmax })}. ` : `${t('cat.lead_unknown')}. `}{t('product.delivery_body')}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[12px] text-ink">
                <div className="rounded-[16px] bg-mist p-3"><IconShield className="mx-auto mb-1.5 size-4" aria-hidden />{t('product.assurance.payment')}</div>
                <div className="rounded-[16px] bg-mist p-3"><IconCargo className="mx-auto mb-1.5 size-4" aria-hidden />{t('product.assurance.cargo')}</div>
                <div className="rounded-[16px] bg-mist p-3"><IconZap className="mx-auto mb-1.5 size-4" aria-hidden />{t('product.assurance.support')}</div>
              </div>
            </Disclosure>
            <Disclosure title={t('product.reviews')} icon={IconStar} meta={p.reviews.length ? <span className="num hidden text-[13px] font-semibold sm:inline">{p.rating}</span> : undefined}>
              {p.reviews.length ? (
                <>
                  {p.demo ? <p className="mb-3 text-[12px] text-muted">{t('cat.demo_data')} · {t('cat.demo_data_body')}</p> : null}
                  <ul className="space-y-3">
                    {p.reviews.slice(0, 3).map((r) => (
                      <li key={r.id} className="rounded-[16px] bg-mist p-4">
                        <div className="flex justify-between text-[13px] text-ink"><span className="font-semibold">{r.author} · {r.city}</span><span className="num" aria-label={`${r.rating}/5`}>{'★'.repeat(r.rating)}<span className="text-mist-3">{'★'.repeat(5 - r.rating)}</span></span></div>
                        <p className="mt-1.5 text-sm">{r.text}</p>
                        <div className="mt-2 text-[11px] text-faint">{date(r.date)}</div>
                      </li>
                    ))}
                  </ul>
                  <Button variant="link" size="sm" className="mt-3" onClick={() => setReviewsOpen(true)}>{t('common.see_all')}</Button>
                </>
              ) : <p className="text-sm text-muted">{t('cat.no_reviews')}</p>}
            </Disclosure>
            <Disclosure title={t('product.sec.cargo')} icon={IconCargo}>
              {est ? <PriceBlock costs={est} title={t('product.final_cost', { n: qty })} note={`${t('cat.estimate_label')}. ${p.pricing?.logistics.tariffIsDemo ? t('cat.tariff_demo') : ''}`} /> : <Notice tone="info">{status === 'incomplete' ? t('cat.total_incomplete_body') : t('cat.price_unavailable_body')}</Notice>}
              <div className="mt-3 grid grid-cols-2 gap-2 text-ink"><KV k={t('product.weight')} v={p.weightKnown === false ? '—' : `${p.weightKg} kg`} /><KV k={t('product.volume')} v={p.volumeM3 ? `${p.volumeM3} m³` : '—'} /></div>
            </Disclosure>
          </div>
        </div>
      </div>

      {alts.data && (alts.data.cheaper || alts.data.faster || alts.data.betterSupplier) ? (
        <section className="reveal mt-16">
          <SectionTitle title={t('product.alternatives')} sub={t('product.alternatives_sub')} />
          <div className="rail -mx-4 gap-4 px-4 md:mx-0 md:px-0">
            {alts.data.cheaper ? <ProductCard product={alts.data.cheaper} compact reason={t('reco.lower_price')} /> : null}
            {alts.data.faster ? <ProductCard product={alts.data.faster} compact reason={t('reco.faster')} /> : null}
            {alts.data.betterSupplier ? <ProductCard product={alts.data.betterSupplier} compact reason={t('reco.better_supplier')} /> : null}
          </div>
        </section>
      ) : null}

      <div className="fixed inset-x-3 bottom-[96px] z-30 mx-auto flex max-w-[460px] items-center gap-2 rounded-[26px] bg-paper p-2 shadow-[var(--shadow-float)] md:hidden">
        <div className="min-w-0 flex-1 pl-3"><div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{t('price.tm_short')}</div><div className="price truncate text-[17px]">{est ? money(est.totalTMT, 'TMT', { decimals: 0 }) : status === 'incomplete' ? t('cat.not_calculated') : t('cat.price_unavailable')}</div></div>
        {orderable ? <IconButton icon={IconCart} label={t('product.add_to_cart')} onClick={add} className="bg-mist" /> : null}
        <Button onClick={buyNow} className="px-6" disabled={!orderable}>{t('product.buy_now')}</Button>
      </div>

      <Modal open={reviewsOpen} onClose={() => setReviewsOpen(false)} title={t('product.reviews')} size="md">
        {p.demo ? <p className="mb-3 text-[12px] text-muted">{t('cat.demo_data_body')}</p> : null}
        <ul className="space-y-4">{p.reviews.map((r) => <li key={r.id} className="border-b border-line pb-4 last:border-0"><div className="flex justify-between text-[13px]"><span className="font-semibold">{r.author} · {r.city}</span><span className="num">{r.rating}/5</span></div><p className="mt-1 text-sm text-muted">{r.text}</p><div className="mt-1 text-[11px] text-faint">{date(r.date)}</div></li>)}</ul>
        <div className="mt-4"><KV k={t('compare.rating')} v={`${p.rating} / 5`} /></div>
      </Modal>
    </div>
  );
}

export function ComparePage() {
  const { t } = useI18n();
  usePageTitle(t('compare.title'));
  const cmp = useCompare('product');
  return (
    <div>
      <PageHeader title={t('compare.title')} subtitle={t('compare.subtitle')} back={{ to: '/shop', label: t('nav.shop') }} actions={cmp.ids.length ? <Button variant="secondary" onClick={cmp.clear}>{t('common.clear')}</Button> : null} />
      {cmp.ids.length ? <div className="card p-5 md:p-7"><ProductCompare ids={cmp.ids} onRemove={cmp.toggle} /></div>
        : <EmptyState icon={IconCompare} title={t('compare.empty')} body={t('compare.empty_body')} action={<Button to="/shop" iconRight={IconArrow}>{t('nav.shop')}</Button>} />}
    </div>
  );
}
