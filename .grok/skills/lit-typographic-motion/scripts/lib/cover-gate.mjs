// The cover gate (references/cover.md, Gate): G0 determinism, G1 budget and loop, G2 motion energy,
// G3 anti-slide, G4 seam, G5 title contrast and G6 title cap height, read from the DECODED cover
// (animated WebP, or the GIF fallback) and never only from the frames the encoder was given. Every
// motion number is taken on a fixed time grid: the encoder merges identical frames into one long
// frame, and counting frames would make a slide film look busy. FLOOR fails a cover; TARGET is the
// cover-mode goal, and --strict (like every cover render) fails on it too, the 2 MiB size included.
// The numbers live in constants.mjs (COVER) and change only with a new calibration table.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COVER } from './constants.mjs';
import { lumaGrid } from './cover-image.mjs';
import { decodeWebp } from './cover-webp.mjs';
import { toRgba } from './frame-pool.mjs';
import { decodePng } from './png.mjs';
import { findTool } from './render.mjs';

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (values, q) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
const meanAbsDiff = (a, b) => {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length / 255;
};

export function readPngRgba(file) {
  const decoded = decodePng(readFileSync(file));
  return { width: decoded.width, height: decoded.height, rgba: toRgba(decoded) };
}
export const pngFrames = (dir, prefix = 'f') => (existsSync(dir) ? readdirSync(dir).filter((name) => name.startsWith(prefix) && name.endsWith('.png')).sort().map((name) => join(dir, name)) : []);

// What a GIF's container says and the ffmpeg pipe does not: per-frame delays (ms) and the loop count.
export function gifTiming(bytes) {
  if (bytes.toString('latin1', 0, 3) !== 'GIF') throw new Error('not a GIF file');
  const delays = [];
  let loop = null;
  let delay = 100;
  let o = 13;
  if (bytes[10] & 0x80) o += 3 * (1 << ((bytes[10] & 0x07) + 1));
  const skipSubBlocks = (p) => { while (p < bytes.length && bytes[p] !== 0) p += bytes[p] + 1; return p + 1; };
  while (o < bytes.length) {
    const block = bytes[o];
    if (block === 0x3b) break;
    if (block === 0x21) {
      const label = bytes[o + 1];
      if (label === 0xf9) delay = 10 * bytes.readUInt16LE(o + 4);
      if (label === 0xff && bytes.toString('latin1', o + 3, o + 14) === 'NETSCAPE2.0') loop = bytes.readUInt16LE(o + 16);
      o = skipSubBlocks(o + 2);
    } else if (block === 0x2c) {
      let p = o + 10;
      if (bytes[o + 9] & 0x80) p += 3 * (1 << ((bytes[o + 9] & 0x07) + 1));
      o = skipSubBlocks(p + 1);
      delays.push(delay > 0 ? delay : 100);
      delay = 100;
    } else break;
  }
  return { delays, loop, width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

// Load a cover for the gate: { lumas, delays, width, height, loop, bytes, format, kept }. keep(i,
// durationMs) is asked once per decoded frame, in order, and says which frames to keep whole
// (RGBA) for the stills, the poster and the frame-0 art check.
export function loadCover(input, { fps = 16, keep = () => false, env = process.env } = {}) {
  const kept = new Map();
  const lumas = [];
  if (statSync(input).isDirectory()) {
    const files = pngFrames(input);
    let width = 0, height = 0;
    files.forEach((file, i) => {
      const image = readPngRgba(file);
      ({ width, height } = image);
      lumas.push(lumaGrid(image.rgba, width, height).luma);
      if (keep(i, 1000 / fps)) kept.set(i, image.rgba);
    });
    return { lumas, delays: files.map(() => 1000 / fps), width, height, loop: 0, bytes: null, format: 'png', kept };
  }
  if (input.toLowerCase().endsWith('.gif')) {
    const bytes = readFileSync(input);
    const timing = gifTiming(bytes);
    const ffmpeg = findTool('ffmpeg', env);
    if (!ffmpeg) throw new Error('ffmpeg is needed to decode a GIF cover');
    const raw = spawnSync(ffmpeg, ['-v', 'error', '-i', input, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: 2 ** 31 });
    if (raw.status !== 0) throw new Error(`ffmpeg could not decode ${input}: ${String(raw.stderr).trim().split(/\r?\n/)[0]}`);
    const size = timing.width * timing.height * 4;
    for (let i = 0; (i + 1) * size <= raw.stdout.length; i += 1) {
      const rgba = raw.stdout.subarray(i * size, (i + 1) * size);
      lumas.push(lumaGrid(rgba, timing.width, timing.height).luma);
      if (keep(i, timing.delays[i] ?? 100)) kept.set(i, Buffer.from(rgba));
    }
    return { lumas, delays: timing.delays.slice(0, lumas.length), width: timing.width, height: timing.height, loop: timing.loop, bytes: bytes.length, format: 'gif', kept };
  }
  const info = decodeWebp(input, {
    env,
    onFrame: (i, rgba, ms, width, height) => {
      lumas.push(lumaGrid(rgba, width, height).luma);
      if (keep(i, ms > 0 ? ms : 100)) kept.set(i, Buffer.from(rgba));
    },
  });
  return { width: info.width, height: info.height, loop: info.loop, bytes: info.bytes, lumas, delays: info.durations.map((d) => (d > 0 ? d : 100)), format: 'webp', kept };
}

// The frame on screen at every `step` ms (a long frame repeats).
export function resample(frames, delays, step) {
  const total = delays.reduce((a, b) => a + b, 0);
  const out = [];
  let i = 0;
  let end = delays[0];
  for (let ms = 0; ms < total - 1e-6; ms += step) {
    while (ms >= end && i < frames.length - 1) { i += 1; end += delays[i]; }
    out.push(frames[i]);
  }
  return out;
}

// Motion numbers on the grid. The loop is a ring: the seam (last sample to first) is one more step.
export function motionMetrics({ lumas, delays }) {
  const step = Math.max(COVER.gridMs, Math.min(...delays));
  const grid = resample(lumas, delays, step);
  const n = grid.length;
  const steps = [];
  for (let i = 1; i < n; i += 1) steps.push(meanAbsDiff(grid[i], grid[i - 1]));
  const seam = meanAbsDiff(grid[0], grid[n - 1]);
  const ring = [...steps, seam];
  const med = median(ring);
  const still = ring.map((d) => d < COVER.stillEps);
  // A run of k still steps shows one picture for k + 1 samples, so a loop with no still step still
  // holds each sample for one step. The ring is walked once from a moving step, so a still run
  // across the seam is counted whole.
  let stillSteps = 0;
  if (still.every(Boolean)) stillSteps = n - 1;
  else {
    const start = still.findIndex((s) => !s);
    let run = 0;
    for (let k = 1; k <= n; k += 1) {
      run = still[(start + k) % n] ? run + 1 : 0;
      stillSteps = Math.max(stillSteps, run);
    }
  }
  const longestStillSec = ((stillSteps + 1) * step) / 1000;
  const around = n >= 4 ? (ring[n - 3] + ring[n - 2] + ring[0] + ring[1]) / 4 : med;
  return {
    gridFrames: n, stepMs: step, durationSec: (n * step) / 1000, sourceDurationSec: delays.reduce((a, b) => a + b, 0) / 1000,
    medianD: med, p10D: quantile(ring, 0.1), p90D: quantile(ring, 0.9), maxD: Math.max(...ring),
    movingFrac: ring.filter((d) => d >= COVER.stillEps).length / ring.length,
    longestStillSec, spike: Math.max(...ring) / Math.max(med, COVER.stillEps),
    seam, seamLocal: seam / Math.max(COVER.stillEps, around), diffs: ring,
  };
}

const linear = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = (r, g, b) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
const boxPx = (box, W, H) => box.map((v, k) => Math.round(v * (k % 2 ? H : W)));

// G5: in every frame, the median title pixel against the worst background decile in the title box
// (background = box pixels at least 3 px from any title pixel). Needs the mask pass's per-frame masks
// (white = title); without them G5 fails and says what is missing.
export function titleContrast({ framesDir, masksDir, box }) {
  const frames = pngFrames(framesDir, 'f');
  const masks = pngFrames(masksDir, 'm');
  if (!frames.length || masks.length !== frames.length) return { measured: false, reason: `needs one mask per frame (${frames.length} frames, ${masks.length} masks)` };
  const ratios = [];
  for (let i = 0; i < frames.length; i += 1) {
    const { width: W, height: H, rgba } = readPngRgba(frames[i]);
    const mask = readPngRgba(masks[i]);
    if (mask.width !== W || mask.height !== H) return { measured: false, reason: `mask ${i} is ${mask.width}x${mask.height}, its frame ${W}x${H}` };
    const [bx, by, bw, bh] = boxPx(box, W, H);
    const kind = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p += 1) if (mask.rgba[p * 4] > 127) kind[p] = 2;
    const R = 3;
    for (let y = by; y < by + bh; y += 1) {
      for (let x = bx; x < bx + bw; x += 1) {
        if (kind[y * W + x] !== 2) continue;
        for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy += 1) {
          for (let xx = Math.max(0, x - R); xx <= Math.min(W - 1, x + R); xx += 1) if (kind[yy * W + xx] === 0) kind[yy * W + xx] = 1;
        }
      }
    }
    const text = [], ground = [];
    for (let y = by; y < by + bh; y += 1) {
      for (let x = bx; x < bx + bw; x += 1) {
        const p = y * W + x, o = p * 4;
        if (kind[p] === 2) text.push(luminance(rgba[o], rgba[o + 1], rgba[o + 2]));
        else if (kind[p] === 0) ground.push(luminance(rgba[o], rgba[o + 1], rgba[o + 2]));
      }
    }
    if (!text.length || !ground.length) return { measured: false, reason: `frame ${i}: the title box holds ${text.length} title and ${ground.length} background pixels` };
    const t = median(text);
    const worst = t > median(ground) ? quantile(ground, 0.9) : quantile(ground, 0.1);
    ratios.push((Math.max(t, worst) + 0.05) / (Math.min(t, worst) + 0.05));
  }
  return { measured: true, min: Math.min(...ratios), median: median(ratios), frames: ratios.length };
}

// G6: the title's cap height where a README shows the cover. In each sampled mask the title pixels
// in the box split into 4-connected glyphs; specks under 1 % of the largest glyph's area or under
// 30 % of the tallest glyph's height (dots, accents) are left out, and the median height of the
// rest is that sample's cap height. The smallest, scaled from the cover width to displayWidth, must
// reach COVER.minGlyphPx. A title painted into declared base art is measured and reported as INFO
// (pass: null); contrast alone never makes a title readable.
export function glyphHeights({ masksDir, box, displayWidth = COVER.displayWidth, exempt = null, samples = 12 }) {
  const masks = pngFrames(masksDir, 'm');
  if (!masks.length) return { pass: false, reason: 'no mask frames to measure the title on' };
  const count = Math.min(samples, masks.length);
  const picks = [...new Set(Array.from({ length: count }, (_, k) => Math.floor((k * masks.length) / count)))];
  let cap = Infinity, glyphs = 0, coverWidth = 0;
  for (const index of picks) {
    const mask = readPngRgba(masks[index]);
    coverWidth = mask.width;
    const [bx, by, bw, bh] = boxPx(box, mask.width, mask.height);
    const label = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y += 1) for (let x = 0; x < bw; x += 1) label[y * bw + x] = mask.rgba[((by + y) * mask.width + bx + x) * 4] > 127 ? 1 : 0;
    const parts = [];
    for (let seed = 0; seed < label.length; seed += 1) {
      if (label[seed] !== 1) continue;
      label[seed] = 2;
      const stack = [seed];
      let area = 0, top = bh, bottom = -1;
      while (stack.length) {
        const q = stack.pop();
        const y = Math.floor(q / bw), x = q - y * bw;
        area += 1;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        for (const next of [x > 0 ? q - 1 : -1, x < bw - 1 ? q + 1 : -1, y > 0 ? q - bw : -1, y < bh - 1 ? q + bw : -1]) {
          if (next >= 0 && label[next] === 1) { label[next] = 2; stack.push(next); }
        }
      }
      parts.push({ area, height: bottom - top + 1 });
    }
    if (!parts.length) return { pass: false, reason: `mask ${index}: no title pixels in the title box` };
    const largest = Math.max(...parts.map((p) => p.area));
    const tallest = Math.max(...parts.map((p) => p.height));
    const letters = parts.filter((p) => p.area >= 0.01 * largest && p.height >= 0.3 * tallest);
    glyphs = Math.max(glyphs, letters.length);
    cap = Math.min(cap, median(letters.map((p) => p.height)));
  }
  const capPx = (cap * displayWidth) / coverWidth;
  const result = { capPx: Math.round(capPx * 10) / 10, coverPx: cap, displayWidth, glyphs, sampled: picks.length };
  if (exempt) return { pass: null, ...result, reason: exempt };
  return { pass: capPx >= COVER.minGlyphPx, ...result };
}

// G0: SHA-256 per frame file of two captures made in separate browsers.
export function determinism(dirA, dirB) {
  const a = pngFrames(dirA, 'f');
  const b = pngFrames(dirB, 'f');
  const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const n = Math.min(a.length, b.length);
  let identical = 0, firstDiffering = null;
  for (let i = 0; i < n; i += 1) {
    if (hash(a[i]) === hash(b[i])) identical += 1;
    else firstDiffering ??= i;
  }
  return { compared: n, identical, countsMatch: a.length === b.length, firstDiffering };
}

// Gate one cover file (or a PNG frame folder). frames/frames2 give G0, masks + title give G5,
// glyph ({ displayWidth, exempt }) adds G6, keep(i, ms) keeps decoded frames whole. Returns the
// metrics, one verdict per gate, `pass` (every FLOOR) and `target` (every TARGET).
export function coverGate(input, { frames = null, frames2 = null, masks = null, title = null, glyph = null, fps = 16, keep, env = process.env } = {}) {
  const src = loadCover(input, { fps, keep, env });
  const m = motionMetrics(src);
  const gates = {};
  if (frames && frames2) {
    const det = determinism(frames, frames2);
    gates.G0 = { pass: det.countsMatch && det.compared > 0 && det.identical === det.compared, ...det };
  }
  if (src.format !== 'png') {
    gates.G1 = {
      pass: src.bytes <= COVER.maxBytes && m.sourceDurationSec >= COVER.minSec && m.sourceDurationSec <= COVER.maxSec && src.loop === 0,
      target: src.bytes <= COVER.targetBytes,
      bytes: src.bytes, durationSec: m.sourceDurationSec, loop: src.loop, size: `${src.width}x${src.height}`,
    };
  }
  const F = COVER.floor, T = COVER.target;
  gates.G2 = { pass: m.medianD >= F.medianD && m.movingFrac >= F.movingFrac, target: m.medianD >= T.medianD && m.movingFrac >= T.movingFrac, medianD: m.medianD, movingFrac: m.movingFrac };
  gates.G3 = { pass: m.longestStillSec <= F.stillSec, target: m.longestStillSec <= T.stillSec && m.spike <= T.spike, longestStillSec: m.longestStillSec, spike: m.spike };
  gates.G4 = { pass: m.seamLocal <= F.seamLocal, target: m.seamLocal <= T.seamLocal && m.seamLocal >= T.seamLo, seam: m.seam, seamLocal: m.seamLocal };
  if (title && frames) {
    const c = titleContrast({ framesDir: frames, masksDir: masks, box: title });
    gates.G5 = c.measured ? { pass: c.min >= COVER.minContrast, min: c.min, median: c.median, frames: c.frames } : { pass: false, reason: c.reason };
  }
  if (title && masks && glyph) gates.G6 = glyphHeights({ masksDir: masks, box: title, displayWidth: glyph.displayWidth ?? COVER.displayWidth, exempt: glyph.exempt ?? null });
  const pass = Object.values(gates).every((g) => g.pass !== false);
  const target = pass && Object.values(gates).every((g) => g.target !== false);
  return { input, format: src.format, width: src.width, height: src.height, bytes: src.bytes, loop: src.loop, sourceFrames: src.lumas.length, durations: src.delays, ...m, gates, pass, target, kept: src.kept };
}

const short = (x) => (typeof x === 'number' && !Number.isInteger(x) ? Number(x.toPrecision(4)) : x);

// The report: a verdict line, a size line, then one line per gate.
export function coverReportText(r, { strict = false } = {}) {
  const verdict = r.pass ? (r.target ? 'PASS+TARGET' : 'PASS(floor)') : 'FAIL';
  const lines = [
    `COVER gate${strict ? ' --strict' : ''}: ${verdict}`,
    `  ${r.width}x${r.height} ${r.format} frames=${r.sourceFrames} dur=${short(r.sourceDurationSec)}s bytes=${r.bytes ?? '-'} loop=${r.loop} grid=${r.stepMs}ms`,
  ];
  for (const [name, gate] of Object.entries(r.gates)) {
    const { pass, target, ...detail } = gate;
    const word = pass === null ? 'INFO' : pass ? (target === false ? 'pass(floor)' : 'pass') : 'FAIL';
    lines.push(`  ${name} ${word} ${Object.entries(detail).map(([k, v]) => `${k}=${short(v)}`).join(' ')}`);
  }
  return `${lines.join('\n')}\n`;
}
