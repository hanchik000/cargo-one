// Tiny history-API router with params, query strings, scroll restoration and lazy routes.
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l());
// The published artifact is a single page without a server: routes live in the URL hash ("#/shop?q=…").
// A bare anchor such as "#auto" (the only kind an artifact link can carry) opens that section.
export const HASH_ROUTING = __TARGET__ === 'artifact';
const fromHash = () => {
  const h = decodeURIComponent(window.location.hash.slice(1));
  if (!h) return '/';
  return h.startsWith('/') ? h : `/${h.replace(/[.~_]/g, '/')}`;
};
let memHref = typeof window !== 'undefined' && HASH_ROUTING ? fromHash() : '/';
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => { if (HASH_ROUTING) { if (window.location.hash && !window.location.hash.startsWith('#/')) return; memHref = fromHash(); } emit(); });
  if (HASH_ROUTING) window.addEventListener('hashchange', () => { if (!window.location.hash.startsWith('#/')) return; const h = fromHash(); if (h !== memHref) { memHref = h; emit(); } });
}

function subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }
const getHref = () => (HASH_ROUTING ? memHref : window.location.pathname + window.location.search);
/** Current in-app path + query, independent of routing mode. */
export const currentHref = () => getHref();
/** The href attribute for an in-app link. */
export const hrefFor = (to: string) => (HASH_ROUTING && to.startsWith('/') ? `#${to}` : to);

export function navigate(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) {
  if (to === getHref()) return;
  const samePath = to.split('?')[0] === getHref().split('?')[0];
  if (HASH_ROUTING) {
    memHref = to;
    try { window.history[opts.replace ? 'replaceState' : 'pushState']({}, '', `#${to}`); } catch { /* sandboxed frame: keep in memory */ }
  } else window.history[opts.replace ? 'replaceState' : 'pushState']({}, '', to);
  emit();
  if (!opts.keepScroll && !samePath) window.scrollTo({ top: 0 });
}

export function useLocation() {
  const href = useSyncExternalStore(subscribe, getHref);
  return useMemo(() => {
    const url = new URL(href, 'http://x');
    return { pathname: url.pathname, search: url.search, query: url.searchParams, href };
  }, [href]);
}

export function useNavigate() { return useCallback(navigate, []); }

/** Read/write a single query-string parameter. */
export function useQueryParam(name: string): [string, (v: string) => void] {
  const { query, pathname } = useLocation();
  const value = query.get(name) ?? '';
  const set = useCallback((v: string) => {
    const q = new URL(getHref(), 'http://x').searchParams;
    if (v) q.set(name, v); else q.delete(name);
    const s = q.toString();
    navigate(pathname + (s ? `?${s}` : ''), { replace: true, keepScroll: true });
  }, [name, pathname]);
  return [value, set];
}

export interface RouteDef { path: string; element: (params: Record<string, string>) => ReactNode }

export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = pathname.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

const ParamsCtx = createContext<Record<string, string>>({});
export const useParams = () => useContext(ParamsCtx);

export function Routes({ routes, fallback }: { routes: RouteDef[]; fallback: ReactNode }) {
  const { pathname } = useLocation();
  for (const r of routes) {
    const params = matchPath(r.path, pathname);
    if (params) return <ParamsCtx.Provider value={params}>{r.element(params)}</ParamsCtx.Provider>;
  }
  return <>{fallback}</>;
}

export function Link({ to, children, className, replace, onClick, ...rest }: { to: string; children?: ReactNode; className?: string; replace?: boolean; onClick?: () => void; [k: string]: unknown }) {
  return (
    <a
      href={hrefFor(to)}
      className={className}
      onClick={(e: ReactMouseEvent<HTMLAnchorElement>) => {
        onClick?.();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || /^https?:/.test(to)) return;
        e.preventDefault();
        navigate(to, { replace });
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

export function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }); }, [to]);
  return null;
}
