import type { CartItem, Order, OrderStatus, Shipment } from '@/lib/types';
import { estimateCart, variantPrice } from '@/lib/pricing';
import { ApiError, clone, commit, db, network, notify, now, requireRole, requireUser, uid } from './db';
import { paymentService } from './paymentService';
import { stageLocation } from '@/data/seed';
import { vipService } from './vipService';

export type OrderTab = 'all' | 'active' | 'completed' | 'cancelled';
const ACTIVE: OrderStatus[] = ['pending_payment', 'paid', 'processing', 'shipped'];

function nextOrderNumber() {
  const max = db().orders.reduce((m, o) => Math.max(m, Number(o.number.replace(/\D/g, '')) || 0), 10000);
  return `CO-${max + 7}`;
}

function createShipmentForOrder(order: Order): Shipment {
  const d = db();
  const pkgs = order.items.map((it, k) => {
    const p = d.products.find((x) => x.id === it.productId);
    return { id: `${order.id}-pk${k}`, orderId: order.id, userId: order.userId, label: it.title, weightKg: Math.round((p?.weightKg ?? 1) * it.qty * 10) / 10, volumeM3: Math.round((p?.volumeM3 ?? 0.005) * it.qty * 1000) / 1000, status: 'awaiting' as const, warehouseId: 'w1' };
  });
  const supplier = d.suppliers.find((s) => s.id === order.items[0]?.supplierId);
  const t = now();
  return {
    id: uid('sh'), trackingNumber: `C1TM${Math.floor(830000 + Math.random() * 160000)}`, userId: order.userId, orderIds: [order.id], supplierName: supplier?.name || 'Supplier',
    warehouseId: 'w1', packages: pkgs, weightKg: Math.round(pkgs.reduce((s, p) => s + p.weightKg, 0) * 10) / 10, volumeM3: Math.round(pkgs.reduce((s, p) => s + p.volumeM3, 0) * 1000) / 1000,
    eta: new Date(Date.now() + (order.delivery === 'express' ? 11 : 24) * 86_400_000).toISOString(), costTMT: order.costs.cargoTMT, stage: 'payment_confirmed',
    carrier: order.delivery === 'express' ? 'Turkmenistan Airlines Cargo' : 'TransCaspian Rail', mode: order.delivery === 'express' ? 'air' : 'rail',
    destination: order.addressText, documents: [], createdAt: t, kind: 'goods',
    events: [
      { id: uid('e'), stage: 'order_created', at: order.createdAt, location: stageLocation('order_created'), note: '' },
      { id: uid('e'), stage: 'payment_confirmed', at: t, location: stageLocation('payment_confirmed'), note: '' },
    ],
  };
}

export const orderService = {
  async list(tab: OrderTab = 'all') {
    const user = requireUser();
    await network();
    let items = db().orders.filter((o) => o.userId === user.id);
    if (tab === 'active') items = items.filter((o) => ACTIVE.includes(o.status));
    if (tab === 'completed') items = items.filter((o) => o.status === 'delivered');
    if (tab === 'cancelled') items = items.filter((o) => o.status === 'cancelled');
    return clone([...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
  async get(id: string) {
    const user = requireUser();
    await network(120, 300);
    const d = db();
    const order = d.orders.find((o) => o.id === id);
    if (!order || (order.userId !== user.id && user.role !== 'admin')) throw new ApiError('not_found');
    return clone({
      order,
      payment: d.payments.find((p) => p.id === order.paymentId) || null,
      shipment: d.shipments.find((s) => s.id === order.shipmentId) || null,
      suppliers: [...new Set(order.items.map((i) => i.supplierId))].map((sid) => d.suppliers.find((s) => s.id === sid)!).filter(Boolean),
    });
  },

  /** Creates an order and runs payment. On decline the order stays `pending_payment` and can be retried. */
  async checkout(input: { items: CartItem[]; addressId: string; delivery: 'standard' | 'express'; methodId: string; source?: Order['source'] }) {
    const user = requireUser();
    const d = db();
    if (!input.items.length) throw new ApiError('cart_empty');
    const address = d.addresses.find((a) => a.id === input.addressId && a.userId === user.id);
    if (!address) throw new ApiError('address_required');
    for (const it of input.items) {
      const p = d.products.find((x) => x.id === it.productId);
      if (!p || !p.published) throw new ApiError('product_unavailable');
      // W1: no order without a complete price estimate (missing source price or weight blocks checkout).
      if (p.pricing && p.pricing.status !== 'estimate') throw new ApiError('price_unavailable');
      if (p.availability === 'out_of_stock') throw new ApiError('insufficient_stock');
      if (it.qty < 1 || (p.availability !== 'unknown' && it.qty > p.stock)) throw new ApiError('insufficient_stock');
    }
    await network(300, 600);
    const products = new Map(d.products.map((p) => [p.id, p]));
    const vip = vipService.isActive(user.id);
    const costs = estimateCart(input.items, products, d.content.settings, { vip, delivery: input.delivery });
    const order: Order = {
      id: uid('o'), number: nextOrderNumber(), userId: user.id, status: 'pending_payment', delivery: input.delivery, costs, createdAt: now(),
      addressId: address.id, addressText: `${address.city}, ${address.street} ${address.building}${address.apartment ? ', ' + address.apartment : ''}`,
      supplierStatus: 'awaiting', documents: [], source: input.source || 'shop',
      items: input.items.map((it) => { const p = products.get(it.productId)!; return { productId: p.id, variantId: it.variantId, title: p.title + (it.variantId ? ` · ${p.variants.find((v) => v.id === it.variantId)?.name ?? ''}` : ''), qty: it.qty, unitPriceCNY: variantPrice(p, it.variantId), supplierId: p.supplierId }; }),
    };
    commit((dd) => { dd.orders.unshift(order); });
    return orderService.pay(order.id, input.methodId);
  },

  async pay(orderId: string, methodId: string) {
    const user = requireUser();
    const order = db().orders.find((o) => o.id === orderId && o.userId === user.id);
    if (!order) throw new ApiError('not_found');
    if (order.status !== 'pending_payment') throw new ApiError('already_paid');
    const payment = await paymentService.charge({ kind: 'order', refId: order.id, amount: order.costs.totalTMT, currency: 'TMT', feeTMT: order.costs.serviceTMT, methodId });
    if (payment.status === 'succeeded') {
      const shipment = createShipmentForOrder(order);
      commit((d) => {
        order.status = 'paid'; order.paymentId = payment.id; order.shipmentId = shipment.id;
        order.documents = [`Commercial invoice ${order.number}.pdf`];
        d.shipments.unshift(shipment);
        d.packages.push(...shipment.packages);
        for (const it of order.items) { const p = d.products.find((x) => x.id === it.productId); if (p) p.stock = Math.max(0, p.stock - it.qty); }
      });
      notify(user.id, { type: 'payment', key: 'payment_succeeded', params: { amount: `${order.costs.totalTMT.toFixed(2)} TMT`, number: order.number }, link: `/orders/${order.id}` });
      notify(user.id, { type: 'order', key: 'order_created', params: { number: order.number }, link: `/orders/${order.id}` });
    } else {
      commit(() => { order.paymentId = payment.id; });
      notify(user.id, { type: 'payment', key: 'payment_failed', params: { number: order.number }, link: `/orders/${order.id}` });
    }
    return clone({ order, payment });
  },

  async cancel(id: string) {
    const user = requireUser();
    await network();
    const o = db().orders.find((x) => x.id === id && (x.userId === user.id || user.role === 'admin'));
    if (!o) throw new ApiError('not_found');
    if (!['pending_payment', 'paid'].includes(o.status) || o.supplierStatus === 'accepted') throw new ApiError('cannot_cancel');
    commit((d) => {
      o.status = 'cancelled';
      const p = d.payments.find((x) => x.id === o.paymentId);
      if (p && p.status === 'succeeded') { p.status = 'refunded'; p.processedAt = now(); }
      d.shipments = d.shipments.filter((s) => s.id !== o.shipmentId);
    });
    return clone(o);
  },

  async reorderItems(id: string): Promise<CartItem[]> {
    const user = requireUser();
    await network(100, 200);
    const o = db().orders.find((x) => x.id === id && x.userId === user.id);
    if (!o) throw new ApiError('not_found');
    return o.items.filter((i) => db().products.some((p) => p.id === i.productId && p.published)).map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty }));
  },

  // ----- admin -----
  async listAll() {
    requireRole('admin');
    await network();
    return clone([...db().orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
  async adminSetStatus(id: string, status: OrderStatus) {
    requireRole('admin');
    await network(100, 250);
    commit((d) => { const o = d.orders.find((x) => x.id === id); if (o) o.status = status; });
  },
};
