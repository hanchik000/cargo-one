// Automatic first import: when a paid aggregator key is configured (OTAPI_KEY), the server fills the storefront
// with real AliExpress listings on its own — the same "starter set" an admin can run by hand — and then hides the
// bundled DEMO products (reversible). Costs one paid call per query (17 in total); progress is saved in
// $DATA_DIR/autoseed.json, so an interrupted run (budget, network) continues on the next start and a finished one
// never runs again. Disable with CATALOG_AUTOSEED=0.
import fs from 'node:fs';
import path from 'node:path';
import { getAdapter } from './sources/adapter.mjs';
import { runImport } from './importer.mjs';
import { publishImported, setDemoVisible } from './storefront.mjs';
import { STARTER_PAGE, starterFor } from '../../src/shared/starter.mjs';

const ACTOR = 'system:autoseed';
const stateFile = () => path.join(path.resolve(process.env.DATA_DIR || '.data'), 'autoseed.json');
let running = null;

function readState() {
  try { const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8')); return { done: Array.isArray(s.done) ? s.done : [], finishedAt: s.finishedAt || null, published: s.published || 0 }; }
  catch { return { done: [], finishedAt: null, published: 0 }; }
}
function writeState(s) {
  try { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2)); } catch (e) { console.error('[autoseed] cannot save state', e.message); }
}

export function autoSeedStatus() {
  return { ...readState(), running: !!running, enabled: process.env.CATALOG_AUTOSEED !== '0' };
}

/** Runs (once) in the background. Returns a summary; never throws. */
export function autoSeed(db, { adapter = getAdapter('ot-aliexpress'), queries = starterFor(adapter?.provider), log = (m) => console.log('[autoseed] ' + m) } = {}) {
  if (running) return running;
  running = (async () => {
    if (process.env.CATALOG_AUTOSEED === '0') return { skipped: 'disabled' };
    if (!adapter?.available) return { skipped: 'no_key' };
    const state = readState();
    if (state.finishedAt) return { skipped: 'already_done' };
    // Already filled by hand (admin starter set): don't spend paid calls again.
    const have = db.prepare("SELECT COUNT(*) AS n FROM products p JOIN product_sources s ON s.product_id = p.id WHERE s.source = ? AND p.status = 'published'").get(adapter.id).n;
    if (have >= 200) { writeState({ ...state, finishedAt: new Date().toISOString(), published: have }); return { skipped: 'already_filled' }; }
    log(`importing real products: ${queries.length - state.done.length} searches left`);
    for (const [q, categoryId] of queries) {
      if (state.done.includes(q)) continue;
      const r = await runImport(db, adapter, { actor: ACTOR, q, limit: STARTER_PAGE, categoryId, details: false });
      if (r.error || r.status === 'failed') {
        log(`stopped at "${q}": ${r.error || r.errors?.[0]?.detail || 'failed'} — will continue on the next start`);
        writeState(state);
        return { stopped: q, published: state.published };
      }
      const n = publishImported(db, r.items, ACTOR, r.id);
      state.published += n; state.done.push(q);
      writeState(state);
      log(`"${q}": ${r.created + r.updated + r.unchanged} items, ${n} published`);
    }
    if (state.published > 0) {
      const d = setDemoVisible(db, false, ACTOR);
      log(`demo products hidden: ${d.changed}`);
    }
    state.finishedAt = new Date().toISOString();
    writeState(state);
    log(`done: ${state.published} real products on the storefront`);
    return { published: state.published };
  })().catch((e) => { console.error('[autoseed]', e); return { error: String(e?.message || e) }; }).finally(() => { running = null; });
  return running;
}
