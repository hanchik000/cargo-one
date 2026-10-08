// HTTP client for the server catalogue (server build only). The artifact build has no server and keeps the
// in-browser implementation in productService.
import type { Product, SessionUser, Supplier } from '@/lib/types';
import type { Currency, PricingConfig } from '@/shared/pricing.mjs';
import { minorToMajor } from '@/shared/pricing.mjs';
import { getLang } from '@/i18n';
import { ApiError, commit } from './db';

export const SERVER_CATALOG = __TARGET__ !== 'artifact';

type Params = Record<string, string | number | boolean | undefined | null | string[]>;
function qs(params: Params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '' || v === false) continue;
    if (Array.isArray(v)) { if (v.length) sp.set(k, v.join(',')); continue; }
    sp.set(k, v === true ? '1' : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function apiGet<T>(path: string, params: Params = {}): Promise<T> {
  let res: Response;
  try { res = await fetch(path + qs({ lang: getLang(), ...params }), { credentials: 'same-origin' }); }
  catch { throw new ApiError('network_error'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'server_error');
  return data as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try { res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) }); }
  catch { throw new ApiError('network_error'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'server_error', Array.isArray(data.fields) ? `${data.error}: ${data.fields.join(', ')}` : undefined);
  return data as T;
}

export interface PublicPricing extends Omit<PricingConfig, 'fx'> { fx: Partial<Record<Currency, { rate: string; source: string; asOf: string }>>; confirmedQuotes: false }

/**
 * Mirrors the server catalogue into the browser store. Cart, orders, group buy, AI Buyer and other
 * still-local services read products and suppliers from there; the server stays the source of truth.
 */
let hydrating: Promise<void> | null = null;
export function hydrateCatalog(user: SessionUser | null): Promise<void> {
  if (!SERVER_CATALOG) return Promise.resolve();
  hydrating = (async () => {
    const [pricing, sup] = await Promise.all([
      apiGet<PublicPricing>('/api/catalog/pricing'),
      apiGet<{ suppliers: Supplier[] }>('/api/catalog/suppliers'),
    ]);
    const extra: Params = user?.role === 'admin' ? { includeUnpublished: true } : {};
    const products: Product[] = [];
    for (let page = 1; page <= 50; page++) {
      const r = await apiGet<{ items: Product[]; hasMore: boolean }>('/api/catalog/products', { page, pageSize: user?.role === 'admin' ? 500 : 100, sort: 'newest', ...extra });
      products.push(...r.items);
      if (!r.hasMore) break;
    }
    // A supplier also needs its own drafts (portal); fetched separately because the public list hides them.
    if (user?.role === 'supplier' && user.supplierId) {
      const own = await apiGet<{ items: Product[] }>('/api/catalog/products', { supplierId: user.supplierId, includeUnpublished: true, pageSize: 500 });
      for (const p of own.items) if (!products.some((x) => x.id === p.id)) products.push(p);
    }
    commit((d) => {
      const pct = (bps: number) => bps / 100;
      const num = (v: string | undefined, fallback: number) => (v != null && Number.isFinite(Number(v)) ? Number(v) : fallback);
      const s = d.content.settings;
      d.content.settings = {
        ...s,
        serviceFeePct: pct(pricing.serviceFeeBps), vipFeePct: pct(pricing.vipFeeBps), dutyEstimatePct: pct(pricing.dutyEstimateBps),
        cargoRateTMTPerKg: num(pricing.cargoRatePerKg, s.cargoRateTMTPerKg), expressRateTMTPerKg: num(pricing.expressRatePerKg, s.expressRateTMTPerKg),
        cnyToTmt: num(pricing.fx.CNY?.rate, s.cnyToTmt), usdToTmt: num(pricing.fx.USD?.rate, s.usdToTmt),
      };
      const byId = new Map(d.suppliers.map((x) => [x.id, x]));
      // Local suppliers keep their local workflow data (documents, payouts); the server adds the recorded trust level.
      // Sellers created by imports exist only on the server and are taken as served (nulls, not invented metrics).
      for (const x of sup.suppliers) { const cur = byId.get(x.id); byId.set(x.id, cur ? { ...cur, trust: x.trust } : x); }
      d.suppliers = [...byId.values()];
      d.products = products;
    });
  })().catch((e) => { console.warn('[catalog] hydration failed', e); });
  return hydrating;
}
export const catalogReady = () => hydrating ?? Promise.resolve();

/** Replaces one product in the mirror after a server write. */
export function mirrorProduct(p: Product) {
  commit((d) => {
    const i = d.products.findIndex((x) => x.id === p.id);
    if (i >= 0) d.products[i] = p; else d.products.unshift(p);
  });
}

export const minorToNumber = (m: number | null | undefined) => minorToMajor(m ?? null) ?? 0;
