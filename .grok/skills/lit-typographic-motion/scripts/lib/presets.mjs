// The three preset style bibles as data (MO-B-01..03) and the per-shot pass plan: seeds
// (MO-SH-01), precomputed glitch hits, tidal surges and boot-flicker bursts, the MO-SH-03 event
// ceiling, the MO-SH-09 software-GL downgrade, and the one-moment accent window (MO-C-29).
import { COLOUR, PASS_CAPS } from './constants.mjs';
import { mulberry32, passSeed } from './seed.mjs';

const mix = (a, b, t) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

export const PRESETS = Object.freeze({
  'swiss-signal': {
    id: 'swiss-signal',
    palette: { bg: '#0C0E13', fg: '#E9EBE4', signal: '#0F7A82', accent: '#D9A441', graphite: '#4B5058', dim: mix('#0C0E13', '#E9EBE4', 0.62) },
    post: { grain: 0.045, vignette: 0.22, ca: 0.8, bloom: 0, halation: 0 },
    passes: ['swiss-grid', 'dither'],
    fills: [],
  },
  terminalcore: {
    id: 'terminalcore',
    palette: { bg: '#05070A', panel: '#0C1116', bar: '#0A0E12', fg: '#39FF6A', signal: '#39FF6A', dim: '#7C8B93', label: '#A9B6BD', accent: null },
    post: { grain: 0.035, vignette: 0.12, ca: 1.1, bloom: 0.55, bloomThreshold: 0.6, bloomKnee: 0.25, bloomRadius: 0.4, halation: 0 },
    passes: ['terminal-ui', 'crt', 'dither', 'glitch'],
    fills: [{ elementId: 'background', hex: '#05070A', area: 1920 * 1080 }],
  },
  tidal: {
    id: 'tidal',
    palette: { bg: '#0E1420', fg: '#E8ECEF', signal: '#124559', stopB: '#4C3B6E', accent: '#E07856', dim: mix('#0E1420', '#E8ECEF', 0.82), graphite: mix('#0E1420', '#E8ECEF', 0.3) },
    post: { grain: 0.035, vignette: 0.3, ca: 0.6, bloom: 0, halation: 0 },
    passes: ['tidal-gradient', 'swiss-grid', 'glitch'],
    fills: [{ elementId: 'gradient-stop-a', hex: '#124559', area: 1920 * 1080 / 2 }, { elementId: 'gradient-stop-b', hex: '#4C3B6E', area: 1920 * 1080 / 2 }],
  },
});

const DEFAULTS = Object.freeze({
  'swiss-grid': { columns: 12, gutterPx: 24, marginPx: 96, baselinePx: 8, moduleSnap: true, showGuides: false, hairlineWidthPx: 1 },
  dither: (preset) => (preset === 'terminalcore' ? { mode: 1, paletteSize: 0, pixelScale: 2, ditherStrength: 0.45 } : { mode: 1, paletteSize: 0, pixelScale: 1, ditherStrength: 0.3 }),
  crt: { scanlineFreq: 540, scanlineDepth: 0.22, phosphorPersistence: 0.15, bloomAmount: 0.2, curvature: 0.04, vignette: 0.18, triadMaskAmount: 0.12, flickerAmp: 0.03, flickerFreqHz: 8 },
  glitch: (preset) => ({ intensity: 0.35, sliceCount: 4, maxOffsetPx: 24, blockCorruptSize: [32, 18], rgbSplitPx: 3, holdFrames: 2, hitRatePerSec: preset === 'tidal' ? 0.5 : 1.0, areaCapPct: 12 }),
  'tidal-gradient': { flowSpeed: 0.06, warpAmount: 0.35, curlStrength: 0.4, octaves: 4, surgeOnHit: 0.5, surgeAttackSec: 0.15, surgeDecaySec: 0.25, surgeCapPerSec: 2, bandingSteps: 0, ditherAmount: 0.02 },
  'terminal-ui': { charGridPx: [14, 24], windowChromeWidthPx: 1.5, meterCount: 2, logLineRateCharsPerSec: 22, caretBlinkHz: 1.2, wordTimingSource: 'reading-time', layers: 1 },
});

const linear = (hex) => [1, 3, 5].map((i) => {
  const s = parseInt(hex.slice(i, i + 2), 16) / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});

// MO-SH-03: at most 2 events (hits, surges, flash rises, invert changes, boot bursts) in any 1 s
// window of one shot. Events are admitted in time order; one that would break the ceiling is dropped.
export function admitEvents(candidates, ceiling = PASS_CAPS.eventsPerSecondPerShot) {
  const kept = [];
  for (const event of [...candidates].sort((a, b) => a.t - b.t)) {
    const window = kept.filter((k) => event.t - k.t < 1 - 1e-9);
    if (window.length < ceiling) kept.push(event);
  }
  return kept;
}

function glitchSchedule(rng, shot, params, fps, occupied) {
  const duration = shot.end - shot.start;
  const count = Math.max(0, Math.floor(duration * Math.min(params.hitRatePerSec, PASS_CAPS.glitchHitRate)));
  const candidates = [];
  for (let i = 0; i < count; i += 1) {
    // Hits sit in the settled part of the shot, never on the cut itself.
    const t = shot.start + 0.4 + rng() * Math.max(0.1, duration - 0.8);
    candidates.push({ t, kind: 'glitch' });
  }
  const admitted = admitEvents([...occupied, ...candidates]).filter((event) => event.kind === 'glitch');
  const areaBudget = (Math.min(params.areaCapPct, PASS_CAPS.glitchAreaPct) / 100) * 1920 * 1080;
  return admitted.map((event) => {
    const slices = [];
    let area = 0;
    for (let s = 0; s < params.sliceCount; s += 1) {
      const h = 10 + Math.floor(rng() * 34);
      if (area + h * 1920 > areaBudget * 0.8) break;
      const y0 = 60 + Math.floor(rng() * (1080 - 120 - h));
      slices.push({ y0, y1: y0 + h, offsetPx: (rng() - 0.5) * 2 * params.maxOffsetPx, splitPx: params.rgbSplitPx * rng() });
      area += h * 1920;
    }
    const blocks = [];
    for (let b = 0; b < 2; b += 1) {
      const [bw, bh] = params.blockCorruptSize;
      if (area + bw * bh > areaBudget) break;
      blocks.push({ x: 96 + Math.floor(rng() * (1920 - 192 - bw)), y: 54 + Math.floor(rng() * (1080 - 108 - bh)), w: bw, h: bh, dx: Math.round((rng() - 0.5) * 80), dy: Math.round((rng() - 0.5) * 40) });
      area += bw * bh;
    }
    return { frame: Math.round(event.t * fps), t: Math.round(event.t * fps) / fps, holdFrames: params.holdFrames, slices, blocks, areaPct: Math.round((area / (1920 * 1080)) * 1000) / 10 };
  });
}

function surgeSchedule(rng, shot, params, occupied) {
  const beats = [];
  const duration = shot.end - shot.start;
  for (let t = shot.start + 0.5; t < shot.end - 0.4; t += 1.5 + rng()) beats.push({ t, kind: 'surge' });
  const cap = Math.min(params.surgeCapPerSec, PASS_CAPS.surgeRate);
  const limited = admitEvents(beats, cap).slice(0, Math.max(0, Math.floor(duration * cap)));
  return admitEvents([...occupied, ...limited]).filter((e) => e.kind === 'surge').map((e) => Math.round(e.t * 1000) / 1000);
}

export function planPasses(timeline, presetId, { runSeed, software, fps }) {
  const preset = PRESETS[presetId];
  const downgraded = Boolean(software);
  for (const [index, shot] of timeline.shots.entries()) {
    shot.index = index;
    shot.seed = passSeed(runSeed, shot.sceneId, shot.shotIndex, 'shot');
    const occupied = [];
    if (presetId === 'terminalcore') occupied.push({ t: shot.start + 0.05, kind: 'boot' });
    shot.passes = preset.passes.map((pass) => {
      const seed = pass === 'swiss-grid' ? null : passSeed(runSeed, shot.sceneId, shot.shotIndex, pass);
      const defaults = typeof DEFAULTS[pass] === 'function' ? DEFAULTS[pass](presetId) : { ...DEFAULTS[pass] };
      const params = { ...defaults };
      const entry = { pass, seed, params, downgraded: false };
      const rng = mulberry32(seed ?? 0);
      if (pass === 'tidal-gradient') {
        if (downgraded) { params.octaves = Math.max(3, Math.floor(params.octaves / 2)); entry.downgraded = true; }
        entry.origin = [rng() * 40, rng() * 40];
        entry.stopsLinear = [linear(preset.palette.signal), linear(preset.palette.stopB)];
        entry.schedule = surgeSchedule(rng, shot, params, occupied);
        occupied.push(...entry.schedule.map((t) => ({ t, kind: 'surge' })));
        params.paletteStopsHex = [preset.palette.signal, preset.palette.stopB];
        params.surgeCountRealized = entry.schedule.length;
        params.surgeTimes = entry.schedule;
      }
      if (pass === 'crt') {
        params.persistenceEnabled = !downgraded;
        params.sceneStateful = !downgraded;
        if (downgraded) entry.downgraded = true;
        entry.bootFlicker = [shot.start + 0.05];
        params.bootFlickerTimes = entry.bootFlicker;
        params.flickerAmpRealized = Math.min(PASS_CAPS.crtFlicker, params.flickerAmp * 2);
      }
      if (pass === 'glitch') {
        entry.schedule = glitchSchedule(rng, shot, params, fps, occupied);
        occupied.push(...entry.schedule.map((hit) => ({ t: hit.t, kind: 'glitch' })));
        params.hitRatePerSecRealized = Math.round((entry.schedule.length / Math.max(1e-6, shot.end - shot.start)) * 1000) / 1000;
        params.hits = entry.schedule.map((hit) => ({ frame: hit.frame, holdFrames: hit.holdFrames, areaPct: hit.areaPct }));
      }
      if (pass === 'terminal-ui') {
        params.compositedThrough = ['crt', 'dither'];
        entry.logUniforms = { u_charGridPx: params.charGridPx, u_windowChromeWidthPx: params.windowChromeWidthPx, u_meterCount: params.meterCount, u_logLineRateCharsPerSec: params.logLineRateCharsPerSec, u_caretBlinkHz: params.caretBlinkHz, u_wordTimingSource: params.wordTimingSource };
      }
      return entry;
    });
    shot.events = [...occupied].sort((a, b) => a.t - b.t).map((event) => ({ t: Math.round(event.t * 1000) / 1000, kind: event.kind }));
  }
  planAccent(timeline, preset);
  return timeline;
}

// MO-C-29: the accent appears in exactly one timeline entry and on at most 10% of frames.
function planAccent(timeline, preset) {
  if (!preset.palette.accent) return;
  const owner = timeline.shots.find((shot) => shot.sceneId === 'number-counter') ?? timeline.shots[0];
  const budget = Math.floor(timeline.totalFrames * COLOUR.accentFrameFraction * 0.8);
  const start = owner.startFrame + Math.round(0.3 * timeline.fps);
  const end = Math.min(owner.endFrame, start + budget);
  if (end > start) owner.accent = { startFrame: start, endFrame: end, hex: preset.palette.accent };
}
