// On-device face + body tracking for the AR try-on.
// Uses the open-source Human library (MIT; TensorFlow.js, WebGL) with BlazeFace + FaceMesh + MoveNet Lightning.
// Nothing is uploaded: frames are processed in this browser tab. The library (~1.6 MB) and models (~7 MB) load on first use.
import { asset } from '@/lib/assets';

export type Pt = [number, number];
export interface FaceLm { eyeR: Pt; eyeL: Pt; faceR: Pt; faceL: Pt; top: Pt; chin: Pt; nose: Pt; score: number }
export type BodyKey = 'nose' | 'eyeR' | 'eyeL' | 'earR' | 'earL' | 'shoulderR' | 'shoulderL' | 'elbowR' | 'elbowL' | 'wristR' | 'wristL' | 'hipR' | 'hipL' | 'kneeR' | 'kneeL' | 'ankleR' | 'ankleL';
export interface BodyLm { kp: Partial<Record<BodyKey, [number, number, number]>>; score: number }
/** Landmarks in source-pixel coordinates. R/L = the person's own right/left. */
export interface Landmarks { w: number; h: number; face?: FaceLm; body?: BodyLm }

interface HumanResult {
  face: { score: number; mesh: number[][] }[];
  body: { score: number; keypoints: { part: string; position: number[]; score: number }[] }[];
  error: string | null;
}
interface HumanInstance { load(): Promise<void>; detect(input: unknown, cfg?: Record<string, unknown>): Promise<HumanResult>; tf: { getBackend(): string } }
declare global { interface Window { Human?: { Human: new (cfg: Record<string, unknown>) => HumanInstance } } }

const CONFIG = (cache: boolean) => ({
  backend: 'webgl', modelBasePath: asset('ar/models/'), cacheModels: cache, warmup: 'none', debug: false,
  face: {
    enabled: true, detector: { modelPath: 'blazeface.json', rotation: true, maxDetected: 1, minConfidence: 0.3 }, mesh: { enabled: true, modelPath: 'facemesh.json' },
    iris: { enabled: false }, emotion: { enabled: false }, description: { enabled: false }, antispoof: { enabled: false }, liveness: { enabled: false }, attention: { enabled: false }, gear: { enabled: false },
  },
  body: { enabled: true, modelPath: 'movenet-lightning.json', maxDetected: 1, minConfidence: 0.2 },
  hand: { enabled: false }, object: { enabled: false }, gesture: { enabled: false }, segmentation: { enabled: false }, filter: { enabled: false },
});

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('script_failed'));
    document.head.appendChild(s);
  });
}

export class TrackingError extends Error { constructor(public code: 'webgl_unavailable' | 'load_failed') { super(code); } }

let enginePromise: Promise<HumanInstance> | null = null;
/** Loads the tracking library + models once. */
export function loadEngine(): Promise<HumanInstance> {
  if (enginePromise) return enginePromise;
  enginePromise = (async () => {
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) throw new TrackingError('webgl_unavailable');
    try {
      if (!window.Human) await loadScript(asset('ar/human.js')); // the static demo build inlines the library instead
      if (!window.Human) throw new Error('missing');
      let cache = true;
      try { cache = typeof indexedDB !== 'undefined'; } catch { cache = false; }
      const human = new window.Human.Human(CONFIG(cache));
      await human.load();
      return human;
    } catch (e) {
      enginePromise = null;
      throw e instanceof TrackingError ? e : new TrackingError('load_failed');
    }
  })();
  return enginePromise;
}

const avg = (a: number[], b: number[]): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const p2 = (a: number[]): Pt => [a[0], a[1]];
const PARTS: Record<string, BodyKey> = {
  nose: 'nose', leftEye: 'eyeL', rightEye: 'eyeR', leftEar: 'earL', rightEar: 'earR', leftShoulder: 'shoulderL', rightShoulder: 'shoulderR',
  leftElbow: 'elbowL', rightElbow: 'elbowR', leftWrist: 'wristL', rightWrist: 'wristR', leftHip: 'hipL', rightHip: 'hipR',
  leftKnee: 'kneeL', rightKnee: 'kneeR', leftAnkle: 'ankleL', rightAnkle: 'ankleR',
};

export type DetectInput = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
export async function detect(engine: HumanInstance, input: DetectInput, need: { face: boolean; body: boolean }, still = false): Promise<Landmarks> {
  const w = input instanceof HTMLVideoElement ? input.videoWidth : input instanceof HTMLImageElement ? input.naturalWidth : input.width;
  const h = input instanceof HTMLVideoElement ? input.videoHeight : input instanceof HTMLImageElement ? input.naturalHeight : input.height;
  const r = await engine.detect(input, { face: { enabled: need.face }, body: { enabled: need.body }, ...(still ? { cacheSensitivity: 0 } : {}) });
  const out: Landmarks = { w, h };
  const f = r.face?.[0];
  if (need.face && f && f.mesh?.length >= 468 && f.score > 0.4) {
    const m = f.mesh;
    out.face = { eyeR: avg(m[33], m[133]), eyeL: avg(m[362], m[263]), faceR: p2(m[234]), faceL: p2(m[454]), top: p2(m[10]), chin: p2(m[152]), nose: p2(m[1]), score: f.score };
  }
  const b = r.body?.[0];
  if (need.body && b && b.score > 0.2) {
    const kp: BodyLm['kp'] = {};
    for (const k of b.keypoints) { const key = PARTS[k.part]; if (key) kp[key] = [k.position[0], k.position[1], k.score]; }
    out.body = { kp, score: b.score };
  }
  return out;
}
