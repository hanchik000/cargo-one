# W2 — First live source: AliExpress via OT Commerce (trial)

Status: adapter implemented; mapping verified against one **recorded real response** (search "wireless earbuds",
2 items, 2026-10-09, `fixtures/otapi-recorded-search-2026-10-09.json`) plus synthetic responses for variants/specs.
Full-info responses (variants, attributes) are not yet recorded. The import itself has not run against the live
service from the development environment (outbound access is blocked there); run `npm run otapi:probe` on the server.

## Findings from the recorded response
- Results come from the provider's cache (`"SearchMethod": "Storage"`); `LastUpdatedTime` can be over a year old and
  items can be flagged `Expired` or `Deleted` (`IsSellAllowed: false`). CARGO ONE stores this as `source_updated_at`
  (migration v3) and marks such products stale; deleted items arrive as out of stock.
- `Price.OriginalPrice` is the list price in USD; `PromotionPrice` (e.g. −42%) is kept in raw data only;
  `MarginPrice` is OT's own rounding/markup and is ignored.
- `MasterQuantity: 99999` is a placeholder → stock unknown. `VendorScore` was 0 → not used.
- `PhysicalParameters` is often empty → price stays "incomplete" (no total) until weight is known;
  when present it is kg and cm (0.07 kg, 9×9×3 cm for earbuds).
- Titles are machine-translated to Russian; descriptions stay in English (raw HTML with scripts → sanitised).

## What it is
OT Commerce (ООО «Опентрейд Коммерс») resells marketplace data through one key. It is a third-party aggregator,
not an official AliExpress API. Open questions to settle in writing before publishing imported products:
where the data comes from, whether it may be displayed commercially in Turkmenistan, HTTPS for all calls,
payment from Turkmenistan. Until then imported products stay drafts (the importer never publishes).

## Setup on the server
1. `.env` (never commit): `OTAPI_KEY=…`, `OTAPI_PROVIDER=Aliexpress`, `OTAPI_LANG=ru`, `OTAPI_DAILY_CALL_LIMIT=60`,
   `IMAGE_HOSTS=alicdn.com`. Rotate the key in the OT cabinet if it was ever pasted into chats or tickets.
2. `npm run otapi:probe -- "wireless earbuds"` — 1 paid call; add `--details` for +1. Prints what would be
   imported (price, currency, weight, seller, images, translation, normalizer verdict) and saves raw responses
   to `$DATA_DIR/otapi-probe/`. Nothing is written to the catalogue.
3. `npm start` → Admin → Catalogue sources → "AliExpress · via OT Commerce": query, number of items (1–40),
   target category, optional full details. The form shows the call cost; the server enforces the daily cap.
4. Review drafts in Admin → Products and publish.

## Mapping (OT item → SourceProduct)
| OT field | CARGO ONE | Notes |
|---|---|---|
| `Id` | sourceProductId | identity `(ot-aliexpress, Id)`, idempotent |
| `OriginalTitle` / `Title` | source text / machine translation (OTAPI_LANG) | translation flagged `machine` |
| `Price.OriginalPrice` + `OriginalCurrencyCode` (fallback `ConvertedPriceList.Internal`) | source price | CNY/USD accepted; other currencies are rejected per item |
| `Pictures[].Large.Url / Url`, `MainPictureUrl` | images | https + `IMAGE_HOSTS` only |
| `PhysicalParameters.Weight` (kg) / `Length·Width·Height` (cm) | weight g / volume cm³ | missing → price "incomplete", no total |
| `MasterQuantity`, `IsSellAllowed` | stock / availability | |
| `VendorId`, `VendorName`, `Location` | seller (level 0, unreviewed) | provider `VendorScore` kept in raw data only |
| `Attributes` (non-configurator) | specs | full details only |
| `ConfiguredItems` + configurator `Attributes` | variants, price delta in source currency | full details only |
| `ExternalItemUrl` | source URL | https only |
| `Volume` (sales) | raw data only | not shown as a CARGO ONE metric |
| — | lead time | unknown (null), never invented |

Confirmed on the recorded response: weight kg / dimensions cm, prices in USD, `TotalCount` under `Result.Items.Items`.

## Safety
- Key only in server env; requests go to `https://otapi.net/service-json/`; the key never reaches the browser,
  logs, import results or the audit log. Provider error text is truncated.
- Budget table `source_call_log` (migration v2) counts every paid call per UTC day before it is made.
- Search query is XML-escaped; all text sanitised; categories assigned by the operator per import.
- Failures (banned/expired key, network, budget) fail the run and never modify stored products.

## Tests
`tests/otapi.test.mjs` (12 tests, fake fetch; 2 on the recorded real response, the rest on synthetic data): request URL and XML escaping, signature, mapping,
variants/specs, import (drafts, idempotency, per-item failure, sanitising, category), details mode, daily budget,
provider errors, failed refresh keeps the product.
