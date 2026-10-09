// SQLite database for CARGO ONE (Node's built-in `node:sqlite`, no extra dependency).
// File: $DATA_DIR/cargo-one.sqlite. Migrations are versioned, applied in order inside a transaction, and recorded
// in `schema_migrations`. PostgreSQL is the target for production scale (see docs/W1_MARKETPLACE_FOUNDATION.md);
// the schema avoids SQLite-only features apart from FTS5, which sits behind the repository's search function.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { MIGRATIONS } from './migrations.mjs';

let db = null;

export function dataDir() { return path.resolve(process.env.DATA_DIR || '.data'); }

/** Opens (once) and migrates the database. `file` = ':memory:' for tests. */
export function getDb(file = process.env.DB_FILE || path.join(dataDir(), 'cargo-one.sqlite')) {
  if (db) return db;
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  migrate(db);
  return db;
}

export function closeDb() { if (db) { db.close(); db = null; } }

export function migrate(d) {
  d.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)');
  const done = new Set(d.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    tx(d, () => {
      d.exec(m.sql);
      d.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, new Date().toISOString());
    });
  }
}

/** Runs fn inside a transaction (nested calls join the outer one). */
let depth = 0;
export function tx(d, fn) {
  if (depth > 0) return fn();
  depth++;
  d.exec('BEGIN IMMEDIATE');
  try { const r = fn(); d.exec('COMMIT'); return r; }
  catch (e) { try { d.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
  finally { depth--; }
}
