// Localization sweep for the marketplace pages in RU and TK (and EN as control).
// Fails on page errors, raw i18n keys in the UI, or untranslated W1 strings.
// Usage: npm run build && PORT=4173 npm start  (in another shell)  then  node scripts/lang-sweep.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const ROUTES = ['/', '/shop', '/shop?q=%D0%BD%D0%B0%D1%83%D1%88%D0%BD%D0%B8%D0%BA%D0%B8', '/shop/category/electronics', '/shop/p1', '/shop/p20', '/compare', '/suppliers/s1', '/shop/doesnotexist'];
// Strings that must appear translated on the given route (EN text must NOT appear in RU/TK).
const EXPECT = {
  '/': { en: 'New arrivals', ru: 'Новинки', tk: 'Täze harytlar' },
  '/shop/p1': { en: 'Estimate · not a confirmed quote', ru: 'Оценка · не подтверждённая цена', tk: 'Çaklama · tassyklanan baha däl' },
};
const RAW_KEY = /\b(cat|basis|home|admin|price|product)\.[a-z_]+(\.[a-z0-9_]+)?\b/;

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failures = 0, checks = 0;
for (const lang of ['en', 'ru', 'tk']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript((l) => { try { localStorage.setItem('cargo-one.lang', JSON.stringify(l)); localStorage.setItem('cargo-one.onboarded', 'true'); } catch { /* */ } }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  for (const route of ROUTES) {
    checks++;
    errors.length = 0;
    await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch((e) => errors.push(e.message));
    await page.waitForTimeout(400);
    const text = await page.locator('main, body').first().innerText().catch(() => '');
    const problems = [...errors];
    const raw = text.match(RAW_KEY);
    if (raw) problems.push(`raw key "${raw[0]}"`);
    if (/Something went wrong/.test(text)) problems.push('error state');
    const exp = EXPECT[route.split('?')[0]];
    if (exp) {
      // innerText applies CSS text-transform (headings are uppercase), so compare case-insensitively
      const low = text.toLocaleLowerCase();
      if (!low.includes(exp[lang].toLocaleLowerCase())) problems.push(`missing "${exp[lang]}"`);
      if (lang !== 'en' && low.includes(exp.en.toLocaleLowerCase())) problems.push(`untranslated "${exp.en}"`);
    }
    if (problems.length) { failures++; console.log(`✗ [${lang}] ${route} — ${problems.join('; ')}`); }
    else console.log(`✓ [${lang}] ${route}`);
  }
  await ctx.close();
}
await browser.close();
console.log(`\n${checks - failures}/${checks} localized route checks passed`);
process.exit(failures ? 1 : 0);
