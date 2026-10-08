// Versioned schema migrations. Never edit an applied migration — add a new one.
export const MIGRATIONS = [
  {
    version: 1,
    name: 'catalog_foundation',
    sql: `
CREATE TABLE categories (
  id TEXT PRIMARY KEY, parent_id TEXT REFERENCES categories(id), icon TEXT, position INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE category_names (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE, lang TEXT NOT NULL, name TEXT NOT NULL,
  PRIMARY KEY (category_id, lang)
);

-- Sellers. verification_level is derived ONLY from recorded checks (verification_basis); score is NULL until it can be computed.
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_cn TEXT, city TEXT, province TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended','unreviewed')),
  verification_level INTEGER NOT NULL DEFAULT 0 CHECK (verification_level BETWEEN 0 AND 3),
  verification_basis TEXT NOT NULL DEFAULT '[]',
  score INTEGER, score_basis TEXT,
  source TEXT, source_seller_id TEXT,
  demo INTEGER NOT NULL DEFAULT 0, legacy TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (source, source_seller_id)
);

-- Canonical catalogue entry: what CARGO ONE presents. Source data lives in product_sources / owner='source' rows.
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL CHECK (origin IN ('editorial','imported')),
  demo INTEGER NOT NULL DEFAULT 0, sample INTEGER NOT NULL DEFAULT 0,
  category_id TEXT NOT NULL REFERENCES categories(id), subcategory_id TEXT REFERENCES categories(id),
  supplier_id TEXT REFERENCES suppliers(id), brand TEXT, icon TEXT NOT NULL DEFAULT 'Package',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('in_stock','out_of_stock','unknown')),
  stock INTEGER, moq INTEGER NOT NULL DEFAULT 1, lead_days INTEGER,
  weight_g INTEGER, volume_cm3 INTEGER, weight_estimated INTEGER NOT NULL DEFAULT 0,
  price_minor INTEGER, price_currency TEXT, old_price_minor INTEGER,
  sort_price_tmt_minor INTEGER,
  featured INTEGER NOT NULL DEFAULT 0, editorial_rank INTEGER,
  tags TEXT NOT NULL DEFAULT '[]', keywords TEXT NOT NULL DEFAULT '[]', try_on TEXT,
  editorial_fields TEXT NOT NULL DEFAULT '[]',
  legacy TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, published_at TEXT
);
CREATE INDEX products_status_category ON products (status, category_id);
CREATE INDEX products_supplier ON products (supplier_id);
CREATE INDEX products_sort_price ON products (sort_price_tmt_minor);

CREATE TABLE product_texts (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  lang TEXT NOT NULL, field TEXT NOT NULL CHECK (field IN ('title','description')),
  owner TEXT NOT NULL CHECK (owner IN ('source','editorial')),
  value TEXT NOT NULL, machine INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, lang, field, owner)
);
CREATE TABLE product_images (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  owner TEXT NOT NULL CHECK (owner IN ('source','editorial')), position INTEGER NOT NULL,
  url TEXT NOT NULL, angle TEXT, tone INTEGER,
  PRIMARY KEY (product_id, owner, position)
);
CREATE TABLE product_variants (
  id TEXT PRIMARY KEY, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  owner TEXT NOT NULL CHECK (owner IN ('source','editorial')), position INTEGER NOT NULL,
  name TEXT NOT NULL, price_delta_minor INTEGER NOT NULL DEFAULT 0, stock INTEGER, source_sku TEXT
);
CREATE INDEX product_variants_product ON product_variants (product_id, owner, position);
CREATE TABLE product_specs (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  owner TEXT NOT NULL CHECK (owner IN ('source','editorial')), position INTEGER NOT NULL,
  name TEXT NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY (product_id, owner, position)
);

-- Source identity and the last raw snapshot. UNIQUE(source, source_product_id) makes imports idempotent.
CREATE TABLE product_sources (
  product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  source TEXT NOT NULL, source_product_id TEXT NOT NULL, source_url TEXT,
  source_price_minor INTEGER, source_currency TEXT, source_lang TEXT,
  raw_hash TEXT, raw_json TEXT,
  first_seen_at TEXT NOT NULL, synced_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'ok' CHECK (sync_status IN ('ok','error')),
  last_error TEXT, last_error_at TEXT,
  UNIQUE (source, source_product_id)
);

CREATE TABLE import_runs (
  id TEXT PRIMARY KEY, source TEXT NOT NULL, actor TEXT,
  started_at TEXT NOT NULL, finished_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('running','succeeded','partial','failed')),
  created INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL DEFAULT 0, unchanged INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '[]'
);

-- Exchange rates as decimal strings, with provenance. Latest as_of wins.
CREATE TABLE fx_rates (
  base TEXT NOT NULL, quote TEXT NOT NULL, rate TEXT NOT NULL, source TEXT NOT NULL, as_of TEXT NOT NULL,
  PRIMARY KEY (base, quote, as_of)
);
CREATE TABLE pricing_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT);

-- One row per product/day/visitor: the only input to "trending" in W1.
CREATE TABLE product_views (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, day TEXT NOT NULL, visitor TEXT NOT NULL,
  PRIMARY KEY (product_id, day, visitor)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT, action TEXT NOT NULL, target TEXT, detail TEXT
);

CREATE VIRTUAL TABLE product_fts USING fts5(
  product_id UNINDEXED, title, description, category, brand, specs, keywords,
  tokenize = 'unicode61 remove_diacritics 2'
);
`,
  },
  {
    version: 2,
    name: 'source_call_budget',
    sql: `
-- Paid aggregator calls per source and UTC day. The adapter refuses to call once the configured daily limit is reached.
CREATE TABLE source_call_log (
  source TEXT NOT NULL, day TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  PRIMARY KEY (source, day)
);
`,
  },
  {
    version: 3,
    name: 'source_updated_at',
    sql: `
-- When the SOURCE last refreshed the listing (aggregators serve cached data; this can be much older than synced_at).
ALTER TABLE product_sources ADD COLUMN source_updated_at TEXT;
`,
  },
];
