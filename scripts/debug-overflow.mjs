import { chromium } from 'playwright';
const [,, url, role] = process.argv;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { localStorage.setItem('cargo-one.lang', '"en"'); localStorage.setItem('cargo-one.onboarded', 'true'); });
const p = await ctx.newPage();
if (role) await p.request.post('http://localhost:4173/api/auth/demo', { data: { role } });
await p.goto('http://localhost:4173' + url); await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const rc0 = el.getBoundingClientRect(); const rc = { right: rc0.right + window.scrollX, width: rc0.width };
    if (rc.right > 390 + 1 && rc.width > 0 && !el.closest('.rail')) out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 80)} right=${Math.round(rc.right)} w=${Math.round(rc.width)}`);
  }
  const wide = [];
  for (const el of document.querySelectorAll('body *')) { if (el.scrollWidth > 390 + 1) wide.push(`${el.tagName}.${(el.className || '').toString().slice(0, 60)} sw=${el.scrollWidth} cw=${el.clientWidth}`); }
  return { sw: document.documentElement.scrollWidth, out: out.slice(0, 15), wide: wide.slice(-12) };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
