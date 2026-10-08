// Notifications, favorites, addresses, support, content, users (admin) and analytics.
import type { Address, AppNotification, ContentSettings, FaqItem, Favorite, NotificationType, SupportTicket, User } from '@/lib/types';
import { ApiError, clone, commit, db, network, now, requireRole, requireUser, uid, getCurrentUser } from './db';
import { STRINGS } from '@/i18n/strings';
import type { StringKey } from '@/i18n/strings';
import { readPersisted } from '@/lib/hooks';

/** Automated messages are written in the user's current UI language. */
export function systemText(key: StringKey, params: Record<string, string | number> = {}) {
  const idx = { en: 0, ru: 1, tk: 2 }[readPersisted<'en' | 'ru' | 'tk'>('lang', 'ru')] ?? 0;
  return STRINGS[key][idx].replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? ''));
}

export const notificationService = {
  async list(filter: 'all' | 'unread' = 'all') {
    const user = requireUser();
    await network(100, 250);
    const list = db().notifications.filter((n) => n.userId === user.id && (filter === 'all' || !n.read));
    return clone([...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
  unreadCount() {
    const user = getCurrentUser();
    if (!user) return 0;
    return db().notifications.filter((n) => n.userId === user.id && !n.read).length;
  },
  async markRead(id: string) {
    const user = requireUser();
    commit((d) => { const n = d.notifications.find((x) => x.id === id && x.userId === user.id); if (n) n.read = true; });
  },
  async markAllRead() {
    const user = requireUser();
    await network(100, 200);
    commit((d) => { d.notifications.forEach((n) => { if (n.userId === user.id) n.read = true; }); });
  },
  async remove(id: string) {
    const user = requireUser();
    commit((d) => { d.notifications = d.notifications.filter((n) => !(n.id === id && n.userId === user.id)); });
  },
  // admin broadcast
  async broadcast(input: { audience: 'all' | 'vip' | 'business' | 'personal'; type: NotificationType; title: string; body: string; link?: string }) {
    requireRole('admin');
    if (input.title.trim().length < 3 || input.body.trim().length < 3) throw new ApiError('validation');
    await network();
    const d = db();
    const vipIds = new Set(d.vipSubscriptions.filter((v) => v.status !== 'expired').map((v) => v.userId));
    const targets = d.users.filter((u) => u.status === 'active' && (input.audience === 'all' || (input.audience === 'vip' ? vipIds.has(u.id) : u.role === input.audience)));
    commit((dd) => {
      for (const u of targets) dd.notifications.unshift({ id: uid('n'), userId: u.id, type: input.type, key: 'custom', params: { title: input.title, body: input.body }, link: input.link || undefined, read: false, createdAt: now() } as AppNotification);
    });
    return targets.length;
  },
  async listAll() {
    requireRole('admin');
    await network();
    return clone(db().notifications.slice(0, 200));
  },
};

export const favoriteService = {
  async list(kind?: Favorite['kind']) {
    const user = requireUser();
    await network(100, 250);
    return clone(db().favorites.filter((f) => f.userId === user.id && (!kind || f.kind === kind)));
  },
  ids(kind: Favorite['kind']) {
    const user = getCurrentUser();
    if (!user) return new Set<string>();
    return new Set(db().favorites.filter((f) => f.userId === user.id && f.kind === kind).map((f) => f.refId));
  },
  async toggle(kind: Favorite['kind'], refId: string, label?: string) {
    const user = requireUser();
    const existing = db().favorites.find((f) => f.userId === user.id && f.kind === kind && f.refId === refId);
    commit((d) => {
      if (existing) d.favorites = d.favorites.filter((f) => f.id !== existing.id);
      else d.favorites.unshift({ id: uid('fv'), userId: user.id, kind, refId, label, createdAt: now() });
    });
    return !existing;
  },
};

const PHONE_RE = /^\+\d{8,15}$/;
export function validateAddress(a: Partial<Address>) {
  const errors: Partial<Record<keyof Address, string>> = {};
  if (!a.name || a.name.trim().length < 2) errors.name = 'required';
  if (!a.phone || !PHONE_RE.test(a.phone.replace(/[\s-]/g, ''))) errors.phone = 'invalid_phone';
  if (!a.city?.trim()) errors.city = 'required';
  if (!a.district?.trim()) errors.district = 'required';
  if (!a.street?.trim()) errors.street = 'required';
  if (!a.building?.trim()) errors.building = 'required';
  return errors;
}

export const addressService = {
  async list() {
    const user = requireUser();
    await network(100, 220);
    return clone(db().addresses.filter((a) => a.userId === user.id).sort((a, b) => Number(b.isDefault) - Number(a.isDefault)));
  },
  async save(input: Omit<Address, 'id' | 'userId'> & { id?: string }) {
    const user = requireUser();
    if (Object.keys(validateAddress(input)).length) throw new ApiError('validation');
    await network();
    let saved!: Address;
    commit((d) => {
      const mine = d.addresses.filter((a) => a.userId === user.id);
      const makeDefault = input.isDefault || mine.length === 0;
      if (makeDefault) mine.forEach((a) => (a.isDefault = false));
      const ex = input.id ? mine.find((a) => a.id === input.id) : undefined;
      const clean = { ...input, phone: input.phone.replace(/[\s-]/g, ''), isDefault: makeDefault };
      if (ex) { Object.assign(ex, clean); saved = ex; }
      else { saved = { ...clean, id: uid('a'), userId: user.id }; d.addresses.push(saved); }
    });
    return clone(saved);
  },
  async remove(id: string) {
    const user = requireUser();
    await network(100, 200);
    commit((d) => {
      const target = d.addresses.find((a) => a.id === id && a.userId === user.id);
      d.addresses = d.addresses.filter((a) => a !== target);
      if (target?.isDefault) { const first = d.addresses.find((a) => a.userId === user.id); if (first) first.isDefault = true; }
    });
  },
};

export const supportService = {
  async faqs() {
    await network(80, 200);
    return clone([...db().faqs].sort((a, b) => a.order - b.order));
  },
  async tickets() {
    const user = requireUser();
    await network(100, 250);
    return clone(db().tickets.filter((t) => t.userId === user.id));
  },
  async create(input: { category: SupportTicket['category']; subject: string; message: string; attachments: string[]; refId?: string }) {
    const user = requireUser();
    if (input.subject.trim().length < 4 || input.message.trim().length < 10) throw new ApiError('validation');
    await network(400, 800);
    const t: SupportTicket = {
      id: uid('t'), number: `SUP-${3100 + db().tickets.length}`, userId: user.id, status: 'open', createdAt: now(), ...input,
      messages: [{ from: 'user', text: input.message, at: now() }, { from: 'agent', text: systemText('support.auto_reply'), at: now() }],
    };
    commit((d) => { d.tickets.unshift(t); });
    return clone(t);
  },
  async reply(id: string, text: string) {
    const user = requireUser();
    if (!text.trim()) throw new ApiError('validation');
    await network(200, 400);
    commit((d) => {
      const t = d.tickets.find((x) => x.id === id && (x.userId === user.id || user.role === 'admin'));
      if (!t) return;
      t.messages.push({ from: user.role === 'admin' ? 'agent' : 'user', text, at: now() });
      if (user.role === 'admin') t.status = 'in_progress';
    });
  },
  async setStatus(id: string, status: SupportTicket['status']) {
    requireRole('admin');
    commit((d) => { const t = d.tickets.find((x) => x.id === id); if (t) t.status = status; });
  },
  async listAll() {
    requireRole('admin');
    await network();
    return clone(db().tickets);
  },
  // ----- FAQ CMS -----
  async saveFaq(item: Omit<FaqItem, 'id'> & { id?: string }) {
    requireRole('admin');
    if (!item.q.en.trim() || !item.a.en.trim()) throw new ApiError('validation');
    await network();
    commit((d) => {
      const ex = item.id ? d.faqs.find((f) => f.id === item.id) : undefined;
      if (ex) Object.assign(ex, item); else d.faqs.push({ ...item, id: uid('f') });
    });
    return true;
  },
  async removeFaq(id: string) {
    requireRole('admin');
    commit((d) => { d.faqs = d.faqs.filter((f) => f.id !== id); });
  },
};

export const contentService = {
  get(): ContentSettings { return db().content; },
  async setCategoryVisible(id: string, visible: boolean) {
    requireRole('admin');
    await network(100, 200);
    commit((d) => { const c = d.categories.find((x) => x.id === id); if (c) c.visible = visible; });
    return true;
  },
  async update(mutator: (c: ContentSettings) => void) {
    requireRole('admin');
    await network(150, 300);
    commit((d) => mutator(d.content));
  },
};

export const userService = {
  async listAll(q = '', role = '', status = '') {
    requireRole('admin');
    await network();
    const d = db();
    let items = d.users;
    if (q) { const s = q.toLowerCase(); items = items.filter((u) => `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(s)); }
    if (role) items = items.filter((u) => u.role === role);
    if (status) items = items.filter((u) => u.status === status);
    return clone(items.map((u) => {
      const orders = d.orders.filter((o) => o.userId === u.id);
      const spentTMT = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'pending_payment').reduce((s, o) => s + o.costs.totalTMT, 0);
      const vip = d.vipSubscriptions.find((v) => v.userId === u.id && v.status !== 'expired');
      return { user: u, orders: orders.length, spentTMT, vip: !!vip, business: d.businesses.find((b) => b.id === u.businessId) || null };
    }));
  },
  async update(id: string, patch: Partial<Pick<User, 'name' | 'email' | 'phone' | 'city' | 'role' | 'status'>>) {
    requireRole('admin');
    await network();
    commit((d) => { const u = d.users.find((x) => x.id === id); if (u) Object.assign(u, patch); });
  },
  async setVip(id: string, active: boolean) {
    requireRole('admin');
    await network();
    commit((d) => {
      const s = d.vipSubscriptions.find((v) => v.userId === id);
      if (active) {
        const sub = { userId: id, status: 'active' as const, startedAt: now(), renewsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), priceTMT: 150, autoRenew: false, paymentIds: [] };
        if (s) Object.assign(s, sub); else d.vipSubscriptions.push(sub);
      } else if (s) { s.status = 'expired'; s.renewsAt = now(); }
    });
  },
  async profile() {
    const user = requireUser();
    await network(80, 200);
    const d = db();
    return clone({ user: d.users.find((u) => u.id === user.id) || null, business: d.businesses.find((b) => b.id === user.businessId) || null });
  },
  async updateProfile(patch: { name?: string; email?: string; city?: string }) {
    const user = requireUser();
    if (patch.name !== undefined && patch.name.trim().length < 2) throw new ApiError('validation');
    if (patch.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(patch.email)) throw new ApiError('invalid_email');
    await network();
    commit((d) => {
      let u = d.users.find((x) => x.id === user.id);
      if (!u) { u = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, status: 'active', city: 'Ashgabat', createdAt: now(), lastActiveAt: now() }; d.users.push(u); }
      Object.assign(u, patch);
    });
    return true;
  },
};

export const analyticsService = {
  async overview() {
    requireRole('admin');
    await network();
    const d = db();
    const paid = d.orders.filter((o) => !['cancelled', 'pending_payment'].includes(o.status));
    const gmv = paid.reduce((s, o) => s + o.costs.totalTMT, 0);
    const revenue = paid.reduce((s, o) => s + o.costs.serviceTMT, 0) + d.vipSubscriptions.filter((v) => v.status !== 'expired').length * 150;
    const days = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
      return { day, orders: d.orders.filter((o) => o.createdAt.slice(0, 10) === day).length, gmv: d.orders.filter((o) => o.createdAt.slice(0, 10) === day && o.status !== 'cancelled').reduce((s, o) => s + o.costs.totalTMT, 0) };
    });
    const byCategory = d.categories.map((c) => ({ id: c.id, gmv: paid.reduce((s, o) => s + o.items.filter((i) => d.products.find((p) => p.id === i.productId)?.categoryId === c.id).reduce((x, i) => x + i.unitPriceCNY * i.qty * d.content.settings.cnyToTmt, 0), 0) }));
    return {
      users: d.users.length, activeUsers: d.users.filter((u) => u.status === 'active').length, orders: d.orders.length, gmv, revenue,
      vip: d.vipSubscriptions.filter((v) => v.status !== 'expired').length, shipmentsInTransit: d.shipments.filter((s) => !['delivered'].includes(s.stage)).length,
      pendingInvoices: d.invoices.filter((i) => ['under_review', 'processing'].includes(i.status)).length,
      pendingSuppliers: d.suppliers.filter((s) => s.status === 'pending').length, pendingCars: d.cars.filter((c) => c.verification === 'pending').length,
      openTickets: d.tickets.filter((t) => t.status !== 'resolved').length, days, byCategory,
    };
  },
};
