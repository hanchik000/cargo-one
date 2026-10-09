// CARGO ONE HTTP server: static assets, SPA fallback, auth API and server-side route protection.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { handleAuthApi, readSession, policyFor } from './auth.mjs';
import { handleCatalogApi, catalogDb } from './catalog/api.mjs';
import { handleImageProxy } from './image-proxy.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.map': 'application/json', '.bin': 'application/octet-stream',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
};

function readBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

// Optional site-wide password (HTTP Basic auth) for private previews on a public URL.
// Enabled when SITE_PASSWORD_SHA256 (hex sha256 of the password) is set; user name from SITE_USER (default "cargo").
const SITE_HASH = (process.env.SITE_PASSWORD_SHA256 || '').trim().toLowerCase();
const SITE_USER = process.env.SITE_USER || 'cargo';
function siteAuthorized(req) {
  if (!SITE_HASH) return true;
  const m = /^Basic\s+(.+)$/i.exec(req.headers.authorization || '');
  if (!m) return false;
  const [user, ...rest] = Buffer.from(m[1], 'base64').toString().split(':');
  const got = crypto.createHash('sha256').update(rest.join(':')).digest();
  const want = Buffer.from(SITE_HASH, 'hex');
  return user === SITE_USER && want.length === got.length && crypto.timingSafeEqual(got, want);
}

export function createAppServer({ distDir, dev = false, onDevClient } = {}) {
  const root = path.resolve(distDir);
  const secure = process.env.COOKIE_SECURE === '1';
  catalogDb(); // open + migrate + seed the catalogue once at startup

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    // Health check for the hosting platform (no data, no auth).
    if (pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end('ok'); }
    if (!siteAuthorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="CARGO ONE preview", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Password required');
    }

    const send = (status, data, cookie) => {
      const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
      if (cookie) headers['Set-Cookie'] = cookie;
      res.writeHead(status, headers);
      res.end(JSON.stringify(data));
    };

    // Dev live-reload channel
    if (dev && pathname === '/__reload') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write('retry: 1000\n\n');
      onDevClient?.(res);
      return;
    }

    // Cached proxy for imported product photos
    if (pathname === '/img') {
      try { if (await handleImageProxy(req, res, url)) return; } catch (e) { console.error(e); if (!res.headersSent) { res.writeHead(502); res.end(); } return; }
    }

    // API
    if (pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'POST') return send(405, { error: 'method_not_allowed' });
      if (req.method === 'POST') {
        // Basic CSRF defence: JSON content type + same-origin check
        const origin = req.headers.origin;
        // Behind a trusted HTTPS proxy (e.g. GitHub Codespaces port forwarding) the public host arrives in X-Forwarded-Host.
        const host = process.env.TRUST_PROXY === '1' && req.headers['x-forwarded-host'] ? String(req.headers['x-forwarded-host']).split(',')[0].trim() : req.headers.host;
        let originHost = null;
        try { originHost = origin ? new URL(origin).host : null; } catch { return send(403, { error: 'bad_origin' }); }
        // Extra allowed public hosts, e.g. the Codespaces forwarded address (set by .devcontainer/start.sh).
        const allowed = (process.env.ALLOWED_ORIGIN_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
        const fwd = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
        const ok = !origin || originHost === host || originHost === req.headers.host || (process.env.TRUST_PROXY === '1' && originHost === fwd) || allowed.includes(String(originHost).toLowerCase());
        if (!ok) return send(403, { error: 'bad_origin' });
        if (!String(req.headers['content-type'] || '').includes('application/json')) return send(415, { error: 'json_required' });
      }
      let body = {};
      try { if (req.method === 'POST') body = await readBody(req); } catch (e) { return send(400, { error: e.message }); }
      try {
        if (await handleCatalogApi(req, pathname, url, body, { send }) !== false) return;
        return await handleAuthApi(req, res, pathname, body, { secure, send });
      } catch (e) { console.error(e); if (!res.headersSent) send(500, { error: 'server_error' }); return; }
    }

    // Static files
    const filePath = path.join(root, pathname);
    if (filePath.startsWith(root) && pathname !== '/' && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const immutable = pathname.startsWith('/assets/') && !dev;
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
      return fs.createReadStream(filePath).pipe(res);
    }
    if (path.extname(pathname) && !pathname.endsWith('.html')) { res.writeHead(404); return res.end('Not found'); }

    // Server-side page protection (the client router repeats this check for UX only).
    const policy = policyFor(pathname);
    if (policy) {
      const session = readSession(req);
      const next = encodeURIComponent(pathname + url.search);
      if (!session) { res.writeHead(302, { Location: `/login?next=${next}` }); return res.end(); }
      if (policy.roles !== 'any' && !policy.roles.includes(session.role)) { res.writeHead(302, { Location: `/forbidden?from=${next}` }); return res.end(); }
    }

    const index = path.join(root, 'index.html');
    if (!fs.existsSync(index)) { res.writeHead(503); return res.end('Build not found. Run `npm run build` first.'); }
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    fs.createReadStream(index).pipe(res);
  });
}

// Run directly: `npm start`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3000);
  createAppServer({ distDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist') })
    .listen(port, () => console.log(`CARGO ONE running at http://localhost:${port}`));
}
