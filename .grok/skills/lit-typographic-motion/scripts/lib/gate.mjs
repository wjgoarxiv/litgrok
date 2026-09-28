// The numeric QA gate (Section C, MO-D-02..04 and the measurable MO-A / MO-SH rules). evaluate()
// is a pure function of already-recorded facts, so every rule has a browser-free fixture; runGate()
// only loads those facts from a render's output directory. Every threshold lives in constants.mjs.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { COLOUR, FLASH, OUTPUT, PASS_CAPS, PERF, SAFE, TIMING, TYPE, DARK } from './constants.mjs';
import { countUnits, eojeol, readingFloor } from './text.mjs';
import { transitionsOf, worstWindowLinear, worstWindowLooping } from './flash.mjs';
import { decodePng } from './png.mjs';
import { fnv1a32 } from './seed.mjs';
import { flagLadder, isSoftwareRenderer } from './chrome.mjs';

const LOOK_PASSES = new Set(['glitch', 'tidal-gradient', 'crt', 'dither', 'swiss-grid', 'terminal-ui']);
const HANGUL_FONT_FILES = new Set(['PretendardGOV-Regular.otf', 'PretendardGOV-Bold.otf', 'Galmuri9.ttf', 'Pretendard-Regular.otf']);
const EPS = 1e-6;

const pass = (id, detail = '') => ({ id, status: 'PASS', detail });
const fail = (id, detail) => ({ id, status: 'FAIL', detail });
const warn = (id, detail) => ({ id, status: 'WARN', detail });

// ---- timing ------------------------------------------------------------------------------------

function beatLength(manifest, time) {
  if (manifest.bpm) return 60 / manifest.bpm;
  const grid = manifest.beatGrid ?? [];
  let best = null;
  for (let i = 0; i + 1 < grid.length; i += 1) if (grid[i] <= time + EPS) best = grid[i + 1] - grid[i];
  return best ?? (grid.length > 1 ? grid[1] - grid[0] : 0.6);
}

export function checkReadingFloors(manifest) {
  const fps = manifest.fps;
  let tightest = null;
  const failures = [];
  for (const entry of manifest.timeline) {
    if (!entry.text) continue;
    const kind = entry.kind === 'scene' ? 'line' : entry.kind;
    const floor = readingFloor(entry.text, kind);
    const margin = entry.holdSec - floor;
    if (!tightest || margin < tightest.margin) tightest = { text: entry.text, kind: entry.kind, hold: entry.holdSec, floor, margin };
    if (entry.holdSec < floor - 1 / fps - EPS) failures.push(`"${entry.text}" (${entry.kind}) holds ${entry.holdSec.toFixed(3)} s < floor ${floor.toFixed(3)} s`);
    if (kind === 'line') {
      const { latinChars } = countUnits(entry.text);
      if (latinChars / entry.holdSec > TIMING.latinCharsPerSecond + EPS) failures.push(`"${entry.text}" runs ${(latinChars / entry.holdSec).toFixed(1)} cps > ${TIMING.latinCharsPerSecond}`);
    }
  }
  const detail = tightest ? `tightest unit "${tightest.text}" (${tightest.kind}) hold ${tightest.hold.toFixed(3)} s vs floor ${tightest.floor.toFixed(3)} s` : 'no text units';
  return failures.length ? fail('MO-C-07/08', `${failures[0]}${failures.length > 1 ? ` (+${failures.length - 1} more)` : ''}; ${detail}`) : pass('MO-C-07/08', detail);
}

export function checkBeatSnap(manifest) {
  const fps = manifest.fps;
  const lines = manifest.timeline.filter((entry) => entry.kind === 'line' || entry.kind === 'scene');
  const offBeat = lines.filter((entry) => Math.abs(entry.start - entry.beatSec) > TIMING.cutToleranceFrames / fps + EPS);
  const results = [];
  results.push(offBeat.length ? fail('MO-A-15', `cut of "${offBeat[0].id}" at ${offBeat[0].start.toFixed(4)} s is ${Math.abs(offBeat[0].start - offBeat[0].beatSec).toFixed(4)} s off its beat ${offBeat[0].beatSec}`) : pass('MO-A-15', `${lines.length} cuts within 1 frame of the beat`));
  const short = lines.filter((entry) => entry.holdSec < TIMING.minSceneBeats * beatLength(manifest, entry.start) - 1 / fps - EPS);
  results.push(short.length ? fail('MO-A-16', `"${short[0].id}" holds ${short[0].holdSec.toFixed(3)} s < 2 beats (${(2 * beatLength(manifest, short[0].start)).toFixed(3)} s)`) : pass('MO-A-16', 'every scene holds at least 2 beats'));
  return results;
}

export function checkEojeol(manifest) {
  const lines = new Map(manifest.timeline.filter((e) => e.kind === 'line').map((e) => [`${e.sceneId}#${e.shotIndex}`, eojeol(e.text)]));
  for (const entry of manifest.timeline.filter((e) => e.kind === 'reveal' || e.kind === 'word')) {
    const words = lines.get(`${entry.sceneId}#${entry.shotIndex}`) ?? [];
    const step = eojeol(entry.text);
    const found = words.some((_, i) => step.every((w, j) => words[i + j] === w));
    if (!found) return fail('MO-A-13', `reveal "${entry.text}" is not a whole 어절 run of its line`);
  }
  return pass('MO-A-13', 'every reveal step is whole 어절');
}

// ---- passes and log ----------------------------------------------------------------------------

export function checkPassCoverage(manifest, passLines, totalFrames) {
  const results = [];
  if (!manifest.passRanges?.length) {
    results.push(fail('MO-SH-00', 'manifest lists no pass ranges'));
    results.push(fail('MO-C-01', 'no GLSL pass ran'));
    return results;
  }
  results.push(pass('MO-SH-00', `${manifest.passRanges.length} pass ranges`));
  const byPassFrame = new Map();
  for (const line of passLines) byPassFrame.set(`${line.pass}:${line.frame}`, line);
  const gaps = [];
  for (const range of manifest.passRanges) {
    for (let f = range.frameStart; f <= range.frameEnd; f += 1) {
      if (!byPassFrame.has(`${range.pass}:${f}`)) { gaps.push(`${range.pass}@${range.sceneId}#${range.shotIndex} frame ${f}`); break; }
    }
  }
  results.push(gaps.length ? fail('MO-SH-00a', `range without a render-log line: ${gaps[0]}`) : pass('MO-SH-00a', 'every range frame has its log line'));
  const covered = new Uint8Array(totalFrames);
  for (const line of passLines) if (LOOK_PASSES.has(line.pass) && line.draws >= 1 && line.frame < totalFrames) covered[line.frame] = 1;
  const gap = covered.indexOf(0);
  results.push(gap >= 0 ? fail('MO-SH-00b', `frame ${gap} has no look-library pass with draws >= 1`) : pass('MO-SH-00b', 'every frame covered by a pass that drew'));
  results.push(gap >= 0 ? fail('MO-C-01', `frame ${gap} is not covered by a drawing GLSL pass`) : pass('MO-C-01', 'interval-union coverage complete'));
  return results;
}

export function checkSeeds(manifest) {
  for (const range of manifest.passRanges) {
    const expected = range.pass === 'swiss-grid' ? null : fnv1a32(`${manifest.seed}:${range.sceneId}:${range.shotIndex}:${range.pass}`);
    if (range.seed !== expected) return fail('MO-SH-01', `${range.pass}@${range.sceneId}#${range.shotIndex} seed ${range.seed} != ${expected}`);
  }
  return pass('MO-SH-01', 'every seed matches fnv1a32(runSeed:sceneId:shotIndex:pass)');
}

export function checkPassCaps(manifest, passLines) {
  const results = [];
  const ranges = (name) => manifest.passRanges.filter((r) => r.pass === name);
  const glitchBad = ranges('glitch').find((r) => r.params.hitRatePerSec > PASS_CAPS.glitchHitRate + EPS || r.params.areaCapPct > PASS_CAPS.glitchAreaPct + EPS || r.params.hitRatePerSecRealized > PASS_CAPS.glitchHitRate + EPS || (r.params.hits ?? []).some((hit) => hit.areaPct > PASS_CAPS.glitchAreaPct + EPS));
  results.push(glitchBad ? fail('MO-SH-05', `glitch@${glitchBad.sceneId}#${glitchBad.shotIndex} over cap (rate ${glitchBad.params.hitRatePerSecRealized ?? glitchBad.params.hitRatePerSec}/s, area ${Math.max(glitchBad.params.areaCapPct, ...(glitchBad.params.hits ?? []).map((h) => h.areaPct))}%)`) : pass('MO-SH-05', ranges('glitch').length ? 'glitch within 2.0 hits/s and 20% area' : 'not used'));
  const surgeBad = ranges('tidal-gradient').find((r) => r.params.surgeCapPerSec > PASS_CAPS.surgeRate + EPS || r.params.surgeAttackSec < PASS_CAPS.surgeEdgeFloor - EPS || r.params.surgeDecaySec < PASS_CAPS.surgeEdgeFloor - EPS || maxInWindow(r.params.surgeTimes ?? []) > PASS_CAPS.surgeRate);
  results.push(surgeBad ? fail('MO-SH-06', `tidal-gradient@${surgeBad.sceneId}#${surgeBad.shotIndex} surge cap ${surgeBad.params.surgeCapPerSec}/s, attack ${surgeBad.params.surgeAttackSec} s, decay ${surgeBad.params.surgeDecaySec} s`) : pass('MO-SH-06', ranges('tidal-gradient').length ? 'surges within 2/s, attack and decay >= 0.1 s' : 'not used'));
  const crtBad = ranges('crt').find((r) => r.params.flickerAmp > PASS_CAPS.crtFlicker + EPS || (r.params.flickerAmpRealized ?? 0) > PASS_CAPS.crtFlicker + EPS);
  results.push(crtBad ? fail('MO-SH-07', `crt@${crtBad.sceneId}#${crtBad.shotIndex} flicker ${Math.max(crtBad.params.flickerAmp, crtBad.params.flickerAmpRealized ?? 0)} > 0.06`) : pass('MO-SH-07', ranges('crt').length ? 'crt flicker within 0.06' : 'not used'));
  let reseed = null;
  for (const range of ranges('dither')) {
    const seeds = new Set(passLines.filter((l) => l.pass === 'dither' && l.frame >= range.frameStart && l.frame <= range.frameEnd && l.uniforms?.u_seed !== undefined).map((l) => l.uniforms.u_seed));
    if (seeds.size > 1 || (seeds.size === 1 && !seeds.has(range.seed))) reseed = `${range.sceneId}#${range.shotIndex} seeds ${[...seeds].join(', ')}`;
  }
  results.push(reseed ? fail('MO-SH-08', `dither reseeded inside a shot: ${reseed}`) : pass('MO-SH-08', ranges('dither').length ? 'one dither seed per shot' : 'not used'));
  const guides = manifest.passRanges.find((r) => r.pass === 'swiss-grid' && r.params.showGuides) ?? passLines.find((l) => l.pass === 'swiss-grid' && l.uniforms?.u_showGuides === true);
  results.push(guides ? fail('MO-SH-10', 'swiss-grid showGuides is true in an export') : pass('MO-SH-10', ranges('swiss-grid').length ? 'guides off' : 'not used'));
  const layers = ranges('terminal-ui').find((r) => (r.params.layers ?? 1) > PASS_CAPS.terminalLayers);
  results.push(layers ? fail('MO-SH-11', `terminal-ui uses ${layers.params.layers} Canvas2D layers (> 2)`) : pass('MO-SH-11', ranges('terminal-ui').length ? 'terminal-ui within 2 layers' : 'not used'));
  const persistence = ranges('crt').find((r) => r.params.persistenceEnabled && !r.params.sceneStateful);
  results.push(persistence ? fail('MO-SH-07/persistence', `crt persistence on a non-stateful scene (${persistence.sceneId}#${persistence.shotIndex})`) : pass('MO-SH-07/persistence', ranges('crt').length ? 'persistence only on stateful scenes' : 'not used'));
  return results;
}

function maxInWindow(times) {
  let best = 0;
  const sorted = [...times].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    let j = i;
    while (j < sorted.length && sorted[j] - sorted[i] < 1 - EPS) j += 1;
    best = Math.max(best, j - i);
  }
  return best;
}

// MO-SH-03: glitch hits, surges, flash rises above 0.1, invert changes and boot bursts, per shot.
export function checkEventCeiling(manifest, frames) {
  const fps = manifest.fps;
  const shots = new Map();
  const add = (key, t) => { if (!shots.has(key)) shots.set(key, []); shots.get(key).push(t); };
  for (const range of manifest.passRanges) {
    const key = `${range.sceneId}#${range.shotIndex}`;
    if (range.pass === 'glitch') for (const hit of range.params.hits ?? []) add(key, hit.frame / fps);
    if (range.pass === 'tidal-gradient') for (const t of range.params.surgeTimes ?? []) add(key, t);
    if (range.pass === 'crt') for (const t of range.params.bootFlickerTimes ?? []) add(key, t);
  }
  const lineEntries = manifest.timeline.filter((e) => e.kind === 'line' || e.kind === 'scene');
  const shotOf = (frame) => lineEntries.find((e) => frame >= Math.round(e.start * fps) && frame < Math.round(e.end * fps));
  let previous = null;
  for (const frame of frames) {
    const entry = shotOf(frame.frame);
    if (!entry) continue;
    const key = `${entry.sceneId}#${entry.shotIndex}`;
    const flash = frame.post?.flash ?? 0;
    const invert = Boolean(frame.post?.invert);
    if (previous && flash > PASS_CAPS.flashEventThreshold && (previous.post?.flash ?? 0) <= PASS_CAPS.flashEventThreshold) add(key, frame.frame / fps);
    if (previous && invert !== Boolean(previous.post?.invert)) add(key, frame.frame / fps);
    previous = frame;
  }
  for (const [key, times] of shots) {
    const worst = maxInWindow(times);
    if (worst > PASS_CAPS.eventsPerSecondPerShot) return fail('MO-SH-03', `shot ${key} has ${worst} events in one 1 s window (cap 2)`);
  }
  return pass('MO-SH-03', 'at most 2 events per 1 s window in every shot');
}

export function checkInvert(manifest, frames) {
  const fps = manifest.fps;
  const cuts = new Set(manifest.timeline.filter((e) => e.kind === 'line' || e.kind === 'scene').map((e) => Math.round(e.start * fps)));
  let lastChange = null;
  let previous = null;
  for (const frame of frames) {
    const post = frame.post ?? {};
    if (post.flash !== undefined && (post.flash < 0 || post.flash > 1)) return fail('MO-A-58', `frame ${frame.frame} flash ${post.flash} outside 0..1`);
    if (post.fade !== undefined && (post.fade < 0 || post.fade > 1)) return fail('MO-A-58', `frame ${frame.frame} fade ${post.fade} outside 0..1`);
    if (post.zoom !== undefined && !(post.zoom > 0)) return fail('MO-A-58', `frame ${frame.frame} zoom ${post.zoom} not > 0`);
    if (previous && Boolean(post.invert) !== Boolean(previous.post?.invert)) {
      if (!cuts.has(frame.frame)) return fail('MO-A-58', `invert changes at frame ${frame.frame}, not on a cut`);
      if (lastChange !== null && (frame.frame - lastChange) / fps < 2 * beatLength(manifest, frame.frame / fps) - EPS) return fail('MO-A-58', `invert held ${((frame.frame - lastChange) / fps).toFixed(3)} s < 2 beats`);
      lastChange = frame.frame;
    }
    previous = frame;
  }
  return pass('MO-A-58', 'override fields in range; invert only on cuts');
}

export function checkFullFrameStep(frames) {
  const bad = frames.find((f) => (f.flash?.stepArea ?? 0) > FLASH.fullFrameStepArea + EPS);
  return bad ? fail('MO-SH-04a', `frame ${bad.frame} steps >= 0.1 luminance over ${(bad.flash.stepArea * 100).toFixed(1)}% of the frame`) : pass('MO-SH-04a', 'no full-frame luminance step');
}

// ---- flash -------------------------------------------------------------------------------------

export function checkFlash(manifest, frames, previewRecords) {
  const fps = manifest.fps;
  const missing = frames.length === 0 || frames.some((f) => !f.flash);
  if (missing) return { result: fail('MO-C-03', 'master frames lack flash-audit records'), master: null, preview: null };
  const general = worstWindowLinear(transitionsOf(frames, 'general'), frames.length, fps);
  const red = worstWindowLinear(transitionsOf(frames, 'red'), frames.length, fps);
  let preview = null;
  if (previewRecords?.length) {
    const previewFps = previewRecords[0].preview.fps;
    const count = previewRecords.length;
    const records = previewRecords.map((r) => ({ frame: r.preview.frame, flash: r.flash }));
    preview = { general: worstWindowLooping(transitionsOf(records, 'general'), count, previewFps), red: worstWindowLooping(transitionsOf(records, 'red'), count, previewFps), fps: previewFps };
  }
  const worstG = Math.max(general.flashes, preview?.general.flashes ?? 0);
  const worstR = Math.max(red.flashes, preview?.red.flashes ?? 0);
  const where = general.flashes >= (preview?.general.flashes ?? 0) ? `master window at frame ${general.startFrame} (${(general.startFrame / fps).toFixed(2)} s)` : `preview window at frame ${preview.general.startFrame}`;
  const detail = `worst window ${worstG} general / ${worstR} red (limit ${FLASH.maxGeneral} / ${FLASH.maxRed}); ${where}${preview ? '' : '; preview not audited'}`;
  const bad = worstG > FLASH.maxGeneral || worstR > FLASH.maxRed || (!preview && manifest.previewEncoder);
  return { result: bad ? fail('MO-C-03', detail) : pass('MO-C-03', detail), master: { general, red }, preview };
}

// ---- type geometry -----------------------------------------------------------------------------

const inside = (box, rect) => box[0] >= rect[0] - EPS && box[1] >= rect[1] - EPS && box[2] <= rect[2] + EPS && box[3] <= rect[3] + EPS;
const overrun = (box, rect) => Math.max(rect[0] - box[0], rect[1] - box[1], box[2] - rect[2], box[3] - rect[3]);

export function checkSafeAreas(frames) {
  const titleBad = [];
  const actionBad = [];
  for (const frame of frames) {
    for (const box of frame.textBoxes ?? []) if (!inside(box.bbox, SAFE.title)) titleBad.push(`${box.text}@${frame.frame}:${overrun(box.bbox, SAFE.title).toFixed(1)}px`);
    for (const g of frame.graphics ?? []) if (!inside(g.bbox, SAFE.action)) actionBad.push(`${g.elementId}@${frame.frame}:${overrun(g.bbox, SAFE.action).toFixed(1)}px`);
  }
  return [
    titleBad.length ? fail('MO-C-04', `violations: ${titleBad.slice(0, 3).join(', ')}${titleBad.length > 3 ? ` (+${titleBad.length - 3})` : ''}`) : pass('MO-C-04', 'violations: none'),
    actionBad.length ? fail('MO-C-05', `violations: ${actionBad.slice(0, 3).join(', ')}`) : pass('MO-C-05', 'violations: none'),
  ];
}

export function checkTracking(frames) {
  const results = [];
  let display = null, machine = null, hangul = null, hangulFont = null;
  for (const frame of frames) {
    for (const box of frame.textBoxes ?? []) {
      if (box.voice === 'display' && box.trackingEm < TYPE.displayTrackingFloorEm - EPS) display ??= `${box.text}@${frame.frame} ${box.trackingEm}em`;
      if (box.voice === 'machine' && box.trackingEm < TYPE.machineTrackingFloorEm - EPS) machine ??= `${box.text}@${frame.frame} ${box.trackingEm}em`;
      if (box.script === 'hangul' && (box.trackingEm !== 0 || /^Archivo-w/.test(box.fontFile ?? ''))) hangul ??= `${box.text}@${frame.frame}`;
      if (box.script === 'hangul' && box.fontFile && !HANGUL_FONT_FILES.has(box.fontFile)) hangulFont ??= `${box.text}@${frame.frame} in ${box.fontFile}`;
    }
  }
  results.push(display || machine ? fail('MO-C-25', display ? `display tracking past -0.04em: ${display}` : `negative tracking on the machine voice: ${machine}`) : pass('MO-C-25', 'display >= -0.04em, machine >= 0'));
  results.push(hangul ? fail('MO-FT-04', `tracking or width motion on a Hangul run: ${hangul}`) : pass('MO-FT-04', 'Hangul runs untracked, no width axis'));
  results.push(hangulFont ? fail('MO-A-33', `Hangul drawn outside the lit-pptx pair / Galmuri: ${hangulFont}`) : pass('MO-A-33', 'Hangul weight steps only between the two static files'));
  return results;
}

export function checkBlocks(frames) {
  let lineHeight = null;
  let measure = null;
  const advisory = [];
  for (const frame of frames) {
    for (const block of frame.blocks ?? []) {
      if (block.lines >= 2) {
        const cjk = block.script !== 'latin';
        const floor = Math.max(cjk ? TYPE.cjkLineHeight : TYPE.latinLineHeight, block.lines >= TYPE.denseLines ? TYPE.denseLineHeight : 0);
        if (block.lineHeight < floor - EPS) lineHeight ??= `${block.elementId}@${frame.frame} ${block.lineHeight} < ${floor}`;
      }
      if (block.paragraph) {
        for (const ch of block.paragraph.chPerLine ?? []) {
          if (block.script === 'latin' && (ch < TYPE.paragraphMinCh || ch > TYPE.paragraphMaxCh)) measure ??= `${block.elementId}@${frame.frame} ${ch}ch`;
          if (block.script !== 'latin' && (ch < TYPE.cjkParagraphAdvisory[0] || ch > TYPE.cjkParagraphAdvisory[1])) advisory.push(`${block.elementId} ${ch}ch`);
        }
      }
    }
  }
  return [
    lineHeight ? fail('MO-C-26', `line-height under floor: ${lineHeight}`) : pass('MO-C-26', 'multi-line blocks at or above floor'),
    measure ? fail('MO-C-27', `Latin paragraph measure outside 60-75ch: ${measure}`) : pass('MO-C-27', advisory.length ? `advisory (CJK 30-45ch): ${advisory[0]}` : 'no paragraph card outside measure'),
  ];
}

// ---- colour ------------------------------------------------------------------------------------

function hsl(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { h: (h + 360) % 360, s, l };
}
const hueDistance = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

export function checkColour(manifest, frames) {
  const fps = manifest.fps;
  const fills = [];
  for (const range of manifest.passRanges) for (const hex of range.params?.paletteStopsHex ?? []) fills.push({ hex, accent: false });
  const accentFrames = new Set();
  const accentShots = new Set();
  for (const frame of frames) {
    for (const box of frame.textBoxes ?? []) if (box.fill !== 'gradient' && /^#[0-9a-f]{6}$/i.test(box.fill) && box.bbox[2] - box.bbox[0] >= COLOUR.minFillPx && box.bbox[3] - box.bbox[1] >= COLOUR.minFillPx) fills.push({ hex: box.fill, accent: false });
    for (const fill of frame.fills ?? []) {
      if (fill.area < COLOUR.minFillPx * COLOUR.minFillPx) continue;
      fills.push({ hex: fill.hex, accent: Boolean(fill.accent) });
      if (fill.accent) { accentFrames.add(frame.frame); accentShots.add(frame.shotIndex); }
    }
  }
  const clusters = [];
  for (const fill of fills) {
    const { h, s } = hsl(fill.hex);
    if (s < COLOUR.saturationFloor - EPS) continue;
    const cluster = clusters.find((c) => hueDistance(c.hue, h) <= COLOUR.hueTolerance);
    if (cluster) { cluster.count += 1; cluster.accent ||= fill.accent; } else clusters.push({ hue: h, hex: fill.hex, count: 1, accent: fill.accent });
  }
  if (clusters.length > COLOUR.maxSaturatedClusters) return fail('MO-C-29', `${clusters.length} saturated clusters (${clusters.map((c) => c.hex).join(', ')}); at most one signal + one accent`);
  if (accentShots.size > COLOUR.accentEntries) return fail('MO-C-29', `accent appears in ${accentShots.size} timeline entries`);
  const share = frames.length ? accentFrames.size / frames.length : 0;
  if (share > COLOUR.accentFrameFraction + EPS) return fail('MO-C-29', `accent on ${(share * 100).toFixed(1)}% of frames (> 10%)`);
  return pass('MO-C-29', `${clusters.length} saturated cluster(s); accent on ${(share * 100).toFixed(1)}% of frames in ${accentShots.size} entry`);
}

// ---- contrast ----------------------------------------------------------------------------------

const LUT = Float64Array.from({ length: 256 }, (_, v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))];
}

// CF-201/CF-204 on video: foreground = median linear luminance under the glyph mask eroded by 1 px;
// background = 5th/95th percentiles inside the bbox grown by 0.25 x cap height, outside the mask
// dilated by 2 px. The ratio is the worse pairing; a gradient fill uses its own 5th/95th.
export function measureContrast(box, rgb, mask, width, height) {
  const [x0, y0, x1, y1] = box.bbox.map(Math.round);
  const grow = Math.round(0.25 * (box.capHeightPx || 0));
  const bx0 = Math.max(0, x0 - grow), by0 = Math.max(0, y0 - grow), bx1 = Math.min(width - 1, x1 + grow), by1 = Math.min(height - 1, y1 + grow);
  const on = (x, y) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] >= 128;
  const lum = (x, y) => { const o = (y * width + x) * 3; return 0.2126 * LUT[rgb[o]] + 0.7152 * LUT[rgb[o + 1]] + 0.0722 * LUT[rgb[o + 2]]; };
  const fg = [], bg = [];
  for (let y = by0; y <= by1; y += 1) {
    for (let x = bx0; x <= bx1; x += 1) {
      const inBox = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (inBox && on(x, y) && on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1)) fg.push(lum(x, y));
      else {
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy += 1) for (let dx = -2; dx <= 2 && !near; dx += 1) if (on(x + dx, y + dy)) near = true;
        if (!near) bg.push(lum(x, y));
      }
    }
  }
  if (fg.length < 12 || bg.length < 12) return null;
  const b5 = percentile(bg, 0.05), b95 = percentile(bg, 0.95);
  const fgValues = box.fill === 'gradient' ? [percentile(fg, 0.05), percentile(fg, 0.95)] : [percentile(fg, 0.5)];
  let worst = Infinity;
  for (const f of fgValues) for (const b of [b5, b95]) worst = Math.min(worst, ratio(f, b));
  return worst;
}

export const isLargeType = (box) => box.fontSizePx >= TYPE.largeFontPx - EPS || (box.fontSizePx >= TYPE.largeBoldFontPx - EPS && (box.weight ?? 400) >= TYPE.largeBoldWeight);

export function checkContrast(samples) {
  let worst = null;
  let failure = null;
  for (const sample of samples) {
    for (const box of sample.boxes) {
      if ((box.opacity ?? 1) < 1) continue;
      const measured = measureContrast(box, sample.rgb, sample.mask, sample.width, sample.height);
      if (measured === null) continue;
      const floor = isLargeType(box) ? TYPE.largeContrast : TYPE.bodyContrast;
      if (!worst || measured / floor < worst.ratio / worst.floor) worst = { ratio: measured, floor, frame: sample.frame, text: box.text };
      if (measured < floor - EPS && !failure) failure = { ratio: measured, floor, frame: sample.frame, text: box.text };
    }
  }
  if (!worst) return fail('MO-C-06', 'no settled text sample could be measured');
  const detail = `min ratio ${worst.ratio.toFixed(2)}:1 at frame ${worst.frame} ("${worst.text}", floor ${worst.floor.toFixed(1)}:1)`;
  return failure ? fail('MO-C-06', `"${failure.text}" at frame ${failure.frame}: ${failure.ratio.toFixed(2)}:1 < ${failure.floor}:1; ${detail}`) : pass('MO-C-06', detail);
}

// ---- dark runs, perf, exports ------------------------------------------------------------------

export function checkDarkRuns(manifest, frames) {
  const fps = manifest.fps;
  const total = frames.length;
  const lines = manifest.timeline.filter((e) => e.kind === 'line' || e.kind === 'scene');
  let run = null;
  const runs = [];
  for (const frame of frames) {
    const dark = frame.ink === 0 && frame.lumP995 !== undefined && frame.lumP995 < DARK.luminanceP995;
    if (dark) run = run ? { ...run, end: frame.frame } : { start: frame.frame, end: frame.frame };
    else if (run) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
  for (const r of runs) {
    const entry = lines.find((e) => r.start >= Math.round(e.start * fps) && r.start < Math.round(e.end * fps)) ?? lines[0];
    const beat = beatLength(manifest, entry?.start ?? 0);
    let allowed = DARK.runBeatsFactor * TIMING.minSceneBeats * beat * fps;
    if (r.start === 0 || r.end === total - 1) allowed += DARK.edgeAllowanceSec * fps;
    const length = r.end - r.start + 1;
    if (length > allowed + EPS) return fail('MO-D-03', `near-black run of ${length} frames at ${r.start} > ${Math.round(allowed)} allowed`);
  }
  return pass('MO-D-03', runs.length ? `${runs.length} short empty run(s) within allowance` : 'no empty near-black run');
}

export function checkPerf(manifest, perf) {
  if (!perf?.times?.length) return fail('MO-D-02', 'no perf run recorded');
  const ceiling = manifest.softwareRenderer ? PERF.softwareP95Ms : PERF.gpuP95Ms;
  const sorted = [...perf.times].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const enough = perf.times.length >= Math.min(PERF.minFrames, perf.totalFrames ?? PERF.minFrames);
  const detail = `p95 ${p95.toFixed(1)} ms over ${perf.times.length} frames (ceiling ${ceiling} ms, ${manifest.softwareRenderer ? 'software GL' : 'real GPU'})`;
  if (!enough) return fail('MO-D-02', `too few perf frames: ${detail}`);
  return p95 > ceiling ? fail('MO-D-02', `${detail}; fix: lower samples or tidal octaves`) : pass('MO-D-02', detail);
}

export function checkEncode(manifest, probe, exports) {
  const results = [];
  if (!probe || probe.error) {
    results.push(fail('MO-C-10/11/12', `ffprobe unavailable: ${probe?.error ?? 'no master'}`));
    results.push(fail('MO-A-03', 'encode tags not verifiable'));
    return results;
  }
  const tags = probe.pixFmt === 'yuv420p' && probe.colorSpace === 'bt709' && probe.colorRange === 'tv';
  const floors = probe.width >= OUTPUT.minWidth && probe.height >= OUTPUT.minHeight && probe.fps >= OUTPUT.minFps - EPS && probe.durationSec >= OUTPUT.minDurationSec - EPS;
  const detail = `${probe.durationSec?.toFixed(2)} s @ ${probe.fps?.toFixed(2)} fps, ${probe.width}x${probe.height}; ffprobe ${probe.pixFmt}/${probe.colorSpace}/${probe.colorRange} ${tags ? 'Y' : 'N'}`;
  const forced = manifest.target?.floorsForceLonger ? `; the reading floors need ${manifest.target.floorSec.toFixed(1)} s, past the ${manifest.target.durationSec} s target` : '';
  results.push(!floors || !tags ? fail('MO-C-10/11/12', detail) : probe.durationSec > OUTPUT.warnDurationSec ? warn('MO-C-10/11/12', `${detail}; longer than 90 s`) : forced ? warn('MO-C-10/11/12', `${detail}${forced}`) : pass('MO-C-10/11/12', `${detail}${manifest.target ? `; target ${manifest.target.durationSec} s` : ''}`));
  const allTags = tags && probe.colorTransfer === 'bt709' && probe.colorPrimaries === 'bt709';
  results.push(allTags ? pass('MO-A-03', 'BT.709 matrix, transfer, primaries; tv range; yuv420p') : fail('MO-A-03', `tags ${probe.colorSpace}/${probe.colorTransfer}/${probe.colorPrimaries}/${probe.colorRange}/${probe.pixFmt}`));
  return results;
}

export function checkSizes(manifest, exports, previewInfo) {
  const mp4 = exports.mp4?.bytes ?? 0;
  const preview = exports.preview?.bytes;
  const poster = exports.poster?.bytes;
  const parts = [`mp4 ${mp4}`, `${exports.preview?.name ?? 'preview'} ${preview ?? 'missing'} (cap 3 MB)`, `poster ${poster ?? 'missing'} (cap 1 MB)`];
  const detail = parts.join(', ');
  if (preview === undefined || poster === undefined) return fail('MO-C-13', `${detail}; export missing`);
  if (preview > OUTPUT.previewBytes) return fail('MO-C-13', `${detail}; smallest preview reached ${previewInfo?.width ?? '?'}px ${previewInfo?.fps ?? '?'} fps`);
  if (poster > OUTPUT.posterBytes) return fail('MO-C-13', detail);
  const warnAt = OUTPUT.mp4WarnBytesPer10s * Math.max(1, manifest.durationSec / 10);
  return mp4 > warnAt ? warn('MO-C-13', `${detail}; mp4 above 100 MB per 10 s`) : pass('MO-C-13', detail);
}

export function checkStill(manifest, frames, still) {
  if (!still?.present) return fail('MO-C-14', 'present N, ink-coverage check FAIL (reduced-motion still missing)');
  const fps = manifest.fps;
  const finalLine = [...manifest.timeline].reverse().find((e) => (e.kind === 'line' || e.kind === 'scene') && e.text);
  const refFrame = Math.round(finalLine.end * fps) - 1;
  const ref = frames.find((f) => f.frame === refFrame);
  if (!ref) return fail('MO-C-14', `present Y, reference frame ${refFrame} missing from the log`);
  const ratioValue = ref.ink > 0 ? still.ink / ref.ink : still.ink > 0 ? 1 : 0;
  const detail = `present Y, ink ${still.ink} vs ${ref.ink} at frame ${refFrame} (${ratioValue.toFixed(3)}x, floor ${OUTPUT.stillInkFloor}x)`;
  return ratioValue < OUTPUT.stillInkFloor - EPS ? fail('MO-C-14', `${detail}; ink-coverage check FAIL`) : pass('MO-C-14', `${detail}; ink-coverage check PASS`);
}

export function checkRenderer(manifest) {
  const results = [];
  const software = isSoftwareRenderer(manifest.renderer);
  const labelled = manifest.softwareRenderer === software;
  results.push(!manifest.renderer ? fail('MO-C-02', 'no renderer recorded') : !labelled ? fail('MO-C-02', `renderer "${manifest.renderer}" is software GL but not labelled`) : pass('MO-C-02', `${software ? 'software' : 'hardware'} — ${manifest.renderer}`));
  const rungs = [...flagLadder({ platform: 'darwin' }), ...flagLadder({ platform: 'linux' }), ...flagLadder({ platform: 'win32' })].map((rung) => rung.join(' '));
  const flags = (manifest.chromeFlags ?? []).join(' ');
  results.push(rungs.includes(flags) ? pass('MO-A-51', `rung ${flags.split(' ')[0]}`) : fail('MO-A-51', `chromeFlags not a ladder rung: ${flags}`));
  if (software) {
    const affected = manifest.passRanges.filter((r) => r.pass === 'tidal-gradient' || r.pass === 'crt');
    const notDowngraded = affected.find((r) => !r.downgraded || (r.pass === 'tidal-gradient' && r.params.octaves > 3) || (r.pass === 'crt' && r.params.persistenceEnabled));
    const ok = manifest.samples === 1 && !notDowngraded;
    results.push(ok ? pass('MO-SH-09', 'software GL: samples 1, octaves and persistence downgraded') : fail('MO-SH-09', `software renderer without the downgrade (samples ${manifest.samples}${notDowngraded ? `, ${notDowngraded.pass} not downgraded` : ''})`));
    results.push(manifest.samples === 1 ? pass('MO-A-04', 'software GL reported, --samples 1') : fail('MO-A-04', `software GL at --samples ${manifest.samples}`));
  } else {
    results.push(pass('MO-SH-09', 'hardware GL; no downgrade needed'));
    results.push(manifest.samples === 4 && manifest.shutter === 0.5 ? pass('MO-A-04', 'hardware GL, --samples 4 --shutter 0.5') : fail('MO-A-04', `hardware GL at --samples ${manifest.samples} --shutter ${manifest.shutter}`));
  }
  return results;
}

export function checkDeterminism(determinism) {
  if (!determinism) return fail('MO-C-09', 'no re-render recorded');
  const frames = determinism.frames?.join(', ');
  if (determinism.verdict === 'PASS') return pass('MO-C-09', `rgbaSha256 match Y (frames re-rendered: ${frames})`);
  if (String(determinism.verdict).startsWith('WARN')) return warn('MO-C-09', `rgbaSha256 match N on hardware, SwiftShader pair matched (${determinism.verdict}); frames ${frames}`);
  return fail('MO-C-09', `rgbaSha256 match N (frames re-rendered: ${frames}; first mismatch ${JSON.stringify(determinism.mismatched?.[0] ?? determinism.swiftshader)})`);
}

export function checkArtifacts(exports) {
  const missing = ['mp4', 'preview', 'poster', 'still', 'manifest'].filter((key) => !exports[key]?.present);
  return missing.length ? fail('MO-A-37-41', `missing: ${missing.join(', ')}`) : pass('MO-A-37-41', 'MP4, preview, poster, reduced-motion still and manifest present');
}

export function checkTimelineSchema(manifest) {
  const fields = ['id', 'sceneId', 'shotIndex', 'start', 'end', 'holdSec', 'kind', 'text', 'script', 'beatSec'];
  const bad = (manifest.timeline ?? []).find((entry) => fields.some((f) => !(f in entry)));
  return !manifest.timeline?.length || bad ? fail('MO-A-41a', 'timeline missing or missing canonical fields') : pass('MO-A-41a', `${manifest.timeline.length} timeline entries`);
}

// ---- pre-flight and the full evaluation --------------------------------------------------------

export function evaluatePreflight(plan, glyphGaps) {
  const manifest = { fps: plan.fps, bpm: plan.bpm, beatGrid: plan.beatGrid, timeline: plan.timeline };
  const results = [checkReadingFloors(manifest), ...checkBeatSnap(manifest), checkEojeol(manifest)];
  results.push(glyphGaps.length ? fail('MO-D-04', glyphGaps.slice(0, 4).map((g) => `${g.font} lacks ${g.codepoint ?? g.char} "${g.char}" (${g.shot})`).join('; ')) : pass('MO-D-04', 'every codepoint resolves in its font'));
  return { results, failed: results.filter((r) => r.status === 'FAIL').map((r) => r.id) };
}

export function evaluate(data) {
  const { manifest, frames, passLines, previewRecords, checks = {}, exports = {}, contrastSamples = [] } = data;
  const results = [];
  results.push(...checkPassCoverage(manifest, passLines, frames.length));
  results.push(...checkRenderer(manifest));
  const flash = checkFlash(manifest, frames, previewRecords);
  results.push(flash.result);
  results.push(...checkSafeAreas(frames));
  results.push(checkContrast(contrastSamples));
  results.push(checkReadingFloors(manifest));
  results.push(checkDeterminism(checks.determinism));
  results.push(...checkEncode(manifest, checks.probe, exports));
  results.push(checkSizes(manifest, exports, checks.preview));
  results.push(checkStill(manifest, frames, exports.still));
  const [tracking, hangul, hangulFont] = checkTracking(frames);
  results.push(tracking, ...checkBlocks(frames), checkColour(manifest, frames), checkPerf(manifest, checks.perf), checkDarkRuns(manifest, frames));
  results.push(checks.preflight?.results?.find((r) => r.id === 'MO-D-04') ?? fail('MO-D-04', 'pre-flight glyph check not recorded'));
  results.push(...checkBeatSnap(manifest), checkEojeol(manifest), checkArtifacts(exports), checkTimelineSchema(manifest), checkInvert(manifest, frames), hangulFont);
  results.push(checkSeeds(manifest), checkEventCeiling(manifest, frames), checkFullFrameStep(frames), ...checkPassCaps(manifest, passLines), hangul);
  results.push(manifest.round >= 1 && manifest.round <= 3 ? pass('MO-C-15/16', `round ${manifest.round} of 3`) : fail('MO-C-15/16', `round ${manifest.round} outside 1..3`));
  if (checks.sound) results.push(...checks.sound.results);
  const failed = results.filter((r) => r.status === 'FAIL');
  return { status: failed.length ? 'FAIL' : 'PASS', results, flash };
}

// ---- loading a render's facts ------------------------------------------------------------------

function exportInfo(path) {
  return existsSync(path) ? { present: true, bytes: statSync(path).size, path, name: path.split('/').pop() } : { present: false };
}

function probe(path, env = process.env) {
  const dirs = String(env.PATH ?? '').split(':').filter(Boolean);
  const tool = dirs.map((d) => join(d, 'ffprobe')).find((p) => existsSync(p));
  if (!tool) return { error: 'ffprobe not found on PATH' };
  const result = spawnSync(tool, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt,color_space,color_range,color_transfer,color_primaries,r_frame_rate:format=duration', '-of', 'json', path], { encoding: 'utf8' });
  if (result.status !== 0) return { error: result.stderr.trim() };
  const data = JSON.parse(result.stdout);
  const s = data.streams?.[0] ?? {};
  const [num, den] = String(s.r_frame_rate ?? '0/1').split('/').map(Number);
  return { width: s.width, height: s.height, pixFmt: s.pix_fmt, colorSpace: s.color_space, colorRange: s.color_range, colorTransfer: s.color_transfer, colorPrimaries: s.color_primaries, fps: den ? num / den : 0, durationSec: Number(data.format?.duration) };
}

export function loadFacts(out, { staged = false, withheld = false } = {}) {
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  const lines = readFileSync(join(out, 'render.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const frames = lines.filter((line) => line.pass === null && !line.preview).sort((a, b) => a.frame - b.frame);
  const passLines = lines.filter((line) => typeof line.pass === 'string');
  const previewRecords = lines.filter((line) => line.preview);
  const checks = existsSync(join(out, '.run', 'checks.json')) ? JSON.parse(readFileSync(join(out, '.run', 'checks.json'), 'utf8')) : {};
  const dir = staged ? join(out, '.run') : withheld ? join(out, 'withheld') : out;
  const previewName = existsSync(join(dir, 'preview.webp')) ? 'preview.webp' : 'preview.gif';
  const mp4 = exportInfo(join(dir, 'film.mp4'));
  const still = exportInfo(join(dir, 'reduced-motion.png'));
  const exports = {
    mp4, preview: exportInfo(join(dir, previewName)), poster: exportInfo(join(dir, 'poster.png')),
    still: { ...still, ink: checks.reducedMotion?.ink }, manifest: { present: true },
  };
  if (mp4.present) checks.probe = probe(mp4.path);
  const contrastSamples = [];
  for (const frame of checks.contrastFrames ?? []) {
    const name = `f${String(frame).padStart(5, '0')}.png`;
    const rgbPath = join(out, '.run', 'contrast', name), maskPath = join(out, '.run', 'masks', name);
    if (!existsSync(rgbPath) || !existsSync(maskPath)) continue;
    const rgb = decodePng(readFileSync(rgbPath)), mask = decodePng(readFileSync(maskPath));
    contrastSamples.push({ frame, rgb: rgb.pixels, mask: mask.pixels, width: rgb.width, height: rgb.height, boxes: frames.find((f) => f.frame === frame)?.textBoxes ?? [] });
  }
  if (checks.perf) checks.perf.totalFrames = frames.length;
  return { manifest, frames, passLines, previewRecords, checks, exports, contrastSamples };
}

export function runGate(out, options = {}) {
  const autoWithheld = options.staged === undefined && options.withheld === undefined && !existsSync(join(out, 'film.mp4')) && existsSync(join(out, 'withheld', 'film.mp4'));
  return evaluate(loadFacts(out, autoWithheld ? { withheld: true } : options));
}

