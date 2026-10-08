// ProductNormalizer: SourceProduct (untrusted, source-shaped) → NormalizedProduct (validated, catalogue-shaped).
// Fatal problems throw ImportError; recoverable ones are returned as warnings.
import crypto from 'node:crypto';
import { MINOR_DIGITS, isCurrency, toMinor } from '../../src/shared/pricing.mjs';
import { cleanText, safeHttpsUrl, safeImageUrl, isLang } from './sanitize.mjs';

export class ImportError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail; }
}

// Source category path → CARGO ONE category. Order matters (kids before fashion). Unmapped → ImportError.
const CATEGORY_RULES = [
  ['kids', /儿童|玩具|母婴|童装|kids|toy|baby|children/i],
  ['electronics', /数码|电子|耳机|手机|数据线|充电|配件|electronic|headphone|earbud|phone|charger|cable|accessor/i],
  ['beauty', /美妆|护肤|化妆|beauty|cosmetic|skincare/i],
  ['fashion', /服装|服饰|鞋|箱包|帽|apparel|fashion|clothing|shoe|bag|cap/i],
  ['home', /家居|厨房|水杯|保温|灯|床|home|kitchen|lighting|lamp|cup|bedding/i],
  ['tools', /工具|五金|tool|hardware|drill/i],
  ['industrial', /工业|industrial|machinery/i],
  ['auto', /汽车|车载|auto|car /i],
  ['business', /包装|办公|packag|office|label/i],
];
export const CATEGORY_IDS = new Set(CATEGORY_RULES.map(([id]) => id));
export function mapCategory(hint) {
  if (!hint) return null;
  for (const [id, re] of CATEGORY_RULES) if (re.test(hint)) return id;
  return null;
}

const int = (v, min = 0, max = 1e9) => (Number.isInteger(v) && v >= min && v <= max ? v : null);
const MAX_PRICE_MINOR = 1_000_000_000; // 10 million in major units

/** Stable hash of the raw record (without fetchedAt) to detect unchanged listings. */
export function rawHash(sp) {
  const { fetchedAt, ...rest } = sp;
  const stable = (v) => (Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])])) : v);
  return crypto.createHash('sha256').update(JSON.stringify(stable(rest))).digest('hex');
}

export function normalize(sp) {
  const warnings = [];
  if (!sp || typeof sp !== 'object') throw new ImportError('invalid_record');
  const source = typeof sp.source === 'string' && /^[a-z0-9_-]{1,32}$/.test(sp.source) ? sp.source : null;
  const sourceProductId = typeof sp.sourceProductId === 'string' && sp.sourceProductId.trim().length > 0 && sp.sourceProductId.length <= 128 ? sp.sourceProductId.trim() : null;
  if (!source || !sourceProductId) throw new ImportError('missing_identity');
  const lang = ['zh', 'en', 'ru', 'tk'].includes(sp.lang) ? sp.lang : 'zh';

  const title = cleanText(sp.title, 300);
  if (!title) throw new ImportError('missing_title');
  // An operator may assign the category for a whole import (e.g. a search query); otherwise it is mapped from the hint.
  const categoryId = CATEGORY_IDS.has(sp.categoryId) ? sp.categoryId : mapCategory(String(sp.categoryHint || ''));
  if (!categoryId) throw new ImportError('category_unmapped', String(sp.categoryHint || ''));

  // Price: missing is allowed (shown as "price unavailable"); present-but-invalid is an error for this record.
  let price = null;
  if (sp.price != null) {
    if (!isCurrency(sp.price.currency) || sp.price.currency === 'TMT') throw new ImportError('unsupported_currency', String(sp.price.currency));
    const minor = toMinor(sp.price.amount, MINOR_DIGITS[sp.price.currency]);
    if (minor == null || minor <= 0 || minor > MAX_PRICE_MINOR) throw new ImportError('invalid_price', String(sp.price.amount));
    price = { minor, currency: sp.price.currency };
  } else warnings.push('missing_price');

  const texts = [{ lang, field: 'title', value: title, machine: false }];
  const desc = cleanText(sp.description, 4000);
  if (desc) texts.push({ lang, field: 'description', value: desc, machine: false });
  for (const [l, tr] of Object.entries(sp.translations || {})) {
    if (!isLang(l) || l === lang || !tr) continue;
    const tt = cleanText(tr.title, 300); const td = cleanText(tr.description, 4000);
    if (tt) texts.push({ lang: l, field: 'title', value: tt, machine: true });
    if (td) texts.push({ lang: l, field: 'description', value: td, machine: true });
  }

  const rawImages = Array.isArray(sp.images) ? sp.images : [];
  const images = rawImages.map(safeImageUrl).filter(Boolean).slice(0, 12).map((url) => ({ url }));
  if (images.length < rawImages.length) warnings.push(`dropped_images:${rawImages.length - images.length}`);

  const variants = (Array.isArray(sp.variants) ? sp.variants : []).slice(0, 50).flatMap((v, i) => {
    const name = cleanText(v?.name, 80); if (!name) return [];
    const delta = v.priceDelta == null ? 0 : toMinor(v.priceDelta, 2);
    if (delta == null || Math.abs(delta) > MAX_PRICE_MINOR) { warnings.push(`invalid_variant_price:${i}`); return []; }
    return [{ sku: cleanText(v.sku, 64), name, priceDeltaMinor: delta, stock: int(v.stock) }];
  });
  const specs = (Array.isArray(sp.specs) ? sp.specs : []).slice(0, 40).flatMap((s) => {
    const name = cleanText(s?.name, 80), value = cleanText(s?.value, 200);
    return name && value ? [{ name, value }] : [];
  });

  const weightG = int(sp.weightG, 1, 2_000_000);
  if (weightG == null) warnings.push('missing_weight');
  const stock = int(sp.stock);
  const availability = sp.availability === 'in_stock' || sp.availability === 'out_of_stock' ? sp.availability
    : stock == null ? 'unknown' : stock > 0 ? 'in_stock' : 'out_of_stock';

  const seller = sp.seller && typeof sp.seller === 'object' && typeof sp.seller.sellerId === 'string' && cleanText(sp.seller.name, 120)
    ? { sellerId: sp.seller.sellerId.slice(0, 64), name: cleanText(sp.seller.name, 120), nameCn: cleanText(sp.seller.nameCn, 120), city: cleanText(sp.seller.city, 60), province: cleanText(sp.seller.province, 60) }
    : null;
  if (!seller) warnings.push('missing_seller');

  const url = sp.url == null ? null : safeHttpsUrl(sp.url);
  if (sp.url != null && !url) warnings.push('invalid_url');

  return {
    source, sourceProductId, url, lang, categoryId,
    brand: cleanText(sp.brand, 80), texts, images, price, variants, specs,
    moq: int(sp.moq, 1, 1_000_000) ?? 1, stock, availability,
    weightG, volumeCm3: int(sp.volumeCm3, 1, 100_000_000), leadDays: int(sp.leadDays, 0, 365),
    seller, rawHash: rawHash(sp), raw: sp, fetchedAt: typeof sp.fetchedAt === 'string' ? sp.fetchedAt : new Date().toISOString(),
    sourceUpdatedAt: typeof sp.sourceUpdatedAt === 'string' && !Number.isNaN(Date.parse(sp.sourceUpdatedAt)) ? new Date(sp.sourceUpdatedAt).toISOString() : null,
    warnings,
  };
}
