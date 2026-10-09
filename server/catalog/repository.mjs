// Catalogue repository: all SQL for products lives here. Callers pass a database handle (see server/db).
import crypto from 'node:crypto';
import { tx } from '../db/index.mjs';
import { convertMinor, divRound, estimate, minorToMajor, parseDecimal, toMinor } from '../../src/shared/pricing.mjs';
import { getPricingConfig } from './pricing-config.mjs';
import { cleanText, isId, isLang } from './sanitize.mjs';
import { getAdapter } from './sources/adapter.mjs';

export const STALE_HOURS = () => Number(process.env.CATALOG_STALE_HOURS || 72);
const now = () => new Date().toISOString();
export const newProductId = () => 'p' + crypto.randomBytes(5).toString('hex');
const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const placeholders = (n) => Array.from({ length: n }, () => '?').join(',');

// ---------------------------------------------------------------- derived data
/** goods price in TMT minor (for sort/filter), from the presented price. Null when unknown. */
function tmtMinorOf(row, cfg) {
  if (row.price_minor == null || !row.price_currency) return null;
  if (row.price_currency === 'TMT') return row.price_minor;
  const fx = cfg.fx[row.price_currency];
  return fx ? convertMinor(row.price_minor, fx.rate) : null;
}

/** Recomputes the sort price and the search document for one product. Call after every write. */
export function refreshDerived(db, productId, cfg = getPricingConfig(db)) {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!row) return;
  db.prepare('UPDATE products SET sort_price_tmt_minor = ? WHERE id = ?').run(tmtMinorOf(row, cfg), productId);
  const texts = db.prepare('SELECT field, value FROM product_texts WHERE product_id = ?').all(productId);
  const specs = db.prepare('SELECT name, value FROM product_specs WHERE product_id = ?').all(productId);
  const cats = db.prepare('SELECT name FROM category_names WHERE category_id IN (?, ?)').all(row.category_id, row.subcategory_id || '');
  db.prepare('DELETE FROM product_fts WHERE product_id = ?').run(productId);
  db.prepare('INSERT INTO product_fts (product_id, title, description, category, brand, specs, keywords) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    productId,
    texts.filter((t) => t.field === 'title').map((t) => t.value).join(' \n '),
    texts.filter((t) => t.field === 'description').map((t) => t.value).join(' \n '),
    [row.category_id, ...cats.map((c) => c.name)].join(' '),
    row.brand || '',
    specs.map((s) => `${s.name} ${s.value}`).join(' \n '),
    J(row.keywords, []).join(' '),
  );
}
export function refreshAll(db) {
  const cfg = getPricingConfig(db);
  tx(db, () => { for (const { id } of db.prepare('SELECT id FROM products').all()) refreshDerived(db, id, cfg); });
}

// ---------------------------------------------------------------- serialization
function pickText(texts, field, lang, sourceLang) {
  const f = texts.filter((t) => t.field === field);
  const order = [[lang, 'editorial'], [lang, 'source'], ['en', 'editorial'], ['en', 'source'], [sourceLang, 'source'], [sourceLang, 'editorial']];
  for (const [l, o] of order) { const t = f.find((x) => x.lang === l && x.owner === o); if (t) return t; }
  return f[0] || null;
}

/** CNY minor (legacy `priceCNY` field) for any presented currency. Display/compat only. */
function asCnyMinor(minor, currency, cfg) {
  if (minor == null) return null;
  if (currency === 'CNY') return minor;
  const tmt = currency === 'TMT' ? minor : cfg.fx[currency] ? convertMinor(minor, cfg.fx[currency].rate) : null;
  const cny = cfg.fx.CNY && parseDecimal(cfg.fx.CNY.rate);
  if (tmt == null || !cny) return null;
  return Number(divRound(BigInt(tmt) * 10n ** BigInt(cny.scale), cny.n));
}

function loadChildren(db, ids) {
  const empty = () => Object.fromEntries(ids.map((id) => [id, []]));
  if (!ids.length) return { texts: {}, images: {}, variants: {}, specs: {}, sources: {} };
  const ph = placeholders(ids.length);
  const group = (rows) => { const m = empty(); for (const r of rows) m[r.product_id].push(r); return m; };
  return {
    texts: group(db.prepare(`SELECT * FROM product_texts WHERE product_id IN (${ph})`).all(...ids)),
    images: group(db.prepare(`SELECT * FROM product_images WHERE product_id IN (${ph}) ORDER BY owner DESC, position`).all(...ids)),
    variants: group(db.prepare(`SELECT * FROM product_variants WHERE product_id IN (${ph}) ORDER BY owner DESC, position`).all(...ids)),
    specs: group(db.prepare(`SELECT * FROM product_specs WHERE product_id IN (${ph}) ORDER BY owner DESC, position`).all(...ids)),
    sources: Object.fromEntries(db.prepare(`SELECT * FROM product_sources WHERE product_id IN (${ph})`).all(...ids).map((r) => [r.product_id, r])),
  };
}
const sourceLabel = (id) => getAdapter(id)?.label || id;
/** Editorial rows win over source rows for images/variants/specs as whole sets. */
const preferEditorial = (rows) => (rows.some((r) => r.owner === 'editorial') ? rows.filter((r) => r.owner === 'editorial') : rows.filter((r) => r.owner === 'source'));

export function serializeProducts(db, rows, { lang = 'en', cfg = getPricingConfig(db), suppliers = null } = {}) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ch = loadChildren(db, ids);
  const supIds = [...new Set(rows.map((r) => r.supplier_id).filter(Boolean))];
  const sup = suppliers || Object.fromEntries(supIds.length ? db.prepare(`SELECT * FROM suppliers WHERE id IN (${placeholders(supIds.length)})`).all(...supIds).map((s) => [s.id, s]) : []);
  const staleMs = STALE_HOURS() * 3600_000;
  return rows.map((r) => {
    const legacy = J(r.legacy, {});
    const src = ch.sources[r.id];
    const title = pickText(ch.texts[r.id], 'title', lang, src?.source_lang || 'en');
    const desc = pickText(ch.texts[r.id], 'description', lang, src?.source_lang || 'en');
    const images = preferEditorial(ch.images[r.id]);
    const variants = preferEditorial(ch.variants[r.id]);
    const specs = preferEditorial(ch.specs[r.id]);
    const s = r.supplier_id ? sup[r.supplier_id] : null;
    const cnyMinor = asCnyMinor(r.price_minor, r.price_currency, cfg);
    const oldCny = asCnyMinor(r.old_price_minor, r.price_currency, cfg);
    const pricing = estimate([{ amount: r.price_minor == null ? null : minorToMajor(r.price_minor), currency: r.price_currency || 'CNY', qty: 1, weightG: r.weight_g, volumeCm3: r.volume_cm3, weightEstimated: !!r.weight_estimated }], cfg);
    const syncedAt = src?.synced_at || null;
    return {
      id: r.id,
      title: title?.value || '', description: desc?.value || null,
      categoryId: r.category_id, subcategoryId: r.subcategory_id, supplierId: r.supplier_id || '', brand: r.brand, icon: r.icon || 'Package',
      priceCNY: minorToMajor(cnyMinor) ?? 0, oldPriceCNY: oldCny != null ? minorToMajor(oldCny) : undefined,
      images: images.map((im, i) => ({ id: `${r.id}-img${i}`, tone: im.tone ?? (i * 23) % 100, angle: im.angle || ['front', 'side', 'detail', 'pack'][i % 4], src: im.url })),
      variants: variants.map((v) => ({ id: v.id, name: v.name, priceDeltaCNY: minorToMajor(v.price_delta_minor) ?? 0, stock: v.stock ?? 0 })),
      specs: specs.map((x) => [x.name, x.value]),
      stock: r.stock ?? 0, moq: r.moq, leadDays: r.lead_days ?? 0,
      weightKg: r.weight_g != null ? r.weight_g / 1000 : 0, volumeM3: r.volume_cm3 != null ? r.volume_cm3 / 1_000_000 : 0,
      score: legacy.score ?? 0, verified: !!s && s.verification_level >= 1,
      published: r.status === 'published', featured: !!r.featured,
      rating: legacy.rating ?? 0, reviews: legacy.reviews ?? [], tags: J(r.tags, []), popularityAshgabat: 0,
      createdAt: r.created_at, keywords: J(r.keywords, []), tryOn: r.try_on || undefined,
      // ---- W1 catalogue fields
      status: r.status, availability: r.availability, updatedAt: r.updated_at, origin: r.origin, demo: !!r.demo, sample: !!r.sample,
      leadDaysKnown: r.lead_days != null, weightKnown: r.weight_g != null, weightEstimated: !!r.weight_estimated,
      localized: { lang, titleLang: title?.lang || null, fallback: !!title && title.lang !== lang, machine: !!title?.machine },
      source: src ? {
        name: src.source, label: sourceLabel(src.source), productId: src.source_product_id, url: src.source_url,
        price: src.source_price_minor != null ? { amountMinor: src.source_price_minor, currency: src.source_currency } : null,
        syncedAt, sourceUpdatedAt: src.source_updated_at || null, syncStatus: src.sync_status, lastError: src.last_error, lastErrorAt: src.last_error_at,
        // Stale when WE have not synced recently, or when the source's own data is old (aggregator caches).
        stale: !syncedAt || Date.now() - Date.parse(syncedAt) > staleMs || (!!src.source_updated_at && Date.now() - Date.parse(src.source_updated_at) > staleMs),
      } : null,
      pricing,
      seller: s ? { id: s.id, name: s.name, level: s.verification_level, score: s.score, scoreBasis: s.score_basis, demo: !!s.demo, status: s.status } : null,
    };
  });
}

export function serializeSupplier(s) {
  if (!s) return null;
  const legacy = J(s.legacy, {});
  return {
    // legacy Supplier shape (complete for demo suppliers; imported sellers carry nulls instead of invented numbers)
    categories: [], certifications: [], documents: [], reviews: [], description: '',
    yearsActive: null, moq: null, responseRate: null, responseHours: null, complaints: null, ordersCount: null, disputeRate: null, onTimeRate: null,
    ...legacy,
    id: s.id, name: s.name, nameCn: s.name_cn, city: s.city, province: s.province, status: s.status,
    score: s.score, verified: s.verification_level >= 1, monogram: legacy.monogram || s.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
    trust: { level: s.verification_level, basis: J(s.verification_basis, []), score: s.score, scoreBasis: s.score_basis, demo: !!s.demo, source: s.source },
  };
}

// ---------------------------------------------------------------- queries
export const SORTS = ['relevance', 'price_asc', 'price_desc', 'score', 'newest', 'delivery'];

/** Builds an FTS5 MATCH expression from free text: prefix match per token, all tokens required. */
export function ftsQuery(q, mode = 'all') {
  const tokens = (String(q).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter((t) => t.length > 1).slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `"${t.replace(/"/g, '')}"*`).join(mode === 'all' ? ' AND ' : ' OR ');
}

/**
 * Lists products. `viewer` = { role, supplierId } or null. Unpublished rows are visible only to admins and to the
 * supplier that owns them. Returns { items, total, page, pageSize, hasMore, matchMode }.
 */
export function listProducts(db, query, viewer) {
  const cfg = getPricingConfig(db);
  const lang = isLang(query.lang) ? query.lang : 'en';
  const where = []; const args = [];
  const canSeeAll = viewer?.role === 'admin';
  const ownSupplier = viewer?.role === 'supplier' && viewer.supplierId && query.supplierId === viewer.supplierId;
  if (!(query.includeUnpublished && (canSeeAll || ownSupplier))) where.push("p.status = 'published'");
  else where.push("p.status != 'archived'");
  if (query.category) { where.push('(p.category_id = ? OR p.subcategory_id = ?)'); args.push(query.category, query.category); }
  if (query.supplierId) { where.push('p.supplier_id = ?'); args.push(query.supplierId); }
  if (query.brand) { where.push('p.brand = ? COLLATE NOCASE'); args.push(query.brand); }
  const cny = cfg.fx.CNY?.rate;
  if (query.minPrice != null && cny) { where.push('p.sort_price_tmt_minor >= ?'); args.push(convertMinor(toMinor(query.minPrice), cny)); }
  if (query.maxPrice != null && cny) { where.push('p.sort_price_tmt_minor <= ?'); args.push(convertMinor(toMinor(query.maxPrice), cny)); }
  if (query.minScore != null) { where.push('s.score >= ?'); args.push(query.minScore); }
  if (query.inStock) where.push("p.availability = 'in_stock'");
  if (query.verifiedOnly) where.push('s.verification_level >= 1');
  if (query.maxLeadDays != null) { where.push('p.lead_days <= ?'); args.push(query.maxLeadDays); }
  if (query.tryOn) where.push('p.try_on IS NOT NULL');
  if (query.drops) where.push('p.old_price_minor IS NOT NULL');
  if (query.ids?.length) { where.push(`p.id IN (${placeholders(query.ids.length)})`); args.push(...query.ids); }

  let join = '', rankCol = 'NULL';
  let matchMode = null;
  const q = (query.q || '').trim();
  const sort = SORTS.includes(query.sort) ? query.sort : q ? 'relevance' : 'score';
  if (q) {
    // all tokens first; if nothing matches, fall back to any token (reported as matchMode = 'any')
    for (const mode of ['all', 'any']) {
      const fq = ftsQuery(q, mode);
      if (!fq) break;
      const n = db.prepare(`SELECT COUNT(*) AS n FROM product_fts WHERE product_fts MATCH ?`).get(fq).n;
      if (n || mode === 'any') {
        join = `JOIN (SELECT product_id, bm25(product_fts, 0, 10, 3, 4, 5, 2, 6) AS rank FROM product_fts WHERE product_fts MATCH ?) f ON f.product_id = p.id`;
        args.unshift(fq); rankCol = 'f.rank'; matchMode = mode; break;
      }
    }
    if (!join) return { items: [], total: 0, page: 1, pageSize: 0, hasMore: false, matchMode: 'none' };
  }
  const scoreExpr = "COALESCE(json_extract(p.legacy, '$.score'), s.score)";
  const order = {
    relevance: `${rankCol} ASC, ${scoreExpr} DESC NULLS LAST`,
    price_asc: 'p.sort_price_tmt_minor ASC NULLS LAST', price_desc: 'p.sort_price_tmt_minor DESC NULLS LAST',
    score: `p.featured DESC, ${scoreExpr} DESC NULLS LAST`, newest: 'COALESCE(p.published_at, p.created_at) DESC',
    delivery: 'p.lead_days ASC NULLS LAST',
  }[sort === 'relevance' && !q ? 'score' : sort];
  const maxSize = canSeeAll || ownSupplier ? 500 : 100;
  const pageSize = Math.min(maxSize, Math.max(1, Number(query.pageSize) || 12));
  const page = Math.max(1, Number(query.page) || 1);
  const base = `FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id ${join} WHERE ${where.join(' AND ') || '1'}`;
  const total = db.prepare(`SELECT COUNT(*) AS n ${base}`).get(...args).n;
  const rows = db.prepare(`SELECT p.* ${base} ORDER BY ${order}, p.id LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
  return { items: serializeProducts(db, rows, { lang, cfg }), total, page, pageSize, hasMore: page * pageSize < total, matchMode };
}

export function getProduct(db, id, { lang = 'en', viewer = null } = {}) {
  if (!isId(id)) return { error: 'invalid_id' };
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!row || row.status === 'archived') return { error: 'not_found' };
  const own = viewer?.role === 'supplier' && viewer.supplierId && row.supplier_id === viewer.supplierId;
  if (row.status !== 'published' && viewer?.role !== 'admin' && !own) return { error: 'not_found' };
  const product = serializeProducts(db, [row], { lang: isLang(lang) ? lang : 'en' })[0];
  const supplier = row.supplier_id ? serializeSupplier(db.prepare('SELECT * FROM suppliers WHERE id = ?').get(row.supplier_id)) : null;
  return { product, supplier };
}

export function getCategories(db, lang = 'en') {
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE (p.category_id = c.id OR p.subcategory_id = c.id) AND p.status = 'published') AS products FROM categories c ORDER BY c.position`).all();
  const names = db.prepare('SELECT * FROM category_names').all();
  return rows.map((c) => {
    const n = Object.fromEntries(names.filter((x) => x.category_id === c.id).map((x) => [x.lang, x.name]));
    return { id: c.id, parentId: c.parent_id, icon: c.icon, order: c.position, visible: !!c.visible, name: n[lang] || n.en || c.id, names: n, products: c.products };
  });
}

const published = (db, sql, args = []) => db.prepare(`SELECT p.* FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.status = 'published' ${sql}`).all(...args);

/** Home-page rails. Each rail reports the basis of its ranking so the UI can label it honestly. */
export function homeRails(db, { lang = 'en', viewed = [] } = {}) {
  const cfg = getPricingConfig(db);
  const ser = (rows) => serializeProducts(db, rows, { lang, cfg });
  const byViews = (days, minItems) => {
    const rows = db.prepare(`SELECT p.*, COUNT(DISTINCT v.visitor) AS viewers FROM product_views v JOIN products p ON p.id = v.product_id
      WHERE p.status = 'published' AND v.day >= date('now', ?) GROUP BY p.id HAVING viewers >= 2 ORDER BY viewers DESC, p.id LIMIT 12`).all(`-${days} day`);
    return rows.length >= minItems ? rows : null;
  };
  const trendingRows = byViews(7, 4);
  const popularRows = byViews(30, 4);
  const all = ser(published(db, 'ORDER BY p.id'));
  const bestByCat = new Map();
  for (const p of all) {
    if (p.pricing.status !== 'estimate') continue;
    const cur = bestByCat.get(p.categoryId);
    if (!cur || p.pricing.totalMinor < cur.pricing.totalMinor) bestByCat.set(p.categoryId, p);
  }
  const editorial = ser(published(db, "ORDER BY p.featured DESC, p.editorial_rank ASC NULLS LAST, COALESCE(json_extract(p.legacy, '$.score'), s.score) DESC NULLS LAST, p.id LIMIT 12"));
  const viewedRows = viewed.filter(isId).slice(0, 10);
  const last = viewedRows.length ? all.find((p) => viewedRows.includes(p.id)) : null;
  return {
    trending: { basis: trendingRows ? 'views_7d' : 'insufficient_data', items: trendingRows ? ser(trendingRows) : [] },
    popular: popularRows ? { basis: 'views_30d', items: ser(popularRows) } : { basis: 'editorial', items: editorial },
    newArrivals: { basis: 'newest', items: ser(published(db, 'ORDER BY COALESCE(p.published_at, p.created_at) DESC, p.id LIMIT 12')) },
    bestValue: { basis: 'lowest_estimate_per_category', items: [...bestByCat.values()].sort((a, b) => a.pricing.totalMinor - b.pricing.totalMinor) },
    business: { basis: 'category_or_tag', items: ser(published(db, "AND (p.category_id = 'business' OR p.tags LIKE '%\"business\"%') ORDER BY p.featured DESC, p.id LIMIT 12")) },
    priceDrops: { basis: 'old_price', items: ser(published(db, 'AND p.old_price_minor IS NOT NULL ORDER BY (p.old_price_minor - p.price_minor) * 1.0 / p.old_price_minor DESC LIMIT 12')) },
    fastDelivery: { basis: 'lead_days', items: ser(published(db, 'AND p.lead_days IS NOT NULL ORDER BY p.lead_days ASC, p.id LIMIT 12')) },
    verifiedSuppliers: { basis: 'verification_level', items: ser(published(db, 'AND s.verification_level >= 2 ORDER BY s.score DESC NULLS LAST, p.id LIMIT 12')) },
    recommended: last
      ? { basis: 'same_category_as_viewed', basedOn: last.title, items: all.filter((p) => p.categoryId === last.categoryId && !viewedRows.includes(p.id)).slice(0, 8) }
      : { basis: 'editorial', basedOn: null, items: editorial.slice(0, 8) },
  };
}

export function alternatives(db, id, lang = 'en') {
  const r = getProduct(db, id, { lang });
  if (r.error) return { cheaper: null, faster: null, betterSupplier: null };
  const p = r.product;
  const same = serializeProducts(db, published(db, 'AND p.category_id = ? AND p.id != ? ORDER BY p.id', [p.categoryId, id]), { lang });
  const tmt = (x) => x.pricing.goodsMinor;
  const cheaper = same.filter((x) => tmt(x) != null && tmt(p) != null && tmt(x) < tmt(p)).sort((a, b) => tmt(a) - tmt(b))[0] || null;
  const faster = same.filter((x) => x.leadDaysKnown && p.leadDaysKnown && x.leadDays < p.leadDays).sort((a, b) => a.leadDays - b.leadDays)[0] || null;
  const sc = (x) => x.seller?.score ?? -1;
  const betterSupplier = same.filter((x) => sc(x) > sc(p)).sort((a, b) => sc(b) - sc(a))[0] || null;
  return { cheaper, faster, betterSupplier };
}

/** One row per product/day/visitor (hashed). Unknown/unpublished products are ignored. */
export function recordView(db, productId, visitor) {
  if (!isId(productId)) return false;
  const ok = db.prepare("SELECT 1 FROM products WHERE id = ? AND status = 'published'").get(productId);
  if (!ok) return false;
  db.prepare("INSERT OR IGNORE INTO product_views (product_id, day, visitor) VALUES (?, date('now'), ?)").run(productId, visitor);
  return true;
}

export function audit(db, actor, action, target, detail) {
  db.prepare('INSERT INTO audit_log (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)').run(now(), actor || null, action, target || null, detail ? JSON.stringify(detail) : null);
}

// ---------------------------------------------------------------- editorial writes (admin / supplier)
const CATEGORY_OK = (db, id) => !!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(id);
const num = (v) => (v === '' || v == null ? null : Number(v));

/** Validates an editorial create/update payload. Returns { values, errors }. Only listed fields are accepted. */
export function validateEditorial(db, input, { creating }) {
  const errors = []; const v = {};
  if (creating || input.title != null) { const t = cleanText(input.title, 300); if (!t || t.length < 2) errors.push('title'); else v.title = t; }
  if (input.description != null) v.description = cleanText(input.description, 4000);
  if (creating || input.categoryId != null) { if (!CATEGORY_OK(db, input.categoryId)) errors.push('categoryId'); else v.categoryId = input.categoryId; }
  if (input.supplierId != null && input.supplierId !== '') { if (!isId(input.supplierId) || !db.prepare('SELECT 1 FROM suppliers WHERE id = ?').get(input.supplierId)) errors.push('supplierId'); else v.supplierId = input.supplierId; }
  if (creating || input.priceCNY != null) { const m = toMinor(input.priceCNY); if (m == null || m <= 0 || m > 1_000_000_000) errors.push('priceCNY'); else v.priceMinor = m; }
  if (input.oldPriceCNY !== undefined) { if (input.oldPriceCNY === null || input.oldPriceCNY === '') v.oldPriceMinor = null; else { const m = toMinor(input.oldPriceCNY); if (m == null || m <= 0) errors.push('oldPriceCNY'); else v.oldPriceMinor = m; } }
  for (const [k, max] of [['stock', 10_000_000], ['moq', 1_000_000], ['leadDays', 365]]) {
    if (input[k] == null || input[k] === '') continue;
    const n = num(input[k]); if (!Number.isInteger(n) || n < (k === 'moq' ? 1 : 0) || n > max) errors.push(k); else v[k] = n;
  }
  if (input.weightKg != null && input.weightKg !== '') { const g = toMinor(input.weightKg, 3); if (g == null || g <= 0 || g > 2_000_000) errors.push('weightKg'); else v.weightG = g; }
  if (input.volumeM3 != null && input.volumeM3 !== '') { const c = toMinor(input.volumeM3, 6); if (c == null || c <= 0) errors.push('volumeM3'); else v.volumeCm3 = c; }
  if (input.brand !== undefined) v.brand = cleanText(input.brand, 80);
  if (input.published != null) v.published = !!input.published;
  if (input.featured != null) v.featured = !!input.featured;
  if (input.tags != null) { if (!Array.isArray(input.tags) || input.tags.some((t) => !['popular', 'business', 'price_drop'].includes(t))) errors.push('tags'); else v.tags = [...new Set(input.tags)]; }
  return { values: v, errors };
}

const SUPPLIER_FIELDS = new Set(['title', 'description', 'categoryId', 'priceMinor', 'oldPriceMinor', 'stock', 'moq', 'leadDays', 'weightG', 'volumeCm3', 'brand']);

export function createEditorialProduct(db, input, actor) {
  const { values: v, errors } = validateEditorial(db, input, { creating: true });
  if (actor.role === 'supplier') { v.supplierId = actor.supplierId; delete v.published; delete v.featured; delete v.tags; }
  if (!v.supplierId) errors.push('supplierId');
  if (errors.length) return { errors };
  const id = newProductId(); const t = now();
  const status = actor.role === 'admin' && v.published ? 'published' : 'draft';
  tx(db, () => {
    db.prepare(`INSERT INTO products (id, origin, category_id, supplier_id, brand, status, availability, stock, moq, lead_days, weight_g, volume_cm3,
      price_minor, price_currency, old_price_minor, featured, tags, keywords, created_at, updated_at, published_at)
      VALUES (?, 'editorial', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', ?, ?, ?, ?, ?, ?, ?)`).run(
      id, v.categoryId, v.supplierId, v.brand ?? null, status, v.stock == null ? 'unknown' : v.stock > 0 ? 'in_stock' : 'out_of_stock',
      v.stock ?? null, v.moq ?? 1, v.leadDays ?? null, v.weightG ?? null, v.volumeCm3 ?? null, v.priceMinor, v.oldPriceMinor ?? null,
      v.featured ? 1 : 0, JSON.stringify(v.tags || []), JSON.stringify(v.title.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []), t, t, status === 'published' ? t : null);
    db.prepare("INSERT INTO product_texts (product_id, lang, field, owner, value, updated_at) VALUES (?, 'en', 'title', 'editorial', ?, ?)").run(id, v.title, t);
    if (v.description) db.prepare("INSERT INTO product_texts (product_id, lang, field, owner, value, updated_at) VALUES (?, 'en', 'description', 'editorial', ?, ?)").run(id, v.description, t);
    db.prepare("INSERT INTO product_variants (id, product_id, owner, position, name, price_delta_minor, stock) VALUES (?, ?, 'editorial', 0, 'Standard', 0, ?)").run(`${id}-v0`, id, v.stock ?? null);
    refreshDerived(db, id);
    audit(db, actor.id, 'product.create', id, { status });
  });
  return { id };
}

/**
 * Applies an editorial patch. Admins may change any editorial field and publication; suppliers only the fields of
 * their own products in SUPPLIER_FIELDS. Fields an editor sets on an imported product are recorded in
 * editorial_fields, so later imports do not overwrite them.
 */
export function updateProduct(db, id, input, actor) {
  if (!isId(id)) return { error: 'invalid_id' };
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!row || row.status === 'archived') return { error: 'not_found' };
  if (actor.role === 'supplier' && row.supplier_id !== actor.supplierId) return { error: 'forbidden' };
  const { values: v, errors } = validateEditorial(db, input, { creating: false });
  if (errors.length) return { errors };
  if (actor.role === 'supplier') {
    for (const k of Object.keys(v)) if (!SUPPLIER_FIELDS.has(k)) return { error: 'forbidden' };
    if (row.origin === 'imported') return { error: 'forbidden' };
  }
  const t = now();
  const owned = new Set(J(row.editorial_fields, []));
  tx(db, () => {
    const set = []; const args = [];
    const col = (c, val, field) => { set.push(`${c} = ?`); args.push(val); if (field && row.origin === 'imported') owned.add(field); };
    if ('categoryId' in v) col('category_id', v.categoryId, 'category');
    if ('supplierId' in v && actor.role === 'admin') col('supplier_id', v.supplierId);
    if ('brand' in v) col('brand', v.brand, 'brand');
    // Editorial prices are entered in CNY; the source price stays untouched in product_sources.
    if ('priceMinor' in v) { col('price_minor', v.priceMinor, 'price'); col('price_currency', 'CNY'); }
    if ('oldPriceMinor' in v) col('old_price_minor', v.oldPriceMinor);
    if ('stock' in v) { col('stock', v.stock, 'stock'); col('availability', v.stock > 0 ? 'in_stock' : 'out_of_stock'); }
    if ('moq' in v) col('moq', v.moq, 'moq');
    if ('leadDays' in v) col('lead_days', v.leadDays, 'lead_days');
    if ('weightG' in v) { col('weight_g', v.weightG, 'weight'); col('weight_estimated', 0); }
    if ('volumeCm3' in v) col('volume_cm3', v.volumeCm3, 'weight');
    if ('featured' in v) col('featured', v.featured ? 1 : 0);
    if ('tags' in v) col('tags', JSON.stringify(v.tags));
    if ('published' in v) {
      if (actor.role !== 'admin') throw Object.assign(new Error('forbidden'), { code: 'forbidden' });
      col('status', v.published ? 'published' : 'draft');
      if (v.published && !row.published_at) col('published_at', t);
    }
    col('editorial_fields', JSON.stringify([...owned]));
    col('updated_at', t);
    db.prepare(`UPDATE products SET ${set.join(', ')} WHERE id = ?`).run(...args, id);
    for (const [field, key] of [['title', 'title'], ['description', 'description']]) {
      if (!(key in v)) continue;
      if (v[key]) db.prepare("INSERT INTO product_texts (product_id, lang, field, owner, value, updated_at) VALUES (?, 'en', ?, 'editorial', ?, ?) ON CONFLICT(product_id, lang, field, owner) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, machine = 0").run(id, field, v[key], t);
      else db.prepare("DELETE FROM product_texts WHERE product_id = ? AND lang = 'en' AND field = ? AND owner = 'editorial'").run(id, field);
    }
    refreshDerived(db, id);
    audit(db, actor.id, 'product.update', id, Object.keys(v));
  });
  return { id };
}

/** Products are archived, not deleted: orders and audit history keep their references. */
export function archiveProduct(db, id, actor) {
  if (!isId(id)) return { error: 'invalid_id' };
  const r = db.prepare("UPDATE products SET status = 'archived', updated_at = ? WHERE id = ? AND status != 'archived'").run(now(), id);
  if (!r.changes) return { error: 'not_found' };
  audit(db, actor.id, 'product.archive', id);
  return { id };
}
