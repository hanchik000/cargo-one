// Automatic first import of real products + real car-model photos (no network: fake adapter / recorded-shape JSON).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDb } from '../server/db/index.mjs';
import { seedCatalog } from '../server/catalog/seed.mjs';
import { fixtureAdapter } from '../server/catalog/sources/fixture.mjs';
import { autoSeed } from '../server/catalog/autoseed.mjs';
import { pickPhotos, isCommonsImage, CAR_PHOTO_QUERIES } from '../server/car-photos.mjs';
import { candidates } from '../server/image-proxy.mjs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cargo-autoseed-'));
const db = getDb(':memory:');
seedCatalog(db);

function fakeAggregator({ failOn } = {}) {
  let calls = 0;
  return {
    id: 'ot-aliexpress', kind: 'aggregator_api', available: true, get calls() { return calls; },
    async listProducts({ q, categoryId }) {
      calls++;
      if (q === failOn) { const e = new Error('daily_budget_exhausted'); e.code = 'daily_budget_exhausted'; throw e; }
      const base = await fixtureAdapter.listProducts();
      return base.slice(0, 2).map((p) => ({ ...p, sourceProductId: `${q.replace(/\W/g, '')}-${p.sourceProductId}`, categoryId }));
    },
  };
}
const published = (sql) => db.prepare(sql).get().n;
const QUERIES = [['earbuds', 'electronics'], ['hoodie', 'fashion'], ['drill', 'tools']];

test('autoseed: stops on a paid-call error, resumes next time, publishes real items and hides demo once', async () => {
  const a1 = fakeAggregator({ failOn: 'hoodie' });
  const r1 = await autoSeed(db, { adapter: a1, queries: QUERIES, log: () => {} });
  assert.equal(r1.stopped, 'hoodie');
  assert.equal(published("SELECT COUNT(*) AS n FROM products WHERE demo = 1 AND status = 'published'"), 40, 'demo stays until finished');

  const a2 = fakeAggregator();
  const r2 = await autoSeed(db, { adapter: a2, queries: QUERIES, log: () => {} });
  assert.equal(a2.calls, 2, 'already-done query is not paid for again');
  assert.equal(r2.published, 6);
  assert.equal(published("SELECT COUNT(*) AS n FROM products WHERE origin = 'imported' AND status = 'published'"), 6);
  assert.equal(published("SELECT COUNT(*) AS n FROM products WHERE demo = 1 AND status = 'published'"), 0, 'demo hidden (reversibly)');

  const a3 = fakeAggregator();
  assert.equal((await autoSeed(db, { adapter: a3, queries: QUERIES, log: () => {} })).skipped, 'already_done');
  assert.equal(a3.calls, 0);
});

test('autoseed: no key → nothing happens', async () => {
  assert.equal((await autoSeed(db, { adapter: { available: false }, log: () => {} })).skipped, 'no_key');
});

const page = (title, extra = {}) => ({
  title: 'File:' + title, index: extra.index ?? 1,
  imageinfo: [{ thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(title)}/1280px-x.jpg`,
    descriptionurl: 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(title), width: extra.width ?? 4000, height: extra.height ?? 2400,
    mime: extra.mime ?? 'image/jpeg', extmetadata: { Artist: { value: extra.artist ?? '<a href="//x">Jane <b>Doe</b></a>' }, LicenseShortName: { value: extra.license ?? 'CC BY-SA 4.0' } } }],
});

test('car photos: free-licence exterior shots first, one interior last, junk filtered', () => {
  const json = { query: { pages: {
    1: page('BYD Seal 001.jpg', { index: 1 }),
    2: page('BYD Seal logo.jpg', { index: 2 }),
    3: page('BYD Seal interior.jpg', { index: 3, height: 3000 }),
    4: page('BYD Seal 002.jpg', { index: 4, license: 'Fair use' }),
    5: page('BYD Seal 003.jpg', { index: 5, width: 600, height: 400 }),
    6: page('BYD Seal design 2.jpg', { index: 6 }),
    7: page('BYD Seal portrait.jpg', { index: 7, width: 2000, height: 3000 }),
    8: page('BYD Seal 004.png', { index: 8, mime: 'image/tiff' }),
  } } };
  const got = pickPhotos(json);
  assert.deepEqual(got.map((p) => p.page.split('File:')[1]), ['BYD%20Seal%20001.jpg', 'BYD%20Seal%20design%202.jpg', 'BYD%20Seal%20interior.jpg']);
  assert.equal(got[0].author, 'Jane Doe');
  assert.equal(got[0].license, 'CC BY-SA 4.0');
  assert.equal(got.at(-1).interior, true);
  assert.deepEqual(pickPhotos({}), []);
});

test('car photos: proxy accepts only Commons uploads; every demo car has queries', () => {
  assert.equal(isCommonsImage('https://upload.wikimedia.org/wikipedia/commons/a/ab/x.jpg'), true);
  assert.equal(isCommonsImage('http://upload.wikimedia.org/x.jpg'), false);
  assert.equal(isCommonsImage('https://upload.wikimedia.org.evil.com/x.jpg'), false);
  assert.equal(isCommonsImage('https://user:pw@upload.wikimedia.org/x.jpg'), false);
  assert.equal(isCommonsImage('https://commons.wikimedia.org/wiki/File:x.jpg'), false);
  assert.equal(Object.keys(CAR_PHOTO_QUERIES).length, 14);
  assert.deepEqual(candidates('https://upload.wikimedia.org/a.jpg'), ['https://upload.wikimedia.org/a.jpg']);
});
