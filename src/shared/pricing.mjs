// CARGO ONE pricing core — shared by the Node server and the web client (one implementation).
//
// Money is handled as integer MINOR units (tenge for TMT, fen for CNY, cents for USD) using BigInt for every
// multiplication, with a single half-up rounding per step. No binary floating point touches an amount.
// Rates and percentages are decimal STRINGS ("0.49", "28.00") or integer basis points (500 = 5%).
//
// Every result is an ESTIMATE until a confirmed quote exists (W2+). If a required input is missing the result
// says so (`status`, `missing`) and the total is null — a final price is never fabricated.

/** Supported currencies and their minor-unit exponent. */
export const MINOR_DIGITS = Object.freeze({ TMT: 2, CNY: 2, USD: 2 });
export const isCurrency = (c) => typeof c === 'string' && Object.prototype.hasOwnProperty.call(MINOR_DIGITS, c);

const DEC_RE = /^\s*([+-]?)(\d+)(?:\.(\d+))?\s*$/;

/** Parses a decimal string (or a safe JS number) into { n: BigInt, scale } exactly. Returns null when invalid. */
export function parseDecimal(value) {
  if (typeof value === 'bigint') return { n: value, scale: 0 };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    // Numbers come from JSON/UI; their shortest round-trip string is the intended decimal ("0.49", not 0.48999…).
    value = String(value);
    if (/e/i.test(value)) return null;
  }
  if (typeof value !== 'string') return null;
  const m = DEC_RE.exec(value);
  if (!m) return null;
  const frac = m[3] || '';
  if (frac.length > 12) return null;
  const n = BigInt((m[1] === '-' ? '-' : '') + m[2] + frac);
  return { n, scale: frac.length };
}

const P10 = (k) => 10n ** BigInt(k);

/** Divides with half-up rounding (away from zero on .5). */
export function divRound(num, den) {
  if (den === 0n) throw new RangeError('division by zero');
  const neg = (num < 0n) !== (den < 0n);
  const a = num < 0n ? -num : num, b = den < 0n ? -den : den;
  const q = a / b, r = a % b;
  const out = r * 2n >= b ? q + 1n : q;
  return neg ? -out : out;
}

const toSafe = (big) => {
  if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < -BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('amount out of range');
  return Number(big);
};

/** Converts a major-unit decimal ("189.5" CNY) to minor units (18950). Null when invalid. */
export function toMinor(value, digits = 2) {
  const d = parseDecimal(value);
  if (!d) return null;
  return toSafe(divRound(d.n * P10(digits), P10(d.scale)));
}

/** Minor units → major-unit number, for DISPLAY ONLY (formatting). Never feed the result back into arithmetic. */
export const minorToMajor = (minor, digits = 2) => (minor == null ? null : minor / 10 ** digits);

/** amountMinor (currency A) × rate (A→B, decimal string) → minor units of B, half-up. Both currencies must use the same exponent. */
export function convertMinor(amountMinor, rate) {
  const r = parseDecimal(rate);
  if (!Number.isInteger(amountMinor) || !r || r.n <= 0n) return null;
  return toSafe(divRound(BigInt(amountMinor) * r.n, P10(r.scale)));
}

/** amountMinor × bps / 10 000, half-up. */
export function applyBps(amountMinor, bps) {
  if (!Number.isInteger(amountMinor) || !Number.isInteger(bps) || bps < 0) return null;
  return toSafe(divRound(BigInt(amountMinor) * BigInt(bps), 10000n));
}

/** Percentage (number or decimal string, e.g. 5 or "2.5") → basis points. */
export function pctToBps(pct) {
  const d = parseDecimal(pct);
  if (!d || d.n < 0n) return null;
  return toSafe(divRound(d.n * 100n, P10(d.scale)));
}

/** Chargeable weight in grams: max(actual, volumetric) with a divisor in kg per m³ (167 = 1:6000 cm³/kg). */
export function chargeableGrams(weightG, volumeCm3, kgPerM3 = 167) {
  if (!Number.isInteger(weightG) || weightG < 0) return null;
  const vol = Number.isInteger(volumeCm3) && volumeCm3 > 0 ? toSafe(divRound(BigInt(volumeCm3) * BigInt(kgPerM3), 1000n)) : 0;
  return Math.max(weightG, vol);
}

/** grams × rate per kg (TMT decimal string) → TMT minor, half-up. */
export function perKgMinor(grams, ratePerKg) {
  const r = parseDecimal(ratePerKg);
  if (!Number.isInteger(grams) || grams < 0 || !r || r.n < 0n) return null;
  // grams * (rate * 100 tenge) / 1000
  return toSafe(divRound(BigInt(grams) * r.n * 100n, P10(r.scale) * 1000n));
}

/**
 * Pricing configuration. All fields are required; the server stores them in `pricing_config`, the client
 * derives them from Admin → Settings. `tariffIsDemo` marks logistics rates that are not carrier quotes.
 * @typedef {{
 *   fx: Record<string, { rate: string, asOf?: string|null, source?: string|null }>,
 *   serviceFeeBps: number, vipFeeBps: number, marginBps: number, dutyEstimateBps: number,
 *   cargoRatePerKg: string, expressRatePerKg: string, minCargo: string, volumetricKgPerM3?: number,
 *   tariffIsDemo: boolean,
 * }} PricingConfig
 */

/**
 * Estimates the landed price in TMT for one or more lines.
 * Line: { amount: decimal string|number (major units, per unit) | null, currency, qty, weightG|null, volumeCm3|null, weightEstimated? }
 * Options: { vip?: boolean, delivery?: 'standard'|'express', knownChargesMinor?: number }
 */
export function estimate(lines, cfg, opts = {}) {
  const missing = new Set();
  const out = {
    currency: 'TMT', confirmed: false, status: 'estimate',
    source: null, fx: null,
    goodsMinor: null, serviceFeeMinor: null, marginMinor: null,
    logistics: { knownMinor: opts.knownChargesMinor ?? 0, estimatedMinor: null, chargeableGrams: null, weightEstimated: false, tariffIsDemo: !!cfg.tariffIsDemo, mode: opts.delivery === 'express' ? 'express' : 'standard' },
    dutiesEstimatedMinor: null, otherMinor: 0, totalMinor: null, missing: [],
  };
  if (!Array.isArray(lines) || !lines.length) { out.status = 'unavailable'; out.missing = ['lines']; return out; }

  let goods = 0, grams = 0, gramsKnown = true;
  for (const l of lines) {
    const qty = Number.isInteger(l.qty) && l.qty > 0 ? l.qty : null;
    if (!qty) { missing.add('quantity'); continue; }
    if (!isCurrency(l.currency)) { missing.add('source_currency'); continue; }
    const unitMinor = l.amount == null ? null : toMinor(l.amount, MINOR_DIGITS[l.currency]);
    if (unitMinor == null || unitMinor <= 0) { missing.add('source_price'); continue; }
    // Convert the line total (not the unit price) so rounding happens once per line.
    let lineTmt = unitMinor * qty;
    if (l.currency !== 'TMT') {
      const fx = cfg.fx?.[l.currency];
      const conv = fx ? convertMinor(unitMinor * qty, fx.rate) : null;
      if (conv == null) { missing.add(`fx_${l.currency}`); continue; }
      lineTmt = conv;
      if (!out.fx) out.fx = { pair: `${l.currency}/TMT`, rate: String(fx.rate), asOf: fx.asOf ?? null, source: fx.source ?? null };
    }
    if (lines.length === 1) out.source = { amountMinor: unitMinor, currency: l.currency };
    goods += lineTmt;
    const g = chargeableGrams(l.weightG, l.volumeCm3, cfg.volumetricKgPerM3 ?? 167);
    if (g == null) gramsKnown = false; else grams += g * qty;
    if (l.weightEstimated) out.logistics.weightEstimated = true;
  }
  if (missing.size) {
    out.status = 'unavailable'; out.missing = [...missing];
    return out;
  }
  out.goodsMinor = goods;
  out.serviceFeeMinor = applyBps(goods, opts.vip ? cfg.vipFeeBps : cfg.serviceFeeBps);
  out.marginMinor = applyBps(goods, cfg.marginBps || 0);
  out.dutiesEstimatedMinor = applyBps(goods, cfg.dutyEstimateBps);
  if (gramsKnown) {
    const rate = opts.delivery === 'express' ? cfg.expressRatePerKg : cfg.cargoRatePerKg;
    const byWeight = perKgMinor(grams, rate);
    const min = toMinor(cfg.minCargo, 2);
    if (byWeight == null || min == null) missing.add('logistics_tariff');
    else { out.logistics.estimatedMinor = Math.max(byWeight, min); out.logistics.chargeableGrams = grams; }
  } else missing.add('weight');
  if (missing.size) {
    out.status = 'incomplete'; out.missing = [...missing];
    return out;
  }
  out.totalMinor = out.goodsMinor + out.serviceFeeMinor + out.marginMinor + out.logistics.knownMinor + out.logistics.estimatedMinor + out.dutiesEstimatedMinor + out.otherMinor;
  return out;
}
