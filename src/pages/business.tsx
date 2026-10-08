import { useState } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate, useQueryParam } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { businessService } from '@/services/businessService';
import { supplierService } from '@/services/supplierService';
import { orderService } from '@/services/orderService';
import { useCart } from '@/state/cart';
import { db } from '@/services/db';
import type { QuoteRequest } from '@/lib/types';
import { Badge, Button, DataTable, EmptyState, ErrorState, Input, Modal, Notice, PageHeader, Select, SkeletonRows, StatCard, StatusBadge, Tabs, Textarea, useToast } from '@/components/ui';
import { statusKey } from '@/components/commerce';
import { SupplierLogo } from '@/components/visuals';
import { usePageTitle } from '@/components/shell';
import { IconAI, IconCargo, IconChart, IconFactory, IconPackage, IconPlus, IconReceipt, IconRetry, IconScan, IconSend, IconWallet, IconBookmark, IconUsers, IconSearch } from '@/components/icons';

type Tab = 'overview' | 'orders' | 'invoices' | 'quotes' | 'suppliers';

export function RequestQuoteModal({ open, onClose, supplierId: fixed }: { open: boolean; onClose: () => void; supplierId?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const suppliers = db().suppliers.filter((s) => s.status === 'approved');
  const [supplierId, setSupplierId] = useState(fixed || suppliers[0]?.id || '');
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('100');
  const [target, setTarget] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);
  const send = useAction(supplierService.requestQuote);
  const errs = { title: title.trim().length < 3 ? t('form.required') : null, qty: !/^\d+$/.test(qty) || Number(qty) < 1 ? t('form.invalid_qty') : null, target: target && !(Number(target) > 0) ? t('form.invalid_amount') : null };
  return (
    <Modal open={open} onClose={onClose} title={t('biz.request_quote')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={send.pending} onClick={async () => {
        setTouched(true); if (Object.values(errs).some(Boolean)) return;
        const q = await send.run({ supplierId: fixed || supplierId, productTitle: title.trim(), qty: Number(qty), targetPriceUSD: target ? Number(target) : undefined, notes, kind: 'quote' });
        if (q) { toast(t('ai.quote_sent')); onClose(); setTitle(''); setNotes(''); setTouched(false); }
      }}>{t('common.send')}</Button></>}>
      <div className="space-y-4">
        {!fixed ? <Select label={t('find.supplier')} value={supplierId} onChange={setSupplierId} options={suppliers.map((s) => ({ value: s.id, label: `${s.name} · ${s.score}` }))} /> : null}
        <Input label={t('biz.product')} value={title} onChange={setTitle} error={touched ? errs.title : null} placeholder={t('biz.product_ph')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label={t('product.quantity')} value={qty} onChange={(v) => setQty(v.replace(/\D/g, ''))} inputMode="numeric" error={touched ? errs.qty : null} />
          <Input label={t('ai.target_price')} value={target} onChange={setTarget} inputMode="decimal" prefix="$" optional error={touched ? errs.target : null} />
        </div>
        <Textarea label={t('ai.notes')} value={notes} onChange={setNotes} rows={3} optional />
        {send.error ? <Notice tone="bad">{t('form.server_error')}</Notice> : null}
      </div>
    </Modal>
  );
}

function QuoteRow({ q }: { q: QuoteRequest }) {
  const { t, tk, money, date } = useI18n();
  const sup = db().suppliers.find((s) => s.id === q.supplierId);
  const toast = useToast();
  const act = useAction(supplierService.acceptQuote);
  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">{sup ? <SupplierLogo monogram={sup.monogram} size={36} /> : null}<div><div className="font-semibold">{q.productTitle}</div><div className="text-[12px] text-muted">{sup?.name} · {t('biz.qty_n', { n: q.qty })} · {date(q.createdAt)}{q.kind === 'sample' ? ` · ${t('biz.sample')}` : ''}</div></div></div>
        <StatusBadge status={q.status} label={tk(statusKey('quote', q.status))} />
      </div>
      {q.response ? (
        <div className="mt-4 rounded-[12px] bg-mist p-4 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1"><span>{t('ai.unit_price')}: <span className="num font-semibold">{money(q.response.unitPriceUSD, 'USD', { decimals: 2 })}</span></span><span>{t('biz.lead_time')}: <span className="num font-semibold">{t('common.days', { n: q.response.leadDays })}</span></span><span>{t('biz.est_total')}: <span className="num font-semibold">{money(q.response.unitPriceUSD * q.qty, 'USD')}</span></span></div>
          <p className="mt-2 text-muted">“{q.response.message}”</p>
          {q.status === 'responded' ? <div className="mt-3 flex gap-2"><Button size="sm" loading={act.pending} onClick={async () => { await act.run(q.id, true); toast(t('biz.quote_accepted')); }}>{t('biz.accept')}</Button><Button size="sm" variant="secondary" onClick={async () => { await act.run(q.id, false); toast(t('biz.quote_declined')); }}>{t('biz.decline')}</Button></div> : null}
        </div>
      ) : <p className="mt-3 text-[13px] text-muted">{t('biz.awaiting_reply')}</p>}
    </li>
  );
}

export function BusinessPage() {
  const { t, tk, money, date, num } = useI18n();
  usePageTitle(t('nav.business'));
  const [tabQ, setTab] = useQueryParam('tab');
  const tab = (tabQ || 'overview') as Tab;
  const q = useQuery(() => businessService.dashboard(), []);
  const cart = useCart();
  const toast = useToast();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  if (q.loading) return <SkeletonRows count={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  const d = q.data;
  const max = Math.max(1, ...d.weeks.map((w) => w.value));
  const repeat = async (id: string) => {
    const items = await orderService.reorderItems(id);
    items.forEach((i) => cart.add(i));
    toast(t('orders.reordered'), 'ok', { label: t('nav.cart'), to: '/cart' });
    setRepeatOpen(false);
  };
  return (
    <div>
      <PageHeader eyebrow={d.business?.companyName || t('nav.business')} title={t('biz.title')} subtitle={t('biz.subtitle')}
        actions={<><Button icon={IconAI} to="/ai-buyer">{t('nav.ai_buyer')}</Button><Button variant="secondary" icon={IconWallet} to="/pay">{t('nav.pay')}</Button></>} />
      <div className="mb-6 rail gap-2">
        <Button size="sm" variant="secondary" icon={IconSearch} to="/suppliers">{t('biz.find_supplier')}</Button>
        <Button size="sm" variant="secondary" icon={IconSend} onClick={() => setQuoteOpen(true)}>{t('biz.request_quote')}</Button>
        <Button size="sm" variant="secondary" icon={IconPlus} to="/shop/category/business">{t('biz.create_order')}</Button>
        <Button size="sm" variant="secondary" icon={IconRetry} onClick={() => setRepeatOpen(true)} disabled={!d.repeatable.length}>{t('biz.repeat_order')}</Button>
        <Button size="sm" variant="secondary" icon={IconScan} to="/find">{t('nav.find')}</Button>
      </div>
      <Tabs value={tab} onChange={(v) => setTab(v === 'overview' ? '' : v)} className="mb-6" label={t('nav.business')}
        items={[{ value: 'overview', label: t('biz.tab.overview') }, { value: 'orders', label: t('biz.tab.orders'), count: d.orders.length }, { value: 'invoices', label: t('biz.tab.invoices'), count: d.invoices.length }, { value: 'quotes', label: t('biz.tab.quotes'), count: d.quotes.length }, { value: 'suppliers', label: t('biz.tab.suppliers'), count: d.usedSuppliers.length }]} />

      {tab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard tone="dark" label={t('biz.active_orders')} value={d.activeOrders.length} icon={IconPackage} to="/business?tab=orders" />
            <StatCard label={t('biz.pending_payments')} value={d.pendingPayments.length} icon={IconWallet} sub={money(d.pendingPayments.reduce((s, i) => s + i.totalTMT, 0), 'TMT', { decimals: 0 })} to="/business?tab=invoices" />
            <StatCard label={t('biz.cargo')} value={d.activeCargo.length} icon={IconCargo} to="/cargo" />
            <StatCard label={t('biz.invoices')} value={d.invoices.length} icon={IconReceipt} to="/business?tab=invoices" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <div className="card p-5">
              <div className="flex items-start justify-between"><div><div className="eyebrow">{t('biz.spending')}</div><div className="num mt-2 text-3xl font-medium">{money(d.spend30, 'TMT', { decimals: 0 })}</div><div className="text-[12px] text-muted">{t('biz.last_30')} · {t('biz.total_spend', { v: money(d.spendTotal, 'TMT', { decimals: 0 }) })}</div></div><IconChart className="size-4 text-faint" aria-hidden /></div>
              <div className="mt-6 flex h-32 items-end gap-2" role="img" aria-label={t('biz.spending_chart')}>
                {d.weeks.map((w) => <div key={w.start} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"><div className="flex w-full flex-1 items-end"><div className="w-full rounded-t-[6px] bg-ink transition-all" style={{ height: `${Math.max(3, (w.value / max) * 100)}%`, opacity: w.value ? 1 : 0.15 }} title={money(w.value, 'TMT')} /></div><span className="num text-[10px] text-faint">{date(w.start).split(' ').slice(0, 2).join(' ')}</span></div>)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label={t('biz.suppliers')} value={d.usedSuppliers.length} icon={IconFactory} to="/business?tab=suppliers" />
              <StatCard label={t('biz.saved_searches')} value={d.savedSearches.length} icon={IconBookmark} to="/favorites?tab=search" />
              <StatCard label={t('biz.repeat_orders')} value={d.repeatable.length} icon={IconRetry} />
              <StatCard label={t('biz.quotes')} value={d.quotes.filter((x) => x.status === 'responded').length} sub={t('biz.awaiting_decision')} icon={IconUsers} to="/business?tab=quotes" />
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t('biz.recent_invoices')}</h2><Link to="/pay" className="text-[13px] text-muted hover:text-ink">{t('nav.pay')} →</Link></div>
              {d.invoices.slice(0, 4).map((i) => <Link key={i.id} to={`/pay/${i.id}`} className="flex items-center justify-between gap-3 border-t border-line py-3 text-sm first:border-0"><span className="min-w-0"><span className="block truncate font-medium">{i.supplierName}</span><span className="num block text-[12px] text-muted">{i.invoiceNumber} · {money(i.amount, i.currency)}</span></span><StatusBadge status={i.status} label={tk(statusKey('invoice', i.status))} /></Link>)}
              {!d.invoices.length ? <p className="text-sm text-muted">{t('pay.none')}</p> : null}
            </div>
            <div className="card p-5">
              <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{t('biz.saved_searches')}</h2></div>
              {d.savedSearches.length ? d.savedSearches.map((s) => <Link key={s.id} to={`/shop?q=${encodeURIComponent(s.refId)}`} className="flex items-center justify-between border-t border-line py-3 text-sm first:border-0"><span>{s.label || s.refId}</span><IconSearch className="size-4 text-faint" aria-hidden /></Link>) : <p className="text-sm text-muted">{t('biz.no_saved_searches')}</p>}
            </div>
          </div>
        </div>
      ) : tab === 'orders' ? (
        <DataTable rows={d.orders} rowKey={(o) => o.id} onRowClick={(o) => navigate(`/orders/${o.id}`)} mobileTitle={(o) => <span className="num">{o.number}</span>}
          empty={<EmptyState title={t('orders.empty')} action={<Button to="/shop">{t('nav.shop')}</Button>} />}
          columns={[
            { key: 'n', header: t('orders.order'), cell: (o) => <Link to={`/orders/${o.id}`} className="num font-medium hover:underline">{o.number}</Link>, mobile: false },
            { key: 'd', header: t('common.date'), cell: (o) => date(o.createdAt) },
            { key: 'i', header: t('orders.items'), cell: (o) => <span className="line-clamp-1 max-w-[260px]">{o.items.map((i) => i.title).join(', ')}</span> },
            { key: 's', header: t('common.status'), cell: (o) => <StatusBadge status={o.status} label={tk(statusKey('order', o.status))} /> },
            { key: 't', header: t('orders.total'), cell: (o) => <span className="num">{money(o.costs.totalTMT, 'TMT')}</span>, className: 'text-right' },
          ]} />
      ) : tab === 'invoices' ? (
        <DataTable rows={d.invoices} rowKey={(i) => i.id} mobileTitle={(i) => i.supplierName}
          empty={<EmptyState title={t('pay.none')} action={<Button to="/pay">{t('nav.pay')}</Button>} />}
          columns={[
            { key: 'n', header: t('pay.invoice_number'), cell: (i) => <Link to={`/pay/${i.id}`} className="num font-medium hover:underline">{i.invoiceNumber}</Link> },
            { key: 's', header: t('find.supplier'), cell: (i) => i.supplierName, mobile: false },
            { key: 'a', header: t('pay.amount'), cell: (i) => <span className="num">{money(i.amount, i.currency)}</span> },
            { key: 'st', header: t('common.status'), cell: (i) => <StatusBadge status={i.status} label={tk(statusKey('invoice', i.status))} /> },
            { key: 't', header: t('pay.total'), cell: (i) => <span className="num">{money(i.totalTMT, 'TMT')}</span>, className: 'text-right' },
          ]} />
      ) : tab === 'quotes' ? (
        d.quotes.length ? <ul className="space-y-3">{d.quotes.map((x) => <QuoteRow key={x.id} q={x} />)}</ul>
          : <EmptyState title={t('biz.no_quotes')} body={t('biz.no_quotes_body')} action={<Button onClick={() => setQuoteOpen(true)}>{t('biz.request_quote')}</Button>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...d.usedSuppliers, ...d.savedSuppliers.filter((s) => !d.usedSuppliers.some((u) => u.id === s!.id))].map((s) => s ? (
            <Link key={s.id} to={`/suppliers/${s.id}`} className="card lift flex items-center gap-4 p-5">
              <SupplierLogo monogram={s.monogram} />
              <div className="min-w-0 flex-1"><div className="truncate font-semibold">{s.name}</div><div className="text-[12px] text-muted">{s.city} · {t('biz.orders_with', { n: d.orders.filter((o) => o.items.some((i) => i.supplierId === s.id)).length })}</div></div>
              <Badge>{num(s.score)}</Badge>
            </Link>
          ) : null)}
        </div>
      )}
      <RequestQuoteModal open={quoteOpen} onClose={() => setQuoteOpen(false)} />
      <Modal open={repeatOpen} onClose={() => setRepeatOpen(false)} title={t('biz.repeat_order')} description={t('biz.repeat_desc')}>
        <ul className="space-y-2">{d.repeatable.map((o) => <li key={o.id} className="flex items-center justify-between gap-3 rounded-[12px] bg-mist p-3"><div className="min-w-0"><div className="num font-medium">{o.number}</div><div className="truncate text-[12px] text-muted">{o.items.map((i) => `${i.title} ×${i.qty}`).join(', ')}</div></div><Button size="sm" onClick={() => repeat(o.id)}>{t('orders.reorder')}</Button></li>)}</ul>
      </Modal>
    </div>
  );
}
