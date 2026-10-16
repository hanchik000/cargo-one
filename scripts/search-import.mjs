// "Find on Taobao" request from the static site (a GitHub issue "search: <query>" by the repository owner):
// imports one page of live results for the query through the normal pipeline, publishes them and tags them with the
// query so the site's own search finds them. Runs in CI before export-pages-catalog.mjs. One paid OT call.
// Usage: SEARCH_QUERY="кроссовки" OTAPI_KEY=… OTAPI_PROVIDER=Taobao DATA_DIR=… node scripts/search-import.mjs result.json
import fs from 'node:fs';

const out = process.argv[2] || 'search-result.json';
const q = String(process.env.SEARCH_QUERY || '').replace(/^\s*search:\s*/i, '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();
const write = (r) => fs.writeFileSync(out, JSON.stringify({ query: q, ...r }));
if (q.length < 2 || q.length > 80) { write({ ok: false, error: 'invalid_query' }); process.exit(0); }

const { catalogDb } = await import('../server/catalog/api.mjs');
const { ADAPTERS } = await import('../server/catalog/sources/adapter.mjs');
const { runImport } = await import('../server/catalog/importer.mjs');
const { publishImported } = await import('../server/catalog/storefront.mjs');
const { mapCategory } = await import('../server/catalog/normalizer.mjs');

const db = catalogDb();
const base = ADAPTERS.find((a) => a.kind === 'aggregator_api');
if (!base?.available) { write({ ok: false, error: 'no_key' }); process.exit(0); }
// Results of a free-text search have no single category: each item gets its own from the provider's category/title.
const adapter = { ...base, async listProducts(o) { const l = await base.listProducts(o); for (const sp of l) sp.categoryId = sp.categoryId || mapCategory(sp.categoryHint) || 'home'; return l; } };
const r = await runImport(db, adapter, { actor: 'system:search', q, limit: 40, details: false });
if (r.error || r.status === 'failed') { write({ ok: false, error: r.error || r.errors?.[0]?.code || 'failed', detail: r.errors?.[0]?.detail || null }); process.exit(0); }
const published = publishImported(db, r.items, 'system:search', r.id);
const ids = [...new Set(r.items.filter((i) => i.productId && i.outcome !== 'failed').map((i) => i.productId))];
const tag = db.prepare("UPDATE products SET keywords = json_insert(COALESCE(keywords, '[]'), '$[#]', ?) WHERE id = ? AND NOT EXISTS (SELECT 1 FROM json_each(COALESCE(products.keywords, '[]')) WHERE value = ?)");
for (const id of ids) tag.run(q.toLowerCase(), id, q.toLowerCase());
write({ ok: true, found: ids.length, published, total: r.meta?.total ?? null });
console.log(`✓ "${q}": ${ids.length} products (${published} newly published)`);
