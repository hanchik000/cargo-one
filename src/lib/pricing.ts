// Transparent cost model. Every figure that is not contractually fixed is labelled ESTIMATED in the UI.
import type { Car, CartItem, ContentSettings, CostBreakdown, Product } from './types';
import { estimate, minorToMajor, pctToBps, toMinor } from '@/shared/pricing.mjs';
import type { PricingConfig } from '@/shared/pricing.mjs';

export type Settings = ContentSettings['settings'];

export const DEFAULT_SETTINGS: Settings = {
  serviceFeePct: 5,
  vipFeePct: 3,
  cargoRateTMTPerKg: 28,
  expressRateTMTPerKg: 62,
  usdToTmt: 3.5,
  cnyToTmt: 0.49,
  dutyEstimatePct: 10,
  simulateErrors: false,
};

// Supplier-invoice and vehicle estimates below still use display rounding; moving them to the core is planned for W2.
const round = (n: number) => Math.round(n * 100) / 100;
export const chargeableKg = (weightKg: number, volumeM3: number) => Math.max(weightKg, volumeM3 * 167);

export function variantPrice(p: Product, variantId?: string) {
  const v = p.variants.find((x) => x.id === variantId);
  return p.priceCNY + (v?.priceDeltaCNY ?? 0);
}

export interface EstimateOptions { vip?: boolean; delivery?: 'standard' | 'express' }

/** Admin → Settings (percentages, decimal rates) → the shared core's config. Rates stay out of UI components. */
export function settingsToConfig(s: Settings): PricingConfig {
  const bps = (v: number) => pctToBps(v) ?? 0;
  return {
    fx: { CNY: { rate: String(s.cnyToTmt), source: 'settings' }, USD: { rate: String(s.usdToTmt), source: 'settings' } },
    serviceFeeBps: bps(s.serviceFeePct), vipFeeBps: bps(s.vipFeePct), marginBps: 0, dutyEstimateBps: bps(s.dutyEstimatePct),
    cargoRatePerKg: String(s.cargoRateTMTPerKg), expressRatePerKg: String(s.expressRateTMTPerKg), minCargo: '35', tariffIsDemo: true,
  };
}
const kgToG = (kg: number) => toMinor(kg, 3);
const m3ToCm3 = (m3: number) => toMinor(m3, 6);
const major = (minor: number | null) => minorToMajor(minor ?? 0) as number;

/** Basket estimate in TMT. Integer minor-unit arithmetic via the shared pricing core; amounts are ESTIMATED. */
export function estimateLines(
  lines: { unitCNY: number; qty: number; weightKg: number; volumeM3: number }[],
  s: Settings,
  opts: EstimateOptions = {},
): CostBreakdown {
  if (!lines.length) return { goodsTMT: 0, cargoTMT: 0, serviceTMT: 0, dutiesTMT: 0, totalTMT: 0 };
  const e = estimate(lines.map((l) => ({ amount: l.unitCNY, currency: 'CNY', qty: l.qty, weightG: kgToG(l.weightKg), volumeCm3: m3ToCm3(l.volumeM3) })), settingsToConfig(s), opts);
  const cargo = (e.logistics.estimatedMinor ?? 0) + e.logistics.knownMinor;
  return {
    goodsTMT: major(e.goodsMinor), cargoTMT: major(cargo), serviceTMT: major((e.serviceFeeMinor ?? 0) + (e.marginMinor ?? 0)),
    dutiesTMT: major(e.dutiesEstimatedMinor), totalTMT: major(e.totalMinor),
  };
}

export function estimateProduct(p: Product, qty: number, s: Settings, opts: EstimateOptions = {}, variantId?: string) {
  return estimateLines([{ unitCNY: variantPrice(p, variantId), qty, weightKg: p.weightKg, volumeM3: p.volumeM3 }], s, opts);
}

export function estimateCart(items: CartItem[], products: Map<string, Product>, s: Settings, opts: EstimateOptions = {}) {
  const lines = items.flatMap((i) => {
    const p = products.get(i.productId);
    return p ? [{ unitCNY: variantPrice(p, i.variantId), qty: i.qty, weightKg: p.weightKg, volumeM3: p.volumeM3 }] : [];
  });
  return estimateLines(lines, s, opts);
}

export function deliveryWindow(p: Pick<Product, 'leadDays'>, delivery: 'standard' | 'express' = 'standard'): [number, number] {
  return delivery === 'express' ? [p.leadDays + 7, p.leadDays + 11] : [p.leadDays + 16, p.leadDays + 24];
}

// ---------- Vehicles ----------
export interface CarCost {
  vehicleUSD: number; chinaLogisticsUSD: number; inspectionUSD: number; cargoUSD: number;
  mandatoryUSD: number; mandatoryPct: number; serviceUSD: number; totalUSD: number; totalTMT: number;
}
const CARGO_BY_BODY: Record<Car['body'], number> = { sedan: 1850, hatch: 1700, suv: 2200, van: 2400, pickup: 2450 };
// Illustrative estimate only — actual customs duty, excise and fees are confirmed by a licensed broker per vehicle.
const MANDATORY_PCT: Record<Car['fuel'], number> = { ev: 8, hybrid: 18, petrol: 28, diesel: 28 };

export function carCost(car: Car, s: Settings): CarCost {
  const chinaLogisticsUSD = 450;
  const inspectionUSD = car.condition === 'used' ? 250 : 0;
  const cargoUSD = CARGO_BY_BODY[car.body];
  const mandatoryPct = MANDATORY_PCT[car.fuel];
  const mandatoryUSD = Math.round(car.priceUSD * mandatoryPct / 100);
  const serviceUSD = Math.max(350, Math.round(car.priceUSD * 0.03));
  const totalUSD = car.priceUSD + chinaLogisticsUSD + inspectionUSD + cargoUSD + mandatoryUSD + serviceUSD;
  return { vehicleUSD: car.priceUSD, chinaLogisticsUSD, inspectionUSD, cargoUSD, mandatoryUSD, mandatoryPct, serviceUSD, totalUSD, totalTMT: Math.round(totalUSD * s.usdToTmt) };
}

// ---------- Supplier invoice settlement ----------
export function invoiceCosts(amount: number, currency: 'CNY' | 'USD', s: Settings, vip = false) {
  const tmt = currency === 'CNY' ? amount * s.cnyToTmt : amount * s.usdToTmt;
  const feePct = vip ? 1.5 : 2;
  const serviceFeeTMT = round(Math.max(70, tmt * feePct / 100));
  const settlementCostTMT = round(tmt * 0.008 + 45); // partner bank + correspondent fees, estimated
  return { amountTMT: round(tmt), serviceFeeTMT, settlementCostTMT, feePct, totalTMT: round(tmt + serviceFeeTMT + settlementCostTMT) };
}
