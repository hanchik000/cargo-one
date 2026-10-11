// Builds the self-contained artifact page: one HTML body (inlined JS + CSS) plus the image files.
// Usage: node scripts/build-artifact.mjs  → artifact/index.html + artifact/img/**
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, esbuildOptions, buildCss } from './build-lib.mjs';

// --pages: the same static build for GitHub Pages (pages/ folder, full HTML document, browser-side Commons photos).
const PAGES = process.argv.includes('--pages');
const OUT = path.join(ROOT, PAGES ? 'pages' : 'artifact');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const opts = esbuildOptions({ dev: false, target: 'artifact', assetBase: './', splitting: false, pages: PAGES });
const res = await esbuild.build({ ...opts, format: 'iife', write: false, outdir: undefined, outfile: path.join(OUT, 'app.js'), entryNames: undefined, chunkNames: undefined });
const js = res.outputFiles.find((f) => f.path.endsWith('.js')).text.replace(/<\/script/gi, '<\\/script');
// The viewer only runs inline scripts or scripts from approved CDNs, so the on-device tracking library is inlined (defines window.Human).
const human = fs.readFileSync(path.join(ROOT, 'public', 'ar', 'human.js'), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = (await buildCss({ minify: true })).replace(/<\/style/gi, '<\\/style');
const html = `<title>CARGO ONE</title>
<meta name="description" content="China to Turkmenistan: find products, pay suppliers, ship cargo and buy verified vehicles.">
<meta name="theme-color" content="#F5F5F3">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700;800&family=Unbounded:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${css}</style>
<noscript>CARGO ONE requires JavaScript.</noscript>
<div id="root"></div>
<script>${js}</script>
<script>${human}</script>
`;
fs.writeFileSync(path.join(OUT, 'index.html'), PAGES ? `<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n${html.replace('<noscript>', '</head><body><noscript>')}</body></html>\n` : html);
if (PAGES) fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
fs.cpSync(path.join(ROOT, 'public', 'img'), path.join(OUT, 'img'), { recursive: true });
// Artifacts don't serve .bin, so weight shards are stored as .wasm (a served binary type) and the manifests are patched.
// TensorFlow.js reads them as raw ArrayBuffers; the extension only affects the Content-Type header.
fs.mkdirSync(path.join(OUT, 'ar', 'models'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'public', 'ar', 'models'))) {
  const src = path.join(ROOT, 'public', 'ar', 'models', f);
  if (f.endsWith('.bin')) fs.copyFileSync(src, path.join(OUT, 'ar', 'models', f.replace(/\.bin$/, '-weights.wasm')));
  else if (f.endsWith('.json')) {
    const j = JSON.parse(fs.readFileSync(src, 'utf8'));
    for (const g of j.weightsManifest || []) g.paths = g.paths.map((x) => x.replace(/\.bin$/, '-weights.wasm'));
    fs.writeFileSync(path.join(OUT, 'ar', 'models', f), JSON.stringify(j));
  }
}
fs.copyFileSync(path.join(ROOT, 'public', 'ar', 'LICENSES.txt'), path.join(OUT, 'ar', 'LICENSES.txt'));
const imgs = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else imgs.push(path.relative(OUT, p)); } })(path.join(OUT, 'img'));
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else imgs.push(path.relative(OUT, p)); } })(path.join(OUT, 'ar'));
fs.writeFileSync(path.join(OUT, 'files.json'), JSON.stringify(Object.fromEntries(imgs.map((f) => [f, `artifact/${f}`])), null, 1));
console.log(`✓ artifact/index.html ${(html.length / 1024).toFixed(0)} KB, ${imgs.length} images`);
