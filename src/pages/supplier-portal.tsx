import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n';
import { useQueryParam } from '@/lib/router';
import { useAction, useQuery } from '@/lib/hooks';
import { supplierService } from '@/services/supplierService';
import { productService } from '@/services/productService';
import type { CategoryId, Product, QuoteRequest, SupplierDocument } from '@/lib/types';
import { Badge, Button, DataTable, EmptyState, ErrorState, Input, Modal, Notice, PageHeader, ScoreRing, Select, SkeletonRows, StatCard, StatusBadge, Tabs, Textarea, UploadBox, useToast, Progress } from '@/components/ui';
import { statusKey } from '@/components/commerce';
import { ProductVisual, SupplierLogo } from '@/components/visuals';
import { usePageTitle } from '@/components/shell';
import { IconCheck, IconEdit, IconFile, IconMoney, IconPackage, IconPlus, IconSend, IconTag, IconX, IconChart, IconWarn } from '@/components/icons';

type Tab = 'dashboard' | 'orders' | 'products' | 'quotes' | 'documents' | 'payouts';
const CATS: CategoryId[] = ['electronics', 'fashion', 'home', 'beauty', 'kids', 'auto', 'tools', 'industrial', 'business'];

export function ProductEditor({ open, onClose, product, supplierId, admin }: { open: boolean; onClose: () => void; product: Product | null; supplierId: string; admin?: boolean }) {
  const { t, tk } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ title: '', categoryId: 'electronics' as CategoryId, priceCNY: '', oldPriceCNY: '', stock: '', moq: '1', leadDays: '5', weightKg: '1', supplierId });
  const [touched, setTouched] = useState(false);
  const save = useAction(productService.save);
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    setF(product ? { title: product.title, categoryId: product.categoryId, priceCNY: String(product.priceCNY), oldPriceCNY: product.oldPriceCNY ? String(product.oldPriceCNY) : '', stock: String(product.stock), moq: String(product.moq), leadDays: String(product.leadDays), weightKg: String(product.weightKg), supplierId: product.supplierId }
      : { title: '', categoryId: 'electronics', priceCNY: '', oldPriceCNY: '', stock: '100', moq: '1', leadDays: '5', weightKg: '1', supplierId });
  }, [open, product, supplierId]);
  const n = (v: string) => Number(v);
  const errs = {
    title: f.title.trim().length < 3 ? t('form.required') : null,
    priceCNY: !(n(f.priceCNY) > 0) ? t('form.invalid_amount') : null,
    oldPriceCNY: f.oldPriceCNY && !(n(f.oldPriceCNY) > n(f.priceCNY)) ? t('admin.old_price_err') : null,
    stock: !/^\d+$/.test(f.stock) ? t('form.invalid_qty') : null,
    moq: !/^\d+$/.test(f.moq) || n(f.moq) < 1 ? t('form.invalid_qty') : null,
    leadDays: !/^\d+$/.test(f.leadDays) || n(f.leadDays) < 1 ? t('form.invalid_qty') : null,
    weightKg: !(n(f.weightKg) > 0) ? t('form.invalid_amount') : null,
  };
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Modal open={open} onClose={onClose} title={product ? t('admin.edit_product') : t('admin.new_product')} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.pending} onClick={async () => {
        setTouched(true); if (Object.values(errs).some(Boolean)) return;
        const r = await save.run({ id: product?.id, title: f.title.trim(), categoryId: f.categoryId, supplierId: f.supplierId, priceCNY: n(f.priceCNY), oldPriceCNY: f.oldPriceCNY ? n(f.oldPriceCNY) : undefined, stock: n(f.stock), moq: n(f.moq), leadDays: n(f.leadDays), weightKg: n(f.weightKg) });
        if (r) { toast(t('admin.saved')); onClose(); }
      }}>{t('common.save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Input label={t('admin.f.title')} value={f.title} onChange={set('title')} error={touched ? errs.title : null} /></div>
        <Select label={t('shop.category')} value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })} options={CATS.map((c) => ({ value: c, label: tk(`cat.${c}`) }))} />
        {admin ? <Input label={t('find.supplier')} value={f.supplierId} onChange={set('supplierId')} hint={t('admin.supplier_id_hint')} /> : <div />}
        <Input label={t('admin.f.price')} value={f.priceCNY} onChange={set('priceCNY')} inputMode="decimal" prefix="¥" error={touched ? errs.priceCNY : null} />
        <Input label={t('admin.f.old_price')} value={f.oldPriceCNY} onChange={set('oldPriceCNY')} inputMode="decimal" prefix="¥" optional error={touched ? errs.oldPriceCNY : null} />
        <Input label={t('admin.f.stock')} value={f.stock} onChange={set('stock')} inputMode="numeric" error={touched ? errs.stock : null} />
        <Input label={t('common.moq')} value={f.moq} onChange={set('moq')} inputMode="numeric" error={touched ? errs.moq : null} />
        <Input label={t('admin.f.lead_days')} value={f.leadDays} onChange={set('leadDays')} inputMode="numeric" error={touched ? errs.leadDays : null} />
        <Input label={t('admin.f.weight')} value={f.weightKg} onChange={set('weightKg')} inputMode="decimal" error={touched ? errs.weightKg : null} />
        <div className="sm:col-span-2"><UploadBox compact accept="image/*" onFile={(file) => toast(t('admin.image_uploaded', { name: file.name }))} label={t('admin.upload_images')} hint={t('admin.upload_images_hint')} /></div>
        {save.error ? <div className="sm:col-span-2"><Notice tone="bad">{t('form.server_error')}</Notice></div> : null}
      </div>
    </Modal>
  );
}

function RespondModal({ quote, onClose }: { quote: QuoteRequest | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [price, setPrice] = useState('');
  const [lead, setLead] = useState('14');
  const [msg, setMsg] = useState('');
  const [touched, setTouched] = useState(false);
  const respond = useAction(supplierService.respondQuote);
  useEffect(() => { if (quote) { setPrice(quote.targetPriceUSD ? String(quote.targetPriceUSD) : ''); setLead('14'); setMsg(''); setTouched(false); } }, [quote]);
  if (!quote) return null;
  const errs = { price: !(Number(price) > 0) ? t('form.invalid_amount') : null, lead: !(Number(lead) > 0) ? t('form.invalid_qty') : null, msg: msg.trim().length < 5 ? t('form.required') : null };
  return (
    <Modal open onClose={onClose} title={t('sp.respond')} description={`${quote.productTitle} · ${t('biz.qty_n', { n: quote.qty })}`}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button icon={IconSend} loading={respond.pending} onClick={async () => { setTouched(true); if (Object.values(errs).some(Boolean)) return; const ok = await respond.run(quote.id, { unitPriceUSD: Number(price), leadDays: Number(lead), message: msg.trim() }); if (ok) { toast(t('sp.responded')); onClose(); } }}>{t('common.send')}</Button></>}>
      <div className="space-y-4">
        {quote.notes ? <Notice tone="neutral">{quote.notes}</Notice> : null}
        <div className="grid grid-cols-2 gap-3"><Input label={t('ai.unit_price')} value={price} onChange={setPrice} prefix="$" inputMode="decimal" error={touched ? errs.price : null} /><Input label={t('sp.lead_days')} value={lead} onChange={(v) => setLead(v.replace(/\D/g, ''))} inputMode="numeric" error={touched ? errs.lead : null} /></div>
        <Textarea label={t('sup.message')} value={msg} onChange={setMsg} rows={3} error={touched ? errs.msg : null} />
      </div>
    </Modal>
  );
}

export function SupplierPortalPage() {
  const { t, tk, money, date, num } = useI18n();
  usePageTitle(t('nav.supplier_portal'));
  const toast = useToast();
  const [tabQ, setTab] = useQueryParam('tab');
  const tab = (tabQ || 'dashboard') as Tab;
  const q = useQuery(() => supplierService.portal(), []);
  const [editor, setEditor] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
  const [respond, setRespond] = useState<QuoteRequest | null>(null);
  const [docKind, setDocKind] = useState<SupplierDocument['kind']>('certificate');
  const decide = useAction(supplierService.decideOrder);
  const upload = useAction(supplierService.uploadDocument);
  const stock = useAction(productService.update);
  if (q.loading) return <SkeletonRows count={6} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={q.reload} />;
  const { supplier: s, orders, products, quotes, payouts } = q.data;
  const awaiting = orders.filter((o) => o.supplierStatus === 'awaiting' && o.status !== 'cancelled');
  const lowStock = products.filter((p) => p.stock < 150);
  const pendingQuotes = quotes.filter((x) => x.status === 'sent');
  const revenue = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.items.filter((i) => i.supplierId === s.id).reduce((a, i) => a + i.unitPriceCNY * i.qty, 0), 0);
  const topProducts = products.map((p) => ({ p, units: orders.reduce((a, o) => a + o.items.filter((i) => i.productId === p.id).reduce((x, i) => x + i.qty, 0), 0) })).sort((a, b) => b.units - a.units).slice(0, 5);
  const maxUnits = Math.max(1, ...topProducts.map((x) => x.units));
  return (
    <div>
      <PageHeader eyebrow={t('sp.eyebrow')} title={<span className="flex items-center gap-3"><SupplierLogo monogram={s.monogram} size={44} />{s.name}</span>} subtitle={`${s.nameCn} · ${s.city}`}
        actions={<Button icon={IconPlus} onClick={() => setEditor({ open: true, product: null })}>{t('sp.add_product')}</Button>} />
      <Tabs value={tab} onChange={(v) => setTab(v === 'dashboard' ? '' : v)} className="mb-6" label={t('nav.supplier_portal')}
        items={[{ value: 'dashboard', label: t('sp.tab.dashboard') }, { value: 'orders', label: t('sp.tab.orders'), count: awaiting.length }, { value: 'products', label: t('sp.tab.products'), count: products.length }, { value: 'quotes', label: t('sp.tab.quotes'), count: pendingQuotes.length }, { value: 'documents', label: t('sp.tab.documents') }, { value: 'payouts', label: t('sp.tab.payouts') }]} />
      {tab === 'dashboard' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard tone="dark" label={t('sp.new_orders')} value={awaiting.length} icon={IconPackage} to="/supplier?tab=orders" />
            <StatCard label={t('sp.products')} value={products.length} icon={IconTag} to="/supplier?tab=products" />
            <StatCard label={t('sp.low_stock')} value={lowStock.length} icon={IconWarn} to="/supplier?tab=products" />
            <StatCard label={t('sp.open_quotes')} value={pendingQuotes.length} icon={IconSend} to="/supplier?tab=quotes" />
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_300px]">
            <div className="card p-5"><div className="eyebrow">{t('sp.revenue')}</div><div className="num mt-2 text-3xl font-medium">{money(revenue, 'CNY')}</div><div className="mt-1 text-[12px] text-muted">{t('sp.revenue_sub')}</div>
              <div className="mt-6 eyebrow">{t('sp.payouts')}</div><div className="num mt-1 text-lg">{money(payouts.filter((p) => p.status === 'scheduled').reduce((a, p) => a + p.amountCNY, 0), 'CNY')} <span className="text-[12px] text-muted">{t('sp.scheduled')}</span></div></div>
            <div className="card p-5"><div className="mb-4 flex items-center justify-between"><span className="eyebrow">{t('sp.analytics')}</span><IconChart className="size-4 text-faint" aria-hidden /></div>
              <ul className="space-y-3">{topProducts.map(({ p, units }) => <li key={p.id}><div className="mb-1 flex justify-between gap-3 text-[12px]"><span className="truncate">{p.title}</span><span className="num">{units}</span></div><Progress value={units} max={maxUnits} label={p.title} /></li>)}</ul></div>
            <div className="card flex flex-col items-center p-5 text-center"><ScoreRing score={s.score} label={t('score.supplier')} /><div className="mt-3 font-semibold">{t('score.cargo_one')}</div><div className="mt-1 text-[12px] text-muted">{t('sp.score_factors', { ontime: s.onTimeRate, response: s.responseRate })}</div></div>
          </div>
        </div>
      ) : tab === 'orders' ? (
        <DataTable rows={orders} rowKey={(o) => o.id} mobileTitle={(o) => <span className="num">{o.number}</span>} empty={<EmptyState title={t('sp.no_orders')} />}
          columns={[
            { key: 'n', header: t('orders.order'), cell: (o) => <span className="num font-medium">{o.number}</span>, mobile: false },
            { key: 'd', header: t('common.date'), cell: (o) => date(o.createdAt) },
            { key: 'i', header: t('orders.items'), cell: (o) => <span className="line-clamp-1 max-w-[260px]">{o.items.filter((i) => i.supplierId === s.id).map((i) => `${i.title} ×${i.qty}`).join(', ')}</span> },
            { key: 's', header: t('common.status'), cell: (o) => <StatusBadge status={o.supplierStatus === 'awaiting' && o.status !== 'cancelled' ? 'pending' : o.supplierStatus} label={tk(`orders.supplier_status.${o.supplierStatus}`)} /> },
            { key: 'a', header: t('common.actions'), cell: (o) => o.supplierStatus === 'awaiting' && o.status !== 'cancelled' ? <div className="flex gap-1"><Button size="sm" icon={IconCheck} loading={decide.pending} onClick={async () => { await decide.run(o.id, true); toast(t('sp.accepted')); }}>{t('biz.accept')}</Button><Button size="sm" variant="secondary" icon={IconX} onClick={async () => { await decide.run(o.id, false); toast(t('sp.rejected')); }}>{t('sp.reject')}</Button></div> : <span className="text-[12px] text-muted">—</span> },
          ]} />
      ) : tab === 'products' ? (
        <DataTable rows={products} rowKey={(p) => p.id} mobileTitle={(p) => p.title} empty={<EmptyState title={t('sup.no_products')} action={<Button onClick={() => setEditor({ open: true, product: null })}>{t('sp.add_product')}</Button>} />}
          columns={[
            { key: 'p', header: t('admin.f.title'), cell: (p) => <div className="flex items-center gap-3"><ProductVisual icon={p.icon} image={p.images[0]} className="size-10" /><span className="line-clamp-1 font-medium">{p.title}</span></div>, mobile: false },
            { key: 'pr', header: t('admin.f.price'), cell: (p) => <span className="num">{money(p.priceCNY, 'CNY')}</span> },
            { key: 'st', header: t('admin.f.stock'), cell: (p) => <div className="flex items-center justify-end gap-2 md:justify-start"><input aria-label={t('admin.f.stock')} defaultValue={p.stock} inputMode="numeric" className="num h-8 w-20 rounded-[8px] bg-mist px-2 text-[13px] outline-none focus:ring-1 focus:ring-ink" onBlur={async (e: { target: HTMLInputElement }) => { const v = Number(e.target.value); if (Number.isInteger(v) && v >= 0 && v !== p.stock) { await stock.run(p.id, { stock: v }); toast(t('sp.stock_updated')); } else e.target.value = String(p.stock); }} />{p.stock < 150 ? <Badge tone="warn">{t('sp.low')}</Badge> : null}</div> },
            { key: 'pub', header: t('common.status'), cell: (p) => <StatusBadge status={p.published ? 'active' : 'pending'} label={p.published ? t('admin.published') : t('sp.awaiting_review')} /> },
            { key: 'e', header: t('common.actions'), cell: (p) => <Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setEditor({ open: true, product: p })}>{t('common.edit')}</Button> },
          ]} />
      ) : tab === 'quotes' ? (
        quotes.length ? <ul className="space-y-3">{quotes.map((x) => <li key={x.id} className="card flex flex-wrap items-center gap-4 p-5"><div className="min-w-0 flex-1"><div className="font-semibold">{x.productTitle}</div><div className="text-[12px] text-muted">{t('biz.qty_n', { n: x.qty })}{x.targetPriceUSD ? ` · ${t('ai.target_price')} ${money(x.targetPriceUSD, 'USD', { decimals: 2 })}` : ''} · {date(x.createdAt)}{x.kind === 'sample' ? ` · ${t('biz.sample')}` : ''}</div>{x.notes ? <p className="mt-1 text-[13px] text-muted">“{x.notes}”</p> : null}</div><StatusBadge status={x.status} label={tk(statusKey('quote', x.status))} />{x.status === 'sent' ? <Button size="sm" icon={IconSend} onClick={() => setRespond(x)}>{t('sp.respond')}</Button> : null}</li>)}</ul>
          : <EmptyState title={t('sp.no_quotes')} />
      ) : tab === 'documents' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <ul className="space-y-2">{s.documents.map((d) => <li key={d.id} className="card flex items-center gap-3 p-4"><IconFile className="size-5 text-muted" aria-hidden /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{d.name}</div><div className="text-[12px] text-muted">{tk(`sup.doc.${d.kind}`)} · {date(d.uploadedAt)}</div></div><StatusBadge status={d.status} label={tk(`status.doc.${d.status}`)} /></li>)}</ul>
          <div className="card space-y-4 p-5">
            <Select label={t('sp.doc_type')} value={docKind} onChange={setDocKind} options={(['license', 'certificate', 'bank', 'other'] as const).map((k) => ({ value: k, label: tk(`sup.doc.${k}`) }))} />
            <UploadBox accept=".pdf,image/*" busy={upload.pending} onFile={async (f) => { await upload.run(s.id, f.name, docKind); toast(t('sp.doc_uploaded')); }} label={t('sp.upload_doc')} hint={t('sp.upload_doc_hint')} compact />
          </div>
        </div>
      ) : (
        <DataTable rows={payouts} rowKey={(p) => p.id} empty={<EmptyState icon={IconMoney} title={t('sp.no_payouts')} />}
          columns={[
            { key: 'd', header: t('common.date'), cell: (p) => date(p.date) },
            { key: 'o', header: t('nav.orders'), cell: (p) => <span className="num">{num(p.orders)}</span> },
            { key: 'a', header: t('pay.amount'), cell: (p) => <span className="num font-medium">{money(p.amountCNY, 'CNY')}</span> },
            { key: 's', header: t('common.status'), cell: (p) => <StatusBadge status={p.status} label={tk(`status.payout.${p.status}`)} /> },
          ]} />
      )}
      <ProductEditor open={editor.open} product={editor.product} supplierId={s.id} onClose={() => setEditor({ open: false, product: null })} />
      <RespondModal quote={respond} onClose={() => setRespond(null)} />
    </div>
  );
}
