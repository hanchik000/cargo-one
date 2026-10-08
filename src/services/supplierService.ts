import type { CategoryId, QuoteRequest, Supplier, SupplierDocument } from '@/lib/types';
import { ApiError, clone, commit, db, network, notify, now, requireRole, requireUser, uid } from './db';
import { systemText } from './accountServices';

export const supplierService = {
  async list(opts: { q?: string; category?: CategoryId | ''; verifiedOnly?: boolean; minScore?: number; includeAll?: boolean; sort?: 'score' | 'response' | 'years' } = {}) {
    await network();
    let items = db().suppliers.filter((s) => opts.includeAll || s.status === 'approved' || s.status === 'pending');
    if (opts.q) { const q = opts.q.toLowerCase(); items = items.filter((s) => `${s.name} ${s.nameCn} ${s.city} ${s.categories.join(' ')}`.toLowerCase().includes(q)); }
    if (opts.category) items = items.filter((s) => s.categories.includes(opts.category as CategoryId));
    if (opts.verifiedOnly) items = items.filter((s) => s.verified);
    if (opts.minScore) items = items.filter((s) => s.score >= opts.minScore!);
    const sort = opts.sort || 'score';
    items = [...items].sort((a, b) => sort === 'response' ? a.responseHours - b.responseHours : sort === 'years' ? b.yearsActive - a.yearsActive : b.score - a.score);
    return clone(items);
  },
  async get(id: string) {
    await network(120, 300);
    const supplier = db().suppliers.find((s) => s.id === id);
    if (!supplier) throw new ApiError('not_found');
    const products = db().products.filter((p) => p.supplierId === id && p.published);
    return clone({ supplier, products });
  },

  async requestQuote(input: { supplierId: string; productTitle: string; qty: number; targetPriceUSD?: number; notes: string; kind: 'quote' | 'sample' }) {
    const user = requireUser();
    if (!input.productTitle.trim() || input.qty < 1) throw new ApiError('validation');
    await network(300, 700);
    const q: QuoteRequest = { id: uid('q'), userId: user.id, status: 'sent', createdAt: now(), ...input };
    commit((d) => { d.quotes.unshift(q); });
    const supplier = db().suppliers.find((s) => s.id === input.supplierId);
    notify(user.id, { type: 'supplier', key: input.kind === 'sample' ? 'sample_requested' : 'quote_sent', params: { supplier: supplier?.name || '' }, link: '/business?tab=quotes' });
    return clone(q);
  },
  async myQuotes() {
    const user = requireUser();
    await network(100, 250);
    return clone(db().quotes.filter((q) => q.userId === user.id));
  },
  async acceptQuote(id: string, accept: boolean) {
    const user = requireUser();
    await network(150, 300);
    commit((d) => { const q = d.quotes.find((x) => x.id === id && x.userId === user.id); if (q) q.status = accept ? 'accepted' : 'declined'; });
  },

  /** Buyer → supplier messages are mediated (and translated) by CARGO ONE, so they are filed as a support thread. */
  async contact(supplierId: string, message: string) {
    const user = requireUser();
    if (message.trim().length < 10) throw new ApiError('validation');
    const sup = db().suppliers.find((s) => s.id === supplierId);
    if (!sup) throw new ApiError('not_found');
    await network(300, 600);
    const id = uid('t');
    commit((d) => {
      d.tickets.unshift({ id, number: `SUP-${3100 + d.tickets.length}`, userId: user.id, category: 'other', subject: systemText('support.message_to', { supplier: sup.name }), message, attachments: [], status: 'open', createdAt: now(), refId: sup.id,
        messages: [{ from: 'user', text: message, at: now() }, { from: 'agent', text: systemText('support.auto_reply_supplier', { supplier: sup.name, hours: sup.responseHours }), at: now() }] });
    });
    return id;
  },

  // ----- supplier portal -----
  async portal() {
    const user = requireRole('supplier', 'admin');
    await network();
    const sid = user.supplierId || 's1';
    const d = db();
    const supplier = d.suppliers.find((s) => s.id === sid)!;
    const orders = d.orders.filter((o) => o.items.some((i) => i.supplierId === sid) && o.status !== 'pending_payment');
    return clone({
      supplier, orders, products: d.products.filter((p) => p.supplierId === sid),
      quotes: d.quotes.filter((q) => q.supplierId === sid), payouts: d.payouts.filter((p) => p.supplierId === sid),
    });
  },
  async respondQuote(id: string, response: { unitPriceUSD: number; leadDays: number; message: string }) {
    const user = requireRole('supplier', 'admin');
    if (response.unitPriceUSD <= 0 || response.leadDays <= 0) throw new ApiError('validation');
    await network();
    const q = db().quotes.find((x) => x.id === id);
    if (!q || (user.role === 'supplier' && q.supplierId !== user.supplierId)) throw new ApiError('forbidden');
    commit(() => { q.status = 'responded'; q.response = response; });
    const sup = db().suppliers.find((s) => s.id === q.supplierId);
    notify(q.userId, { type: 'supplier', key: 'quote_received', params: { supplier: sup?.name || '' }, link: '/business?tab=quotes' });
    return true;
  },
  async decideOrder(orderId: string, accept: boolean) {
    requireRole('supplier', 'admin');
    await network();
    const o = db().orders.find((x) => x.id === orderId);
    if (!o) throw new ApiError('not_found');
    commit(() => { o.supplierStatus = accept ? 'accepted' : 'rejected'; if (!accept) o.status = 'cancelled'; });
    notify(o.userId, { type: 'order', key: accept ? 'order_supplier_confirmed' : 'order_supplier_rejected', params: { number: o.number }, link: `/orders/${o.id}` });
  },
  async uploadDocument(supplierId: string, name: string, kind: SupplierDocument['kind']) {
    const user = requireRole('supplier', 'admin');
    if (user.role === 'supplier' && user.supplierId !== supplierId) throw new ApiError('forbidden');
    await network(400, 900);
    commit((d) => { d.suppliers.find((s) => s.id === supplierId)?.documents.unshift({ id: uid('doc'), name, kind, uploadedAt: now(), status: 'pending' }); });
  },

  // ----- admin -----
  async adminUpdate(id: string, patch: Partial<Supplier>) {
    requireRole('admin');
    await network(120, 260);
    commit((d) => { const s = d.suppliers.find((x) => x.id === id); if (s) Object.assign(s, patch); });
  },
  async setDocumentStatus(supplierId: string, docId: string, status: SupplierDocument['status']) {
    requireRole('admin');
    await network(100, 200);
    commit((d) => { const doc = d.suppliers.find((s) => s.id === supplierId)?.documents.find((x) => x.id === docId); if (doc) doc.status = status; });
  },
};
