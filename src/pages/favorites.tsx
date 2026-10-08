import { useI18n } from '@/i18n';
import { Link, useQueryParam } from '@/lib/router';
import { useQuery } from '@/lib/hooks';
import { favoriteService } from '@/services/accountServices';
import { db } from '@/services/db';
import { useCompare } from '@/state/cart';
import type { Car, Product, Supplier } from '@/lib/types';
import { Button, EmptyState, ErrorState, IconButton, PageHeader, SkeletonGrid, Tabs } from '@/components/ui';
import { CarCard, ProductCard, SupplierCard } from '@/components/commerce';
import { usePageTitle } from '@/components/shell';
import { IconCompare, IconHeart, IconSearch, IconTrash } from '@/components/icons';

type Kind = 'product' | 'supplier' | 'car' | 'search';

export function FavoritesPage() {
  const { t, date } = useI18n();
  usePageTitle(t('nav.favorites'));
  const [tabQ, setTab] = useQueryParam('tab');
  const tab = (tabQ || 'product') as Kind;
  const q = useQuery(() => favoriteService.list(), []);
  const pc = useCompare('product');
  const cc = useCompare('car');
  const d = db();
  const favs = q.data || [];
  const of = (k: Kind) => favs.filter((f) => f.kind === k);
  const products = of('product').map((f) => d.products.find((p) => p.id === f.refId)).filter(Boolean) as Product[];
  const suppliers = of('supplier').map((f) => d.suppliers.find((s) => s.id === f.refId)).filter(Boolean) as Supplier[];
  const cars = of('car').map((f) => d.cars.find((c) => c.id === f.refId)).filter(Boolean) as Car[];
  const searches = of('search');
  const counts = { product: products.length, supplier: suppliers.length, car: cars.length, search: searches.length };
  return (
    <div>
      <PageHeader display title={t('nav.favorites')} subtitle={t('fav.subtitle')}
        actions={tab === 'product' && products.length >= 2 ? <Button variant="secondary" icon={IconCompare} onClick={() => { products.slice(0, 4).forEach((p) => { if (!pc.has(p.id)) pc.toggle(p.id); }); }} to="/compare">{t('fav.compare_all')}</Button>
          : tab === 'car' && cars.length >= 2 ? <Button variant="secondary" icon={IconCompare} onClick={() => { cars.slice(0, 4).forEach((c) => { if (!cc.has(c.id)) cc.toggle(c.id); }); }} to="/auto/compare">{t('fav.compare_all')}</Button> : null} />
      <Tabs value={tab} onChange={(v) => setTab(v === 'product' ? '' : v)} className="mb-6" label={t('nav.favorites')}
        items={(['product', 'supplier', 'car', 'search'] as const).map((k) => ({ value: k, label: t(`fav.tab.${k}`), count: counts[k] }))} />
      {q.loading ? <SkeletonGrid count={4} /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : (
        tab === 'product' ? (products.length ? <div className="stagger grid grid-cols-2 gap-x-3 gap-y-9 md:grid-cols-3 md:gap-x-4 xl:grid-cols-4">{products.map((p) => <ProductCard key={p.id} product={p} onCompare={() => pc.toggle(p.id)} comparing={pc.has(p.id)} />)}</div> : <EmptyState icon={IconHeart} title={t('fav.empty')} body={t('fav.empty_body')} action={<Button to="/shop">{t('nav.shop')}</Button>} />)
        : tab === 'supplier' ? (suppliers.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{suppliers.map((s) => <SupplierCard key={s.id} supplier={s} action={<Button size="sm" variant="secondary" to={`/suppliers/${s.id}`}>{t('sup.view_profile')}</Button>} />)}</div> : <EmptyState icon={IconHeart} title={t('fav.empty')} action={<Button to="/suppliers">{t('nav.suppliers')}</Button>} />)
        : tab === 'car' ? (cars.length ? <div className="stagger grid gap-5 md:grid-cols-2 xl:grid-cols-3">{cars.map((c) => <CarCard key={c.id} car={c} inspection={d.inspections.find((i) => i.id === c.inspectionId)} onCompare={() => cc.toggle(c.id)} comparing={cc.has(c.id)} />)}</div> : <EmptyState icon={IconHeart} title={t('fav.empty')} action={<Button to="/auto">{t('nav.auto')}</Button>} />)
        : searches.length ? (
          <ul className="card divide-y divide-line">
            {searches.map((s) => (
              <li key={s.id} className="flex items-center gap-3 p-4 md:px-6">
                <span className="grid size-10 place-items-center rounded-full bg-mist"><IconSearch className="size-4" aria-hidden /></span>
                <Link to={`/shop?q=${encodeURIComponent(s.refId)}`} className="flex-1 font-medium hover:underline">{s.label || s.refId}</Link>
                <span className="text-[12px] text-faint">{date(s.createdAt)}</span>
                <IconButton icon={IconTrash} size="sm" label={t('common.remove')} onClick={() => favoriteService.toggle('search', s.refId)} />
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={IconSearch} title={t('fav.no_searches')} body={t('fav.no_searches_body')} action={<Button to="/shop">{t('nav.shop')}</Button>} />
      )}
    </div>
  );
}
