// Development server with rebuild-on-change and live reload: `npm run dev`
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { DIST, SRC, esbuildOptions, writeCssFile, writeHtml, writeStatic, mainJsFrom } from './build-lib.mjs';
import { createAppServer } from '../server/server.mjs';

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
writeStatic();

const clients = new Set();
const notify = () => { for (const c of clients) c.write('data: reload\n\n'); };
let cssFile = '';

const ctx = await esbuild.context({
  ...esbuildOptions({ dev: true }),
  plugins: [{
    name: 'cargo-one-dev',
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length) return;
        try {
          cssFile = (await writeCssFile({ minify: false })).name;
          writeHtml({ jsFile: mainJsFrom(result.metafile), cssFile, dev: true });
          notify();
          console.log(`[dev] rebuilt ${new Date().toLocaleTimeString()}`);
        } catch (e) { console.error('[dev] css/html error', e); }
      });
    },
  }],
});
await ctx.watch();

// Rebuild CSS when only styles change.
fs.watch(path.join(SRC, 'styles'), { recursive: true }, async () => { await ctx.rebuild().catch(() => {}); });

const port = Number(process.env.PORT || 3000);
createAppServer({ distDir: DIST, dev: true, onDevClient: (res) => { clients.add(res); res.on('close', () => clients.delete(res)); } })
  .listen(port, () => console.log(`CARGO ONE dev server → http://localhost:${port}`));
