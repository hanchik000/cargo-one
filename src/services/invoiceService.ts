// Supplier invoice payment workflow.
// PRODUCTION NOTE: settlement must run through licensed payment/FX partners with KYC/AML screening.
// This mock never converts currency peer-to-peer; it only models the workflow and statuses.
import type { Invoice, InvoiceStatus } from '@/lib/types';
import { invoiceCosts } from '@/lib/pricing';
import { ApiError, clone, commit, db, network, notify, now, requireRole, requireUser, uid } from './db';
import { vipService } from './vipService';
import { systemText } from './accountServices';

export const DEMO_LIMIT_USD = 50_000;

/** Mock OCR: derives plausible fields from the file name so the review step has something to confirm. */
function mockExtract(fileName: string) {
  const known = db().suppliers;
  const h = [...fileName].reduce((s, c) => (s * 31 + c.charCodeAt(0)) >>> 0, 7);
  const sup = known[h % known.length];
  const usd = h % 3 === 0;
  return {
    supplierName: sup.name, invoiceNumber: `${sup.monogram}-${2026}${String(h % 10000).padStart(4, '0')}`,
    invoiceDate: new Date(Date.now() - (h % 9) * 86_400_000).toISOString().slice(0, 10),
    amount: usd ? 1500 + (h % 9000) : 12000 + (h % 80000), currency: (usd ? 'USD' : 'CNY') as 'USD' | 'CNY',
    beneficiary: `${sup.name} Co., Ltd.`, bankName: ['Bank of China', 'ICBC', 'China Construction Bank', 'China Merchants Bank'][h % 4],
    account: `6222 ${String(h % 10000).padStart(4, '0')} ${String((h >> 4) % 10000).padStart(4, '0')} ${String((h >> 8) % 10000).padStart(4, '0')}`,
    swift: ['BKCHCNBJ', 'ICBKCNBJ', 'PCBCCNBJ', 'CMBCCNBS'][h % 4], orderRef: `PO-${String(h % 100000).padStart(5, '0')}`,
  };
}

/** Status progression for newly submitted invoices is time-based (simulating partner callbacks). */
function progress(inv: Invoice) {
  if (!inv.simulateProgress || !inv.submittedAt || ['paid', 'failed', 'refunded', 'draft'].includes(inv.status)) return;
  const elapsed = Date.now() - new Date(inv.submittedAt).getTime();
  const usd = inv.currency === 'USD' ? inv.amount : inv.amount * db().content.settings.cnyToTmt / db().content.settings.usdToTmt;
  let next: InvoiceStatus = inv.status;
  if (elapsed > 8_000) next = 'processing';
  if (elapsed > 20_000) next = usd > DEMO_LIMIT_USD ? 'failed' : 'paid';
  if (next !== inv.status) {
    commit((d) => {
      inv.status = next;
      if (next === 'paid' || next === 'failed') {
        inv.processedAt = now();
        if (next === 'failed') inv.failureReason = systemText('pay.edd_reason');
        const p = d.payments.find((x) => x.id === inv.paymentId);
        if (p) { p.status = next === 'paid' ? 'succeeded' : 'failed'; p.processedAt = now(); p.failureReason = inv.failureReason; }
      }
    });
    notify(inv.userId, { type: 'payment', key: 'invoice_status', params: { number: inv.invoiceNumber, status: next }, link: `/pay/${inv.id}` });
  }
}

export const invoiceService = {
  async upload(file: { name: string; size: number; type: string }) {
    const user = requireUser();
    if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name)) throw new ApiError('invalid_file_type');
    if (file.size > 15 * 1024 * 1024) throw new ApiError('file_too_large');
    await network(900, 1600); // upload + extraction
    const ex = mockExtract(file.name);
    const s = db().content.settings;
    const costs = invoiceCosts(ex.amount, ex.currency, s, vipService.isActive(user.id));
    const inv: Invoice = {
      id: uid('inv'), userId: user.id, customerName: user.companyName || user.name, fileName: file.name, status: 'draft', createdAt: now(), kycConfirmed: false,
      ...ex, serviceFeeTMT: costs.serviceFeeTMT, settlementCostTMT: costs.settlementCostTMT, totalTMT: costs.totalTMT, simulateProgress: true,
    };
    commit((d) => { d.invoices.unshift(inv); });
    return clone(inv);
  },
  async updateDraft(id: string, patch: Partial<Pick<Invoice, 'supplierName' | 'invoiceNumber' | 'invoiceDate' | 'amount' | 'currency' | 'beneficiary' | 'bankName' | 'account' | 'swift' | 'orderRef'>>) {
    const user = requireUser();
    const inv = db().invoices.find((i) => i.id === id && i.userId === user.id);
    if (!inv) throw new ApiError('not_found');
    if (inv.status !== 'draft') throw new ApiError('not_editable');
    await network(150, 300);
    const s = db().content.settings;
    commit(() => {
      Object.assign(inv, patch);
      const c = invoiceCosts(inv.amount, inv.currency, s, vipService.isActive(user.id));
      inv.serviceFeeTMT = c.serviceFeeTMT; inv.settlementCostTMT = c.settlementCostTMT; inv.totalTMT = c.totalTMT;
    });
    return clone(inv);
  },
  async submit(id: string, kycConfirmed: boolean) {
    const user = requireUser();
    const inv = db().invoices.find((i) => i.id === id && i.userId === user.id);
    if (!inv) throw new ApiError('not_found');
    if (!kycConfirmed) throw new ApiError('kyc_required');
    if (inv.status !== 'draft') throw new ApiError('already_submitted');
    await network(600, 1000);
    const paymentId = uid('pay');
    commit((d) => {
      inv.status = 'under_review'; inv.kycConfirmed = true; inv.submittedAt = now(); inv.paymentId = paymentId;
      d.payments.unshift({ id: paymentId, userId: user.id, kind: 'supplier_invoice', refId: inv.id, amount: inv.amount, currency: inv.currency, feeTMT: inv.serviceFeeTMT, status: 'processing', methodLabel: 'Partner settlement', createdAt: now() });
    });
    notify(user.id, { type: 'payment', key: 'invoice_status', params: { number: inv.invoiceNumber, status: 'under_review' }, link: `/pay/${inv.id}` });
    return clone(inv);
  },
  async get(id: string) {
    const user = requireUser();
    await network(100, 220);
    const inv = db().invoices.find((i) => i.id === id && (i.userId === user.id || user.role === 'admin'));
    if (!inv) throw new ApiError('not_found');
    progress(inv);
    return clone(inv);
  },
  async mine() {
    const user = requireUser();
    await network(120, 260);
    const list = db().invoices.filter((i) => i.userId === user.id);
    list.forEach(progress);
    return clone(list);
  },
  async remove(id: string) {
    const user = requireUser();
    await network(100, 200);
    commit((d) => { d.invoices = d.invoices.filter((i) => !(i.id === id && i.userId === user.id && i.status === 'draft')); });
  },
  // ----- admin -----
  async listAll() {
    requireRole('admin');
    await network();
    db().invoices.forEach(progress);
    return clone(db().invoices);
  },
  async adminSetStatus(id: string, status: InvoiceStatus, reason?: string) {
    requireRole('admin');
    await network();
    const inv = db().invoices.find((i) => i.id === id);
    if (!inv) throw new ApiError('not_found');
    if ((status === 'failed' || status === 'refunded') && !reason?.trim()) throw new ApiError('reason_required');
    commit((d) => {
      inv.status = status; inv.simulateProgress = false;
      if (['paid', 'failed', 'refunded'].includes(status)) inv.processedAt = now();
      if (reason) inv.failureReason = reason;
      const p = d.payments.find((x) => x.id === inv.paymentId);
      if (p) p.status = status === 'paid' ? 'succeeded' : status === 'failed' ? 'failed' : status === 'refunded' ? 'refunded' : 'processing';
    });
    notify(inv.userId, { type: 'payment', key: 'invoice_status', params: { number: inv.invoiceNumber, status }, link: `/pay/${inv.id}` });
  },
};
