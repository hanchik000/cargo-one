// Builds catalog.json for the GitHub Pages site: starts the real server (same import pipeline, same validation),
// lets the automatic first import fetch real AliExpress listings through OT Commerce (OTAPI_KEY), then exports what
// an admin would see — real products published, demo products hidden as drafts — plus suppliers and pricing.
// No key or session ever goes into the output. Usage (CI): OTAPI_KEY=… DATA_DIR=… node scripts/export-pages-catalog.mjs out.json
// CATALOG_REFRESH=1 runs the import again even when a previous one finished (the data dir is cached between runs).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { candidates } from '../server/image-proxy.mjs';

const out = process.argv[2] || 'pages/catalog.json';
const DATA = path.resolve(process.env.DATA_DIR || '.data-pages');
const PORT = 4700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;

// status.json next to the output: what happened, for diagnosis without CI log access (no key, no session inside).
const statusFile = path.join(path.dirname(path.resolve(out)), 'status.json');
const writeStatus = (s) => { try { fs.mkdirSync(path.dirname(statusFile), { recursive: true }); fs.writeFileSync(statusFile, JSON.stringify({ at: new Date().toISOString(), ...s }, null, 1)); } catch { /* best effort */ } };
if (!process.env.OTAPI_KEY) { writeStatus({ result: 'no_key' }); console.log('OTAPI_KEY is not set: no real products, the site keeps its demo catalogue.'); process.exit(0); }
fs.mkdirSync(DATA, { recursive: true });
if (process.env.CATALOG_REFRESH === '1') fs.rmSync(path.join(DATA, 'autoseed.json'), { force: true });

const server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.mjs'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: DATA, CAR_PHOTOS: '0', SITE_PASSWORD_SHA256: '', AUTH_SECRET: 'export-' + Math.random(), IMAGE_HOSTS: process.env.IMAGE_HOSTS || 'alicdn.com,aliexpress-media.com' },
  stdio: ['ignore', 'inherit', 'inherit'],
});
const stop = (code) => { server.kill(); process.exit(code); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; ; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch { /* starting */ } if (i > 100) throw new Error('server did not start'); await sleep(200); }
  // Wait for the automatic import (17 searches) to finish or stop.
  const state = () => { try { return JSON.parse(fs.readFileSync(path.join(DATA, 'autoseed.json'), 'utf8')); } catch { return null; } };
  const t0 = Date.now();
  let lastDone = -1, idleSince = Date.now();
  while (Date.now() - t0 < 15 * 60_000) {
    const s = state();
    if (s?.finishedAt) break;
    const done = s?.done?.length ?? 0;
    if (done !== lastDone) { lastDone = done; idleSince = Date.now(); }
    if (Date.now() - idleSince > 90_000) { console.log('import stopped early (budget or network) — exporting what was imported'); break; }
    await sleep(2000);
  }
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: 'admin@cargo.one', password: 'demo1234' }) });
  if (!login.ok) throw new Error('login failed ' + login.status);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const get = async (p) => { const r = await fetch(BASE + p, { headers: { cookie } }); if (!r.ok) throw new Error(`${p} → ${r.status}`); return r.json(); };
  const products = [];
  for (let page = 1; page <= 50; page++) {
    const r = await get(`/api/catalog/products?lang=ru&sort=newest&includeUnpublished=1&pageSize=500&page=${page}`);
    products.push(...r.items);
    if (!r.hasMore) break;
  }
  // The static site links photos directly (no image proxy): use the original file instead of a resized CDN variant
  // ("…jpg_600x600.jpg"), which often no longer exists.
  for (const p of products) for (const im of p.images || []) if (typeof im.src === 'string' && /^https:\/\//.test(im.src)) im.src = candidates(im.src).at(-1);
  const real = products.filter((p) => p.origin === 'imported' && p.status === 'published' && !p.sample).length;
  const sources = await get('/api/admin/catalog/sources').catch(() => null);
  const ot = sources?.adapters?.find((a) => a.kind === 'aggregator_api') || null;
  const runs = (sources?.runs || []).slice(0, 5).map((r) => ({ status: r.status, created: r.created, updated: r.updated, unchanged: r.unchanged, failed: r.failed, errors: (r.errors || []).slice(0, 3) }));
  const diag = { autoseed: state(), adapter: ot && { available: ot.available, reason: ot.reason, usage: ot.usage, stats: ot.stats }, runs, real, total: products.length };
  if (!real) { writeStatus({ result: 'no_real_products', ...diag }); console.log('no real products imported — catalog.json not written (demo stays)'); stop(0); }
  writeStatus({ result: 'ok', ...diag });
  const { suppliers } = await get('/api/catalog/suppliers?lang=ru');
  const pricing = await get('/api/catalog/pricing?lang=ru');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), source: `OT Commerce (${process.env.OTAPI_PROVIDER || 'Aliexpress'}), cached listings`, pricing, suppliers, products }));
  console.log(`✓ ${out}: ${real} real products (${products.length} incl. hidden demo), ${suppliers.length} suppliers`);
  stop(0);
} catch (e) {
  writeStatus({ result: 'error', error: String(e.message).slice(0, 300) });
  console.error('export failed:', e.message);
  stop(1);
}
