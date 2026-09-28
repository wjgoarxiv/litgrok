// Stage path render (brief section 6): pre-flight scan of the authored page -> fonts -> sound ->
// master capture on the virtual clock -> stills set -> [--stills-only stops here] -> encode with the
// track -> preview, poster, reduced-motion still -> determinism replay in a fresh Chrome and the text
// QA replay -> gate -> promote or withhold.
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { BlockedError, DIRECTOR, EXIT, STAGE } from './constants.mjs';
import { resolveChrome, stageArgs } from './chrome.mjs';
import { fontPath, fontState, PINS, resolveFontKey } from './fonts.mjs';
import { FlashDetector } from './flash.mjs';
import { FramePool, measureFrame } from './frame-pool.mjs';
import { encodePng } from './png.mjs';
import { CONTENT_TYPES, openStage } from './stage-session.mjs';
import { stillsPlan, writeStills } from './stills.mjs';
import { startEncode } from './encode.mjs';
import { encodePreview, findTool, previewRung, promoteOrWithhold, clearDeliverables } from './render.mjs';
import { fnv1a32 } from './seed.mjs';
import { evaluateStage, stageReportText } from './stage-gate.mjs';
import { prepareSound, muxGate } from './soundtrack.mjs';
import { runStageQa } from './stage-qa.mjs';
import { PREWARM_COMMAND } from './cache.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json']);
const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const NAMESPACE_URIS = ['http://www.w3.org/2000/svg', 'http://www.w3.org/1999/xlink', 'http://www.w3.org/1999/xhtml', 'http://www.w3.org/XML/1998/namespace', 'http://www.w3.org/2000/xmlns/', 'http://www.w3.org/1998/Math/MathML'];

// ---- pre-flight scan -------------------------------------------------------------------------

function walk(dir, root = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, root, out);
    else if (entry.isFile()) out.push({ path, rel: relative(root, path).split('\\').join('/') });
    else if (lstatSync(path).isSymbolicLink()) out.push({ path, rel: relative(root, path).split('\\').join('/'), symlink: true });
  }
  return out;
}

export function rasterInfo(bytes, ext) {
  const b = bytes;
  if (ext === '.png') {
    return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), animated: b.includes(Buffer.from('acTL')) && b.indexOf(Buffer.from('acTL')) < b.indexOf(Buffer.from('IDAT')) };
  }
  if (ext === '.gif') {
    let frames = 0;
    for (let i = b.indexOf(0x21); i >= 0 && i < b.length - 1; i = b.indexOf(0x21, i + 1)) if (b[i + 1] === 0xf9) frames += 1;
    return { width: b.readUInt16LE(6), height: b.readUInt16LE(8), animated: frames > 1 || b.includes(Buffer.from('NETSCAPE2.0')) };
  }
  if (ext === '.webp') {
    const chunk = b.toString('latin1', 12, 16);
    const animated = b.includes(Buffer.from('ANIM')) || (chunk === 'VP8X' && (b[20] & 0x02) !== 0);
    if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3), animated };
    if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), animated }; }
    return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff, animated };
  }
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5), animated: false };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { width: 0, height: 0, animated: false };
}

// Static scan before any launch: forbidden elements (17), absolute or protocol-relative URLs and
// preconnect/prefetch links (19), raster limits, flipbooks and animated rasters (17).
export function scanStage(stageDir) {
  const contract = [];
  const network = [];
  const warnings = [];
  if (!existsSync(join(stageDir, 'index.html'))) return { contract: ['stage/index.html is missing'], network, warnings, files: [], rasters: [] };
  const files = walk(stageDir);
  const rasters = [];
  for (const file of files) {
    if (file.symlink) continue;
    const ext = extname(file.path).toLowerCase();
    if (!CONTENT_TYPES[ext]) { warnings.push(`stage/${file.rel} is not a served file type`); continue; }
    if (TEXT_EXT.has(ext)) {
      const text = readFileSync(file.path, 'utf8');
      const tag = text.match(/<\s*(video|audio|iframe|object|embed|frame|frameset)\b/i) ?? text.match(/createElement(?:NS)?\(\s*(?:[^,)]*,\s*)?["'`](video|audio|iframe|object|embed|frame)["'`]/i);
      if (tag) contract.push(`stage/${file.rel} uses <${tag[1].toLowerCase()}>`);
      for (const match of text.matchAll(/(?:https?:)?\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'`<>)]*|https?:\/\/[^\s"'`<>)]+/g)) {
        const url = match[0];
        const before = text.slice(Math.max(0, match.index - 1), match.index);
        if (url.startsWith('//') && !/["'(=\s]/.test(before)) continue;
        if (NAMESPACE_URIS.some((ns) => url.startsWith(ns))) continue;
        if (url.startsWith(STAGE.origin) || url.startsWith(`//${STAGE.host}`)) continue;
        network.push(`stage/${file.rel}: ${url}`);
      }
      const hint = text.match(/<link[^>]+rel\s*=\s*["']?(preconnect|prefetch|dns-prefetch|prerender)\b/i);
      if (hint) network.push(`stage/${file.rel}: <link rel=${hint[1]}>`);
    }
    if (RASTER_EXT.has(ext)) {
      const bytes = readFileSync(file.path);
      let info;
      try { info = rasterInfo(bytes, ext === '.jpeg' ? '.jpg' : ext); } catch { info = { width: 0, height: 0, animated: false }; }
      rasters.push({ rel: file.rel, bytes: bytes.length, ...info });
      if (info.animated) contract.push(`stage/${file.rel} is an animated raster; animate in the page instead`);
    }
  }
  if (rasters.length > STAGE.maxRasters) contract.push(`${rasters.length} raster images (at most ${STAGE.maxRasters})`);
  const total = rasters.reduce((sum, r) => sum + r.bytes, 0);
  if (total > STAGE.maxRasterBytes) contract.push(`${(total / 1e6).toFixed(1)} MB of rasters (at most ${STAGE.maxRasterBytes / 1e6} MB)`);
  const bySize = new Map();
  for (const r of rasters) { const key = `${r.width}x${r.height}`; bySize.set(key, (bySize.get(key) ?? 0) + 1); }
  for (const [size, count] of bySize) if (count >= STAGE.flipbookCount) contract.push(`${count} rasters of one size (${size}) form a flipbook; rasters are textures and stills, never a frame sequence`);
  return { contract, network, warnings, files: files.map((f) => f.rel), rasters };
}

// ---- fonts -----------------------------------------------------------------------------------

export const FACE_KEYS = Object.freeze({
  Archivo: ['archivo-75-400', 'archivo-75-700', 'archivo-75-900', 'archivo-100-400', 'archivo-100-700', 'archivo-100-900', 'archivo-125-400', 'archivo-125-700', 'archivo-125-900'],
  Pretendard: ['hangul-400', 'hangul-700'],
  VT323: ['vt323'],
  Silkscreen: ['silkscreen-400', 'silkscreen-700'],
  Galmuri9: ['galmuri9'],
  Meslo: ['meslo'],
});

// /lit/fonts.css: every verified face that is ready. A face the treatment lists that is not warm
// exits 14; a hash or licence mismatch exits 15 (never repaired in session).
export function stageFonts(faces, env = process.env) {
  const routes = new Map();
  const rules = [];
  const seen = new Set();
  for (const [family, keys] of Object.entries(FACE_KEYS)) {
    for (const key of keys) {
      const state = fontState(key, env);
      if (state.state !== 'ready') {
        if (faces.includes(family)) {
          const code = state.state === 'missing' ? EXIT.DEPS_NOT_PREWARMED : EXIT.FONT_FETCH;
          throw new BlockedError(code, `${code === EXIT.DEPS_NOT_PREWARMED ? 'BLOCKED_DEPS_NOT_PREWARMED' : 'BLOCKED_FONT_FETCH'}: face ${family} (${PINS.fonts[state.resolved]?.family ?? key}) is ${state.state}; run ${PREWARM_COMMAND} outside the session`);
        }
        continue;
      }
      const pin = PINS.fonts[state.resolved];
      const ext = extname(pin.file).toLowerCase();
      const stretch = key.match(/^archivo-(\d+)-/)?.[1];
      const weight = key === 'hangul-700' && state.resolved !== key ? 400 : pin.weight;
      const id = `${family}|${weight}|${stretch ?? 100}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const route = `/lit/fonts/${state.resolved}${ext}`;
      routes.set(route, { path: fontPath(resolveFontKey(key, env), env), type: CONTENT_TYPES[ext] });
      rules.push(`@font-face { font-family: '${family}'; src: url('${route}') format('${ext === '.otf' ? 'opentype' : 'truetype'}'); font-weight: ${weight}; font-stretch: ${stretch ?? 100}%; font-style: normal; font-display: block; }`);
    }
  }
  return { css: `${rules.join('\n')}\n`, routes, families: [...new Set(rules.map((r) => r.match(/font-family: '([^']+)'/)[1]))] };
}

// ---- helpers ---------------------------------------------------------------------------------

export function determinismSamples(beats, fps, totalFrames) {
  const last = totalFrames - 1;
  const clamp = (f) => Math.max(0, Math.min(last, f));
  const firsts = [...beats].sort((a, b) => a.t0 - b.t0).map((beat) => clamp(Math.round(beat.t0 * fps)));
  let frames = [...new Set([0, last, ...firsts])].sort((a, b) => a - b);
  if (frames.length > STAGE.determinismMax) {
    const inner = frames.slice(1, -1);
    const keep = STAGE.determinismMax - 2;
    frames = [0, ...Array.from({ length: keep }, (_, i) => inner[Math.floor((i * inner.length) / keep)]), last];
  }
  const mids = beats.map((beat) => clamp(Math.round(((beat.t0 + beat.t1) / 2) * fps)));
  for (const mid of mids) { if (frames.length >= STAGE.determinismMin) break; if (!frames.includes(mid)) frames.push(mid); }
  for (let i = 1; frames.length < Math.min(STAGE.determinismMin, totalFrames); i += 1) {
    const f = clamp(Math.floor((i * totalFrames) / (STAGE.determinismMin + 1)));
    if (!frames.includes(f)) frames.push(f);
    if (i > totalFrames) break;
  }
  return [...new Set(frames)].sort((a, b) => a - b);
}

export function firstDifference(a, b, width, height) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, count = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) {
      const p = i / 4, x = p % width, y = Math.floor(p / width);
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
      count += 1;
    }
  }
  return count ? { x0, y0, x1, y1, pixels: count, width, height } : null;
}

function contractCheck(contract, treatment, width, height) {
  if (!contract) return 'the page never called LitStage.define({ width, height, fps, duration, render }) or set window.litStage';
  if (contract.width !== width || contract.height !== height) return `the page declares ${contract.width}x${contract.height}; the treatment's ${treatment.format} needs ${width}x${height}`;
  const fps = contract.fps ?? 60;
  const allowed = treatment.fps === 30 ? [30, 60] : [60];
  if (!allowed.includes(fps)) return `fps ${fps} is not allowed (60, or 30 when the treatment sets fps: 30)`;
  if (!(Number(contract.duration) > 0) || contract.duration > DIRECTOR.durationRange[1] * 1.5) return `duration ${contract.duration} is not a positive number of seconds`;
  return null;
}

function progress(runDir, fields) {
  writeFileSync(join(runDir, 'progress.json'), JSON.stringify({ ...fields, at: new Date().toISOString() }));
}

const pct = (values, p) => { if (!values.length) return 0; const s = [...values].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; };

async function stepOrThrow(session, f, fps, settle = true) {
  const info = await session.step(f, fps, settle);
  if (session.network.length) throw new BlockedError(EXIT.STAGE_NETWORK, `STAGE_NETWORK_REQUEST: the page requested ${session.network[0]} (blocked); only files under stage/ and the /lit/ routes are served`);
  if (session.refused.length) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${session.refused[0]}`);
  if (info.violations) {
    const { violations } = await session.report();
    const network = violations.filter((v) => v.kind === 'network');
    if (network.length) throw new BlockedError(EXIT.STAGE_NETWORK, `STAGE_NETWORK_REQUEST: the page opened ${network.map((v) => v.name).join(', ')}; the stage has no network`);
    throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: forbidden ${violations.map((v) => `${v.kind === 'element' ? `<${v.name}>` : v.name}`).join(', ')}`);
  }
  if (info.renderError) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: render(t) threw at frame ${f}: ${info.renderError.split('\n')[0]}`);
  if (info.webgl?.failed) throw new BlockedError(EXIT.NO_WEBGL2, `BLOCKED_NO_WEBGL2: the page asked for a ${info.webgl.failed} context and Chrome refused it`);
  return info;
}

export async function captureChecked(session, width, height) {
  const png = await session.capture();
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  if (w !== width || h !== height) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: a capture decoded to ${w}x${h}, not ${width}x${height}`);
  return png;
}

// ---- the render ------------------------------------------------------------------------------

export async function renderStage({ out, treatment, round = 1, stillsOnly = false, env = process.env, log = (line) => process.stderr.write(`${line}\n`) }) {
  const started = Date.now();
  const runDir = join(out, '.run');
  mkdirSync(runDir, { recursive: true });
  const stageDir = join(out, 'stage');
  const [width, height] = STAGE.formats[treatment.format];
  const treatmentSha256 = sha(readFileSync(join(out, 'treatment.json')));
  const record = (fields) => writeFileSync(join(runDir, 'run.json'), JSON.stringify({ path: 'stage', round, stillsOnly, treatmentSha256, ...fields, finishedAt: new Date().toISOString() }, null, 2));
  writeFileSync(join(runDir, 'run.json'), JSON.stringify({ path: 'stage', round, stillsOnly, treatmentSha256, state: 'started', startedAt: new Date().toISOString() }, null, 2));
  const fail = (error) => { record({ exitCode: error.code ?? 1, state: 'blocked', reason: error.message }); throw error; };

  const scan = scanStage(stageDir);
  if (scan.network.length) fail(new BlockedError(EXIT.STAGE_NETWORK, `STAGE_NETWORK_REQUEST: ${scan.network[0]}; the stage may load only its own files and the /lit/ routes`));
  if (scan.contract.length) fail(new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${scan.contract[0]}`));
  let fonts;
  try { fonts = stageFonts(treatment.typePlan.faces, env); } catch (error) { fail(error); }
  const executable = resolveChrome(env);
  if (!executable) fail(new BlockedError(EXIT.NO_CHROME, 'BLOCKED_NO_CHROME: Chrome/Chromium not found; set CHROME_PATH to a Chrome executable'));
  const ffmpeg = findTool('ffmpeg', env);
  const seed = Number.isInteger(treatment.seed) ? treatment.seed : fnv1a32(treatment.idea);
  const warnings = [...scan.warnings];

  const pool = new FramePool();
  let master = null;
  let encoder = null;
  let abortReplays = () => {};
  try {
    master = await openStage({ executable, outDir: out, stageDir, width, height, fps: 60, seed, fonts, label: 'm', log });
    const prepared = await master.load();
    const contractError = contractCheck(prepared.contract, treatment, width, height);
    if (contractError) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${contractError}`);
    const fps = prepared.contract.fps ?? 60;
    const duration = Number(prepared.contract.duration);
    const totalFrames = Math.round(duration * fps);
    const plan = stillsPlan({ beats: treatment.beats, fps, totalFrames });
    const finalBeat = [...treatment.beats].sort((a, b) => a.t0 - b.t0).at(-1);
    const middleBeat = [...treatment.beats].sort((a, b) => a.t0 - b.t0)[Math.floor(treatment.beats.length / 2)];
    const stillFrame = Math.min(totalFrames - 1, Math.round(((finalBeat.t0 + finalBeat.t1) / 2) * fps));
    const posterFrame = Math.min(totalFrames - 1, Math.round(((middleBeat.t0 + middleBeat.t1) / 2) * fps));
    const samples = determinismSamples(treatment.beats, fps, totalFrames);
    const keep = new Set([...plan.frames, stillFrame, posterFrame, ...samples]);
    const kept = new Map();
    const lastNeeded = stillsOnly ? Math.max(...plan.frames) : totalFrames - 1;

    let track = null;
    if (!stillsOnly && ffmpeg) {
      try { track = prepareSound({ out, treatment, fps, frameCount: totalFrames, cutTimes: plan.strips.map((s) => s.frame / fps), ffmpeg, log }); } catch (error) { throw error instanceof BlockedError ? error : new BlockedError(EXIT.SOUND_INVALID, error.message.startsWith('SOUND_INVALID') ? error.message : `SOUND_INVALID: ${error.message}`); }
      encoder = startEncode(ffmpeg, { path: join(runDir, 'film.mp4'), width, height, fps, audioFile: track?.path ?? null });
    }

    // The determinism replay and the text QA replay each run in their own fresh Chrome after the
    // master (sharing the CPU with the master slows it more than it saves), next to the preview
    // encode; both replay the clock sequentially from frame 0. The determinism replay settles two
    // native frames on every frame exactly as the master does: Chrome's layer and raster decisions
    // follow the paint history, so a replay that skips frames can raster moving text differently.
    // The QA replay only reads layout between samples and settles before its own captures.
    const stop = { aborted: false };
    const replay = async () => {
      const session = await openStage({ executable, outDir: out, stageDir, width, height, fps, seed, fonts, label: 'd', log });
      try {
        await session.load();
        const hashes = {};
        const last = Math.max(...samples);
        for (let f = 0; f <= last; f += 1) {
          if (stop.aborted) throw new Error('replay stopped: the master render failed');
          await stepOrThrow(session, f, fps);
          if (samples.includes(f)) hashes[f] = measureFrame(await captureChecked(session, width, height), { flash: false });
        }
        return hashes;
      } finally { await session.close().catch(() => {}); }
    };
    abortReplays = () => { stop.aborted = true; };
    const detector = new FlashDetector();
    const frames = [];
    const times = [];
    const queue = [];
    const drain = async () => {
      const { f, job } = queue.shift();
      const result = await job;
      if (!stillsOnly) {
        const flash = detector.push(result.grid);
        frames.push({ frame: f, ink: 0, lumP995: Math.round(result.lumP995 * 10000) / 10000, flash: { general: flash.general, red: flash.red, ...(flash.general2 ? { general2: flash.general2 } : {}), ...(flash.red2 ? { red2: flash.red2 } : {}), stepArea: flash.stepArea }, rgbaSha256: result.sha256 });
        await encoder?.write(result.rgba);
      }
      if (keep.has(f)) kept.get(f).rgba = result.rgba;
    };
    for (let f = 0; f <= lastNeeded; f += 1) {
      const t0 = performance.now();
      const capture = !stillsOnly || keep.has(f);
      await stepOrThrow(master, f, fps, capture);
      if (capture) {
        const png = await captureChecked(master, width, height);
        if (keep.has(f)) kept.set(f, { png });
        queue.push({ f, job: pool.measure(png, { flash: !stillsOnly }) });
        if (queue.length >= pool.workers.length * 2) await drain();
      }
      times.push(performance.now() - t0);
      if (f % 60 === 59) { progress(runDir, { phase: stillsOnly ? 'stills' : 'master', frame: f + 1, total: lastNeeded + 1, elapsedSec: (Date.now() - started) / 1000 }); log(`frame ${f + 1}/${lastNeeded + 1} (${((Date.now() - started) / 1000).toFixed(1)} s)`); }
    }
    while (queue.length) await drain();
    const masterDone = Date.now();
    const pageReport = await master.report();
    await master.close();
    master = null;
    if (pageReport.errors.length) warnings.push(`the page logged ${pageReport.errors.length} error(s); first: ${pageReport.errors[0]}`);

    if (stillsOnly || !ffmpeg) {
      const stills = writeStills(out, { plan, frames: kept, width, height, path: 'stage', round, mode: 'stills-only', treatmentSha256 });
      if (!ffmpeg && !stillsOnly) {
        record({ exitCode: EXIT.NO_FFMPEG_FOR_VIDEO, state: 'blocked', reason: 'no ffmpeg', stillsIndexSha256: stills.sha256 });
        throw new BlockedError(EXIT.NO_FFMPEG_FOR_VIDEO, 'BLOCKED_NO_FFMPEG_FOR_VIDEO: ffmpeg not found on PATH; the stills and the contact sheet were written, install ffmpeg for the film');
      }
      record({ exitCode: EXIT.OK, state: 'stills-only', stillsIndexSha256: stills.sha256, frames: lastNeeded + 1, perf: { p50Ms: pct(times, 0.5), p95Ms: pct(times, 0.95), totalSec: (Date.now() - started) / 1000 } });
      log(`stills-only: ${stills.index.stills.length} files listed in ${join(out, 'stills', 'index.json')}; open every one, then record the look`);
      return { exitCode: EXIT.OK, stillsOnly: true, stills };
    }

    const timings = { masterSec: (masterDone - started) / 1000 };
    await encoder.end();
    encoder = null;
    timings.encodeTailSec = (Date.now() - masterDone) / 1000;
    const posterBytes = encodePng(kept.get(posterFrame).rgba, width, height, { channels: 4, outChannels: 3, level: 9 });
    writeFileSync(join(runDir, 'poster.png'), posterBytes);
    writeFileSync(join(runDir, 'reduced-motion.png'), encodePng(kept.get(stillFrame).rgba, width, height, { channels: 4, outChannels: 3, level: 9 }));

    const replayStart = Date.now();
    const previewJob = encodePreview({ runDir, master: join(runDir, 'film.mp4'), encoder: previewRung(env), minFontPx: 32, env, log, frame: { width, height } }).then((result) => { timings.previewSec = (Date.now() - replayStart) / 1000; return result; });
    previewJob.catch(() => {});
    const [rerun, qa] = await Promise.all([
      replay(),
      runStageQa({ executable, out, stageDir, width, height, fps, seed, fonts, treatment, totalFrames, log, stepOrThrow, captureChecked, stop }),
    ]);
    timings.replaysSec = (Date.now() - replayStart) / 1000;
    const masterHash = new Map(frames.map((frame) => [frame.frame, frame.rgbaSha256]));
    const mismatched = samples.filter((f) => rerun[f].sha256 !== masterHash.get(f)).map((f) => ({ frame: f, master: masterHash.get(f), replay: rerun[f].sha256, region: kept.get(f)?.rgba ? firstDifference(kept.get(f).rgba, rerun[f].rgba, width, height) : null }));
    const determinism = { frames: samples, verdict: mismatched.length ? 'FAIL' : 'PASS', mismatched, method: 'sequential clock replay in a fresh Chrome; SHA-256 of decoded RGBA' };

    // The preview was encoded with a 32 px glyph assumption; when the QA measured smaller copy the
    // ladder is re-run with the real size so no rung renders type under 10 px.
    let preview = await previewJob;
    if (qa.minCopyFontPx && qa.minCopyFontPx < 32) preview = await encodePreview({ runDir, master: join(runDir, 'film.mp4'), encoder: previewRung(env), minFontPx: qa.minCopyFontPx, env, log, frame: { width, height } });
    const previewRecords = preview.records ? preview.records.map((r) => ({ preview: { frame: r.frame, fps: preview.fps }, flash: { general: r.general, red: r.red, ...(r.general2 ? { general2: r.general2 } : {}), ...(r.red2 ? { red2: r.red2 } : {}) } })) : [];
    const sound = muxGate({ mp4: join(runDir, 'film.mp4'), durationSec: totalFrames / fps, treatment, env, track });

    const manifest = {
      schemaVersion: 1, path: 'stage', format: treatment.format, resolution: [width, height], fps, durationSec: totalFrames / fps, targetDurationSec: treatment.durationSec,
      frames: totalFrames, seed, renderer: 'SwiftShader software rung (stage path)', softwareRenderer: true, chromeFlags: stageFlagsUsed(), previewEncoder: preview.encoder,
      sound: sound.summary, round, warnings,
    };
    const stills = writeStills(out, { plan, frames: kept, width, height, path: 'stage', round, mode: 'full', poster: { bytes: posterBytes, frame: posterFrame }, treatmentSha256 });
    manifest.stillsIndexSha256 = stills.sha256;
    clearDeliverables(out);
    writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    const perf = { frames: lastNeeded + 1, p50Ms: Math.round(pct(times, 0.5) * 10) / 10, p95Ms: Math.round(pct(times, 0.95) * 10) / 10, totalSec: Math.round((Date.now() - started) / 100) / 10, timings };
    const facts = { manifest, frames, previewRecords, determinism, preview, sound, qa, stillFrame, posterFrame, perf, exports: null };
    const staged = [join(runDir, 'film.mp4'), preview.path, join(runDir, 'poster.png'), join(runDir, 'reduced-motion.png')];
    const gate = evaluateStage({ ...facts, exportsDir: runDir });
    const flashFailed = gate.results.some((r) => r.id === 'MO-C-03' && r.status === 'FAIL');
    const target = promoteOrWithhold(out, staged, flashFailed);
    const finalGate = evaluateStage({ ...facts, exportsDir: flashFailed ? join(out, 'withheld') : out });
    writeFileSync(join(runDir, 'stage-facts.json'), JSON.stringify({ manifest, frames, previewRecords, determinism, preview: { encoder: preview.encoder, width: preview.width, fps: preview.fps, bytes: preview.bytes, frames: preview.frames, ladder: preview.ladder }, sound: { results: sound.results, exit20: sound.exit20, summary: sound.summary }, qa, stillFrame, posterFrame, perf, withheld: flashFailed }));
    writeFileSync(join(out, 'stage-report.json'), `${JSON.stringify({ scan: { files: scan.files, rasters: scan.rasters, warnings: scan.warnings }, fonts: fonts.families, page: pageReport, determinism, qa, sound: sound.stats, perf, frames: frames.map(({ frame, lumP995, flash }) => ({ frame, lumP995, flash })) }, null, 2)}\n`);
    writeFileSync(join(out, 'gate-report.txt'), stageReportText({ manifest, gate: finalGate, withheld: flashFailed ? target : null, perf, outDir: out, treatment }));
    const copyMissing = qa.missingCopy?.length ? qa.missingCopy : null;
    const exitCode = determinism.verdict === 'FAIL' ? EXIT.STAGE_NONDETERMINISTIC : copyMissing ? EXIT.STAGE_CONTRACT : sound.exit20 ? EXIT.SOUND_INVALID : finalGate.status === 'PASS' ? EXIT.OK : EXIT.GATE_FAIL_QA;
    if (copyMissing && determinism.verdict !== 'FAIL') log(`STAGE_CONTRACT_ERROR: copy line not on screen: "${copyMissing[0]}"; every copy.lines entry must appear on screen (or be registered with LitStage.text)`);
    record({ exitCode, state: flashFailed ? 'withheld' : finalGate.status === 'PASS' ? 'delivered' : 'delivered-with-fail', gate: finalGate.status, withheld: flashFailed, stillsIndexSha256: stills.sha256, perf });
    if (determinism.verdict === 'FAIL') {
      const m = mismatched[0];
      log(`STAGE_NONDETERMINISTIC: frame ${m.frame} differs on replay${m.region ? ` in x ${m.region.x0}-${m.region.x1}, y ${m.region.y0}-${m.region.y1} (${m.region.pixels} px)` : ''}; seed the randomness and drop wall-clock reads`);
    }
    return { exitCode, gate: finalGate, withheld: flashFailed, stills, determinism, perf };
  } catch (error) {
    abortReplays();
    if (encoder) encoder.abort();
    if (error instanceof BlockedError) {
      const path = join(runDir, 'run.json');
      const current = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
      if (!current.finishedAt) record({ exitCode: error.code, state: 'blocked', reason: error.message });
    }
    throw error;
  } finally {
    try { if (master) await master.close(); } catch { /* the render's own error wins */ }
    await pool.close();
  }
}

export function stageFlagsUsed() {
  return stageArgs({ profileDir: '<profile>', width: 0, height: 0 }).filter((arg) => !arg.startsWith('--user-data-dir') && !arg.startsWith('--window-size') && arg !== 'about:blank');
}

// `gate --out <dir>` on a stage render: re-evaluate the recorded facts against the exports where they
// now sit and rewrite the report. look.json is never touched.
export function regateStage(out, treatment) {
  const facts = JSON.parse(readFileSync(join(out, '.run', 'stage-facts.json'), 'utf8'));
  const withheld = !existsSync(join(out, 'film.mp4')) && existsSync(join(out, 'withheld', 'film.mp4'));
  const gate = evaluateStage({ ...facts, exportsDir: withheld ? join(out, 'withheld') : out });
  writeFileSync(join(out, 'gate-report.txt'), stageReportText({ manifest: facts.manifest, gate, withheld: withheld ? join(out, 'withheld') : null, perf: facts.perf, outDir: out, treatment }));
  return gate;
}
