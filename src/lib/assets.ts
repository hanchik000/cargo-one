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
