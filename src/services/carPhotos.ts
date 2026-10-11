// Real photos of the car MODELS (Wikimedia Commons, freely licensed). A photo shows the model, not the listed vehicle.
// Server build: resolved and cached by the server (/api/media/car-photos), served through its image proxy.
// GitHub Pages build: the browser asks the public Commons API itself (CORS) and caches the result for 30 days.
// Claude artifact build: neither is possible (no server, external requests blocked) — studio renders stay.
import { useEffect, useState } from 'react';
import { SERVER_CATALOG } from './catalogApi';
import { CAR_PHOTO_QUERIES, commonsSearchUrl, pickPhotos } from '@/shared/car-photos-core.mjs';
import type { ModelPhoto } from '@/shared/car-photos-core.mjs';

export type { ModelPhoto };

const BROWSER_COMMONS = !SERVER_CATALOG && typeof __PAGES__ === 'boolean' && __PAGES__;
const CACHE_KEY = 'cargo-one:car-photos:v1';
const TTL_MS = 30 * 24 * 3600_000;

let photos: Record<string, ModelPhoto[]> = {};
let started = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

async function loadFromServer(attempt: number) {
  try {
    const r = await fetch('/api/media/car-photos', { credentials: 'same-origin' });
    if (!r.ok) return;
    const j = (await r.json()) as { photos?: Record<string, ModelPhoto[]>; pending?: boolean };
    photos = j.photos && typeof j.photos === 'object' ? j.photos : {};
    notify();
    // The server resolves photos in the background on first use: look again a few times.
    if (j.pending && attempt < 8) setTimeout(() => loadFromServer(attempt + 1), 6000);
  } catch { /* offline: renders stay */ }
}

async function loadFromCommons() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const c = raw ? (JSON.parse(raw) as { at: number; photos: Record<string, ModelPhoto[]> }) : null;
    if (c && Date.now() - c.at < TTL_MS && c.photos && Object.keys(c.photos).length) { photos = c.photos; notify(); return; }
  } catch { /* no storage */ }
  const found: Record<string, ModelPhoto[]> = {};
  for (const [id, queries] of Object.entries(CAR_PHOTO_QUERIES)) {
    for (const q of queries) {
      try {
        const r = await fetch(commonsSearchUrl(q, { cors: true }).toString());
        if (!r.ok) continue;
        const got = pickPhotos(await r.json()).filter((p) => /^https:\/\/upload\.wikimedia\.org\//.test(p.src) && /^https:\/\/commons\.wikimedia\.org\//.test(p.page));
        if (got.length) found[id] = got;
        if (got.length >= 2) break;
      } catch { /* network: try the next query */ }
    }
    if (found[id]) { photos = { ...photos, [id]: found[id] }; notify(); }
  }
  if (Object.keys(found).length) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), photos: found })); } catch { /* storage full or blocked */ }
  }
}

/** Real photos for one car id (empty until loaded, or when none were found). */
export function useCarPhotos(carId?: string): ModelPhoto[] {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!SERVER_CATALOG && !BROWSER_COMMONS) return;
    const f = () => bump((n) => n + 1);
    subs.add(f);
    if (!started) { started = true; void (SERVER_CATALOG ? loadFromServer(0) : loadFromCommons()); }
    return () => { subs.delete(f); };
  }, []);
  return (carId && photos[carId]) || [];
}

/** Gallery slot index from a car image id ("c3-im2" → 2). */
export const slotOf = (imageId?: string) => Number(/-im(\d+)$/.exec(imageId || '')?.[1] ?? 0);
