// Real photos of the car MODELS in the demo vehicle catalogue, from Wikimedia Commons (freely licensed).
// They show the model, not the specific listed vehicle — the UI labels them that way and credits author + licence.
// Resolved once in the background through the public Commons API and cached in $DATA_DIR/car-photos.json;
// the photos themselves are served through our image proxy (/img), which only accepts upload.wikimedia.org here.
// Disable with CAR_PHOTOS=0.
import fs from 'node:fs';
import path from 'node:path';

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'CARGO-ONE/1.0 (private preview; vehicle model photos with attribution)';
const TTL_MS = 30 * 24 * 3600_000;
const RETRY_MS = 3600_000;
const PER_CAR = 4;

/** Search queries per demo car id, tried in order until enough photos are found. */
export const CAR_PHOTO_QUERIES = {
  c1: ['intitle:"BYD Seal" -intitle:"Seal U" -intitle:"Seal 05" -intitle:"Seal 06" -intitle:"Sealion"'],
  c2: ['intitle:"BYD Song Plus"', 'intitle:"BYD Song" intitle:"DM-i"'],
  c3: ['intitle:"Galaxy E5"', 'intitle:"Geely Galaxy"'],
  c4: ['intitle:"Zeekr 001"'],
  c5: ['intitle:"Li L7"', 'intitle:"Li Auto L7"', 'intitle:"Lixiang L7"'],
  c6: ['intitle:"Tiggo 8 Pro"', 'intitle:"Chery Tiggo 8"'],
  c7: ['intitle:"UNI-V"', 'intitle:"Changan UNI"'],
  c8: ['intitle:"NIO ET5"'],
  c9: ['intitle:"Haval H6"'],
  c10: ['intitle:"Great Wall Poer"', 'intitle:"GWM Poer"', 'intitle:"Great Wall Cannon"', 'intitle:"GWM Cannon"'],
  c11: ['intitle:"Wuling Hongguang"'],
  c12: ['intitle:"BYD Dolphin" -intitle:"Mini" -intitle:"Surf"'],
  c13: ['intitle:"BYD Atto 3"', 'intitle:"BYD Yuan Plus"'],
  c14: ['intitle:"Toyota bZ3"', 'intitle:"bZ3"'],
};

const cacheFile = () => path.join(path.resolve(process.env.DATA_DIR || '.data'), 'car-photos.json');
const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
const INTERIOR = /\b(interior|int[eé]rieur|innenraum|innen|cockpit|dashboard|armaturenbrett|inside|cabin|seats?)\b/i;
const SKIP = /\b(logo|badge|emblem|wheels?|rims?|engine|motor|charging|lights?|lamps?|headlights?|taillights?|details?|keys?|screen|display|steering|plate|drawing|diagram|toy|model car|scale model|trunk|boot)\b/i;
const FREE = /^(cc[ -]?by|cc[ -]?by-sa|cc0|public domain|pd\b|attribution)/i;

/** Picks up to PER_CAR usable photos from one Commons API response (exteriors first, one interior last if any). */
export function pickPhotos(json) {
  const pages = Object.values(json?.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const ext = [], int = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const title = String(p.title || '').replace(/^File:/, '');
    const meta = ii.extmetadata || {};
    const license = stripHtml(meta.LicenseShortName?.value);
    if (!FREE.test(license) || /\bNC\b|\bND\b|fair use|non-free/i.test(license)) continue;
    if (!/^image\/(jpeg|png|webp)$/.test(ii.mime || '')) continue;
    if ((ii.width || 0) < 1000 || !ii.thumburl || !/^https:\/\/upload\.wikimedia\.org\//.test(ii.thumburl)) continue;
    if (SKIP.test(title)) continue;
    const ratio = ii.width / ii.height;
    const interior = INTERIOR.test(title);
    if (!interior && (ratio < 1.2 || ratio > 2.4)) continue;
    const photo = {
      src: ii.thumburl,
      page: /^https:\/\/commons\.wikimedia\.org\//.test(ii.descriptionurl || '') ? ii.descriptionurl : `https://commons.wikimedia.org/wiki/${encodeURIComponent('File:' + title)}`,
      author: stripHtml(meta.Artist?.value).slice(0, 80) || 'Wikimedia Commons',
      license: license.slice(0, 40),
      interior,
    };
    (interior ? int : ext).push(photo);
  }
  const out = ext.slice(0, int.length ? PER_CAR - 1 : PER_CAR);
  if (int.length) out.push(int[0]);
  return out;
}

async function search(q, fetchImpl) {
  const u = new URL(COMMONS_API);
  for (const [k, v] of Object.entries({
    action: 'query', format: 'json', formatversion: '1', generator: 'search', gsrnamespace: '6', gsrlimit: '30',
    gsrsearch: `${q} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  })) u.searchParams.set(k, v);
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
