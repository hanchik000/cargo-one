// Shared build pipeline: esbuild (TS/React, code-split) + Tailwind v4 compile API + HTML/SEO files.
import * as esbuild from 'esbuild';
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const SRC = path.join(ROOT, 'src');
export const DIST = path.join(ROOT, 'dist');
const SITE_URL = process.env.SITE_URL || 'https://cargo.one';

const PUBLIC_ROUTES = ['/', '/shop', '/find', '/ai-buyer', '/suppliers', '/track', '/group-buy', '/auto', '/auto/search', '/vip', '/vip/promotion', '/support', '/login', '/register'];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Candidate extraction for Tailwind (replaces the native oxide scanner).
function extractCandidates() {
  const set = new Set();
  for (const f of walk(SRC)) {
    const text = fs.readFileSync(f, 'utf8');
    for (const tok of text.split(/[\s"'`{}()<>;,]+/)) {
      if (tok && tok.length < 120 && /^[!-]?[a-z@\[]/.test(tok)) set.add(tok);
    }
    // Arbitrary values may contain commas/parentheses, e.g. text-[clamp(30px,9.5vw,48px)].
    for (const tok of text.split(/[\s"'`{}<>;]+/)) {
      if (tok && tok.length < 160 && tok.includes('[') && /^[!-]?[a-z@\[]/.test(tok)) set.add(tok);
    }
  }
  return [...set];
}

export async function buildCss({ minify }) {
  const twBase = path.join(ROOT, 'node_modules', 'tailwindcss');
  const input = fs.readFileSync(path.join(SRC, 'styles', 'app.css'), 'utf8');
  const compiler = await compile(input, {
    base: SRC,
    loadStylesheet: async (id, base) => {
      let file;
      if (id === 'tailwindcss') file = path.join(twBase, 'index.css');
      else if (id.startsWith('tailwindcss/')) file = path.join(twBase, id.slice(12) + (id.endsWith('.css') ? '' : '.css'));
      else file = path.resolve(base, id);
      return { path: file, base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
    },
    loadModule: async () => { throw new Error('Tailwind JS plugins are not used in this project'); },
  });
  let css = compiler.build(extractCandidates());
  if (minify) css = (await esbuild.transform(css, { loader: 'css', minify: true })).code;
  return css;
}

export function esbuildOptions({ dev, target = 'server', assetBase = '/', outdir, splitting = true, pages = false }) {
  return {
    entryPoints: [path.join(SRC, 'main.tsx')],
    bundle: true,
    splitting,
    format: 'esm',
    outdir: outdir || path.join(DIST, 'assets'),
    entryNames: '[name]-[hash]',
    chunkNames: 'chunks/[name]-[hash]',
    minify: !dev,
    sourcemap: dev ? 'linked' : false,
    target: ['es2020'],
    jsx: 'automatic',
    metafile: true,
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    define: { 'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'), __DEV__: String(dev), __ASSET_BASE__: JSON.stringify(assetBase), __TARGET__: JSON.stringify(target), __PAGES__: String(!!pages) },
    logLevel: 'warning',
  };
}

export function writeHtml({ jsFile, cssFile, dev }) {
  const tpl = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
  const reload = dev ? `<script>new EventSource('/__reload').onmessage=()=>location.reload()</script>` : '';
  const html = tpl
    .replace('<!--SPLASH-->', fs.readFileSync(path.join(SRC, 'splash.html'), 'utf8'))
    .replace('<!--CSS-->', `<link rel="stylesheet" href="/assets/${cssFile}">`)
    .replace('<!--JS-->', `<script type="module" src="/assets/${jsFile}"></script>${reload}`)
    .replaceAll('%SITE_URL%', SITE_URL);
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
}

export function writeStatic() {
  const pub = path.join(ROOT, 'public');
  if (fs.existsSync(pub)) fs.cpSync(pub, DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /supplier\nDisallow: /business\nDisallow: /profile\nDisallow: /checkout\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`);
  const today = new Date().toISOString().slice(0, 10);
  const urls = PUBLIC_ROUTES.map((r) => `  <url><loc>${SITE_URL}${r}</loc><lastmod>${today}</lastmod></url>`).join('\n');
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}

export async function writeCssFile({ minify }) {
  const css = await buildCss({ minify });
  const hash = crypto.createHash('sha1').update(css).digest('hex').slice(0, 8);
  const name = `app-${hash}.css`;
  for (const f of fs.readdirSync(path.join(DIST, 'assets'))) if (/^app-.*\.css$/.test(f)) fs.rmSync(path.join(DIST, 'assets', f));
  fs.writeFileSync(path.join(DIST, 'assets', name), css);
  return { name, size: css.length };
}

export function mainJsFrom(metafile) {
  const out = Object.entries(metafile.outputs).find(([, o]) => o.entryPoint && o.entryPoint.endsWith('main.tsx'));
  return path.basename(out[0]);
}
