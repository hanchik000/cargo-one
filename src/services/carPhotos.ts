// Real photos of the car MODELS (Wikimedia Commons, freely licensed) resolved by the server.
// Server build only; the static demo keeps its studio renders. A photo shows the model, not the listed vehicle.
import { useEffect, useState } from 'react';
import { SERVER_CATALOG } from './catalogApi';

export interface ModelPhoto { src: string; page: string; author: string; license: string; interior: boolean }

let photos: Record<string, ModelPhoto[]> = {};
let started = false;
const subs = new Set<() => void>();

async function load(attempt: number) {
  try {
    const r = await fetch('/api/media/car-photos', { credentials: 'same-origin' });
    if (!r.ok) return;
    const j = (await r.json()) as { photos?: Record<string, ModelPhoto[]>; pending?: boolean };
    photos = j.photos && typeof j.photos === 'object' ? j.photos : {};
    subs.forEach((f) => f());
    // The server resolves photos in the background on first use: look again a few times.
    if (j.pending && attempt < 8) setTimeout(() => load(attempt + 1), 6000);
  } catch { /* offline: renders stay */ }
}

/** Real photos for one car id (empty until loaded, or when none were found). */
export function useCarPhotos(carId?: string): ModelPhoto[] {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!SERVER_CATALOG) return;
    const f = () => bump((n) => n + 1);
    subs.add(f);
    if (!started) { started = true; void load(0); }
    return () => { subs.delete(f); };
  }, []);
  return (carId && photos[carId]) || [];
}

/** Gallery slot index from a car image id ("c3-im2" → 2). */
export const slotOf = (imageId?: string) => Number(/-im(\d+)$/.exec(imageId || '')?.[1] ?? 0);
