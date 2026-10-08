import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useI18n } from '@/i18n';
import { Link, navigate } from '@/lib/router';
import { useAction, useDebounced, useQuery } from '@/lib/hooks';
import { userService } from '@/services/accountServices';
import { authService } from '@/services/authService';
import { orderService } from '@/services/orderService';
import { productService } from '@/services/productService';
import { supplierService } from '@/services/supplierService';
import { paymentService } from '@/services/paymentService';
import { invoiceService } from '@/services/invoiceService';
import { promotionService } from '@/services/vipService';
import { db } from '@/services/db';
import type { Invoice, InvoiceStatus, OrderStatus, Product, Role, Supplier, User } from '@/lib/types';
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, Input, MiniSelect, Modal, Notice, ScoreRing, Select, SkeletonRows, StatusBadge, Switch, Textarea, useToast } from '@/components/ui';
import { statusKey } from '@/components/commerce';
import { presentedPrice } from '@/lib/catalog';
import { ProductVisual } from '@/components/visuals';
import { ProductEditor } from '../supplier-portal';
import { IconCheck, IconEdit, IconEye, IconPercent, IconPlus, IconSearch, IconTrash, IconX, IconFile, IconStar, IconBan } from '@/components/icons';

export function Toolbar({ q, setQ, children, placeholder }: { q?: string; setQ?: (v: string) => void; children?: ReactNode; placeholder?: string }) {
  const { t } = useI18n();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {setQ ? (
        <div className="relative min-w-[200px] flex-1">
          <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e: { target: HTMLInputElement }) => setQ(e.target.value)} placeholder={placeholder || t('common.search')} aria-label={placeholder || t('common.search')} className="h-9 w-full rounded-[10px] bg-paper pl-9 pr-3 text-[13px] outline-none hairline focus:shadow-[inset_0_0_0_1.5px_var(--color-ink)]" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

// ---------------- USERS ----------------
function UserEditor({ row, onClose }: { row: { user: User } | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', phone: '', city: '', role: 'personal' as Role, status: 'active' as User['status'] });
  const save = useAction(async (id: string) => {
    await userService.update(id, f);
    try { await authService.adminUpdateUser(id, { status: f.status, role: f.role }); } catch { /* user exists only in mock DB */ }
    return true;
  });
  useEffect(() => { if (row) setF({ name: row.user.name, email: row.user.email, phone: row.user.phone, city: row.user.city, role: row.user.role, status: row.user.status }); }, [row]);
  if (!row) return null;
  const errs = { name: f.name.trim().length < 2 ? t('form.required') : null, email: !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email) ? t('form.invalid_email') : null };
  return (
    <Modal open onClose={onClose} title={t('admin.edit_user')} description={row.user.id}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.pending} disabled={!!errs.name || !!errs.email} onClick={async () => { if (await save.run(row.user.id)) { toast(t('admin.saved')); onClose(); } }}>{t('common.save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label={t('auth.full_name')} value={f.name} onChange={(v) => setF({ ...f, name: v })} error={errs.name} />
        <Input label={t('auth.email')} value={f.email} onChange={(v) => setF({ ...f, email: v })} error={errs.email} />
        <Input label={t('auth.phone')} value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
        <Input label={t('address.city')} value={f.city} onChange={(v) => setF({ ...f, city: v })} />
        <Select label={t('admin.role')} value={f.role} onChange={(v) => setF({ ...f, role: v })} options={(['personal', 'business', 'supplier', 'admin'] as const).map((r) => ({ value: r, label: t(`role.${r}`) }))} />
        <Select label={t('common.status')} value={f.status} onChange={(v) => setF({ ...f, status: v })} options={[{ value: 'active', label: t('status.user.active') }, { value: 'suspended', label: t('status.user.suspended') }]} />
        <div className="sm:col-span-2"><Notice tone="neutral">{t('admin.role_server_note')}</Notice></div>
      </div>
    </Modal>
  );
}

export function UsersSection() {
  const { t, money, date, tk } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const dq = useDebounced(q, 200);
  const list = useQuery(() => userService.listAll(dq, role, status), [dq, role, status]);
  const [edit, setEdit] = useState<{ user: User } | null>(null);
  const [view, setView] = useState<string | null>(null);
  const vip = useAction(userService.setVip);
  const suspend = useAction(async (u: User) => {
    const next = u.status === 'active' ? 'suspended' : 'active';
    await userService.update(u.id, { status: next });
    try { await authService.adminUpdateUser(u.id, { status: next }); } catch { /* mock-only user */ }
    return next;
  });
  const viewRow = list.data?.find((r) => r.user.id === view);
  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder={t('admin.search_users')}>
        <MiniSelect label={t('admin.role')} value={role} onChange={setRole} options={[{ value: '', label: `${t('admin.role')}: ${t('common.all')}` }, ...(['personal', 'business', 'supplier', 'admin'] as const).map((r) => ({ value: r, label: t(`role.${r}`) }))]} />
        <MiniSelect label={t('common.status')} value={status} onChange={setStatus} options={[{ value: '', label: `${t('common.status')}: ${t('common.all')}` }, { value: 'active', label: t('status.user.active') }, { value: 'suspended', label: t('status.user.suspended') }]} />
      </Toolbar>
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={list.data!} rowKey={(r) => r.user.id} mobileTitle={(r) => r.user.name} empty={<EmptyState title={t('admin.no_results')} />}
          columns={[
            { key: 'n', header: t('auth.full_name'), cell: (r) => <div><div className="font-medium">{r.user.name}</div><div className="text-[11px] text-muted">{r.user.email}</div></div>, mobile: false },
            { key: 'r', header: t('admin.role'), cell: (r) => <Badge>{t(`role.${r.user.role}`)}</Badge> },
            { key: 's', header: t('common.status'), cell: (r) => <StatusBadge status={r.user.status} label={tk(statusKey('user', r.user.status))} /> },
            { key: 'v', header: 'VIP', cell: (r) => (r.vip ? <Badge tone="dark">VIP</Badge> : <span className="text-faint">—</span>) },
            { key: 'o', header: t('nav.orders'), cell: (r) => <span className="num">{r.orders}</span> },
            { key: 'sp', header: t('admin.spending'), cell: (r) => <span className="num">{money(r.spentTMT, 'TMT', { decimals: 0 })}</span> },
            { key: 'a', header: t('admin.last_active'), cell: (r) => date(r.user.lastActiveAt) },
            { key: 'x', header: t('common.actions'), cell: (r) => (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" icon={IconEye} onClick={() => setView(r.user.id)} aria-label={t('admin.view')} />
                <Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setEdit({ user: r.user })} aria-label={t('common.edit')} />
                <Button size="sm" variant="ghost" onClick={async () => { const s = await suspend.run(r.user); if (s) toast(s === 'suspended' ? t('admin.user_suspended') : t('admin.user_activated')); }}>{r.user.status === 'active' ? t('admin.suspend') : t('admin.activate')}</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await vip.run(r.user.id, !r.vip); toast(r.vip ? t('admin.vip_revoked') : t('admin.vip_granted')); }}>{r.vip ? t('admin.revoke_vip') : t('admin.grant_vip')}</Button>
              </div>
            ) },
          ]} />
      )}
      <UserEditor row={edit} onClose={() => setEdit(null)} />
      {viewRow ? (
        <Modal open onClose={() => setView(null)} title={viewRow.user.name} description={viewRow.user.email} size="lg">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[12px] bg-mist p-4"><div className="text-[12px] text-muted">{t('nav.orders')}</div><div className="num text-xl font-semibold">{viewRow.orders}</div></div>
            <div className="rounded-[12px] bg-mist p-4"><div className="text-[12px] text-muted">{t('admin.spending')}</div><div className="num text-xl font-semibold">{money(viewRow.spentTMT, 'TMT', { decimals: 0 })}</div></div>
            <div className="rounded-[12px] bg-mist p-4"><div className="text-[12px] text-muted">{t('admin.joined')}</div><div className="text-xl font-semibold">{date(viewRow.user.createdAt)}</div></div>
          </div>
          {viewRow.business ? <div className="mt-4 rounded-[12px] bg-paper p-4 hairline text-sm"><div className="font-semibold">{viewRow.business.companyName}</div><div className="text-muted">{viewRow.business.industry} · {viewRow.business.taxId} · {money(viewRow.business.monthlyVolumeUSD, 'USD')}/{t('vip.month')}</div></div> : null}
          <div className="eyebrow mb-2 mt-6">{t('admin.activity')}</div>
          <ul className="space-y-1.5 text-sm">{db().orders.filter((o) => o.userId === viewRow.user.id).slice(0, 6).map((o) => <li key={o.id} className="flex justify-between gap-3"><Link to={`/orders/${o.id}`} className="num hover:underline">{o.number}</Link><span className="text-muted">{date(o.createdAt)}</span><StatusBadge status={o.status} label={tk(statusKey('order', o.status))} /></li>)}</ul>
        </Modal>
      ) : null}
    </div>
  );
}

// ---------------- ORDERS ----------------
export function OrdersSection() {
  const { t, tk, money, date } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = useQuery(() => orderService.listAll(), []);
  const set = useAction(orderService.adminSetStatus);
  const rows = (list.data || []).filter((o) => (!status || o.status === status) && (!q || `${o.number} ${o.items.map((i) => i.title).join(' ')}`.toLowerCase().includes(q.toLowerCase())));
  const STATUSES: OrderStatus[] = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];
  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder={t('admin.search_orders')}>
        <MiniSelect label={t('common.status')} value={status} onChange={setStatus} options={[{ value: '', label: `${t('common.status')}: ${t('common.all')}` }, ...STATUSES.map((s) => ({ value: s, label: tk(statusKey('order', s)) }))]} />
      </Toolbar>
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={rows} rowKey={(o) => o.id} mobileTitle={(o) => <span className="num">{o.number}</span>} empty={<EmptyState title={t('admin.no_results')} />}
          columns={[
            { key: 'n', header: t('orders.order'), cell: (o) => <Link to={`/orders/${o.id}`} className="num font-medium hover:underline">{o.number}</Link>, mobile: false },
            { key: 'c', header: t('admin.customer'), cell: (o) => db().users.find((u) => u.id === o.userId)?.name || o.userId },
            { key: 'd', header: t('common.date'), cell: (o) => date(o.createdAt) },
            { key: 'src', header: t('admin.source'), cell: (o) => <Badge>{tk(`admin.src.${o.source}`)}</Badge> },
            { key: 't', header: t('orders.total'), cell: (o) => <span className="num">{money(o.costs.totalTMT, 'TMT')}</span> },
            { key: 's', header: t('common.status'), cell: (o) => <MiniSelect label={t('common.status')} value={o.status} onChange={async (v) => { await set.run(o.id, v); toast(t('admin.saved')); }} options={STATUSES.map((s) => ({ value: s, label: tk(statusKey('order', s)) }))} /> },
          ]} />
      )}
    </div>
  );
}

// ---------------- PRODUCTS ----------------
export function ProductsSection() {
  const { t, tk, money } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const dq = useDebounced(q, 200);
  const list = useQuery(() => productService.list({ q: dq, category: cat as Product['categoryId'] | '', includeUnpublished: true, pageSize: 500, sort: 'newest' }), [dq, cat]);
  const [editor, setEditor] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
  const [del, setDel] = useState<Product | null>(null);
  const [promo, setPromo] = useState<Product | null>(null);
  const [pct, setPct] = useState('10');
  const upd = useAction(productService.update);
  const remove = useAction(productService.remove);
  const savePromo = useAction(promotionService.save);
  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder={t('admin.search_products')}>
        <MiniSelect label={t('shop.category')} value={cat} onChange={setCat} options={[{ value: '', label: `${t('shop.category')}: ${t('common.all')}` }, ...db().categories.map((c) => ({ value: c.id, label: tk(`cat.${c.id}`) }))]} />
        <Button size="sm" icon={IconPlus} onClick={() => setEditor({ open: true, product: null })}>{t('admin.new_product')}</Button>
      </Toolbar>
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={list.data!.items} rowKey={(p) => p.id} mobileTitle={(p) => p.title} empty={<EmptyState title={t('admin.no_results')} />}
          columns={[
            { key: 'p', header: t('admin.f.title'), cell: (p) => <div className="flex items-center gap-3"><ProductVisual icon={p.icon} image={p.images[0]} className="size-9" /><Link to={`/shop/${p.id}`} className="line-clamp-1 max-w-[220px] font-medium hover:underline">{p.title}</Link></div>, mobile: false },
            { key: 'c', header: t('shop.category'), cell: (p) => tk(`cat.${p.categoryId}`) },
            { key: 'pr', header: t('admin.f.price'), cell: (p) => { const sp = presentedPrice(p); return sp ? <span className="num">{money(sp.amount, sp.currency)}</span> : <Badge tone="warn">{t('cat.price_unavailable')}</Badge>; } },
            { key: 'st', header: t('admin.f.stock'), cell: (p) => (p.availability === 'unknown' ? <span className="text-faint">—</span> : <span className="num">{p.stock}</span>) },
            { key: 'or', header: t('cat.source_name'), cell: (p) => <div className="flex flex-wrap gap-1">{p.sample ? <Badge tone="warn">{t('cat.sample_data')}</Badge> : p.demo ? <Badge>{t('cat.demo_data')}</Badge> : null}{p.pricing && p.pricing.status !== 'estimate' ? <Badge tone="info">{p.pricing.status}</Badge> : null}{p.source?.syncStatus === 'error' ? <Badge tone="bad">sync</Badge> : null}</div> },
            { key: 'sup', header: t('find.supplier'), cell: (p) => <span className="text-[12px]">{db().suppliers.find((s) => s.id === p.supplierId)?.name.split(' ').slice(0, 2).join(' ')}</span> },
            { key: 'pub', header: t('admin.published'), cell: (p) => <Switch hideLabel label={t('admin.published')} checked={p.published} onChange={async (v) => { await upd.run(p.id, { published: v }); toast(v ? t('admin.published_toast') : t('admin.unpublished_toast')); }} /> },
            { key: 'f', header: t('admin.featured'), cell: (p) => <button type="button" aria-pressed={p.featured} aria-label={t('admin.featured')} onClick={async () => { await upd.run(p.id, { featured: !p.featured }); }} className={p.featured ? 'text-ink' : 'text-line hover:text-faint'}><IconStar className={p.featured ? 'size-5 fill-current' : 'size-5'} aria-hidden /></button> },
            { key: 'x', header: t('common.actions'), cell: (p) => <div className="flex gap-1"><Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setEditor({ open: true, product: p })} aria-label={t('common.edit')} /><Button size="sm" variant="ghost" icon={IconPercent} onClick={() => setPromo(p)} aria-label={t('admin.create_promo')} /><Button size="sm" variant="ghost" icon={IconTrash} onClick={() => setDel(p)} aria-label={t('common.delete')} /></div> },
          ]} />
      )}
      <ProductEditor open={editor.open} product={editor.product} supplierId={editor.product?.supplierId || 's1'} admin onClose={() => setEditor({ open: false, product: null })} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={t('admin.delete_product')} body={del?.title} confirmLabel={t('common.delete')} danger loading={remove.pending} onConfirm={async () => { if (del) await remove.run(del.id); setDel(null); toast(t('admin.deleted')); }} />
      <Modal open={!!promo} onClose={() => setPromo(null)} title={t('admin.create_promo')} description={promo?.title}
        footer={<><Button variant="secondary" onClick={() => setPromo(null)}>{t('common.cancel')}</Button><Button loading={savePromo.pending} disabled={!(Number(pct) > 0 && Number(pct) < 90)} onClick={async () => {
          if (!promo) return;
          const newPrice = Math.round(promo.priceCNY * (1 - Number(pct) / 100));
          await savePromo.run({ kind: 'price_drop', name: `${promo.title} −${pct}%`, discountPct: Number(pct), productIds: [promo.id], status: 'active', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 14 * 86_400_000).toISOString(), eligibility: 'All customers', rules: '' });
          await upd.run(promo.id, { oldPriceCNY: promo.oldPriceCNY || promo.priceCNY, priceCNY: newPrice, tags: [...new Set([...promo.tags, 'price_drop' as const])] });
          toast(t('admin.promo_created')); setPromo(null);
        }}>{t('common.save')}</Button></>}>
        <Input label={t('admin.discount_pct')} value={pct} onChange={(v) => setPct(v.replace(/\D/g, ''))} inputMode="numeric" hint={promo ? t('admin.new_price', { price: money(Math.round(promo.priceCNY * (1 - Number(pct || 0) / 100)), 'CNY') }) : undefined} />
      </Modal>
    </div>
  );
}

// ---------------- SUPPLIERS ----------------
export function SuppliersSection() {
  const { t, tk, date } = useI18n();
  const toast = useToast();
  const [q, setQ] = useState('');
  const list = useQuery(() => supplierService.list({ q, includeAll: true }), [q]);
  const upd = useAction(supplierService.adminUpdate);
  const docStatus = useAction(supplierService.setDocumentStatus);
  const [view, setView] = useState<string | null>(null);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [ef, setEf] = useState({ name: '', description: '', moq: '' });
  useEffect(() => { if (edit) setEf({ name: edit.name, description: edit.description, moq: String(edit.moq) }); }, [edit]);
  const s = list.data?.find((x) => x.id === view);
  const act = async (id: string, patch: Partial<Supplier>, msg: string) => { await upd.run(id, patch); toast(msg); };
  return (
    <div>
      <Toolbar q={q} setQ={setQ} placeholder={t('sup.search_ph')} />
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={list.data!} rowKey={(x) => x.id} mobileTitle={(x) => x.name}
          columns={[
            { key: 'n', header: t('find.supplier'), cell: (x) => <div><div className="font-medium">{x.name}</div><div className="text-[11px] text-muted">{x.city}</div></div>, mobile: false },
            { key: 'st', header: t('common.status'), cell: (x) => <StatusBadge status={x.status} label={tk(statusKey('supplier', x.status))} /> },
            { key: 'v', header: t('admin.verified'), cell: (x) => (x.verified ? <Badge tone="dark">✓</Badge> : <span className="text-faint">—</span>) },
            { key: 'sc', header: t('score.short'), cell: (x) => <span className="num font-semibold">{x.score}</span> },
            { key: 'o', header: t('nav.orders'), cell: (x) => <span className="num">{x.ordersCount}</span> },
            { key: 'c', header: t('admin.complaints'), cell: (x) => <span className="num">{x.complaints}</span> },
            { key: 'x', header: t('common.actions'), cell: (x) => (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="ghost" icon={IconEye} onClick={() => setView(x.id)} aria-label={t('admin.view')} />
                <Button size="sm" variant="ghost" icon={IconEdit} onClick={() => setEdit(x)} aria-label={t('common.edit')} />
                {x.status !== 'approved' ? <Button size="sm" variant="ghost" icon={IconCheck} onClick={() => act(x.id, { status: 'approved' }, t('admin.supplier_approved'))}>{t('admin.approve')}</Button> : null}
                {x.status === 'pending' ? <Button size="sm" variant="ghost" icon={IconX} onClick={() => act(x.id, { status: 'rejected' }, t('admin.supplier_rejected'))}>{t('sp.reject')}</Button> : null}
                <Button size="sm" variant="ghost" onClick={() => act(x.id, { verified: !x.verified }, x.verified ? t('admin.unverified_toast') : t('admin.verified_toast'))}>{x.verified ? t('admin.unverify') : t('admin.verify')}</Button>
                {x.status === 'approved' ? <Button size="sm" variant="ghost" icon={IconBan} onClick={() => act(x.id, { status: 'suspended' }, t('admin.supplier_suspended'))}>{t('admin.suspend')}</Button> : null}
              </div>
            ) },
          ]} />
      )}
      {s ? (
        <Modal open onClose={() => setView(null)} title={s.name} description={`${s.nameCn} · ${s.city}`} size="lg">
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <ScoreRing score={s.score} label={t('score.supplier')} />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-[10px] bg-mist p-3">{t('sup.f.on_time')}: <b className="num">{s.onTimeRate}%</b></div>
              <div className="rounded-[10px] bg-mist p-3">{t('sup.response_rate')}: <b className="num">{s.responseRate}%</b></div>
              <div className="rounded-[10px] bg-mist p-3">{t('admin.dispute_rate')}: <b className="num">{s.disputeRate}%</b></div>
              <div className="rounded-[10px] bg-mist p-3">{t('admin.complaints')}: <b className="num">{s.complaints}</b></div>
            </div>
          </div>
          <div className="eyebrow mb-2 mt-6">{t('sup.documents')}</div>
          <ul className="space-y-2">{s.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-[12px] bg-paper p-3 hairline">
              <IconFile className="size-4 text-muted" aria-hidden /><span className="flex-1 text-sm">{d.name}<span className="block text-[11px] text-muted">{tk(`sup.doc.${d.kind}`)} · {date(d.uploadedAt)}</span></span>
              <StatusBadge status={d.status} label={tk(`status.doc.${d.status}`)} />
              {d.status !== 'approved' ? <Button size="sm" variant="ghost" onClick={async () => { await docStatus.run(s.id, d.id, 'approved'); toast(t('admin.saved')); }}>{t('admin.approve')}</Button> : null}
              {d.status !== 'rejected' ? <Button size="sm" variant="ghost" onClick={async () => { await docStatus.run(s.id, d.id, 'rejected'); toast(t('admin.saved')); }}>{t('sp.reject')}</Button> : null}
            </li>
          ))}</ul>
          <div className="eyebrow mb-2 mt-6">{t('nav.orders')}</div>
          <ul className="space-y-1 text-sm">{db().orders.filter((o) => o.items.some((i) => i.supplierId === s.id)).slice(0, 8).map((o) => <li key={o.id} className="flex justify-between"><Link to={`/orders/${o.id}`} className="num hover:underline">{o.number}</Link><StatusBadge status={o.status} label={tk(statusKey('order', o.status))} /></li>)}</ul>
          <div className="mt-6"><Button variant="secondary" size="sm" onClick={() => navigate(`/suppliers/${s.id}`)}>{t('sup.view_profile')}</Button></div>
        </Modal>
      ) : null}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={t('admin.edit_supplier')} description={edit?.name}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button><Button disabled={ef.name.trim().length < 2 || !(Number(ef.moq) >= 1)} loading={upd.pending} onClick={async () => { if (edit) { await upd.run(edit.id, { name: ef.name.trim(), description: ef.description, moq: Number(ef.moq) }); toast(t('admin.saved')); setEdit(null); } }}>{t('common.save')}</Button></>}>
        <div className="space-y-4">
          <Input label={t('admin.f.title')} value={ef.name} onChange={(v) => setEf({ ...ef, name: v })} error={ef.name.trim().length < 2 ? t('form.required') : null} />
          <Input label={t('common.moq')} value={ef.moq} onChange={(v) => setEf({ ...ef, moq: v.replace(/\D/g, '') })} inputMode="numeric" />
          <Textarea label={t('admin.description')} value={ef.description} onChange={(v) => setEf({ ...ef, description: v })} rows={3} />
        </div>
      </Modal>
    </div>
  );
}

// ---------------- PAYMENTS ----------------
export function PaymentsSection() {
  const { t, tk, money, date } = useI18n();
  const toast = useToast();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const list = useQuery(() => paymentService.listAll(), []);
  const refund = useAction(paymentService.refund);
  const [confirm, setConfirm] = useState<string | null>(null);
  const rows = (list.data || []).filter((p) => (!kind || p.kind === kind) && (!status || p.status === status)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ref = (refId: string, k: string) => {
    const d = db();
    if (k === 'order') return d.orders.find((o) => o.id === refId)?.number || refId;
    if (k === 'supplier_invoice') return d.invoices.find((i) => i.id === refId)?.invoiceNumber || refId;
    if (k === 'auto_reservation') return d.reservations.find((r) => r.id === refId)?.number || refId;
    return refId;
  };
  const supplierOf = (refId: string, k: string) => {
    const d = db();
    if (k === 'supplier_invoice') return d.invoices.find((i) => i.id === refId)?.supplierName;
    if (k === 'order') { const o = d.orders.find((x) => x.id === refId); return o ? d.suppliers.find((s) => s.id === o.items[0]?.supplierId)?.name : undefined; }
    return undefined;
  };
  return (
    <div>
      <Toolbar>
        <MiniSelect label={t('admin.kind')} value={kind} onChange={setKind} options={[{ value: '', label: `${t('admin.kind')}: ${t('common.all')}` }, ...(['order', 'supplier_invoice', 'vip', 'auto_reservation', 'group_buy'] as const).map((k) => ({ value: k, label: tk(`admin.pay_kind.${k}`) }))]} />
        <MiniSelect label={t('common.status')} value={status} onChange={setStatus} options={[{ value: '', label: `${t('common.status')}: ${t('common.all')}` }, ...(['processing', 'authorized', 'succeeded', 'failed', 'refunded', 'cancelled'] as const).map((s) => ({ value: s, label: tk(statusKey('payment', s)) }))]} />
      </Toolbar>
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={rows} rowKey={(p) => p.id} mobileTitle={(p) => <span className="num">{ref(p.refId, p.kind)}</span>} empty={<EmptyState title={t('admin.no_results')} />}
          columns={[
            { key: 'r', header: t('admin.reference'), cell: (p) => <div><div className="num font-medium">{ref(p.refId, p.kind)}</div><div className="text-[11px] text-muted">{tk(`admin.pay_kind.${p.kind}`)}</div></div>, mobile: false },
            { key: 'c', header: t('admin.customer'), cell: (p) => db().users.find((u) => u.id === p.userId)?.name || p.userId },
            { key: 's', header: t('find.supplier'), cell: (p) => <span className="text-[12px]">{supplierOf(p.refId, p.kind) || '—'}</span> },
            { key: 'a', header: t('pay.amount'), cell: (p) => <span className="num">{money(p.amount, p.currency)}</span> },
            { key: 'f', header: t('admin.fee'), cell: (p) => <span className="num">{money(p.feeTMT, 'TMT')}</span> },
            { key: 'st', header: t('common.status'), cell: (p) => <div><StatusBadge status={p.status} label={tk(statusKey('payment', p.status))} />{p.failureReason ? <div className="mt-1 max-w-[200px] text-[11px] text-bad">{p.failureReason}</div> : null}</div> },
            { key: 'd', header: t('admin.created'), cell: (p) => <span className="text-[12px]">{date(p.createdAt, true)}</span> },
            { key: 'pr', header: t('admin.processed'), cell: (p) => <span className="text-[12px]">{p.processedAt ? date(p.processedAt, true) : '—'}</span> },
            { key: 'x', header: t('common.actions'), cell: (p) => (['succeeded', 'authorized'].includes(p.status) ? <Button size="sm" variant="ghost" onClick={() => setConfirm(p.id)}>{p.status === 'authorized' ? t('admin.release') : t('admin.refund')}</Button> : <span className="text-faint">—</span>) },
          ]} />
      )}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={t('admin.refund')} body={t('admin.refund_body')} confirmLabel={t('admin.refund')} danger loading={refund.pending} onConfirm={async () => { if (confirm) { const r = await refund.run(confirm); if (r) toast(t('admin.refunded')); } setConfirm(null); }} />
    </div>
  );
}

// ---------------- INVOICES ----------------
export function InvoicesSection() {
  const { t, tk, money, date } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState('');
  const list = useQuery(() => invoiceService.listAll(), []);
  const set = useAction(invoiceService.adminSetStatus);
  const [act, setAct] = useState<{ inv: Invoice; status: InvoiceStatus } | null>(null);
  const [reason, setReason] = useState('');
  const rows = (list.data || []).filter((i) => !status || i.status === status).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const needsReason = act && (act.status === 'failed' || act.status === 'refunded');
  return (
    <div>
      <Toolbar><MiniSelect label={t('common.status')} value={status} onChange={setStatus} options={[{ value: '', label: `${t('common.status')}: ${t('common.all')}` }, ...(['draft', 'under_review', 'processing', 'paid', 'failed', 'refunded'] as const).map((s) => ({ value: s, label: tk(statusKey('invoice', s)) }))]} /></Toolbar>
      <div className="mb-4"><Notice tone="neutral">{t('admin.invoice_compliance')}</Notice></div>
      {list.loading ? <SkeletonRows /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        <DataTable rows={rows} rowKey={(i) => i.id} mobileTitle={(i) => i.invoiceNumber} empty={<EmptyState title={t('admin.no_results')} />}
          columns={[
            { key: 'n', header: t('pay.invoice_number'), cell: (i) => <Link to={`/pay/${i.id}`} className="num font-medium hover:underline">{i.invoiceNumber}</Link>, mobile: false },
            { key: 'c', header: t('admin.customer'), cell: (i) => i.customerName },
            { key: 's', header: t('find.supplier'), cell: (i) => <span className="text-[12px]">{i.supplierName}</span> },
            { key: 'a', header: t('pay.amount'), cell: (i) => <span className="num">{money(i.amount, i.currency)}</span> },
            { key: 'f', header: t('admin.fee'), cell: (i) => <span className="num">{money(i.serviceFeeTMT, 'TMT')}</span> },
            { key: 'st', header: t('common.status'), cell: (i) => <div><StatusBadge status={i.status} label={tk(statusKey('invoice', i.status))} />{i.failureReason ? <div className="mt-1 max-w-[200px] text-[11px] text-muted">{i.failureReason}</div> : null}</div> },
            { key: 'd', header: t('admin.created'), cell: (i) => <span className="text-[12px]">{date(i.createdAt)}</span> },
            { key: 'x', header: t('common.actions'), cell: (i) => (
              <div className="flex flex-wrap gap-1">
                {i.status === 'under_review' ? <Button size="sm" variant="ghost" onClick={() => setAct({ inv: i, status: 'processing' })}>{t('admin.approve')}</Button> : null}
                {i.status === 'processing' ? <Button size="sm" variant="ghost" onClick={() => setAct({ inv: i, status: 'paid' })}>{t('admin.mark_paid')}</Button> : null}
                {['under_review', 'processing'].includes(i.status) ? <Button size="sm" variant="ghost" onClick={() => setAct({ inv: i, status: 'failed' })}>{t('admin.mark_failed')}</Button> : null}
                {['paid', 'failed'].includes(i.status) ? <Button size="sm" variant="ghost" onClick={() => setAct({ inv: i, status: 'refunded' })}>{t('admin.refund')}</Button> : null}
              </div>
            ) },
          ]} />
      )}
      <Modal open={!!act} onClose={() => { setAct(null); setReason(''); }} title={act ? t('admin.set_status', { status: tk(statusKey('invoice', act.status)) }) : ''} description={act?.inv.invoiceNumber}
        footer={<><Button variant="secondary" onClick={() => { setAct(null); setReason(''); }}>{t('common.cancel')}</Button><Button loading={set.pending} disabled={!!needsReason && reason.trim().length < 5} onClick={async () => { if (act) { await set.run(act.inv.id, act.status, reason || undefined); toast(t('admin.saved')); } setAct(null); setReason(''); }}>{t('common.confirm')}</Button></>}>
        {needsReason ? <Textarea label={t('admin.reason')} value={reason} onChange={setReason} rows={3} error={reason && reason.trim().length < 5 ? t('form.min_4') : null} /> : <p className="text-sm text-muted">{t('admin.confirm_status')}</p>}
      </Modal>
    </div>
  );
}
