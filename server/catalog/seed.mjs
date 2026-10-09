// Seeds an EMPTY catalogue with the demo data exported from src/data/seed.ts (server/catalog/seed/demo-catalog.json).
// Every product and supplier from it is flagged demo = 1. Set CATALOG_DEMO_SEED=off to start with an empty catalogue.
import fs from 'node:fs';
import { tx } from '../db/index.mjs';
import { seedPricing } from './pricing-config.mjs';
import { refreshDerived } from './repository.mjs';
import { toMinor } from '../../src/shared/pricing.mjs';

const FILE = new URL('./seed/demo-catalog.json', import.meta.url);

/** Verification level from RECORDED documents only: approved licence → 1, + approved bank confirmation → 2. */
function levelFromDocuments(docs = []) {
  const ok = (kind) => docs.some((d) => d.kind === kind && d.status === 'approved');
  const basis = docs.filter((d) => d.status === 'approved').map((d) => ({ kind: d.kind, document: d.name, at: d.uploadedAt }));
  const level = ok('license') ? (ok('bank') ? 2 : 1) : 0;
  return { level, basis };
}

export function seedCatalog(db) {
  seedPricing(db);
  if (process.env.CATALOG_DEMO_SEED === 'off') return { seeded: false };
  if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n) return { seeded: false };
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const t = new Date().toISOString();
  tx(db, () => {
    const cat = db.prepare('INSERT INTO categories (id, icon, position, visible) VALUES (?, ?, ?, ?)');
    const cn = db.prepare('INSERT INTO category_names (category_id, lang, name) VALUES (?, ?, ?)');
    for (const c of data.categories) { cat.run(c.id, c.icon, c.order, c.visible ? 1 : 0); for (const [l, n] of Object.entries(c.names)) cn.run(c.id, l, n); }

    const sup = db.prepare(`INSERT INTO suppliers (id, name, name_cn, city, province, status, verification_level, verification_basis, score, score_basis, demo, legacy, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'demo_seed', 1, ?, ?, ?)`);
    for (const s of data.suppliers) {
      const { level, basis } = levelFromDocuments(s.documents);
      const { id, name, nameCn, city, province, status, score, documents, ...legacy } = s;
      sup.run(id, name, nameCn, city, province, status, level, JSON.stringify(basis), score, JSON.stringify(legacy), t, t);
    }

    const prod = db.prepare(`INSERT INTO products (id, origin, demo, category_id, supplier_id, icon, status, availability, stock, moq, lead_days, weight_g, volume_cm3,
      price_minor, price_currency, old_price_minor, featured, tags, keywords, try_on, legacy, created_at, updated_at, published_at)
      VALUES (?, 'editorial', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const txt = db.prepare("INSERT INTO product_texts (product_id, lang, field, owner, value, updated_at) VALUES (?, 'en', 'title', 'editorial', ?, ?)");
    const img = db.prepare("INSERT INTO product_images (product_id, owner, position, url, angle, tone) VALUES (?, 'editorial', ?, ?, ?, ?)");
    const va = db.prepare("INSERT INTO product_variants (id, product_id, owner, position, name, price_delta_minor, stock) VALUES (?, ?, 'editorial', ?, ?, ?, ?)");
    const sp = db.prepare("INSERT INTO product_specs (product_id, owner, position, name, value) VALUES (?, 'editorial', ?, ?, ?)");
    for (const p of data.products) {
      prod.run(p.id, p.categoryId, p.supplierId, p.icon, p.published ? 'published' : 'draft', p.stock > 0 ? 'in_stock' : 'out_of_stock', p.stock, p.moq, p.leadDays,
        toMinor(p.weightKg, 3), toMinor(p.volumeM3, 6), toMinor(p.priceCNY), p.oldPriceCNY ? toMinor(p.oldPriceCNY) : null, p.featured ? 1 : 0,
        JSON.stringify(p.tags), JSON.stringify(p.keywords), p.tryOn || null, JSON.stringify({ score: p.score, rating: p.rating, reviews: p.reviews }),
        p.createdAt, t, p.published ? p.createdAt : null);
      txt.run(p.id, p.title, t);
      p.images.forEach((im, i) => { if (im.src) img.run(p.id, i, im.src, im.angle, im.tone); });
      p.variants.forEach((v, i) => va.run(v.id, p.id, i, v.name, toMinor(v.priceDeltaCNY), v.stock));
      p.specs.forEach(([k, v], i) => sp.run(p.id, i, k, v));
    }
    for (const p of data.products) refreshDerived(db, p.id);
  });
  return { seeded: true, products: data.products.length };
}
