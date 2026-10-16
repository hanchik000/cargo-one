// Live marketplace search core: validation, mapping, caching, daily cap, key never echoed. No network (fake fetch).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { liveSearch } from '../server/live-search.mjs';

const fx = JSON.parse(fs.readFileSync(new URL('../server/catalog/sources/fixtures/otapi-recorded-search-2026-10-09.json', import.meta.url)));
const cfg = (o = {}) => ({ key: 'SECRET-KEY', provider: 'Taobao', lang: 'ru', dailyLimit: 3, origins: [], ...o });
function fake() {
  const calls = [];
  const f = async (url) => { calls.push(String(url)); return new Response(JSON.stringify(fx), { status: 200 }); };
  f.calls = calls;
  return f;
}

test('validates the query and needs a key', async () => {
  assert.equal((await liveSearch({ q: 'a', cfg: cfg() })).error, 'invalid_query');
  assert.equal((await liveSearch({ q: 'x'.repeat(81), cfg: cfg() })).error, 'invalid_query');
  assert.equal((await liveSearch({ q: 'ok', page: 11, cfg: cfg() })).error, 'invalid_page');
  assert.equal((await liveSearch({ q: 'ok', cfg: cfg({ key: '' }) })).error, 'not_configured');
});

test('maps provider items, caches repeated queries, never returns the key', async () => {
  const f = fake();
  const r = await liveSearch({ q: 'наушники  <b>', cfg: cfg(), fetchImpl: f });
  assert.equal(r.provider, 'Taobao');
  assert.equal(r.query, 'наушники b');
  assert.ok(r.items.length > 0);
  const it = r.items[0];
  assert.match(it.id, /^[A-Za-z0-9_-]+$/);
  assert.ok(it.title && it.price && it.images.every((u) => u.startsWith('https://')));
  assert.ok(!JSON.stringify(r).includes('SECRET-KEY'));
  assert.match(f.calls[0], /Taobao/);
  await liveSearch({ q: 'наушники  <b>', cfg: cfg(), fetchImpl: f });
  assert.equal(f.calls.length, 1, 'second identical search served from cache');
});

test('daily cap on paid calls', async () => {
  const f = fake();
  for (const q of ['one', 'two']) assert.ok(!(await liveSearch({ q, cfg: cfg(), fetchImpl: f })).error);
  assert.equal((await liveSearch({ q: 'three', cfg: cfg(), fetchImpl: f })).error, 'daily_limit');
});

test('provider errors are reported without details of the request', async () => {
  const f = async () => new Response(JSON.stringify({ ErrorCode: 'InvalidInstanceKey', ErrorDescription: 'bad key SECRET-KEY' }));
  const r = await liveSearch({ q: 'errcase', cfg: cfg({ dailyLimit: 99 }), fetchImpl: f });
  assert.equal(r.error, 'provider_error');
  assert.equal(r.code, 'InvalidInstanceKey');
  assert.ok(!JSON.stringify(r).includes('SECRET'));
});
