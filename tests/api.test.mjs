// HTTP API: spawns the real server on a temporary data directory and calls it like a browser would.
// Covers public catalogue endpoints, validation, and authorization (guest / supplier / admin). Run: npm test
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = 4300 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'cargo-one-test-'));
let server;

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], {
    cwd: ROOT, env: { ...process.env, OTAPI_KEY: '', PORT: String(PORT), DATA_DIR: DATA, DB_FILE: '', AUTH_SECRET: 'test-secret-' + PORT }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(`${BASE}/api/catalog/categories`); if (r.ok) return; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start:\n' + log);
});
after(() => { server?.kill(); fs.rmSync(DATA, { recursive: true, force: true }); });

const get = async (p, cookie) => { const r = await fetch(BASE + p, { headers: cookie ? { cookie } : {} }); return { status: r.status, body: await r.json() }; };
const post = async (p, body, cookie, headers = {}) => {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => ({})), setCookie: r.headers.get('set-cookie') };
};
async function login(identifier) {
  const r = await post('/api/auth/login', { identifier, password: 'demo1234' });
  assert.equal(r.status, 200, `login ${identifier}`);
  return r.setCookie.split(';')[0];
}

test('categories are localized', async () => {
  const r = await get('/api/catalog/categories?lang=ru');
  assert.equal(r.status, 200);
  const el = r.body.categories.find((c) => c.id === 'electronics');
  assert.equal(el.name, 'Электроника');
  assert.ok(el.products > 0);
});

test('product listing, search, filter, sort, pagination', async () => {
  const all = await get('/api/catalog/products?pageSize=12');
  assert.equal(all.status, 200);
  assert.equal(all.body.items.length, 12);
  assert.equal(all.body.total, 40);
  assert.equal(all.body.hasMore, true);
  const p2 = await get('/api/catalog/products?pageSize=12&page=2');
  assert.ok(p2.body.items.every((p) => !all.body.items.some((x) => x.id === p.id)));
  const s = await get('/api/catalog/products?q=' + encodeURIComponent('наушники'));
  assert.ok(s.body.total > 0, 'Russian keyword search');
  const cat = await get('/api/catalog/products?category=fashion&sort=price_asc&pageSize=100');
  assert.ok(cat.body.items.every((p) => p.categoryId === 'fashion'));
  const prices = cat.body.items.map((p) => p.pricing.goodsMinor);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  assert.equal((await get('/api/catalog/products?sort=bogus')).status, 400);
  assert.equal((await get('/api/catalog/products?category=' + encodeURIComponent('a b'))).status, 400);
  assert.equal((await get('/api/catalog/products?pageSize=1000')).body.pageSize, 100);
});

test('product details, invalid id and not found', async () => {
  const ok = await get('/api/catalog/products/p1?lang=tk');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.product.localized.fallback, true);
  assert.equal(ok.body.product.pricing.confirmed, false);
  assert.equal(ok.body.product.pricing.status, 'estimate');
  assert.equal((await get('/api/catalog/products/' + encodeURIComponent('bad id!'))).status, 400);
  assert.equal((await get('/api/catalog/products/doesnotexist')).status, 404);
  const alt = await get('/api/catalog/products/p1/alternatives');
  assert.equal(alt.status, 200);
  assert.ok('cheaper' in alt.body);
});

test('home rails and public pricing parameters', async () => {
  const h = await get('/api/catalog/home');
  assert.equal(h.status, 200);
  assert.equal(h.body.trending.basis, 'insufficient_data');
  assert.ok(h.body.newArrivals.items.length > 0);
  const pr = await get('/api/catalog/pricing');
  assert.equal(pr.body.confirmedQuotes, false);
  assert.equal(pr.body.tariffIsDemo, true);
  assert.equal(pr.body.fx.CNY.source, 'demo_default');
});

test('view events: validated, de-duplicated per visitor and day', async () => {
  assert.equal((await post('/api/catalog/events', { kind: 'view', productId: 'p1' })).body.recorded, true);
  assert.equal((await post('/api/catalog/events', { kind: 'click', productId: 'p1' })).status, 400);
  assert.equal((await post('/api/catalog/events', { kind: 'view', productId: '<x>' })).status, 400);
  assert.equal((await post('/api/catalog/events', [])).status, 400);
});

test('CSRF guards: foreign origin and non-JSON posts are refused', async () => {
  assert.equal((await post('/api/catalog/events', { kind: 'view', productId: 'p1' }, null, { origin: 'https://evil.example' })).status, 403);
  const r = await fetch(BASE + '/api/catalog/events', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(r.status, 415);
});

test('guests cannot manage products or run imports', async () => {
  assert.equal((await post('/api/catalog/manage/products', { title: 'x' })).status, 401);
  assert.equal((await post('/api/catalog/manage/products/p1', { stock: 1 })).status, 401);
  assert.equal((await post('/api/admin/catalog/import', { source: 'fixture' })).status, 401);
  assert.equal((await get('/api/admin/catalog/sources')).status, 401);
  assert.equal((await get('/api/admin/catalog/pricing')).status, 401);
});

test('personal and business accounts are forbidden from management', async () => {
  for (const who of ['personal@cargo.one', 'business@cargo.one']) {
    const c = await login(who);
    assert.equal((await post('/api/catalog/manage/products/p1', { stock: 1 }, c)).status, 403, who);
    assert.equal((await post('/api/admin/catalog/import', { source: 'fixture' }, c)).status, 403, who);
  }
});

test('supplier: own products only, cannot publish, cannot import', async () => {
  const c = await login('supplier@cargo.one');
  const own = await post('/api/catalog/manage/products/p1', { stock: 42 }, c);
  assert.equal(own.status, 200);
  assert.equal(own.body.product.stock, 42);
  const foreign = (await get('/api/catalog/products?pageSize=100')).body.items.find((p) => p.supplierId !== 's1');
  assert.equal((await post(`/api/catalog/manage/products/${foreign.id}`, { stock: 1 }, c)).status, 403);
  assert.equal((await post('/api/catalog/manage/products/p1', { published: false }, c)).status, 403);
  assert.equal((await post('/api/catalog/manage/products/p1/archive', {}, c)).status, 403);
  assert.equal((await post('/api/admin/catalog/import', { source: 'fixture' }, c)).status, 403);
  const created = await post('/api/catalog/manage/products', { title: 'Supplier new item', categoryId: 'home', priceCNY: '15', supplierId: 's2', published: true }, c);
  assert.equal(created.status, 201);
  assert.equal(created.body.product.supplierId, 's1');
  assert.equal(created.body.product.status, 'draft');
  assert.equal((await get(`/api/catalog/products/${created.body.product.id}`)).status, 404, 'draft hidden from the public');
  assert.equal((await get(`/api/catalog/products/${created.body.product.id}`, c)).status, 200, 'owner sees its draft');
  assert.equal((await post('/api/catalog/manage/products', { title: 'x', categoryId: 'nope', priceCNY: '-1' }, c)).status, 400);
});

test('admin: import is idempotent; planned adapters refuse; pricing validated', async () => {
  const c = await login('admin@cargo.one');
  const r1 = await post('/api/admin/catalog/import', { source: 'fixture' }, c);
  assert.equal(r1.status, 200);
  assert.equal(r1.body.created, 6);
  const r2 = await post('/api/admin/catalog/import', { source: 'fixture' }, c);
  assert.equal(r2.body.created, 0);
  assert.equal(r2.body.unchanged, 6);
  assert.equal((await post('/api/admin/catalog/import', { source: '1688' }, c)).status, 409);
  const ot = await post('/api/admin/catalog/import', { source: 'ot-aliexpress', query: 'earbuds' }, c);
  assert.equal(ot.status, 409, 'OT adapter without OTAPI_KEY cannot run');
  assert.equal(ot.body.reason, 'not_configured');
  assert.equal((await post('/api/admin/catalog/import', { source: 'nope' }, c)).status, 400);
  const src = await get('/api/admin/catalog/sources', c);
  assert.equal(src.body.adapters.find((a) => a.id === 'fixture').stats.products, 6);
  assert.ok(src.body.adapters.every((a) => a.live === false));
  assert.ok(src.body.runs.length >= 2);
  const drafts = await get('/api/catalog/products?includeUnpublished=1&pageSize=500', c);
  assert.equal(drafts.body.total, 47); // 40 demo + 6 imported + 1 supplier draft
  assert.equal((await get('/api/catalog/products?includeUnpublished=1&pageSize=500')).body.total, 40, 'guests never see drafts');
  assert.equal((await post('/api/admin/catalog/pricing', { serviceFeePct: '-3' }, c)).status, 400);
  assert.equal((await post('/api/admin/catalog/pricing', { fx: { CNY: 'abc' } }, c)).status, 400);
  const ok = await post('/api/admin/catalog/pricing', { fx: { CNY: '0.50' } }, c);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.fx.CNY.rate, '0.50');
  assert.equal(ok.body.fx.CNY.source, 'admin:u4');
  const p1 = await get('/api/catalog/products/p1');
  assert.equal(p1.body.product.pricing.goodsMinor, 9450); // 189 × 0.50
  const pub = await post(`/api/catalog/manage/products/${drafts.body.items.find((p) => p.sample).id}`, { published: true }, c);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.product.status, 'published');
});

test('existing auth protection still holds for pages', async () => {
  const r = await fetch(BASE + '/admin', { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /^\/login\?next=/);
});

test('admin can hide the demo products from the storefront and bring them back', async () => {
  const c = await login('admin@cargo.one');
  assert.equal((await post('/api/admin/catalog/demo', { visible: 'no' }, c)).status, 400);
  const hide = await post('/api/admin/catalog/demo', { visible: false }, c);
  assert.equal(hide.status, 200);
  assert.equal(hide.body.demoPublished, 0);
  const pub = await get('/api/catalog/products?pageSize=100');
  assert.ok(pub.body.items.every((p) => !p.demo), 'no demo products in the shop');
  const show = await post('/api/admin/catalog/demo', { visible: true }, c);
  assert.equal(show.body.demoPublished, 40);
  const supplier = await login('supplier@cargo.one');
  assert.equal((await post('/api/admin/catalog/demo', { visible: false }, supplier)).status, 403);
});
