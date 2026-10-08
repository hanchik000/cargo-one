// Mock payment adapter. Same interface a licensed payment partner integration would expose.
// Card numbers never leave this module: only brand, last4 and an opaque token are stored.
import type { Currency, Payment, PaymentMethod } from '@/lib/types';
import { ApiError, clone, commit, db, network, now, requireRole, requireUser, uid } from './db';
import { systemText } from './accountServices';

export function luhnValid(num: string) {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}
export function cardBrand(num: string) {
  const d = num.replace(/\D/g, '');
  if (/^4/.test(d)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard';
  if (/^62/.test(d)) return 'UnionPay';
  if (/^9934/.test(d)) return 'Altyn Asyr';
  return 'Card';
}
export function expiryValid(exp: string) {
  const m = /^(\d{2})\/(\d{2})$/.exec(exp.trim());
  if (!m) return false;
  const month = Number(m[1]); const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const end = new Date(year, month, 1);
  return end > new Date();
}

export const TEST_DECLINE_LAST4 = '0002';

export const paymentService = {
  async methods() {
    const user = requireUser();
    await network(100, 220);
    return clone(db().paymentMethods.filter((m) => m.userId === user.id));
  },
  async addCard(input: { number: string; expiry: string; holder: string; makeDefault?: boolean }) {
    const user = requireUser();
    if (!luhnValid(input.number)) throw new ApiError('invalid_card');
    if (!expiryValid(input.expiry)) throw new ApiError('invalid_expiry');
    if (input.holder.trim().length < 3) throw new ApiError('invalid_holder');
    await network(500, 900); // tokenisation round-trip with the partner
    const digits = input.number.replace(/\D/g, '');
    const brand = cardBrand(digits);
    const method: PaymentMethod = {
      id: uid('pm'), userId: user.id, type: 'card', brand, last4: digits.slice(-4), label: `${brand} card`, token: `tok_mock_${uid('')}`,
      isDefault: !!input.makeDefault || !db().paymentMethods.some((m) => m.userId === user.id), expires: input.expiry,
    };
    commit((d) => {
      if (method.isDefault) d.paymentMethods.forEach((m) => { if (m.userId === user.id) m.isDefault = false; });
      d.paymentMethods.push(method);
    });
    return clone(method);
  },
  async addWallet() {
    const user = requireUser();
    await network();
    if (db().paymentMethods.some((m) => m.userId === user.id && m.type === 'wallet')) throw new ApiError('already_exists');
    commit((d) => { d.paymentMethods.push({ id: uid('pm'), userId: user.id, type: 'wallet', label: 'CARGO ONE Wallet', token: `tok_mock_wallet_${user.id}`, isDefault: false }); });
    return true;
  },
  async removeMethod(id: string) {
    const user = requireUser();
    await network(120, 250);
    commit((d) => { d.paymentMethods = d.paymentMethods.filter((m) => !(m.id === id && m.userId === user.id)); });
  },
  async setDefault(id: string) {
    const user = requireUser();
    await network(100, 200);
    commit((d) => { d.paymentMethods.forEach((m) => { if (m.userId === user.id) m.isDefault = m.id === id; }); });
  },

  /** Charges (or authorises) a payment through the mock adapter. Card ending 0002 is always declined. */
  async charge(input: { kind: Payment['kind']; refId: string; amount: number; currency: Currency; feeTMT?: number; methodId: string; authorizeOnly?: boolean }): Promise<Payment> {
    const user = requireUser();
    const method = db().paymentMethods.find((m) => m.id === input.methodId && m.userId === user.id);
    if (!method) throw new ApiError('payment_method_required');
    if (!(input.amount > 0)) throw new ApiError('validation');
    const payment: Payment = {
      id: uid('pay'), userId: user.id, kind: input.kind, refId: input.refId, amount: Math.round(input.amount * 100) / 100, currency: input.currency,
      feeTMT: input.feeTMT ?? 0, status: 'processing', methodLabel: method.last4 ? `${method.brand} •••• ${method.last4}` : method.label, createdAt: now(),
    };
    commit((d) => { d.payments.unshift(payment); });
    await network(700, 1300);
    const declined = method.last4 === TEST_DECLINE_LAST4;
    commit(() => {
      payment.status = declined ? 'failed' : input.authorizeOnly ? 'authorized' : 'succeeded';
      payment.processedAt = now();
      if (declined) payment.failureReason = systemText('pay.declined_reason');
    });
    return clone(payment);
  },
  async forUser() {
    const user = requireUser();
    await network(100, 200);
    return clone(db().payments.filter((p) => p.userId === user.id));
  },
  // ----- admin -----
  async listAll() {
    requireRole('admin');
    await network();
    return clone(db().payments);
  },
  async refund(id: string) {
    requireRole('admin');
    await network();
    const p = db().payments.find((x) => x.id === id);
    if (!p) throw new ApiError('not_found');
    if (!['succeeded', 'authorized', 'failed'].includes(p.status)) throw new ApiError('not_refundable');
    commit(() => { p.status = p.status === 'authorized' ? 'cancelled' : 'refunded'; p.processedAt = now(); });
    return clone(p);
  },
};
