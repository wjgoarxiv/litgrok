// Cover mode: the seamless README cover loop (references/cover.md). One round: the cover treatment
// -> the static scan of <out>/cover/ -> the asset list (exit 22 for a missing asset, before any
// frame) -> fonts -> a master Chrome seeks t = i / N for every frame at device scale 2 and the pool
// shrinks each capture (Lanczos) to the cover size -> the title-mask pass in the same page -> a
// fresh Chrome repeats every frame (G0) -> another fresh Chrome renders a seeded shuffle of frames,
// which must match the master (a page that keeps state between frames fails here, exit 18) -> the
// flash audit on the frames, looped -> img2webp (frame 0 and the frames before the seam at a
// higher quality; gifski only when libwebp is missing; never an MP4) -> the cover gate on the
// DECODED file, with the title's cap height and frame 0's base art -> stills from the decoded file
// (twelve frames, poster, seam pair) and the contact sheet with its difference plot -> manifest and
// report. A flash FAIL withholds the cover. `--window t0,t1` re-renders and sheets only the frames
// around a logged defect; it never counts as done.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { BlockedError, COVER, EXIT, FLASH } from './constants.mjs';
import { artCheck, checkAssets } from './cover-assets.mjs';
import { capturePass, openCover } from './cover-capture.mjs';
import { coverGate, coverReportText, pngFrames, readPngRgba } from './cover-gate.mjs';
import { lumaGrid } from './cover-image.mjs';
import { CoverPool } from './cover-pool.mjs';
import { renderSheet } from './cover-sheet.mjs';
import { loadCoverTreatment } from './cover-treatment.mjs';
import { findDwebp, findImg2webp } from './cover-webp.mjs';
import { auditLoop, cellGrid, transitionsOf, worstWindowLooping } from './flash.mjs';
import { encodePng } from './png.mjs';
import { findTool } from './render.mjs';
import { rasterInfo, scanStage, stageFonts } from './stage.mjs';

export const COVER_DIR = 'cover';
export const COVER_FILES = Object.freeze(['cover.webp', 'cover.gif', 'poster.png']);

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pad4 = (n) => String(n).padStart(4, '0');
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

// Whole milliseconds per frame, as img2webp stores them (16 fps -> 63 ms, so 8 s is 8.064 s).
export const frameMs = (fps) => Math.round(1000 / fps);
// Frame i of N shows loop time t = i / N; t = 1 is never drawn (it would repeat frame 0).
export const loopTimes = (frames) => Array.from({ length: frames }, (_, i) => [i, i / frames]);

// The decoded frame on screen at `ms`, given per-frame durations.
export function frameAt(durations, ms) {
  let end = 0;
  for (let i = 0; i < durations.length; i += 1) { end += durations[i]; if (ms < end) return i; }
  return durations.length - 1;
}

// img2webp: lossy, loop forever, one method, default keyframes; frame 0 and the last edgeFrames
// frames get edgeQ, because what is left at the seam once every edge is sharp is requantisation.
export function img2webpArgs({ files, fps, encode, out }) {
  const ms = String(frameMs(fps));
  const args = ['-loop', '0', '-lossy', '-q', String(encode.q), '-m', String(encode.method)];
  files.forEach((file, i) => {
    const q = i === 0 || i >= files.length - encode.edgeFrames ? encode.edgeQ : encode.q;
    args.push('-d', ms, '-q', String(q), file);
  });
  args.push('-o', out);
  return args;
}

// Which encoder a cover gets: img2webp with dwebp (the gate decodes with it), else gifski, else none.
export function coverEncoder(env = process.env) {
  if (findImg2webp(env) && findDwebp(env)) return 'img2webp';
  if (findTool('gifski', env)) return 'gifski';
  return null;
}
const NO_ENCODER = 'BLOCKED_NO_COVER_ENCODER: install libwebp (img2webp and dwebp) or gifski; a cover is never an MP4';

export function encodeCover({ files, fps, encode, out, env = process.env }) {
  const encoder = coverEncoder(env);
  if (encoder === 'img2webp') {
    const file = join(out, 'cover.webp');
    const run = spawnSync(findImg2webp(env), img2webpArgs({ files, fps, encode, out: file }), { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (run.status !== 0) throw new Error(`img2webp failed: ${(run.stderr || run.error?.message || '').trim().split(/\r?\n/).at(-1)}`);
    return { file, encoder };
  }
  if (encoder === 'gifski') {
    const file = join(out, 'cover.gif');
    const run = spawnSync(findTool('gifski', env), ['--fps', String(fps), '--quality', '90', '--repeat', '0', '-o', file, ...files], { encoding: 'utf8', maxBuffer: 1 << 26 });
    if (run.status !== 0) throw new Error(`gifski failed: ${(run.stderr || run.error?.message || '').trim().split(/\r?\n/).at(-1)}`);
    return { file, encoder };
  }
  throw new BlockedError(EXIT.NO_COVER_ENCODER, NO_ENCODER);
}

// A seeded shuffle (mulberry32, as the loop kit's rng) of `count` distinct frame indices.
export function seekOrder(frames, seed, count = COVER.seekSamples) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
  const order = Array.from({ length: frames }, (_, i) => i);
  for (let i = frames - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.slice(0, Math.min(count, frames));
}

// The largest per-channel difference between two same-size PNG frames (255 when sizes differ).
export function maxLevelDiff(fileA, fileB) {
  const a = readPngRgba(fileA), b = readPngRgba(fileB);
  if (a.width !== b.width || a.height !== b.height) return 255;
  let max = 0;
  for (let i = 0; i < a.rgba.length; i += 1) { const d = Math.abs(a.rgba[i] - b.rgba[i]); if (d > max) max = d; }
  return max;
}

// WCAG 2.3.1 on the cover frames as a loop (the film audit's own detector and window rule).
function flashAudit(files, fps) {
  const records = auditLoop(files.map((file) => { const image = readPngRgba(file); return cellGrid(image.rgba, image.width, image.height, 4); })).map((r) => ({ frame: r.frame, flash: r }));
  const general = worstWindowLooping(transitionsOf(records, 'general'), records.length, fps);
  const red = worstWindowLooping(transitionsOf(records, 'red'), records.length, fps);
  return { pass: general.flashes <= FLASH.maxGeneral && red.flashes <= FLASH.maxRed, general, red };
}

// A raster's pixels: PNG here, anything else through ffmpeg.
function readRaster(file, env) {
  const ext = extname(file).toLowerCase();
  if (ext === '.png') return readPngRgba(file);
  const ffmpeg = findTool('ffmpeg', env);
  if (!ffmpeg) return null;
  const { width, height } = rasterInfo(readFileSync(file), ext === '.jpeg' ? '.jpg' : ext);
  const raw = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { maxBuffer: 1 << 28 });
  return raw.status === 0 && raw.stdout.length === width * height * 4 ? { width, height, rgba: raw.stdout } : null;
}

// Everything a cover round checks before the first capture: treatment, page, scan, assets, fonts
// and an encoder.
function prepare({ out, env }) {
  const treatment = loadCoverTreatment(out);
  const dir = join(out, COVER_DIR);
  if (!existsSync(join(dir, 'index.html'))) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${join(dir, 'index.html')} is missing; write the cover page first (start from a recipe in recipes/)`);
  const scan = scanStage(dir);
  const rename = (line) => line.replaceAll('stage/', `${COVER_DIR}/`);
  if (scan.network.length) throw new BlockedError(EXIT.STAGE_NETWORK, `STAGE_NETWORK_REQUEST: ${rename(scan.network[0])}; a cover loads only its own files and the /lit/ routes`);
  if (scan.contract.length) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${rename(scan.contract[0])}`);
  const { assets } = checkAssets({ out, treatment, rasters: scan.rasters, coverDir: COVER_DIR });
  const fonts = stageFonts(['JetBrains Mono'], env);
  return { treatment, dir, assets, fonts, warnings: scan.warnings.map(rename) };
}

// The stills a look round reads, all cut from the DECODED cover; the sheet is added after.
function writeCoverStills({ out, round, gate, treatmentSha256 }) {
  const dir = join(out, 'stills');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const { width, height, durations, kept } = gate;
  const total = durations.reduce((a, b) => a + b, 0);
  const entries = [];
  const put = (name, bytes, extra) => { writeFileSync(join(dir, name), bytes); entries.push({ file: `stills/${name}`, sha256: sha(bytes), ...extra }); };
  const png = (rgba, w = width) => encodePng(rgba, w, height, { channels: 4, outChannels: 3, level: 6 });
  const tiles = [];
  for (let k = 0; k < COVER.sheetTiles; k += 1) {
    const t = k / COVER.sheetTiles;
    const index = frameAt(durations, t * total);
    const name = `frame-${String(k).padStart(2, '0')}.png`;
    put(name, png(kept.get(index)), { kind: 'frame', t: Number(t.toFixed(4)), decodedFrame: index });
    tiles.push({ file: join(dir, name), caption: `t=${t.toFixed(3)}  frame ${index}` });
  }
  put('poster.png', png(kept.get(0)), { kind: 'poster', decodedFrame: 0 });
  const last = durations.length - 1;
  const pair = Buffer.alloc(width * 2 * height * 4);
  for (let y = 0; y < height; y += 1) {
    kept.get(last).copy(pair, y * width * 8, y * width * 4, (y + 1) * width * 4);
    kept.get(0).copy(pair, y * width * 8 + width * 4, y * width * 4, (y + 1) * width * 4);
  }
  put('seam.png', png(pair, width * 2), { kind: 'seam', decodedFrames: [last, 0] });
  return {
    dir, tiles,
    finish(sheetFile) {
      const bytes = readFileSync(sheetFile);
      entries.push({ file: 'stills/sheet.png', sha256: sha(bytes), kind: 'sheet' });
      const index = { schema: 1, path: 'cover', round, mode: 'cover', format: `${width}x${height}`, width, height, durationSec: gate.sourceDurationSec, treatmentSha256, gate: { pass: gate.pass, target: gate.target }, stills: entries };
      const text = `${JSON.stringify(index, null, 2)}\n`;
      writeFileSync(join(dir, 'index.json'), text);
      return { index, sha256: sha(Buffer.from(text)) };
    },
  };
}

function runRecord(out, fields) {
  mkdirSync(join(out, '.run'), { recursive: true });
  writeJson(join(out, '.run', 'run.json'), { path: 'cover', ...fields, finishedAt: fields.state === 'started' ? undefined : new Date().toISOString() });
}

// One cover round. Returns { exitCode, gate, message }: 0 only when every gate reached TARGET on
// the decoded file; 13 otherwise (the cover mode goal is TARGET, 2 MiB included).
export async function renderCover({ out, round = 1, env = process.env, log = (line) => process.stderr.write(`${line}\n`) }) {
  const started = Date.now();
  const treatmentSha256 = existsSync(join(out, 'treatment.json')) ? sha(readFileSync(join(out, 'treatment.json'))) : null;
  runRecord(out, { round, state: 'started', treatmentSha256 });
  try {
    const { treatment, dir, assets, fonts, warnings } = prepare({ out, env });
    for (const warning of warnings) log(`warning: ${warning}`);
    if (!coverEncoder(env)) throw new BlockedError(EXIT.NO_COVER_ENCODER, NO_ENCODER);
    const [pageW, pageH] = treatment.page;
    const [w, h] = treatment.out;
    const runDir = join(out, '.run', 'cover');
    rmSync(runDir, { recursive: true, force: true });
    const dirs = { frames: join(runDir, 'frames'), masks: join(runDir, 'masks'), frames2: join(runDir, 'frames2'), seek: join(runDir, 'seek') };
    for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
    const times = loopTimes(treatment.frames);
    const order = seekOrder(times.length, treatment.seed);
    const pool = new CoverPool();
    let master, replay, sought;
    // A 3D hero turns on the GPU rung; when it cannot start there it falls back to software, and
    // the report says so. The replay and the seek share the master's rung.
    const rung = treatment.recipe === 'hero-3d' ? 'gpu' : 'software';
    let rungUsed = rung, rendererUsed = null;
    try {
      const open = (label, useRung) => openCover({ dir, fonts, width: pageW, height: pageH, scale: COVER.captureScale, profileRoot: runDir, env, label, rung: useRung ?? rung, log });
      const a = await open('master');
      try {
        master = await capturePass({ page: a, pool, times, dir: dirs.frames, prefix: 'f', width: w, height: h });
        log(`cover: master ${times.length} frames (${((Date.now() - started) / 1000).toFixed(1)} s)`);
        await capturePass({ page: a, pool, times, dir: dirs.masks, prefix: 'm', mask: true, width: w, height: h });
        rungUsed = a.rung;
        rendererUsed = a.renderer;
        if (a.notice) { warnings.push(a.notice); log(`warning: ${a.notice}`); }
      } finally { await a.close(); }
      const b = await open('replay', rungUsed);
      try { replay = await capturePass({ page: b, pool, times, dir: dirs.frames2, prefix: 'f', width: w, height: h }); } finally { await b.close(); }
      const c = await open('seek', rungUsed);
      try { sought = await capturePass({ page: c, pool, times: order.map((i) => times[i]), dir: dirs.seek, prefix: 's', width: w, height: h }); } finally { await c.close(); }
    } finally { await pool.close(); }
    const captureSec = (Date.now() - started) / 1000;
    const differing = times.filter(([i]) => master.get(i) !== replay.get(i)).map(([i, t]) => `frame ${i} (t = ${t.toFixed(4)})`);
    if (differing.length) throw new BlockedError(EXIT.STAGE_NONDETERMINISTIC, `STAGE_NONDETERMINISTIC: a fresh capture differs at ${differing.slice(0, 4).join(', ')}${differing.length > 4 ? ` (+${differing.length - 4})` : ''}; draw every pixel from t and LitLoop.rng(seed)`);
    const ms = frameMs(treatment.fps);
    // A sought frame within one level per channel of the master is the software rasterizer's own
    // rounding (an element whose opacity and transform change together depends on what was painted
    // before it); state kept between frames differs by far more.
    let oneLevel = 0;
    for (const [offset, i] of order.entries()) {
      if (sought.get(i) === master.get(i)) continue;
      const levels = maxLevelDiff(join(dirs.frames, `f${pad4(i)}.png`), join(dirs.seek, `s${pad4(i)}.png`));
      if (levels <= COVER.seekLevels) { oneLevel += 1; continue; }
      throw new BlockedError(EXIT.STAGE_NONDETERMINISTIC, `STAGE_NONDETERMINISTIC: frame ${i} (t = ${((i * ms) / 1000).toFixed(3)} s) differs by up to ${levels} levels when sought out of order (a fresh page drew it ${offset ? `after frame ${order[offset - 1]}` : 'first'}); the page keeps state between frames: clear every canvas and draw each frame from t alone`);
    }

    const files = pngFrames(dirs.frames, 'f');
    const flash = flashAudit(files, treatment.fps);
    const encoded = encodeCover({ files, fps: treatment.fps, encode: treatment.encode, out, env });
    for (const stale of COVER_FILES) if (join(out, stale) !== encoded.file) rmSync(join(out, stale), { force: true });
    rmSync(join(out, 'withheld'), { recursive: true, force: true });
    const planned = times.length * ms;
    const wanted = Array.from({ length: COVER.sheetTiles }, (_, k) => (k / COVER.sheetTiles) * planned);
    let elapsed = 0;
    const keep = (i, duration) => {
      const start = elapsed;
      elapsed += duration;
      return i === 0 || start + duration >= planned || wanted.some((x) => x >= start && x < start + duration);
    };
    const paintedTitle = treatment.title.kind === 'painted' ? assets.find((a) => a.role === 'base-art' && a.title) : null;
    const glyph = { displayWidth: COVER.displayWidth, exempt: paintedTitle ? `painted into the base art ${paintedTitle.path}` : null };
    const gate = coverGate(encoded.file, { frames: dirs.frames, frames2: dirs.frames2, masks: dirs.masks, title: treatment.title.box, glyph, fps: treatment.fps, keep, env });
    gate.gates.SEEK = { pass: true, sampled: order.length, identical: order.length - oneLevel, oneLevel };
    for (const asset of assets.filter((a) => a.role === 'base-art')) {
      const art = readRaster(join(out, asset.path), env);
      const check = art ? artCheck({ frame0: gate.kept.get(0), width: gate.width, height: gate.height, art, box: asset.box, checkBox: asset.checkBox }) : null;
      gate.gates.ART = check ? { pass: check.pass, ssim: check.ssim, checked: check.checked.join(',') } : { pass: false, reason: `${asset.path} could not be decoded to compare with frame 0` };
    }
    gate.gates.FLASH = { pass: flash.pass, generalFlashes: flash.general.flashes, redFlashes: flash.red.flashes, worstAtSec: Number((flash.general.startFrame / treatment.fps).toFixed(3)) };
    gate.pass = Object.values(gate.gates).every((g) => g.pass !== false);
    gate.target = gate.pass && Object.values(gate.gates).every((g) => g.target !== false);

    const stills = writeCoverStills({ out, round, gate, treatmentSha256 });
    const status = Object.entries(gate.gates).map(([k, g]) => `${k}:${g.pass === false ? 'FAIL' : g.pass === null ? 'info' : g.target === false ? 'floor' : 'ok'}`).join('  ');
    const sheetFile = join(stills.dir, 'sheet.png');
    await renderSheet({
      file: sheetFile, tiles: stills.tiles, diffs: gate.diffs, medianD: gate.medianD, durationSec: gate.durationSec, fonts, env, log, status,
      label: `median d ${gate.medianD.toFixed(5)} | moving ${(100 * gate.movingFrac).toFixed(0)}% | longest still ${gate.longestStillSec.toFixed(2)} s | spike ${gate.spike.toFixed(1)} | seam ${gate.seamLocal.toFixed(2)}x local | ${(gate.bytes / 1048576).toFixed(2)} MiB`,
      workDir: join(runDir, 'sheet'),
    });
    const indexed = stills.finish(sheetFile);
    writeFileSync(join(out, 'poster.png'), readFileSync(join(stills.dir, 'poster.png')));
    const report = coverReportText(gate, { strict: true });
    writeFileSync(join(out, 'gate-report.txt'), report);
    const summary = { pass: gate.pass, target: gate.target, medianD: gate.medianD, movingFrac: gate.movingFrac, longestStillSec: gate.longestStillSec, spike: gate.spike, seamLocal: gate.seamLocal, gates: gate.gates };
    writeJson(join(out, 'manifest.json'), {
      schemaVersion: 1, path: 'cover', mode: 'cover', round, recipe: treatment.recipe, treatmentSha256, stillsIndexSha256: indexed.sha256,
      page: treatment.page, size: treatment.out, scale: COVER.captureScale, fps: treatment.fps, frames: times.length, frameMs: ms, seed: treatment.seed, rung: rungUsed, renderer: rendererUsed ? `${rendererUsed} on the ${rungUsed} rung (cover path)` : null,
      encoder: encoded.encoder, encode: treatment.encode, file: encoded.file.split('/').at(-1), bytes: statSync(encoded.file).size, captureSec, warnings, gate: summary,
    });
    if (!flash.pass) {
      mkdirSync(join(out, 'withheld'), { recursive: true });
      renameSync(encoded.file, join(out, 'withheld', encoded.file.split('/').at(-1)));
      rmSync(join(out, 'poster.png'), { force: true });
    }
    const exitCode = gate.target ? EXIT.OK : EXIT.GATE_FAIL_QA;
    runRecord(out, { round, state: flash.pass ? 'delivered' : 'withheld', exitCode, treatmentSha256, stillsIndexSha256: indexed.sha256, verdict: gate.target ? 'PASS+TARGET' : gate.pass ? 'PASS(floor)' : 'FAIL', captureSec });
    const missed = Object.entries(gate.gates).filter(([, g]) => g.pass === false || g.target === false).map(([k]) => k);
    const message = `${report}cover: ${encoded.file.split('/').at(-1)} ${statSync(flash.pass ? encoded.file : join(out, 'withheld', encoded.file.split('/').at(-1))).size} bytes, ${times.length} frames at ${treatment.fps} fps, ${w}x${h} (captured ${pageW * COVER.captureScale}x${pageH * COVER.captureScale}) in ${captureSec.toFixed(0)} s; open stills/sheet.png, stills/poster.png and stills/seam.png, then record the look`
      + (exitCode ? `\nGATE_FAIL_QA: ${missed.join(', ')} ${gate.pass ? 'miss the cover TARGET' : 'fail'}${flash.pass ? '' : ' (flash audit failed: the cover is withheld)'}; see ${join(out, 'gate-report.txt')}` : '');
    return { exitCode, gate: summary, message, stills: indexed };
  } catch (error) {
    runRecord(out, { round, state: 'blocked', exitCode: error.code ?? 1, reason: error.message, treatmentSha256 });
    throw error;
  }
}

// `cover --window t0,t1` (seconds into the loop): capture only the frames from t0 - 0.5 s to
// t1 + 0.5 s (wrapping at the seam) in a fresh page and sheet them with the span shaded. It reads
// the same treatment, page and asset list as a full render and writes only under
// windows/round-N/; the stills, the cover, the report and the manifest stay as they were, so a
// window render never counts as done.
export async function renderCoverWindow({ out, round = 1, window: [t0, t1], env = process.env, log = (line) => process.stderr.write(`${line}\n`) }) {
  const { treatment, dir: coverDir, fonts } = prepare({ out, env });
  const ms = frameMs(treatment.fps);
  const total = (treatment.frames * ms) / 1000;
  if (!(Number.isFinite(t0) && Number.isFinite(t1) && t0 >= 0 && t1 >= t0 && t1 <= total)) throw new BlockedError(EXIT.USAGE, `--window takes t0,t1 in seconds with 0 <= t0 <= t1 <= ${total.toFixed(3)}`);
  const lo = t0 - COVER.windowPadSec, hi = t1 + COVER.windowPadSec;
  const picks = [];
  for (let i = 0; i < treatment.frames; i += 1) {
    for (const lap of [-1, 0, 1]) {
      const t = (i * ms) / 1000 + lap * total;
      if (t >= lo - 1e-9 && t <= hi + 1e-9) picks.push({ index: i, t: Number(t.toFixed(3)) });
    }
  }
  picks.sort((a, b) => a.t - b.t);
  const dir = join(out, 'windows', `round-${round}`, `${t0.toFixed(3)}-${t1.toFixed(3)}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const [w, h] = treatment.out;
  const profileRoot = join(out, '.run', 'cover-window');
  mkdirSync(profileRoot, { recursive: true });
  const pool = new CoverPool();
  try {
    const page = await openCover({ dir: coverDir, fonts, width: treatment.page[0], height: treatment.page[1], scale: COVER.captureScale, profileRoot, env, label: 'window', rung: treatment.recipe === 'hero-3d' ? 'gpu' : 'software', log });
    try { await capturePass({ page, pool, times: [...new Set(picks.map((p) => p.index))].map((i) => [i, i / treatment.frames]), dir, prefix: 'f', width: w, height: h }); } finally { await page.close(); }
  } finally { await pool.close(); }
  const file = (i) => join(dir, `f${pad4(i)}.png`);
  const lumas = picks.map((p) => { const image = readPngRgba(file(p.index)); return lumaGrid(image.rgba, image.width, image.height).luma; });
  const diffs = lumas.slice(1).map((l, k) => { let sum = 0; for (let i = 0; i < l.length; i += 1) sum += Math.abs(l[i] - lumas[k][i]); return sum / l.length / 255; });
  const sorted = [...diffs].sort((a, b) => a - b);
  const medianD = sorted.length ? sorted[sorted.length >> 1] : 0;
  const count = Math.min(COVER.sheetTiles, picks.length);
  const tiles = Array.from({ length: count }, (_, k) => picks[Math.round((k * (picks.length - 1)) / Math.max(1, count - 1))]).map((p) => ({ file: file(p.index), caption: `t=${p.t.toFixed(3)} s  frame ${p.index}` }));
  await renderSheet({
    file: join(dir, 'sheet.png'), tiles, diffs, medianD, durationSec: hi - lo, marks: [{ t0: t0 - lo, t1: t1 - lo }], fonts, env, log,
    label: `window ${t0.toFixed(3)}-${t1.toFixed(3)} s (shaded), ${COVER.windowPadSec} s each side | ${picks.length} frames before encoding`,
    status: 'a window render never counts as done', workDir: join(profileRoot, 'sheet'),
  });
  rmSync(profileRoot, { recursive: true, force: true });
  writeJson(join(dir, 'window.json'), { schema: 'litgrok.motion-cover-window/v1', round, t0, t1, padSec: COVER.windowPadSec, frames: picks, note: 'frames before encoding; a window render never counts as done' });
  return { exitCode: EXIT.OK, message: `window round ${round}: ${picks.length} frames from ${lo.toFixed(3)} to ${hi.toFixed(3)} s; sheet in ${join(dir, 'sheet.png')}\na window render never counts as done: fix the cause, then render the full cover` };
}
