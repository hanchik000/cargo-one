// Production build: `npm run build`
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { DIST, esbuildOptions, writeCssFile, writeHtml, writeStatic, mainJsFrom } from './build-lib.mjs';

const t0 = Date.now();
await import('./export-catalog-seed.mjs'); // server demo seed stays in sync with src/data/seed.ts
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });

const result = await esbuild.build(esbuildOptions({ dev: false }));
const jsFile = mainJsFrom(result.metafile);
const css = await writeCssFile({ minify: true });
writeHtml({ jsFile, cssFile: css.name, dev: false });
writeStatic();

const outputs = Object.entries(result.metafile.outputs).filter(([f]) => f.endsWith('.js'));
const total = outputs.reduce((s, [, o]) => s + o.bytes, 0);
const main = result.metafile.outputs[Object.keys(result.metafile.outputs).find((f) => f.endsWith(jsFile))];
console.log(`✓ Built ${outputs.length} JS chunks (${(total / 1024).toFixed(0)} KB total, entry ${(main.bytes / 1024).toFixed(0)} KB) + CSS ${(css.size / 1024).toFixed(0)} KB in ${Date.now() - t0} ms`);
console.log('  Run `npm start` to serve dist/ on http://localhost:3000');
