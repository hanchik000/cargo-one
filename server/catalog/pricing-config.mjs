// Server-side pricing configuration: FX rates with provenance + fee/tariff settings, stored in the database.
// The DEFAULTS are the same demo values the app has always used. They are NOT carrier quotes or bank rates:
// `tariffIsDemo` stays true and FX source is "demo_default" until an operator enters real values.
import { pctToBps, parseDecimal } from '../../src/shared/pricing.mjs';

export const DEFAULT_PRICING = {
  serviceFeeBps: 500, vipFeeBps: 300, marginBps: 0, dutyEstimateBps: 1000,
  cargoRatePerKg: '28.00', expressRatePerKg: '62.00', minCargo: '35.00', volumetricKgPerM3: 167, tariffIsDemo: true,
};
export const DEFAULT_FX = [
  { base: 'CNY', quote: 'TMT', rate: '0.49', source: 'demo_default' },
  { base: 'USD', quote: 'TMT', rate: '3.50', source: 'demo_default' },
];

export function seedPricing(db, now = new Date().toISOString()) {
  const has = db.prepare('SELECT COUNT(*) AS n FROM pricing_config').get().n;
  if (!has) {
    const ins = db.prepare('INSERT INTO pricing_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)');
    for (const [k, v] of Object.entries(DEFAULT_PRICING)) ins.run(k, JSON.stringify(v), now, 'seed');
  }
  if (!db.prepare('SELECT COUNT(*) AS n FROM fx_rates').get().n) {
    const ins = db.prepare('INSERT INTO fx_rates (base, quote, rate, source, as_of) VALUES (?, ?, ?, ?, ?)');
    for (const r of DEFAULT_FX) ins.run(r.base, r.quote, r.rate, r.source, now);
  }
}

/** Current config in the shared core's shape. */
export function getPricingConfig(db) {
  const cfg = { ...DEFAULT_PRICING };
  for (const r of db.prepare('SELECT key, value FROM pricing_config').all()) {
    if (r.key in cfg) { try { cfg[r.key] = JSON.parse(r.value); } catch { /* keep default */ } }
  }
  const fx = {};
  for (const r of db.prepare(`SELECT base, rate, source, as_of FROM fx_rates f WHERE quote = 'TMT' AND as_of = (SELECT MAX(as_of) FROM fx_rates g WHERE g.base = f.base AND g.quote = 'TMT')`).all()) {
    fx[r.base] = { rate: r.rate, source: r.source, asOf: r.as_of };
  }
  return { ...cfg, fx };
}

const DEC_KEYS = ['cargoRatePerKg', 'expressRatePerKg', 'minCargo'];
const BPS_KEYS = ['serviceFeeBps', 'vipFeeBps', 'marginBps', 'dutyEstimateBps'];

/** Validates and stores an admin update. Percent fields may be sent as `<name>Pct`. Returns the list of errors (empty = saved). */
export function updatePricing(db, input, actor, now = new Date().toISOString()) {
  const errors = [];
  const set = {};
  for (const k of BPS_KEYS) {
    const pctKey = k.replace(/Bps$/, 'Pct');
    let v = input[k];
    if (v == null && input[pctKey] != null) { v = pctToBps(input[pctKey]); if (v == null) { errors.push(k); continue; } }
    if (v == null) continue;
    if (!Number.isInteger(v) || v < 0 || v > 5000) errors.push(k); else set[k] = v;
  }
  for (const k of DEC_KEYS) {
    if (input[k] == null) continue;
    const d = parseDecimal(input[k]);
    if (!d || d.n < 0n) errors.push(k); else set[k] = String(input[k]);
  }
  if (input.tariffIsDemo != null) set.tariffIsDemo = !!input.tariffIsDemo;
  const fx = [];
  for (const [base, rate] of Object.entries(input.fx || {})) {
    const d = parseDecimal(rate);
    if (!['CNY', 'USD'].includes(base) || !d || d.n <= 0n) errors.push(`fx_${base}`); else fx.push({ base, rate: String(rate) });
  }
  if (errors.length) return errors;
  const up = db.prepare('INSERT INTO pricing_config (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by');
  for (const [k, v] of Object.entries(set)) up.run(k, JSON.stringify(v), now, actor);
  const ins = db.prepare('INSERT OR REPLACE INTO fx_rates (base, quote, rate, source, as_of) VALUES (?, ?, ?, ?, ?)');
  for (const r of fx) ins.run(r.base, 'TMT', r.rate, `admin:${actor}`, now);
  return [];
}
