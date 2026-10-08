// Places try-on sprites on detected landmarks and draws them on a 2D canvas.
import type { TryOnKind } from '@/lib/types';
import { SPRITES } from '@/data/tryon-sprites';
import type { Pt as SPt } from '@/data/tryon-sprites';
import type { BodyKey, Landmarks, Pt } from './engine';

export type SpriteImages = Record<string, HTMLImageElement | HTMLCanvasElement>;
export interface Adjust { dx: number; dy: number; scale: number; rot: number }
export const NO_ADJUST: Adjust = { dx: 0, dy: 0, scale: 1, rot: 0 };
export type Need = { face: boolean; body: boolean };
export type Miss = 'no_face' | 'no_body' | 'no_arm' | 'no_feet';

export const KIND: Record<TryOnKind, { need: Need; sprites: string[]; flip?: string[]; group: 'face' | 'body' | 'arm' | 'feet' }> = {
  glasses: { need: { face: true, body: false }, sprites: ['glasses'], group: 'face' },
  earbuds: { need: { face: true, body: false }, sprites: ['earbud'], flip: ['earbud'], group: 'face' },
  headphones: { need: { face: true, body: false }, sprites: ['headphones'], group: 'face' },
  cap: { need: { face: true, body: false }, sprites: ['cap'], group: 'face' },
  watch: { need: { face: false, body: true }, sprites: ['watch'], group: 'arm' },
  phonecase: { need: { face: false, body: true }, sprites: ['phonecase'], group: 'arm' },
  hoodie: { need: { face: false, body: true }, sprites: ['hoodie-torso', 'hoodie-upper', 'hoodie-lower'], group: 'body' },
  coat: { need: { face: false, body: true }, sprites: ['coat-torso', 'coat-upper', 'coat-lower'], group: 'body' },
  bag: { need: { face: false, body: true }, sprites: ['bag'], group: 'body' },
  shoes: { need: { face: false, body: true }, sprites: ['shoe'], flip: ['shoe'], group: 'feet' },
};

// ---------- vector helpers ----------
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
const len = (a: Pt) => Math.hypot(a[0], a[1]);
const unit = (a: Pt): Pt => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const perp = (a: Pt): Pt => [-a[1], a[0]];
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const mid = (a: Pt, b: Pt) => lerp(a, b, 0.5);

// ---------- draw ops ----------
type Op =
  | { t: 'sim'; img: string; flip?: boolean; sa: SPt; sb: SPt; da: Pt; db: Pt }
  | { t: 'bone'; img: string; sa: SPt; sb: SPt; da: Pt; db: Pt; sx: number }
  | { t: 'warp'; img: string; s: [SPt, SPt, SPt, SPt]; d: [Pt, Pt, Pt, Pt] }
  | { t: 'strap'; from: Pt; ctrl: Pt; to: Pt; width: number };

export interface Placement { ops: Op[]; pivot: Pt; ref: number }

const A = (sprite: string, key: string) => SPRITES[sprite].anchors[key];
const flipPt = (sprite: string, p: SPt): SPt => [SPRITES[sprite].w - p[0], p[1]];

const KP_MIN = 0.3;
function kp(lm: Landmarks, k: BodyKey): Pt | null { const v = lm.body?.kp[k]; return v && v[2] >= KP_MIN ? [v[0], v[1]] : null; }

/** Shoulders are required; hips are estimated when out of frame. */
function torsoFrame(lm: Landmarks) {
  const shR = kp(lm, 'shoulderR'), shL = kp(lm, 'shoulderL');
  if (!shR || !shL) return null;
  const S = len(sub(shL, shR));
  if (S < 8) return null;
  const across = unit(sub(shL, shR));
  let down = perp(across); if (down[1] < 0) down = mul(down, -1);
  const shMid = mid(shR, shL);
  let hipR = kp(lm, 'hipR'), hipL = kp(lm, 'hipL');
  if (!hipR || !hipL) {
    const hm = add(shMid, mul(down, 1.24 * S));
    hipR = sub(hm, mul(across, 0.263 * S)); hipL = add(hm, mul(across, 0.263 * S));
  }
  return { shR, shL, hipR, hipL, S, across, down, shMid };
}

export function place(kind: TryOnKind, lm: Landmarks): Placement | Miss {
  const ops: Op[] = [];
  if (KIND[kind].group === 'face') {
    const f = lm.face; if (!f) return 'no_face';
    const faceW = len(sub(f.faceL, f.faceR)); const faceH = len(sub(f.top, f.chin));
    const right = unit(sub(f.faceL, f.faceR)); // toward the person's left
    const up = unit(sub(f.top, f.chin)); const down = mul(up, -1);
    const eyes = mid(f.eyeR, f.eyeL);
    if (kind === 'glasses') {
      ops.push({ t: 'sim', img: 'glasses', sa: A('glasses', 'eyeR'), sb: A('glasses', 'eyeL'), da: f.eyeR, db: f.eyeL });
      return { ops, pivot: eyes, ref: faceW };
    }
    if (kind === 'headphones') {
      const eR = add(sub(f.faceR, mul(right, 0.07 * faceW)), mul(down, 0.04 * faceH));
      const eL = add(add(f.faceL, mul(right, 0.07 * faceW)), mul(down, 0.04 * faceH));
      ops.push({ t: 'sim', img: 'headphones', sa: A('headphones', 'earR'), sb: A('headphones', 'earL'), da: eR, db: eL });
      return { ops, pivot: mid(eR, eL), ref: faceW };
    }
    if (kind === 'cap') {
      const c = sub(f.top, mul(up, 0.04 * faceH));
      const sR = sub(c, mul(right, 0.53 * faceW)), sL = add(c, mul(right, 0.53 * faceW));
      ops.push({ t: 'sim', img: 'cap', sa: A('cap', 'sideR'), sb: A('cap', 'sideL'), da: sR, db: sL });
      return { ops, pivot: c, ref: faceW };
    }
    // earbuds: hide the one turned away from the camera
    const t = (f.nose[0] - f.faceR[0]) * right[0] + (f.nose[1] - f.faceR[1]) * right[1];
    const r = t / (faceW || 1);
    const budLen = 0.2 * faceH;
    const sides: [Pt, 1 | -1, boolean][] = [[f.faceR, -1, r > 0.3], [f.faceL, 1, r < 0.7]];
    for (const [edge, dir, visible] of sides) {
      if (!visible) continue;
      const head = add(add(edge, mul(right, dir * 0.035 * faceW)), mul(down, 0.06 * faceH));
      const flip = dir === 1;
      const sa = flip ? flipPt('earbud', A('earbud', 'head')) : A('earbud', 'head');
      const sb = flip ? flipPt('earbud', A('earbud', 'tip')) : A('earbud', 'tip');
      ops.push({ t: 'sim', img: 'earbud', flip, sa, sb, da: head, db: add(head, mul(down, budLen)) });
    }
    return { ops, pivot: eyes, ref: faceW };
  }

  if (KIND[kind].group === 'arm') {
    const arms = (['L', 'R'] as const).map((s) => ({ s, w: kp(lm, `wrist${s}`), e: kp(lm, `elbow${s}`), sc: (lm.body?.kp[`wrist${s}`]?.[2] ?? 0) })).filter((a) => a.w && a.e) as { s: 'L' | 'R'; w: Pt; e: Pt; sc: number }[];
    if (!arms.length) return 'no_arm';
    if (kind === 'watch') {
      const a = arms.find((x) => x.s === 'L') || arms[0]; // usually worn on the left wrist
      const fv = sub(a.w, a.e); const L = len(fv);
      const c = sub(a.w, mul(fv, 0.1));
      const top = add(c, mul(perp(unit(fv)), 0.15 * L));
      ops.push({ t: 'sim', img: 'watch', sa: A('watch', 'center'), sb: A('watch', 'top'), da: c, db: top });
      return { ops, pivot: c, ref: L };
    }
    const a = [...arms].sort((x, y) => x.w[1] - y.w[1])[0]; // the raised hand holds the phone
    const fv = sub(a.w, a.e); const L = len(fv);
    const c = add(a.w, mul(fv, 0.42));
    ops.push({ t: 'sim', img: 'phonecase', sa: A('phonecase', 'center'), sb: A('phonecase', 'top'), da: c, db: add(c, mul(unit(fv), 0.3 * L)) });
    return { ops, pivot: c, ref: L };
  }

  if (KIND[kind].group === 'feet') {
    let any = false;
    for (const s of ['R', 'L'] as const) {
      const an = kp(lm, `ankle${s}`), kn = kp(lm, `knee${s}`);
      if (!an || !kn) continue;
      any = true;
      const sh = sub(an, kn); const L = len(sh); const d = unit(sh);
      const flip = s === 'L';
      const sa = flip ? flipPt('shoe', A('shoe', 'ankle')) : A('shoe', 'ankle');
      const sb = flip ? flipPt('shoe', A('shoe', 'toe')) : A('shoe', 'toe');
      ops.push({ t: 'sim', img: 'shoe', flip, sa, sb, da: add(an, mul(d, 0.0 * L)), db: add(an, mul(d, 0.44 * L)) });
    }
    if (!any) return 'no_feet';
    const pts = ops.map((o) => (o as { da: Pt }).da);
    return { ops, pivot: pts.length > 1 ? mid(pts[0], pts[1]) : pts[0], ref: 100 };
  }

  // body: garments + bag
  const T = torsoFrame(lm); if (!T) return 'no_body';
  if (kind === 'bag') {
    const hipMid = mid(T.hipR, T.hipL);
    const c = add(lerp(hipMid, T.hipR, 1.35), mul(T.down, 0.05 * T.S));
    const half = 0.29 * T.S;
    const ringR = add(sub(c, mul(T.across, half)), mul(T.down, -0.28 * half));
    const ringL = add(add(c, mul(T.across, half)), mul(T.down, -0.28 * half));
    const from = lerp(T.shL, T.shMid, 0.3);
    ops.push({ t: 'strap', from, to: ringL, ctrl: add(lerp(from, ringL, 0.5), mul(T.across, -0.05 * T.S)), width: 0.045 * T.S });
    ops.push({ t: 'sim', img: 'bag', sa: A('bag', 'ringR'), sb: A('bag', 'ringL'), da: ringR, db: ringL });
    return { ops, pivot: c, ref: T.S };
  }
  const pre = kind === 'coat' ? 'coat' : 'hoodie';
  const torso = `${pre}-torso`, upper = `${pre}-upper`, lower = `${pre}-lower`;
  const pxPerM = T.S / 0.38; // mannequin shoulder width = 0.38 m
  const bones: Op[] = [], forearms: Op[] = [];
  for (const s of ['R', 'L'] as const) {
    const sh = s === 'R' ? T.shR : T.shL;
    const side = s === 'R' ? -1 : 1;
    const defDir = unit(add(T.down, mul(T.across, side * 0.2)));
    const el = kp(lm, `elbow${s}`) || add(sh, mul(defDir, 0.3 * pxPerM));
    const upDir = unit(sub(el, sh));
    const wr = kp(lm, `wrist${s}`) || add(el, mul(upDir, 0.27 * pxPerM));
    const su = SPRITES[upper], sl = SPRITES[lower];
    const pxU = len(sub(su.anchors.b, su.anchors.a)) / 0.3, pxL = len(sub(sl.anchors.b, sl.anchors.a)) / 0.27;
    bones.push({ t: 'bone', img: upper, sa: su.anchors.a, sb: su.anchors.b, da: sh, db: el, sx: pxPerM / pxU });
    forearms.push({ t: 'bone', img: lower, sa: sl.anchors.a, sb: sl.anchors.b, da: el, db: wr, sx: pxPerM / pxL });
  }
  const sp = SPRITES[torso].anchors;
  ops.push(...bones, { t: 'warp', img: torso, s: [sp.shoulderR, sp.shoulderL, sp.hipL, sp.hipR], d: [T.shR, T.shL, T.hipL, T.hipR] }, ...forearms);
  return { ops, pivot: mid(T.shMid, mid(T.hipR, T.hipL)), ref: T.S };
}

// ---------- drawing ----------
function affine(s: [SPt, SPt, SPt], d: [Pt, Pt, Pt]): [number, number, number, number, number, number] {
  const [[x0, y0], [x1, y1], [x2, y2]] = s; const [[u0, v0], [u1, v1], [u2, v2]] = d;
  const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1) || 1e-9;
  const a = (u0 * (y1 - y2) + u1 * (y2 - y0) + u2 * (y0 - y1)) / den;
  const c = (u0 * (x2 - x1) + u1 * (x0 - x2) + u2 * (x1 - x0)) / den;
  const e = (u0 * (x1 * y2 - x2 * y1) + u1 * (x2 * y0 - x0 * y2) + u2 * (x0 * y1 - x1 * y0)) / den;
  const b = (v0 * (y1 - y2) + v1 * (y2 - y0) + v2 * (y0 - y1)) / den;
  const dd = (v0 * (x2 - x1) + v1 * (x0 - x2) + v2 * (x1 - x0)) / den;
  const f = (v0 * (x1 * y2 - x2 * y1) + v1 * (x2 * y0 - x0 * y2) + v2 * (x0 * y1 - x1 * y0)) / den;
  return [a, b, c, dd, e, f];
}

function drawOp(ctx: CanvasRenderingContext2D, op: Op, imgs: SpriteImages) {
  if (op.t === 'strap') {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#3e2414'; ctx.lineWidth = op.width;
    ctx.beginPath(); ctx.moveTo(...op.from); ctx.quadraticCurveTo(...op.ctrl, ...op.to); ctx.stroke();
    ctx.strokeStyle = '#6b4127'; ctx.lineWidth = op.width * 0.62;
    ctx.beginPath(); ctx.moveTo(...op.from); ctx.quadraticCurveTo(...op.ctrl, ...op.to); ctx.stroke();
    ctx.setLineDash([op.width * 0.35, op.width * 0.3]); ctx.strokeStyle = 'rgba(232,205,160,.55)'; ctx.lineWidth = Math.max(1, op.width * 0.06);
    ctx.beginPath(); ctx.moveTo(...op.from); ctx.quadraticCurveTo(...op.ctrl, ...op.to); ctx.stroke();
    ctx.restore();
    return;
  }
  const img = imgs[op.t === 'sim' && op.flip ? `${op.img}@flip` : op.img];
  if (!img) return;
  ctx.save();
  if (op.t === 'sim') {
    const vs = sub(op.sb, op.sa), vd = sub(op.db, op.da);
    const k = len(vd) / (len(vs) || 1); const ang = Math.atan2(vd[1], vd[0]) - Math.atan2(vs[1], vs[0]);
    ctx.translate(...op.da); ctx.rotate(ang); ctx.scale(k, k); ctx.translate(-op.sa[0], -op.sa[1]);
    ctx.drawImage(img, 0, 0);
  } else if (op.t === 'bone') {
    const vd = sub(op.db, op.da); const L = len(vd);
    const sy = L / (len(sub(op.sb, op.sa)) || 1);
    ctx.translate(...op.da); ctx.rotate(Math.atan2(vd[1], vd[0]) - Math.PI / 2); ctx.scale(op.sx, sy); ctx.translate(-op.sa[0], -op.sa[1]);
    ctx.drawImage(img, 0, 0);
  } else {
    // Piecewise-affine warp split along the shoulderR–hipL diagonal; each half extends past the quad (collar, hem, sides).
    const [s0, s1, s2, s3] = op.s; const [d0, d1, d2, d3] = op.d;
    const dir = unit(sub(d2, d0)); const n = perp(dir); const far = 1e4;
    const sideOf = (p: Pt) => Math.sign((p[0] - d0[0]) * n[0] + (p[1] - d0[1]) * n[1]) || 1;
    const halves: [[SPt, SPt, SPt], [Pt, Pt, Pt], number][] = [[[s0, s1, s2], [d0, d1, d2], sideOf(d1)], [[s0, s2, s3], [d0, d2, d3], sideOf(d3)]];
    for (const [ss, dd, sg] of halves) {
      ctx.save();
      const o = mul(n, -sg * 0.75); // overlap to hide the seam
      const a = add(sub(d0, mul(dir, far)), o), b = add(add(d0, mul(dir, far)), o);
      ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.lineTo(...add(b, mul(n, sg * far))); ctx.lineTo(...add(a, mul(n, sg * far))); ctx.closePath(); ctx.clip();
      ctx.transform(...affine(ss, dd));
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

export function drawPlacement(ctx: CanvasRenderingContext2D, p: Placement, imgs: SpriteImages, adj: Adjust) {
  ctx.save();
  ctx.translate(p.pivot[0] + adj.dx * p.ref, p.pivot[1] + adj.dy * p.ref);
  ctx.rotate(adj.rot); ctx.scale(adj.scale, adj.scale);
  ctx.translate(-p.pivot[0], -p.pivot[1]);
  ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = Math.max(4, p.ref * 0.04); ctx.shadowOffsetY = Math.max(1, p.ref * 0.012);
  for (const op of p.ops) drawOp(ctx, op, imgs);
  ctx.restore();
}

// ---------- smoothing (video) ----------
export function smooth(prev: Landmarks | null, next: Landmarks, k = 0.5): Landmarks {
  if (!prev || prev.w !== next.w) return next;
  const mix = (a: Pt, b: Pt): Pt => (len(sub(a, b)) > next.w * 0.12 ? b : [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
  const out: Landmarks = { w: next.w, h: next.h };
  if (next.face) {
    const f = next.face, p = prev.face;
    out.face = p ? { eyeR: mix(p.eyeR, f.eyeR), eyeL: mix(p.eyeL, f.eyeL), faceR: mix(p.faceR, f.faceR), faceL: mix(p.faceL, f.faceL), top: mix(p.top, f.top), chin: mix(p.chin, f.chin), nose: mix(p.nose, f.nose), score: f.score } : f;
  }
  if (next.body) {
    const kpOut: NonNullable<Landmarks['body']>['kp'] = {};
    for (const [key, v] of Object.entries(next.body.kp) as [BodyKey, [number, number, number]][]) {
      const pv = prev.body?.kp[key];
      kpOut[key] = pv && pv[2] >= KP_MIN && v[2] >= KP_MIN ? [...mix([pv[0], pv[1]], [v[0], v[1]]), v[2]] : v;
    }
    out.body = { kp: kpOut, score: next.body.score };
  }
  return out;
}

// ---------- demo mannequin ----------
export function mannequinLandmarks(name: 'mannequin-full' | 'mannequin-close'): Landmarks {
  const m = SPRITES[name]; const a = m.anchors as Record<string, Pt>;
  const kp: NonNullable<Landmarks['body']>['kp'] = {};
  for (const k of ['shoulderR', 'shoulderL', 'elbowR', 'elbowL', 'wristR', 'wristL', 'hipR', 'hipL', 'kneeR', 'kneeL', 'ankleR', 'ankleL', 'eyeR', 'eyeL', 'earR', 'earL', 'nose'] as BodyKey[]) {
    const p = a[k]; if (p && p[0] >= 0 && p[1] >= 0 && p[0] <= m.w && p[1] <= m.h) kp[k] = [p[0], p[1], 1];
  }
  return { w: m.w, h: m.h, face: { eyeR: a.eyeR, eyeL: a.eyeL, faceR: a.faceR, faceL: a.faceL, top: a.top, chin: a.chin, nose: a.nose, score: 1 }, body: { kp, score: 1 } };
}

/** Loads the sprites a kind needs (and mirrored copies when required). */
const cache = new Map<string, Promise<HTMLImageElement | HTMLCanvasElement>>();
export function loadSprites(kind: TryOnKind, src: (name: string) => string): Promise<SpriteImages> {
  const def = KIND[kind];
  const load = (name: string) => {
    if (!cache.has(name)) cache.set(name, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => { cache.delete(name); rej(new Error('sprite')); }; i.src = src(name); }));
    return cache.get(name)!;
  };
  const flipped = (name: string) => {
    const key = `${name}@flip`;
    if (!cache.has(key)) cache.set(key, load(name).then((img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d')!; x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(img, 0, 0); return c; }));
    return cache.get(key)!;
  };
  const names = [...def.sprites, ...(def.flip || []).map((n) => `${n}@flip`)];
  return Promise.all(names.map((n) => (n.endsWith('@flip') ? flipped(n.slice(0, -5)) : load(n)))).then((arr) => Object.fromEntries(names.map((n, i) => [n, arr[i]])));
}
