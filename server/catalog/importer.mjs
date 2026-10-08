// ProductImporter: stores normalized source products. Idempotent by (source, source_product_id).
//
// FIELD OWNERSHIP
//   source-owned (importer may write): source texts/images/variants/specs (owner='source'), price, availability,
//     stock, MOQ, lead time, weight/volume, brand, category on create, the product_sources row.
//   editorial-owned (importer never writes): status/publication, featured, rank, tags, editorial texts/images,
//     and any source-owned field an editor has overridden (listed in products.editorial_fields).
//
// FAILURES never delete or blank a product: a record that fails validation leaves the stored product as it was
// and marks its source row sync_status='error' with the reason.
import crypto from 'node:crypto';
import { tx } from '../db/index.mjs';
import { normalize, ImportError } from './normalizer.mjs';
import { audit, newProductId, refreshDerived } from './repository.mjs';

const now = () => new Date().toISOString();
const J = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

function upsertSeller(db, source, seller, t) {
  if (!seller) return null;
  const found = db.prepare('SELECT id FROM suppliers WHERE source = ? AND source_seller_id = ?').get(source, seller.sellerId);
  if (found) {
    db.prepare('UPDATE suppliers SET name = ?, name_cn = ?, city = ?, province = ?, updated_at = ? WHERE id = ?').run(seller.name, seller.nameCn, seller.city, seller.province, t, found.id);
    return found.id;
  }
  const id = `s_${source}_${crypto.createHash('sha1').update(seller.sellerId).digest('hex').slice(0, 10)}`;
  // Imported sellers start unverified with no score: verification comes only from recorded checks (W2).
  db.prepare(`INSERT INTO suppliers (id, name, name_cn, city, province, status, verification_level, verification_basis, score, score_basis, source, source_seller_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'unreviewed', 0, '[]', NULL, NULL, ?, ?, ?, ?)`).run(id, seller.name, seller.nameCn, seller.city, seller.province, source, seller.sellerId, t, t);
  return id;
}

function replaceSourceRows(db, id, n) {
  for (const tbl of ['product_images', 'product_specs', 'product_variants']) db.prepare(`DELETE FROM ${tbl} WHERE product_id = ? AND owner = 'source'`).run(id);
  db.prepare("DELETE FROM product_texts WHERE product_id = ? AND owner = 'source'").run(id);
  const t = now();
  const txt = db.prepare("INSERT INTO product_texts (product_id, lang, field, owner, value, machine, updated_at) VALUES (?, ?, ?, 'source', ?, ?, ?)");
  for (const x of n.texts) txt.run(id, x.lang, x.field, x.value, x.machine ? 1 : 0, t);
  const img = db.prepare("INSERT INTO product_images (product_id, owner, position, url) VALUES (?, 'source', ?, ?)");
  n.images.forEach((im, i) => img.run(id, i, im.url));
  const sp = db.prepare("INSERT INTO product_specs (product_id, owner, position, name, value) VALUES (?, 'source', ?, ?, ?)");
  n.specs.forEach((s, i) => sp.run(id, i, s.name, s.value));
  const va = db.prepare("INSERT INTO product_variants (id, product_id, owner, position, name, price_delta_minor, stock, source_sku) VALUES (?, ?, 'source', ?, ?, ?, ?, ?)");
  n.variants.forEach((v, i) => va.run(`${id}-sv${i}`, id, i, v.name, v.priceDeltaMinor, v.stock, v.sku));
}

/** Imports one SourceProduct. Returns { outcome: 'created'|'updated'|'unchanged'|'failed', productId?, code?, warnings }. */
export function importOne(db, sp, { sample = false } = {}) {
  const t = now();
  let n;
  try { n = normalize(sp); }
  catch (e) {
    const code = e instanceof ImportError ? e.code : 'normalize_failed';
    // Mark the existing product's source row (if any); never touch the product itself.
    if (sp?.source && sp?.sourceProductId) {
      db.prepare('UPDATE product_sources SET sync_status = ?, last_error = ?, last_error_at = ? WHERE source = ? AND source_product_id = ?').run('error', code, t, sp.source, String(sp.sourceProductId));
    }
    return { outcome: 'failed', code, detail: e.detail, sourceProductId: sp?.sourceProductId ?? null, warnings: [] };
  }
  return tx(db, () => {
    const existing = db.prepare('SELECT ps.*, p.editorial_fields, p.status FROM product_sources ps JOIN products p ON p.id = ps.product_id WHERE ps.source = ? AND ps.source_product_id = ?').get(n.source, n.sourceProductId);
    const supplierId = upsertSeller(db, n.source, n.seller, t);
    if (existing && existing.raw_hash === n.rawHash && existing.sync_status === 'ok') {
      db.prepare('UPDATE product_sources SET synced_at = ?, source_updated_at = ? WHERE product_id = ?').run(n.fetchedAt, n.sourceUpdatedAt, existing.product_id);
      return { outcome: 'unchanged', productId: existing.product_id, warnings: n.warnings };
    }
    if (existing) {
      const id = existing.product_id;
      const owned = new Set(J(existing.editorial_fields, []));
      const set = ['supplier_id = ?', 'updated_at = ?']; const args = [supplierId, t];
      const put = (field, col, val) => { if (!owned.has(field)) { set.push(`${col} = ?`); args.push(val); } };
      put('category', 'category_id', n.categoryId);
      put('brand', 'brand', n.brand);
      put('price', 'price_minor', n.price?.minor ?? null); put('price', 'price_currency', n.price?.currency ?? null);
      put('stock', 'stock', n.stock); put('stock', 'availability', n.availability);
      put('moq', 'moq', n.moq); put('lead_days', 'lead_days', n.leadDays);
      put('weight', 'weight_g', n.weightG); put('weight', 'volume_cm3', n.volumeCm3);
      db.prepare(`UPDATE products SET ${set.join(', ')} WHERE id = ?`).run(...args, id);
      replaceSourceRows(db, id, n);
      db.prepare(`UPDATE product_sources SET source_url = ?, source_price_minor = ?, source_currency = ?, source_lang = ?, raw_hash = ?, raw_json = ?, synced_at = ?, source_updated_at = ?, sync_status = 'ok', last_error = NULL, last_error_at = NULL WHERE product_id = ?`)
        .run(n.url, n.price?.minor ?? null, n.price?.currency ?? null, n.lang, n.rawHash, JSON.stringify(n.raw), n.fetchedAt, n.sourceUpdatedAt, id);
      refreshDerived(db, id);
      return { outcome: 'updated', productId: id, warnings: n.warnings };
    }
    const id = newProductId();
    // New imports are drafts: an operator publishes them after review.
    db.prepare(`INSERT INTO products (id, origin, sample, category_id, supplier_id, brand, status, availability, stock, moq, lead_days, weight_g, volume_cm3,
      price_minor, price_currency, keywords, created_at, updated_at) VALUES (?, 'imported', ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)`)
      .run(id, sample ? 1 : 0, n.categoryId, supplierId, n.brand, n.availability, n.stock, n.moq, n.leadDays, n.weightG, n.volumeCm3, n.price?.minor ?? null, n.price?.currency ?? null, t, t);
    replaceSourceRows(db, id, n);
    db.prepare(`INSERT INTO product_sources (product_id, source, source_product_id, source_url, source_price_minor, source_currency, source_lang, raw_hash, raw_json, first_seen_at, synced_at, source_updated_at, sync_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok')`).run(id, n.source, n.sourceProductId, n.url, n.price?.minor ?? null, n.price?.currency ?? null, n.lang, n.rawHash, JSON.stringify(n.raw), t, n.fetchedAt, n.sourceUpdatedAt);
    refreshDerived(db, id);
    return { outcome: 'created', productId: id, warnings: n.warnings };
  });
}

/** Runs a full import from an adapter and records an import_runs row. */
export async function runImport(db, adapter, { actor = null, ...options } = {}) {
  if (!adapter?.available || typeof adapter.listProducts !== 'function') return { error: 'adapter_unavailable', reason: adapter?.reason || 'unknown' };
  const id = 'imp_' + crypto.randomBytes(6).toString('hex');
  const started = now();
  db.prepare("INSERT INTO import_runs (id, source, actor, started_at, status) VALUES (?, ?, ?, ?, 'running')").run(id, adapter.id, actor, started);
  const counts = { created: 0, updated: 0, unchanged: 0, failed: 0 }; const errors = []; const items = [];
  let fatal = null;
  let meta = null;
  try {
    const list = await adapter.listProducts({ ...options, db });
    if (list.meta) meta = list.meta;
    for (const sp of list) {
      const r = importOne(db, { ...sp, source: adapter.id }, { sample: adapter.kind === 'fixture' });
      counts[r.outcome]++;
      items.push(r);
      if (r.outcome === 'failed') errors.push({ sourceProductId: r.sourceProductId, code: r.code, detail: r.detail ?? null });
    }
  } catch (e) { fatal = String(e?.code || e?.message || e); }
  const status = fatal ? 'failed' : counts.failed ? 'partial' : 'succeeded';
  if (fatal) errors.push({ code: 'adapter_error', detail: fatal });
  db.prepare('UPDATE import_runs SET finished_at = ?, status = ?, created = ?, updated = ?, unchanged = ?, failed = ?, errors = ? WHERE id = ?')
    .run(now(), status, counts.created, counts.updated, counts.unchanged, counts.failed, JSON.stringify(errors), id);
  audit(db, actor, 'catalog.import', adapter.id, { run: id, ...counts, query: options.q || null });
  return { id, source: adapter.id, status, ...counts, errors, items, meta };
}
