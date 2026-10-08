// Untrusted-content helpers for source data. External text is reduced to plain text; URLs are allow-listed.

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** HTML/markup → plain text. Removes script/style blocks, tags, control and bidi-override characters; collapses spaces. */
export function cleanText(value, max = 2000) {
  if (value == null) return null;
  let s = String(value);
  s = s.replace(/<(script|style|iframe|object)[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  s = s.replace(CONTROL, '');
  s = s.replace(/[ \t\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i;

/** A link to the original listing: https only, no credentials, no private hosts. Returns the normalised URL or null. */
export function safeHttpsUrl(value, max = 2000) {
  if (typeof value !== 'string' || value.length > max) return null;
  let u;
  try { u = new URL(value.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || PRIVATE_HOST.test(u.hostname)) return null;
  return u.toString();
}

/** Image hosts allowed for imported images (comma-separated in IMAGE_HOSTS). Empty by default: only local assets. */
export function allowedImageHosts() {
  return (process.env.IMAGE_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
}
const LOCAL_ASSET = /^img\/[a-z0-9/_.-]+\.(webp|png|jpe?g|avif)$/i;

/** Image URL: a local asset path (img/…) or an https URL on an allow-listed host. */
export function safeImageUrl(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (LOCAL_ASSET.test(v) && !v.includes('..')) return v;
  const url = safeHttpsUrl(v);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase();
  return allowedImageHosts().some((h) => host === h || host.endsWith('.' + h)) ? url : null;
}

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const isId = (v) => typeof v === 'string' && ID_RE.test(v);
export const LANGS = ['en', 'ru', 'tk'];
export const isLang = (v) => LANGS.includes(v);
