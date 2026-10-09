// OT Commerce ("OT API") aggregator adapter. A paid third-party data service that returns marketplace listings
// (here: AliExpress) as JSON. It is NOT an official marketplace API; see docs/W2_OTAPI_ALIEXPRESS.md for the
// open questions about data origin and display rights that must be settled before going to production.
//
// Configuration (server environment only — never shipped to the browser):
//   OTAPI_KEY                 instance key (required; adapter is unavailable without it)
//   OTAPI_SECRET              optional; when set, every request is signed (sha256, as in the official client)
//   OTAPI_PROVIDER            provider name, default "Aliexpress"
//   OTAPI_LANG                language for translated titles, default "ru"
//   OTAPI_DAILY_CALL_LIMIT    hard cap of paid calls per UTC day, default 60
//
// Request format (from the official PHP client github.com/OTCommerce/otapiphpclient):
//   GET https://otapi.net/service-json/<Method>?instanceKey=…&language=…[&timestamp=YYYYMMDDHHmmss&signature=…]&…
//   signature = sha256(Method + values of all params sorted by name, concatenated + secret)
import crypto from 'node:crypto';

export const OTAPI_BASE = 'https://otapi.net/service-json/';
const TIMEOUT_MS = 20_000;

export class OtapiError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}

const today = () => new Date().toISOString().slice(0, 10);
const escXml = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

/** Signature exactly like the official client: ksort, implode values, prepend method, append secret, sha256. */
export function signParams(method, params, secret) {
  const keys = Object.keys(params).sort();
  return crypto.createHash('sha256').update(method + keys.map((k) => String(params[k])).join('') + secret).digest('hex');
}

const utcStamp = (d = new Date()) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);

/** SearchItemsParameters XML. Every value is escaped; the query is user input. */
export function searchXml({ q, provider, categoryId, order = 'Default' }) {
  const parts = ['<SearchItemsParameters>'];
  if (provider) parts.push(`<Provider>${escXml(provider)}</Provider>`);
  if (q) parts.push(`<ItemTitle>${escXml(q)}</ItemTitle>`);
  if (categoryId) parts.push(`<CategoryId>${escXml(categoryId)}</CategoryId>`);
  parts.push(`<OrderBy>${escXml(order)}</OrderBy>`, '<Features><Feature Name="IsComplete">true</Feature></Features>', '</SearchItemsParameters>');
  return parts.join('');
}

// ---------------------------------------------------------------- response → SourceProduct
const arr = (v) => (Array.isArray(v) ? v : v && Array.isArray(v.Content) ? v.Content : v && Array.isArray(v.Item) ? v.Item : []);
const str = (v) => (v == null ? null : String(v));
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Decimal string with at most 2 fraction digits from a JSON number (JSON numbers can carry float noise). */
function decimal(v) {
  const n = num(v);
  if (n == null) return null;
  return (Math.round(n * 100) / 100).toFixed(2);
}

function detectLang(text) {
  if (!text) return null;
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  return 'en';
}

/** Presented price in the source currency. Prefers OriginalPrice; falls back to the internal converted price. */
function priceOf(p) {
  if (!p || typeof p !== 'object') return null;
  if (p.OriginalPrice != null && p.OriginalCurrencyCode) return { amount: decimal(p.OriginalPrice), currency: String(p.OriginalCurrencyCode).toUpperCase() };
  const internal = p.ConvertedPriceList?.Internal;
  if (internal && internal.Price != null && internal.Code) return { amount: decimal(internal.Price), currency: String(internal.Code).toUpperCase() };
  return null;
}

function picturesOf(item) {
  const out = [];
  for (const p of arr(item.Pictures)) {
    const u = typeof p === 'string' ? p : p?.Large?.Url || p?.Url || p?.Medium?.Url;
    if (u) out.push(String(u));
  }
  if (!out.length && item.MainPictureUrl) out.push(String(item.MainPictureUrl));
  return [...new Set(out.map((u) => (u.startsWith('//') ? 'https:' + u : u)))];
}

function variantsOf(item, base) {
  const attrs = arr(item.Attributes);
  const name = (pid, vid) => {
    const a = attrs.find((x) => String(x.Pid) === String(pid) && String(x.Vid) === String(vid));
    return a ? `${a.PropertyName ? a.PropertyName + ': ' : ''}${a.Value ?? a.OriginalValue ?? ''}`.trim() : null;
  };
  return arr(item.ConfiguredItems).slice(0, 50).flatMap((c) => {
    const label = arr(c.Configurators).map((k) => name(k.Pid, k.Vid)).filter(Boolean).join(' / ');
    if (!label) return [];
    const p = priceOf(c.Price);
    // Delta only when both prices are known and in the same currency; otherwise the variant has no price difference recorded.
    const delta = p && base && p.currency === base.currency ? (Number(p.amount) - Number(base.amount)).toFixed(2) : null;
    return [{ sku: str(c.Id), name: label, priceDelta: delta, stock: num(c.Quantity) }];
  });
}

/**
 * Maps one OT API item (search result or full info) to a SourceProduct. Pure; unknown values stay null.
 * @param {object} item raw item
 * @param {{source: string, lang: string, categoryId?: string|null, fetchedAt?: string}} ctx
 */
export function mapOtItem(item, ctx) {
  const translated = str(item.Title);
  const original = str(item.OriginalTitle) || translated;
  const origLang = detectLang(original) || 'en';
  // List price (OriginalPrice) is used, not PromotionPrice: promotions are time-limited and often app-only, and an
  // estimate that is too low is worse than one that is too high. MarginPrice is OT's own rounding/markup: ignored.
  const base = priceOf(item.Price);
  const promo = priceOf(item.PromotionPrice);
  const phys = item.PhysicalParameters || {};
  const kg = num(phys.Weight);
  const dims = [num(phys.Length), num(phys.Width), num(phys.Height)];
  const loc = item.Location || {};
  const features = Array.isArray(item.Features) ? item.Features.map(String) : [];
  const fv = Object.fromEntries((Array.isArray(item.FeaturedValues) ? item.FeaturedValues : []).map((f) => [String(f.Name), f.Value]));
  const deleted = features.includes('Deleted') || item.SellDisallowReason === 'IsDeleted';
  const qty = num(item.MasterQuantity);
  const specs = arr(item.Attributes).filter((a) => !a.IsConfigurator && (a.PropertyName || a.OriginalPropertyName))
    .map((a) => ({ name: str(a.PropertyName || a.OriginalPropertyName), value: str(a.Value ?? a.OriginalValue) })).filter((s) => s.value);
  // OT translates titles but usually not descriptions: the description goes with the language it is actually in.
  const desc = str(item.OriginalDescription || item.Description);
  const descText = desc ? desc.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ') : '';
  const descLang = detectLang(descText) || origLang;
  const translations = {};
  if (translated && translated !== original && ['en', 'ru', 'tk'].includes(ctx.lang) && ctx.lang !== origLang) translations[ctx.lang] = { title: translated };
  if (desc && descLang !== origLang && ['en', 'ru', 'tk'].includes(descLang)) translations[descLang] = { ...(translations[descLang] || {}), description: desc };
  return {
    source: ctx.source,
    sourceProductId: str(item.Id),
    url: str(item.ExternalItemUrl || item.TaobaoItemUrl),
    lang: origLang,
    title: original,
    description: desc && descLang === origLang ? desc : null,
    brand: str(item.BrandName),
    categoryId: ctx.categoryId || null,
    categoryHint: [str(item.CategoryName), original, translated].filter(Boolean).join(' '),
    images: picturesOf(item),
    price: base,
    moq: num(item.FirstLotQuantity) ?? 1,
    // 99999 is a placeholder the provider uses when stock is not known.
    stock: qty != null && qty < 99999 ? qty : null,
    availability: deleted || item.IsSellAllowed === false ? 'out_of_stock' : null,
    variants: variantsOf(item, base),
    specs,
    // PhysicalParameters: Weight in kg, dimensions in cm (confirmed on a recorded response: 0.07 kg, 9×9×3 cm earbuds).
    weightG: kg != null && kg > 0 ? Math.round(kg * 1000) : null,
    volumeCm3: dims.every((d) => d != null && d > 0) ? Math.round(dims[0] * dims[1] * dims[2]) : null,
    leadDays: null,
    seller: item.VendorId ? { sellerId: str(item.VendorId), name: str(item.VendorDisplayName || item.VendorName || item.VendorId), city: str(loc.City), province: str(loc.State) } : null,
    translations,
    fetchedAt: ctx.fetchedAt || new Date().toISOString(),
    // The provider serves cached listings ("SearchMethod": "Storage"); this is when IT last refreshed the item.
    sourceUpdatedAt: str(item.LastUpdatedTime || item.UpdatedTime),
    // Provider-side signals kept for traceability only, never shown as CARGO ONE ratings or stock.
    providerSignals: {
      features, deleted, sellDisallowReason: str(item.SellDisallowReason),
      promotionPrice: promo, rating: num(fv.rating), reviews: num(fv.reviews), totalSales: num(fv.TotalSales),
      vendorScore: num(item.VendorScore), rootCategoryId: str(fv.rootCategoryId), externalCategoryId: str(item.ExternalCategoryId),
    },
  };
}

export function searchItemsOf(json) {
  const r = json?.Result ?? json;
  return arr(r?.Items?.Items ?? r?.Items ?? r?.SearchResult?.Items);
}
export function fullItemOf(json) {
  return json?.OtapiItemFullInfo ?? json?.Result?.Item ?? json?.Item ?? null;
}

// ---------------------------------------------------------------- adapter
/**
 * @param {{ key?: string, secret?: string, provider?: string, lang?: string, dailyLimit?: number, fetchImpl?: typeof fetch, id?: string }} cfg
 */
export function createOtapiAdapter(cfg = {}) {
  const provider = cfg.provider || 'Aliexpress';
  const id = cfg.id || `ot-${provider.toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 32);
  const lang = ['ru', 'en'].includes(cfg.lang) ? cfg.lang : 'ru';
  const dailyLimit = Number.isInteger(cfg.dailyLimit) && cfg.dailyLimit > 0 ? cfg.dailyLimit : 60;
  const doFetch = cfg.fetchImpl || ((...a) => fetch(...a));
  const available = !!cfg.key;

  /** Counts a paid call against today's budget before it is made. Throws budget_exhausted when the cap is hit. */
  function spend(db) {
    if (!db) return;
    const day = today();
    db.prepare('INSERT INTO source_call_log (source, day, calls) VALUES (?, ?, 0) ON CONFLICT(source, day) DO NOTHING').run(id, day);
    const row = db.prepare('SELECT calls FROM source_call_log WHERE source = ? AND day = ?').get(id, day);
    if (row.calls >= dailyLimit) throw new OtapiError('budget_exhausted', `${row.calls}/${dailyLimit}`);
    db.prepare('UPDATE source_call_log SET calls = calls + 1 WHERE source = ? AND day = ?').run(id, day);
  }
  function noteError(db, code) {
    if (!db) return;
    db.prepare('UPDATE source_call_log SET errors = errors + 1, last_error = ? WHERE source = ? AND day = ?').run(code, id, today());
  }

  async function call(db, method, params) {
    spend(db);
    const p = { ...params, instanceKey: cfg.key, language: lang };
    if (cfg.secret) { p.timestamp = utcStamp(); p.signature = signParams(method, p, cfg.secret); }
    const url = OTAPI_BASE + method + '?' + new URLSearchParams(p).toString();
    let res;
    try { res = await doFetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) }); }
    catch (e) { noteError(db, 'network_error'); throw new OtapiError('network_error', e?.name === 'TimeoutError' ? 'timeout' : 'fetch_failed'); }
    let json;
    try { json = await res.json(); } catch { noteError(db, 'bad_response'); throw new OtapiError('bad_response', `HTTP ${res.status}`); }
    if (json?.ErrorCode && json.ErrorCode !== 'Ok') {
      noteError(db, json.ErrorCode);
      // ErrorDescription is provider text: kept short and never echoed with the key.
      throw new OtapiError(String(json.ErrorCode).slice(0, 64), String(json.ErrorDescription || '').slice(0, 200));
    }
    return json;
  }

  return {
    id, kind: 'aggregator_api', live: available, available,
    label: `${provider === 'Aliexpress' ? 'AliExpress' : provider} · via OT Commerce`,
    reason: available ? undefined : 'not_configured',
    provider, lang, dailyLimit,
    usage(db) {
      const r = db.prepare('SELECT calls, errors, last_error FROM source_call_log WHERE source = ? AND day = ?').get(id, today());
      return { callsToday: r?.calls ?? 0, errorsToday: r?.errors ?? 0, lastError: r?.last_error ?? null, dailyLimit };
    },
    /**
     * Search import. One paid call per page of results; with `details`, one more call per item (stops early when
     * the daily budget runs out and keeps the search data for the remaining items).
     * @param {{ db, q: string, limit?: number, categoryId?: string|null, details?: boolean }} opts
     */
    async listProducts(opts = {}) {
      if (!available) throw new OtapiError('not_configured');
      const q = String(opts.q || '').trim();
      if (!q) throw new OtapiError('query_required');
      // Up to 200 items per query: pages of 40 (one paid call each), stopping early when the source runs out.
      const limit = Math.min(200, Math.max(1, Number(opts.limit) || 20));
      const PAGE = 40;
      const fetchedAt = new Date().toISOString();
      let json = null;
      const items = [];
      let pagesStopped = null;
      for (let pos = 0; pos < limit; pos += PAGE) {
        const size = Math.min(PAGE, limit - pos);
        let page;
        try { page = await call(opts.db, 'BatchSearchItemsFrame', { framePosition: pos, frameSize: size, blockList: '', xmlParameters: searchXml({ q, provider }) }); }
        catch (e) { if (pos > 0 && e.code === 'budget_exhausted') { pagesStopped = e.code; break; } throw e; }
        json = json || page;
        const got = searchItemsOf(page);
        items.push(...got.slice(0, size));
        if (got.length < size) break;
      }
      const seen = new Set();
      for (let i = items.length - 1; i >= 0; i--) { const k = String(items[i]?.Id); if (seen.has(k)) items.splice(i, 1); else seen.add(k); }
      const out = [];
      let detailsStopped = null;
      for (const it of items) {
        let full = it;
        if (opts.details && !detailsStopped && it?.Id != null) {
          try { full = { ...it, ...(fullItemOf(await call(opts.db, 'BatchGetItemFullInfo', { itemId: String(it.Id), blockList: 'Description' })) || {}) }; }
          catch (e) { if (e.code === 'budget_exhausted') detailsStopped = e.code; else full = it; }
        }
        out.push(mapOtItem(full, { source: id, lang, categoryId: opts.categoryId || null, fetchedAt }));
      }
      out.meta = { query: q, returned: items.length, pagesStopped, total: num(json?.Result?.Items?.Items?.TotalCount ?? json?.Result?.Items?.TotalCount ?? json?.Result?.TotalCount), detailsStopped };
      return out;
    },
  };
}

/** Adapter configured from the server environment. */
export function otapiFromEnv(env = process.env) {
  return createOtapiAdapter({
    key: (env.OTAPI_KEY || '').trim() || undefined,
    secret: (env.OTAPI_SECRET || '').trim() || undefined,
    provider: (env.OTAPI_PROVIDER || 'Aliexpress').trim(),
    lang: (env.OTAPI_LANG || 'ru').trim(),
    dailyLimit: Number.parseInt(env.OTAPI_DAILY_CALL_LIMIT || '60', 10),
  });
}
