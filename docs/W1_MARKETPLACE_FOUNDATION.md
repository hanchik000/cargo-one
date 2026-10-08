# W1 — Marketplace foundation

Status: implemented on 2026-10-09. Scope: internal catalogue, discovery, product page, source/import layer, pricing core.
Out of scope (not built, not claimed): live marketplace integrations, seller verification automation, real logistics quotes, trend detection beyond recorded views, automated purchasing, settlement.

## What runs where

| Concern | Server build (`npm start`) | Artifact build (no server) |
|---|---|---|
| Catalogue data | SQLite `$DATA_DIR/cargo-one.sqlite` via `server/catalog/*` | in-browser demo store (`src/services/db.ts`) |
| Search | FTS5 (title, description, category names in EN/RU/TK, brand, specs, keywords) | token match in the browser |
| Product writes | `/api/catalog/manage/*`, role + ownership checked on the server | local mock |
| Pricing | `src/shared/pricing.mjs` (shared by both) with server-stored config | same core, Admin → Settings values |

In the server build the browser keeps a **read mirror** of products and suppliers (`hydrateCatalog` in `src/services/catalogApi.ts`) because cart, orders, group buy, AI Buyer, Find and try-on are still local services. The server stays the source of truth; the mirror is refreshed at sign-in/out and after each write.

## Database

`node:sqlite` (Node ≥ 22.5, no extra dependency). Migrations: `server/db/migrations.mjs`, versioned, applied in a transaction and recorded in `schema_migrations`.

Migration **v1 `catalog_foundation`** creates: `categories`, `category_names`, `suppliers`, `products`, `product_texts`, `product_images`, `product_variants`, `product_specs`, `product_sources`, `import_runs`, `fx_rates`, `pricing_config`, `product_views`, `audit_log`, FTS5 `product_fts`.

Money is stored as integer minor units (`price_minor` + `price_currency`), FX rates as decimal strings with `source` and `as_of`.

The schema avoids SQLite-only features except FTS5 (behind `listProducts`). PostgreSQL is the production target.

## Field ownership

Every child row (`product_texts`, `product_images`, `product_variants`, `product_specs`) has `owner = 'source' | 'editorial'`.

- **Source-owned**: written by the importer only: source texts and media, price, availability/stock, MOQ, lead time, weight/volume, brand, category (on create), and the `product_sources` row (source URL, source price and currency, raw JSON and hash, sync time and status).
- **Editorial-owned**: written by admins/suppliers only: publication status, featured, rank, tags, editorial texts and media.
- When an editor changes a source-owned field on an imported product, the field name is added to `products.editorial_fields` and **later imports skip it**. The source value is still recorded in `product_sources`, so it stays traceable.
- Text and media: editorial rows win over source rows when both exist; the source rows are kept.

## Source layer

`server/catalog/sources/adapter.mjs` defines the contract:

```
SourceAdapter { id, label, kind, live, available, reason?, listProducts(): Promise<SourceProduct[]> }
SourceProduct { source, sourceProductId, url?, lang, title, description?, brand?, categoryHint,
                images[], price {amount: decimal string, currency CNY|USD} | null, moq?, stock?, availability?,
                variants[{sku,name,priceDelta?,stock?}], specs[{name,value}], weightG?, volumeCm3?, leadDays?,
                seller {sellerId,name,nameCn?,city?,province?} | null, translations?, fetchedAt }
```

| Adapter | State |
|---|---|
| `fixture` | Available. Eight **sample** listings in `fixtures/sample-listings.json`; `live: false`; products are created as drafts flagged `sample`. |
| `1688`, `taobao`, `alibaba`, `aliexpress`, `jd` | Registered as **planned**, `available: false`, `reason: 'not_implemented'`. Import returns 409. No scraping. |

Pipeline: `adapter.listProducts()` → `normalize()` (validation, sanitisation, category mapping, minor units) → `importOne()` (transaction per record) → `import_runs` row + `audit_log` entry.

Rules:

- **Idempotent**: keyed by `UNIQUE(source, source_product_id)`. If the raw hash is unchanged, only `synced_at` is updated.
- **Failure is non-destructive**: a record that fails validation leaves the stored product as it was and sets `sync_status = 'error'` with the reason.
- **Stale**: when the last sync is older than `CATALOG_STALE_HOURS` (default 72), the product page shows a warning.
- **Fatal record errors**: `missing_identity`, `missing_title`, `category_unmapped`, `unsupported_currency`, `invalid_price`.
- **Warnings** (the record is still imported): `missing_price` (shown as "price unavailable"), `missing_weight` (the total is withheld), `missing_seller`, `invalid_url`, `dropped_images:n`.
- **External content**: text is stripped of tags, control and bidi characters. URLs are kept only if they are https, have no credentials and point to a public host. Images are kept only if they are local `img/…` assets or https URLs on hosts listed in `IMAGE_HOSTS`.
- **Imported sellers**: they start at verification level 0 with status `unreviewed` and no score or metrics (nulls, never estimates).

## Pricing

`src/shared/pricing.mjs` is used by both the server and the client.

- All arithmetic uses BigInt in minor units with half-up rounding. Line totals are converted once.
- The estimate keeps every component separate: source price, FX pair, rate, as-of date and source, service fee, margin, known logistics, estimated logistics (chargeable weight, `tariffIsDemo`), estimated duties, other charges, total.

| Status | Meaning |
|---|---|
| `estimate` | Every input is known. `confirmed` is always `false` in W1. |
| `incomplete` | The goods price is known but weight or tariff is missing. The total is `null`. |
| `unavailable` | No valid price or no FX rate. The total is `null`. |

Rates live in `pricing_config` and `fx_rates`, never in UI components. The defaults are the earlier demo values and are labelled `demo_default` / `tariffIsDemo: true`.

The UI blocks Add to cart and Buy now unless the status is `estimate`, and `orderService.checkout` refuses such items again.

## Discovery and ranking bases

`GET /api/catalog/home` returns each rail with a `basis`, which the UI shows under the rail title.

| Rail | Basis |
|---|---|
| `trending` | `views_7d`. At least 4 products, each with at least 2 unique daily visitors; otherwise `insufficient_data` and the rail is hidden. |
| `popular` | `views_30d`, or `editorial` ("Picked by CARGO ONE"). |
| `newArrivals` | `newest`. |
| `bestValue` | Lowest complete estimate per category. |
| `fastDelivery` | `lead_days`. |
| `verifiedSuppliers` | Verification level ≥ 2. |
| `priceDrops` | `old_price`. |
| `business` | `category_or_tag`. |
| `recommended` | Same category as viewed products, or editorial. |

Views are recorded with `POST /api/catalog/events`: one row per product, day and visitor. The visitor is stored as a salted hash, never as a raw IP address. The endpoint is rate-limited.

## API

Public:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/catalog/categories?lang=` | localized names + published counts |
| GET | `/api/catalog/products` | `q, category, brand, sort (relevance, price_asc, price_desc, score, newest, delivery), page, pageSize (≤100; ≤500 for admin/owner), minPrice, maxPrice (CNY), minScore, inStock, verifiedOnly, maxLeadDays, tryOn, drops, ids, supplierId, includeUnpublished (admin/owner only), lang`. Returns `matchMode` all/any for search. |
| GET | `/api/catalog/products/:id` | 400 `invalid_id`, 404 `not_found` (drafts are 404 for the public) |
| GET | `/api/catalog/products/:id/alternatives` | cheaper / faster / better seller in the same category |
| GET | `/api/catalog/home?viewed=&lang=` | rails with bases |
| GET | `/api/catalog/suppliers` | serialized suppliers with `trust` |
| GET | `/api/catalog/pricing` | public pricing parameters (`confirmedQuotes: false`) |
| POST | `/api/catalog/events` | `{kind:'view', productId}` |

Authenticated:

| Method | Path | Who |
|---|---|---|
| POST | `/api/catalog/manage/products` | admin; supplier (forced to own `supplierId`, always draft) |
| POST | `/api/catalog/manage/products/:id` | admin; supplier on own non-imported products, limited fields, no publishing |
| POST | `/api/catalog/manage/products/:id/archive` | admin |
| GET | `/api/admin/catalog/sources` | admin — adapters, sync stats, last 20 runs |
| POST | `/api/admin/catalog/import` `{source}` | admin — 409 for planned adapters |
| GET/POST | `/api/admin/catalog/pricing` | admin — validated; FX updates are stamped `admin:<id>` |

Guests get 401 and wrong roles get 403. Existing protections still apply: POST requires JSON and a same-origin `Origin`, cookies are HMAC-signed, and the role comes from the server store.

## Tests

```
npm test                      # 56 tests: pricing core, repository/importer (in-memory DB), HTTP API + authorization
npm run build && PORT=4173 npm start   # then, in another shell:
node scripts/e2e.mjs          # full UI run incl. W1 checks
node scripts/lang-sweep.mjs   # marketplace routes in EN/RU/TK
```

## Known limitations

- Demo products have English titles only; RU/TK show the English text with a "not translated yet" notice. Imported sample listings carry machine translations, which are labelled.
- Orders, payments, cart and cargo are still the in-browser mock. Stock decrements made by local orders are not written to the server.
- Variant price deltas of non-CNY imports are shown in the source currency without conversion.
- Single-process rate limiter and SQLite: suitable for one instance, not for horizontal scale.
