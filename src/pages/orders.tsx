import { useState } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate, useLocation, useParams, useQueryParam } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { orderService } from '@/services/orderService';
import type { OrderTab } from '@/services/orderService';
import { useCart } from '@/state/cart';
import { Button, ConfirmDialog, Modal, EmptyState, ErrorState, FileCard, KV, Notice, PageHeader, SectionTitle, SkeletonRows, StatusBadge, Tabs, useToast } from '@/components/ui';
import { PriceBlock, ShipmentLine, ShipmentTimeline, statusKey } from '@/components/commerce';
import { ProductVisual, SupplierLogo } from '@/components/visuals';
import { usePageTitle } from '@/components/shell';
import { PaymentMethodPicker } from '@/components/forms';
import { db } from '@/services/db';
import { IconArrow, IconOk, IconPackage, IconRetry, IconSupport, IconTrack, IconX } from '@/components/icons';

export function OrdersPage() {
  const { t, tk, money, date } = useI18n();
  usePageTitle(t('nav.orders'));
  const [tab, setTab] = useQueryParam('tab');
  const current = (tab || 'all') as OrderTab;
  const q = useQuery(() => orderService.list(current), [current]);
  return (
    <div>
      <PageHeader display title={t('nav.orders')} subtitle={t('orders.subtitle')} />
      <Tabs value={current} onChange={(v) => setTab(v === 'all' ? '' : v)} items={(['all', 'active', 'completed', 'cancelled'] as const).map((v) => ({ value: v, label: t(`orders.tab.${v}`) }))} className="mb-6" label={t('nav.orders')} />
      {q.loading ? <SkeletonRows /> : q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !q.data?.length ? (
        <EmptyState icon={IconPackage} title={t('orders.empty')} body={t('orders.empty_body')} action={<Button to="/shop">{t('nav.shop')}</Button>} />
      ) : (
        <ul className="stagger space-y-3">
          {q.data.map((o) => {
            const first = db().products.find((p) => p.id === o.items[0]?.productId);
            return (
              <li key={o.id}>
                <Link to={`/orders/${o.id}`} className="card lift flex items-center gap-4 p-3 pr-5 md:gap-5">
                  {first ? <ProductVisual icon={first.icon} image={first.images[0]} className="size-20 shrink-0 rounded-[18px] md:size-24" /> : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="mono font-semibold">{o.number}</span><StatusBadge status={o.status} label={tk(statusKey('order', o.status))} /></div>
                    <div className="mt-1 truncate text-sm text-muted">{o.items.map((i) => i.title).join(', ')}</div>
                    <div className="mt-1 text-[12px] text-faint">{date(o.createdAt)} · {t('orders.items_n', { n: o.items.reduce((s, i) => s + i.qty, 0) })}</div>
                  </div>
                  <div className="text-right"><div className="price text-[17px]">{money(o.costs.totalTMT, 'TMT')}</div><IconArrow className="ml-auto mt-2 size-4 text-faint" aria-hidden /></div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function OrderPage() {
  const { id } = useParams();
  const { query } = useLocation();
  const { t, tk, money, date } = useI18n();
  const q = useQuery(() => orderService.get(id), [id]);
  const cart = useCart();
  const toast = useToast();
  const cancel = useAction(orderService.cancel);
  const [confirm, setConfirm] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [methodId, setMethodId] = useState('');
  const pay = useAction(orderService.pay);
  usePageTitle(q.data ? `${t('orders.order')} ${q.data.order.number}` : t('nav.orders'));
  if (q.loading) return <SkeletonRows count={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  const { order: o, payment, shipment, suppliers } = q.data;
  const reorder = async () => {
    const items = await orderService.reorderItems(o.id);
    items.forEach((i) => cart.add(i));
    toast(t('orders.reordered'), 'ok', { label: t('nav.cart'), to: '/cart' });
  };
  const canCancel = ['pending_payment', 'paid'].includes(o.status) && o.supplierStatus !== 'accepted';
  return (
    <div>
      {query.get('placed') ? (
        <div className="animate-pop sheen relative mb-8 flex items-center gap-5 overflow-hidden rounded-[28px] bg-[#111] p-6 text-white md:p-8">
          <div className="dot-grid-dark absolute inset-0" aria-hidden />
          <span className="relative grid size-14 shrink-0 place-items-center rounded-full accent-grad"><IconOk className="animate-pop size-7 [animation-delay:.25s]" aria-hidden /></span>
          <div className="relative"><div className="display text-[20px] uppercase md:text-[26px]">{t('orders.placed_title')}</div><div className="mt-1 text-sm text-white/60">{t('orders.placed_body', { number: o.number })}</div></div>
        </div>
      ) : null}
      <PageHeader back={{ to: '/orders', label: t('nav.orders') }} eyebrow={date(o.createdAt, true)} title={<span className="mono">{o.number}</span>}
        actions={<>
          <StatusBadge status={o.status} label={tk(statusKey('order', o.status))} />
        </>} />
      {shipment ? <div className="card mb-6 px-5 py-6 md:px-8"><ShipmentLine stage={shipment.stage} /></div> : null}
      <div className="mb-8 flex flex-wrap gap-2">
        {shipment ? <Button icon={IconTrack} onClick={() => navigate(`/track?q=${shipment.trackingNumber}`)}>{t('orders.track')}</Button> : null}
        <Button variant="secondary" icon={IconRetry} onClick={reorder}>{t('orders.reorder')}</Button>
        <Button variant="secondary" icon={IconSupport} to={`/support?category=order&ref=${o.number}`}>{t('orders.contact_support')}</Button>
        {o.status === 'pending_payment' ? <Button variant="metal" onClick={() => setPayOpen(true)}>{t('orders.complete_payment')}</Button> : null}
        {canCancel ? <Button variant="danger" icon={IconX} onClick={() => setConfirm(true)}>{t('orders.cancel')}</Button> : null}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <section>
            <SectionTitle title={t('orders.items')} />
            <ul className="card divide-y divide-line px-5">
              {o.items.map((i, k) => {
                const p = db().products.find((x) => x.id === i.productId);
                return (
                  <li key={k} className="flex items-center gap-4 py-4">
                    {p ? <ProductVisual icon={p.icon} image={p.images[0]} className="size-16 rounded-[16px]" /> : null}
                    <div className="min-w-0 flex-1"><Link to={`/shop/${i.productId}`} className="line-clamp-1 font-medium hover:underline">{i.title}</Link><div className="num text-xs text-muted">{money(i.unitPriceCNY, 'CNY')} × {i.qty}</div></div>
                    <span className="num font-medium">{money(i.unitPriceCNY * i.qty, 'CNY')}</span>
                  </li>
                );
              })}
            </ul>
          </section>
          {shipment ? (
            <section>
              <SectionTitle title={t('orders.timeline')} action={<Link to={`/cargo/${shipment.id}`} className="text-[13px] font-medium text-muted hover:text-ink">{t('orders.shipment_details')} →</Link>} />
              <div className="card p-5"><ShipmentTimeline shipment={shipment} /></div>
            </section>
          ) : o.status === 'cancelled' ? <Notice tone="neutral">{t('orders.cancelled_note')}</Notice> : <Notice tone="warn">{t('orders.awaiting_payment_note')}</Notice>}
        </div>
        <aside className="space-y-4">
          <PriceBlock costs={o.costs} title={t('orders.total')} />
          <div className="card p-5">
            <div className="eyebrow mb-3">{t('orders.payment')}</div>
            {payment ? <>
              <KV k={t('orders.method')} v={payment.methodLabel} mono={false} />
              <KV k={t('common.status')} v={<StatusBadge status={payment.status} label={tk(statusKey('payment', payment.status))} />} mono={false} />
              <KV k={t('common.date')} v={date(payment.createdAt, true)} mono={false} />
              {payment.failureReason ? <p className="mt-2 text-[12px] text-bad">{payment.failureReason}</p> : null}
            </> : <p className="text-sm text-muted">{t('orders.no_payment')}</p>}
          </div>
          <div className="card p-5">
            <div className="eyebrow mb-3">{t('orders.delivery_to')}</div>
            <p className="text-sm">{o.addressText}</p>
            <p className="mt-1 text-[12px] text-muted">{t(`delivery.${o.delivery}`)}</p>
          </div>
          <div className="card p-5">
            <div className="eyebrow mb-3">{t('orders.suppliers')}</div>
            {suppliers.map((s) => <Link key={s.id} to={`/suppliers/${s.id}`} className="flex items-center gap-3 py-1.5"><SupplierLogo monogram={s.monogram} size={32} /><span className="text-sm font-medium hover:underline">{s.name}</span></Link>)}
            <p className="mt-2 text-[12px] text-muted">{tk(`orders.supplier_status.${o.supplierStatus}`)}</p>
          </div>
          <div className="space-y-2">
            <div className="eyebrow">{t('orders.documents')}</div>
            {o.documents.length ? o.documents.map((d) => <FileCard key={d} name={d} meta={t('orders.doc_meta')} />) : <p className="text-sm text-muted">{t('orders.no_documents')}</p>}
          </div>
        </aside>
      </div>
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title={t('orders.complete_payment')} description={money(o.costs.totalTMT, 'TMT')}
        footer={<><Button variant="secondary" onClick={() => setPayOpen(false)}>{t('common.cancel')}</Button><Button variant="metal" loading={pay.pending} disabled={!methodId} onClick={async () => {
          const r = await pay.run(o.id, methodId);
          if (r?.payment.status === 'succeeded') { setPayOpen(false); toast(t('checkout.success')); } else toast(r?.payment.failureReason || t('checkout.payment_failed'), 'bad');
        }}>{t('orders.pay_now')}</Button></>}>
        <PaymentMethodPicker value={methodId} onChange={setMethodId} allow={['card', 'wallet', 'partner']} />
      </Modal>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={t('orders.cancel_confirm')} body={t('orders.cancel_body')} confirmLabel={t('orders.cancel')} danger loading={cancel.pending}
        onConfirm={async () => { const r = await cancel.run(o.id); setConfirm(false); if (r) toast(t('orders.cancelled_toast')); else toast(t('orders.cannot_cancel'), 'bad'); }} />
    </div>
  );
}
