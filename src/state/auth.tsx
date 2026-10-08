import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Role, SessionUser } from '@/lib/types';
import { authService } from '@/services/authService';
import { commit, db, setCurrentUser, now } from '@/services/db';
import { hydrateCatalog } from '@/services/catalogApi';

interface AuthState {
  user: SessionUser | null; ready: boolean; demoMode: boolean;
  setSession: (u: SessionUser | null) => void; refresh: () => Promise<void>; logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}
const Ctx = createContext<AuthState | null>(null);

/** Make sure the server-verified user also exists in the mock DB (e.g. freshly registered accounts). */
function syncUser(u: SessionUser | null) {
  setCurrentUser(u);
  void hydrateCatalog(u); // server build: refresh the catalogue mirror for this viewer (admins also see drafts)
  if (!u) return;
  if (!db().users.some((x) => x.id === u.id)) {
    commit((d) => {
      d.users.push({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, status: 'active', city: 'Ashgabat', createdAt: now(), lastActiveAt: now(), businessId: u.businessId, supplierId: u.supplierId });
      if (u.role === 'business' && u.businessId && !d.businesses.some((b) => b.id === u.businessId)) {
        d.businesses.push({ id: u.businessId, userId: u.id, companyName: u.companyName || u.name, taxId: '—', city: 'Ashgabat', industry: '—', monthlyVolumeUSD: 0, verified: false });
      }
    });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [demoMode, setDemoMode] = useState(true);

  const setSession = useCallback((u: SessionUser | null) => { syncUser(u); setUser(u); }, []);
  const refresh = useCallback(async () => {
    const s = await authService.session();
    setDemoMode(s.demoMode);
    setSession(s.user);
    setReady(true);
  }, [setSession]);
  useEffect(() => { void refresh(); }, [refresh]);

  const logout = useCallback(async () => {
    try { await authService.logout(); } finally { setSession(null); }
  }, [setSession]);

  const hasRole = useCallback((...roles: Role[]) => !!user && roles.includes(user.role), [user]);
  return <Ctx.Provider value={{ user, ready, demoMode, setSession, refresh, logout, hasRole }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider missing');
  return v;
}
