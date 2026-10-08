// Live check of the OT Commerce key on YOUR server (the key never leaves the server environment).
// Usage:  put OTAPI_KEY=… in .env, then   npm run otapi:probe -- "wireless earbuds" [--details]
// Costs 1 paid call (search, 3 items) + 1 call with --details. Counts against OTAPI_DAILY_CALL_LIMIT.
// Saves raw responses to $DATA_DIR/otapi-probe/ (git-ignored) so the field mapping can be checked and turned into
// recorded test fixtures, and prints what CARGO ONE would import — without writing to the catalogue.
import fs from 'node:fs';
import path from 'node:path';
import { getDb, dataDir } from '../server/db/index.mjs';
import { createOtapiAdapter } from '../server/catalog/sources/otapi.mjs';
import { normalize } from '../server/catalog/normalizer.mjs';

const args = process.argv.slice(2);
const details = args.includes('--details');
const q = args.filter((a) => !a.startsWith('--')).join(' ') || 'wireless earbuds';
if (!process.env.OTAPI_KEY) { console.error('OTAPI_KEY is not set (add it to .env on the server).'); process.exit(2); }

const outDir = path.join(dataDir(), 'otapi-probe');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const fetchImpl = async (url, init) => {
  const res = await fetch(url, init);
  const text = await res.text();
  const method = new URL(url).pathname.split('/').pop();
  fs.writeFileSync(path.join(outDir, `${stamp}-${method}.json`), text);
  return { status: res.status, json: async () => JSON.parse(text) };
};

const adapter = createOtapiAdapter({
  key: process.env.OTAPI_KEY, secret: process.env.OTAPI_SECRET || undefined, provider: process.env.OTAPI_PROVIDER || 'Aliexpress',
  lang: process.env.OTAPI_LANG || 'ru', dailyLimit: Number.parseInt(process.env.OTAPI_DAILY_CALL_LIMIT || '60', 10), fetchImpl,
});
const db = getDb();
try {
  const items = await adapter.listProducts({ db, q, limit: 3, details, categoryId: null });
  console.log(`Query "${q}": ${items.meta.returned} items returned (total reported: ${items.meta.total ?? 'n/a'})\n`);
  for (const sp of items) {
    let n = null, err = null;
    try { n = normalize({ ...sp, categoryId: sp.categoryId || 'electronics' }); } catch (e) { err = e.code; }
    console.log(`• ${sp.sourceProductId}  ${sp.title?.slice(0, 70)}`);
    console.log(`  price: ${sp.price ? `${sp.price.amount} ${sp.price.currency}` : 'MISSING'} | weight: ${sp.weightG ?? 'MISSING'} g | stock: ${sp.stock ?? 'n/a'} | images: ${sp.images.length} | seller: ${sp.seller?.name ?? 'MISSING'} | variants: ${sp.variants.length} | specs: ${sp.specs.length}`);
    console.log(`  translated (${adapter.lang}): ${Object.values(sp.translations)[0]?.title?.slice(0, 70) ?? '—'}`);
    console.log(`  normalizer: ${err ? 'REJECTED ' + err : `ok, warnings: ${n.warnings.join(', ') || 'none'}`}\n`);
  }
  console.log(`Image hosts seen: ${[...new Set(items.flatMap((s) => s.images).map((u) => { try { return new URL(u).hostname; } catch { return u; } }))].join(', ') || '—'}`);
  console.log(`IMAGE_HOSTS on this server: ${process.env.IMAGE_HOSTS || '(empty: remote images are dropped)'}`);
  console.log(`Calls today: ${adapter.usage(db).callsToday}/${adapter.dailyLimit}. Raw responses saved in ${outDir}`);
} catch (e) {
  console.error(`OT API error: ${e.code || e.message}${e.detail ? ' — ' + e.detail : ''}`);
  process.exitCode = 1;
}
