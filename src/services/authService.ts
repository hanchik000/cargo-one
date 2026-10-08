// Auth client. All decisions (credentials, roles, OTP) happen on the server; the client only holds the session it is given.
import type { Role, SessionUser } from '@/lib/types';
import { ApiError } from './db';
import { localAuthApi } from './localAuth';

// The published artifact has no server, so it uses the in-browser demo backend instead.
const LOCAL = __TARGET__ === 'artifact';

async function post<T>(url: string, body: unknown = {}): Promise<T> {
  if (LOCAL) { const r = await localAuthApi(url, body as Record<string, unknown>); if (r.status !== 200) throw new ApiError(String(r.data.error)); return r.data as T; }
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) });
  } catch { throw new ApiError('network_error'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'server_error');
  return data as T;
}

export const authService = {
  async session(): Promise<{ user: SessionUser | null; demoMode: boolean }> {
    if (LOCAL) return (await localAuthApi('/api/auth/session', {}, 'GET')).data as { user: SessionUser | null; demoMode: boolean };
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      return await res.json();
    } catch { return { user: null, demoMode: false }; }
  },
  login: (identifier: string, password: string) => post<{ user: SessionUser }>('/api/auth/login', { identifier, password }),
  requestOtp: (phone: string, purpose: 'login' | 'register') => post<{ sent: boolean; devCode?: string }>('/api/auth/otp/request', { phone, purpose }),
  verifyOtp: (phone: string, code: string, purpose: 'login' | 'register') => post<{ user: SessionUser }>('/api/auth/otp/verify', { phone, code, purpose }),
  register: (input: { name: string; email: string; phone: string; password: string; accountType: 'personal' | 'business'; companyName?: string }) =>
    post<{ pending: true; phone: string; devCode?: string }>('/api/auth/register', input),
  forgot: (identifier: string) => post<{ sent: boolean; devCode?: string }>('/api/auth/forgot', { identifier }),
  reset: (identifier: string, code: string, password: string) => post<{ ok: true }>('/api/auth/reset', { identifier, code, password }),
  oauth: (provider: 'google' | 'apple') => post<{ user: SessionUser; mock?: boolean }>(`/api/auth/oauth/${provider}`),
  demo: (role: Role) => post<{ user: SessionUser }>('/api/auth/demo', { role }),
  logout: () => post<{ ok: true }>('/api/auth/logout'),
  adminUsers: () => LOCAL ? localAuthApi('/api/admin/users', {}, 'GET').then((r) => { if (r.status !== 200) throw new ApiError(String(r.data.error)); return r.data.users as (SessionUser & { status: string })[]; }) : fetch('/api/admin/users', { credentials: 'same-origin' }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new ApiError(d.error); return d.users as (SessionUser & { status: string })[]; }),
  adminUpdateUser: (id: string, patch: { status?: string; role?: Role }) => post<{ user: SessionUser }>('/api/admin/users', { id, ...patch }),
};
