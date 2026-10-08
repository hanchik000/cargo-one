import type { Promotion, VIPSubscription } from '@/lib/types';
import { ApiError, clone, commit, db, network, notify, now, requireRole, requireUser, uid } from './db';
import { paymentService } from './paymentService';

export const VIP_PRICE_TMT = 150;
const MONTH = 30 * 86_400_000;

export const vipService = {
  isActive(userId: string) {
    const s = db().vipSubscriptions.find((v) => v.userId === userId);
    return !!s && s.status !== 'expired' && new Date(s.renewsAt).getTime() > Date.now();
  },
  async status(): Promise<VIPSubscription | null> {
    const user = requireUser();
    await network(100, 220);
    const s = db().vipSubscriptions.find((v) => v.userId === user.id);
    if (s && s.status !== 'expired' && new Date(s.renewsAt).getTime() <= Date.now()) {
      if (s.autoRenew && s.status === 'active') commit(() => { s.renewsAt = new Date(Date.now() + MONTH).toISOString(); }); // mock renewal
      else commit(() => { s.status = 'expired'; });
    }
    return s ? clone(s) : null;
  },
  async subscribe(methodId: string) {
    const user = requireUser();
    if (vipService.isActive(user.id) && db().vipSubscriptions.find((v) => v.userId === user.id)?.status === 'active') throw new ApiError('already_active');
    const payment = await paymentService.charge({ kind: 'vip', refId: user.id, amount: VIP_PRICE_TMT, currency: 'TMT', methodId });
    if (payment.status !== 'succeeded') return { payment, subscription: null };
    let sub!: VIPSubscription;
    commit((d) => {
      const existing = d.vipSubscriptions.find((v) => v.userId === user.id);
      const base = existing && new Date(existing.renewsAt).getTime() > Date.now() ? new Date(existing.renewsAt).getTime() : Date.now();
      sub = { userId: user.id, status: 'active', startedAt: existing?.startedAt || now(), renewsAt: new Date(base + MONTH).toISOString(), priceTMT: VIP_PRICE_TMT, autoRenew: true, paymentIds: [...(existing?.paymentIds || []), payment.id] };
      d.vipSubscriptions = d.vipSubscriptions.filter((v) => v.userId !== user.id).concat(sub);
      // VIP members join the active monthly campaign automatically.
      const active = d.promotions.find((p) => p.kind === 'vip_campaign' && p.status === 'active');
      if (active && !d.promotionEntries.some((e) => e.promotionId === active.id && e.userId === user.id)) {
        d.promotionEntries.push({ id: uid('pe'), promotionId: active.id, userId: user.id, entries: 1, createdAt: now(), source: 'vip_monthly' });
      }
    });
    notify(user.id, { type: 'vip', key: 'vip_activated', params: { date: sub.renewsAt.slice(0, 10) }, link: '/vip' });
    return { payment, subscription: clone(sub) };
  },
  async cancel() {
    const user = requireUser();
    await network();
    commit((d) => { const s = d.vipSubscriptions.find((v) => v.userId === user.id); if (s) { s.status = 'cancelled'; s.autoRenew = false; } });
  },
  async resume() {
    const user = requireUser();
    await network();
    commit((d) => { const s = d.vipSubscriptions.find((v) => v.userId === user.id); if (s && new Date(s.renewsAt).getTime() > Date.now()) { s.status = 'active'; s.autoRenew = true; } });
  },
  async listAll() {
    requireRole('admin');
    await network();
    return clone(db().vipSubscriptions);
  },
};

export const promotionService = {
  async activeVipCampaign() {
    await network(100, 250);
    const d = db();
    const promo = d.promotions.find((p) => p.kind === 'vip_campaign' && p.status === 'active') || null;
    return clone({ promo, past: d.promotions.filter((p) => p.kind === 'vip_campaign' && p.status === 'ended') });
  },
  async myEntries(promotionId: string) {
    const user = requireUser();
    await network(80, 160);
    return db().promotionEntries.filter((e) => e.promotionId === promotionId && e.userId === user.id).reduce((s, e) => s + e.entries, 0);
  },
  async join(promotionId: string) {
    const user = requireUser();
    await network();
    const promo = db().promotions.find((p) => p.id === promotionId && p.status === 'active');
    if (!promo) throw new ApiError('not_found');
    if (!vipService.isActive(user.id)) throw new ApiError('vip_required');
    if (db().promotionEntries.some((e) => e.promotionId === promotionId && e.userId === user.id)) throw new ApiError('already_joined');
    commit((d) => { d.promotionEntries.push({ id: uid('pe'), promotionId, userId: user.id, entries: 1, createdAt: now(), source: 'vip_monthly' }); });
    return true;
  },
  async banner() {
    const d = db();
    return clone(d.promotions.find((p) => p.kind === 'banner' && p.status === 'active') || null);
  },
  // ----- admin -----
  async listAll() {
    requireRole('admin');
    await network();
    return clone(db().promotions);
  },
  async save(p: Partial<Promotion> & { name: string; kind: Promotion['kind'] }) {
    requireRole('admin');
    if (!p.name.trim()) throw new ApiError('validation');
    if (p.startsAt && p.endsAt && p.startsAt > p.endsAt) throw new ApiError('invalid_dates');
    await network();
    let saved!: Promotion;
    commit((d) => {
      if (p.status === 'active' && p.kind === 'vip_campaign') d.promotions.forEach((x) => { if (x.kind === 'vip_campaign' && x.id !== p.id && x.status === 'active') x.status = 'ended'; });
      const ex = p.id ? d.promotions.find((x) => x.id === p.id) : undefined;
      if (ex) { Object.assign(ex, p); saved = ex; }
      else { const { id: _id, ...rest } = p; saved = { startsAt: now(), endsAt: new Date(Date.now() + MONTH).toISOString(), eligibility: '', rules: '', status: 'draft', ...rest, id: uid('pr') } as Promotion; d.promotions.unshift(saved); }
    });
    return clone(saved);
  },
  async remove(id: string) {
    requireRole('admin');
    await network();
    commit((d) => { d.promotions = d.promotions.filter((p) => p.id !== id); });
  },
  async entriesFor(id: string) {
    requireRole('admin');
    await network(80, 160);
    return clone(db().promotionEntries.filter((e) => e.promotionId === id));
  },
};
