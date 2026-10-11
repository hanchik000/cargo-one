// Static asset URLs (product/vehicle renders, hero images). The base differs between the server build ('/') and the static demo build ('./').
export const ASSET_BASE: string = typeof __ASSET_BASE__ === 'string' ? __ASSET_BASE__ : '/';
export const IS_STATIC_DEMO = typeof __TARGET__ === 'string' && __TARGET__ === 'artifact';
/**
 * Local asset path → URL. Remote https photos (allow-listed on import) are served through the server's image proxy
 * (/img?u=…) in the server build: marketplace CDNs often refuse hot-linked images. The static demo links them directly.
 */
export const asset = (path: string) => {
  if (/^https:\/\//i.test(path)) return IS_STATIC_DEMO ? path : `/img?u=${encodeURIComponent(path)}`;
  return ASSET_BASE + path.replace(/^\//, '');
};

/**
 * Marketplace photos linked directly (static site): ask the CDN for a resized copy first (full-size originals are
 * several MB each and crash mobile Safari when a grid shows dozens), then fall back to the original.
 */
const RESIZABLE = /^https:\/\/[a-z0-9.-]*(alicdn\.com|aliexpress-media\.com)\/.+\.(jpe?g|png|webp)$/i;
export function photoSources(path: string, px: 350 | 640 = 350): string[] {
  if (!IS_STATIC_DEMO || !RESIZABLE.test(path)) return [asset(path)];
  return [`${path}_${px}x${px}.jpg`, path];
}
