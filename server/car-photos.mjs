// Real photos of the car MODELS in the demo vehicle catalogue, from Wikimedia Commons (freely licensed).
// They show the model, not the specific listed vehicle — the UI labels them that way and credits author + licence.
// Resolved once in the background through the public Commons API and cached in $DATA_DIR/car-photos.json;
// the photos themselves are served through our image proxy (/img), which only accepts upload.wikimedia.org here.
// Disable with CAR_PHOTOS=0.
import fs from 'node:fs';
import path from 'node:path';

import { CAR_PHOTO_QUERIES, pickPhotos, commonsSearchUrl } from '../src/shared/car-photos-core.mjs';

export { CAR_PHOTO_QUERIES, pickPhotos };
const UA = 'CARGO-ONE/1.0 (private preview; vehicle model photos with attribution)';
const TTL_MS = 30 * 24 * 3600_000;
const RETRY_MS = 3600_000;
const cacheFile = () => path.join(path.resolve(process.env.DATA_DIR || '.data'), 'car-photos.json');

async function search(q, fetchImpl) {
  const u = commonsSearchUrl(q);
  const r = await fetchImpl(u, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error('commons_http_' + r.status);
  return pickPhotos(await r.json());
}

let state = null; // { resolvedAt, failedAt, photos: { carId: Photo[] } }
let pending = null;

function load() {
  if (state) return state;
  try { state = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')); } catch { state = { resolvedAt: null, failedAt: null, photos: {} }; }
  if (!state.photos || typeof state.photos !== 'object') state.photos = {};
  return state;
}
function save() {
  try { fs.mkdirSync(path.dirname(cacheFile()), { recursive: true }); fs.writeFileSync(cacheFile(), JSON.stringify(state, null, 1)); } catch (e) { console.error('[car-photos] cannot save', e.message); }
}

/** Resolves photos for every car (sequentially, politely). Never throws. */
export function resolveCarPhotos({ fetchImpl = fetch } = {}) {
  if (pending) return pending;
  pending = (async () => {
    const s = load();
    let ok = 0, failed = 0;
    for (const [id, queries] of Object.entries(CAR_PHOTO_QUERIES)) {
      let found = [];
      for (const q of queries) {
        try { found = await search(q, fetchImpl); } catch { failed++; found = []; }
        if (found.length >= 2) break;
      }
      if (found.length) { s.photos[id] = found; ok++; }
    }
    if (ok) { s.resolvedAt = new Date().toISOString(); s.failedAt = null; } else s.failedAt = new Date().toISOString();
    save();
    console.log(`[car-photos] ${ok} car models with real photos${failed ? `, ${failed} failed searches` : ''}`);
  })().catch((e) => console.error('[car-photos]', e)).finally(() => { pending = null; });
  return pending;
}

/** Payload for GET /api/media/car-photos. Kicks off (re)resolution in the background when needed. */
export async function carPhotosPayload() {
  if (process.env.CAR_PHOTOS === '0') return { photos: {}, pending: false, enabled: false };
  const s = load();
  const stale = !s.resolvedAt || Date.now() - Date.parse(s.resolvedAt) > TTL_MS;
  const mayRetry = !s.failedAt || Date.now() - Date.parse(s.failedAt) > RETRY_MS;
  if (stale && mayRetry && !pending) resolveCarPhotos();
  return { photos: s.photos, pending: !!pending, enabled: true, source: 'Wikimedia Commons' };
}

/** Image proxy allow-list addition: Commons thumbnails only. */
export const isCommonsImage = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'upload.wikimedia.org' && !x.username && !x.password && (!x.port || x.port === '443'); } catch { return false; }
};
