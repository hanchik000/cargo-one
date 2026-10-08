// Pricing core: decimal-safe conversion, rounding, fees, missing data. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBps, chargeableGrams, convertMinor, divRound, estimate, parseDecimal, pctToBps, perKgMinor, toMinor } from '../src/shared/pricing.mjs';

const CFG = {
  fx: { CNY: { rate: '0.49', source: 'test', asOf: '2026-10-01T00:00:00Z' }, USD: { rate: '3.50', source: 'test', asOf: '2026-10-01T00:00:00Z' } },
  serviceFeeBps: 500, vipFeeBps: 300, marginBps: 0, dutyEstimateBps: 1000,
  cargoRatePerKg: '28.00', expressRatePerKg: '62.00', minCargo: '35.00', volumetricKgPerM3: 167, tariffIsDemo: true,
};

test('parseDecimal accepts plain decimals only', () => {
  assert.deepEqual(parseDecimal('12.34'), { n: 1234n, scale: 2 });
  assert.deepEqual(parseDecimal(7), { n: 7n, scale: 0 });
  for (const bad of ['1e3', 'abc', '', '1.2.3', null, undefined, NaN, Infinity, '0x10']) assert.equal(parseDecimal(bad), null, String(bad));
});

test('toMinor converts without float drift', () => {
  assert.equal(toMinor('0.1'), 10);
  assert.equal(toMinor('0.29'), 29); // 0.29 * 100 = 28.999999999999996 in floats
  assert.equal(toMinor(1.005), 101); // half-up on the decimal string "1.005"
  assert.equal(toMinor('19.999'), 2000);
  assert.equal(toMinor('abc'), null);
  assert.equal(toMinor('0.2', 3), 200); // kg → g
});

test('divRound rounds half up (and half away from zero for negatives)', () => {
  assert.equal(divRound(5n, 2n), 3n);
  assert.equal(divRound(4n, 2n), 2n);
  assert.equal(divRound(-5n, 2n), -3n);
  assert.equal(divRound(1n, 3n), 0n);
});

test('currency conversion and rounding', () => {
  assert.equal(convertMinor(18900, '0.49'), 9261); // 189.00 CNY → 92.61 TMT
  assert.equal(convertMinor(1, '0.49'), 0); // 0.0049 → 0.00
  assert.equal(convertMinor(2, '0.49'), 1); // 0.0098 → 0.01 (half up)
  assert.equal(convertMinor(1999, '3.50'), 6997); // 19.99 USD → 69.965 → 69.97 TMT
  assert.equal(convertMinor(100, 'bad'), null);
});

test('fees in basis points', () => {
  assert.equal(pctToBps('5'), 500);
  assert.equal(pctToBps('2.5'), 250);
  assert.equal(applyBps(9261, 500), 463); // 463.05 → 463
  assert.equal(applyBps(9270, 500), 464); // 463.5 → 464
});

test('chargeable weight uses the larger of actual and volumetric', () => {
  assert.equal(chargeableGrams(200, 1000), 200); // 1000 cm³ × 167 kg/m³ = 167 g
  assert.equal(chargeableGrams(100, 6000), 1002);
  assert.equal(chargeableGrams(null, 1000), null);
  assert.equal(perKgMinor(1500, '28.00'), 4200);
});

test('complete estimate: every component separate, never confirmed', () => {
  const e = estimate([{ amount: '189', currency: 'CNY', qty: 1, weightG: 200, volumeCm3: 1000 }], CFG);
  assert.equal(e.status, 'estimate');
  assert.equal(e.confirmed, false);
  assert.equal(e.goodsMinor, 9261);
  assert.equal(e.serviceFeeMinor, 463);
  assert.equal(e.marginMinor, 0);
  assert.equal(e.logistics.estimatedMinor, 3500); // minimum charge applies
  assert.equal(e.logistics.knownMinor, 0);
  assert.equal(e.logistics.tariffIsDemo, true);
  assert.equal(e.dutiesEstimatedMinor, 926);
  assert.equal(e.totalMinor, 9261 + 463 + 0 + 3500 + 926);
  assert.equal(e.fx.rate, '0.49');
  assert.equal(e.fx.source, 'test');
  assert.deepEqual(e.missing, []);
});

test('USD source price converts with its own rate', () => {
  const e = estimate([{ amount: '19.99', currency: 'USD', qty: 2, weightG: 900, volumeCm3: 4000 }], CFG);
  assert.equal(e.goodsMinor, 13993); // 39.98 × 3.50 = 139.93
  assert.equal(e.fx.pair, 'USD/TMT');
});

test('missing source price → unavailable, no total', () => {
  const e = estimate([{ amount: null, currency: 'CNY', qty: 1, weightG: 300 }], CFG);
  assert.equal(e.status, 'unavailable');
  assert.equal(e.totalMinor, null);
  assert.ok(e.missing.includes('source_price'));
});

test('invalid source price → unavailable', () => {
  for (const amount of ['-5', 'abc', '0']) {
    const e = estimate([{ amount, currency: 'CNY', qty: 1, weightG: 300 }], CFG);
    assert.equal(e.status, 'unavailable', amount);
    assert.equal(e.totalMinor, null);
  }
});

test('missing FX rate → unavailable', () => {
  const e = estimate([{ amount: '10', currency: 'USD', qty: 1, weightG: 300 }], { ...CFG, fx: { CNY: CFG.fx.CNY } });
  assert.equal(e.status, 'unavailable');
  assert.ok(e.missing.includes('fx_USD'));
});

test('missing weight → incomplete: goods known, logistics and total withheld', () => {
  const e = estimate([{ amount: '59', currency: 'CNY', qty: 1, weightG: null }], CFG);
  assert.equal(e.status, 'incomplete');
  assert.equal(e.goodsMinor, 2891);
  assert.equal(e.logistics.estimatedMinor, null);
  assert.equal(e.totalMinor, null);
  assert.ok(e.missing.includes('weight'));
});

test('missing logistics tariff → incomplete', () => {
  const e = estimate([{ amount: '59', currency: 'CNY', qty: 1, weightG: 500 }], { ...CFG, cargoRatePerKg: null });
  assert.equal(e.status, 'incomplete');
  assert.equal(e.totalMinor, null);
  assert.ok(e.missing.includes('logistics_tariff'));
});

test('known charges are kept apart from estimated logistics', () => {
  const e = estimate([{ amount: '189', currency: 'CNY', qty: 1, weightG: 200 }], CFG, { knownChargesMinor: 1200 });
  assert.equal(e.logistics.knownMinor, 1200);
  assert.equal(e.totalMinor, 9261 + 463 + 3500 + 926 + 1200);
});

test('VIP fee and express mode', () => {
  const e = estimate([{ amount: '189', currency: 'CNY', qty: 1, weightG: 2000 }], CFG, { vip: true, delivery: 'express' });
  assert.equal(e.serviceFeeMinor, applyBps(9261, 300));
  assert.equal(e.logistics.mode, 'express');
  assert.equal(e.logistics.estimatedMinor, 12400); // 2 kg × 62.00
});
