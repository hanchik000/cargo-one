// Live marketplace search (Taobao through OT Commerce). The browser only talks to our own endpoint, which holds the key:
// the CARGO ONE server (/api/live-search), or — for the static GitHub Pages site — a Vercel function.
// Results become regular products in the local store so the product page, cart and compare work on them.
import type { CategoryId, Product } from '@/lib/types';
import type { Currency } from '@/shared/pricing.mjs';
import { estimate } from '@/shared/pricing.mjs';
import { settingsToConfig } from '@/lib/pricing';
import { commit, db } from './db';
import { SERVER_CATALOG } from './catalogApi';

declare const __LIVE_SEARCH_ORIGIN__: string | undefined;
const PAGES = typeof __PAGES__ === 'boolean' && __PAGES__;
const ORIGIN = typeof __LIVE_SEARCH_ORIGIN__ === 'string' ? __LIVE_SEARCH_ORIGIN__ : '';

/** Endpoint for this build, or null when live search is not available here. */
function endpoint(): string | null {
  if (SERVER_CATALOG) return '/api/live-search';
  if (!PAGES) return null; // Claude artifact preview: no external requests
  if (location.hostname.endsWith('.vercel.app')) return '/api/live-search';
  return ORIGIN ? ORIGIN.replace(/\/$/, '') + '/api/live-search' : null;
}
export const LIVE_SEARCH_ENABLED = endpoint() !== null;

interface LiveItem {
  id: string; title: string; originalTitle: string | null; images: string[]; price: { amount: string; currency: string } | null; url: string | null;
  moq: number | null; stock: number | null; availability: 'out_of_stock' | null; weightG: number | null; volumeCm3: number | null;
  seller: { id: string; name: string } | null; brand: string | null; categoryId: string; specs: [string, string][]; sourceUpdatedAt: string | null;
}
export interface LivePage { provider: string; query: string; page: number; total: number | null; hasMore: boolean; items: Product[] }

const CATS: CategoryId[] = ['electronics', 'fashion', 'home', 'beauty', 'kids', 'auto', 'tools', 'industrial', 'business'] as CategoryId[];
const MAX_LIVE = 300;
const ANGLES = ['front', 'side', 'detail', 'pack'] as const;

function toProduct(it: LiveItem, provider: string, fetchedAt: string): Product | null {
  if (!it.price || !['CNY', 'USD', 'TMT'].includes(it.price.currency)) return null;
  const currency = it.price.currency as Currency;
  const amount = Number(it.price.amount);
  if (!(amount > 0)) return null;
  const id = `live-${it.id}`.slice(0, 64);
  const pricing = estimate([{ amount: it.price.amount, currency, qty: 1, weightG: it.weightG, volumeCm3: it.volumeCm3 }], settingsToConfig(db().content.settings));
  const cnyRate = db().content.settings.cnyToTmt || 1;
  const usdRate = db().content.settings.usdToTmt || 1;
  const priceCNY = currency === 'CNY' ? amount : currency === 'USD' ? Math.round((amount * usdRate / cnyRate) * 100) / 100 : Math.round((amount / cnyRate) * 100) / 100;
  return {
    id, title: it.title, categoryId: (CATS.includes(it.categoryId as CategoryId) ? it.categoryId : 'home') as CategoryId,
    supplierId: it.seller ? `live-seller-${it.seller.id}`.slice(0, 64) : '', icon: 'Package', priceCNY,
    images: it.images.map((src, k) => ({ id: `${id}-img${k}`, tone: (k * 23) % 100, angle: ANGLES[k % 4], src })),
    variants: [], specs: it.specs, stock: it.stock ?? 0, moq: it.moq ?? 1, leadDays: 0,
    weightKg: it.weightG ? it.weightG / 1000 : 0, volumeM3: it.volumeCm3 ? it.volumeCm3 / 1_000_000 : 0,
    score: 0, verified: false, published: true, featured: false, rating: 0, reviews: [], tags: [], popularityAshgabat: 0,
    createdAt: fetchedAt, keywords: [], status: 'published', availability: it.availability ?? (it.stock == null ? 'unknown' : it.stock > 0 ? 'in_stock' : 'out_of_stock'),
    updatedAt: fetchedAt, origin: 'imported', demo: false, sample: false, leadDaysKnown: false, weightKnown: it.weightG != null, weightEstimated: false,
    brand: it.brand, description: null, subcategoryId: null,
    localized: { lang: 'ru', titleLang: 'ru', fallback: false, machine: !!it.originalTitle },
    source: { name: 'ot-live', label: `${provider} · via OT Commerce`, productId: it.id, url: it.url, price: pricing.source, syncedAt: fetchedAt, sourceUpdatedAt: it.sourceUpdatedAt, syncStatus: 'ok', lastError: null, stale: false },
    pricing,
    seller: it.seller ? { id: `live-seller-${it.seller.id}`.slice(0, 64), name: it.seller.name, level: 0, score: null, scoreBasis: null, demo: false, status: 'unreviewed' } : null,
  };
}

/** Searches the live marketplace; the results are stored locally (most recent MAX_LIVE kept). */
export async function liveSearch(q: string, page = 1): Promise<LivePage> {
  const ep = endpoint();
  if (!ep) throw new Error('not_configured');
  let r: Response;
  try { r = await fetch(`${ep}?q=${encodeURIComponent(q)}&page=${page}`, { credentials: SERVER_CATALOG ? 'same-origin' : 'omit' }); }
  catch { throw new Error('network_error'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'server_error');
  const fetchedAt = j.fetchedAt || new Date().toISOString();
  const items = (j.items as LiveItem[]).map((it) => toProduct(it, j.provider, fetchedAt)).filter(Boolean) as Product[];
  commit((d) => {
    const ids = new Set(items.map((p) => p.id));
    const others = d.products.filter((p) => !ids.has(p.id));
    const live = others.filter((p) => p.id.startsWith('live-'));
    const drop = new Set(live.slice(MAX_LIVE - items.length).map((p) => p.id));
    d.products = [...items, ...others.filter((p) => !drop.has(p.id))];
  });
  return { provider: j.provider, query: j.query, page: j.page, total: j.total, hasMore: !!j.hasMore, items };
}
