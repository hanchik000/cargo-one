import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { dbRevision, subscribeDb } from '@/services/db';

/** Re-render when the mock database changes. */
export function useDbRevision() {
  return useSyncExternalStore(subscribeDb, dbRevision);
}

export interface QueryState<T> { data: T | undefined; loading: boolean; error: Error | null; reload: () => void; setData: (v: T) => void }

/**
 * Minimal async query hook: loading / success / error / retry, refetches when deps or the database change.
 * Background refetches keep showing previous data (no flicker).
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { live?: boolean; enabled?: boolean } = {}): QueryState<T> {
  const { live = true, enabled = true } = opts;
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);
  const rev = useDbRevision();
  const seq = useRef(0);
  const hasData = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => { hasData.current = false; }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const id = ++seq.current;
    if (!hasData.current) setLoading(true);
    setError(null);
    fnRef.current().then(
      (v) => { if (id === seq.current) { setData(v); hasData.current = true; setLoading(false); } },
      (e) => { if (id === seq.current) { setError(e instanceof Error ? e : new Error(String(e))); setLoading(false); } },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled, live ? rev : 0]);

  const reload = useCallback(() => { hasData.current = false; setTick((t) => t + 1); }, []);
  return { data, loading, error, reload, setData: (v: T) => setData(v) };
}

/** Wraps an async action with pending/error state. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setPending(true); setError(null);
    try { return await fn(...args); }
    catch (e) { setError(e instanceof Error ? e : new Error(String(e))); return undefined; }
    finally { setPending(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn]);
  return { run, pending, error, setError };
}

// ---------- persisted client state (preferences, cart, compare, onboarding) ----------
type Listener = () => void;
const memory = new Map<string, unknown>();
const listeners = new Map<string, Set<Listener>>();

function read<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const raw = localStorage.getItem(`cargo-one.${key}`);
    const v = raw ? (JSON.parse(raw) as T) : fallback;
    memory.set(key, v);
    return v;
  } catch { memory.set(key, fallback); return fallback; }
}
export function writePersisted<T>(key: string, value: T) {
  memory.set(key, value);
  try { localStorage.setItem(`cargo-one.${key}`, JSON.stringify(value)); } catch { /* ignore */ }
  listeners.get(key)?.forEach((l) => l());
}
export function readPersisted<T>(key: string, fallback: T) { return read(key, fallback); }

export function usePersisted<T>(key: string, fallback: T): [T, (v: T | ((prev: T) => T)) => void] {
  const subscribe = useCallback((l: Listener) => {
    if (!listeners.has(key)) listeners.set(key, new Set());
    listeners.get(key)!.add(l);
    return () => { listeners.get(key)!.delete(l); };
  }, [key]);
  const value = useSyncExternalStore(subscribe, () => read(key, fallback));
  const set = useCallback((v: T | ((prev: T) => T)) => {
    const next = typeof v === 'function' ? (v as (p: T) => T)(read(key, fallback)) : v;
    writePersisted(key, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, set];
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export function useMediaQuery(q: string) {
  const subscribe = useCallback((cb: () => void) => { const m = window.matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); }, [q]);
  return useSyncExternalStore(subscribe, () => window.matchMedia(q).matches);
}
