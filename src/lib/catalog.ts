// Presentation helpers for W1 catalogue fields. Unknown data stays unknown: nothing here invents a value.
import type { Product } from './types';
import { minorToMajor } from '@/shared/pricing.mjs';

export type PricingStatus = 'estimate' | 'incomplete' | 'unavailable';
export const pricingStatus = (p: Product): PricingStatus => p.pricing?.status ?? 'estimate';

/** The price as listed (in its own currency), or null when the source gave no valid price. */
export function presentedPrice(p: Product): { amount: number; currency: 'CNY' | 'USD' | 'TMT' } | null {
  if (!p.pricing) return { amount: p.priceCNY, currency: 'CNY' };
  const src = p.pricing.source;
  return src ? { amount: minorToMajor(src.amountMinor) ?? 0, currency: src.currency } : null;
}

export const leadKnown = (p: Product) => p.leadDaysKnown !== false;
export const isPublished = (p: Product) => (p.status ? p.status === 'published' : p.published);

/** Orderable only with a complete estimate, a published listing and stock that is not known to be zero. */
export function canOrder(p: Product) {
  return pricingStatus(p) === 'estimate' && isPublished(p) && p.availability !== 'out_of_stock' && !(p.availability == null && p.stock <= 0);
}
