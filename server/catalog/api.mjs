// Catalogue HTTP API. Public reads, authenticated management, admin-only import and pricing.
import crypto from 'node:crypto';
import { getDb, tx } from '../db/index.mjs';
import { readSession } from '../auth.mjs';
import { ADAPTERS, getAdapter } from './sources/adapter.mjs';
import { runImport } from './importer.mjs';
import { getPricingConfig, updatePricing } from './pricing-config.mjs';
import { seedCatalog } from './seed.mjs';
import * as R from './repository.mjs';
import { isId, isLang } from './sanitize.mjs';

let seeded = false;
export function catalogDb() {
  const db = getDb();
  if (!seeded) { seedCatalog(db); seeded = true; }
  return db;
}

const bool = (v) => v === '1' || v === 'true';
const numOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const idsParam = (v) => (v ? String(v).split(',').filter(isId).slice(0, 100) : []);

/** Simple fixed-window limiter (per process). */
const windows = new Map();
export function limited(key, max, ms) {
  const t = Date.now(); const w = windows.get(key);
  if (!w || t - w.start > ms) { windows.set(key, { start: t, n: 1 }); return false; }
  w.n++; return w.n > max;
}
const ip = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

/** Day-scoped visitor hash: the logged-in user id, else IP + user agent. Raw values are never stored. */
function visitorId(req, session) {
  const salt = (process.env.AUTH_SECRET || 'dev') + new Date().toISOString().slice(0, 10);
  const raw = session ? `u:${session.id}` : `a:${ip(req)}|${req.headers['user-agent'] || ''}`;
  return crypto.createHmac('sha256', salt).update(raw).digest('hex').slice(0, 24);
}

function queryFrom(sp) {
  return {
    q: (sp.get('q') || '').slice(0, 200), category: sp.get('category') || '', supplierId: sp.get('supplierId') || '', brand: sp.get('brand') || '',
    sort: sp.get('sort') || '', page: numOrNull(sp.get('page')), pageSize: numOrNull(sp.get('pageSize')), lang: sp.get('lang') || 'en',
    minPrice: numOrNull(sp.get('minPrice')), maxPrice: numOrNull(sp.get('maxPrice')), minScore: numOrNull(sp.get('minScore')), maxLeadDays: numOrNull(sp.get('maxLeadDays')),
    inStock: bool(sp.get('inStock')), verifiedOnly: bool(sp.get('verifiedOnly')), tryOn: bool(sp.get('tryOn')), drops: bool(sp.get('drops')),
    includeUnpublished: bool(sp.get('includeUnpublished')), ids: idsParam(sp.get('ids')),
  };
}

/** Returns true when the request was handled. */
export async function handleCatalogApi(req, pathname, url, body, { send }) {
  if (!pathname.startsWith('/api/catalog/') && !pathname.startsWith('/api/admin/catalog/')) return false;
  if (req.method === 'POST' && (body === null || typeof body !== 'object' || Array.isArray(body))) return send(400, { error: 'invalid_body' });
  const db = catalogDb();
  const session = readSession(req);
  const sp = url.searchParams;
  const lang = isLang(sp.get('lang')) ? sp.get('lang') : 'en';
  const fail = (status, error, extra) => send(status, { error, ...extra });
  const m = (re) => pathname.match(re);
  let mm;

  // ---------- public reads
  if (req.method === 'GET') {
    if (pathname === '/api/catalog/categories') return send(200, { categories: R.getCategories(db, lang) });
    if (pathname === '/api/catalog/products') {
      const q = queryFrom(sp);
      if (q.sort && !R.SORTS.includes(q.sort)) return fail(400, 'invalid_sort');
      if (q.category && !isId(q.category)) return fail(400, 'invalid_category');
      return send(200, R.listProducts(db, q, session));
    }
    if ((mm = m(/^\/api\/catalog\/products\/([^/]+)$/))) {
      const r = R.getProduct(db, mm[1], { lang, viewer: session });
      if (r.error) return fail(r.error === 'invalid_id' ? 400 : 404, r.error);
      return send(200, r);
    }
    if ((mm = m(/^\/api\/catalog\/products\/([^/]+)\/alternatives$/))) {
      if (!isId(mm[1])) return fail(400, 'invalid_id');
      return send(200, R.alternatives(db, mm[1], lang));
    }
    if (pathname === '/api/catalog/home') return send(200, R.homeRails(db, { lang, viewed: idsParam(sp.get('viewed')) }));
    if (pathname === '/api/catalog/suppliers') {
      const rows = db.prepare("SELECT * FROM suppliers WHERE status != 'suspended' ORDER BY demo DESC, id").all();
      return send(200, { suppliers: rows.map(R.serializeSupplier) });
    }
    if (pathname === '/api/catalog/pricing') {
      // Public, non-secret pricing parameters so the client can show the same estimate the server computes.
      const c = getPricingConfig(db);
      const { fx, serviceFeeBps, vipFeeBps, marginBps, dutyEstimateBps, cargoRatePerKg, expressRatePerKg, minCargo, volumetricKgPerM3, tariffIsDemo } = c;
      return send(200, { fx, serviceFeeBps, vipFeeBps, marginBps, dutyEstimateBps, cargoRatePerKg, expressRatePerKg, minCargo, volumetricKgPerM3, tariffIsDemo, confirmedQuotes: false });
    }
  }

  // ---------- public write: view signal for trending (rate-limited, hashed visitor)
  if (req.method === 'POST' && pathname === '/api/catalog/events') {
    if (limited(`ev:${ip(req)}`, 120, 60_000)) return fail(429, 'rate_limited');
    if (body.kind !== 'view' || !isId(body.productId)) return fail(400, 'validation');
    return send(200, { recorded: R.recordView(db, body.productId, visitorId(req, session)) });
  }

  // ---------- management (admin, or a supplier on its own products)
  if (pathname.startsWith('/api/catalog/manage/')) {
    if (!session) return fail(401, 'unauthorized');
    if (session.role !== 'admin' && session.role !== 'supplier') return fail(403, 'forbidden');
    if (session.role === 'supplier' && !session.supplierId) return fail(403, 'forbidden');
    if (req.method !== 'POST') return fail(405, 'method_not_allowed');
    const actor = { id: session.id, role: session.role, supplierId: session.supplierId };
    if (pathname === '/api/catalog/manage/products') {
      const r = R.createEditorialProduct(db, body, actor);
      if (r.errors) return fail(400, 'validation', { fields: r.errors });
      return send(201, R.getProduct(db, r.id, { viewer: session }));
    }
    if ((mm = m(/^\/api\/catalog\/manage\/products\/([^/]+)\/archive$/))) {
      if (session.role !== 'admin') return fail(403, 'forbidden');
      const r = R.archiveProduct(db, mm[1], actor);
      return r.error ? fail(r.error === 'invalid_id' ? 400 : 404, r.error) : send(200, { ok: true });
    }
    if ((mm = m(/^\/api\/catalog\/manage\/products\/([^/]+)$/))) {
      let r;
      try { r = R.updateProduct(db, mm[1], body, actor); } catch (e) { if (e.code === 'forbidden') return fail(403, 'forbidden'); throw e; }
      if (r.error) return fail({ invalid_id: 400, not_found: 404, forbidden: 403 }[r.error] || 400, r.error);
      if (r.errors) return fail(400, 'validation', { fields: r.errors });
      return send(200, R.getProduct(db, r.id, { viewer: session }));
    }
    return fail(404, 'not_found');
  }

  // ---------- admin: sources, imports, pricing
  if (pathname.startsWith('/api/admin/catalog/')) {
    if (!session) return fail(401, 'unauthorized');
    if (session.role !== 'admin') return fail(403, 'forbidden');
    if (pathname === '/api/admin/catalog/sources' && req.method === 'GET') {
      const stale = R.STALE_HOURS();
      const stats = Object.fromEntries(db.prepare(`SELECT source, COUNT(*) AS products, SUM(sync_status = 'error') AS errors,
        SUM(synced_at IS NULL OR julianday('now') - julianday(synced_at) > ? / 24.0) AS stale, MAX(synced_at) AS lastSync FROM product_sources GROUP BY source`).all(stale).map((r) => [r.source, r]));
      const runs = db.prepare('SELECT * FROM import_runs ORDER BY started_at DESC LIMIT 20').all().map((r) => ({ ...r, errors: JSON.parse(r.errors) }));
      return send(200, {
        staleHours: stale,
        demoPublished: db.prepare("SELECT COUNT(*) AS n FROM products WHERE demo = 1 AND status = 'published'").get().n,
        importedPublished: db.prepare("SELECT COUNT(*) AS n FROM products WHERE origin = 'imported' AND sample = 0 AND status = 'published'").get().n,
        adapters: ADAPTERS.map((a) => ({
          id: a.id, label: a.label, kind: a.kind, live: a.live, available: a.available, reason: a.reason || null,
          stats: stats[a.id] || { products: 0, errors: 0, stale: 0, lastSync: null },
          usage: typeof a.usage === 'function' ? a.usage(db) : null, provider: a.provider || null, lang: a.lang || null,
        })),
        runs,
      });
    }
    if (pathname === '/api/admin/catalog/import' && req.method === 'POST') {
      if (limited(`imp:${session.id}`, 40, 60_000)) return fail(429, 'rate_limited');
      const adapter = getAdapter(body.source);
      if (!adapter) return fail(400, 'unknown_source');
      const opts = {};
      if (adapter.kind === 'aggregator_api') {
        // Search import: the operator chooses the query, the size (paid calls) and the target category.
        const q = typeof body.query === 'string' ? body.query.trim() : '';
        if (q.length < 2 || q.length > 100) return fail(400, 'validation', { fields: ['query'] });
        const limit = Number(body.limit ?? 20);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) return fail(400, 'validation', { fields: ['limit'] });
        if (body.categoryId != null && body.categoryId !== '' && !(isId(body.categoryId) && db.prepare('SELECT 1 FROM categories WHERE id = ?').get(body.categoryId))) return fail(400, 'validation', { fields: ['categoryId'] });
        Object.assign(opts, { q, limit, categoryId: body.categoryId || null, details: body.details === true });
      }
      const r = await runImport(db, adapter, { actor: session.id, ...opts });
      if (r.error) return fail(409, r.error, { reason: r.reason });
      const { items, ...summary } = r;
      // Optional: publish this run's imported drafts right away (an explicit admin choice in the import form).
      let published = 0;
      if (body.publish === true) {
        const ids = [...new Set((items || []).filter((i) => i.productId && i.outcome !== 'failed').map((i) => i.productId))];
        const t = new Date().toISOString();
        tx(db, () => {
          const up = db.prepare("UPDATE products SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ? AND origin = 'imported' AND status = 'draft'");
          for (const id of ids) published += up.run(t, t, id).changes;
        });
        if (published) R.audit(db, session.id, 'catalog.publish_import', r.id, { published });
      }
      return send(200, { ...summary, published });
    }
    if (pathname === '/api/admin/catalog/demo' && req.method === 'POST') {
      // Hide or show the bundled DEMO products on the storefront (reversible: they become drafts, not deleted).
      if (typeof body.visible !== 'boolean') return fail(400, 'validation', { fields: ['visible'] });
      const t = new Date().toISOString();
      const r = body.visible
        ? db.prepare("UPDATE products SET status = 'published', updated_at = ? WHERE demo = 1 AND status = 'draft' AND json_extract(legacy, '$.hiddenDemo') = 1").run(t)
        : db.prepare("UPDATE products SET status = 'draft', updated_at = ?, legacy = json_set(COALESCE(legacy, '{}'), '$.hiddenDemo', 1) WHERE demo = 1 AND status = 'published'").run(t);
      if (body.visible) db.prepare("UPDATE products SET legacy = json_remove(legacy, '$.hiddenDemo') WHERE demo = 1 AND json_extract(legacy, '$.hiddenDemo') = 1 AND status = 'published'").run();
      R.audit(db, session.id, body.visible ? 'catalog.demo_show' : 'catalog.demo_hide', null, { changed: r.changes });
      return send(200, { changed: r.changes, demoPublished: db.prepare("SELECT COUNT(*) AS n FROM products WHERE demo = 1 AND status = 'published'").get().n });
    }
    if (pathname === '/api/admin/catalog/pricing') {
      if (req.method === 'GET') return send(200, getPricingConfig(db));
      const errors = tx(db, () => updatePricing(db, body, session.id));
      if (errors.length) return fail(400, 'validation', { fields: errors });
      R.refreshAll(db);
      R.audit(db, session.id, 'pricing.update', null, Object.keys(body));
      return send(200, getPricingConfig(db));
    }
  }
  return fail(404, 'not_found');
}
