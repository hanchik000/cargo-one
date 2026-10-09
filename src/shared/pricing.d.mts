export type Currency = 'TMT' | 'CNY' | 'USD';
export declare const MINOR_DIGITS: Readonly<Record<Currency, number>>;
export declare function isCurrency(c: unknown): c is Currency;
export declare function parseDecimal(value: unknown): { n: bigint; scale: number } | null;
export declare function divRound(num: bigint, den: bigint): bigint;
export declare function toMinor(value: unknown, digits?: number): number | null;
export declare function minorToMajor(minor: number | null | undefined, digits?: number): number | null;
export declare function convertMinor(amountMinor: number, rate: string | number): number | null;
export declare function applyBps(amountMinor: number, bps: number): number | null;
export declare function pctToBps(pct: string | number): number | null;
export declare function chargeableGrams(weightG: number | null | undefined, volumeCm3?: number | null, kgPerM3?: number): number | null;
export declare function perKgMinor(grams: number, ratePerKg: string | number): number | null;

export interface FxRate { rate: string; asOf?: string | null; source?: string | null }
export interface PricingConfig {
  fx: Partial<Record<Currency, FxRate>>;
  serviceFeeBps: number; vipFeeBps: number; marginBps: number; dutyEstimateBps: number;
  cargoRatePerKg: string; expressRatePerKg: string; minCargo: string; volumetricKgPerM3?: number;
  tariffIsDemo: boolean;
}
export interface PriceLine { amount: string | number | null; currency: string; qty: number; weightG: number | null; volumeCm3?: number | null; weightEstimated?: boolean }
export type MissingInput = 'lines' | 'quantity' | 'source_currency' | 'source_price' | `fx_${string}` | 'weight' | 'logistics_tariff';
export interface PriceEstimate {
  currency: 'TMT';
  /** Always false in W1: confirmed quotes come from a later stage. */
  confirmed: boolean;
  /** estimate = every component known; incomplete = goods known, total withheld; unavailable = no price at all. */
  status: 'estimate' | 'incomplete' | 'unavailable';
  source: { amountMinor: number; currency: Currency } | null;
  fx: { pair: string; rate: string; asOf: string | null; source: string | null } | null;
  goodsMinor: number | null; serviceFeeMinor: number | null; marginMinor: number | null;
  logistics: { knownMinor: number; estimatedMinor: number | null; chargeableGrams: number | null; weightEstimated: boolean; tariffIsDemo: boolean; mode: 'standard' | 'express' };
  dutiesEstimatedMinor: number | null; otherMinor: number; totalMinor: number | null;
  missing: MissingInput[];
}
export declare function estimate(lines: PriceLine[], cfg: PricingConfig, opts?: { vip?: boolean; delivery?: 'standard' | 'express'; knownChargesMinor?: number }): PriceEstimate;
