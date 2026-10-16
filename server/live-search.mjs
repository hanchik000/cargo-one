// Live marketplace search through OT Commerce (Taobao by default): any query, results straight from the provider.
// Runs where the key lives — the CARGO ONE server (/api/live-search) or a Vercel serverless function
// (api/live-search.mjs) for the static GitHub Pages site. The key never reaches the browser.
// Each uncached search costs one paid OT call: results are cached (12 h), requests are rate-limited per IP,
// and LIVE_DAILY_LIMIT caps the paid calls per instance per day.
import { OTAPI_BASE, searchXml, searchItemsOf, mapOtItem } from './catalog/sources/otapi.mjs';
import { mapCategory } from './catalog/normalizer.mjs';

const CACHE_MS = 12 * 3600_000;
const PAGE_SIZE = 24;
const cache = new Map();
const hits = new Map();
let day = '', spent = 0;

export const liveConfig = (env = process.env) => ({
  key: (env.OTAPI_KEY || '').trim(),
  provider: (env.LIVE_PROVIDER || env.OTAPI_PROVIDER || 'Taobao').trim(),
  lang: (env.OTAPI_LANG || 'ru').trim(),
  dailyLimit: Number.parseInt(env.LIVE_DAILY_LIMIT || '200', 10),
  origins: ['https://hanchik000.github.io', ...(env.LIVE_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)],
});

const clean = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim();

/** One search page → compact items for the storefront (no raw provider payload). */
export async function liveSearch({ q, page = 1, cfg = liveConfig(), fetchImpl = fetch }) {
  const query = clean(q);
  if (query.length < 2 || query.length > 80) return { error: 'invalid_query', status: 400 };
  if (!Number.isInteger(page) || page < 1 || page > 10) return { error: 'invalid_page', status: 400 };
  if (!cfg.key) return { error: 'not_configured', status: 503 };
  const ck = `${cfg.provider}|${cfg.lang}|${query.toLowerCase()}|${page}`;
  const c = cache.get(ck);
  if (c && Date.now() - c.at < CACHE_MS) return c.data;
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; spent = 0; }
  if (spent >= cfg.dailyLimit) return { error: 'daily_limit', status: 429 };
  spent++;
  const p = { instanceKey: cfg.key, language: cfg.lang, framePosition: (page - 1) * PAGE_SIZE, frameSize: PAGE_SIZE, blockList: '', xmlParameters: searchXml({ q: query, provider: cfg.provider }) };
  let json;
  try {
    const r = await fetchImpl(OTAPI_BASE + 'BatchSearchItemsFrame?' + new URLSearchParams(p), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    json = await r.json();
  } catch { return { error: 'provider_unreachable', status: 502 }; }
  if (json?.ErrorCode && json.ErrorCode !== 'Ok') return { error: 'provider_error', code: String(json.ErrorCode).slice(0, 64), status: 502 };
  const fetchedAt = new Date().toISOString();
  const items = searchItemsOf(json).map((it) => {
    const sp = mapOtItem(it, { source: 'ot-live', lang: cfg.lang, fetchedAt });
    const t = sp.translations?.[cfg.lang]?.title;
    return {
      id: String(sp.sourceProductId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48),
      title: clean(t || sp.title).slice(0, 300), originalTitle: t ? clean(sp.title).slice(0, 300) : null,
      images: sp.images.filter((u) => /^https:\/\//.test(u)).slice(0, 8),
      price: sp.price, url: sp.url && /^https:\/\//.test(sp.url) ? sp.url : null,
      moq: sp.moq, stock: sp.stock, availability: sp.availability, weightG: sp.weightG, volumeCm3: sp.volumeCm3,
      seller: sp.seller ? { id: sp.seller.sellerId, name: clean(sp.seller.name).slice(0, 80) } : null,
      brand: sp.brand ? clean(sp.brand).slice(0, 60) : null,
      categoryId: mapCategory(sp.categoryHint) || 'home',
      specs: sp.specs.slice(0, 16).map((s) => [clean(s.name).slice(0, 60), clean(s.value).slice(0, 120)]),
      sourceUpdatedAt: sp.sourceUpdatedAt,
    };
  }).filter((x) => x.id && x.title && x.price);
  const total = Number(json?.Result?.Items?.Items?.TotalCount ?? json?.Result?.Items?.TotalCount ?? 0) || null;
  const data = { provider: cfg.provider, query, page, pageSize: PAGE_SIZE, total, hasMore: items.length >= PAGE_SIZE * 0.8 && page < 10, fetchedAt, items };
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  cache.set(ck, { at: Date.now(), data });
  return data;
}

function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > 30;
}

/** Node HTTP handler (CARGO ONE server and Vercel function). */
export async function handleLiveSearch(req, res, url, cfg = liveConfig()) {
  const origin = req.headers.origin;
  const headers = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
  if (origin && cfg.origins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  const send = (status, body, cacheable) => {
    res.writeHead(status, { ...headers, 'Cache-Control': cacheable ? 'public, max-age=600, s-maxage=43200, stale-while-revalidate=86400' : 'no-store' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...headers, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' }); return res.end(); }
  if (req.method !== 'GET') return send(405, { error: 'method_not_allowed' });
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  if (limited(ip)) return send(429, { error: 'rate_limited' });
  const r = await liveSearch({ q: url.searchParams.get('q'), page: Number(url.searchParams.get('page') || 1), cfg });
  if (r.error) return send(r.status || 400, { error: r.error, code: r.code });
  return send(200, r, true);
}
