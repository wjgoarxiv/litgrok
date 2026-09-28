// Seeded randomness. Every visual choice that looks random is a pure function of the run seed.

// MO-SH-01: FNV-1a 32-bit over the UTF-8 bytes; offset basis 0x811c9dc5, prime 0x01000193.
export function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(String(value), 'utf8')) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash >>> 0;
}

export function passSeed(runSeed, sceneId, shotIndex, pass) {
  return fnv1a32(`${runSeed}:${sceneId}:${shotIndex}:${pass}`);
}

// Adapted from pdoom-video app/src/engine/util.ts (MIT, see NOTICE): unsigned 32-bit throughout.
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// MO-A-28: sub-sample i of n for output frame `frame`, pinned inside the shutter window.
export function subSampleTime(frame, index, samples, fps, shutter) {
  const tn = frame / fps;
  if (samples <= 1) return tn;
  return Math.max(0, tn + (shutter / fps) * ((index + 0.5) / samples - 0.5));
}
