// Catalogue repository + importer against an in-memory SQLite database. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { getDb } from '../server/db/index.mjs';
import { seedCatalog } from '../server/catalog/seed.mjs';
import { fixtureAdapter } from '../server/catalog/sources/fixture.mjs';
import { getAdapter } from '../server/catalog/sources/adapter.mjs';
import { importOne, runImport } from '../server/catalog/importer.mjs';
import { normalize, mapCategory } from '../server/catalog/normalizer.mjs';
import { cleanText, safeHttpsUrl, safeImageUrl } from '../server/catalog/sanitize.mjs';
import * as R from '../server/catalog/repository.mjs';

const db = getDb(':memory:');
seedCatalog(db);
const ADMIN = { id: 'u4', role: 'admin' };
const SUPPLIER = { id: 'u3', role: 'supplier', supplierId: 's1' };
const bySource = (spid) => db.prepare("SELECT product_id FROM product_sources WHERE source = 'fixture' AND source_product_id = ?").get(spid)?.product_id;
const listings = async () => (await fixtureAdapter.listProducts());

test('demo seed: 40 published editorial products flagged demo', () => {
  const r = R.listProducts(db, { pageSize: 100 }, null);
  assert.equal(r.total, 40);
  assert.ok(r.items.every((p) => p.demo && p.origin === 'editorial' && p.status === 'published'));
});

test('listing paginates without overlap and reports hasMore', () => {
  const a = R.listProducts(db, { page: 1, pageSize: 15, sort: 'newest' }, null);
  const b = R.listProducts(db, { page: 2, pageSize: 15, sort: 'newest' }, null);
  const c = R.listProducts(db, { page: 3, pageSize: 15, sort: 'newest' }, null);
  assert.equal(a.items.length, 15); assert.equal(b.items.length, 15); assert.equal(c.items.length, 10);
  assert.equal(a.hasMore, true); assert.equal(c.hasMore, false);
  const ids = [...a.items, ...b.items, ...c.items].map((p) => p.id);
  assert.equal(new Set(ids).size, 40);
});

test('public page size is capped at 100', () => {
  assert.equal(R.listProducts(db, { pageSize: 10_000 }, null).pageSize, 100);
  assert.equal(R.listProducts(db, { pageSize: 10_000 }, ADMIN).pageSize, 500);
});

test('category filter', () => {
  const r = R.listProducts(db, { category: 'electronics', pageSize: 100 }, null);
  assert.ok(r.total > 0);
  assert.ok(r.items.every((p) => p.categoryId === 'electronics'));
});

test('sorting by price ascending / descending is monotonic in TMT', () => {
  const asc = R.listProducts(db, { sort: 'price_asc', pageSize: 100 }, null).items.map((p) => p.pricing.goodsMinor);
  const desc = R.listProducts(db, { sort: 'price_desc', pageSize: 100 }, null).items.map((p) => p.pricing.goodsMinor);
  for (let i = 1; i < asc.length; i++) assert.ok(asc[i] >= asc[i - 1]);
  for (let i = 1; i < desc.length; i++) assert.ok(desc[i] <= desc[i - 1]);
});

test('sorting by delivery and newest', () => {
  const d = R.listProducts(db, { sort: 'delivery', pageSize: 100 }, null).items.map((p) => p.leadDays);
  for (let i = 1; i < d.length; i++) assert.ok(d[i] >= d[i - 1]);
  const n = R.listProducts(db, { sort: 'newest', pageSize: 100 }, null).items;
  assert.equal(n.length, 40);
});

test('price filter converts CNY bounds through the stored FX rate', () => {
  const r = R.listProducts(db, { minPrice: 100, maxPrice: 300, pageSize: 100 }, null);
  assert.ok(r.total > 0);
  assert.ok(r.items.every((p) => p.priceCNY >= 100 && p.priceCNY <= 300));
});

test('search: title, keyword, brand-less spec, Russian category name', () => {
  const t = R.listProducts(db, { q: 'earbuds' }, null);
  assert.ok(t.items.some((p) => p.id === 'p1'));
  assert.equal(t.matchMode, 'all');
  const spec = R.listProducts(db, { q: 'Bluetooth 5.3' }, null);
  assert.ok(spec.items.some((p) => p.id === 'p1'), 'spec value is searchable');
  const ru = R.listProducts(db, { q: 'электроника', pageSize: 100 }, null);
  assert.ok(ru.total >= 8 && ru.items.every((p) => p.categoryId === 'electronics'));
  const none = R.listProducts(db, { q: 'zzzqqqxx' }, null);
  assert.equal(none.total, 0);
});

test('search falls back to any-token match and says so', () => {
  const r = R.listProducts(db, { q: 'earbuds zzzqqq' }, null);
  assert.equal(r.matchMode, 'any');
  assert.ok(r.total > 0);
});

test('search query syntax is neutralised (no FTS injection)', () => {
  for (const q of ['"', 'NEAR(', 'a OR', '* AND *', "'; DROP TABLE products; --"]) assert.doesNotThrow(() => R.listProducts(db, { q }, null), q);
  assert.equal(R.listProducts(db, { pageSize: 100 }, null).total, 40);
});

test('details: invalid id and not found', () => {
  assert.equal(R.getProduct(db, '../etc', {}).error, 'invalid_id');
  assert.equal(R.getProduct(db, 'x'.repeat(65), {}).error, 'invalid_id');
  assert.equal(R.getProduct(db, 'nope', {}).error, 'not_found');
  const ok = R.getProduct(db, 'p1', {});
  assert.equal(ok.product.id, 'p1');
  assert.equal(ok.supplier.id, 's1');
});

test('localization fallback: editorial EN title served for RU/TK and flagged', () => {
  const ru = R.getProduct(db, 'p1', { lang: 'ru' }).product;
  assert.equal(ru.localized.fallback, true);
  assert.equal(ru.localized.titleLang, 'en');
  const en = R.getProduct(db, 'p1', { lang: 'en' }).product;
  assert.equal(en.localized.fallback, false);
  assert.equal(R.getProduct(db, 'p1', { lang: 'xx' }).product.localized.lang, 'en');
});

test('supplier verification level comes from recorded documents', () => {
  const s = R.getProduct(db, 'p1', {}).supplier;
  assert.equal(s.trust.level, 2);
  assert.ok(s.trust.basis.some((b) => b.kind === 'license'));
  assert.equal(s.trust.scoreBasis, 'demo_seed');
});

test('import: idempotent by (source, source product id)', async () => {
  const before = R.listProducts(db, { includeUnpublished: true, pageSize: 500 }, ADMIN).total;
  const r1 = await runImport(db, fixtureAdapter, { actor: 'test' });
  assert.equal(r1.status, 'partial');
  assert.equal(r1.created, 6);
  assert.equal(r1.failed, 2);
  assert.deepEqual(r1.errors.map((e) => e.code).sort(), ['category_unmapped', 'invalid_price']);
  const r2 = await runImport(db, fixtureAdapter, { actor: 'test' });
  assert.equal(r2.created, 0);
  assert.equal(r2.unchanged, 6);
  const after = R.listProducts(db, { includeUnpublished: true, pageSize: 500 }, ADMIN).total;
  assert.equal(after, before + 6);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM product_sources WHERE source = 'fixture'").get().n, 6);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM import_runs').get().n, 2);
});

test('imported products are drafts flagged sample, hidden from the public', () => {
  const id = bySource('FX-1001');
  const row = db.prepare('SELECT status, sample, origin FROM products WHERE id = ?').get(id);
  assert.deepEqual({ ...row }, { status: 'draft', sample: 1, origin: 'imported' });
  assert.equal(R.getProduct(db, id, {}).error, 'not_found');
  assert.equal(R.getProduct(db, id, { viewer: ADMIN }).product.sample, true);
  assert.equal(R.listProducts(db, { pageSize: 100 }, null).total, 40);
  assert.equal(R.listProducts(db, { includeUnpublished: true, pageSize: 100 }, null).total, 40, 'includeUnpublished ignored for guests');
});

test('source provenance is kept separately from the presented product', () => {
  const p = R.getProduct(db, bySource('FX-1001'), { viewer: ADMIN, lang: 'en' }).product;
  assert.equal(p.source.name, 'fixture');
  assert.equal(p.source.productId, 'FX-1001');
  assert.deepEqual(p.source.price, { amountMinor: 12900, currency: 'CNY' });
  assert.equal(p.source.syncStatus, 'ok');
  assert.equal(p.source.stale, false);
  assert.equal(p.localized.machine, true, 'EN text came from a source translation');
  const zh = R.getProduct(db, bySource('FX-1001'), { viewer: ADMIN, lang: 'tk' }).product;
  assert.equal(zh.localized.fallback, true);
});

test('USD source price is converted with the USD rate', () => {
  const p = R.getProduct(db, bySource('FX-1004'), { viewer: ADMIN }).product;
  assert.equal(p.source.price.currency, 'USD');
  assert.equal(p.pricing.fx.pair, 'USD/TMT');
  assert.equal(p.pricing.status, 'estimate');
});

test('missing source price → pricing unavailable, never zero total', () => {
  const p = R.getProduct(db, bySource('FX-1005'), { viewer: ADMIN }).product;
  assert.equal(p.pricing.status, 'unavailable');
  assert.equal(p.pricing.totalMinor, null);
  assert.equal(p.source.price, null);
});

test('missing weight and seller → incomplete logistics, no seller invented', () => {
  const p = R.getProduct(db, bySource('FX-1003'), { viewer: ADMIN });
  assert.equal(p.product.pricing.status, 'incomplete');
  assert.equal(p.product.pricing.totalMinor, null);
  assert.ok(p.product.pricing.missing.includes('weight'));
  assert.equal(p.product.weightKnown, false);
  assert.equal(p.product.seller, null);
  assert.equal(p.supplier, null);
});

test('imported sellers start unverified with no score', () => {
  const p = R.getProduct(db, bySource('FX-1001'), { viewer: ADMIN });
  assert.equal(p.supplier.trust.level, 0);
  assert.equal(p.supplier.score, null);
  assert.equal(p.supplier.yearsActive, null);
  assert.equal(p.supplier.status, 'unreviewed');
});

test('external content is sanitised: no markup, unsafe URLs or images', () => {
  const p = R.getProduct(db, bySource('FX-1007'), { viewer: ADMIN, lang: 'en' }).product;
  assert.ok(!/[<>]/.test(p.title), p.title);
  assert.ok(!/script|onerror/i.test(`${p.title} ${p.description}`));
  assert.equal(p.source.url, null);
  assert.ok(p.images.every((im) => !/^(javascript|data|http):/i.test(im.src)));
  assert.equal(cleanText('<b>Hi</b>‮evil<script>alert(1)</script>'), 'Hi evil');
  assert.equal(safeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpsUrl('http://example.com'), null);
  assert.equal(safeHttpsUrl('https://user:pw@example.com/'), null);
  assert.equal(safeHttpsUrl('https://127.0.0.1/x'), null);
  assert.equal(safeHttpsUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeImageUrl('img/products/p1-0.webp'), 'img/products/p1-0.webp');
  assert.equal(safeImageUrl('../../etc/passwd'), null);
  assert.equal(safeImageUrl('https://cdn.example.com/a.jpg'), null, 'remote hosts need IMAGE_HOSTS');
});

test('normalizer: identity, title, category and currency are required', () => {
  const base = { source: 'fixture', sourceProductId: 'T-1', title: 'Cable', categoryHint: 'cable', price: { amount: '5', currency: 'CNY' } };
  assert.equal(normalize(base).categoryId, 'electronics');
  assert.throws(() => normalize({ ...base, sourceProductId: '' }), /missing_identity/);
  assert.throws(() => normalize({ ...base, title: '<b></b>' }), /missing_title/);
  assert.throws(() => normalize({ ...base, categoryHint: 'misc' }), /category_unmapped/);
  assert.throws(() => normalize({ ...base, price: { amount: '5', currency: 'EUR' } }), /unsupported_currency/);
  assert.throws(() => normalize({ ...base, price: { amount: '1e3', currency: 'CNY' } }), /invalid_price/);
  assert.equal(mapCategory('儿童 玩具 服装'), 'kids');
});

test('a failed re-import never erases a valid product', async () => {
  const id = bySource('FX-1002');
  const before = R.getProduct(db, id, { viewer: ADMIN, lang: 'en' }).product;
  const src = (await listings()).find((l) => l.sourceProductId === 'FX-1002');
  const r = importOne(db, { ...src, price: { amount: '-1', currency: 'CNY' } });
  assert.equal(r.outcome, 'failed');
  assert.equal(r.code, 'invalid_price');
  const after = R.getProduct(db, id, { viewer: ADMIN, lang: 'en' }).product;
  assert.equal(after.title, before.title);
  assert.equal(after.pricing.goodsMinor, before.pricing.goodsMinor);
  assert.equal(after.source.syncStatus, 'error');
  assert.equal(after.source.lastError, 'invalid_price');
  // a later valid import clears the error
  const ok = importOne(db, src);
  assert.equal(ok.outcome, 'updated');
  assert.equal(R.getProduct(db, id, { viewer: ADMIN }).product.source.syncStatus, 'ok');
});

test('editorial overrides survive re-import (field ownership)', async () => {
  const id = bySource('FX-1001');
  const u = R.updateProduct(db, id, { title: 'Curated headphones', priceCNY: '149' }, ADMIN);
  assert.equal(u.id, id);
  const src = (await listings()).find((l) => l.sourceProductId === 'FX-1001');
  const r = importOne(db, { ...src, price: { amount: '99.00', currency: 'CNY' }, stock: 5, translations: { en: { title: 'Source changed title' } } });
  assert.equal(r.outcome, 'updated');
  const p = R.getProduct(db, id, { viewer: ADMIN, lang: 'en' }).product;
  assert.equal(p.title, 'Curated headphones', 'editorial title wins');
  assert.equal(p.pricing.source.amountMinor, 14900, 'editorial price kept');
  assert.deepEqual(p.source.price, { amountMinor: 9900, currency: 'CNY' }, 'source price still recorded');
  assert.equal(p.stock, 5, 'non-overridden source fields still update');
  const owned = JSON.parse(db.prepare('SELECT editorial_fields FROM products WHERE id = ?').get(id).editorial_fields);
  assert.deepEqual(owned.sort(), ['price']);
});

test('suppliers: own products only, limited fields, no publishing', () => {
  assert.equal(R.updateProduct(db, 'p15', { stock: 3 }, SUPPLIER).error, 'forbidden', 'other supplier');
  assert.equal(R.updateProduct(db, 'p1', { featured: true }, SUPPLIER).error, 'forbidden', 'editorial field');
  assert.equal(R.updateProduct(db, 'p1', { published: false }, SUPPLIER).error, 'forbidden', 'publishing is admin-only');
  assert.equal(R.updateProduct(db, bySource('FX-1001'), { stock: 1 }, { ...SUPPLIER, supplierId: db.prepare('SELECT supplier_id FROM products WHERE id = ?').get(bySource('FX-1001')).supplier_id }).error, 'forbidden', 'imported products are not supplier-editable');
  const ok = R.updateProduct(db, 'p1', { stock: 77 }, SUPPLIER);
  assert.equal(ok.id, 'p1');
  const c = R.createEditorialProduct(db, { title: 'Supplier draft', categoryId: 'home', priceCNY: '12.50', supplierId: 's9', published: true }, SUPPLIER);
  const row = db.prepare('SELECT supplier_id, status FROM products WHERE id = ?').get(c.id);
  assert.deepEqual({ ...row }, { supplier_id: 's1', status: 'draft' });
});

test('editorial validation rejects bad input', () => {
  const r = R.createEditorialProduct(db, { title: 'x', categoryId: 'nope', priceCNY: '-1' }, ADMIN);
  assert.deepEqual(r.errors.sort(), ['categoryId', 'priceCNY', 'supplierId', 'title'].sort());
  assert.deepEqual(R.updateProduct(db, 'p1', { stock: -1, tags: ['hack'] }, ADMIN).errors.sort(), ['stock', 'tags']);
});

test('archived products disappear but are not deleted', () => {
  const c = R.createEditorialProduct(db, { title: 'Temp item', categoryId: 'home', priceCNY: '10', supplierId: 's1', published: true }, ADMIN);
  assert.equal(R.getProduct(db, c.id, {}).product.status, 'published');
  R.archiveProduct(db, c.id, ADMIN);
  assert.equal(R.getProduct(db, c.id, { viewer: ADMIN }).error, 'not_found');
  assert.ok(db.prepare('SELECT 1 FROM products WHERE id = ?').get(c.id));
});

test('planned marketplace adapters are unavailable, not faked', async () => {
  for (const id of ['1688', 'taobao', 'alibaba', 'aliexpress', 'jd']) {
    const a = getAdapter(id);
    assert.equal(a.available, false, id);
    assert.equal(a.live, false, id);
    const r = await runImport(db, a);
    assert.equal(r.error, 'adapter_unavailable');
  }
  assert.equal(fixtureAdapter.live, false);
});

test('home rails report their basis; trending needs real view data', () => {
  let h = R.homeRails(db, {});
  assert.equal(h.trending.basis, 'insufficient_data');
  assert.equal(h.trending.items.length, 0);
  assert.equal(h.popular.basis, 'editorial');
  for (const id of ['p1', 'p2', 'p3', 'p4']) for (const v of ['a', 'b']) R.recordView(db, id, v);
  R.recordView(db, 'p1', 'a'); // duplicate visitor/day ignored
  h = R.homeRails(db, {});
  assert.equal(h.trending.basis, 'views_7d');
  assert.equal(h.trending.items.length, 4);
  assert.equal(R.recordView(db, 'missing', 'a'), false);
  assert.ok(h.bestValue.items.every((p) => p.pricing.status === 'estimate'));
});

test('stale indicator after the configured window', () => {
  const id = bySource('FX-1002');
  db.prepare("UPDATE product_sources SET synced_at = '2020-01-01T00:00:00.000Z' WHERE product_id = ?").run(id);
  assert.equal(R.getProduct(db, id, { viewer: ADMIN }).product.source.stale, true);
});
