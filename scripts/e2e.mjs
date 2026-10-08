// End-to-end QA run: route sweep (mobile + desktop) and the main user journeys.
// Usage: npm run build && PORT=4173 npm start  (in another shell)  then  node scripts/e2e.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:4173';
const OUT = path.resolve('test-results');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const problems = [];
const log = (ok, name, detail = '') => { results.push({ ok, name, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

const UI_LANG = process.env.UI_LANG || 'en';
async function newContext(kind) {
  const ctx = await browser.newContext(kind === 'mobile'
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((lang) => {
    try {
      if (!localStorage.getItem('cargo-one.lang')) localStorage.setItem('cargo-one.lang', JSON.stringify(lang));
      localStorage.setItem('cargo-one.onboarded', 'true');
    } catch { /* ignore */ }
  }, UI_LANG);
  return ctx;
}

function watch(page, label) {
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|fonts\.g|ERR_NAME_NOT_RESOLVED|net::ERR|Failed to load resource/.test(m.text())) problems.push(`[${label}] console: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`[${label}] HTTP ${r.status()} ${r.url()}`); });
}

async function demoLogin(page, role) {
  const res = await page.request.post(`${BASE}/api/auth/demo`, { data: { role }, headers: { 'Content-Type': 'application/json' } });
  if (!res.ok()) throw new Error(`demo login ${role} failed ${res.status()}`);
}

let currentPage = null;
async function step(name, fn) {
  try { await fn(); log(true, name); }
  catch (e) {
    log(false, name, e.message.split('\n').slice(0, 3).join(' | '));
    if (currentPage) await currentPage.screenshot({ path: path.join(OUT, `FAIL-${name.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png`) }).catch(() => {});
  }
}

async function shot(page, name) { await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false }).catch(() => {}); }

async function noErrorState(page) {
  const crash = await page.locator('text=Something went wrong').count();
  if (crash) throw new Error('error state rendered');
}

// ---------------------------------------------------------------- route sweep
const PUBLIC = ['/', '/shop', '/shop/category/electronics', '/shop/p1', '/shop/p33', '/compare', '/cart', '/find', '/find?mode=url', '/ai-buyer', '/suppliers', '/suppliers/s1', '/suppliers/s10', '/track', '/track?q=CO-10028', '/group-buy', '/group-buy/g1', '/group-buy/g4', '/auto', '/auto/c1', '/auto/c9', '/auto/c3', '/auto/search?q=verified%20electric%20under%20%2425000%202023%20or%20newer', '/auto/compare', '/vip', '/vip/promotion', '/support', '/login', '/register', '/forgot-password', '/reset-password', '/onboarding', '/forbidden', '/does-not-exist'];
const PERSONAL = ['/profile', '/profile?section=personal', '/profile?section=addresses', '/profile?section=payments', '/profile?section=cars', '/profile?section=security', '/profile?section=language', '/profile?section=notifications', '/orders', '/orders/o1', '/orders/o2', '/cargo', '/cargo/consolidate', '/cargo/sh1', '/notifications', '/favorites', '/favorites?tab=car', '/favorites?tab=search', '/checkout', '/pay', '/auto/reservations/r1'];
const BUSINESS = ['/business', '/business?tab=orders', '/business?tab=invoices', '/business?tab=quotes', '/business?tab=suppliers', '/pay/inv1', '/pay/inv2', '/pay/inv3'];
const SUPPLIER = ['/supplier', '/supplier?tab=orders', '/supplier?tab=products', '/supplier?tab=quotes', '/supplier?tab=documents', '/supplier?tab=payouts'];
const ADMIN = ['/admin', ...['users', 'orders', 'products', 'suppliers', 'payments', 'invoices', 'cargo', 'cars', 'inspections', 'vip', 'promotions', 'notifications', 'content', 'translations', 'analytics', 'settings'].map((s) => `/admin/${s}`)];

for (const kind of process.env.SKIP_SWEEP ? [] : (process.env.SWEEP_KINDS || 'desktop,mobile').split(',')) {
  for (const [role, routes] of [[null, PUBLIC], ['personal', PERSONAL], ['business', BUSINESS], ['supplier', SUPPLIER], ['admin', ADMIN]]) {
    const ctx = await newContext(kind);
    const page = await ctx.newPage();
    watch(page, `${kind}/${role || 'guest'}`);
    if (role) await demoLogin(page, role);
    for (const r of routes) {
      await step(`[${kind}] ${role || 'guest'} ${r}`, async () => {
        const resp = await page.goto(BASE + r, { waitUntil: 'domcontentloaded' });
        if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp && resp.status()}`);
        await page.waitForTimeout(900);
        await noErrorState(page);
        const overflow = await page.evaluate((w) => document.documentElement.scrollWidth - w, kind === 'mobile' ? 390 : 1440);
        if (overflow > 2) throw new Error(`horizontal overflow ${overflow}px`);
        await shot(page, `${kind}-${(role || 'guest')}-${r.replace(/[^a-z0-9]+/gi, '_')}`);
      });
    }
    await ctx.close();
  }
}

if (process.env.SWEEP_ONLY) { await browser.close(); const f = results.filter((r) => !r.ok); console.log(`\n${results.length - f.length}/${results.length} checks passed, ${[...new Set(problems)].length} runtime problems`); [...new Set(problems)].forEach((p) => console.log('  ! ' + p)); process.exit(f.length ? 1 : 0); }

// ---------------------------------------------------------------- access control
await step('server blocks guests from /admin', async () => {
  const ctx = await newContext('desktop'); const page = await ctx.newPage();
  await page.goto(BASE + '/admin'); if (!page.url().includes('/login')) throw new Error(page.url()); await ctx.close();
});
await step('server blocks personal user from /admin and /supplier and /business', async () => {
  const ctx = await newContext('desktop'); const page = await ctx.newPage();
  await demoLogin(page, 'personal');
  for (const r of ['/admin', '/supplier', '/business']) { await page.goto(BASE + r); if (!page.url().includes('/forbidden')) throw new Error(`${r} → ${page.url()}`); }
  await ctx.close();
});
await step('tampered session cookie is rejected', async () => {
  const ctx = await newContext('desktop'); const page = await ctx.newPage();
  const fake = Buffer.from(JSON.stringify({ uid: 'u4', role: 'admin', exp: Date.now() + 1e9 })).toString('base64url') + '.forged';
  await ctx.addCookies([{ name: 'co_session', value: fake, url: BASE }]);
  await page.goto(BASE + '/admin'); if (!page.url().includes('/login')) throw new Error(page.url()); await ctx.close();
});
await step('registration cannot create admin role', async () => {
  const ctx = await newContext('desktop'); const page = await ctx.newPage();
  const r = await page.request.post(BASE + '/api/auth/register', { data: { name: 'Hacker', email: `h${Date.now()}@x.tm`, phone: `+9936${String(Date.now()).slice(-7)}`, password: 'password123', accountType: 'admin' } });
  const otp = (await r.json()).devCode; const phone = (await r.json()).phone;
  const v = await page.request.post(BASE + '/api/auth/otp/verify', { data: { phone, code: otp, purpose: 'register' } });
  const user = (await v.json()).user; if (user.role !== 'personal') throw new Error('role escalated: ' + user.role); await ctx.close();
});

// ---------------------------------------------------------------- journey 1: register → onboarding → buy → track → delivered
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => { try { if (!localStorage.getItem('cargo-one.lang')) localStorage.setItem('cargo-one.lang', '"en"'); } catch { /* */ } });
  const page = await ctx.newPage(); watch(page, 'journey1'); currentPage = page;
  const stamp = String(Date.now()).slice(-7);
  await step('J1 register new personal user', async () => {
    await page.goto(BASE + '/register');
    await page.getByLabel('Full name').fill('Test Buyer');
    await page.getByLabel('Email').fill(`buyer${stamp}@example.tm`);
    await page.getByLabel('Phone number').fill(`+9936${stamp}`);
    await page.getByLabel('Password').fill('secret123!');
    await page.locator('label', { hasText: 'I accept the Terms' }).first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL(/\/otp/);
  });
  await step('J1 OTP verification', async () => {
    const dev = new URL(page.url()).searchParams.get('dev');
    for (let i = 0; i < 6; i++) await page.getByLabel(`Digit ${i + 1}`).fill(dev[i]);
    await page.waitForURL(/\/onboarding/, { timeout: 8000 });
  });
  await step('J1 onboarding 3 screens', async () => {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await shot(page, 'j1-onboarding-3');
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.waitForURL(BASE + '/');
    await page.getByText('What are you looking for?').waitFor();
  });
  await step('W1 Home is marketplace-first (discovery before cargo)', async () => {
    await page.getByRole('heading', { name: 'New arrivals' }).waitFor();
    const y = async (loc) => (await loc.first().boundingBox())?.y ?? Infinity;
    const cats = await y(page.getByRole('heading', { name: 'Categories' }));
    const arrivals = await y(page.getByRole('heading', { name: 'New arrivals' }));
    const support = await y(page.getByRole('heading', { name: 'Orders and delivery' }));
    if (!(cats < arrivals && arrivals < support)) throw new Error(`order: categories ${cats}, new arrivals ${arrivals}, orders/cargo ${support}`);
    if (await page.getByRole('heading', { name: 'Trending now' }).count()) throw new Error('trending shown without view data');
    await page.getByText('Picked by CARGO ONE', { exact: false }).first().waitFor();
  });
  await step('J1 search product from home', async () => {
    await page.getByPlaceholder(/Search products/).fill('earbuds');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/shop\?q=earbuds/);
    await page.locator('article a[href^="/shop/p"]').first().click();
    await page.getByRole('heading', { level: 1 }).waitFor();
  });
  await step('J1 add to cart → checkout', async () => {
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await page.goto(BASE + '/cart');
    await page.getByRole('button', { name: 'Checkout' }).first().click();
    await page.waitForURL(/\/checkout/);
  });
  await step('J1 checkout: add address', async () => {
    await page.getByRole('button', { name: 'New address' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Recipient name').fill('Test Buyer');
    await dlg.getByLabel('Recipient phone').fill(`+9936${stamp}`);
    await dlg.getByLabel('District').fill('Berkararlyk');
    await dlg.getByLabel('Street').fill('Garashsyzlyk avenue');
    await dlg.getByLabel('Building').fill('12');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Continue' }).first().click();
  });
  await step('J1 checkout: delivery + add card + pay', async () => {
    await page.getByRole('radio', { name: /Express air/ }).click();
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await page.getByRole('button', { name: 'Add card' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Card number').fill('4242 4242 4242 4242');
    await dlg.getByLabel('Expiry').fill('1230');
    await dlg.getByLabel('Cardholder').fill('TEST BUYER');
    await dlg.getByRole('button', { name: 'Save card' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Continue' }).first().click();
    await shot(page, 'j1-checkout-review');
    await page.getByRole('button', { name: /Confirm and pay/ }).click();
    await page.waitForURL(/\/orders\/.+placed=1/, { timeout: 10000 });
    await page.getByText('Order confirmed').waitFor();
    await shot(page, 'j1-order-placed');
  });
  await step('J1 track → advance to delivered', async () => {
    await page.getByRole('button', { name: 'Track' }).click();
    await page.waitForURL(/\/track\?q=/);
    const btn = page.getByRole('button', { name: 'Advance to next status' });
    await btn.waitFor();
    for (let i = 0; i < 14 && (await btn.count()); i++) { await btn.click(); await page.waitForTimeout(1100); }
    if (await btn.count()) throw new Error('shipment did not reach delivered');
    await page.getByText('Handed to the recipient.').waitFor();
    await shot(page, 'j1-delivered');
  });
  await step('J1 order shows delivered', async () => {
    await page.goto(BASE + '/orders?tab=completed');
    await page.locator('main a[href^="/orders/"]').first().waitFor();
  });
  // FIND by photo
  await step('J2 find by photo → result → add to cart', async () => {
    await page.goto(BASE + '/find?mode=image');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.locator('input[type=file]').setInputFiles({ name: 'douyin-bag.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Find it' }).click();
    await page.getByText('Best match').first().waitFor({ timeout: 8000 });
    await shot(page, 'j2-find-results');
    await page.getByRole('button', { name: 'Add' }).first().click();
  });
  // VIP
  await step('J6 VIP subscribe → active → promotion', async () => {
    await page.goto(BASE + '/vip');
    await page.getByRole('button', { name: 'Activate VIP' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /Pay/ }).click();
    await page.getByText('VIP activated').waitFor({ timeout: 8000 });
    await shot(page, 'j6-vip-activated');
    await page.getByRole('button', { name: 'Monthly campaign' }).click();
    await page.waitForURL(/\/vip\/promotion/);
    await page.getByText('entries this month').waitFor();
  });
  // Language
  await step('Language switch to RU and TKM', async () => {
    await page.goto(BASE + '/');
    await page.getByRole('button', { name: 'RU' }).first().click();
    await page.getByText('Что вы ищете?').waitFor();
    await page.getByRole('button', { name: 'TKM' }).first().click();
    await page.getByText('Näme gözleýärsiňiz?').waitFor();
    await shot(page, 'lang-tk-home');
    await page.reload(); await page.getByText('Näme gözleýärsiňiz?').waitFor();
    await page.getByRole('button', { name: 'ENG' }).first().click();
  });
  await step('Command palette Ctrl+K', async () => {
    await page.keyboard.press('Control+k');
    await page.getByPlaceholder(/Products, suppliers/).fill('BYD');
    await page.getByRole('option').first().waitFor();
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/(auto|shop)\//);
  });
  await step('Logout clears session', async () => {
    await page.goto(BASE + '/profile?section=security');
    await page.getByRole('button', { name: 'Log out' }).first().click();
    await page.waitForTimeout(500);
    await page.goto(BASE + '/orders');
    if (!page.url().includes('/login')) throw new Error('still logged in');
  });
  await ctx.close();
}

// ---------------------------------------------------------------- business journeys
{
  const ctx = await newContext('desktop'); const page = await ctx.newPage(); watch(page, 'business'); currentPage = page;
  await demoLogin(page, 'business');
  await step('J3 AI Buyer → supplier options → request quote', async () => {
    await page.goto(BASE + '/ai-buyer');
    await page.getByLabel('Your procurement request').fill('I need 500 premium black boxes with magnetic closure under $5,000');
    await page.keyboard.press('Enter');
    await page.getByText('Supplier options').waitFor({ timeout: 8000 });
    await shot(page, 'j3-ai-buyer');
    await page.getByRole('button', { name: 'Request quote' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.goto(BASE + '/business?tab=quotes');
    await page.getByText('Qty 500').first().waitFor();
  });
  await step('J4 upload invoice → review → pay supplier → supplier paid', async () => {
    await page.goto(BASE + '/pay');
    await page.locator('input[type=file]').setInputFiles({ name: 'packwell-invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 demo') });
    await page.waitForURL(/\/pay\/inv/, { timeout: 8000 });
    await shot(page, 'j4-invoice-review');
    await page.getByText('I am authorised').click();
    await page.getByText('This payment is for goods').click();
    await page.getByText('I agree to partner bank').click();
    await page.getByRole('button', { name: 'Pay supplier' }).click();
    await page.getByText('Under review').first().waitFor({ timeout: 8000 });
    await page.getByText('Supplier paid', { exact: false }).first().waitFor({ timeout: 40000 });
    await shot(page, 'j4-invoice-status');
  });
  await step('Business repeat order adds to cart', async () => {
    await page.goto(BASE + '/business');
    await page.getByRole('button', { name: 'Repeat order' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reorder' }).first().click();
    await page.getByText('Items added to cart').waitFor();
    await page.goto(BASE + '/cart'); await page.getByText('Order summary').waitFor();
  });
  await ctx.close();
}

// ---------------------------------------------------------------- AR try-on journey
{
  const ctx = await newContext('mobile'); const page = await ctx.newPage(); watch(page, 'tryon'); currentPage = page;
  const placed = () => page.waitForFunction(() => document.querySelector('[data-testid=tryon-stage]')?.getAttribute('data-placed') === '1', null, { timeout: 20000 });
  await step('Try-on: product page → AR studio → demo mannequin', async () => {
    await page.goto(BASE + '/shop/p12');
    await page.getByRole('link', { name: /Try on with your camera/ }).click();
    await page.waitForURL(/\/try-on\?p=p12/);
    await page.getByRole('button', { name: 'Demo model' }).click();
    await placed();
    await shot(page, 'tryon-glasses');
  });
  await step('Try-on: switch item + adjust + snapshot', async () => {
    await page.getByRole('button', { name: 'Hoodie' }).click();
    await page.waitForURL(/p=p39/);
    await placed();
    await page.getByRole('button', { name: 'Adjust fit' }).click();
    await page.getByRole('button', { name: 'Bigger' }).click();
    await page.getByRole('button', { name: 'Take a photo' }).click();
    const dlg = page.getByRole('dialog', { name: 'Your try-on' });
    await dlg.getByRole('img').waitFor();
    await shot(page, 'tryon-snapshot');
    await dlg.getByRole('button', { name: 'Close' }).click();
  });
  await step('Try-on: every item places on the mannequin', async () => {
    for (const label of ['Earbuds', 'Headphones', 'Cap', 'Watch', 'Phone case', 'Coat', 'Bag', 'Sneakers']) {
      await page.getByRole('button', { name: label, exact: true }).first().click();
      await placed();
    }
  });
  await step('Try-on: blocked camera shows a fallback', async () => {
    await page.goto(BASE + '/try-on?p=p37');
    await page.getByRole('button', { name: 'Turn on camera' }).click();
    const alert = page.getByRole('alert');
    await alert.waitFor({ timeout: 20000 });
    await alert.getByRole('button', { name: 'Demo model' }).click();
    await placed();
  });
  await step('Shop: try-on filter shows only AR items', async () => {
    await page.goto(BASE + '/shop?ar=1');
    await page.locator('article').first().waitFor();
    const n = await page.locator('article').count();
    if (n !== 10) throw new Error('expected 10 try-on items, got ' + n);
  });
  await ctx.close();
}

// ---------------------------------------------------------------- auto journey
{
  const ctx = await newContext('mobile'); const page = await ctx.newPage(); watch(page, 'auto'); currentPage = page;
  await demoLogin(page, 'personal');
  await step('J5 AI car search → verified vehicle → inspection → reserve → track', async () => {
    await page.goto(BASE + '/auto/search?q=' + encodeURIComponent('Find a verified Chinese electric car under $25,000, 2023 or newer, less than 50,000 km, no serious accident'));
    await page.getByText('Understood requirements').waitFor({ timeout: 8000 });
    await shot(page, 'j5-auto-search');
    await page.locator('li a[href^="/auto/c"]').nth(1).click();
    await page.getByText(/Inspection report|CARGO ONE Verified/).first().waitFor();
    await page.getByText(/point inspection/).first().waitFor();
    await shot(page, 'j5-car-inspection');
    await page.getByRole('button', { name: 'Reserve' }).last().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText('I have read the inspection report').click();
    await dlg.getByRole('button', { name: /deposit/ }).click();
    await page.waitForURL(/\/auto\/reservations\//, { timeout: 10000 });
    await page.getByRole('button', { name: 'Advance to next status' }).click();
    await page.waitForTimeout(800);
    await shot(page, 'j5-reservation');
    await page.getByRole('link', { name: 'Track' }).click();
    await page.waitForURL(/\/track/);
  });
  await step('Consolidate packages', async () => {
    await page.goto(BASE + '/cargo/consolidate');
    await page.getByRole('button', { name: 'Consolidate shipment' }).click();
    await page.waitForURL(/\/cargo\/sh/, { timeout: 8000 });
    await page.getByText('Consolidated').first().waitFor();
  });
  await step('Group buy join (payment reservation)', async () => {
    await page.goto(BASE + '/group-buy/g2');
    await page.getByRole('button', { name: 'Join group buy' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: /Reserve/ }).click();
    await page.getByText("You're in").waitFor({ timeout: 8000 });
  });
  await step('Declined test card shows payment failure', async () => {
    await page.goto(BASE + '/vip');
    await page.getByRole('button', { name: 'Activate VIP' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: 'Add card' }).click();
    const add = page.getByRole('dialog').last();
    await add.getByLabel('Card number').fill('4000 0000 0000 0002');
    await add.getByLabel('Expiry').fill('1230');
    await add.getByLabel('Cardholder').fill('DECLINE TEST');
    await add.getByRole('button', { name: 'Save card' }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('dialog').getByRole('button', { name: /Pay/ }).click();
    await page.getByText(/declined/i).waitFor({ timeout: 8000 });
  });
  await step('Support ticket creation', async () => {
    await page.goto(BASE + '/support?category=cargo&ref=CO-10028');
    await page.getByLabel('Subject').fill('Where is my parcel CO-10028?');
    await page.getByLabel('Message').fill('It has been in transit for two weeks, please check.');
    await page.getByRole('button', { name: 'Send request' }).click();
    await page.getByText('CARGO ONE support').first().waitFor({ timeout: 8000 });
  });
  await ctx.close();
}

// ---------------------------------------------------------------- admin & supplier
{
  const ctx = await newContext('desktop'); const page = await ctx.newPage(); watch(page, 'admin'); currentPage = page;
  await demoLogin(page, 'admin');
  await step('Admin: create product and toggle publish', async () => {
    await page.goto(BASE + '/admin/products');
    await page.getByRole('button', { name: 'New product' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Title').fill('QA Test Thermos 500ml');
    await dlg.getByLabel('Price').first().fill('45');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.getByRole('link', { name: 'QA Test Thermos 500ml' }).waitFor();
    const href = await page.getByRole('link', { name: 'QA Test Thermos 500ml' }).getAttribute('href');
    if (!/\/shop\/p/.test(href)) throw new Error('bad product id ' + href);
    await page.locator('tr', { hasText: 'QA Test Thermos 500ml' }).getByRole('switch').click();
    await page.getByText('Published').first().waitFor();
  });
  // ---- W1 marketplace foundation
  await step('W1 Admin: fixture import creates sample drafts (not live)', async () => {
    await page.goto(BASE + '/admin/catalog');
    await page.getByText('Sample fixture (not a live marketplace)').first().waitFor();
    await page.getByText('Planned · not implemented').first().waitFor();
    await page.getByRole('button', { name: 'Run import' }).click();
    await page.getByText(/created, \d+ updated/).first().waitFor({ timeout: 10000 });
    await page.goto(BASE + '/admin/products');
    await page.getByText('Sample import · not live').first().waitFor();
  });
  await step('W1 Product page: demo provenance, source block, estimate label', async () => {
    await page.goto(BASE + '/shop/p1');
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.getByText('Demo data').first().waitFor();
    await page.getByText('Estimate · not a confirmed quote').first().waitFor();
    await page.getByRole('button', { name: /Source and data freshness/ }).click();
    await page.getByText('Curated by CARGO ONE. No external source is linked.').waitFor();
  });
  await step('W1 Unpriced sample product cannot be ordered', async () => {
    const r = await page.request.get(BASE + '/api/catalog/products?includeUnpublished=1&pageSize=500');
    const items = (await r.json()).items;
    const raincoat = items.find((x) => x.sample && x.pricing.status === 'unavailable');
    const thermos = items.find((x) => x.sample && x.pricing.status === 'incomplete');
    if (!raincoat || !thermos) throw new Error('fixture products missing');
    await page.goto(BASE + '/shop/' + raincoat.id);
    await page.getByText('Price unavailable').first().waitFor();
    await page.getByText('Sample import · not live').first().waitFor();
    if (!(await page.getByRole('button', { name: 'Add to cart' }).first().isDisabled())) throw new Error('add to cart enabled for unpriced product');
    await page.goto(BASE + '/shop/' + thermos.id);
    await page.getByText('Total not calculated').first().waitFor();
    await page.getByRole('button', { name: /^Supplier/ }).click();
    await page.getByText('Seller information not available').first().waitFor();
    const bad = await page.request.get(BASE + '/api/catalog/products/' + encodeURIComponent('x y'));
    if (bad.status() !== 400) throw new Error('invalid id not rejected');
  });
  await step('Admin: record inspection for pending car and verify it', async () => {
    await page.goto(BASE + '/admin/cars');
    const row = page.locator('tr', { hasText: 'Dolphin' });
    await row.getByRole('button', { name: 'Upload inspection' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Inspector', { exact: true }).fill('QA Inspector');
    await dlg.getByRole('button', { name: 'Save inspection' }).click();
    await dlg.waitFor({ state: 'detached', timeout: 8000 });
    await row.getByRole('button', { name: 'Verify' }).click();
    await page.waitForTimeout(800);
    await row.getByText('Verified').waitFor();
  });
  await step('Admin: edit VIP campaign prize', async () => {
    await page.goto(BASE + '/admin/promotions');
    await page.locator('tbody tr', { hasText: 'Campaign' }).first().getByRole('button', { name: 'Edit' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Prize', { exact: true }).fill('iPhone 17 Pro Max');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.goto(BASE + '/vip/promotion');
    await page.getByText('iPhone 17 Pro Max').waitFor();
  });
  await step('Admin: add partner → shown in Trusted by', async () => {
    await page.goto(BASE + '/admin/content');
    await page.getByRole('tab', { name: /^Partners/ }).click();
    await page.getByRole('button', { name: 'Add partner' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Company name').fill('Test Logistics LLC');
    await dlg.getByLabel('Website').fill('not-a-url');
    await dlg.getByText('Use a full https:// address.').waitFor();
    await dlg.getByLabel('Website').fill('https://example.com');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.goto(BASE + '/');
    await page.getByRole('heading', { name: 'Companies we work with' }).waitFor();
    await page.getByRole('img', { name: 'Test Logistics LLC' }).first().waitFor({ state: 'attached' });
  });
  await step('Admin: new promo banner → shown on home', async () => {
    await page.goto(BASE + '/admin/content');
    await page.getByRole('tab', { name: /^Promo banners/ }).click();
    await page.getByRole('button', { name: 'New banner' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('Title', { exact: true }).fill('Autumn test banner');
    await dlg.getByLabel('Button text').fill('Open');
    await dlg.getByRole('button', { name: 'Add image' }).first().click();
    await dlg.getByRole('button', { name: 'Save' }).click();
    await dlg.waitFor({ state: 'detached' });
    await page.goto(BASE + '/');
    await page.getByText('Autumn test banner').first().waitFor({ state: 'attached' });
    await page.getByRole('tab', { name: '6 / 6' }).click();
    await page.getByRole('link', { name: 'Open' }).first().waitFor();
  });
  await step('Admin: cargo status update', async () => {
    await page.goto(BASE + '/admin/cargo');
    await page.locator('tbody tr').first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Mark delivered' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
  });
  await step('Admin: translation override applies live', async () => {
    await page.goto(BASE + '/admin/translations');
    await page.getByPlaceholder('Search key or text').fill('home.hero');
    await page.locator('tr', { hasText: 'home.hero' }).first().getByRole('button', { name: 'Edit' }).click();
    await page.getByRole('dialog').locator('textarea').fill('Что вам нужно из Китая?');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    await page.evaluate(() => localStorage.setItem('cargo-one.lang', '"ru"'));
    try { await page.goto(BASE + '/'); await page.getByText('Что вам нужно из Китая?').waitFor({ timeout: 8000 }); }
    finally { await page.evaluate(() => localStorage.setItem('cargo-one.lang', '"en"')); }
  });
  await step('Admin: broadcast notification', async () => {
    await page.goto(BASE + '/admin/notifications');
    await page.getByLabel('Title').fill('Rail departure moved');
    await page.getByLabel('Message').fill('This Tuesday departure leaves Yiwu on Wednesday.');
    await page.getByRole('button', { name: 'Send' }).first().click();
    await page.getByText(/Sent to \d+ users/).waitFor();
  });
  await ctx.close();
  const sctx = await newContext('desktop'); const sp = await sctx.newPage(); watch(sp, 'supplier'); currentPage = sp;
  await demoLogin(sp, 'supplier');
  await step('Supplier: respond to quote and update stock', async () => {
    await sp.goto(BASE + '/supplier?tab=quotes');
    await sp.getByRole('button', { name: 'Respond' }).first().click();
    const dlg = sp.getByRole('dialog');
    await dlg.getByLabel('Unit price').fill('7.2');
    await dlg.getByLabel('Message').fill('Price includes logo printing.');
    await dlg.getByRole('button', { name: 'Send' }).click();
    await dlg.waitFor({ state: 'detached' });
    await sp.goto(BASE + '/supplier?tab=products');
    const inp = sp.getByLabel('Stock').first();
    await inp.fill('77'); await inp.blur(); await sp.waitForTimeout(700);
    await sp.getByText('Stock updated').waitFor();
  });
  await sctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
const uniqueProblems = [...new Set(problems)];
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ results, problems: uniqueProblems }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} checks passed, ${uniqueProblems.length} runtime problems`);
uniqueProblems.slice(0, 40).forEach((p) => console.log('  ! ' + p));
process.exitCode = failed.length || uniqueProblems.length ? 1 : 0;
