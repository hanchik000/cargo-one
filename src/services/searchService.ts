// FIND (visual/link/text sourcing), AI BUYER (procurement) and unified search.
// All "AI" here is transparent rule-based mock logic with the same interface a model-backed service would have.
import type { AIRequest, CategoryId, Product, QuoteOption, SearchRequest } from '@/lib/types';
import { estimateProduct } from '@/lib/pricing';
import { ApiError, clone, commit, db, getCurrentUser, network, now, uid } from './db';
import { relevance } from './productService';

export type FindMode = SearchRequest['mode'];
export interface FindResult { product: Product; similarity: number; supplierScore: number; finalTMT: number; label: 'best_match' | 'cheaper' | 'premium' }

const hash = (s: string) => [...s].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381);

const CATEGORY_HINTS: [RegExp, CategoryId][] = [
  [/bag|сумк|tote|purse|handbag|çanta/i, 'fashion'], [/shoe|sneaker|кроссов|кеды/i, 'fashion'], [/coat|jacket|dress|пальто|куртк/i, 'fashion'],
  [/earbud|headphone|наушник|watch|часы|charger|speaker|camera|phone|keyboard/i, 'electronics'],
  [/lamp|pan|pot|cookware|pillow|chair|кресл|посуд|ламп/i, 'home'], [/serum|cream|cosmetic|hair|косметик|крем/i, 'beauty'],
  [/toy|lego|kids|bike|игрушк|детск/i, 'kids'], [/drill|tool|wrench|инструмент|дрель/i, 'tools'], [/box|packag|carton|коробк|упаков/i, 'business'],
  [/dash ?cam|car |auto|авто/i, 'auto'], [/shelv|valve|industrial|стеллаж/i, 'industrial'],
];

function similarity(p: Product, query: string, seedText: string) {
  const r = relevance(p, query);
  const jitter = (hash(seedText + p.id) % 9) / 100;
  return Math.min(0.98, Math.round((0.55 + r * 0.35 + jitter) * 100) / 100);
}

export const searchService = {
  /** FIND: returns Best match / Cheaper / Premium for a photo, link, video or description. */
  async find(input: { mode: FindMode; text?: string; fileName?: string; url?: string }) {
    const s = db().content.settings;
    if (input.mode === 'url' && input.url && !/^https?:\/\/\S+\.\S+/.test(input.url)) throw new ApiError('invalid_url');
    if ((input.mode === 'text' || input.mode === 'voice') && (!input.text || input.text.trim().length < 3)) throw new ApiError('validation');
    if ((input.mode === 'image' || input.mode === 'video') && !input.fileName) throw new ApiError('file_required');
    await network(1100, 1900); // visual embedding + catalogue search
    const signal = `${input.text || ''} ${input.url || ''} ${input.fileName || ''}`.toLowerCase();
    let category: CategoryId | undefined = CATEGORY_HINTS.find(([re]) => re.test(signal))?.[1];
    const all = db().products.filter((p) => p.published);
    if (!category) {
      // Photos/videos without hints: deterministic pick from the file name (mock for visual similarity).
      const cats = [...new Set(all.map((p) => p.categoryId))];
      category = cats[hash(signal) % cats.length];
    }
    const query = signal.replace(/https?:\/\/\S+/g, ' ');
    const pool = all.filter((p) => p.categoryId === category).sort((a, b) => relevance(b, query) - relevance(a, query) || b.score - a.score);
    if (!pool.length) return { results: [] as FindResult[], category };
    const best = pool[0];
    const cheaper = pool.filter((p) => p.id !== best.id && p.priceCNY < best.priceCNY).sort((a, b) => a.priceCNY - b.priceCNY)[0];
    const premium = pool.filter((p) => p.id !== best.id && p.id !== cheaper?.id).sort((a, b) => b.priceCNY - a.priceCNY || b.score - a.score)[0];
    const sup = (id: string) => db().suppliers.find((x) => x.id === id)?.score ?? 0;
    const mk = (p: Product, label: FindResult['label'], sim: number): FindResult => ({ product: p, label, similarity: sim, supplierScore: sup(p.supplierId), finalTMT: estimateProduct(p, 1, s).totalTMT });
    const results = [mk(best, 'best_match', Math.max(0.86, similarity(best, query, signal)))];
    if (cheaper) results.push(mk(cheaper, 'cheaper', Math.min(0.85, similarity(cheaper, query, signal))));
    if (premium) results.push(mk(premium, 'premium', Math.min(0.82, similarity(premium, query, signal))));
    const req: SearchRequest = { id: uid('sr'), userId: getCurrentUser()?.id, query: input.text || input.url || input.fileName || '', mode: input.mode, createdAt: now(), resultIds: results.map((r) => r.product.id) };
    commit((d) => { d.searchRequests.unshift(req); d.searchRequests = d.searchRequests.slice(0, 50); });
    return clone({ results, category });
  },

  /** AI BUYER: parses a procurement brief and builds structured supplier options. */
  async procure(prompt: string): Promise<AIRequest> {
    if (prompt.trim().length < 8) throw new ApiError('validation');
    await network(1400, 2300);
    const s = db().content.settings;
    const t = prompt.toLowerCase().replace(/,/g, '');
    const qtyM = /(\d{1,6})\s*(?:pcs|pieces|units|шт|штук|sany|x\b)?\s*(?:[a-zа-я]+\s){0,4}?(?:box|boxes|bag|units|pcs|items|коробок|штук|chairs|earbuds|pieces)/.exec(t) || /\b(\d{2,6})\b/.exec(t);
    const budgetM = /(?:under|below|budget|within|до|не более)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k|к)?/.exec(t) || /\$\s*(\d+(?:\.\d+)?)\s*(k)?/.exec(t);
    const quantity = qtyM ? Number(qtyM[1]) : undefined;
    let budgetUSD = budgetM ? Number(budgetM[1]) * (budgetM[2] ? 1000 : 1) : undefined;
    if (budgetUSD && quantity && budgetUSD === quantity) budgetUSD = undefined;
    const categoryId = CATEGORY_HINTS.find(([re]) => re.test(t))?.[1];
    const keywords = t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3 && !/^\d+$/.test(w)).slice(0, 8);
    const d = db();
    const products = d.products.filter((p) => p.published && (!categoryId || p.categoryId === categoryId)).sort((a, b) => relevance(b, t) - relevance(a, t) || b.score - a.score);
    const base = products[0];
    // Suppliers that actually list the matched product come first, then by score.
    const candidates = d.suppliers
      .filter((sup) => sup.status === 'approved' && (!categoryId || sup.categories.includes(categoryId)))
      .sort((a, b) => Number(b.id === base?.supplierId) - Number(a.id === base?.supplierId) || b.score - a.score);
    const qty = quantity || base?.moq || 100;
    const baseUnitUSD = base ? (base.priceCNY * s.cnyToTmt) / s.usdToTmt / (base.title.match(/\((\d+)\)/) ? Number(base.title.match(/\((\d+)\)/)![1]) : 1) : 5;
    // [quality, price multiplier vs catalogue, production days, quality weight] — the catalogue owner quotes its listed price.
    const profiles: [QuoteOption['quality'], number, number, number][] = [['standard', 1, 12, 0.9], ['premium', 1.18, 16, 1], ['economy', 0.82, 10, 0.75], ['standard', 0.95, 7, 0.85]];
    const options: QuoteOption[] = candidates.slice(0, 4).map((sup, i) => {
      const [quality, mult, prodDays, qualityScore] = profiles[i % profiles.length];
      const unitPriceUSD = Math.round(baseUnitUSD * mult * (1 + (100 - sup.score) / 400) * 100) / 100;
      const shippingDays = 18 + (i % 3) * 2;
      const weight = (base?.weightKg || 1) / (base?.title.match(/\((\d+)\)/) ? Number(base.title.match(/\((\d+)\)/)![1]) : 1);
      const shippingUSD = Math.round(Math.max(35, weight * qty * s.cargoRateTMTPerKg) / s.usdToTmt);
      const totalUSD = Math.round((unitPriceUSD * qty + shippingUSD) * (1 + s.serviceFeePct / 100));
      const fitScore = Math.round(sup.score * 0.5 + qualityScore * 30 + (budgetUSD ? (totalUSD <= budgetUSD ? 20 : Math.max(0, 20 - ((totalUSD - budgetUSD) / budgetUSD) * 100)) : 15));
      const reasons = [`score:${sup.score}`, `response:${sup.responseHours}`, `moq:${sup.moq}`];
      if (budgetUSD) reasons.push(totalUSD <= budgetUSD ? 'within_budget' : 'over_budget');
      return { supplierId: sup.id, productId: sup.id === base?.supplierId ? base?.id : undefined, title: base?.title || prompt.slice(0, 60), unitPriceUSD, moq: sup.moq, productionDays: prodDays, quality, shippingDays, shippingUSD, totalUSD, recommendation: 'best_value', fitScore: Math.min(99, fitScore), reasons };
    });
    if (options.length) {
      const byPrice = [...options].sort((a, b) => a.totalUSD - b.totalUSD)[0];
      const byFast = [...options].sort((a, b) => a.productionDays + a.shippingDays - (b.productionDays + b.shippingDays))[0];
      const byQuality = options.find((o) => o.quality === 'premium');
      const best = [...options].sort((a, b) => b.fitScore - a.fitScore)[0];
      options.forEach((o) => (o.recommendation = o === best ? 'best_value' : o === byPrice ? 'lowest_price' : o === byFast ? 'fastest' : o === byQuality ? 'premium' : 'best_value'));
      options.sort((a, b) => b.fitScore - a.fitScore);
    }
    const req: AIRequest = { id: uid('ai'), userId: getCurrentUser()?.id, prompt, parsed: { quantity, budgetUSD, keywords, categoryId }, options, createdAt: now() };
    commit((dd) => { dd.aiRequests.unshift(req); dd.aiRequests = dd.aiRequests.slice(0, 30); });
    return clone(req);
  },
  async aiHistory() {
    const u = getCurrentUser();
    return clone(db().aiRequests.filter((r) => !u || r.userId === u.id).slice(0, 10));
  },

  /** Unified search (Cmd/Ctrl+K) across products, suppliers, cars, orders, tracking and AI requests. */
  unified(q: string) {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const d = db();
    const user = getCurrentUser();
    type Hit = { kind: 'product' | 'supplier' | 'car' | 'order' | 'tracking' | 'ai'; id: string; title: string; subtitle: string; href: string };
    const hits: Hit[] = [];
    d.products.filter((p) => p.published && relevance(p, s) > 0).slice(0, 5).forEach((p) => hits.push({ kind: 'product', id: p.id, title: p.title, subtitle: `¥${p.priceCNY}`, href: `/shop/${p.id}` }));
    d.suppliers.filter((x) => `${x.name} ${x.city}`.toLowerCase().includes(s)).slice(0, 3).forEach((x) => hits.push({ kind: 'supplier', id: x.id, title: x.name, subtitle: x.city, href: `/suppliers/${x.id}` }));
    d.cars.filter((c) => c.published && `${c.brand} ${c.model} ${c.year}`.toLowerCase().includes(s)).slice(0, 3).forEach((c) => hits.push({ kind: 'car', id: c.id, title: `${c.brand} ${c.model}`, subtitle: String(c.year), href: `/auto/${c.id}` }));
    if (user) {
      d.orders.filter((o) => o.userId === user.id && o.number.toLowerCase().includes(s)).slice(0, 3).forEach((o) => hits.push({ kind: 'order', id: o.id, title: o.number, subtitle: o.status, href: `/orders/${o.id}` }));
      d.shipments.filter((x) => x.userId === user.id && x.trackingNumber.toLowerCase().includes(s)).slice(0, 3).forEach((x) => hits.push({ kind: 'tracking', id: x.id, title: x.trackingNumber, subtitle: x.stage, href: `/track?q=${x.trackingNumber}` }));
      d.aiRequests.filter((r) => r.userId === user.id && r.prompt.toLowerCase().includes(s)).slice(0, 2).forEach((r) => hits.push({ kind: 'ai', id: r.id, title: r.prompt, subtitle: `${r.options.length}`, href: `/ai-buyer?r=${r.id}` }));
    }
    if (/^(co-|c1)/i.test(s) && !hits.some((h) => h.kind === 'tracking' || h.kind === 'order')) hits.push({ kind: 'tracking', id: s, title: q.toUpperCase(), subtitle: '', href: `/track?q=${encodeURIComponent(q.trim())}` });
    return hits;
  },
};

export const aiBuyerService = { procure: searchService.procure.bind(searchService), history: searchService.aiHistory.bind(searchService) };
