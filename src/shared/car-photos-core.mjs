// Shared by the server (server/car-photos.mjs) and the static GitHub Pages build (src/services/carPhotos.ts):
// which Wikimedia Commons searches to run per demo car, and how to pick usable, freely licensed photos.
export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
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


/** Commons API search URL (generator=search over File: pages, with image info). `cors` adds origin=* for browsers. */
export function commonsSearchUrl(q, { cors = false } = {}) {
  const u = new URL(COMMONS_API);
  const params = {
    action: 'query', format: 'json', formatversion: '1', generator: 'search', gsrnamespace: '6', gsrlimit: '30',
    gsrsearch: `${q} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
    iiextmetadatafilter: 'Artist|LicenseShortName',
  };
  if (cors) params.origin = '*';
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u;
}
