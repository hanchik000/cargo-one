// Translation QA: lists static keys used in code that are missing from the dictionary,
// dynamic key families (template literals), and dictionary entries with an empty language.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src');
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(e.name) && !p.includes(`${path.sep}i18n${path.sep}`)) files.push(p); } })(SRC);

const used = new Set(); const dynamic = new Map();
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\b(?:t|tk)\(\s*'([a-z0-9_.]+)'/gi)) used.add(m[1]);
  for (const m of s.matchAll(/\blabel:\s*'([a-z]+\.[a-z0-9_.]+)'/gi)) used.add(m[1]);
  for (const m of s.matchAll(/as '([a-z]+\.[a-z0-9_.]+)'/gi)) used.add(m[1]);
  for (const m of s.matchAll(/\['(track\.[a-z_]+)'/g)) used.add(m[1]);
  for (const m of s.matchAll(/\b(?:t|tk)\(\s*`/g)) {
    // read template literal with balanced ${...}
    let i = m.index + m[0].length, out = '', depth = 0;
    while (i < s.length) {
      const ch = s[i];
      if (depth === 0 && ch === '`') break;
      if (depth === 0 && ch === '$' && s[i + 1] === '{') { depth = 1; out += '*'; i += 2; continue; }
      if (depth > 0) { if (ch === '{') depth++; else if (ch === '}') depth--; i++; continue; }
      out += ch; i++;
    }
    dynamic.set(out, (dynamic.get(out) || 0) + 1);
  }
  for (const m of s.matchAll(/statusKey\('([a-z]+)'/g)) dynamic.set(`status.${m[1]}.*`, 1);
}

const out = path.join(ROOT, 'node_modules', '.cache-i18n.mjs');
await esbuild.build({ entryPoints: [path.join(SRC, 'i18n', 'strings.ts')], bundle: true, format: 'esm', outfile: out, platform: 'node', logLevel: 'error' });
const { STRINGS } = await import(pathToFileURL(out).href + `?t=${Date.now()}`);
const keys = new Set(Object.keys(STRINGS));
const missing = [...used].filter((k) => !keys.has(k)).sort();
const empty = Object.entries(STRINGS).filter(([, v]) => !Array.isArray(v) || v.length !== 3 || v.some((x) => !String(x).trim())).map(([k]) => k);
const dyn = [...dynamic.keys()].sort();
const dynMissing = [];
for (const pat of dyn) {
  const re = new RegExp('^' + pat.replace(/\./g, '\\.').replace(/\*/g, '[a-z0-9_]+') + '$', 'i');
  if (![...keys].some((k) => re.test(k))) dynMissing.push(pat);
}
console.log(`dictionary: ${keys.size} keys · static keys used: ${used.size}`);
if (missing.length) console.log(`\nMISSING (${missing.length}):\n` + missing.join('\n'));
if (empty.length) console.log(`\nINCOMPLETE TRANSLATIONS (${empty.length}):\n` + empty.join('\n'));
console.log(`\nDYNAMIC FAMILIES (${dyn.length}):\n` + dyn.join('\n'));
if (dynMissing.length) console.log(`\nDYNAMIC FAMILIES WITH NO KEYS:\n` + dynMissing.join('\n'));
process.exitCode = missing.length || empty.length || dynMissing.length ? 1 : 0;
