// WCAG 2.3.1 flash audit (MO-C-03), rewritten for this engine from the umbrella checker's method
// with both loop-wrap sites removed for the master and red flashes windowed like general flashes.
// The detector runs on the exact bytes handed to ffmpeg (master) and to the preview encoder
// (preview); the gate only counts flashes from the per-frame transition records it writes.
import { FLASH } from './constants.mjs';

const LUT = Float64Array.from({ length: 256 }, (_, v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
const WINDOW_TRIGGER_CELLS = FLASH.windowTriggerPx / FLASH.cellPx;

// The 320x180 grid and 107x60-cell window for landscape frames; both transpose for a portrait
// (9:16) frame: 180x320 cells and a 60x107 window.
export const LANDSCAPE = Object.freeze({ gridW: FLASH.gridW, gridH: FLASH.gridH, windowW: FLASH.windowCellsW, windowH: FLASH.windowCellsH });
export const PORTRAIT = Object.freeze({ gridW: FLASH.gridH, gridH: FLASH.gridW, windowW: FLASH.windowCellsH, windowH: FLASH.windowCellsW });
export const geometryFor = (width, height) => (height > width ? PORTRAIT : LANDSCAPE);

// Area-average linear luminance and linear R, G, B onto the flash grid (any frame size).
export function cellGrid(bytes, width, height, channels = 4, geometry = geometryFor(width, height)) {
  const { gridW, gridH } = geometry;
  const cells = gridW * gridH;
  const lum = new Float64Array(cells), r = new Float64Array(cells), g = new Float64Array(cells), b = new Float64Array(cells), count = new Float64Array(cells);
  const cx = gridW / width, cy = gridH / height;
  for (let y = 0; y < height; y += 1) {
    const row = Math.min(gridH - 1, Math.floor(y * cy)) * gridW;
    let offset = y * width * channels;
    for (let x = 0; x < width; x += 1, offset += channels) {
      const cell = row + Math.min(gridW - 1, Math.floor(x * cx));
      const lr = LUT[bytes[offset]], lg = LUT[bytes[offset + 1]], lb = LUT[bytes[offset + 2]];
      r[cell] += lr; g[cell] += lg; b[cell] += lb;
      lum[cell] += 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      count[cell] += 1;
    }
  }
  for (let i = 0; i < cells; i += 1) { const n = count[i] || 1; lum[i] /= n; r[i] /= n; g[i] /= n; b[i] /= n; }
  return { lum, r, g, b, geometry };
}

const redValue = (r, g, b) => Math.max(0, (r - g - b) * FLASH.redScale);
const isSaturatedRed = (r, g, b) => r + g + b > 0 && r / (r + g + b) >= FLASH.redRatio;

// Largest same-direction coverage (in cells) of any window, via a summed-area table.
function maxWindowCells(mask, geometry) {
  const W = geometry.gridW, H = geometry.gridH, ww = geometry.windowW, wh = geometry.windowH;
  const sat = new Int32Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < W; x += 1) {
      rowSum += mask[y * W + x];
      sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + rowSum;
    }
  }
  let best = 0;
  for (let y = 0; y + wh <= H; y += 1) {
    for (let x = 0; x + ww <= W; x += 1) {
      const sum = sat[(y + wh) * (W + 1) + x + ww] - sat[y * (W + 1) + x + ww] - sat[(y + wh) * (W + 1) + x] + sat[y * (W + 1) + x];
      if (sum > best) best = sum;
    }
  }
  return best;
}

// Streaming excursion detector. Each cell tracks the lowest and highest value since its last
// registered transition; a move of >= 0.1 (with the darker side < 0.8) registers a transition and
// resets the extremes. A frame-level transition in direction d exists when the cells that
// registered d in frames [f-2, f] cover more than 57,600 logical px of some 640x360 window. A run
// of consecutive frames with the condition counts as one transition, at its first frame.
export class FlashDetector {
  constructor() {
    this.lo = null; this.hi = null; this.rlo = null; this.rhi = null;
    this.history = [];
    this.previousLum = null;
    this.previousActive = { up: false, down: false, redUp: false, redDown: false };
    this.frame = 0;
  }

  push(grid) {
    const { lum, r, g, b } = grid;
    const geometry = grid.geometry ?? LANDSCAPE;
    const CELLS = geometry.gridW * geometry.gridH;
    if (!this.lo) {
      this.lo = Float64Array.from(lum); this.hi = Float64Array.from(lum);
      const red = Float64Array.from({ length: CELLS }, (_, i) => redValue(r[i], g[i], b[i]));
      this.rlo = Float64Array.from(red); this.rhi = Float64Array.from(red);
    }
    const marks = { up: new Uint8Array(CELLS), down: new Uint8Array(CELLS), redUp: new Uint8Array(CELLS), redDown: new Uint8Array(CELLS) };
    let stepCells = 0;
    for (let i = 0; i < CELLS; i += 1) {
      const L = lum[i];
      if (this.previousLum && Math.abs(L - this.previousLum[i]) >= FLASH.delta) stepCells += 1;
      if (L - this.lo[i] >= FLASH.delta && Math.min(L, this.lo[i]) < FLASH.darkCeiling) { marks.up[i] = 1; this.lo[i] = L; this.hi[i] = L; }
      else if (this.hi[i] - L >= FLASH.delta && Math.min(L, this.hi[i]) < FLASH.darkCeiling) { marks.down[i] = 1; this.lo[i] = L; this.hi[i] = L; }
      else { if (L < this.lo[i]) this.lo[i] = L; if (L > this.hi[i]) this.hi[i] = L; }
      const red = redValue(r[i], g[i], b[i]);
      const saturated = isSaturatedRed(r[i], g[i], b[i]);
      if (saturated && red - this.rlo[i] > FLASH.redDelta) { marks.redUp[i] = 1; this.rlo[i] = red; this.rhi[i] = red; }
      else if (saturated && this.rhi[i] - red > FLASH.redDelta) { marks.redDown[i] = 1; this.rlo[i] = red; this.rhi[i] = red; }
      else { if (red < this.rlo[i]) this.rlo[i] = red; if (red > this.rhi[i]) this.rhi[i] = red; }
    }
    this.previousLum = Float64Array.from(lum);
    this.history.push(marks);
    if (this.history.length > FLASH.spanFrames + 1) this.history.shift();
    const record = { general: null, red: null, stepArea: Math.round((stepCells / CELLS) * 10000) / 10000, coverage: {} };
    for (const [key, direction, slot] of [['up', 'up', 'general'], ['down', 'down', 'general'], ['redUp', 'up', 'red'], ['redDown', 'down', 'red']]) {
      const union = new Uint8Array(CELLS);
      for (const past of this.history) for (let i = 0; i < CELLS; i += 1) if (past[key][i]) union[i] = 1;
      const cells = maxWindowCells(union, geometry);
      record.coverage[key] = cells;
      const active = cells > WINDOW_TRIGGER_CELLS;
      if (active && !this.previousActive[key]) record[slot] = record[slot] ?? direction;
      if (active && !this.previousActive[key] && record[slot] !== direction) record[`${slot}2`] = direction;
      this.previousActive[key] = active;
    }
    record.frame = this.frame;
    this.frame += 1;
    return record;
  }
}

// Transitions from per-frame records: [{ frame, direction }] for one channel ('general' | 'red').
export function transitionsOf(records, channel) {
  const out = [];
  for (const record of records) {
    if (record.flash?.[channel]) out.push({ frame: record.frame, direction: record.flash[channel] });
    if (record.flash?.[`${channel}2`]) out.push({ frame: record.frame, direction: record.flash[`${channel}2`] });
  }
  return out;
}

// Flashes = opposing pairs inside a 1 s window, paired in order as the umbrella checker does.
function pairCount(ordered) {
  let flashes = 0;
  for (let i = 0; i + 1 < ordered.length; i += 1) {
    if (ordered[i].direction !== ordered[i + 1].direction) { flashes += 1; i += 1; }
  }
  return flashes;
}

// Master: non-looping. Window starts run over [0, count - fps] (or just 0 for a clip shorter than
// one second) and each window is [s, min(s + fps, count)) with no wrap.
export function worstWindowLinear(transitions, count, fps) {
  let worst = { startFrame: 0, flashes: 0, transitions: [] };
  const lastStart = Math.max(0, count - fps);
  for (let s = 0; s <= lastStart; s += 1) {
    const inside = transitions.filter((t) => t.frame >= s && t.frame < Math.min(s + fps, count)).sort((a, b) => a.frame - b.frame);
    const flashes = pairCount(inside);
    if (flashes > worst.flashes) worst = { startFrame: s, flashes, transitions: inside };
  }
  return worst;
}

// Preview: looping. A window may span the loop seam (last N frames + first fps - N frames).
export function worstWindowLooping(transitions, count, fps) {
  let worst = { startFrame: 0, flashes: 0, transitions: [] };
  const span = Math.min(fps, count);
  for (let s = 0; s < count; s += 1) {
    const inside = transitions.map((t) => ({ ...t, k: (t.frame - s + count) % count })).filter((t) => t.k < span).sort((a, b) => a.k - b.k);
    const flashes = pairCount(inside);
    if (flashes > worst.flashes) worst = { startFrame: s, flashes, transitions: inside };
  }
  return worst;
}

// Looping detector: run the sequence twice so the seam sees the steady-state extremes, then keep
// the second lap's records (frame numbers relative to the lap).
export function auditLoop(grids) {
  const detector = new FlashDetector();
  for (const grid of grids) detector.push(grid);
  const records = [];
  grids.forEach((grid, frame) => { const record = detector.push(grid); record.frame = frame; records.push(record); });
  return records;
}
