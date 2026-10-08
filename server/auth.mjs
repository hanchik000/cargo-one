// CARGO ONE — server-side authentication (mock identity provider).
// Sessions are HMAC-signed, httpOnly cookies. Roles are decided here, never by the client.
// Replace `userStore` with a real database and `otpProvider` with an SMS gateway in production.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SECRET = process.env.AUTH_SECRET || 'dev-only-insecure-secret-change-me';
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('[auth] AUTH_SECRET is not set — using an insecure development secret.');
}
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const DEMO_MODE = process.env.DEMO_MODE !== 'off';
const DATA_DIR = path.resolve(process.env.DATA_DIR || '.data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
export const COOKIE = 'co_session';

// ---------- password hashing ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 32);
  const buf = Buffer.from(hash, 'hex');
  return buf.length === check.length && crypto.timingSafeEqual(buf, check);
}

// ---------- user store (mock persistence) ----------
// IDs of demo users match the client seed data (src/data/seed.ts).
const DEMO_PASSWORD = 'demo1234';
const DEMO_USERS = [
  { id: 'u1', name: 'Aylar Orazova', email: 'personal@cargo.one', phone: '+99365000001', role: 'personal' },
  { id: 'u2', name: 'Merdan Atayev', email: 'business@cargo.one', phone: '+99365000002', role: 'business', businessId: 'b1' },
  { id: 'u3', name: 'Li Wei', email: 'supplier@cargo.one', phone: '+8613800000003', role: 'supplier', supplierId: 's1' },
  { id: 'u4', name: 'Operations Admin', email: 'admin@cargo.one', phone: '+99365000004', role: 'admin' },
];

let users = new Map();
function loadUsers() {
  users = new Map();
  for (const u of DEMO_USERS) users.set(u.id, { ...u, status: 'active', passwordHash: hashPassword(DEMO_PASSWORD), verified: true });
  try {
    const saved = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    for (const u of saved) if (!users.has(u.id)) users.set(u.id, u);
  } catch { /* no saved users yet */ }
}
function saveUsers() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const custom = [...users.values()].filter((u) => !DEMO_USERS.some((d) => d.id === u.id));
    fs.writeFileSync(USERS_FILE, JSON.stringify(custom, null, 2));
  } catch (e) { console.warn('[auth] could not persist users', e.message); }
}
loadUsers();

const normEmail = (e) => String(e || '').trim().toLowerCase();
const normPhone = (p) => String(p || '').replace(/[^\d+]/g, '');
function findUser(identifier) {
  const id = String(identifier || '').trim();
  const email = normEmail(id);
  const phone = normPhone(id);
  for (const u of users.values()) {
    if (u.email === email || (phone.length > 6 && u.phone === phone)) return u;
  }
  return null;
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, businessId: u.businessId, supplierId: u.supplierId, companyName: u.companyName });

// ---------- OTP provider (mock SMS gateway) ----------
const otps = new Map(); // key -> { code, exp, attempts, payload }
const MOCK_OTP = '123456';
function issueOtp(key, payload = {}) {
  const code = process.env.OTP_FIXED_CODE || MOCK_OTP; // a real SMS provider would generate a random code
  otps.set(key, { code, exp: Date.now() + 5 * 60_000, attempts: 0, payload });
  return code;
}
function checkOtp(key, code) {
  const rec = otps.get(key);
  if (!rec) return { ok: false, error: 'otp_expired' };
  if (Date.now() > rec.exp) { otps.delete(key); return { ok: false, error: 'otp_expired' }; }
  rec.attempts++;
  if (rec.attempts > 5) { otps.delete(key); return { ok: false, error: 'too_many_attempts' }; }
  if (String(code) !== rec.code) return { ok: false, error: 'otp_invalid' };
  otps.delete(key);
  return { ok: true, payload: rec.payload };
}

// ---------- sessions ----------
const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
export function createSessionCookie(user, secure) {
  const payload = b64(JSON.stringify({ uid: user.id, role: user.role, exp: Date.now() + SESSION_TTL_MS }));
  const token = `${payload}.${sign(payload)}`;
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`;
}
export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

export function readSession(req) {
  const raw = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith(COOKIE + '='));
  if (!raw) return null;
  const token = raw.slice(COOKIE.length + 1);
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (Date.now() > data.exp) return null;
    const user = users.get(data.uid);
    if (!user || user.status !== 'active') return null;
    return publicUser(user); // role comes from the server-side store, not the cookie body alone
  } catch { return null; }
}

// ---------- route policy (shared by page gating and API) ----------
export const ROUTE_POLICY = [
  { prefix: '/admin', roles: ['admin'] },
  { prefix: '/supplier', roles: ['supplier', 'admin'] },
  { prefix: '/business', roles: ['business', 'admin'] },
  { prefix: '/profile', roles: 'any' },
  { prefix: '/orders', roles: 'any' },
  { prefix: '/checkout', roles: 'any' },
  { prefix: '/pay', roles: 'any' },
  { prefix: '/cargo', roles: 'any' },
  { prefix: '/favorites', roles: 'any' },
  { prefix: '/notifications', roles: 'any' },
  { prefix: '/support/tickets', roles: 'any' },
  { prefix: '/auto/reservations', roles: 'any' },
];
export function policyFor(pathname) {
  for (const p of ROUTE_POLICY) {
    if (pathname === p.prefix || pathname.startsWith(p.prefix + '/')) return p;
  }
  return null;
}

// ---------- validation helpers ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+\d{8,15}$/;

// ---------- API handlers ----------
export async function handleAuthApi(req, res, pathname, body, { secure, send }) {
  const ok = (data, cookie) => send(200, data, cookie);
  const fail = (status, error) => send(status, { error });

  switch (pathname) {
    case '/api/auth/session':
      return ok({ user: readSession(req), demoMode: DEMO_MODE });

    case '/api/auth/logout':
      return send(200, { ok: true }, clearSessionCookie());

    case '/api/auth/login': {
      const { identifier, password } = body;
      if (!identifier || !password) return fail(400, 'missing_fields');
      const user = findUser(identifier);
      if (!user || !user.passwordHash || !verifyPassword(String(password), user.passwordHash)) return fail(401, 'invalid_credentials');
      if (user.status !== 'active') return fail(403, 'account_suspended');
      return ok({ user: publicUser(user) }, createSessionCookie(user, secure));
    }

    case '/api/auth/otp/request': {
      const phone = normPhone(body.phone);
      if (!PHONE_RE.test(phone)) return fail(400, 'invalid_phone');
      const purpose = body.purpose === 'register' ? 'register' : 'login';
      if (purpose === 'login' && !findUser(phone)) return fail(404, 'user_not_found');
      const code = issueOtp(`${purpose}:${phone}`);
      return ok({ sent: true, devCode: DEMO_MODE ? code : undefined });
    }

    case '/api/auth/otp/verify': {
      const phone = normPhone(body.phone);
      const purpose = body.purpose === 'register' ? 'register' : 'login';
      const r = checkOtp(`${purpose}:${phone}`, body.code);
      if (!r.ok) return fail(400, r.error);
      let user;
      if (purpose === 'register') {
        user = users.get(r.payload.userId);
        if (!user) return fail(404, 'user_not_found');
        user.status = 'active';
        user.verified = true;
        saveUsers();
      } else {
        user = findUser(phone);
        if (!user) return fail(404, 'user_not_found');
      }
      return ok({ user: publicUser(user) }, createSessionCookie(user, secure));
    }

    case '/api/auth/register': {
      const name = String(body.name || '').trim();
      const email = normEmail(body.email);
      const phone = normPhone(body.phone);
      const password = String(body.password || '');
      const accountType = body.accountType === 'business' ? 'business' : 'personal'; // admin/supplier can never self-register
      if (name.length < 2) return fail(400, 'invalid_name');
      if (!EMAIL_RE.test(email)) return fail(400, 'invalid_email');
      if (!PHONE_RE.test(phone)) return fail(400, 'invalid_phone');
      if (password.length < 8) return fail(400, 'weak_password');
      if (accountType === 'business' && String(body.companyName || '').trim().length < 2) return fail(400, 'invalid_company');
      if (findUser(email) || findUser(phone)) return fail(409, 'user_exists');
      const user = {
        id: 'u_' + crypto.randomBytes(6).toString('hex'), name, email, phone, role: accountType,
        companyName: accountType === 'business' ? String(body.companyName).trim() : undefined,
        businessId: accountType === 'business' ? 'b_' + crypto.randomBytes(4).toString('hex') : undefined,
        status: 'pending', verified: false, passwordHash: hashPassword(password), createdAt: new Date().toISOString(),
      };
      users.set(user.id, user);
      saveUsers();
      const code = issueOtp(`register:${phone}`, { userId: user.id });
      return ok({ pending: true, phone, devCode: DEMO_MODE ? code : undefined });
    }

    case '/api/auth/forgot': {
      const user = findUser(body.identifier);
      // Always answer the same way so the endpoint does not reveal which accounts exist.
      let devCode;
      if (user) devCode = issueOtp(`reset:${user.id}`);
      return ok({ sent: true, devCode: DEMO_MODE ? devCode || MOCK_OTP : undefined });
    }

    case '/api/auth/reset': {
      const user = findUser(body.identifier);
      if (!user) return fail(400, 'otp_invalid');
      const r = checkOtp(`reset:${user.id}`, body.code);
      if (!r.ok) return fail(400, r.error);
      if (String(body.password || '').length < 8) return fail(400, 'weak_password');
      user.passwordHash = hashPassword(String(body.password));
      saveUsers();
      return ok({ ok: true });
    }

    case '/api/auth/demo': {
      if (!DEMO_MODE) return fail(403, 'demo_disabled');
      const user = DEMO_USERS.find((u) => u.role === body.role);
      if (!user) return fail(400, 'invalid_role');
      return ok({ user: publicUser(users.get(user.id)) }, createSessionCookie(users.get(user.id), secure));
    }

    case '/api/auth/oauth/google':
    case '/api/auth/oauth/apple': {
      const provider = pathname.endsWith('google') ? 'google' : 'apple';
      const configured = provider === 'google' ? process.env.GOOGLE_CLIENT_ID : process.env.APPLE_CLIENT_ID;
      if (configured) {
        // Real OAuth would redirect to the provider here and complete in a callback route.
        return fail(501, 'oauth_not_wired');
      }
      if (!DEMO_MODE) return fail(503, 'provider_unavailable');
      // Mock provider: signs in a deterministic demo identity for that provider.
      const email = `${provider}.user@demo.cargo.one`;
      let user = findUser(email);
      if (!user) {
        user = { id: `u_${provider}`, name: provider === 'google' ? 'Google Demo User' : 'Apple Demo User', email, phone: provider === 'google' ? '+99365000091' : '+99365000092', role: 'personal', status: 'active', verified: true, passwordHash: null };
        users.set(user.id, user);
        saveUsers();
      }
      return ok({ user: publicUser(user), mock: true }, createSessionCookie(user, secure));
    }

    case '/api/admin/users': {
      const s = readSession(req);
      if (!s || s.role !== 'admin') return fail(403, 'forbidden');
      if (req.method === 'POST') {
        const target = users.get(body.id);
        if (!target) return fail(404, 'user_not_found');
        if (body.status && ['active', 'suspended'].includes(body.status)) target.status = body.status;
        if (body.role && ['personal', 'business', 'supplier', 'admin'].includes(body.role)) target.role = body.role;
        saveUsers();
        return ok({ user: publicUser(target) });
      }
      return ok({ users: [...users.values()].map((u) => ({ ...publicUser(u), status: u.status })) });
    }
  }
  return fail(404, 'not_found');
}
