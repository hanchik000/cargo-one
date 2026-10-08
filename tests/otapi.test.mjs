// OT Commerce adapter (W2): request building, signing, response mapping, budget and error handling, import.
// Uses a fake fetch with SYNTHETIC responses shaped after the OT API docs; no network, no real key.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.IMAGE_HOSTS = 'alicdn.com';
const { getDb } = await import('../server/db/index.mjs');
const { seedCatalog } = await import('../server/catalog/seed.mjs');
const { runImport } = await import('../server/catalog/importer.mjs');
const R = await import('../server/catalog/repository.mjs');
const { createOtapiAdapter, mapOtItem, searchXml, signParams, OTAPI_BASE } = await import('../server/catalog/sources/otapi.mjs');

const FX = JSON.parse(fs.readFileSync(new URL('../server/catalog/sources/fixtures/otapi-shape.json', import.meta.url), 'utf8'));
const db = getDb(':memory:');
seedCatalog(db);
const ADMIN = { id: 'u4', role: 'admin' };
const KEY = '00000000-test-key-not-real-000000000000';

function fakeFetch(routes, log = []) {
  return async (url) => {
    const u = new URL(url);
    log.push(u);
    const method = u.pathname.split('/').pop();
    const body = typeof routes[method] === 'function' ? routes[method](u) : routes[method];
    if (body instanceof Error) throw body;
    return { status: 200, json: async () => structuredClone(body) };
  };
}

test('adapter without a key is listed but unavailable', async () => {
  const a = createOtapiAdapter({});
  assert.equal(a.available, false);
  assert.equal(a.live, false);
  assert.equal(a.reason, 'not_configured');
  const r = await runImport(db, a, { q: 'x' });
  assert.equal(r.error, 'adapter_unavailable');
});

test('search request: https endpoint, escaped XML, key only in the query string to OT', async () => {
  const log = [];
  const a = createOtapiAdapter({ key: KEY, fetchImpl: fakeFetch({ BatchSearchItemsFrame: FX.search }, log), dailyLimit: 100, id: 'ot-t1' });
  await a.listProducts({ db, q: 'earbuds <b>&"', limit: 5 });
  assert.equal(log.length, 1);
  assert.ok(log[0].href.startsWith(OTAPI_BASE + 'BatchSearchItemsFrame?'));
  assert.equal(log[0].protocol, 'https:');
  assert.equal(log[0].searchParams.get('instanceKey'), KEY);
  assert.equal(log[0].searchParams.get('language'), 'ru');
  assert.equal(log[0].searchParams.get('frameSize'), '5');
  const xml = log[0].searchParams.get('xmlParameters');
  assert.match(xml, /<Provider>Aliexpress<\/Provider>/);
  assert.match(xml, /<ItemTitle>earbuds &lt;b&gt;&amp;&quot;<\/ItemTitle>/);
  assert.equal(log[0].searchParams.get('signature'), null, 'no signature without a secret');
  assert.equal(searchXml({ q: 'a' }).includes('<Provider>'), false);
});

test('signature follows the official client (sorted values, method prefix, secret suffix)', async () => {
  const sig = signParams('GetItemFullInfo', { b: '2', a: '1', language: 'ru' }, 's3cr3t');
  const expected = (await import('node:crypto')).createHash('sha256').update('GetItemFullInfo' + '1' + '2' + 'ru' + 's3cr3t').digest('hex');
  assert.equal(sig, expected);
  const log = [];
  const a = createOtapiAdapter({ key: KEY, secret: 's3cr3t', fetchImpl: fakeFetch({ BatchSearchItemsFrame: FX.search }, log), id: 'ot-t2' });
  await a.listProducts({ db, q: 'x', limit: 1 });
  assert.match(log[0].searchParams.get('timestamp'), /^\d{14}$/);
  assert.match(log[0].searchParams.get('signature'), /^[0-9a-f]{64}$/);
});

test('mapping: price as decimal string, https images, weight and volume, seller, translation', () => {
  const sp = mapOtItem(FX.search.Result.Items.Items.Content[0], { source: 'ot-aliexpress', lang: 'ru' });
  assert.equal(sp.sourceProductId, 'ae-1005000000000001');
  assert.deepEqual(sp.price, { amount: '12.35', currency: 'USD' });
  assert.equal(sp.lang, 'en');
  assert.equal(sp.title, 'TWS Wireless Earbuds Bluetooth 5.3 Noise Cancelling');
  assert.equal(sp.translations.ru.title, 'Беспроводные наушники TWS, Bluetooth 5.3');
  assert.deepEqual(sp.images.slice(0, 2), ['https://ae01.alicdn.com/kf/test-1-large.jpg', 'https://ae04.alicdn.com/kf/test-2.jpg']);
  assert.equal(sp.weightG, 120);
  assert.equal(sp.volumeCm3, 320);
  assert.equal(sp.stock, 870);
  assert.deepEqual(sp.seller, { sellerId: 'store-900001', name: 'Test Audio Store', city: 'Shenzhen', province: 'Guangdong' });
  assert.equal(sp.leadDays, null, 'dispatch time is not invented');
  assert.equal(sp.providerSignals.vendorScore, 4.8);
});

test('mapping: variants with price deltas and specs from full info', () => {
  const sp = mapOtItem(FX.full.Result.Item, { source: 'ot-aliexpress', lang: 'ru' });
  assert.deepEqual(sp.variants.map((v) => [v.name, v.priceDelta, v.stock]), [['Цвет: Чёрный', '0.00', 500], ['Цвет: Белый', '0.75', 370]]);
  assert.deepEqual(sp.specs, [{ name: 'Версия Bluetooth', value: '5.3' }, { name: 'Ёмкость батареи', value: '40 mAh' }]);
});

test('import: drafts, idempotent, failures recorded, unsafe content dropped, operator category', async () => {
  const a = createOtapiAdapter({ key: KEY, fetchImpl: fakeFetch({ BatchSearchItemsFrame: FX.search }), dailyLimit: 100, id: 'ot-aliexpress' });
  const r1 = await runImport(db, a, { actor: 'u4', q: 'earbuds', limit: 10, categoryId: 'electronics' });
  assert.equal(r1.status, 'partial');
  assert.equal(r1.created, 3);
  assert.deepEqual(r1.errors.map((e) => [e.sourceProductId, e.code]), [['ae-1005000000000004', 'unsupported_currency']]);
  assert.equal(r1.meta.total, 1234);
  const r2 = await runImport(db, a, { actor: 'u4', q: 'earbuds', limit: 10, categoryId: 'electronics' });
  assert.equal(r2.created, 0);
  assert.equal(r2.unchanged, 3);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM product_sources WHERE source = 'ot-aliexpress'").get().n, 3);

  const pid = (spid) => db.prepare("SELECT product_id FROM product_sources WHERE source = 'ot-aliexpress' AND source_product_id = ?").get(spid).product_id;
  const p1 = R.getProduct(db, pid('ae-1005000000000001'), { viewer: ADMIN, lang: 'ru' });
  assert.equal(p1.product.status, 'draft');
  assert.equal(p1.product.sample, false);
  assert.equal(p1.product.origin, 'imported');
  assert.equal(p1.product.categoryId, 'electronics');
  assert.equal(p1.product.title, 'Беспроводные наушники TWS, Bluetooth 5.3');
  assert.equal(p1.product.localized.machine, true);
  assert.equal(p1.product.source.label, 'AliExpress · via OT Commerce');
  assert.deepEqual(p1.product.source.price, { amountMinor: 1235, currency: 'USD' });
  assert.equal(p1.product.source.url, 'https://www.aliexpress.com/item/1005000000000001.html');
  assert.equal(p1.product.pricing.status, 'estimate');
  assert.equal(p1.product.pricing.fx.pair, 'USD/TMT');
  assert.equal(p1.product.images.length, 2, 'http image dropped');
  assert.equal(p1.supplier.trust.level, 0, 'provider vendor score is not CARGO ONE verification');
  assert.equal(p1.supplier.score, null);

  const p2 = R.getProduct(db, pid('ae-1005000000000002'), { viewer: ADMIN, lang: 'ru' }).product;
  assert.ok(!/script/i.test(p2.title));
  assert.equal(p2.images.length, 0);
  assert.equal(p2.availability, 'out_of_stock');
  assert.equal(p2.pricing.status, 'incomplete', 'no weight → no total');

  const p3 = R.getProduct(db, pid('ae-1005000000000003'), { viewer: ADMIN }).product;
  assert.equal(p3.pricing.status, 'unavailable');
});

test('details mode: one extra call per item, description sanitised', async () => {
  const log = [];
  const a = createOtapiAdapter({ key: KEY, fetchImpl: fakeFetch({ BatchSearchItemsFrame: { ErrorCode: 'Ok', Result: { Items: { Items: { Content: [FX.search.Result.Items.Items.Content[0]] } } } }, BatchGetItemFullInfo: FX.full }, log), dailyLimit: 100, id: 'ot-details' });
  const r = await runImport(db, a, { q: 'earbuds', limit: 1, details: true, categoryId: 'electronics' });
  assert.equal(r.created, 1);
  assert.deepEqual(log.map((u) => u.pathname.split('/').pop()), ['BatchSearchItemsFrame', 'BatchGetItemFullInfo']);
  assert.equal(log[1].searchParams.get('itemId'), 'ae-1005000000000001');
  const id = db.prepare("SELECT product_id FROM product_sources WHERE source = 'ot-details'").get().product_id;
  const p = R.getProduct(db, id, { viewer: ADMIN, lang: 'ru' }).product;
  assert.equal(p.variants.length, 2);
  assert.ok(p.description && !/[<>]/.test(p.description));
});

test('daily call budget is enforced before calling', async () => {
  const log = [];
  const a = createOtapiAdapter({ key: KEY, fetchImpl: fakeFetch({ BatchSearchItemsFrame: FX.search, BatchGetItemFullInfo: FX.full }, log), dailyLimit: 2, id: 'ot-budget' });
  const r = await runImport(db, a, { q: 'earbuds', limit: 4, details: true, categoryId: 'electronics' });
  assert.equal(log.length, 2, 'search + one detail call, then the cap stops further calls');
  assert.equal(r.created, 3, 'items still imported from search data');
  assert.equal(r.meta.detailsStopped, 'budget_exhausted');
  const r2 = await runImport(db, a, { q: 'earbuds', limit: 4 });
  assert.equal(r2.status, 'failed');
  assert.equal(r2.errors[0].detail, 'budget_exhausted');
  assert.equal(log.length, 2, 'no call made over budget');
  assert.equal(a.usage(db).callsToday, 2);
});

test('provider errors (banned or expired key, network) fail the run and never touch products', async () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  for (const [name, body] of [['ban', FX.errors.ban], ['expired', FX.errors.expired], ['net', new Error('ECONNRESET')]]) {
    const a = createOtapiAdapter({ key: KEY, fetchImpl: fakeFetch({ BatchSearchItemsFrame: body }), dailyLimit: 10, id: `ot-err-${name}` });
    const r = await runImport(db, a, { q: 'x' });
    assert.equal(r.status, 'failed', name);
    assert.ok(['InstanceKeyBan', 'AccessDenied', 'network_error'].includes(r.errors[0].detail), r.errors[0].detail);
    assert.ok(!JSON.stringify(r).includes(KEY), 'key never appears in results');
    assert.equal(a.usage(db).errorsToday, 1);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM products').get().n, before);
});

test('a later failed refresh keeps the stored product', async () => {
  const ok = createOtapiAdapter({ key: KEY, fetchImpl: fakeFetch({ BatchSearchItemsFrame: FX.search }), dailyLimit: 100, id: 'ot-aliexpress' });
  const bad = structuredClone(FX.search);
  bad.Result.Items.Items.Content[0].Price = { OriginalPrice: -1, OriginalCurrencyCode: 'USD' };
  const broken = createOtapiAdapter({ key: KEY, fetchImpl: fakeFetch({ BatchSearchItemsFrame: bad }), dailyLimit: 100, id: 'ot-aliexpress' });
  await runImport(db, ok, { q: 'earbuds', categoryId: 'electronics' });
  const r = await runImport(db, broken, { q: 'earbuds', categoryId: 'electronics' });
  assert.ok(r.errors.some((e) => e.sourceProductId === 'ae-1005000000000001' && e.code === 'invalid_price'));
  const id = db.prepare("SELECT product_id FROM product_sources WHERE source = 'ot-aliexpress' AND source_product_id = 'ae-1005000000000001'").get().product_id;
  const p = R.getProduct(db, id, { viewer: ADMIN }).product;
  assert.deepEqual(p.source.price, { amountMinor: 1235, currency: 'USD' });
  assert.equal(p.source.syncStatus, 'error');
});

// ---- RECORDED response (real OT API answer for "wireless earbuds", 2 items, captured 2026-10-09; contains no key)
const REC = JSON.parse(fs.readFileSync(new URL('../server/catalog/sources/fixtures/otapi-recorded-search-2026-10-09.json', import.meta.url), 'utf8'));

test('recorded response: structure, list price, placeholders and provider flags', async () => {
  const [a, b] = (await import('../server/catalog/sources/otapi.mjs')).searchItemsOf(REC).map((it) => mapOtItem(it, { source: 'ot-aliexpress', lang: 'ru' }));
  assert.deepEqual(a.price, { amount: '6.44', currency: 'USD' }, 'list price, not the 3.21 promotion');
  assert.deepEqual(a.providerSignals.promotionPrice, { amount: '3.21', currency: 'USD' });
  assert.equal(a.stock, null, '99999 is a placeholder, not stock');
  assert.equal(a.weightG, null);
  assert.equal(a.sourceUpdatedAt, '2025-02-15T01:32:34.79Z');
  assert.equal(b.availability, 'out_of_stock', 'deleted at the source');
  assert.equal(b.weightG, 70);
  assert.equal(b.volumeCm3, 243);
  assert.equal(b.brand, 'Lenovo');
  assert.equal(b.translations.ru.title.startsWith('Оригинальные наушники Lenovo'), true);
  assert.equal(b.translations.ru.description, undefined, 'English description is not labelled as Russian');
  assert.ok(b.description.includes('Features'));
});

test('recorded response: import gives honest states (stale, incomplete, out of stock, sanitised)', async () => {
  const a = createOtapiAdapter({ key: KEY, fetchImpl: fakeFetch({ BatchSearchItemsFrame: REC }), dailyLimit: 100, id: 'ot-rec' });
  const r = await runImport(db, a, { q: 'wireless earbuds', limit: 2, categoryId: 'electronics' });
  assert.equal(r.status, 'succeeded');
  assert.equal(r.created, 2);
  assert.equal(r.meta.total, 21810);
  const get = (spid) => R.getProduct(db, db.prepare("SELECT product_id FROM product_sources WHERE source = 'ot-rec' AND source_product_id = ?").get(spid).product_id, { viewer: ADMIN, lang: 'ru' });
  const pro4 = get('ae-3256805931462627').product;
  assert.equal(pro4.pricing.status, 'incomplete', 'no weight from the source → no total');
  assert.equal(pro4.source.stale, true, 'source data from 2025 is stale');
  assert.equal(pro4.source.sourceUpdatedAt, '2025-02-15T01:32:34.790Z');
  assert.equal(pro4.availability, 'unknown');
  assert.equal(pro4.images.length, 6);
  assert.equal(pro4.localized.machine, true);
  const lenovo = get('ae-3256806069114571');
  assert.equal(lenovo.product.availability, 'out_of_stock');
  assert.equal(lenovo.product.pricing.status, 'estimate');
  assert.equal(lenovo.product.pricing.source.amountMinor, 1673);
  assert.equal(lenovo.product.pricing.fx.pair, 'USD/TMT');
  assert.ok(!/<|script|adminAccountId/.test(lenovo.product.description || ''), 'description sanitised');
  assert.equal(lenovo.supplier.trust.level, 0);
  assert.equal(lenovo.supplier.score, null);
});
