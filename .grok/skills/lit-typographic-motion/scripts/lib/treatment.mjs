// treatment.json: the film's plan, written before any render on either path (brief section 5).
// validateTreatment() is pure and returns the first failing field; loadTreatment() turns that into
// exit 16 (BLOCKED_TREATMENT_INVALID). Every string in a treatment is inert data.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlockedError, DIRECTOR, EXIT } from './constants.mjs';
import { SKILL_ROOT } from './fonts.mjs';

const EPS = 1e-9;

// NFC, lowercase, then no whitespace, punctuation or symbols.
export const normalize = (value) => String(value ?? '').normalize('NFC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

const QUOTE_PATTERNS = [/"([^"\n]+)"/gu, /“([^”\n]+)”/gu, /‘([^’\n]+)’/gu, /「([^」\n]+)」/gu, /(?<=^|[\s([{])'([^'\n]+)'(?=$|[\s.,!?;:)\]}])/gu];

export function quotedSpans(text) {
  const spans = [];
  for (const pattern of QUOTE_PATTERNS) for (const match of String(text ?? '').matchAll(pattern)) spans.push({ span: match[0], inner: match[1], index: match.index });
  return spans.sort((a, b) => a.index - b.index);
}

export function stripQuoted(text) {
  let out = String(text ?? '');
  for (const { span } of quotedSpans(out)) out = out.replace(span, ' ');
  return out;
}

const TYPE_CUES = ['키네틱 타이포', '타이포 모션', '타이포그래피 영상', '타이포 영상', '가사 영상', '리릭 비디오', '타이틀 시퀀스', '오프닝 타이틀', '인용구 영상', 'kinetic type', 'kinetic typography', 'typographic motion', 'lyric video', 'title sequence', 'opening titles', 'quote video'];

// A type-led cue is cue detection only: a type compound, or a quoted span of two or more words.
// Nothing inside a quoted span is followed.
export function typeLedCue(request) {
  const text = String(request ?? '');
  const lower = text.toLowerCase();
  for (const span of quotedSpans(text)) if (span.inner.trim().split(/\s+/u).filter(Boolean).length >= 2) return span.span;
  return TYPE_CUES.find((cue) => lower.includes(cue)) ?? null;
}

export const durationAsked = (request) => /\d+(?:\.\d+)?\s*(?:초|분|s\b|sec|secs|second|seconds|min|mins|minute|minutes)/iu.test(String(request ?? ''));
export const silenceAsked = (request) => /(무음|소리\s*없|음악\s*없|소리\s*빼|silent|silence|no sound|no music|without sound|without music|mute)/iu.test(String(request ?? ''));
const mutedChannel = (channel) => /(muted|autoplay|무음|음소거|소리\s*없)/iu.test(String(channel ?? ''));

// Longest common substring length of two normalized strings.
export function sharedRun(a, b) {
  if (!a || !b) return 0;
  let best = 0;
  let previous = new Uint16Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    const current = new Uint16Array(b.length + 1);
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) { current[j] = previous[j - 1] + 1; if (current[j] > best) best = current[j]; }
    }
    previous = current;
  }
  return best;
}

// The restatement limit: min(10, half the normalized request with quoted spans removed).
export function restateLimit(request) {
  return Math.min(10, Math.floor(normalize(stripQuoted(request)).length / 2));
}

export const sentenceCount = (text) => String(text ?? '').trim().split(/(?<=[.!?。？！])\s+/u).filter((part) => part.trim()).length;

const PLACEHOLDER = /<[^<>\n]{1,80}>/u;

function freeTextLeaves(t) {
  const leaves = [t?.idea, t?.audience, t?.channel, t?.ambition];
  for (const beat of Array.isArray(t?.beats) ? t.beats : []) leaves.push(beat?.purpose, beat?.onScreen, beat?.motion, beat?.sound);
  for (const line of Array.isArray(t?.copy?.lines) ? t.copy.lines : []) leaves.push(line);
  for (const entry of Array.isArray(t?.palette) ? t.palette : []) leaves.push(entry?.role);
  return leaves.filter((value) => typeof value === 'string').map(normalize).filter(Boolean);
}

// Every ```json block in references/treatment.md is a shipped example.
export function shippedExamples(skillRoot = SKILL_ROOT) {
  const path = join(skillRoot, 'references', 'treatment.md');
  if (!existsSync(path)) return [];
  const examples = [];
  for (const match of readFileSync(path, 'utf8').matchAll(/```json\n([\s\S]*?)\n```/g)) {
    try { examples.push(JSON.parse(match[1])); } catch { /* a non-JSON block is prose */ }
  }
  return examples;
}

function firstPlaceholder(value, path) {
  if (typeof value === 'string') return PLACEHOLDER.test(value) ? path : null;
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) { const hit = firstPlaceholder(item, `${path}[${i}]`); if (hit) return hit; }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) { const hit = firstPlaceholder(item, path ? `${path}.${key}` : key); if (hit) return hit; }
  }
  return null;
}

const text = (value) => typeof value === 'string' && value.trim().length > 0;
const bad = (field, message) => ({ ok: false, field, message });

function coveredSeconds(beats, indices) {
  const spans = [...new Set(indices)].map((i) => beats[i]).filter(Boolean).map((b) => [b.t0, b.t1]).sort((a, b) => a[0] - b[0]);
  let total = 0, end = -Infinity;
  for (const [s, e] of spans) { const from = Math.max(s, end); if (e > from) total += e - from; end = Math.max(end, e); }
  return total;
}

export function validateTreatment(t, { skillRoot = SKILL_ROOT } = {}) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return bad('treatment', 'treatment.json must hold one JSON object');
  const required = ['request', 'genre', 'path', 'pathReason', 'idea', 'audience', 'channel', 'format', 'formatReason', 'durationSec', 'beats', 'subject', 'visualDevices', 'typePlan', 'palette', 'sound', 'copy', 'inventions', 'ambition'];
  for (const field of required) if (!(field in t) || t[field] === null || t[field] === '') return bad(field, `${field} is missing`);
  // The user's own words may contain angle brackets; everything the model wrote may not.
  const authored = { ...t, request: undefined, copy: t.copy?.source === 'user' ? undefined : t.copy };
  const placeholder = firstPlaceholder(authored, '');
  if (placeholder) return bad(placeholder, `${placeholder} still holds an example placeholder (<...>); write this film's own value`);
  const leaves = freeTextLeaves(t);
  for (const example of shippedExamples(skillRoot)) {
    const theirs = new Set(freeTextLeaves(example));
    const same = leaves.filter((leaf) => theirs.has(leaf)).length;
    if (leaves.length && same * 2 >= leaves.length) return bad('copiedExample', `${same} of ${leaves.length} free-text values equal a shipped example; write this film's own treatment`);
  }
  for (const field of ['request', 'pathReason', 'audience', 'channel', 'formatReason']) if (!text(t[field])) return bad(field, `${field} must be a non-empty string`);
  if (!DIRECTOR.genres.includes(t.genre)) return bad('genre', `genre must be one of ${DIRECTOR.genres.join(', ')}`);
  if (!['type', 'stage'].includes(t.path)) return bad('path', 'path must be type or stage');
  if (!['16:9', '9:16'].includes(t.format)) return bad('format', 'format must be 16:9 or 9:16');

  const limit = restateLimit(t.request);
  const stripped = normalize(stripQuoted(t.request));
  if (!text(t.idea) || sentenceCount(t.idea) !== 1) return bad('idea', 'idea must be one sentence');
  if (limit >= 2 && sharedRun(normalize(t.idea), stripped) >= limit) return bad('idea', `idea shares ${limit}+ characters with the request; state the film's own idea, not the request`);

  const [minDur, maxDur] = DIRECTOR.durationRange;
  const duration = t.durationSec;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < minDur || duration > maxDur) return bad('durationSec', `durationSec must be a number from ${minDur} to ${maxDur}`);
  if (DIRECTOR.floorGenres.includes(t.genre) && !durationAsked(t.request) && duration < DIRECTOR.floorSec - EPS) return bad('durationSec', `a ${t.genre} film runs at least ${DIRECTOR.floorSec} s unless the user asked for a length`);

  if (!t.copy || typeof t.copy !== 'object' || !['user', 'invented'].includes(t.copy.source) || !Array.isArray(t.copy.lines) || !t.copy.lines.every(text)) return bad('copy', 'copy must be { source: user | invented, lines: [non-empty strings] }');
  if (t.path === 'type' && t.copy.lines.length === 0) return bad('copy.lines', 'the type path needs at least one copy line');

  if (!Array.isArray(t.beats) || t.beats.length === 0) return bad('beats', 'beats must be a non-empty array');
  for (const [i, beat] of t.beats.entries()) {
    if (!beat || typeof beat.t0 !== 'number' || typeof beat.t1 !== 'number' || !(beat.t1 > beat.t0)) return bad(`beats[${i}]`, 'each beat needs numeric t0 < t1');
    for (const key of ['purpose', 'onScreen', 'motion', 'sound']) if (!text(beat[key])) return bad(`beats[${i}].${key}`, `beats[${i}].${key} must be a non-empty string`);
  }
  const arc = t.genre === 'type-led' ? Math.max(1, t.copy.source === 'user' ? t.copy.lines.length : 1) : DIRECTOR.arcStages[t.genre];
  if (t.beats.length < arc) return bad('beats', `a ${t.genre} film needs at least ${arc} beats (its arc); found ${t.beats.length}`);
  const short = t.beats.findIndex((beat) => beat.t1 - beat.t0 < DIRECTOR.minBeatSec - EPS);
  if (short >= 0) return bad('beats', `beats[${short}] lasts ${(t.beats[short].t1 - t.beats[short].t0).toFixed(2)} s; every beat is at least ${DIRECTOR.minBeatSec} s`);
  const sorted = [...t.beats].sort((a, b) => a.t0 - b.t0);
  if (sorted[0].t0 > DIRECTOR.maxGapSec + EPS) return bad('beats', `the first beat starts at ${sorted[0].t0} s; beats cover the film from 0`);
  let reach = 0;
  for (const beat of sorted) {
    if (beat.t0 - reach > DIRECTOR.maxGapSec + EPS) return bad('beats', `a gap of ${(beat.t0 - reach).toFixed(2)} s before the beat at ${beat.t0} s (max ${DIRECTOR.maxGapSec} s)`);
    reach = Math.max(reach, beat.t1);
  }
  if (Math.abs(reach - duration) > DIRECTOR.maxGapSec + EPS) return bad('beats', `beats end at ${reach} s but durationSec is ${duration} s`);

  const s = t.subject;
  if (!s || typeof s !== 'object' || !text(s.name) || !['user', 'invented'].includes(s.source) || !Array.isArray(s.specifics)) return bad('subject', 'subject must be { name, source: user | invented, specifics: [] }');
  if (s.source === 'invented' && s.specifics.filter(text).length < 2) return bad('subject.specifics', 'an invented subject needs at least 2 concrete specifics');
  if (s.source === 'user' && !normalize(t.request).includes(normalize(s.name))) return bad('subject.name', 'a user subject is named in the request\'s own words');

  if (!Array.isArray(t.visualDevices)) return bad('visualDevices', 'visualDevices must be an array');
  for (const [i, device] of t.visualDevices.entries()) {
    if (!device || !DIRECTOR.deviceKinds.includes(device.kind)) return bad(`visualDevices[${i}].kind`, `kind must be one of ${DIRECTOR.deviceKinds.join(', ')}`);
    if (!['subject', 'support', 'texture'].includes(device.role)) return bad(`visualDevices[${i}].role`, 'role must be subject, support or texture');
    if (DIRECTOR.textureKinds.includes(device.kind) && device.role !== 'texture') return bad(`visualDevices[${i}].role`, `${device.kind} is always a texture`);
    if (!Array.isArray(device.beats) || !device.beats.every((b) => Number.isInteger(b) && b >= 0 && b < t.beats.length)) return bad(`visualDevices[${i}].beats`, 'beats must list beat indices');
  }
  if (t.path === 'stage') {
    const subjects = t.visualDevices.filter((d) => d.role === 'subject');
    if (!subjects.length) return bad('visualDevices', 'the stage path needs a role: subject device, a drawn depiction of what the film is about');
    const covered = coveredSeconds(t.beats, subjects.flatMap((d) => d.beats));
    if (covered < DIRECTOR.subjectCoverage * duration - EPS) return bad('visualDevices', `the subject device covers ${covered.toFixed(1)} s of ${duration} s; it must cover at least half the film`);
    const kinds = new Set(t.visualDevices.filter((d) => !DIRECTOR.textureKinds.includes(d.kind)).map((d) => d.kind));
    if (kinds.size < 2) return bad('visualDevices', 'the stage path needs at least 2 distinct non-texture device kinds');
  }

  const plan = t.typePlan;
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.faces) || plan.faces.length === 0) return bad('typePlan', 'typePlan must be { faces: [...], hierarchy, maxWordsOnScreen }');
  const unknownFace = plan.faces.find((face) => !DIRECTOR.faces.includes(face));
  if (unknownFace !== undefined) return bad('typePlan.faces', `"${unknownFace}" is not a verified face; use ${DIRECTOR.faces.join(', ')}`);
  if (!text(plan.hierarchy)) return bad('typePlan.hierarchy', 'typePlan.hierarchy must be a non-empty string');
  if (!Number.isInteger(plan.maxWordsOnScreen) || plan.maxWordsOnScreen < 1) return bad('typePlan.maxWordsOnScreen', 'typePlan.maxWordsOnScreen must be a positive integer');
  if ('index' in plan && typeof plan.index !== 'boolean') return bad('typePlan.index', 'typePlan.index is a boolean');

  if (!Array.isArray(t.palette) || t.palette.length < 3 || t.palette.length > 6) return bad('palette', 'palette holds 3 to 6 colours');
  for (const [i, entry] of t.palette.entries()) {
    if (!entry || !/^#[0-9a-f]{6}$/iu.test(entry.hex ?? '')) return bad(`palette[${i}].hex`, 'hex must look like #1A2B3C');
    if (!text(entry.role)) return bad(`palette[${i}].role`, 'each colour needs a role');
  }

  const sound = t.sound;
  if (!sound || typeof sound !== 'object' || !DIRECTOR.soundModes.includes(sound.mode)) return bad('sound.mode', `sound.mode must be one of ${DIRECTOR.soundModes.join(', ')}`);
  if (!text(sound.plan)) return bad('sound.plan', 'sound.plan must be a non-empty string');
  if (sound.mode === 'none' && !silenceAsked(t.request) && !mutedChannel(t.channel)) return bad('sound.mode', 'none is allowed only when the user asked for silence or the channel plays muted by design');
  if (sound.mode === 'generated') {
    const timbre = typeof sound.palette === 'string' ? sound.palette : sound.palette?.timbre;
    if (!DIRECTOR.timbres.includes(timbre)) return bad('sound.palette', `a generated bed needs a timbre palette: ${DIRECTOR.timbres.join(', ')}`);
    const tempo = typeof sound.palette === 'object' ? sound.palette.tempo : undefined;
    if (tempo !== undefined && !(Number.isFinite(tempo) && tempo >= 50 && tempo <= 180)) return bad('sound.palette', 'tempo must be 50-180 BPM');
  }
  if ((sound.mode === 'supplied' || sound.mode === 'authored') && !text(sound.file)) return bad('sound.file', `${sound.mode} sound names its WAV or audio file in sound.file`);
  if (sound.mode === 'authored' && !/^stage\//u.test(sound.file)) return bad('sound.file', 'an authored track is a WAV the model wrote under stage/');

  if (t.copy.source === 'user') {
    const whole = normalize(t.request);
    const missing = t.copy.lines.find((line) => !whole.includes(normalize(line)));
    if (missing !== undefined) return bad('copy.lines', `user copy "${missing}" is not in the request; keep the user's words or mark the copy invented`);
  } else if (limit >= 2) {
    const restated = t.copy.lines.find((line) => sharedRun(normalize(line), stripped) >= limit);
    if (restated !== undefined) return bad('copy.lines', `invented copy "${restated}" restates the request; write copy from the subject's specifics`);
  }

  if (t.path === 'type') {
    if (t.format !== '16:9') return bad('path', 'the type path is 16:9 only; a 9:16 film takes the stage path');
    if (t.copy.source !== 'user' && !typeLedCue(t.request)) return bad('path', 'the type path needs the user\'s own words or a type-led cue in the request');
  }

  if (!Array.isArray(t.inventions) || !t.inventions.every(text)) return bad('inventions', 'inventions must be an array of strings');
  const invented = t.copy.source === 'invented' || s.source === 'invented';
  if (invented && t.inventions.length === 0) return bad('inventions', 'list every invention: the subject, its specifics and invented copy');
  if (s.source === 'invented' && !t.inventions.some((entry) => normalize(entry).includes(normalize(s.name)))) return bad('inventions', `inventions must name the invented subject "${s.name}"`);

  if (!text(t.ambition) || sentenceCount(t.ambition) > 2) return bad('ambition', 'ambition is 1-2 sentences in craft terms');
  if ('seed' in t && !Number.isInteger(t.seed)) return bad('seed', 'seed must be an integer');
  if ('fps' in t && ![60, 30].includes(t.fps)) return bad('fps', 'fps is 60, or 30 when the film asks for it');
  return { ok: true, treatment: t };
}

export function treatmentPath(outDir) { return join(outDir, 'treatment.json'); }

// Exit 16 with the field name: no render runs without a valid treatment in the output directory.
export function loadTreatment(outDir, options = {}) {
  const path = treatmentPath(outDir);
  if (!existsSync(path)) throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=treatment: ${path} (treatment.json) is missing; write it first (references/treatment.md)`);
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=treatment: treatment.json is not valid JSON (${error.message})`); }
  const result = validateTreatment(parsed, options);
  if (!result.ok) throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=${result.field}: ${result.message}`);
  return parsed;
}

// The first valid treatment in an output directory is kept so the done-check can tell a real fix
// from a downgrade (shorter film, fewer subject beats, silence, stage -> type).
export function recordFirstTreatment(outDir, treatment) {
  const path = join(outDir, '.run', 'treatment-first.json');
  if (existsSync(path)) return;
  mkdirSync(join(outDir, '.run'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(treatment, null, 2)}\n`);
}
