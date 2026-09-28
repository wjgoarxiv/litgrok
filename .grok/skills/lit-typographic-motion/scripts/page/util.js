// Page-side helpers. Every function is a pure function of its inputs (MO-A-23): no wall clock and
// no unseeded randomness in any visual path. Adapted from pdoom-video app/src/engine/util.ts
// (MIT, see NOTICE).
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

// MO-A-08: the named easing set. Scenes use these names only, never ad hoc curve literals.
function cubicBezier(x1, y1, x2, y2) {
  const sample = (a1, a2, t) => ((1 - 3 * a2 + 3 * a1) * t + (3 * a2 - 6 * a1)) * t * t + 3 * a1 * t;
  const slope = (a1, a2, t) => 3 * (1 - 3 * a2 + 3 * a1) * t * t + 2 * (3 * a2 - 6 * a1) * t + 3 * a1;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sample(x1, x2, t) - x;
      const d = slope(x1, x2, t);
      if (Math.abs(error) < 1e-7 || Math.abs(d) < 1e-7) break;
      t -= error / d;
    }
    return sample(y1, y2, clamp(t));
  };
}
const ease = {
  linear: (t) => t,
  slam: cubicBezier(0.16, 1, 0.3, 1), // swiss-signal `slam` / tidal `surge-punch`
  drift: cubicBezier(0.37, 0, 0.63, 1), // tidal `drift` (inOutSine-equivalent)
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
};

// Clamped eased progress of x through [a, b].
const prog = (x, a, b, fn = ease.linear) => fn(clamp((x - a) / Math.max(1e-6, b - a)));

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash01(...values) {
  let h = 2166136261 >>> 0;
  for (const value of values) {
    h ^= Math.floor(value * 1000003) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const srgbToLinear = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const hexToLinear = (hex) => hexToRgb(hex).map(srgbToLinear);
function mixHex(a, b, t) {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  return `#${ca.map((v, i) => Math.round(lerp(v, cb[i], t)).toString(16).padStart(2, '0')).join('')}`;
}
