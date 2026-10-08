import type { GroupBuy } from '@/lib/types';
import { ApiError, clone, commit, db, network, notify, now, requireRole, requireUser, uid } from './db';
import { paymentService } from './paymentService';

export function tierFor(gb: GroupBuy, qty = gb.currentQty) {
  const reached = [...gb.tiers].filter((t) => qty >= t.qty).pop() || gb.tiers[0];
  const next = gb.tiers.find((t) => t.qty > qty) || null;
  return { current: reached, next, unitsToNext: next ? next.qty - qty : 0, savingPct: Math.round((1 - reached.priceCNY / gb.tiers[0].priceCNY) * 100) };
}

export const groupBuyService = {
  async list() {
    await network();
    const d = db();
    return clone(d.groupBuys.map((g) => ({ gb: g, product: d.products.find((p) => p.id === g.productId)! })).filter((x) => x.product));
  },
  async get(id: string) {
    await network(120, 260);
    const d = db();
    const gb = d.groupBuys.find((g) => g.id === id);
    if (!gb) throw new ApiError('not_found');
    return clone({ gb, product: d.products.find((p) => p.id === gb.productId)! });
  },
  /** Joining authorises (reserves) the payment; capture happens when the campaign closes. */
  async join(id: string, qty: number, methodId: string) {
    const user = requireUser();
    const gb = db().groupBuys.find((g) => g.id === id);
    if (!gb) throw new ApiError('not_found');
    if (gb.status !== 'open' || new Date(gb.endsAt).getTime() < Date.now()) throw new ApiError('group_buy_closed');
    if (!Number.isInteger(qty) || qty < 1 || qty > 500) throw new ApiError('validation');
    if (gb.participants.some((p) => p.userId === user.id)) throw new ApiError('already_joined');
    const priceAfter = tierFor(gb, gb.currentQty + qty).current.priceCNY;
    const amountTMT = Math.round(priceAfter * qty * db().content.settings.cnyToTmt * 100) / 100;
    const payment = await paymentService.charge({ kind: 'group_buy', refId: gb.id, amount: amountTMT, currency: 'TMT', methodId, authorizeOnly: true });
    if (payment.status !== 'authorized') return { payment, gb: clone(gb) };
    commit(() => {
      gb.participants.push({ userId: user.id, name: user.name, qty, paymentId: payment.id, joinedAt: now() });
      gb.currentQty += qty;
      if (gb.currentQty >= gb.targetQty) gb.status = 'completed';
    });
    notify(user.id, { type: 'group_buy', key: (gb.status as GroupBuy['status']) === 'completed' ? 'group_buy_completed' : 'group_buy_joined', params: { title: gb.title, left: Math.max(0, gb.targetQty - gb.currentQty) }, link: `/group-buy/${gb.id}` });
    return { payment, gb: clone(gb) };
  },
  async leave(id: string) {
    const user = requireUser();
    const gb = db().groupBuys.find((g) => g.id === id);
    if (!gb || gb.status !== 'open') throw new ApiError('group_buy_closed');
    const part = gb.participants.find((p) => p.userId === user.id);
    if (!part) throw new ApiError('not_found');
    await network();
    commit((d) => {
      gb.participants = gb.participants.filter((p) => p.userId !== user.id);
      gb.currentQty -= part.qty;
      const pay = d.payments.find((p) => p.id === part.paymentId);
      if (pay) { pay.status = 'cancelled'; pay.processedAt = now(); }
    });
  },
  // ----- admin -----
  async save(input: Partial<GroupBuy> & { productId: string }) {
    requireRole('admin');
    const p = db().products.find((x) => x.id === input.productId);
    if (!p) throw new ApiError('validation');
    if (input.tiers && (input.tiers.length < 2 || input.tiers.some((t, i, a) => i > 0 && (t.qty <= a[i - 1].qty || t.priceCNY >= a[i - 1].priceCNY)))) throw new ApiError('invalid_tiers');
    await network();
    let saved!: GroupBuy;
    commit((d) => {
      const ex = input.id ? d.groupBuys.find((g) => g.id === input.id) : undefined;
      if (ex) { Object.assign(ex, input); saved = ex; }
      else {
        saved = { title: p.title, tiers: [{ qty: 1, priceCNY: p.priceCNY }, { qty: 20, priceCNY: Math.round(p.priceCNY * 0.88) }, { qty: 50, priceCNY: Math.round(p.priceCNY * 0.78) }],
          currentQty: 0, targetQty: 50, endsAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), status: 'open', participants: [], createdAt: now(), ...input, id: input.id || uid('g') } as GroupBuy;
        d.groupBuys.unshift(saved);
      }
    });
    return clone(saved);
  },
  async setStatus(id: string, status: GroupBuy['status']) {
    requireRole('admin');
    await network();
    commit((d) => {
      const g = d.groupBuys.find((x) => x.id === id);
      if (!g) return;
      g.status = status;
      for (const part of g.participants) {
        const pay = d.payments.find((p) => p.id === part.paymentId);
        if (pay && pay.status === 'authorized') pay.status = status === 'completed' ? 'succeeded' : status === 'cancelled' ? 'cancelled' : pay.status;
      }
    });
  },
};
