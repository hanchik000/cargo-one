// Product catalogue client. Server build: the catalogue API (SQLite on the server) is the source of truth.
// Artifact build (no server): the same contract served from the in-browser demo store.
import type { CategoryId, Page, Product, Supplier } from '@/lib/types';
import { estimate } from '@/shared/pricing.mjs';
import { settingsToConfig } from '@/lib/pricing';
import { ApiError, clone, commit, db, getCurrentUser, network, paginate, requireRole, uid, now } from './db';
import { apiGet, apiPost, mirrorProduct, SERVER_CATALOG } from './catalogApi';

export type ProductSort = 'relevance' | 'price_asc' | 'price_desc' | 'score' | 'newest' | 'delivery';
export interface ProductQuery {
  q?: string; category?: CategoryId | ''; sort?: ProductSort; minPrice?: number; maxPrice?: number; minScore?: number;
  inStock?: boolean; verifiedOnly?: boolean; maxLeadDays?: number; page?: number; pageSize?: number; includeUnpublished?: boolean; supplierId?: string;
  drops?: boolean; tryOn?: boolean; brand?: string;
}

/** How a home rail was ranked, so the UI can label it honestly. */
export type RailBasis = 'views_7d' | 'views_30d' | 'insufficient_data' | 'editorial' | 'newest' | 'lowest_estimate_per_category' | 'category_or_tag'
  | 'old_price' | 'lead_days' | 'verification_level' | 'same_category_as_viewed';
export interface Rail { basis: RailBasis; items: Product[]; basedOn?: string | null }
export interface HomeRails {
  trending: Rail; popular: Rail; newArrivals: Rail; bestValue: Rail; business: Rail; priceDrops: Rail; fastDelivery: Rail; verifiedSuppliers: Rail; recommended: Rail;
}
export interface Alternatives { cheaper: Product | null; faster: Product | null; betterSupplier: Product | null }

const tokenize = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1);

/** Transparent text relevance (local build only): share of query tokens found in title/keywords/category. */
export function relevance(p: Product, q: string): number {
  const tokens = tokenize(q);
  if (!tokens.length) return 0;
  const hay = `${p.title} ${p.description || ''} ${p.brand || ''} ${p.keywords.join(' ')} ${p.categoryId} ${p.specs.map((s) => s.join(' ')).join(' ')}`.toLowerCase();
  const hits = tokens.filter((t) => hay.includes(t) || (t.length > 4 && hay.includes(t.slice(0, -1)))).length;
  return hits / tokens.length;
}

/** Local build: attach the same W1 fields the server returns (pricing from the shared core, demo provenance). */
function decorate(p: Product): Product {
  const s = db().content.settings;
  const pricing = estimate([{ amount: p.priceCNY, currency: 'CNY', qty: 1, weightG: Math.round(p.weightKg * 1000), volumeCm3: Math.round(p.volumeM3 * 1_000_000) }], settingsToConfig(s));
  return {
    ...p,
    status: p.status ?? (p.published ? 'published' : 'draft'),
    availability: p.availability ?? (p.stock > 0 ? 'in_stock' : 'out_of_stock'),
    origin: p.origin ?? 'editorial', demo: p.demo ?? true, sample: p.sample ?? false,
    leadDaysKnown: p.leadDaysKnown ?? true, weightKnown: p.weightKnown ?? true, source: p.source ?? null,
    pricing: p.pricing ?? pricing,
  };
}
const dec = (list: Product[]) => list.map(decorate);

const local = {
  async list(query: ProductQuery = {}): Promise<Page<Product>> {
    await network();
    const { q = '', category, sort = q ? 'relevance' : 'score', minPrice, maxPrice, minScore, inStock, verifiedOnly, maxLeadDays, page = 1, pageSize = 12, includeUnpublished, supplierId, drops, tryOn, brand } = query;
    let items = db().products.filter((p) => includeUnpublished || p.published);
    if (category) items = items.filter((p) => p.categoryId === category);
    if (supplierId) items = items.filter((p) => p.supplierId === supplierId);
    if (brand) items = items.filter((p) => (p.brand || '').toLowerCase() === brand.toLowerCase());
    if (q.trim()) items = items.filter((p) => relevance(p, q) > 0);
    if (minPrice != null) items = items.filter((p) => p.priceCNY >= minPrice);
    if (maxPrice != null) items = items.filter((p) => p.priceCNY <= maxPrice);
    if (minScore != null) items = items.filter((p) => supplierScore(p.supplierId) >= minScore);
    if (inStock) items = items.filter((p) => p.stock > 0);
    if (verifiedOnly) items = items.filter((p) => p.verified);
    if (maxLeadDays != null) items = items.filter((p) => p.leadDays <= maxLeadDays);
    if (drops) items = items.filter((p) => p.oldPriceCNY);
    if (tryOn) items = items.filter((p) => p.tryOn);
    const sorters: Record<ProductSort, (a: Product, b: Product) => number> = {
      relevance: (a, b) => relevance(b, q) - relevance(a, q) || b.score - a.score,
      price_asc: (a, b) => a.priceCNY - b.priceCNY,
      price_desc: (a, b) => b.priceCNY - a.priceCNY,
      score: (a, b) => b.score - a.score,
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      delivery: (a, b) => a.leadDays - b.leadDays,
    };
    items = [...items].sort(sorters[sort]);
    const pg = paginate(items, page, pageSize);
    return clone({ ...pg, items: dec(pg.items) });
  },

  async get(id: string): Promise<{ product: Product; supplier: Supplier | null }> {
    await network(120, 300);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new ApiError('invalid_id');
    const product = db().products.find((p) => p.id === id);
    if (!product) throw new ApiError('not_found');
    const supplier = db().suppliers.find((s) => s.id === product.supplierId) || null;
    return clone({ product: decorate(product), supplier });
  },

  async byIds(ids: string[]): Promise<Product[]> {
    await network(80, 200);
    return clone(dec(ids.map((id) => db().products.find((p) => p.id === id)).filter(Boolean) as Product[]));
  },

  /** Same rails and bases as the server; there is no view data in the local build, so trending is unavailable. */
  async rails(viewedIds: string[]): Promise<HomeRails> {
    await network();
    const all = dec(db().products.filter((p) => p.published));
    const editorial = [...all].sort((a, b) => Number(b.featured) - Number(a.featured) || b.score - a.score).slice(0, 12);
    const bestByCat = new Map<string, Product>();
    for (const p of all) {
      if (p.pricing?.status !== 'estimate') continue;
      const cur = bestByCat.get(p.categoryId);
      if (!cur || (p.pricing.totalMinor ?? 0) < (cur.pricing!.totalMinor ?? 0)) bestByCat.set(p.categoryId, p);
    }
    const last = viewedIds.map((id) => all.find((p) => p.id === id)).find(Boolean);
    return clone({
      trending: { basis: 'insufficient_data', items: [] },
      popular: { basis: 'editorial', items: editorial },
      newArrivals: { basis: 'newest', items: [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12) },
      bestValue: { basis: 'lowest_estimate_per_category', items: [...bestByCat.values()].sort((a, b) => (a.pricing!.totalMinor ?? 0) - (b.pricing!.totalMinor ?? 0)) },
      business: { basis: 'category_or_tag', items: all.filter((p) => p.categoryId === 'business' || p.tags.includes('business')).slice(0, 12) },
      priceDrops: { basis: 'old_price', items: all.filter((p) => p.oldPriceCNY).sort((a, b) => (b.oldPriceCNY! - b.priceCNY) / b.oldPriceCNY! - (a.oldPriceCNY! - a.priceCNY) / a.oldPriceCNY!).slice(0, 12) },
      fastDelivery: { basis: 'lead_days', items: [...all].sort((a, b) => a.leadDays - b.leadDays).slice(0, 12) },
      verifiedSuppliers: { basis: 'verification_level', items: all.filter((p) => p.verified).sort((a, b) => supplierScore(b.supplierId) - supplierScore(a.supplierId)).slice(0, 12) },
      recommended: last
        ? { basis: 'same_category_as_viewed', basedOn: last.title, items: all.filter((p) => p.categoryId === last.categoryId && !viewedIds.includes(p.id)).slice(0, 8) }
        : { basis: 'editorial', basedOn: null, items: editorial.slice(0, 8) },
    });
  },

  async alternatives(id: string): Promise<Alternatives> {
    await network(100, 250);
    const p = db().products.find((x) => x.id === id);
    if (!p) return { cheaper: null, faster: null, betterSupplier: null };
    const same = db().products.filter((x) => x.published && x.categoryId === p.categoryId && x.id !== p.id);
    const cheaper = same.filter((x) => x.priceCNY < p.priceCNY).sort((a, b) => a.priceCNY - b.priceCNY)[0] || null;
    const faster = same.filter((x) => x.leadDays < p.leadDays).sort((a, b) => a.leadDays - b.leadDays)[0] || null;
    const betterSupplier = same.filter((x) => supplierScore(x.supplierId) > supplierScore(p.supplierId)).sort((a, b) => supplierScore(b.supplierId) - supplierScore(a.supplierId))[0] || null;
    return clone({ cheaper: cheaper && decorate(cheaper), faster: faster && decorate(faster), betterSupplier: betterSupplier && decorate(betterSupplier) });
  },

  async recordView(_id: string) { /* no view data in the local build */ },

  // ----- admin / supplier mutations -----
  async save(input: Partial<Product> & { title: string; categoryId: CategoryId; supplierId: string; priceCNY: number }) {
    const user = requireRole('admin', 'supplier');
    if (user.role === 'supplier' && input.supplierId !== user.supplierId) throw new ApiError('forbidden');
    if (!input.title.trim() || !(input.priceCNY > 0)) throw new ApiError('validation');
    await network();
    let saved!: Product;
    commit((d) => {
      const existing = input.id ? d.products.find((p) => p.id === input.id) : undefined;
      if (existing) { Object.assign(existing, input); saved = existing; }
      else {
        const id = uid('p');
        const { id: _drop, ...rest } = input;
        saved = {
          icon: 'Package', images: [0, 1, 2, 3].map((k) => ({ id: `${id}-img${k}`, tone: Math.floor(Math.random() * 100), angle: (['front', 'side', 'detail', 'pack'] as const)[k] })),
          variants: [{ id: `${id}-v0`, name: 'Standard', priceDeltaCNY: 0, stock: input.stock ?? 100 }], specs: [], stock: 100, moq: 1, leadDays: 5,
          weightKg: 1, volumeM3: 0.005, score: supplierScore(input.supplierId), verified: !!d.suppliers.find((s) => s.id === input.supplierId)?.verified,
          published: user.role === 'admin', featured: false, rating: 0, reviews: [], tags: [], popularityAshgabat: 0, createdAt: now(), keywords: tokenize(input.title),
          ...rest, id,
        } as Product;
        d.products.unshift(saved);
      }
    });
    return clone(saved);
  },
  async update(id: string, patch: Partial<Product>) {
    const user = requireRole('admin', 'supplier');
    const p = db().products.find((x) => x.id === id);
    if (!p) throw new ApiError('not_found');
    if (user.role === 'supplier' && p.supplierId !== user.supplierId) throw new ApiError('forbidden');
    if (user.role === 'supplier' && ('published' in patch || 'featured' in patch || 'tags' in patch)) throw new ApiError('forbidden');
    await network(120, 260);
    commit(() => { Object.assign(p, patch); });
    return clone(p);
  },
  async remove(id: string) {
    requireRole('admin');
    await network(120, 260);
    commit((d) => { d.products = d.products.filter((p) => p.id !== id); });
  },
};

/** Fields the server accepts on editorial writes (everything else is ignored by design). */
function editorialPayload(input: Partial<Product>) {
  const out: Record<string, unknown> = {};
  for (const k of ['title', 'description', 'categoryId', 'supplierId', 'priceCNY', 'oldPriceCNY', 'stock', 'moq', 'leadDays', 'weightKg', 'volumeM3', 'brand', 'published', 'featured', 'tags'] as const) {
    if (k in input) out[k] = input[k as keyof Product] ?? null;
  }
  return out;
}

const remote: typeof local = {
  list: (query = {}) => apiGet<Page<Product>>('/api/catalog/products', { ...query } as Record<string, string | number | boolean | undefined>),
  get: (id) => apiGet<{ product: Product; supplier: Supplier | null }>(`/api/catalog/products/${encodeURIComponent(id)}`),
  async byIds(ids) {
    const clean = ids.filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id)).slice(0, 100);
    if (!clean.length) return [];
    const r = await apiGet<Page<Product>>('/api/catalog/products', { ids: clean, pageSize: 100 });
    const by = new Map(r.items.map((p) => [p.id, p]));
    return clean.map((id) => by.get(id)).filter(Boolean) as Product[];
  },
  rails: (viewedIds) => apiGet<HomeRails>('/api/catalog/home', { viewed: viewedIds.slice(0, 10) }),
  alternatives: (id) => apiGet<Alternatives>(`/api/catalog/products/${encodeURIComponent(id)}/alternatives`),
  async recordView(id) { try { await apiPost('/api/catalog/events', { kind: 'view', productId: id }); } catch { /* a lost view signal is not an error */ } },
  async save(input) {
    let body = editorialPayload(input);
    const existing = input.id ? db().products.find((p) => p.id === input.id) : undefined;
    if (existing) {
      // Send only changed fields: every field sent becomes editorial-owned (protected from later imports).
      const cur = existing as unknown as Record<string, unknown>;
      body = Object.fromEntries(Object.entries(body).filter(([k, v]) => JSON.stringify(cur[k] ?? null) !== JSON.stringify(v ?? null)));
      if (getCurrentUser()?.role !== 'admin') delete body.supplierId;
      if (!Object.keys(body).length) return clone(existing);
    }
    const r = input.id
      ? await apiPost<{ product: Product }>(`/api/catalog/manage/products/${encodeURIComponent(input.id)}`, body)
      : await apiPost<{ product: Product }>('/api/catalog/manage/products', body);
    mirrorProduct(r.product);
    return r.product;
  },
  async update(id, patch) {
    if (getCurrentUser()?.role !== 'admin') delete (patch as Record<string, unknown>).supplierId;
    const r = await apiPost<{ product: Product }>(`/api/catalog/manage/products/${encodeURIComponent(id)}`, editorialPayload(patch));
    mirrorProduct(r.product);
    return r.product;
  },
  async remove(id) {
    await apiPost(`/api/catalog/manage/products/${encodeURIComponent(id)}/archive`, {});
    commit((d) => { d.products = d.products.filter((p) => p.id !== id); });
  },
};

export const productService = SERVER_CATALOG ? remote : local;

export function supplierScore(supplierId: string) {
  return db().suppliers.find((s) => s.id === supplierId)?.score ?? 0;
}
