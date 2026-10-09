// Source-agnostic integration layer for Chinese marketplaces.
//
// A SourceAdapter only FETCHES. It never writes to the catalogue and never decides presentation; the
// ProductNormalizer turns its SourceProduct records into catalogue data and the ProductImporter stores them.
//
// @typedef {Object} SourceProduct            Raw listing exactly as the source describes it.
// @property {string} source                  Adapter id ("fixture", "1688", …).
// @property {string} sourceProductId         Stable id in that source. (source, sourceProductId) is the identity.
// @property {string} [url]                   Public listing URL (https only; validated).
// @property {'zh'|'en'|'ru'|'tk'} lang       Language of title/description.
// @property {string} title
// @property {string} [description]
// @property {string} [brand]
// @property {string} [categoryHint]          Source category path, mapped by the normalizer.
// @property {string[]} [images]              Image URLs (allow-listed hosts or local assets only).
// @property {{amount: string, currency: string}|null} price   Unit price for the MOQ tier, decimal string.
// @property {number} [moq]
// @property {number|null} [stock]
// @property {'in_stock'|'out_of_stock'|null} [availability]
// @property {{sku: string, name: string, priceDelta?: string, stock?: number}[]} [variants]
// @property {{name: string, value: string}[]} [specs]
// @property {number|null} [weightG]          Gross weight per unit, grams.
// @property {number|null} [volumeCm3]        Packed volume per unit, cm³.
// @property {number|null} [leadDays]         Seller dispatch time.
// @property {{sellerId: string, name: string, nameCn?: string, city?: string, province?: string}|null} [seller]
// @property {Partial<Record<'en'|'ru'|'tk', {title?: string, description?: string}>>} [translations]  Machine translations.
// @property {string} fetchedAt               ISO time of the fetch.
//
// @typedef {Object} SourceAdapter
// @property {string} id
// @property {string} label
// @property {'fixture'|'marketplace_api'|'aggregator_api'|'seller_feed'} kind
// @property {boolean} live                   true only for a verified connection to a real marketplace.
// @property {boolean} available              false → listed in Admin with `reason`, cannot run.
// @property {string} [reason]
// @property {(opts?: {db?: object, q?: string, limit?: number, categoryId?: string, details?: boolean}) => Promise<SourceProduct[]>} [listProducts]

import { fixtureAdapter } from './fixture.mjs';
import { otapiFromEnv } from './otapi.mjs';

const planned = (id, label) => ({
  id, label, kind: 'marketplace_api', live: false, available: false,
  reason: 'not_implemented', // needs API access approval, credentials and a legal review (see docs/W1_MARKETPLACE_FOUNDATION.md)
});

/**
 * Registered adapters. The fixture is sample data. The OT Commerce adapter (W2) is a paid third-party aggregator,
 * available only when OTAPI_KEY is set on the server. Official marketplace APIs remain planned.
 */
export const ADAPTERS = [
  fixtureAdapter,
  otapiFromEnv(),
  planned('1688', '1688.com'),
  planned('taobao', 'Taobao / Tmall'),
  planned('alibaba', 'Alibaba.com'),
  planned('aliexpress', 'AliExpress'),
  planned('jd', 'JD.com'),
];
export const getAdapter = (id) => ADAPTERS.find((a) => a.id === id) || null;
