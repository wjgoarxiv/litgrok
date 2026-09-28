// End-to-end render (one craft round): timeline -> pre-flight gate -> stills -> sheet ->
// [--stills-only stops here] -> master video + preview + poster + reduced-motion still into .run/
// -> determinism re-render and perf -> full gate -> promote or withhold (Build 7, MO-C-15/16).
// Adapted in method from pdoom-video app/scripts/render.ts (MIT, see NOTICE).
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { BlockedError, ENGINE_CREDIT, EXIT, FRAME, OUTPUT, PERF, RENDER } from './constants.mjs';
import { autoPickPreset } from './text.mjs';
import { normalize } from './treatment.mjs';
import { buildTimeline, fontKeysForPlan, normalizeBrief } from './timeline.mjs';
import { PRESETS, planPasses } from './presets.mjs';
import { fontState, missingGlyphs, PINS } from './fonts.mjs';
import { audioPython, audioState, depsState, PREWARM_COMMAND, wordTimingState } from './cache.mjs';
import { openSession } from './session.mjs';
import { cellGrid, FlashDetector, auditLoop } from './flash.mjs';
import { encodePng } from './png.mjs';
import { UNKNOWN_RENDERER } from './chrome.mjs';
import { evaluatePreflight, runGate } from './gate.mjs';
import { writeReport } from './report.mjs';
import { SKILL_ROOT } from './fonts.mjs';
import { startEncode } from './encode.mjs';
import { stillsPlan, writeStills } from './stills.mjs';
import { muxGate, prepareSound, soundFile } from './soundtrack.mjs';

export const DELIVERABLES = Object.freeze(['film.mp4', 'preview.webp', 'preview.gif', 'poster.png', 'reduced-motion.png']);

const LUT = Float64Array.from({ length: 256 }, (_, v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });

export function findTool(name, env = process.env) {
  for (const dir of String(env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function previewRung(env = process.env) {
  const ffmpeg = findTool('ffmpeg', env);
  if (ffmpeg) {
    const encoders = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout ?? '';
    if (/\blibwebp_anim\b/.test(encoders)) return 'libwebp_anim';
  }
  if (findTool('img2webp', env)) return 'img2webp';
  return ffmpeg ? 'gif' : null;
}

function luminanceP995(bytes) {
  const bins = new Uint32Array(1024);
  let total = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const l = 0.2126 * LUT[bytes[i]] + 0.7152 * LUT[bytes[i + 1]] + 0.0722 * LUT[bytes[i + 2]];
    bins[Math.min(1023, Math.floor(l * 1024))] += 1;
    total += 1;
  }
  const target = total * 0.995;
  let acc = 0;
  for (let i = 0; i < 1024; i += 1) { acc += bins[i]; if (acc >= target) return (i + 1) / 1024; }
  return 1;
}

// MO-C-15 step 3: frames around every scene boundary (two before, the cut, one well after).
export function cutFrames(plan) {
  const frames = new Set();
  for (const shot of plan.shots.slice(1)) {
    for (const f of [shot.startFrame - 6, shot.startFrame - 1, shot.startFrame, shot.startFrame + 6]) if (f >= 0 && f < plan.totalFrames) frames.add(f);
  }
  return [...frames].sort((a, b) => a - b);
}

// Settled frame of each text-bearing line: where contrast is sampled and stills are taken.
export function settleFrame(shot, fps) {
  const hold = shot.endFrame - shot.startFrame;
  return Math.max(shot.startFrame, shot.endFrame - 1 - Math.max(12, Math.round(hold * 0.2)));
}

export function referenceFrame(plan) {
  const last = [...plan.shots].reverse().find((shot) => shot.text);
  return last.endFrame - 1;
}

function posterFrame(plan) {
  const first = plan.shots.find((shot) => shot.text) ?? plan.shots[0];
  return Math.floor((first.startFrame + first.endFrame) / 2);
}

function readBrief(briefPath) {
  const text = readFileSync(briefPath, 'utf8');
  if (/\.json$/i.test(briefPath) || text.trim().startsWith('{')) return JSON.parse(text);
  return text;
}

// The treatment decides the sound (brief section 7): a supplied or authored file drives Tier 2
// timing when the pre-warmed venv matches its pins (otherwise Tier 1 with the MO-A-54 warning) and
// is always muxed either way. Tier 3 (--word-timing) never degrades silently: absent models exit 14.
function resolveAudio(brief, treatment, { wordTiming, env, out, runDir, warnings }) {
  if (wordTiming && wordTimingState(env).state !== 'ready') {
    throw new BlockedError(EXIT.DEPS_NOT_PREWARMED, `BLOCKED_DEPS_NOT_PREWARMED: word-timing models are absent; run ${PREWARM_COMMAND} --word-timing outside the session`);
  }
  if (brief.audio && !['supplied', 'authored'].includes(treatment.sound.mode)) warnings.push(`the brief names audio (${brief.audio}) but the treatment's sound is ${treatment.sound.mode}; the treatment decides`);
  if (!['supplied', 'authored'].includes(treatment.sound.mode)) return { beats: null, audioFile: null };
  const audioFile = soundFile(out, treatment);
  if (!existsSync(audioFile)) { warnings.push(`audio file not found (${treatment.sound.file}); Tier 1 reading-time timeline used`); return { beats: null, audioFile: null }; }
  const state = audioState(env);
  if (state.state !== 'ready') {
    warnings.push(`audio analysis not prewarmed: run ${PREWARM_COMMAND} --audio (venv ${state.state}${state.detail ? `: ${state.detail}` : ''}); Tier 1 reading-time timeline used; the track is still muxed`);
    return { beats: null, audioFile };
  }
  const outPath = join(runDir, 'beat-grid.json');
  const result = spawnSync(audioPython(env), [join(SKILL_ROOT, 'scripts', 'beat_grid.py'), audioFile, outPath], { encoding: 'utf8', timeout: 300000 });
  if (result.status !== 0 || !existsSync(outPath)) {
    warnings.push(`audio analysis failed (${(result.stderr || result.error?.message || '').split('\n').filter(Boolean).at(-1) ?? 'no output'}); Tier 1 reading-time timeline used`);
    return { beats: null, audioFile };
  }
  const grid = JSON.parse(readFileSync(outPath, 'utf8'));
  if (!Array.isArray(grid.beats) || grid.beats.length < 4) { warnings.push('audio analysis found too few beats; Tier 1 reading-time timeline used'); return { beats: null, audioFile }; }
  return { beats: grid.beats, audioFile };
}

// The treatment's durationSec is a target: holds scale up to meet it (never below the reading
// floor, which the unscaled plan already honours). The scale landing closest to the target wins;
// when the floors alone run past it, the plan keeps them and records a warning.
export function holdScaleFor(brief, { fps, preset, beats, targetSec }) {
  const base = buildTimeline(brief, { fps, preset, beats }).durationSec;
  if (!targetSec || base >= targetSec) return { scale: 1, baseSec: base };
  let best = { scale: 1, error: targetSec - base };
  for (let step = 1; step <= 480; step += 1) {
    const scale = 1 + step * 0.05;
    const duration = buildTimeline(brief, { fps, preset, beats, holdScale: scale }).durationSec;
    const error = Math.abs(duration - targetSec);
    if (error < best.error - 1e-9) best = { scale, error };
    if (duration > targetSec + 60 / (brief.bpm ?? RENDER.defaultBpm) * 4) break;
  }
  return { scale: best.scale, baseSec: base };
}

export function planRender(briefRaw, { fps = FRAME.fps, beats = null, software = false, style = null, request = null, targetSec = null } = {}) {
  const brief = normalizeBrief(briefRaw);
  const pickText = [request ?? brief.prompt, brief.title, ...brief.lines].join(' ');
  const pick = autoPickPreset(pickText, style ?? brief.style, request);
  const { scale, baseSec } = holdScaleFor(brief, { fps, preset: pick.preset, beats, targetSec });
  const plan = buildTimeline(brief, { fps, preset: pick.preset, beats, holdScale: scale });
  planPasses(plan, pick.preset, { runSeed: brief.seed, software, fps });
  plan.preset = pick;
  plan.brief = brief;
  plan.fontKeys = fontKeysForPlan(plan);
  plan.target = targetSec ? { durationSec: targetSec, holdScale: scale, floorSec: baseSec, floorsForceLonger: baseSec > targetSec * 1.1 } : null;
  return plan;
}

// Type path: the brief may only put the treatment's copy (or the film's own name) on screen, and
// the running index shows only when the treatment asks for it (RC8b).
export function briefForTreatment(briefRaw, treatment) {
  const brief = briefRaw ? { ...briefRaw } : { lines: [...treatment.copy.lines] };
  const allowed = [...treatment.copy.lines, treatment.subject.name].map(normalize).filter(Boolean);
  const onScreen = [['title', brief.title], ['signature', brief.signature], ['end.title', brief.end?.title], ['end.note', brief.end?.note], ['counter.label', brief.counter?.label]];
  for (const [i, line] of (Array.isArray(brief.lines) ? brief.lines : []).entries()) onScreen.push([`lines[${i}]`, line]);
  for (const [i, item] of (Array.isArray(brief.list) ? brief.list : []).entries()) onScreen.push([`list[${i}]`, item]);
  for (const [i, shot] of (Array.isArray(brief.shots) ? brief.shots : []).entries()) {
    onScreen.push([`shots[${i}].text`, shot?.text], [`shots[${i}].label`, shot?.label], [`shots[${i}].note`, shot?.note]);
    for (const [j, item] of (shot?.items ?? []).entries()) onScreen.push([`shots[${i}].items[${j}]`, item]);
  }
  for (const [field, value] of onScreen) {
    const key = normalize(value);
    if (key && !allowed.some((line) => line.includes(key))) throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=brief.${field}: "${value}" is not in the treatment's copy.lines; only copy (or the film's own name) goes on screen`);
  }
  brief.annotations = treatment.typePlan?.index === true;
  brief.prompt = treatment.request;
  return brief;
}

function pageConfig(plan, scale) {
  const preset = PRESETS[plan.preset.preset];
  return {
    scale, fps: plan.fps, bpm: plan.bpm,
    preset: { id: preset.id, palette: preset.palette, post: preset.post },
    shots: plan.shots.map((shot) => ({
      id: shot.id, sceneId: shot.sceneId, shotIndex: shot.shotIndex, index: shot.index, seed: shot.seed, start: shot.start, end: shot.end,
      startFrame: shot.startFrame, endFrame: shot.endFrame, text: shot.text, script: shot.script, voice: shot.voice, fonts: shot.fonts,
      steps: shot.steps, items: shot.items, value: shot.value, label: shot.label, title: shot.title, note: shot.note, revealSec: shot.revealSec,
      annotation: shot.annotation, accent: shot.accent ?? null, preset: shot.preset,
      passes: shot.passes.map((pass) => ({ pass: pass.pass, seed: pass.seed, params: pass.params, schedule: pass.schedule ?? [], origin: pass.origin, stopsLinear: pass.stopsLinear, bootFlicker: pass.bootFlicker, logUniforms: pass.logUniforms })),
    })),
  };
}

export function manifestFor(plan, { renderer, flags, software, samples, shutter, previewEncoder, round, warnings }) {
  const passRanges = [];
  for (const shot of plan.shots) {
    for (const pass of shot.passes) {
      passRanges.push({ pass: pass.pass, frameStart: shot.startFrame, frameEnd: shot.endFrame - 1, sceneId: shot.sceneId, shotIndex: shot.shotIndex, seed: pass.seed, params: pass.params, downgraded: pass.downgraded });
    }
  }
  const manifest = {
    schemaVersion: 1,
    engineCredit: ENGINE_CREDIT,
    presetId: plan.preset.preset,
    seed: plan.brief.seed,
    fps: plan.fps,
    resolution: [FRAME.width, FRAME.height],
    scale: 1,
    samples,
    shutter,
    renderer,
    softwareRenderer: software,
    chromeFlags: flags,
    previewEncoder,
    audioTier: plan.audioTier,
    ...(plan.bpm !== null ? { bpm: plan.bpm } : { beatGrid: plan.beatGrid }),
    durationSec: plan.durationSec,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    passRanges,
    timeline: plan.timeline,
    ...(plan.target ? { target: plan.target } : {}),
    warnings,
    round,
  };
  return manifest;
}

function frameLines(meta, extra) {
  const lines = meta.passes.map((pass) => JSON.stringify({ frame: meta.frame, pass: pass.pass, draws: pass.draws, uniforms: pass.uniforms }));
  lines.push(JSON.stringify({ frame: meta.frame, pass: null, ...extra, textBoxes: meta.textBoxes, ink: meta.ink, graphics: meta.graphics, fills: meta.fills, blocks: meta.blocks, post: meta.post, shotIndex: meta.shotIndex }));
  return `${lines.join('\n')}\n`;
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function writeMask(dir, frame, base64) {
  mkdirSync(dir, { recursive: true });
  const mask = Buffer.from(base64, 'base64');
  writeFileSync(join(dir, `f${String(frame).padStart(5, '0')}.png`), encodePng(mask, FRAME.width, FRAME.height, { channels: 1 }));
}

function writeRgbPng(path, bytes) {
  writeFileSync(path, encodePng(bytes, FRAME.width, FRAME.height, { channels: 4, outChannels: 3 }));
}

// Preview: decode the master at the rung's size/fps, audit those exact frames (looping), hand them to
// the encoder ladder (libwebp_anim -> img2webp -> GIF), then step the size ladder until <= 3 MB.
// Rungs are keyed on the long edge (960, 720, 540), so a 9:16 master previews at 540x960 first.
export async function encodePreview({ runDir, master, encoder, minFontPx, env, log, frame = FRAME }) {
  const ffmpeg = findTool('ffmpeg', env);
  const results = [];
  const longEdge = Math.max(frame.width, frame.height);
  const portrait = frame.height > frame.width;
  for (const [long, fps] of OUTPUT.previewLadder) {
    const short = Math.round((long * Math.min(frame.width, frame.height)) / longEdge / 2) * 2;
    const width = portrait ? short : long;
    const height = portrait ? long : short;
    if (long < OUTPUT.previewMinWidth || minFontPx * (long / longEdge) < OUTPUT.previewMinGlyphPx) {
      results.push({ width, fps, skipped: `smallest type would render at ${(minFontPx * (long / longEdge)).toFixed(1)} px (< ${OUTPUT.previewMinGlyphPx} px)` });
      continue;
    }
    const decode = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-i', master, '-vf', `fps=${fps},scale=${width}:${height}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 2 ** 31 });
    if (decode.status !== 0) throw new Error(`preview decode failed: ${decode.stderr.toString().trim().split('\n').at(-1)}`);
    const frameBytes = width * height * 3;
    const count = Math.floor(decode.stdout.length / frameBytes);
    const frames = Array.from({ length: count }, (_, i) => decode.stdout.subarray(i * frameBytes, (i + 1) * frameBytes));
    const records = auditLoop(frames.map((frame) => cellGrid(frame, width, height, 3)));
    const ext = encoder === 'gif' ? 'gif' : 'webp';
    const out = join(runDir, `preview.${ext}`);
    rmSync(out, { force: true });
    if (encoder === 'img2webp') {
      const dir = join(runDir, 'preview-frames');
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const args = ['-loop', '0', '-lossy', '-q', '55', '-m', '4'];
      let elapsed = 0;
      frames.forEach((frame, i) => {
        const file = join(dir, `${String(i).padStart(5, '0')}.png`);
        writeFileSync(file, encodePng(frame, width, height, { channels: 3, level: 1 }));
        const next = Math.round(((i + 1) * 1000) / fps);
        args.push('-d', String(next - elapsed), file);
        elapsed = next;
      });
      args.push('-o', out);
      const result = spawnSync(findTool('img2webp', env), args, { encoding: 'utf8', maxBuffer: 1 << 26 });
      rmSync(dir, { recursive: true, force: true });
      if (result.status !== 0) throw new Error(`img2webp failed: ${(result.stderr || '').trim().split('\n').at(-1)}`);
    } else {
      const codec = encoder === 'gif'
        ? ['-filter_complex', 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0']
        : ['-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '55', '-loop', '0'];
      const result = spawnSync(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0', ...codec, out], { input: decode.stdout.subarray(0, count * frameBytes), maxBuffer: 1 << 26 });
      if (result.status !== 0) throw new Error(`${encoder} preview encode failed: ${result.stderr.toString().trim().split('\n').at(-1)}`);
    }
    const bytes = statSync(out).size;
    results.push({ width, fps, bytes, frames: count });
    log(`preview ${width}px ${fps} fps via ${encoder}: ${bytes} bytes`);
    if (bytes <= OUTPUT.previewBytes) return { path: out, width, fps, bytes, encoder, frames: count, records, ladder: results };
  }
  const last = results.filter((r) => r.bytes).at(-1);
  if (!last) throw new Error('no preview rung satisfies the type-size floor');
  const ext = encoder === 'gif' ? 'gif' : 'webp';
  return { path: join(runDir, `preview.${ext}`), ...last, encoder, overCap: true, records: null, ladder: results };
}

export function clearDeliverables(out) {
  for (const name of DELIVERABLES) rmSync(join(out, name), { force: true });
  rmSync(join(out, 'withheld'), { recursive: true, force: true });
  for (const name of ['manifest.json', 'render.jsonl', 'gate-report.txt']) rmSync(join(out, name), { force: true });
}

// MO-C-16: an MO-C-03 FAIL withholds every export (never a deliverable, in any round); any other FAIL
// still delivers the exports next to the report for inspection (MO-A-45).
export function promoteOrWithhold(out, staged, flashFailed) {
  const target = flashFailed ? join(out, 'withheld') : out;
  mkdirSync(target, { recursive: true });
  for (const path of staged) if (existsSync(path)) renameSync(path, join(target, basename(path)));
  return target;
}

export async function render(options) {
  const { mode, briefPath = null, out, round = 1, stillsOnly = false, env = process.env, style = null, wordTiming = false, softwareOnly = false, listenImpl = null, treatment, log = (line) => process.stderr.write(`${line}\n`) } = options;
  const runDir = join(out, '.run');
  mkdirSync(runDir, { recursive: true });
  const warnings = [];
  const briefRaw = briefForTreatment(briefPath ? readBrief(briefPath) : null, treatment);
  const briefDir = briefPath ? resolve(briefPath, '..') : out;
  const planOptions = { style, request: treatment.request, targetSec: treatment.durationSec };
  const normalized = normalizeBrief(briefRaw);
  const audio = resolveAudio(normalized, treatment, { wordTiming, env, out, runDir, warnings });

  // Pre-flight, before any frame: deps (14), fonts (15), glyph coverage and timeline rules (13).
  const deps = depsState(env);
  if (deps.state !== 'ready') throw new BlockedError(EXIT.DEPS_NOT_PREWARMED, `BLOCKED_DEPS_NOT_PREWARMED: engine dependencies ${deps.missing.join(', ')} are ${deps.state} in ${deps.dir}; run ${PREWARM_COMMAND} outside the session`);
  let plan = planRender(briefRaw, { beats: audio.beats, ...planOptions });
  const fontProblems = plan.fontKeys.map((key) => fontState(key, env)).filter((font) => font.state !== 'ready');
  if (fontProblems.length) throw new BlockedError(EXIT.FONT_FETCH, `BLOCKED_FONT_FETCH: ${fontProblems.map((f) => `${PINS.fonts[f.resolved].family} (${f.state})`).join(', ')}; run ${PREWARM_COMMAND} outside the session`);
  const glyphGaps = [];
  for (const shot of plan.shots) {
    const pairs = shot.sceneId === 'number-counter' ? [[String(shot.value), shot.fonts.number], [shot.label, shot.fonts.label]]
      : shot.sceneId === 'end-card' ? [[shot.title, shot.fonts.title], [shot.note, shot.fonts.note]] : [[shot.text, shot.fonts]];
    for (const [text, pair] of pairs) if (text) for (const gap of missingGlyphs(text, pair, env)) glyphGaps.push({ shot: shot.id, ...gap });
  }
  const preflight = evaluatePreflight(plan, glyphGaps);
  for (const warning of warnings) log(`warning: ${warning}`);
  writeFileSync(join(runDir, 'run.json'), JSON.stringify({ path: 'type', briefPath: briefPath ? resolve(briefPath) : null, briefSha256: briefPath ? sha(readFileSync(briefPath)) : null, treatmentSha256: sha(readFileSync(join(out, 'treatment.json'))), round, mode, stillsOnly, audioTier: plan.audioTier, warnings, startedAt: new Date().toISOString(), state: 'started' }, null, 2));
  if (preflight.failed.length) {
    clearDeliverables(out);
    writeFileSync(join(runDir, 'checks.json'), JSON.stringify({ preflight }, null, 2));
    writeReport(out, { plan, preflight, manifest: null, gate: null, round, warnings });
    finishRun(runDir, { exitCode: EXIT.GATE_FAIL_QA, state: 'preflight-fail' });
    return { exitCode: EXIT.GATE_FAIL_QA, preflight };
  }

  const needsVideo = mode === 'video' || (mode === 'make' && !stillsOnly);
  const ffmpeg = findTool('ffmpeg', env);
  if (needsVideo && !ffmpeg) throw new BlockedError(EXIT.NO_FFMPEG_FOR_VIDEO, 'BLOCKED_NO_FFMPEG_FOR_VIDEO: ffmpeg not found on PATH; stills and sheet still work (rerun with --stills-only), install ffmpeg for the full export');
  const encoder = needsVideo ? previewRung(env) : null;

  let session = await openSession({ outDir: out, fontKeys: plan.fontKeys, env, listenImpl, log, softwareOnly });
  const software = session.software;
  plan = planRender(briefRaw, { beats: audio.beats, software, ...planOptions });
  if (plan.target?.floorsForceLonger) warnings.push(`the reading floors need ${plan.target.floorSec.toFixed(1)} s, longer than the treatment's ${plan.target.durationSec} s target; the film keeps the floors`);
  const samples = software ? 1 : RENDER.masterSamples;
  const shutter = RENDER.masterShutter;
  const config = pageConfig(plan, 1);
  await session.init(config);
  if (software) warnings.push(`software GL detected (${session.renderer}); renders will be slower, --samples lowered automatically`);
  if (session.renderer === UNKNOWN_RENDERER) warnings.push('renderer type unknown — debug-info extension unavailable');
  const context = { renderer: session.renderer, flags: session.flags, software, egress: session.egress, listenError: session.listenError };
  const checks = { preflight, egress: session.egress, listenError: session.listenError, stills: [], cutFrames: cutFrames(plan) };
  try {
    // Stills: one per shot at its settled frame (MO-C-15 step 1), samples 1 (MO-A-27).
    const stillsDir = join(out, 'stills');
    rmSync(stillsDir, { recursive: true, force: true });
    mkdirSync(stillsDir, { recursive: true });
    const stillLog = [];
    for (const shot of plan.shots) {
      const frame = settleFrame(shot, plan.fps);
      await session.seek();
      const { bytes, meta } = await session.frame(frame, { samples: 1, shutter });
      const file = join(stillsDir, `${String(shot.index + 1).padStart(2, '0')}-${shot.id}.png`);
      writeRgbPng(file, bytes);
      checks.stills.push({ shot: shot.id, frame, file: basename(file), rgbaSha256: sha(bytes) });
      stillLog.push(frameLines(meta, { rgbaSha256: sha(bytes), mode: 'stills' }));
    }
    writeFileSync(join(stillsDir, 'stills.jsonl'), stillLog.join(''));
    // Contact sheet at every cut (MO-C-15 step 3).
    const sheetDir = join(out, 'sheet');
    rmSync(sheetDir, { recursive: true, force: true });
    mkdirSync(sheetDir, { recursive: true });
    const cuts = checks.cutFrames.length ? checks.cutFrames : [0];
    await session.seek();
    writeFileSync(join(sheetDir, 'cuts.png'), await session.sheet(cuts, 4, 1, shutter));
    // The look's stills set (brief section 9): the treatment's beat midpoints, a strip per shot cut
    // and a 12-frame contact sheet, rendered at samples 1 and listed in stills/index.json.
    const lookPlan = stillsPlan({ beats: treatment.beats, fps: plan.fps, totalFrames: plan.totalFrames, cuts: plan.shots.slice(1).map((shot) => shot.startFrame) });
    const lookFrames = new Map();
    for (const f of lookPlan.frames) {
      await session.seek();
      lookFrames.set(f, { rgba: (await session.frame(f, { samples: 1, shutter })).bytes });
    }
    const treatmentSha256 = sha(readFileSync(join(out, 'treatment.json')));
    if (mode === 'stills' || mode === 'sheet' || stillsOnly) {
      writeStills(out, { plan: lookPlan, frames: lookFrames, width: FRAME.width, height: FRAME.height, path: 'type', round, mode: 'stills-only', treatmentSha256, clear: false });
      writeFileSync(join(runDir, 'checks.json'), JSON.stringify(checks, null, 2));
      finishRun(runDir, { exitCode: EXIT.OK, state: 'stills-only' });
      log(`stills: ${stillsDir}\nsheet: ${join(sheetDir, 'cuts.png')}\nstills-only: open the stills and the sheet, then run the full command`);
      return { exitCode: EXIT.OK, stillsOnly: true, plan };
    }

    // Master video, sequential, at master samples. Every frame's bytes are hashed, audited and
    // piped to ffmpeg unchanged.
    clearDeliverables(out);
    const stagedMaster = join(runDir, 'film.mp4');
    let track;
    try {
      track = prepareSound({ out, treatment, fps: plan.fps, frameCount: plan.totalFrames, cutTimes: plan.shots.slice(1).map((shot) => shot.start), ffmpeg, tempo: plan.bpm });
    } catch (error) { throw new BlockedError(EXIT.SOUND_INVALID, error.message.startsWith('SOUND_INVALID') ? error.message : `SOUND_INVALID: ${error.message}`); }
    const encoderProc = startEncode(ffmpeg, { path: stagedMaster, width: FRAME.width, height: FRAME.height, fps: plan.fps, audioFile: track?.path ?? null });
    const detector = new FlashDetector();
    const logPath = join(out, 'render.jsonl');
    writeFileSync(logPath, '');
    const contrastFrames = new Set(plan.shots.filter((shot) => shot.text).map((shot) => settleFrame(shot, plan.fps)));
    const maskFrames = new Set([...contrastFrames, ...checks.cutFrames]);
    const sampleFrames = [];
    await session.seek();
    let minFontPx = Infinity;
    const started = Date.now();
    for (let n = 0; n < plan.totalFrames; n += 1) {
      const wantMask = maskFrames.has(n);
      const { bytes, meta } = await session.frame(n, { samples, shutter, wantMask });
      const flash = detector.push(cellGrid(bytes, FRAME.width, FRAME.height, 4));
      const extra = { rgbaSha256: sha(bytes), flash: { general: flash.general, red: flash.red, ...(flash.general2 ? { general2: flash.general2 } : {}), ...(flash.red2 ? { red2: flash.red2 } : {}), stepArea: flash.stepArea } };
      if (meta.ink === 0) extra.lumP995 = Math.round(luminanceP995(bytes) * 10000) / 10000;
      if (wantMask) {
        writeMask(join(runDir, 'masks'), n, meta.maskBase64);
        delete meta.maskBase64;
      }
      if (contrastFrames.has(n)) {
        mkdirSync(join(runDir, 'contrast'), { recursive: true });
        writeRgbPng(join(runDir, 'contrast', `f${String(n).padStart(5, '0')}.png`), bytes);
        sampleFrames.push(n);
      }
      for (const box of meta.textBoxes) if (box.opacity > 0) minFontPx = Math.min(minFontPx, box.fontSizePx);
      appendFileSync(logPath, frameLines(meta, extra));
      await encoderProc.write(bytes);
      if (n % 60 === 59) log(`frame ${n + 1}/${plan.totalFrames} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    }
    await encoderProc.end();
    checks.contrastFrames = sampleFrames;

    // Poster and reduced-motion still: grain and random noise at 0, Bayer dither kept (MO-A-39/40).
    const poster = posterFrame(plan);
    await session.seek();
    const posterResult = await session.frame(poster, { samples, shutter, stillOverride: true });
    writeRgbPng(join(runDir, 'poster.png'), posterResult.bytes);
    const reference = referenceFrame(plan);
    await session.seek();
    const stillResult = await session.frame(reference, { samples, shutter, stillOverride: true });
    writeRgbPng(join(runDir, 'reduced-motion.png'), stillResult.bytes);
    checks.poster = { frame: poster, ink: posterResult.meta.ink };
    checks.reducedMotion = { frame: reference, ink: stillResult.meta.ink };

    // MO-D-02 perf: >= 120 evenly spaced frames at --samples 1 in this session.
    const count = Math.min(plan.totalFrames, Math.max(PERF.minFrames, 0));
    const perfFrames = Array.from({ length: count }, (_, i) => Math.floor((i * plan.totalFrames) / count));
    await session.seek();
    const times = await session.perf(perfFrames);
    checks.perf = { frames: perfFrames.length, samples: 1, times: times.map((t) => Math.round(t * 100) / 100), load: 'measured while this lane rendered; other lanes may be rendering on the same host' };
    await session.close();
    session = null;

    // Preview from the finished master.
    const preview = await encodePreview({ runDir, master: stagedMaster, encoder, minFontPx, env, log });
    checks.preview = { encoder: preview.encoder, width: preview.width, fps: preview.fps, bytes: preview.bytes, frames: preview.frames, ladder: preview.ladder, overCap: Boolean(preview.overCap) };
    if (preview.records) {
      const lines = preview.records.map((record) => JSON.stringify({ preview: { rung: `${preview.width}x${preview.fps}`, frame: record.frame, frames: preview.frames, fps: preview.fps }, flash: { general: record.general, red: record.red, ...(record.general2 ? { general2: record.general2 } : {}), ...(record.red2 ? { red2: record.red2 } : {}) } }));
      appendFileSync(logPath, `${lines.join('\n')}\n`);
    }

    // MO-C-09 / MO-A-25: re-render the cut frames in a fresh Chrome, seeked, at master settings.
    checks.determinism = await determinism({ out, config, plan, env, software, samples, shutter, listenImpl, log, frames: checks.cutFrames.length ? checks.cutFrames : [0] });

    const sound = muxGate({ mp4: stagedMaster, durationSec: plan.durationSec, treatment, env, track });
    checks.sound = { results: sound.results, exit20: sound.exit20, stats: sound.stats };
    const manifest = manifestFor(plan, { renderer: context.renderer, flags: context.flags, software, samples, shutter, previewEncoder: preview.encoder === 'gif' ? 'gif' : preview.encoder, round, warnings });
    manifest.path = 'type';
    manifest.sound = sound.summary;
    manifest.stillsIndexSha256 = writeStills(out, { plan: lookPlan, frames: lookFrames, width: FRAME.width, height: FRAME.height, path: 'type', round, mode: 'full', poster: { bytes: readFileSync(join(runDir, 'poster.png')), frame: poster }, treatmentSha256, clear: false }).sha256;
    writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(runDir, 'checks.json'), JSON.stringify(checks, null, 2));
    const staged = [stagedMaster, preview.path, join(runDir, 'poster.png'), join(runDir, 'reduced-motion.png')];
    const gate = runGate(out, { staged: true });
    const flashFailed = gate.results.some((result) => result.id === 'MO-C-03' && result.status === 'FAIL');
    const target = promoteOrWithhold(out, staged, flashFailed);
    const finalGate = runGate(out, { withheld: flashFailed });
    writeReport(out, { plan, preflight, manifest, gate: finalGate, round, warnings, context, checks, withheld: flashFailed ? target : null });
    const exitCode = sound.exit20 ? EXIT.SOUND_INVALID : finalGate.status === 'PASS' ? EXIT.OK : EXIT.GATE_FAIL_QA;
    finishRun(runDir, { exitCode, state: flashFailed ? 'withheld' : finalGate.status === 'PASS' ? 'delivered' : 'delivered-with-fail', gate: finalGate.status, withheld: flashFailed });
    return { exitCode, gate: finalGate, plan, withheld: flashFailed };
  } finally {
    if (session) await session.close();
  }
}

async function determinism({ out, config, plan, env, software, samples, shutter, listenImpl, log, frames }) {
  const lines = readFileSync(join(out, 'render.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((line) => line.pass === null && line.frame !== undefined && !line.preview);
  const reference = new Map(lines.map((line) => [line.frame, line.rgbaSha256]));
  const renderPass = async (softwareOnly, renderSamples) => {
    const session = await openSession({ outDir: out, fontKeys: plan.fontKeys, env, listenImpl, log, softwareOnly });
    try {
      await session.init(config);
      const hashes = {};
      for (const frame of frames) {
        await session.seek();
        const { bytes } = await session.frame(frame, { samples: renderSamples, shutter });
        hashes[frame] = sha(bytes);
      }
      return { hashes, renderer: session.renderer, flags: session.flags };
    } finally { await session.close(); }
  };
  const rerun = await renderPass(software, samples);
  const mismatched = frames.filter((frame) => rerun.hashes[frame] !== reference.get(frame));
  const result = { frames, samples, rerunRenderer: rerun.renderer, mismatched: mismatched.map((frame) => ({ frame, video: reference.get(frame), rerender: rerun.hashes[frame] })), seekVsSequential: mismatched.length === 0 ? 'match' : 'mismatch' };
  if (mismatched.length && !software) {
    log('hardware determinism mismatch; re-checking the pair under SwiftShader');
    const a = await renderPass(true, 1);
    const b = await renderPass(true, 1);
    const swMismatch = frames.filter((frame) => a.hashes[frame] !== b.hashes[frame]);
    result.swiftshader = { renderer: a.renderer, mismatched: swMismatch };
    result.verdict = swMismatch.length ? 'FAIL' : 'WARN hardware-nondeterminism';
  } else result.verdict = mismatched.length ? 'FAIL' : 'PASS';
  return result;
}

function finishRun(runDir, fields) {
  const path = join(runDir, 'run.json');
  const current = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  writeFileSync(path, JSON.stringify({ ...current, ...fields, finishedAt: new Date().toISOString() }, null, 2));
}

export function listOutputs(out) {
  return existsSync(out) ? readdirSync(out) : [];
}


// `perf` mode alone (MO-D-02): open a session, time >= 120 evenly spaced frames at --samples 1.
export async function perfOnly({ briefPath = null, out, env = process.env, softwareOnly = false, treatment, log }) {
  mkdirSync(join(out, '.run'), { recursive: true });
  const deps = depsState(env);
  if (deps.state !== 'ready') throw new BlockedError(EXIT.DEPS_NOT_PREWARMED, `BLOCKED_DEPS_NOT_PREWARMED: run ${PREWARM_COMMAND} outside the session`);
  const briefRaw = briefForTreatment(briefPath ? readBrief(briefPath) : null, treatment);
  let plan = planRender(briefRaw, { request: treatment.request, targetSec: treatment.durationSec });
  const problems = plan.fontKeys.map((key) => fontState(key, env)).filter((font) => font.state !== 'ready');
  if (problems.length) throw new BlockedError(EXIT.FONT_FETCH, `BLOCKED_FONT_FETCH: ${problems.map((f) => f.key).join(', ')}; run ${PREWARM_COMMAND}`);
  const session = await openSession({ outDir: out, fontKeys: plan.fontKeys, env, log, softwareOnly });
  try {
    plan = planRender(briefRaw, { software: session.software, request: treatment.request, targetSec: treatment.durationSec });
    await session.init(pageConfig(plan, 1));
    const count = Math.min(plan.totalFrames, PERF.minFrames);
    const frames = Array.from({ length: count }, (_, i) => Math.floor((i * plan.totalFrames) / count));
    const times = await session.perf(frames);
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const ceiling = session.software ? PERF.softwareP95Ms : PERF.gpuP95Ms;
    writeFileSync(join(out, '.run', 'perf.json'), JSON.stringify({ renderer: session.renderer, software: session.software, frames: frames.length, times }, null, 2));
    log(`perf: ${frames.length} frames, p95 ${p95.toFixed(1)} ms (ceiling ${ceiling} ms, ${session.software ? 'software GL' : 'real GPU'})`);
    return p95 <= ceiling ? EXIT.OK : EXIT.GATE_FAIL_QA;
  } finally { await session.close(); }
}
