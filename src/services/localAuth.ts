// Artifact / static-demo build only: an in-browser stand-in for server/auth.mjs.
// There is no server in the published artifact, so accounts and the session live in this browser's
// localStorage. This is a DEMO: it is not a security boundary. The full build enforces every rule server-side.
import type { Role, SessionUser } from '@/lib/types';

interface StoredUser extends SessionUser { status: 'active' | 'pending' | 'suspended'; passwordHash: string | null }
const KEY_USERS = 'cargo-one.demo-users';
const KEY_SESSION = 'cargo-one.demo-session';
const DEMO_PASSWORD = 'demo1234';
const MOCK_OTP = '123456';
const DEMO_USERS: SessionUser[] = [
  { id: 'u1', name: 'Aylar Orazova', email: 'personal@cargo.one', phone: '+99365000001', role: 'personal' },
  { id: 'u2', name: 'Merdan Atayev', email: 'business@cargo.one', phone: '+99365000002', role: 'business', businessId: 'b1' },
  { id: 'u3', name: 'Li Wei', email: 'supplier@cargo.one', phone: '+8613800000003', role: 'supplier', supplierId: 's1' },
  { id: 'u4', name: 'Operations Admin', email: 'admin@cargo.one', phone: '+99365000004', role: 'admin' },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+\d{8,15}$/;

const read = <T,>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : d; } catch { return d; } };
const write = (k: string, v: unknown) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };
let memSession: string | null = null; // fallback when storage is unavailable

async function hash(password: string, salt?: string) {
  const s = salt || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(s), iterations: 60000, hash: 'SHA-256' }, key, 256);
  return `${s}:${Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
const custom = () => read<StoredUser[]>(KEY_USERS, []);
const all = (): StoredUser[] => [...DEMO_USERS.map((u) => ({ ...u, status: 'active' as const, passwordHash: 'demo' })), ...custom()];
const saveCustom = (list: StoredUser[]) => write(KEY_USERS, list);
const normEmail = (e: unknown) => String(e || '').trim().toLowerCase();
const normPhone = (p: unknown) => String(p || '').replace(/[^\d+]/g, '');
function find(identifier: unknown) {
  const email = normEmail(identifier); const phone = normPhone(identifier);
  return all().find((u) => u.email === email || (phone.length > 6 && u.phone === phone)) || null;
}
const pub = (u: StoredUser | SessionUser): SessionUser => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, businessId: u.businessId, supplierId: u.supplierId, companyName: u.companyName });
async function checkPassword(u: StoredUser, pw: string) {
  if (u.passwordHash === 'demo') return pw === DEMO_PASSWORD;
  if (!u.passwordHash) return false;
  const [salt] = u.passwordHash.split(':');
  return (await hash(pw, salt)) === u.passwordHash;
}
const otps = new Map<string, { exp: number; attempts: number; payload: Record<string, string> }>();
const issue = (k: string, payload: Record<string, string> = {}) => { otps.set(k, { exp: Date.now() + 300000, attempts: 0, payload }); return MOCK_OTP; };
function checkOtp(k: string, code: unknown) {
  const r = otps.get(k);
  if (!r || Date.now() > r.exp) { otps.delete(k); return { ok: false as const, error: 'otp_expired' }; }
  if (++r.attempts > 5) { otps.delete(k); return { ok: false as const, error: 'too_many_attempts' }; }
  if (String(code) !== MOCK_OTP) return { ok: false as const, error: 'otp_invalid' };
  otps.delete(k); return { ok: true as const, payload: r.payload };
}
function startSession(u: SessionUser) { memSession = u.id; write(KEY_SESSION, u.id); }
function currentUser(): SessionUser | null {
  const id = read<string | null>(KEY_SESSION, null) || memSession;
  const u = id ? all().find((x) => x.id === id) : null;
  return u && u.status === 'active' ? pub(u) : null;
}
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');

type Res = { status: number; data: Record<string, unknown> };
export async function localAuthApi(path: string, body: Record<string, unknown> = {}, method = 'POST'): Promise<Res> {
  const ok = (data: Record<string, unknown>): Res => ({ status: 200, data });
  const fail = (status: number, error: string): Res => ({ status, data: { error } });
  await new Promise((r) => setTimeout(r, 220)); // feel like a network call
  switch (path) {
    case '/api/auth/session': return ok({ user: currentUser(), demoMode: true });
    case '/api/auth/logout': memSession = null; write(KEY_SESSION, null); return ok({ ok: true });
    case '/api/auth/login': {
      if (!body.identifier || !body.password) return fail(400, 'missing_fields');
      const u = find(body.identifier);
      if (!u || !(await checkPassword(u, String(body.password)))) return fail(401, 'invalid_credentials');
      if (u.status !== 'active') return fail(403, 'account_suspended');
      startSession(u); return ok({ user: pub(u) });
    }
    case '/api/auth/otp/request': {
      const phone = normPhone(body.phone);
      if (!PHONE_RE.test(phone)) return fail(400, 'invalid_phone');
      const purpose = body.purpose === 'register' ? 'register' : 'login';
      if (purpose === 'login' && !find(phone)) return fail(404, 'user_not_found');
      return ok({ sent: true, devCode: issue(`${purpose}:${phone}`) });
    }
    case '/api/auth/otp/verify': {
      const phone = normPhone(body.phone);
      const purpose = body.purpose === 'register' ? 'register' : 'login';
      const r = checkOtp(`${purpose}:${phone}`, body.code);
      if (!r.ok) return fail(400, r.error);
      let u: StoredUser | null;
      if (purpose === 'register') {
        const list = custom(); u = list.find((x) => x.id === r.payload.userId) || null;
        if (!u) return fail(404, 'user_not_found');
        u.status = 'active'; saveCustom(list);
      } else u = find(phone);
      if (!u) return fail(404, 'user_not_found');
      startSession(u); return ok({ user: pub(u) });
    }
    case '/api/auth/register': {
      const name = String(body.name || '').trim(); const email = normEmail(body.email); const phone = normPhone(body.phone); const password = String(body.password || '');
      const accountType: Role = body.accountType === 'business' ? 'business' : 'personal'; // admin/supplier can never self-register
      if (name.length < 2) return fail(400, 'invalid_name');
      if (!EMAIL_RE.test(email)) return fail(400, 'invalid_email');
      if (!PHONE_RE.test(phone)) return fail(400, 'invalid_phone');
      if (password.length < 8) return fail(400, 'weak_password');
      if (accountType === 'business' && String(body.companyName || '').trim().length < 2) return fail(400, 'invalid_company');
      if (find(email) || find(phone)) return fail(409, 'user_exists');
      const u: StoredUser = { id: 'u_' + rid(), name, email, phone, role: accountType, status: 'pending', passwordHash: await hash(password),
        companyName: accountType === 'business' ? String(body.companyName).trim() : undefined, businessId: accountType === 'business' ? 'b_' + rid() : undefined };
      saveCustom([...custom(), u]);
      return ok({ pending: true, phone, devCode: issue(`register:${phone}`, { userId: u.id }) });
    }
    case '/api/auth/forgot': { const u = find(body.identifier); if (u) issue(`reset:${u.id}`); return ok({ sent: true, devCode: MOCK_OTP }); }
    case '/api/auth/reset': {
      const u = find(body.identifier);
      if (!u) return fail(400, 'otp_invalid');
      const r = checkOtp(`reset:${u.id}`, body.code);
      if (!r.ok) return fail(400, r.error);
      if (String(body.password || '').length < 8) return fail(400, 'weak_password');
      if (u.passwordHash === 'demo') return fail(400, 'demo_locked');
      const list = custom(); const t = list.find((x) => x.id === u.id); if (t) { t.passwordHash = await hash(String(body.password)); saveCustom(list); }
      return ok({ ok: true });
    }
    case '/api/auth/demo': {
      const u = DEMO_USERS.find((x) => x.role === body.role);
      if (!u) return fail(400, 'invalid_role');
      startSession(u); return ok({ user: pub(u) });
    }
    case '/api/auth/oauth/google': case '/api/auth/oauth/apple': {
      const provider = path.endsWith('google') ? 'google' : 'apple';
      const email = `${provider}.user@demo.cargo.one`;
      let u = find(email);
      if (!u) { u = { id: `u_${provider}`, name: provider === 'google' ? 'Google Demo User' : 'Apple Demo User', email, phone: provider === 'google' ? '+99365000091' : '+99365000092', role: 'personal', status: 'active', passwordHash: null }; saveCustom([...custom(), u]); }
      startSession(u); return ok({ user: pub(u), mock: true });
    }
    case '/api/admin/users': {
      const s = currentUser();
      if (!s || s.role !== 'admin') return fail(403, 'forbidden');
      if (method === 'POST') {
        const list = custom(); const t = list.find((x) => x.id === body.id);
        if (!t) return fail(400, 'demo_locked');
        if (body.status === 'active' || body.status === 'suspended') t.status = body.status;
        if (['personal', 'business', 'supplier', 'admin'].includes(String(body.role))) t.role = body.role as Role;
        saveCustom(list); return ok({ user: pub(t) });
      }
      return ok({ users: all().map((u) => ({ ...pub(u), status: u.status })) });
    }
  }
  return fail(404, 'not_found');
}
