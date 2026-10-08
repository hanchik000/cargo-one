// Mock database: a typed, persisted in-browser store that services treat like a remote API.
// Swap `services/*` implementations for real HTTP clients without touching the UI.
import * as seed from '@/data/seed';
import type {
  Address, AIRequest, AppNotification, BusinessProfile, CargoConsolidation, CargoPackage, Car, CarInspection, CarReservation, Category,
  ContentSettings, FaqItem, Favorite, GroupBuy, Invoice, Order, Payment, PaymentMethod, Product, Promotion, PromotionEntry, QuoteRequest,
  SearchRequest, SessionUser, Shipment, Supplier, SupplierPayout, SupportTicket, User, VIPSubscription, Warehouse,
} from '@/lib/types';

export interface DB {
  version: number;
  users: User[]; businesses: BusinessProfile[]; addresses: Address[]; paymentMethods: PaymentMethod[];
  categories: Category[]; products: Product[]; suppliers: Supplier[]; orders: Order[]; payments: Payment[]; invoices: Invoice[];
  shipments: Shipment[]; packages: CargoPackage[]; consolidations: CargoConsolidation[]; warehouses: Warehouse[];
  cars: Car[]; inspections: CarInspection[]; reservations: CarReservation[]; favorites: Favorite[]; groupBuys: GroupBuy[];
  vipSubscriptions: VIPSubscription[]; promotions: Promotion[]; promotionEntries: PromotionEntry[]; notifications: AppNotification[];
  tickets: SupportTicket[]; faqs: FaqItem[]; quotes: QuoteRequest[]; payouts: SupplierPayout[]; aiRequests: AIRequest[];
  searchRequests: SearchRequest[]; content: ContentSettings;
}

const KEY = 'cargo-one.db';
const VERSION = 8;

function fresh(): DB {
  return structuredClone({
    version: VERSION,
    users: seed.users, businesses: seed.businesses, addresses: seed.addresses, paymentMethods: seed.paymentMethods,
    categories: seed.categories, products: seed.products, suppliers: seed.suppliers, orders: seed.orders, payments: seed.payments,
    invoices: seed.invoices, shipments: seed.shipments, packages: seed.packages, consolidations: [], warehouses: seed.warehouses,
    cars: seed.cars, inspections: seed.inspections, reservations: seed.reservations, favorites: seed.favorites, groupBuys: seed.groupBuys,
    vipSubscriptions: seed.vipSubscriptions, promotions: seed.promotions, promotionEntries: seed.promotionEntries, notifications: seed.notifications,
    tickets: seed.tickets, faqs: seed.faqs, quotes: seed.quotes, payouts: seed.payouts, aiRequests: seed.aiRequests, searchRequests: seed.searchRequests,
    content: seed.content,
  });
}

let state: DB = load();
let revision = 0;
const listeners = new Set<() => void>();

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === VERSION) return parsed;
      // Additive migrations keep the user's data: v6 added promo banners + partners, v7 added try-on products.
      if ((parsed.version === 5 || parsed.version === 6) && parsed.content) {
        if (parsed.version === 5) {
          parsed.content.promoBanners = structuredClone(seed.content.promoBanners);
          parsed.content.partners = structuredClone(seed.content.partners);
        } else if (!parsed.content.promoBanners.some((b) => b.id === 'pb5')) {
          const pb5 = seed.content.promoBanners.find((b) => b.id === 'pb5');
          if (pb5) parsed.content.promoBanners.unshift(structuredClone(pb5));
          parsed.content.promoBanners.forEach((b, i) => { b.order = i; });
        }
        for (const sp of seed.products) {
          const cur = parsed.products.find((x) => x.id === sp.id);
          if (!cur) parsed.products.push(structuredClone(sp));
          else if (sp.tryOn && !cur.tryOn) cur.tryOn = sp.tryOn;
        }
        parsed.version = 7;
      }
      // v8 (W1): marketplace-first home — adds the trending / new arrivals rails and moves discovery rails first.
      if (parsed.version === 7 && parsed.content) {
        const vis = new Map(parsed.content.homeSections.map((h) => [h.key, h.visible]));
        parsed.content.homeSections = seed.HOME_SECTION_ORDER.map((key, order) => ({ key, order, visible: vis.get(key) ?? true }));
        parsed.version = VERSION;
        return parsed;
      }
    }
  } catch { /* storage unavailable or corrupted: fall back to seed */ }
  return fresh();
}
let saveTimer: number | undefined;
function persist() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota exceeded — keep in memory */ }
  }, 120);
}

function flushNow() { window.clearTimeout(saveTimer); try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ } }
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
}

export const db = () => state;
export const dbRevision = () => revision;
export function subscribeDb(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function commit(mutator: (d: DB) => void) {
  mutator(state);
  state = { ...state };
  revision++;
  persist();
  listeners.forEach((l) => l());
}
export function resetDb() { state = fresh(); revision++; persist(); listeners.forEach((l) => l()); }

// ---------- API-like helpers ----------
export class ApiError extends Error {
  constructor(public code: string, message?: string) { super(message || code); }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Simulates network latency and (optionally, toggled in Admin → Settings) random failures. */
export async function network(min = 180, max = 520) {
  await sleep(min + Math.random() * (max - min));
  if (state.content.settings.simulateErrors && Math.random() < 0.2) throw new ApiError('network_error');
}
export const uid = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const now = () => new Date().toISOString();
export const clone = <T,>(x: T): T => structuredClone(x);

// ---------- current session (set by AuthProvider from the server-verified session) ----------
let currentUser: SessionUser | null = null;
export const setCurrentUser = (u: SessionUser | null) => { currentUser = u; };
export const getCurrentUser = () => currentUser;
export function requireUser(): SessionUser {
  if (!currentUser) throw new ApiError('unauthorized');
  return currentUser;
}
export function requireRole(...roles: SessionUser['role'][]): SessionUser {
  const u = requireUser();
  if (!roles.includes(u.role)) throw new ApiError('forbidden');
  return u;
}

export function paginate<T>(items: T[], page = 1, pageSize = 12) {
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize, hasMore: start + pageSize < items.length };
}

export function notify(userId: string, n: Omit<AppNotification, 'id' | 'userId' | 'read' | 'createdAt'>) {
  commit((d) => { d.notifications.unshift({ ...n, id: uid('n'), userId, read: false, createdAt: now() }); });
}
