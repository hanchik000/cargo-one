import type { CargoPackage, Shipment, ShipmentStage } from '@/lib/types';
import { chargeableKg } from '@/lib/pricing';
import { STAGES, stageLocation } from '@/data/seed';
import { ApiError, clone, commit, db, network, notify, now, requireRole, requireUser, uid } from './db';

export const STAGE_GROUP: Record<ShipmentStage, 'pre' | 'china_warehouse' | 'consolidation' | 'in_transit' | 'customs' | 'turkmenistan' | 'delivered'> = {
  order_created: 'pre', payment_confirmed: 'pre', supplier_confirmed: 'pre', production: 'pre', china_warehouse: 'china_warehouse',
  consolidated: 'consolidation', departed_china: 'in_transit', in_transit: 'in_transit', customs: 'customs', arrived_tm: 'turkmenistan',
  local_hub: 'turkmenistan', out_for_delivery: 'turkmenistan', delivered: 'delivered',
};

function shipmentCost(kg: number) {
  const rate = db().content.settings.cargoRateTMTPerKg;
  return Math.max(35, kg * rate);
}

function applyStage(sh: Shipment, stage: ShipmentStage, note = '', location?: string) {
  sh.stage = stage;
  sh.events.push({ id: uid('e'), stage, at: now(), location: location || stageLocation(stage), note });
  const d = db();
  for (const oid of sh.orderIds) {
    const o = d.orders.find((x) => x.id === oid);
    if (!o) continue;
    const idx = STAGES.indexOf(stage);
    if (stage === 'delivered') o.status = 'delivered';
    else if (idx >= STAGES.indexOf('departed_china')) o.status = 'shipped';
    else if (idx >= STAGES.indexOf('supplier_confirmed')) { o.status = 'processing'; o.supplierStatus = 'accepted'; }
  }
  if (STAGES.indexOf(stage) >= STAGES.indexOf('china_warehouse')) sh.packages.forEach((p) => { if (p.status === 'awaiting') { p.status = 'received'; p.receivedAt = now(); } });
  if (stage === 'customs' && !sh.documents.includes('Customs declaration.pdf')) sh.documents.push('Customs declaration.pdf');
  if (sh.kind === 'vehicle') {
    const r = d.reservations.find((x) => x.userId === sh.userId && sh.trackingNumber.endsWith(x.number.replace('AUTO-', '')));
    if (r) {
      const map: Partial<Record<ShipmentStage, typeof r.step>> = { departed_china: 'shipping', customs: 'customs', arrived_tm: 'arrived_tm', delivered: 'delivery' };
      const step = map[stage];
      if (step) { r.step = step; r.history.push({ step, at: now() }); }
    }
  }
}

export const cargoService = {
  async dashboard() {
    const user = requireUser();
    await network();
    const d = db();
    const shipments = d.shipments.filter((s) => s.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const waiting = d.packages.filter((p) => p.userId === user.id && p.status === 'received' && !shipments.some((s) => s.stage !== 'china_warehouse' && s.packages.some((x) => x.id === p.id)));
    return clone({ shipments, waiting, warehouses: d.warehouses });
  },
  async get(id: string) {
    const user = requireUser();
    await network(120, 280);
    const s = db().shipments.find((x) => x.id === id);
    if (!s || (s.userId !== user.id && user.role !== 'admin')) throw new ApiError('not_found');
    const orders = db().orders.filter((o) => s.orderIds.includes(o.id));
    return clone({ shipment: s, orders, warehouse: db().warehouses.find((w) => w.id === s.warehouseId)! });
  },

  preview(pkgs: CargoPackage[]) {
    const weightKg = Math.round(pkgs.reduce((s, p) => s + p.weightKg, 0) * 10) / 10;
    const volumeM3 = Math.round(pkgs.reduce((s, p) => s + p.volumeM3, 0) * 1000) / 1000;
    const separate = pkgs.reduce((s, p) => s + shipmentCost(chargeableKg(p.weightKg, p.volumeM3)), 0);
    const combined = shipmentCost(chargeableKg(weightKg, volumeM3)) * 0.92; // 8% consolidation handling discount
    return { weightKg, volumeM3, separateTMT: Math.round(separate * 100) / 100, combinedTMT: Math.round(combined * 100) / 100, savingTMT: Math.max(0, Math.round((separate - combined) * 100) / 100) };
  },

  async consolidate(packageIds: string[]) {
    const user = requireUser();
    if (packageIds.length < 2) throw new ApiError('need_two_packages');
    const d = db();
    const pkgs = d.packages.filter((p) => packageIds.includes(p.id) && p.userId === user.id && p.status === 'received');
    if (pkgs.length !== packageIds.length) throw new ApiError('package_unavailable');
    await network(600, 1100);
    const pv = cargoService.preview(pkgs);
    const orderIds = [...new Set(pkgs.map((p) => p.orderId))];
    const shipment: Shipment = {
      id: uid('sh'), trackingNumber: `C1TM${Math.floor(840000 + Math.random() * 150000)}`, userId: user.id, orderIds, supplierName: 'Multiple suppliers',
      warehouseId: pkgs[0].warehouseId, packages: pkgs.map((p) => ({ ...p, status: 'consolidated' })), weightKg: pv.weightKg, volumeM3: pv.volumeM3,
      eta: new Date(Date.now() + 20 * 86_400_000).toISOString(), costTMT: pv.combinedTMT, stage: 'consolidated', carrier: 'TransCaspian Rail', mode: 'rail',
      destination: d.orders.find((o) => o.id === orderIds[0])?.addressText || 'Ashgabat Hub', documents: ['Consolidated packing list.pdf'], createdAt: now(), kind: 'goods',
      events: [
        { id: uid('e'), stage: 'china_warehouse', at: pkgs[0].receivedAt || now(), location: stageLocation('china_warehouse'), note: `${pkgs.length} packages received` },
        { id: uid('e'), stage: 'consolidated', at: now(), location: stageLocation('consolidated'), note: `${pkgs.length} packages → 1 shipment` },
      ],
    };
    commit((dd) => {
      dd.packages.forEach((p) => { if (packageIds.includes(p.id)) p.status = 'consolidated'; });
      // Old per-order shipments that only held these packages are merged into the new one.
      dd.shipments = dd.shipments.filter((s) => !(s.stage === 'china_warehouse' || s.stage === 'payment_confirmed' || s.stage === 'supplier_confirmed' || s.stage === 'production') || !s.packages.every((p) => packageIds.includes(p.id)));
      dd.shipments.unshift(shipment);
      dd.orders.forEach((o) => { if (orderIds.includes(o.id)) o.shipmentId = shipment.id; });
      dd.consolidations.push({ id: uid('cons'), userId: user.id, packageIds, shipmentId: shipment.id, savingTMT: pv.savingTMT, createdAt: now() });
    });
    notify(user.id, { type: 'cargo', key: 'consolidated', params: { count: pkgs.length, tracking: shipment.trackingNumber }, link: `/cargo/${shipment.id}` });
    return clone(shipment);
  },

  /** Demo control: moves a shipment to its next stage (in production this comes from the logistics partner webhook). */
  async advance(id: string) {
    const user = requireUser();
    const sh = db().shipments.find((s) => s.id === id && (s.userId === user.id || user.role === 'admin'));
    if (!sh) throw new ApiError('not_found');
    const idx = STAGES.indexOf(sh.stage);
    if (idx >= STAGES.length - 1) throw new ApiError('already_delivered');
    await network(300, 600);
    let next = STAGES[idx + 1];
    if (next === 'consolidated' && sh.orderIds.length <= 1) next = 'departed_china';
    commit(() => applyStage(sh, next));
    notify(sh.userId, { type: next === 'customs' ? 'customs' : next === 'delivered' ? 'delivery' : 'cargo', key: next === 'delivered' ? 'shipment_delivered' : 'cargo_stage', params: { tracking: sh.trackingNumber, stage: next }, link: `/track?q=${sh.trackingNumber}` });
    return clone(sh);
  },

  // ----- admin -----
  async listAll() {
    requireRole('admin');
    await network();
    return clone([...db().shipments].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },
  async adminSetStage(id: string, stage: ShipmentStage, note: string, location?: string) {
    requireRole('admin');
    await network(150, 300);
    const sh = db().shipments.find((s) => s.id === id);
    if (!sh) throw new ApiError('not_found');
    commit(() => applyStage(sh, stage, note, location));
    notify(sh.userId, { type: stage === 'delivered' ? 'delivery' : 'cargo', key: stage === 'delivered' ? 'shipment_delivered' : 'cargo_stage', params: { tracking: sh.trackingNumber, stage }, link: `/track?q=${sh.trackingNumber}` });
  },
  async adminAddEvent(id: string, note: string, location: string) {
    requireRole('admin');
    if (!note.trim()) throw new ApiError('validation');
    await network(120, 250);
    commit((d) => { const sh = d.shipments.find((s) => s.id === id); if (sh) sh.events.push({ id: uid('e'), stage: sh.stage, at: now(), location: location || stageLocation(sh.stage), note }); });
  },
  async adminUpdate(id: string, patch: Partial<Pick<Shipment, 'carrier' | 'warehouseId' | 'trackingNumber' | 'eta' | 'mode'>>) {
    requireRole('admin');
    await network(120, 250);
    commit((d) => { const sh = d.shipments.find((s) => s.id === id); if (sh) Object.assign(sh, patch); });
  },
  async adminAddDocument(id: string, name: string) {
    requireRole('admin');
    await network(300, 700);
    commit((d) => { d.shipments.find((s) => s.id === id)?.documents.push(name); });
  },
};

export const trackingService = {
  /** Universal lookup by order number, tracking number or vehicle reservation number. */
  async find(query: string) {
    await network(250, 600);
    const q = query.trim().toUpperCase();
    if (!q) throw new ApiError('validation');
    const d = db();
    const order = d.orders.find((o) => o.number.toUpperCase() === q || o.id.toUpperCase() === q);
    const reservation = d.reservations.find((r) => r.number.toUpperCase() === q);
    const shipment =
      d.shipments.find((s) => s.trackingNumber.toUpperCase() === q || s.id.toUpperCase() === q) ||
      (order?.shipmentId ? d.shipments.find((s) => s.id === order.shipmentId) : undefined) ||
      (reservation ? d.shipments.find((s) => s.kind === 'vehicle' && s.trackingNumber.endsWith(reservation.number.replace('AUTO-', ''))) : undefined);
    if (!shipment && !order && !reservation) return null;
    return clone({ shipment: shipment || null, order: order || null, reservation: reservation || null });
  },
};
