// Exports the demo catalogue (src/data/seed.ts) + category names (src/i18n) to JSON the server can load.
// Output: server/catalog/seed/demo-catalog.json. Run by `npm run build`; the server seeds an EMPTY database from it
// only when CATALOG_DEMO_SEED is not "off". Everything in it is demo data and is flagged `demo` in the database.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const entry = `export { products, suppliers, categories } from './src/data/seed';\nexport { STRINGS } from './src/i18n/strings';`;
const out = await esbuild.build({
  stdin: { contents: entry, resolveDir: ROOT, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node',
  alias: { '@': path.join(ROOT, 'src') }, logLevel: 'error', define: { __ASSET_BASE__: '"/"', __TARGET__: '"server"' },
});
const mod = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const LANGS = ['en', 'ru', 'tk'];
const catName = (id) => Object.fromEntries(LANGS.map((l, i) => [l, mod.STRINGS[`cat.${id}`]?.[i] ?? id]));
const data = {
  generatedFrom: 'src/data/seed.ts', note: 'DEMO DATA — fictional products and suppliers for development and demos.',
  categories: mod.categories.map((c) => ({ id: c.id, icon: c.icon, order: c.order, visible: c.visible, names: catName(c.id) })),
  suppliers: mod.suppliers.map((s) => ({ ...s })),
  products: mod.products.map((p) => ({ ...p })),
};
const file = path.join(ROOT, 'server', 'catalog', 'seed', 'demo-catalog.json');
fs.writeFileSync(file, JSON.stringify(data, null, 1));
console.log(`✓ demo catalogue: ${data.products.length} products, ${data.suppliers.length} suppliers → ${path.relative(ROOT, file)}`);
