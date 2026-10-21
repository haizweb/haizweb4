// Small math / easing / keyframe helpers shared by the timeline and the 3D scene.

export const TAU = Math.PI * 2;
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const remap = (x, a, b, c, d) => lerp(c, d, invLerp(a, b, x));
export const smoothstep = (a, b, x) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, x) => {
  const t = invLerp(a, b, x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));
export const mod = (n, m) => ((n % m) + m) % m;

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inQuart: (t) => t * t * t * t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c1 = 1.20158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

/**
 * Keyframe track. keys: [[p, value, easeName?], ...] sorted by p.
 * `value` may be a number or an array of numbers. The easing of a key applies to the
 * segment that STARTS at that key (default: inOutCubic).
 */
export class Track {
  constructor(keys, defaultEase = 'inOutCubic') {
    this.keys = keys;
    this.defaultEase = defaultEase;
    this.isArray = Array.isArray(keys[0][1]);
  }

  at(p, out) {
    const k = this.keys;
    if (p <= k[0][0]) return this._copy(k[0][1], out);
    const last = k[k.length - 1];
    if (p >= last[0]) return this._copy(last[1], out);
    let i = 0;
    while (i < k.length - 2 && p > k[i + 1][0]) i++;
    const a = k[i];
    const b = k[i + 1];
    const t = ease[a[2] || this.defaultEase]((p - a[0]) / (b[0] - a[0]));
    if (!this.isArray) return lerp(a[1], b[1], t);
    out = out || new Array(a[1].length);
    for (let j = 0; j < a[1].length; j++) out[j] = lerp(a[1][j], b[1][j], t);
    return out;
  }

  _copy(v, out) {
    if (!this.isArray) return v;
    out = out || new Array(v.length);
    for (let j = 0; j < v.length; j++) out[j] = v[j];
    return out;
  }
}

/** Deterministic PRNG (mulberry32) so every visit produces the same particles / layouts. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  return next;
}
