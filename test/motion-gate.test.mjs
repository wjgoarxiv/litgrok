import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { evaluate, evaluatePreflight } from '../.grok/skills/lit-typographic-motion/scripts/lib/gate.mjs';
import { FlashDetector, auditLoop, cellGrid, transitionsOf, worstWindowLinear, worstWindowLooping } from '../.grok/skills/lit-typographic-motion/scripts/lib/flash.mjs';
import { fnv1a32 } from '../.grok/skills/lit-typographic-motion/scripts/lib/seed.mjs';
import { clearDeliverables, promoteOrWithhold } from '../.grok/skills/lit-typographic-motion/scripts/lib/render.mjs';
import { completionState } from '../.grok/skills/lit-typographic-motion/scripts/lib/completion.mjs';

const FPS = 60;
const TOTAL = 288;
const RUN_SEED = 7;
const HW_FLAGS = ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];

function baseline() {
  const shots = [{ sceneId: 'title-slam', shotIndex: 0, start: 0, end: 2.4, text: 'Field Notes' }, { sceneId: 'karaoke-line', shotIndex: 0, start: 2.4, end: 4.8, text: '작은 공방이 문을 연다' }];
  const passRanges = shots.flatMap((shot) => ['swiss-grid', 'dither'].map((pass) => ({
    pass, frameStart: Math.round(shot.start * FPS), frameEnd: Math.round(shot.end * FPS) - 1, sceneId: shot.sceneId, shotIndex: shot.shotIndex,
    seed: pass === 'swiss-grid' ? null : fnv1a32(`${RUN_SEED}:${shot.sceneId}:${shot.shotIndex}:${pass}`),
    params: pass === 'swiss-grid' ? { columns: 12, gutterPx: 24, marginPx: 96, baselinePx: 8, showGuides: false } : { mode: 1, paletteSize: 0, pixelScale: 1 }, downgraded: false,
  })));
  const timeline = [
    { id: 'title-slam', sceneId: 'title-slam', shotIndex: 0, start: 0, end: 2.4, holdSec: 2.4, kind: 'line', text: 'Field Notes', script: 'latin', beatSec: 0 },
    { id: 'karaoke-line', sceneId: 'karaoke-line', shotIndex: 0, start: 2.4, end: 4.8, holdSec: 2.4, kind: 'line', text: '작은 공방이 문을 연다', script: 'hangul', beatSec: 2.4 },
    { id: 'karaoke-line/r0', sceneId: 'karaoke-line', shotIndex: 0, start: 2.4, end: 3.0, holdSec: 0.6, kind: 'reveal', text: '작은 공방이', script: 'hangul', beatSec: 2.4 },
    { id: 'karaoke-line/r1', sceneId: 'karaoke-line', shotIndex: 0, start: 3.0, end: 4.8, holdSec: 1.8, kind: 'reveal', text: '문을 연다', script: 'hangul', beatSec: 2.4 },
  ];
  const manifest = {
    schemaVersion: 1, engineCredit: 'x', presetId: 'swiss-signal', seed: RUN_SEED, fps: FPS, resolution: [1920, 1080], scale: 1, samples: 4, shutter: 0.5,
    renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Pro, Unspecified Version)', softwareRenderer: false, chromeFlags: HW_FLAGS, previewEncoder: 'img2webp',
    audioTier: 'text-reading-time', bpm: 100, durationSec: 4.8, passRanges, timeline, warnings: [], round: 1,
  };
  const frames = Array.from({ length: TOTAL }, (_, frame) => ({
    frame, pass: null, rgbaSha256: 'x', ink: 5000, shotIndex: frame < 144 ? 0 : 1,
    textBoxes: [{ elementId: 'title-0', text: frame < 144 ? 'Field Notes' : '작은', voice: frame < 144 ? 'display' : 'body', fontFile: frame < 144 ? 'Archivo-w100-wt900.ttf' : 'PretendardGOV-Bold.otf', fontSizePx: 120, capHeightPx: 84, weight: 700, fill: '#E9EBE4', bbox: [144, 400, 900, 520], script: frame < 144 ? 'latin' : 'hangul', trackingEm: 0, opacity: 1 }],
    graphics: [{ elementId: 'rule', kind: 'rule', bbox: [143, 167, 1777, 169] }],
    fills: [], blocks: [], post: { flash: 0, invert: false, shake: [0, 0], zoom: 1, grain: 0.045, fade: 1 },
    flash: { general: null, red: null, stepArea: 0 },
  }));
  const passLines = [];
  for (const range of passRanges) for (let f = range.frameStart; f <= range.frameEnd; f += 1) passLines.push({ frame: f, pass: range.pass, draws: 1, uniforms: range.pass === 'dither' ? { u_seed: range.seed } : { u_showGuides: false } });
  const previewRecords = Array.from({ length: 144 }, (_, i) => ({ preview: { rung: '960x30', frame: i, frames: 144, fps: 30 }, flash: { general: null, red: null } }));
  const checks = {
    preflight: evaluatePreflight({ fps: FPS, bpm: 100, beatGrid: null, timeline }, []),
    determinism: { verdict: 'PASS', frames: [138, 143, 144, 150], mismatched: [] },
    perf: { times: Array.from({ length: 120 }, () => 12), totalFrames: TOTAL },
    probe: { width: 1920, height: 1080, pixFmt: 'yuv420p', colorSpace: 'bt709', colorRange: 'tv', colorTransfer: 'bt709', colorPrimaries: 'bt709', fps: 60, durationSec: 4.8 },
    preview: { width: 960, fps: 30 },
  };
  const exports = { mp4: { present: true, bytes: 20_000_000 }, preview: { present: true, bytes: 900_000, name: 'preview.webp' }, poster: { present: true, bytes: 90_000 }, still: { present: true, ink: 5000 }, manifest: { present: true } };
  return { manifest, frames, passLines, previewRecords, checks, exports, contrastSamples: [contrastSample('#E9EBE4')] };
}

// A 400x200 frame: ink ground, a 100x40 glyph block in `hex` under a matching mask.
function contrastSample(hex, { fill = hex, fontSizePx = 56, weight = 700, split = null } = {}) {
  const width = 400, height = 200;
  const rgb = Buffer.alloc(width * height * 3), mask = Buffer.alloc(width * height);
  const paint = (x, y, h) => { const o = (y * width + x) * 3; const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); rgb[o] = v[0]; rgb[o + 1] = v[1]; rgb[o + 2] = v[2]; };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) paint(x, y, '#0C0E13');
  for (let y = 80; y < 120; y += 1) for (let x = 100; x < 200; x += 1) { paint(x, y, split && x >= 150 ? split : hex); mask[y * width + x] = 255; }
  return { frame: 100, rgb, mask, width, height, boxes: [{ elementId: 't', text: 'sample', voice: 'body', fontSizePx, capHeightPx: 40, weight, fill, bbox: [100, 80, 199, 119], opacity: 1 }] };
}

const statusOf = (facts, id) => evaluate(facts).results.find((r) => r.id === id)?.status;
function failsOnly(facts, id) {
  const result = evaluate(facts);
  const rule = result.results.find((r) => r.id === id);
  assert.ok(rule, `${id} not evaluated`);
  assert.equal(rule.status, 'FAIL', `${id} should FAIL: ${rule.detail}`);
  assert.equal(result.status, 'FAIL');
}

test('the baseline fixture passes every rule, so each fixture below isolates one failure', () => {
  const result = evaluate(baseline());
  const failed = result.results.filter((r) => r.status === 'FAIL');
  assert.deepEqual(failed, []);
  assert.equal(result.status, 'PASS');
});

test('MO-C-01 / MO-SH-00b: a frame whose pass issued no draw is a gap', () => {
  const facts = baseline();
  facts.passLines = facts.passLines.map((line) => (line.frame === 50 ? { ...line, draws: 0 } : line));
  failsOnly(facts, 'MO-C-01');
  assert.equal(statusOf(facts, 'MO-SH-00b'), 'FAIL');
  const empty = baseline();
  empty.manifest.passRanges = [];
  failsOnly(empty, 'MO-SH-00');
});

test('MO-SH-00a: a range frame with no render-log line fails that range', () => {
  const facts = baseline();
  facts.passLines = facts.passLines.filter((line) => !(line.pass === 'dither' && line.frame === 200));
  failsOnly(facts, 'MO-SH-00a');
});

test('MO-C-02: an unlabelled software renderer fails; a labelled one is allowed', () => {
  const facts = baseline();
  facts.manifest.renderer = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)';
  failsOnly(facts, 'MO-C-02');
});

test('MO-SH-09 / MO-A-04: a software renderer without the downgrade fails', () => {
  const facts = baseline();
  facts.manifest.renderer = 'llvmpipe (LLVM 15.0.7, 256 bits)';
  facts.manifest.softwareRenderer = true;
  facts.manifest.chromeFlags = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...HW_FLAGS.slice(3)];
  failsOnly(facts, 'MO-SH-09');
  assert.equal(statusOf(facts, 'MO-A-04'), 'FAIL');
  facts.manifest.samples = 1;
  facts.checks.perf.times = facts.checks.perf.times.map(() => 100);
  assert.equal(statusOf(facts, 'MO-SH-09'), 'PASS');
  assert.equal(statusOf(facts, 'MO-D-02'), 'PASS', 'software GL uses the 250 ms ceiling');
});

// ---- MO-C-03 flash audit through the real detector ---------------------------------------------

const L2S = (l) => Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055));
function grayFrame(l) { const v = L2S(l); return Buffer.alloc(320 * 180 * 3, v); }
function detect(frames) {
  const detector = new FlashDetector();
  return frames.map((frame, i) => { const r = detector.push(cellGrid(frame, 320, 180, 3)); return { frame: i, flash: { general: r.general, red: r.red, ...(r.general2 ? { general2: r.general2 } : {}), ...(r.red2 ? { red2: r.red2 } : {}), stepArea: r.stepArea } }; });
}
function withFrames(records) {
  const facts = baseline();
  const count = records.length;
  facts.frames = Array.from({ length: count }, (_, i) => ({ ...facts.frames[Math.min(i, TOTAL - 1)], frame: i, flash: records[i].flash }));
  facts.manifest.timeline = [{ id: 'a', sceneId: 'title-slam', shotIndex: 0, start: 0, end: count / FPS, holdSec: count / FPS, kind: 'line', text: 'Field Notes Field Notes', script: 'latin', beatSec: 0 }];
  facts.manifest.passRanges = facts.manifest.passRanges.filter((r) => r.sceneId === 'title-slam').map((r) => ({ ...r, frameEnd: count - 1 }));
  facts.passLines = [];
  for (const r of facts.manifest.passRanges) for (let f = 0; f < count; f += 1) facts.passLines.push({ frame: f, pass: r.pass, draws: 1, uniforms: r.pass === 'dither' ? { u_seed: r.seed } : {} });
  facts.checks.perf.totalFrames = count;
  facts.checks.determinism.frames = [0];
  return facts;
}

test('MO-C-03 fixture (i): a full-frame 0.05-0.55 pulse, 6-frame attack and decay, 4/s at 60 fps, fails', () => {
  const frames = [];
  for (let i = 0; i < 120; i += 1) {
    const phase = i % 15;
    const l = phase < 6 ? 0.05 + (0.5 * (phase + 1)) / 6 : phase < 12 ? 0.55 - (0.5 * (phase - 5)) / 6 : 0.05;
    frames.push(grayFrame(l));
  }
  const records = detect(frames);
  const worst = worstWindowLinear(transitionsOf(records, 'general'), records.length, FPS);
  assert.ok(worst.flashes > 3, `detected ${worst.flashes} flashes`);
  failsOnly(withFrames(records), 'MO-C-03');
});

function blockFrame(on, { x0 = 0, y0 = 0, w = 117, h = 67, onColor = [255, 255, 255], offColor = [0, 0, 0] } = {}) {
  const frame = Buffer.alloc(320 * 180 * 3, 128);
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) { const o = (y * 320 + x) * 3; const c = on ? onColor : offColor; frame[o] = c[0]; frame[o + 1] = c[1]; frame[o + 2] = c[2]; }
  return frame;
}

test('MO-C-03 fixture (ii): a 700x400 block toggling black/white 4/s on a static frame fails', () => {
  const frames = Array.from({ length: 120 }, (_, i) => blockFrame(Math.floor(i / 7.5) % 2 === 0, { x0: 40, y0: 40 }));
  failsOnly(withFrames(detect(frames)), 'MO-C-03');
});

test('MO-C-03: four flashes in the final second fail (no loop wrap in the master)', () => {
  const frames = Array.from({ length: 180 }, (_, i) => (i < 120 ? blockFrame(false, { x0: 40, y0: 40 }) : blockFrame((i - 120) % 14 < 7, { x0: 40, y0: 40 })));
  const records = detect(frames);
  assert.ok(worstWindowLinear(transitionsOf(records, 'general'), records.length, FPS).flashes > 3);
  failsOnly(withFrames(records), 'MO-C-03');
});

test('MO-C-03: red flashes are windowed — four in one second fail, five spread out pass', () => {
  const lowRed = [L2S(0.1), 0, 0], highRed = [L2S(0.5), 0, 0];
  const redFrame = (hi) => blockFrame(hi, { x0: 40, y0: 40, onColor: highRed, offColor: lowRed });
  const burst = Array.from({ length: 120 }, (_, i) => redFrame(Math.floor(i / 7.5) % 2 === 1));
  const burstRecords = detect(burst);
  assert.equal(worstWindowLinear(transitionsOf(burstRecords, 'general'), 120, FPS).flashes, 0, 'luminance change stays under 0.1');
  assert.ok(worstWindowLinear(transitionsOf(burstRecords, 'red'), 120, FPS).flashes > 3);
  failsOnly(withFrames(burstRecords), 'MO-C-03');
  const spread = Array.from({ length: 600 }, (_, i) => redFrame(Math.floor(i / 60) % 2 === 1));
  const spreadRecords = detect(spread);
  const total = transitionsOf(spreadRecords, 'red').length;
  assert.ok(total > 6, `red transitions over the film: ${total}`);
  assert.ok(worstWindowLinear(transitionsOf(spreadRecords, 'red'), 600, FPS).flashes <= 3, 'a flat film-wide count would fail this');
  assert.equal(statusOf(withFrames(spreadRecords), 'MO-C-03'), 'PASS', 'the gate windows red flashes too');
});

test('MO-C-03: the master never wraps — two flashes at the start and two at the end pass', () => {
  const toggle = (i) => (i < 30 ? i % 14 < 7 : i >= 150 ? (i - 150) % 14 < 7 : false);
  const frames = Array.from({ length: 180 }, (_, i) => blockFrame(toggle(i), { x0: 40, y0: 40 }));
  const records = detect(frames);
  assert.equal(statusOf(withFrames(records), 'MO-C-03'), 'PASS', 'a wrapped window would join the end and the start');
  const looping = worstWindowLooping(transitionsOf(records, 'general'), 180, FPS);
  assert.ok(looping.flashes > 3, 'the same clip audited as a loop fails at the seam');
});

test('MO-C-03: the looping preview window wraps across the seam', () => {
  const frames = Array.from({ length: 60 }, (_, i) => blockFrame(i >= 8 && i < 52 ? false : Math.floor(i / 4) % 2 === 0, { x0: 40, y0: 40 }));
  const looped = auditLoop(frames.map((f) => cellGrid(f, 320, 180, 3)));
  const records = looped.map((r) => ({ frame: r.frame, flash: r }));
  const loop = worstWindowLooping(transitionsOf(records, 'general'), 60, 30);
  const linear = worstWindowLinear(transitionsOf(records, 'general'), 60, 30);
  assert.ok(loop.flashes > linear.flashes, `looping ${loop.flashes} vs linear ${linear.flashes}`);
  const facts = baseline();
  facts.previewRecords = records.map((r) => ({ preview: { rung: '960x30', frame: r.frame, frames: 60, fps: 30 }, flash: r.flash }));
  if (loop.flashes > 3) failsOnly(facts, 'MO-C-03');
});

// ---- geometry, type and colour ----------------------------------------------------------------

test('MO-C-04 / MO-C-05: glyph ink outside the inner 90% and a graphic outside the inner 95% fail', () => {
  const title = baseline();
  title.frames[10].textBoxes[0].bbox = [80, 400, 900, 520];
  failsOnly(title, 'MO-C-04');
  const action = baseline();
  action.frames[20].graphics.push({ elementId: 'meter', kind: 'fill', bbox: [30, 500, 200, 520] });
  failsOnly(action, 'MO-C-05');
});

test('MO-C-06: body under 4.5:1, large under 3:1 and a gradient fill are measured on pixels', () => {
  const dim = baseline();
  dim.contrastSamples = [contrastSample('#3A3E48', { fontSizePx: 20, weight: 400 })];
  failsOnly(dim, 'MO-C-06');
  const large = baseline();
  large.contrastSamples = [contrastSample('#4A4F5A', { fontSizePx: 40, weight: 400 })];
  failsOnly(large, 'MO-C-06');
  const largeOk = baseline();
  largeOk.contrastSamples = [contrastSample('#6B717C', { fontSizePx: 40, weight: 400 })];
  assert.equal(statusOf(largeOk, 'MO-C-06'), 'PASS', 'the same ink passes as large type');
  largeOk.contrastSamples = [contrastSample('#6B717C', { fontSizePx: 20, weight: 400 })];
  assert.equal(statusOf(largeOk, 'MO-C-06'), 'FAIL', 'and fails as body type');
  const gradient = baseline();
  gradient.contrastSamples = [contrastSample('#E9EBE4', { fill: 'gradient', split: '#1A1C22' })];
  failsOnly(gradient, 'MO-C-06');
});

test('MO-C-07/08: a unit held under its reading floor fails', () => {
  const facts = baseline();
  facts.manifest.timeline[1] = { ...facts.manifest.timeline[1], holdSec: 1.2, end: 3.6 };
  failsOnly(facts, 'MO-C-07/08');
  const cps = baseline();
  cps.manifest.timeline[0] = { ...cps.manifest.timeline[0], text: 'An extremely long running headline line of type', holdSec: 2.4 };
  failsOnly(cps, 'MO-C-07/08');
});

test('MO-A-15 / MO-A-16: a cut off the beat and a scene under two beats fail', () => {
  const off = baseline();
  off.manifest.timeline[1] = { ...off.manifest.timeline[1], start: 2.45 };
  failsOnly(off, 'MO-A-15');
  const short = baseline();
  short.manifest.timeline[0] = { ...short.manifest.timeline[0], text: 'Go', end: 1.0, holdSec: 1.0 };
  failsOnly(short, 'MO-A-16');
});

test('MO-A-13: a reveal step that splits a 어절 fails', () => {
  const facts = baseline();
  facts.manifest.timeline[2] = { ...facts.manifest.timeline[2], text: '작은 공' };
  failsOnly(facts, 'MO-A-13');
});

test('MO-C-25 / MO-FT-04 / MO-A-33: tracking limits and Hangul runs', () => {
  const display = baseline();
  display.frames[5].textBoxes[0].trackingEm = -0.06;
  failsOnly(display, 'MO-C-25');
  const machine = baseline();
  machine.frames[5].textBoxes.push({ ...machine.frames[5].textBoxes[0], voice: 'machine', trackingEm: -0.01, text: '01' });
  failsOnly(machine, 'MO-C-25');
  const hangul = baseline();
  hangul.frames[200].textBoxes[0].trackingEm = -0.02;
  failsOnly(hangul, 'MO-FT-04');
  const width = baseline();
  width.frames[200].textBoxes[0].fontFile = 'Archivo-w75-wt900.ttf';
  failsOnly(width, 'MO-FT-04');
  assert.equal(statusOf(width, 'MO-A-33'), 'FAIL');
});

test('MO-C-26 / MO-C-27: line-height floor and Latin paragraph measure', () => {
  const leading = baseline();
  leading.frames[30].blocks = [{ elementId: 'list', lines: 3, lineHeight: 1.3, script: 'latin' }];
  failsOnly(leading, 'MO-C-26');
  const cjk = baseline();
  cjk.frames[30].blocks = [{ elementId: 'line', lines: 2, lineHeight: 1.5, script: 'hangul' }];
  failsOnly(cjk, 'MO-C-26');
  const measure = baseline();
  measure.frames[30].blocks = [{ elementId: 'card', lines: 3, lineHeight: 1.6, script: 'latin', paragraph: { chPerLine: [82, 70, 40] } }];
  failsOnly(measure, 'MO-C-27');
  const korean = baseline();
  korean.frames[30].blocks = [{ elementId: 'card', lines: 3, lineHeight: 1.6, script: 'hangul', paragraph: { chPerLine: [52] } }];
  assert.equal(statusOf(korean, 'MO-C-27'), 'PASS', 'Korean measure is advisory');
});

test('MO-C-29: a third saturated cluster, an accent in two entries, or on more than 10% of frames fails', () => {
  const clusters = baseline();
  clusters.frames[40].fills = [{ hex: '#0F7A82', area: 5000 }, { hex: '#D9A441', area: 5000, accent: true }, { hex: '#C0307A', area: 5000 }];
  failsOnly(clusters, 'MO-C-29');
  const entries = baseline();
  entries.frames[40].fills = [{ hex: '#D9A441', area: 900, accent: true }];
  entries.frames[200].fills = [{ hex: '#D9A441', area: 900, accent: true }];
  failsOnly(entries, 'MO-C-29');
  const share = baseline();
  for (let f = 0; f < 40; f += 1) share.frames[f].fills = [{ hex: '#D9A441', area: 900, accent: true }];
  failsOnly(share, 'MO-C-29');
  const muted = baseline();
  muted.frames[40].fills = [{ hex: '#4C3B6E', area: 5000 }, { hex: '#0F7A82', area: 5000 }, { hex: '#D9A441', area: 900, accent: true }];
  assert.equal(statusOf(muted, 'MO-C-29'), 'PASS', 'a muted violet under 50% saturation does not count');
});

// ---- passes -------------------------------------------------------------------------------------

test('MO-SH-01: a seed that does not follow the formula fails', () => {
  const facts = baseline();
  facts.manifest.passRanges[1].seed += 1;
  failsOnly(facts, 'MO-SH-01');
});

test('MO-SH-03: three events in one second of one shot, across sources, fail', () => {
  const facts = baseline();
  facts.manifest.passRanges.push({ pass: 'glitch', frameStart: 0, frameEnd: 143, sceneId: 'title-slam', shotIndex: 0, seed: fnv1a32(`${RUN_SEED}:title-slam:0:glitch`), params: { hitRatePerSec: 1, areaCapPct: 12, hitRatePerSecRealized: 0.8, hits: [{ frame: 30, holdFrames: 2, areaPct: 5 }, { frame: 50, holdFrames: 2, areaPct: 5 }] }, downgraded: false });
  for (let f = 0; f < 144; f += 1) facts.passLines.push({ frame: f, pass: 'glitch', draws: 1, uniforms: {} });
  facts.frames[70].post = { ...facts.frames[70].post, flash: 0.3 };
  failsOnly(facts, 'MO-SH-03');
});

test('MO-SH-04a: a full-frame luminance step in one frame pair fails', () => {
  const facts = baseline();
  facts.frames[90].flash = { ...facts.frames[90].flash, stepArea: 0.6 };
  failsOnly(facts, 'MO-SH-04a');
});

test('MO-SH-05 / 06 / 07: glitch, surge and CRT flicker caps', () => {
  const add = (facts, pass, params) => {
    facts.manifest.passRanges.push({ pass, frameStart: 0, frameEnd: 143, sceneId: 'title-slam', shotIndex: 0, seed: fnv1a32(`${RUN_SEED}:title-slam:0:${pass}`), params, downgraded: false });
    for (let f = 0; f < 144; f += 1) facts.passLines.push({ frame: f, pass, draws: 1, uniforms: {} });
    return facts;
  };
  failsOnly(add(baseline(), 'glitch', { hitRatePerSec: 2.5, areaCapPct: 12, hitRatePerSecRealized: 2.5, hits: [] }), 'MO-SH-05');
  failsOnly(add(baseline(), 'glitch', { hitRatePerSec: 1, areaCapPct: 12, hitRatePerSecRealized: 0.4, hits: [{ frame: 40, holdFrames: 2, areaPct: 24 }] }), 'MO-SH-05');
  failsOnly(add(baseline(), 'tidal-gradient', { surgeCapPerSec: 3, surgeAttackSec: 0.15, surgeDecaySec: 0.25, surgeTimes: [] }), 'MO-SH-06');
  failsOnly(add(baseline(), 'tidal-gradient', { surgeCapPerSec: 2, surgeAttackSec: 0.05, surgeDecaySec: 0.25, surgeTimes: [] }), 'MO-SH-06');
  failsOnly(add(baseline(), 'tidal-gradient', { surgeCapPerSec: 2, surgeAttackSec: 0.15, surgeDecaySec: 0.25, surgeTimes: [0.2, 0.5, 0.8] }), 'MO-SH-06');
  failsOnly(add(baseline(), 'crt', { flickerAmp: 0.08, flickerAmpRealized: 0.08, persistenceEnabled: true, sceneStateful: true }), 'MO-SH-07');
  failsOnly(add(baseline(), 'crt', { flickerAmp: 0.03, flickerAmpRealized: 0.03, persistenceEnabled: true, sceneStateful: false }), 'MO-SH-07/persistence');
});

test('MO-SH-08 / MO-SH-10 / MO-SH-11: dither reseed, visible guides, too many terminal layers', () => {
  const reseed = baseline();
  reseed.passLines = reseed.passLines.map((line) => (line.pass === 'dither' && line.frame === 60 ? { ...line, uniforms: { u_seed: 123 } } : line));
  failsOnly(reseed, 'MO-SH-08');
  const guides = baseline();
  guides.manifest.passRanges[0].params.showGuides = true;
  failsOnly(guides, 'MO-SH-10');
  const layers = baseline();
  layers.manifest.passRanges.push({ pass: 'terminal-ui', frameStart: 0, frameEnd: 143, sceneId: 'title-slam', shotIndex: 0, seed: fnv1a32(`${RUN_SEED}:title-slam:0:terminal-ui`), params: { layers: 3 }, downgraded: false });
  for (let f = 0; f < 144; f += 1) layers.passLines.push({ frame: f, pass: 'terminal-ui', draws: 1, uniforms: {} });
  failsOnly(layers, 'MO-SH-11');
});

// ---- exports, perf, dark runs, glyphs -----------------------------------------------------------

test('MO-C-09: a determinism mismatch fails; a SwiftShader-confirmed hardware pair warns', () => {
  const facts = baseline();
  facts.checks.determinism = { verdict: 'FAIL', frames: [138], mismatched: [{ frame: 138, video: 'a', rerender: 'b' }] };
  failsOnly(facts, 'MO-C-09');
  facts.checks.determinism = { verdict: 'WARN hardware-nondeterminism', frames: [138], mismatched: [{ frame: 138 }] };
  assert.equal(statusOf(facts, 'MO-C-09'), 'WARN');
});

test('MO-C-10/11/12 / MO-A-03: ffprobe tags and the resolution, fps and duration floors', () => {
  for (const change of [{ colorSpace: 'bt470bg' }, { pixFmt: 'yuv444p' }, { colorRange: 'pc' }, { width: 1280, height: 720 }, { fps: 24 }, { durationSec: 2.0 }]) {
    const facts = baseline();
    Object.assign(facts.checks.probe, change);
    failsOnly(facts, 'MO-C-10/11/12');
  }
  const tags = baseline();
  tags.checks.probe.colorTransfer = undefined;
  failsOnly(tags, 'MO-A-03');
});

test('MO-C-13: preview over 3 MB or poster over 1 MB fails', () => {
  const preview = baseline();
  preview.exports.preview.bytes = 3_100_000;
  failsOnly(preview, 'MO-C-13');
  const poster = baseline();
  poster.exports.poster.bytes = 1_200_000;
  failsOnly(poster, 'MO-C-13');
});

test('MO-C-14: an unsettled reduced-motion still fails', () => {
  const facts = baseline();
  facts.exports.still.ink = 2000;
  failsOnly(facts, 'MO-C-14');
  const missing = baseline();
  missing.exports.still = { present: false };
  failsOnly(missing, 'MO-C-14');
});

test('MO-D-02: frame-time p95 over the real-GPU ceiling fails', () => {
  const facts = baseline();
  facts.checks.perf.times = facts.checks.perf.times.map((t, i) => (i % 10 === 0 ? 80 : t));
  failsOnly(facts, 'MO-D-02');
});

test('MO-D-03: a near-black empty run longer than twice the scene floor fails', () => {
  const facts = baseline();
  for (let f = 150; f < 287; f += 1) Object.assign(facts.frames[f], { ink: 0, lumP995: 0.01 });
  facts.manifest.bpm = 200;
  facts.manifest.timeline = facts.manifest.timeline.map((e) => ({ ...e }));
  const result = evaluate(facts).results.find((r) => r.id === 'MO-D-03');
  assert.equal(result.status, 'FAIL', result.detail);
});

test('MO-D-04: a missing glyph is a pre-flight FAIL', () => {
  const pre = evaluatePreflight({ fps: 60, bpm: 100, beatGrid: null, timeline: baseline().manifest.timeline }, [{ shot: 'title-slam', char: '☃', codepoint: 'U+2603', font: 'Archivo' }]);
  assert.ok(pre.failed.includes('MO-D-04'));
  const facts = baseline();
  facts.checks.preflight = pre;
  failsOnly(facts, 'MO-D-04');
});

test('MO-A-37-41 / MO-A-51 / MO-C-15/16: missing export, unknown flags, bad round', () => {
  const missing = baseline();
  missing.exports.poster = { present: false };
  failsOnly(missing, 'MO-A-37-41');
  const flags = baseline();
  flags.manifest.chromeFlags = ['--no-sandbox', ...HW_FLAGS];
  failsOnly(flags, 'MO-A-51');
  const round = baseline();
  round.manifest.round = 4;
  failsOnly(round, 'MO-C-15/16');
});

// ---- withholding and the completion contract ----------------------------------------------------

function stageRun(dir, names) {
  mkdirSync(join(dir, '.run'), { recursive: true });
  for (const name of names) writeFileSync(join(dir, '.run', name), 'x');
  return names.map((name) => join(dir, '.run', name));
}

test('a flash FAIL withholds every export; any other FAIL still delivers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'litgrok-motion-withhold-'));
  try {
    for (const name of ['film.mp4', 'preview.webp', 'poster.png', 'reduced-motion.png']) writeFileSync(join(dir, name), 'stale round');
    clearDeliverables(dir);
    const staged = stageRun(dir, ['film.mp4', 'preview.webp', 'poster.png', 'reduced-motion.png']);
    promoteOrWithhold(dir, staged, true);
    for (const name of ['film.mp4', 'preview.webp', 'poster.png', 'reduced-motion.png']) {
      assert.equal(existsSync(join(dir, name)), false, `${name} sits at a deliverable name`);
      assert.equal(existsSync(join(dir, 'withheld', name)), true);
    }
    clearDeliverables(dir);
    const again = stageRun(dir, ['film.mp4', 'preview.webp', 'poster.png', 'reduced-motion.png']);
    promoteOrWithhold(dir, again, false);
    assert.equal(existsSync(join(dir, 'withheld')), false, 'a new round clears the old withheld diagnostics');
    for (const name of ['film.mp4', 'preview.webp', 'poster.png', 'reduced-motion.png']) assert.equal(existsSync(join(dir, name)), true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function completionFixture({ run, deliver = [], withheld = [], report = 'QA gate: PASS\n', manifest = true, briefAfter = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'litgrok-motion-done-'));
  const brief = join(dir, 'brief.json');
  writeFileSync(brief, '{"title":"x"}');
  mkdirSync(join(dir, '.run'), { recursive: true });
  writeFileSync(join(dir, '.run', 'run.json'), JSON.stringify({ briefPath: brief, round: 1, ...run }));
  for (const name of deliver) writeFileSync(join(dir, name), 'x');
  if (withheld.length) { mkdirSync(join(dir, 'withheld')); for (const name of withheld) writeFileSync(join(dir, 'withheld', name), 'x'); }
  if (manifest) writeFileSync(join(dir, 'manifest.json'), '{}');
  if (report !== null) writeFileSync(join(dir, 'gate-report.txt'), report);
  const past = new Date(Date.now() - 60_000);
  if (briefAfter) { for (const name of ['manifest.json', 'gate-report.txt']) if (existsSync(join(dir, name))) utimesSync(join(dir, name), past, past); }
  else utimesSync(brief, past, past);
  return dir;
}

test('completion contract: what never counts as done', () => {
  const all = ['film.mp4', 'preview.webp', 'poster.png', 'reduced-motion.png'];
  const cases = [
    ['command started only', { run: { state: 'started' } }],
    ['--stills-only', { run: { stillsOnly: true, state: 'stills-only', exitCode: 0, finishedAt: 'x' } }],
    ['BLOCKED exit 10', { run: { exitCode: 10, finishedAt: 'x' } }],
    ['BLOCKED exit 14', { run: { exitCode: 14, finishedAt: 'x' } }],
    ['manifest older than the brief', { run: { exitCode: 0, finishedAt: 'x' }, deliver: all, briefAfter: true }],
    ['missing gate report', { run: { exitCode: 0, finishedAt: 'x' }, deliver: all, report: null }],
    ['exit 13 before round 3', { run: { exitCode: 13, round: 2, finishedAt: 'x' }, deliver: all, report: 'QA gate: FAIL\n' }],
    ['flash FAIL with an export at a deliverable name', { run: { exitCode: 13, round: 3, withheld: true, finishedAt: 'x' }, deliver: ['preview.webp'], withheld: ['film.mp4', 'poster.png', 'reduced-motion.png'], report: 'QA gate: FAIL\nwithheld\n' }],
  ];
  for (const [label, fixture] of cases) {
    const dir = completionFixture(fixture);
    try { assert.equal(completionState(dir).done, false, label); } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('completion contract: what counts as done', () => {
  const all = ['film.mp4', 'preview.webp', 'poster.png', 'reduced-motion.png'];
  const cases = [
    ['gate 0 with the manifest and four artifacts', { run: { exitCode: 0, finishedAt: 'x' }, deliver: all }],
    ['round 3 exit 13 without a flash FAIL, delivered, rules named', { run: { exitCode: 13, round: 3, finishedAt: 'x' }, deliver: all, report: 'QA gate: FAIL\n  MO-C-06 type contrast: FAIL\n' }],
    ['round 3 flash FAIL, exports only withheld, report says withheld', { run: { exitCode: 13, round: 3, withheld: true, finishedAt: 'x' }, withheld: all, report: 'QA gate: FAIL\nflash gate FAIL: withheld pending a fix\n' }],
  ];
  for (const [label, fixture] of cases) {
    const dir = completionFixture(fixture);
    try { assert.equal(completionState(dir).done, true, `${label}: ${completionState(dir).reason}`); } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  assert.ok(readdirSync(tmpdir()).length >= 0);
});
