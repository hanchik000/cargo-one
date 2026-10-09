// Image proxy for imported product photos: GET /img?u=<https url>.
// Marketplace CDNs often block hot-linked images (Referer checks) and some resized variants ("…jpg_600x600.jpg")
// no longer exist. The server fetches the photo once — only from IMAGE_HOSTS, https only, images only, size-capped —
// caches it under $DATA_DIR/img-cache and serves it from our own origin.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { safeImageUrl } from './catalog/sanitize.mjs';
import { isCommonsImage } from './car-photos.mjs';

// Imported product photos (IMAGE_HOSTS) plus the freely licensed car-model photos from Wikimedia Commons.
const proxyable = (u) => !!safeImageUrl(u) || isCommonsImage(u);

const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif', 'image/gif': '.gif' };
const inflight = new Map();

const cacheDir = () => path.join(path.resolve(process.env.DATA_DIR || '.data'), 'img-cache');

async function download(url) {
  // Redirects are followed by hand (max 3) and only while they stay on allow-listed https hosts.
  let current = url, res = null;
  for (let hop = 0; hop < 4; hop++) {
    res = await fetch(current, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': isCommonsImage(current) ? 'CARGO-ONE-image-cache/1.0 (private preview)' : 'Mozilla/5.0 (CARGO ONE image cache)', Accept: 'image/avif,image/webp,image/*;q=0.8' },
    });
    if (res.status < 300 || res.status >= 400) break;
    const next = res.headers.get('location');
    const abs = next ? new URL(next, current).toString() : null;
    if (!abs || !proxyable(abs) || hop === 3) return null;
    current = abs;
  }
  if (!res || !res.ok) return null;
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES[type]) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len > MAX_BYTES) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return null;
  return { buf, type };
}

/** Variants to try: the URL as given, then without a CDN resize suffix (…/x.jpg_600x600.jpg → …/x.jpg). */
export function candidates(url) {
  const out = [url];
  const stripped = url.replace(/(\.(?:jpe?g|png|webp|gif))_\d+x\d+(?:q\d+)?\.(?:jpe?g|webp|png)$/i, '$1');
  if (stripped !== url) out.push(stripped);
  return out;
}

async function load(url) {
  const key = crypto.createHash('sha256').update(url).digest('hex');
  const dir = cacheDir();
  for (const [type, ext] of Object.entries(TYPES)) {
    const f = path.join(dir, key + ext);
    if (fs.existsSync(f)) return { file: f, type };
  }
  const miss = path.join(dir, key + '.miss');
  if (fs.existsSync(miss) && Date.now() - fs.statSync(miss).mtimeMs < 6 * 3600_000) return null; // retry failures after 6 h
  for (const u of candidates(url)) {
    if (!proxyable(u)) continue;
    let got = null;
    try { got = await download(u); } catch { got = null; }
    if (got) {
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, key + TYPES[got.type]);
      fs.writeFileSync(f, got.buf);
      return { file: f, type: got.type };
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(miss, '');
  return null;
}

/** Handles /img requests. Returns true when handled. */
export async function handleImageProxy(req, res, url) {
  if (url.pathname !== '/img') return false;
  const target = url.searchParams.get('u') || '';
  // Only allow-listed https hosts (IMAGE_HOSTS); never local files or private addresses.
  if (req.method !== 'GET' || !/^https:\/\//i.test(target) || !proxyable(target)) { res.writeHead(400); res.end(); return true; }
  let p = inflight.get(target);
  if (!p) { p = load(target).finally(() => inflight.delete(target)); inflight.set(target, p); }
  const hit = await p;
  if (!hit) { res.writeHead(404, { 'Cache-Control': 'public, max-age=600' }); res.end(); return true; }
  res.writeHead(200, { 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=604800, immutable', 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(hit.file).pipe(res);
  return true;
}
