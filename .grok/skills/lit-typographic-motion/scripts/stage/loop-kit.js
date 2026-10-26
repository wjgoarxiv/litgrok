// LitLoop: the helper kit a cover page loads from /lit/loop-kit.js (cover mode only; film pages use
// /lit/stage-kit.js). A cover page is one function of loop time t in [0, 1): the renderer calls
// window.renderFrame(t) for t = i / N in any order and twice in separate browsers. So every helper
// here is pure, and every helper that takes t closes the loop: its value at t = 1 is its value at
// t = 0. The cover init script makes every clock throw and seeds Math.random only until the page is
// ready, so layout randomness comes from LitLoop.rng(seed) and everything that moves comes from t.
(function install(scope) {
  'use strict';

  const TAU = 2 * Math.PI;
  const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
  const fract = (x) => x - Math.floor(x);
  const mix = (a, b, k) => a + (b - a) * k;

  // mulberry32: a 32-bit seeded stream for layout (where a copy sits, how big it is, which one gets
  // the accent). Two calls with the same seed give the same sequence.
  function rng(seed) {
    let state = seed >>> 0;
    return function next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let z = state;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Value noise on a seeded 256-entry lattice in three dimensions.
  function makeNoise(seed) {
    const next = rng(seed);
    const table = new Float32Array(256);
    const perm = new Uint16Array(512);
    for (let i = 0; i < 256; i += 1) { table[i] = next() * 2 - 1; perm[i] = i; }
    for (let i = 255; i > 0; i -= 1) {
      const j = Math.floor(next() * (i + 1));
      const swap = perm[i]; perm[i] = perm[j]; perm[j] = swap;
    }
    for (let i = 0; i < 256; i += 1) perm[256 + i] = perm[i];
    const fade = (u) => u * u * (3 - 2 * u);
    const corner = (x, y, z) => table[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
    return (x, y, z = 0) => {
      const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
      const u = fade(x - x0), v = fade(y - y0), w = fade(z - z0);
      const plane = (zz) => mix(
        mix(corner(x0, y0, zz), corner(x0 + 1, y0, zz), u),
        mix(corner(x0, y0 + 1, zz), corner(x0 + 1, y0 + 1, zz), u),
        v,
      );
      return mix(plane(z0), plane(z0 + 1), w);
    };
  }

  // Noise read along a circle in the lattice, so one loop of t ends where it began. `offset` keeps
  // copies apart; `radius` sets how much a value wanders inside one loop.
  const loopNoise = (noise, t, offset = 0, radius = 1.3) => noise(offset + radius * Math.cos(TAU * t), radius * Math.sin(TAU * t), offset * 0.37);

  // Easing for events. Linear motion is kept for what never stops (drift, laps, rising motes).
  const ease = Object.freeze({
    smooth: (p) => p * p * (3 - 2 * p),
    outCubic: (p) => 1 - (1 - p) ** 3,
    inCubic: (p) => p * p * p,
    outExpo: (p) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
    outBack: (p, s = 1.6) => { const q = p - 1; return 1 + (s + 1) * q * q * q + s * q * q; },
    gain: (p, k) => (p < 0.5 ? 0.5 * (2 * p) ** k : 1 - 0.5 * (2 - 2 * p) ** k),
  });

  // A symmetric bump of half-width w around c: 1 at c, 0 at |x - c| >= w. Prefer it for beat
  // events: an exponential tail is a slow fade, and the lossy animation encoder drops slow fades.
  function cubicPulse(c, w, x) {
    const d = Math.abs(x - c);
    if (d >= w) return 0;
    const k = d / w;
    return 1 - k * k * (3 - 2 * k);
  }
  const expImpulse = (x, k) => { const h = k * x; return h * Math.exp(1 - h); };

  // One rule, many copies: a copy's place in the loop is t shifted by its own offset.
  const phase = (t, offset = 0, cycles = 1) => fract(t * cycles - offset);
  // Distance from p to c around the loop (0 to 0.5): for an event centred on the seam.
  const cdist = (p, c) => { const d = fract(p - c); return d > 0.5 ? 1 - d : d; };
  // A one-shot event: 0..1 while p is inside [start, start + dur) around the loop, else -1.
  function oneShot(p, start, dur) {
    const q = fract(p - start);
    return q < dur ? q / dur : -1;
  }
  // Hold and move: `stops` poses per cycle; the move takes the last `travel` of each slot.
  function steps(p, stops, travel = 0.35, shape = ease.smooth) {
    const x = p * stops;
    const slot = Math.floor(x);
    return (slot + shape(clamp((x - slot - (1 - travel)) / travel))) / stops;
  }
  // A cosine swell 0 -> 1 -> 0 that rests at both ends.
  const swell = (p) => 0.5 * (1 - Math.cos(TAU * p));

  scope.LitLoop = Object.freeze({ TAU, clamp, fract, mix, rng, makeNoise, loopNoise, ease, cubicPulse, expImpulse, phase, cdist, window: oneShot, steps, swell });
})(typeof window === 'undefined' ? globalThis : window);
