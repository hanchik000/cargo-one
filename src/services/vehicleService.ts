import type { AutoStep, Car, CarFuel, CarInspection, CarReservation, InspectionItemKey } from '@/lib/types';
import { AUTO_FLOW } from '@/lib/types';
import { buildInspectionItems, eventsUpTo, scoreInspection } from '@/data/seed';
import { ApiError, clone, commit, db, network, notify, now, requireRole, requireUser, uid } from './db';
import { paymentService } from './paymentService';

export type CarCategory = '' | 'new' | 'used' | 'ev' | 'hybrid' | 'commercial';
export interface CarQuery {
  category?: CarCategory; brand?: string; model?: string; minYear?: number; maxPrice?: number; maxMileage?: number; fuel?: CarFuel | '';
  minBattery?: number; drive?: Car['drive'] | ''; body?: Car['body'] | ''; noAccident?: boolean; noMajorAccident?: boolean; verifiedOnly?: boolean;
  sort?: 'price_asc' | 'price_desc' | 'year' | 'mileage' | 'score'; includeUnpublished?: boolean; q?: string;
}

/** A car may be presented as verified only if a passing inspection record exists. */
export function isVerified(car: Car, inspections: CarInspection[]) {
  if (car.verification !== 'verified' || !car.inspectionId) return false;
  const insp = inspections.find((i) => i.id === car.inspectionId);
  return !!insp && insp.result !== 'failed';
}

function filterCars(cars: Car[], q: CarQuery, inspections: CarInspection[]) {
  let items = cars.filter((c) => q.includeUnpublished || c.published);
  const cat = q.category;
  if (cat === 'new' || cat === 'used') items = items.filter((c) => c.condition === cat);
  if (cat === 'ev') items = items.filter((c) => c.fuel === 'ev');
  if (cat === 'hybrid') items = items.filter((c) => c.fuel === 'hybrid');
  if (cat === 'commercial') items = items.filter((c) => c.commercial);
  if (q.brand) items = items.filter((c) => c.brand.toLowerCase() === q.brand!.toLowerCase());
  if (q.model) items = items.filter((c) => c.model.toLowerCase().includes(q.model!.toLowerCase()));
  if (q.q) { const s = q.q.toLowerCase(); items = items.filter((c) => `${c.brand} ${c.model}`.toLowerCase().includes(s)); }
  if (q.minYear) items = items.filter((c) => c.year >= q.minYear!);
  if (q.maxPrice) items = items.filter((c) => c.priceUSD <= q.maxPrice!);
  if (q.maxMileage != null) items = items.filter((c) => c.mileageKm <= q.maxMileage!);
  if (q.fuel) items = items.filter((c) => c.fuel === q.fuel);
  if (q.minBattery) items = items.filter((c) => (c.batteryKwh ?? 0) >= q.minBattery!);
  if (q.drive) items = items.filter((c) => c.drive === q.drive);
  if (q.body) items = items.filter((c) => c.body === q.body);
  if (q.noAccident) items = items.filter((c) => c.accident === 'none');
  if (q.noMajorAccident) items = items.filter((c) => c.accident !== 'major');
  if (q.verifiedOnly) items = items.filter((c) => isVerified(c, inspections) || c.condition === 'new');
  const score = (c: Car) => inspections.find((i) => i.id === c.inspectionId)?.score ?? 0;
  const sort = q.sort || 'score';
  return [...items].sort((a, b) =>
    sort === 'price_asc' ? a.priceUSD - b.priceUSD : sort === 'price_desc' ? b.priceUSD - a.priceUSD : sort === 'year' ? b.year - a.year : sort === 'mileage' ? a.mileageKm - b.mileageKm : score(b) - score(a) || b.year - a.year);
}

const BRANDS = ['byd', 'geely', 'zeekr', 'li auto', 'chery', 'changan', 'nio', 'haval', 'great wall', 'wuling', 'toyota'];

/** Rule-based natural-language parser (mock for a future LLM call). Every parsed constraint is shown back to the user. */
export function parseCarQuery(text: string): CarQuery & { understood: string[] } {
  const t = text.toLowerCase().replace(/,/g, '');
  const q: CarQuery & { understood: string[] } = { understood: [] };
  const price = [...t.matchAll(/(?:under|below|less than|до|дешевле|max|<)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k|к|000)?/g)]
    .find((m) => !/^\s*(km|км)/.test(t.slice((m.index ?? 0) + m[0].length)));
  if (price) { let v = Number(price[1]); if (price[2] === 'k' || price[2] === 'к') v *= 1000; if (v < 1000) v *= 1000; q.maxPrice = v; q.understood.push('price'); }
  const year = /(20\d{2})\s*(?:or newer|and newer|\+|или новее|и новее|ýa-da täze)/.exec(t) || /(?:after|newer than|от|с)\s*(20\d{2})/.exec(t);
  if (year) { q.minYear = Number(year[1]); q.understood.push('year'); }
  const km = /(?:less than|under|below|до|меньше)\s*(\d+)\s*(k|к|000)?\s*(?:km|км)/.exec(t);
  if (km) { let v = Number(km[1]); if (km[2]) v *= 1000; q.maxMileage = v; q.understood.push('mileage'); }
  if (/electric|\bev\b|электро|elektrik/.test(t)) { q.fuel = 'ev'; q.understood.push('fuel'); }
  else if (/hybrid|гибрид|gibrid/.test(t)) { q.fuel = 'hybrid'; q.understood.push('fuel'); }
  else if (/diesel|дизел/.test(t)) { q.fuel = 'diesel'; q.understood.push('fuel'); }
  if (/verified|проверен|barlanan/.test(t)) { q.verifiedOnly = true; q.understood.push('verified'); }
  if (/no (serious|major) accident|без серьёзных|без серьезных/.test(t)) { q.noMajorAccident = true; q.understood.push('accident'); }
  else if (/no accident|без дтп|accident free|avariýasyz/.test(t)) { q.noAccident = true; q.understood.push('accident'); }
  if (/suv|кроссовер|внедорожник/.test(t)) { q.body = 'suv'; q.understood.push('body'); }
  else if (/sedan|седан/.test(t)) { q.body = 'sedan'; q.understood.push('body'); }
  else if (/pickup|пикап/.test(t)) { q.body = 'pickup'; q.understood.push('body'); }
  else if (/\bvan\b|фургон/.test(t)) { q.body = 'van'; q.understood.push('body'); }
  if (/awd|4x4|4×4|полный привод/.test(t)) { q.drive = 'awd'; q.understood.push('drive'); }
  if (/\bnew\b|новый|новую/.test(t) && !/newer/.test(t)) { q.category = 'new'; q.understood.push('condition'); }
  else if (/\bused\b|подержан|б\/у/.test(t)) { q.category = 'used'; q.understood.push('condition'); }
  const brand = BRANDS.find((b) => t.includes(b));
  if (brand) { q.brand = brand === 'li auto' ? 'Li Auto' : brand === 'great wall' ? 'Great Wall' : brand.toUpperCase() === 'BYD' || brand === 'nio' ? brand.toUpperCase() : brand[0].toUpperCase() + brand.slice(1); q.understood.push('brand'); }
  return q;
}

export const vehicleService = {
  async list(q: CarQuery = {}) {
    await network();
    const d = db();
    return clone({ cars: filterCars(d.cars, q, d.inspections), inspections: d.inspections });
  },
  async brands() { return [...new Set(db().cars.map((c) => c.brand))].sort(); },
  async get(id: string) {
    await network(120, 300);
    const d = db();
    const car = d.cars.find((c) => c.id === id);
    if (!car) throw new ApiError('not_found');
    const inspection = car.inspectionId ? d.inspections.find((i) => i.id === car.inspectionId) || null : null;
    return clone({ car, inspection, verified: isVerified(car, d.inspections) });
  },
  async aiSearch(text: string) {
    if (text.trim().length < 3) throw new ApiError('validation');
    await network(500, 1000);
    const parsed = parseCarQuery(text);
    const d = db();
    const exact = filterCars(d.cars, parsed, d.inspections);
    // If nothing matches exactly, relax price by 15% and say so.
    let relaxed = false; let cars = exact;
    if (!exact.length && parsed.maxPrice) { relaxed = true; cars = filterCars(d.cars, { ...parsed, maxPrice: parsed.maxPrice * 1.15 }, d.inspections); }
    return clone({ parsed, cars, relaxed, inspections: d.inspections });
  },

  async reserve(carId: string, methodId: string) {
    const user = requireUser();
    const car = db().cars.find((c) => c.id === carId);
    if (!car || !car.published) throw new ApiError('not_found');
    if (car.reservedBy && car.reservedBy !== user.id) throw new ApiError('already_reserved');
    if (car.condition === 'used' && !isVerified(car, db().inspections)) throw new ApiError('not_verified');
    const reservation: CarReservation = {
      id: uid('r'), number: `AUTO-${5013 + db().reservations.length * 3}`, carId, userId: user.id, depositUSD: 1000, step: 'reserve', createdAt: now(),
      history: [{ step: 'select', at: now() }, { step: 'inspection_view', at: now() }, { step: 'reserve', at: now() }],
    };
    commit((d) => { d.reservations.unshift(reservation); });
    const payment = await paymentService.charge({ kind: 'auto_reservation', refId: reservation.id, amount: reservation.depositUSD, currency: 'USD', methodId });
    if (payment.status === 'succeeded') {
      commit((d) => {
        reservation.paymentId = payment.id; reservation.step = 'payment'; reservation.history.push({ step: 'payment', at: now() });
        car.reservedBy = user.id;
        d.shipments.unshift({
          id: uid('sh'), trackingNumber: `C1AUTO${reservation.number.replace('AUTO-', '')}`, userId: user.id, orderIds: [], supplierName: `${car.brand} seller, ${car.location}`,
          warehouseId: 'w2', packages: [], weightKg: 1800, volumeM3: 12, eta: new Date(Date.now() + 28 * 86_400_000).toISOString(), costTMT: 2200 * d.content.settings.usdToTmt,
          stage: 'payment_confirmed', carrier: 'TransCaspian Rail (car carrier)', mode: 'rail', destination: 'Ashgabat Hub, TM', documents: ['Reservation agreement.pdf'],
          events: eventsUpTo('payment_confirmed', 0, uid('ev')), createdAt: now(), kind: 'vehicle',
        });
      });
      notify(user.id, { type: 'order', key: 'auto_reserved', params: { number: reservation.number, car: `${car.brand} ${car.model}` }, link: `/auto/reservations/${reservation.id}` });
    } else {
      commit((d) => { d.reservations = d.reservations.filter((r) => r.id !== reservation.id); });
    }
    return clone({ reservation, payment });
  },
  async reservations() {
    const user = requireUser();
    await network(120, 260);
    const d = db();
    return clone(d.reservations.filter((r) => r.userId === user.id).map((r) => ({ reservation: r, car: d.cars.find((c) => c.id === r.carId)! })));
  },
  async reservation(id: string) {
    const user = requireUser();
    await network(120, 260);
    const d = db();
    const r = d.reservations.find((x) => x.id === id && (x.userId === user.id || user.role === 'admin'));
    if (!r) throw new ApiError('not_found');
    const car = d.cars.find((c) => c.id === r.carId)!;
    const shipment = d.shipments.find((s) => s.kind === 'vehicle' && s.trackingNumber === `C1AUTO${r.number.replace('AUTO-', '')}`) || null;
    return clone({ reservation: r, car, shipment, inspection: d.inspections.find((i) => i.id === car.inspectionId) || null });
  },
  /** Demo control: advance purchase flow (in production, driven by operations). */
  async advanceReservation(id: string) {
    const user = requireUser();
    const r = db().reservations.find((x) => x.id === id && (x.userId === user.id || user.role === 'admin'));
    if (!r) throw new ApiError('not_found');
    const idx = AUTO_FLOW.indexOf(r.step);
    if (idx >= AUTO_FLOW.length - 1) throw new ApiError('already_delivered');
    await network(300, 600);
    const next: AutoStep = AUTO_FLOW[idx + 1];
    commit((d) => {
      r.step = next; r.history.push({ step: next, at: now() });
      const sh = d.shipments.find((s) => s.kind === 'vehicle' && s.trackingNumber === `C1AUTO${r.number.replace('AUTO-', '')}`);
      const map: Partial<Record<AutoStep, Parameters<typeof eventsUpTo>[0]>> = { china_docs: 'supplier_confirmed', pre_ship_inspection: 'china_warehouse', shipping: 'departed_china', customs: 'customs', arrived_tm: 'arrived_tm', delivery: 'delivered' };
      const stage = map[next];
      if (sh && stage) { sh.stage = stage; sh.events.push({ id: uid('e'), stage, at: now(), location: stage === 'delivered' ? 'Recipient' : sh.events[sh.events.length - 1]?.location || '', note: '' }); }
    });
    notify(r.userId, { type: next === 'customs' ? 'customs' : 'order', key: 'auto_step', params: { number: r.number, step: next }, link: `/auto/reservations/${r.id}` });
    return clone(r);
  },

  // ----- admin -----
  async save(input: Partial<Car> & { brand: string; model: string; year: number; priceUSD: number }) {
    requireRole('admin');
    if (!input.brand.trim() || !input.model.trim() || input.priceUSD <= 0 || input.year < 2000) throw new ApiError('validation');
    await network();
    let saved!: Car;
    commit((d) => {
      const ex = input.id ? d.cars.find((c) => c.id === input.id) : undefined;
      // Verification can only be set through an inspection; strip any attempt to set it here.
      const { verification: _ignored, inspectionId: _i, id: _id, ...safe } = input;
      void _ignored; void _i; void _id;
      if (ex) { Object.assign(ex, safe); saved = ex; }
      else {
        const id = uid('c');
        saved = { condition: 'used', fuel: 'petrol', body: 'sedan', commercial: false, mileageKm: 0, drive: 'fwd', color: 'White', accident: 'none', owners: 1,
          verification: 'not_inspected', published: false, location: 'Guangzhou', vin: '', createdAt: now(),
          images: (['front', 'side', 'rear', 'interior'] as const).map((view, k) => ({ id: `${id}-im${k}`, tone: Math.floor(Math.random() * 100) + k, view })), ...safe, id } as Car;
        d.cars.unshift(saved);
      }
    });
    return clone(saved);
  },
  async update(id: string, patch: Pick<Partial<Car>, 'published' | 'priceUSD' | 'reservedBy'>) {
    requireRole('admin');
    await network(100, 220);
    commit((d) => { const c = d.cars.find((x) => x.id === id); if (c) Object.assign(c, patch); });
  },
  async remove(id: string) {
    requireRole('admin');
    await network();
    commit((d) => { d.cars = d.cars.filter((c) => c.id !== id); });
  },
};

export const inspectionService = {
  async listAll() {
    requireRole('admin');
    await network();
    const d = db();
    return clone(d.inspections.map((i) => ({ inspection: i, car: d.cars.find((c) => c.id === i.carId) || null })));
  },
  async assignInspector(carId: string, inspector: string) {
    requireRole('admin');
    if (inspector.trim().length < 3) throw new ApiError('validation');
    await network();
    commit((d) => { const c = d.cars.find((x) => x.id === carId); if (c && c.verification !== 'verified') c.verification = 'pending'; });
    return inspector;
  },
  /** Records an inspection. Score and result are computed from the items — they cannot be typed in freely. */
  async record(input: { carId: string; inspector: string; inspectorId: string; date: string; notes: Partial<Record<InspectionItemKey, string>>; fails: Partial<Record<InspectionItemKey, string>>; photos: number; videoMinutes: number; paintMicrons: [number, number]; summary: string }) {
    requireRole('admin');
    const d = db();
    const car = d.cars.find((c) => c.id === input.carId);
    if (!car) throw new ApiError('not_found');
    if (input.inspector.trim().length < 3 || !input.date) throw new ApiError('validation');
    if (input.photos < 20) throw new ApiError('photos_required');
    await network(400, 800);
    const items = buildInspectionItems(car.fuel === 'ev', input.notes, input.fails);
    const { score, result } = scoreInspection(items);
    const insp: CarInspection = {
      id: uid('i-'), carId: car.id, vin: car.vin, date: input.date, inspector: input.inspector, inspectorId: input.inspectorId || 'INS-NEW', score, result, items,
      photos: input.photos, videoMinutes: input.videoMinutes, paintMicrons: input.paintMicrons, summary: input.summary, location: `${car.location} inspection bay`,
    };
    commit((dd) => {
      dd.inspections = dd.inspections.filter((i) => i.carId !== car.id);
      dd.inspections.unshift(insp);
      car.inspectionId = insp.id;
      car.verification = result === 'failed' ? 'rejected' : 'pending'; // requires explicit admin verification step
    });
    return clone(insp);
  },
  async setVerification(carId: string, status: 'verified' | 'rejected' | 'pending') {
    requireRole('admin');
    const d = db();
    const car = d.cars.find((c) => c.id === carId);
    if (!car) throw new ApiError('not_found');
    const insp = d.inspections.find((i) => i.id === car.inspectionId);
    if (status === 'verified' && (!insp || insp.result === 'failed')) throw new ApiError('inspection_required');
    await network(150, 300);
    commit(() => { car.verification = status; });
    return true;
  },
};
