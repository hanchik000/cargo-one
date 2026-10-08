// Static asset URLs (product/vehicle renders, hero images). The base differs between the server build ('/') and the static demo build ('./').
export const ASSET_BASE: string = typeof __ASSET_BASE__ === 'string' ? __ASSET_BASE__ : '/';
/** Local asset path → URL. Absolute https URLs (validated server-side) pass through unchanged. */
export const asset = (path: string) => (/^https:\/\//i.test(path) ? path : ASSET_BASE + path.replace(/^\//, ''));
export const IS_STATIC_DEMO = typeof __TARGET__ === 'string' && __TARGET__ === 'artifact';
