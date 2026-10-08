# CARGO ONE — China. One Platform.

Commerce, sourcing, supplier payments, cargo and vehicles from China to Turkmenistan.
EN / RU / TK interface.

## Run

```bash
npm install          # react, react-dom, react-icons, clsx, tailwind-merge + dev tools
npm run build        # esbuild + Tailwind v4 → dist/
npm start            # node server/server.mjs  (PORT, default 3000) — Node ≥ 22.5 (built-in node:sqlite)
npm run dev          # watch + live reload
npm run typecheck    # tsc --noEmit
npm test             # node:test — pricing core, catalogue/importer, HTTP API + authorization
npm run test:e2e     # Playwright: every route × desktop/mobile × role, access control, journeys
```

Copy `.env.example` to `.env` and set `AUTH_SECRET` before running anywhere public.
`DEMO_MODE=1` returns the mock OTP code in API responses; turn it off in production.

## Demo accounts (password `demo1234`)

| Role | Email |
|---|---|
| Personal | personal@cargo.one |
| Business | business@cargo.one |
| Supplier | supplier@cargo.one |
| Admin | admin@cargo.one |

Mock OTP code: `123456`. Test card `4242 4242 4242 4242` succeeds; a card ending `0002` is declined.

## Architecture

- `server/` — Node HTTP server: static files, SPA fallback, auth API (scrypt passwords, HMAC-signed
  httpOnly session cookie), **server-side route policy** (`/admin` admin, `/supplier` supplier,
  `/business` business), security headers, CSRF origin checks. Roles are read from the server store,
  never from the client.
- `server/db/`, `server/catalog/` — **W1 catalogue**: SQLite (`node:sqlite`, FTS5 search) with versioned
  migrations, source adapters (only a labelled *sample fixture* — marketplace adapters are planned, not
  implemented), normalizer, idempotent importer, decimal-safe pricing (`src/shared/pricing.mjs`) and the
  `/api/catalog/*` + `/api/admin/catalog/*` endpoints. See `docs/W1_MARKETPLACE_FOUNDATION.md`.
  W2 adds a live third-party aggregator adapter (AliExpress via OT Commerce, key in `OTAPI_KEY`): see
  `docs/W2_OTAPI_ALIEXPRESS.md` and `npm run otapi:probe`.
- `src/services/` — typed service modules. Products are served by the catalogue API in the server build;
  the browser keeps a read mirror for still-local flows. Other modules are still a mock backend (`db.ts`, persisted in localStorage) with latency, error, empty and pagination states.
  Swap each module for real API calls without touching pages.
- `src/pages/`, `src/components/` — React 19 SPA, code-split per route.
- `src/i18n/` — EN/RU/TK dictionary; admins can override strings at runtime.

## Mocked integrations (require credentials / partners for production)

SMS/OTP provider, Google & Apple sign-in, card tokenization / payment gateway, licensed settlement & FX
partner bank with KYC/AML (supplier payments are a workflow model only — no P2P exchange),
logistics/carrier tracking API, supplier catalogue APIs, visual search / AI procurement / speech
recognition, VIN & vehicle history data, production database, media storage, email delivery.
