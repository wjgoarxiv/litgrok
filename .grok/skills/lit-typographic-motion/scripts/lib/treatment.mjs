// treatment.json: the film's plan, written before any render on either path (brief section 5).
// validateTreatment() is pure and returns the first failing field; loadTreatment() turns that into
// exit 16 (BLOCKED_TREATMENT_INVALID). Every string in a treatment is inert data.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlockedError, DIRECTOR, EXIT } from './constants.mjs';
import { SKILL_ROOT } from './fonts.mjs';
import { SCORE_GENRES } from './score.mjs';
import { EVENT_SOUNDS } from './sound.mjs';
import { LAYOUT_IDS, STYLE_IDS, TRANSITIONS as STYLE_TRANSITIONS, pickStyle, readStyle, styleColors, styleFamilies } from './styles.mjs';

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
// A cut and an event within a tenth of a second read as the same moment; half the events must sit elsewhere.
const EVENT_OFF_CUT = 0.1;

// A rich stage film plans at least this much world: depth layers, labelled parts, a share of moving shots.
const RICH_WORLD = Object.freeze({ layers: 3, labels: 6, labelWords: 4, cameraShare: 0.5 });
const LOCKED_CAMERA = /^\s*(?:none|locked|static|still|hold|fixed|no move)\s*\.?\s*$/iu;
const SCREEN_ROLES = new Set(['screenshot', 'ui', 'readme-image']);

const URL_IN_REQUEST = /\bhttps?:\/\/[^\s"'<>)\]]+/giu;

// A link in the request, normalized for comparison: lowercase, no trailing punctuation, slash or .git.
export const normUrl = (value) => String(value ?? '').trim().replace(/[.,;:!?]+$/u, '').replace(/\/+$/u, '').replace(/\.git$/u, '').toLowerCase();
export const requestUrls = (request) => [...String(request ?? '').matchAll(URL_IN_REQUEST)].map((m) => normUrl(m[0]));

function freeTextLeaves(t) {
  const leaves = [t?.idea, t?.audience, t?.channel, t?.ambition, t?.story?.expect, t?.story?.turn, t?.story?.payoff, t?.protagonist?.look];
  for (const act of Array.isArray(t?.protagonist?.acts) ? t.protagonist.acts : []) leaves.push(act?.action);
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

export function validateTreatment(t, { skillRoot = SKILL_ROOT, house = null } = {}) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return bad('treatment', 'treatment.json must hold one JSON object');
  if (t.mode === 'cover') return bad('mode', 'this is a cover treatment (mode: cover); render it with cover --out <dir> (references/cover.md)');
  const required = ['request', 'genre', 'path', 'pathReason', 'idea', 'audience', 'channel', 'format', 'formatReason', 'durationSec', 'beats', 'subject', 'visualDevices', 'typePlan', 'palette', 'sound', 'copy', 'inventions', 'ambition', 'story'];
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

  // The house style: a style the request names wins; then the project house file; then keywords;
  // then the genre. A declared style must be the rule's pick; an undeclared film takes the pick.
  const pick = pickStyle({ request: t.request, copy: t.copy?.lines ?? [], path: t.path, house, genre: t.genre });
  let style = null;
  if ('style' in t && t.style !== undefined && t.style !== null) {
    if (!STYLE_IDS.includes(t.style)) return bad('style', `style must be one of ${STYLE_IDS.join(', ')}`);
    if (t.path === 'type' && !readStyle(t.style).typePreset) return bad('style', 'the type path needs a style with a type preset; paper is stage-only');
    if (t.style !== pick.id) return bad('style', `${pick.reason}; this film takes the ${pick.id} style`);
    style = readStyle(t.style);
  }

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
    // Shot fields are optional; when present they follow the layout grid.
    if (beat.layout !== undefined && !LAYOUT_IDS.includes(beat.layout)) return bad(`beats[${i}].layout`, `layout must be one of ${LAYOUT_IDS.join(', ')}`);
    if (beat.transition !== undefined && beat.transition !== 'end' && !(style ? style.transitions : STYLE_TRANSITIONS).includes(beat.transition)) return bad(`beats[${i}].transition`, `transition must be one of ${(style ? style.transitions : STYLE_TRANSITIONS).join(', ')} or end`);
    if (i === t.beats.length - 1 && beat.transition !== undefined && beat.transition !== 'end') return bad(`beats[${i}].transition`, 'the last beat hands off to nothing; its transition is end');
    if (i < t.beats.length - 1 && beat.transition === 'end') return bad(`beats[${i}].transition`, 'only the last beat ends; a middle beat hands off with cut, wipe, match, push, iris, dissolve or morph');
    if (beat.hero !== undefined && !text(beat.hero)) return bad(`beats[${i}].hero`, 'a named hero says what moves in one line');
    if (beat.lines !== undefined) {
      if (!Array.isArray(beat.lines) || beat.lines.some((n) => !Number.isInteger(n) || n < 0 || n >= t.copy.lines.length)) return bad(`beats[${i}].lines`, `lines lists copy-line indices 0..${t.copy.lines.length - 1}`);
      if (beat.layout === 'full' && beat.lines.length) return bad(`beats[${i}].lines`, 'a full-frame shot carries no copy lines; the drawing fills the frame');
    }
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
    if (device.kind === 'screen') {
      const assets = Array.isArray(t.product?.assets) ? t.product.assets : [];
      const real = assets.find((a) => a.path === device.asset);
      if (!real || !SCREEN_ROLES.has(real.role)) return bad(`visualDevices[${i}].asset`, 'a product screen shows the product\'s real screenshot, UI or README image: name one listed in product.assets, never draw an invented one');
    }
  }
  if (t.path === 'stage') {
    const subjects = t.visualDevices.filter((d) => d.role === 'subject');
    if (!subjects.length) return bad('visualDevices', 'the stage path needs a role: subject device, a drawn depiction of what the film is about');
    const covered = coveredSeconds(t.beats, subjects.flatMap((d) => d.beats));
    if (covered < DIRECTOR.subjectCoverage * duration - EPS) return bad('visualDevices', `the subject device covers ${covered.toFixed(1)} s of ${duration} s; it must cover at least half the film`);
    const kinds = new Set(t.visualDevices.filter((d) => !DIRECTOR.textureKinds.includes(d.kind)).map((d) => d.kind));
    if (kinds.size < 2) return bad('visualDevices', 'the stage path needs at least 2 distinct non-texture device kinds');
  }

  // The story: what the viewer expects, the turn they do not, the shot where it lands, the payoff.
  if (!('story' in t) || t.story === null || t.story === '') return bad('story', 'story is missing: { expect, turn, beat, payoff }: what the viewer expects, what happens instead, the shot where it lands, what the ending gives');
  {
    const story = t.story;
    if (!story || typeof story !== 'object') return bad('story', 'story must be an object { expect, turn, beat, payoff }');
    for (const key of ['expect', 'turn', 'payoff']) {
      if (!text(story[key])) return bad(`story.${key}`, `story.${key} must be a non-empty string`);
      if (PLACEHOLDER.test(story[key])) return bad(`story.${key}`, `story.${key} holds a placeholder value; write this film's own`);
      if (sentenceCount(story[key]) > 2) return bad(`story.${key}`, `story.${key} is at most 2 sentences`);
    }
    if (normalize(story.turn) === normalize(story.expect)) return bad('story.turn', 'the turn is what the viewer does not expect; it cannot restate story.expect');
    if (!Number.isInteger(story.beat) || story.beat < 1 || story.beat >= t.beats.length) return bad('story.beat', `story.beat is the index of the shot where the turn lands: after the opening, before the end (1-${t.beats.length - 1})`);
  }

  // The protagonist: one drawn character or hero object that acts across a stage film.
  if (t.path === 'stage') {
    if (!('protagonist' in t) || t.protagonist === null || t.protagonist === '') return bad('protagonist', 'protagonist is missing: { name, kind, look, acts[] }: the character or hero object that carries the film');
    const p = t.protagonist;
    if (!p || typeof p !== 'object') return bad('protagonist', 'protagonist must be an object { name, kind, look, acts }');
    if (!text(p.name) || PLACEHOLDER.test(p.name)) return bad('protagonist.name', 'protagonist.name must name it');
    if (!DIRECTOR.protagonistKinds.includes(p.kind)) return bad('protagonist.kind', `protagonist.kind must be ${DIRECTOR.protagonistKinds.join(' or ')}`);
    if (!text(p.look) || PLACEHOLDER.test(p.look)) return bad('protagonist.look', 'protagonist.look says what it looks like on screen: shape, material, colour role, scale in the frame');
    if (!Array.isArray(p.acts) || !p.acts.length) return bad('protagonist.acts', 'protagonist.acts lists what it does, shot by shot: [{ beat, action }]');
    const seen = new Set();
    for (const [i, act] of p.acts.entries()) {
      if (!Number.isInteger(act?.beat) || act.beat < 0 || act.beat >= t.beats.length) return bad(`protagonist.acts[${i}].beat`, 'protagonist.acts[].beat must be a beat index');
      if (seen.has(act.beat)) return bad(`protagonist.acts[${i}].beat`, 'one act per shot');
      seen.add(act.beat);
      if (!text(act.action) || PLACEHOLDER.test(act.action)) return bad(`protagonist.acts[${i}].action`, 'protagonist.acts[].action says what it does in this shot, as a viewer would see it');
    }
    const carried = coveredSeconds(t.beats, [...seen]);
    if (carried < 0.5 * t.durationSec - EPS) return bad('protagonist.acts', `it acts for ${carried.toFixed(1)} s, under half the film; it carries the film, not one shot`);
    if (!seen.has(t.story.beat)) return bad('protagonist.acts', `the turn lands at shot ${t.story.beat + 1}, and the protagonist has no act there`);
  }

  // A named product: its real logo, images, UI and words, never invented ones.
  {
    const urls = requestUrls(t.request);
    if (!('product' in t) || t.product === null) {
      if (urls.length) return bad('product', `product is missing: the request links ${urls[0]}; fetch its real assets with motion.mjs assets --out <dir> --url <link> and list them`);
    } else {
      const p = t.product;
      if (!p || typeof p !== 'object') return bad('product', 'product must be an object { name, url, assets }');
      if (!text(p.name) || PLACEHOLDER.test(p.name)) return bad('product.name', 'product.name must name the product');
      if (urls.length && !urls.includes(normUrl(p.url))) return bad('product.url', `product.url must be the link the request gives (${urls.join(', ')})`);
      if (!('unreachable' in p) || p.unreachable === undefined || p.unreachable === null) {
        if (!Array.isArray(p.assets) || !p.assets.length) return bad('product.assets', 'product.assets lists the real assets the film uses: [{ path, role, source, sha256 }]; when none can be reached set unreachable and ask the user');
        for (const [i, asset] of p.assets.entries()) {
          const field = `product.assets[${i}]`;
          if (typeof asset?.path !== 'string' || !asset.path.startsWith('stage/assets/') || asset.path.split('/').includes('..')) return bad(`${field}.path`, 'product asset paths are files under stage/assets/, relative to the output directory');
          if (!DIRECTOR.assetRoles.includes(asset.role)) return bad(`${field}.role`, `product asset roles: ${DIRECTOR.assetRoles.join(', ')}`);
          if (!['fetched', 'user'].includes(asset.source)) return bad(`${field}.source`, 'product asset source is fetched (by motion.mjs assets) or user (supplied)');
          if (!/^[0-9a-f]{64}$/u.test(asset.sha256 ?? '')) return bad(`${field}.sha256`, 'product asset sha256 must be the file\'s SHA-256');
        }
        if (t.subject?.source === 'invented') return bad('subject.source', 'the product is real: the subject is the product (source user), its specifics from its own words');
      } else if (!text(p.unreachable)) return bad('product.unreachable', 'product.unreachable says what could not be reached and why');
    }
  }

  // The 3D route: a depth3d subject is drawn with the pinned three.js on the GPU rung.
  if ('depth' in t && t.depth !== undefined && t.depth !== null && !['2d', '3d'].includes(t.depth)) return bad('depth', 'depth is 2d (the default) or 3d');
  {
    const solid = t.visualDevices.some((d) => d.kind === 'depth3d' && d.role === 'subject');
    if (t.path !== 'type') {
      if (solid && t.depth !== '3d') return bad('depth', 'the subject is a depth3d device: set depth to 3d, so the film takes the 3D route');
      if (t.depth === '3d' && !solid) return bad('depth', 'depth 3d needs the subject drawn as a depth3d device (role subject)');
    } else if (t.depth === '3d') return bad('depth', 'depth 3d is a stage-path route');
    if ('render3d' in t && t.render3d !== undefined && t.render3d !== null && !['three', 'blender'].includes(t.render3d)) return bad('render3d', 'render3d is three (the GPU rung, the default) or blender (the offline Cycles rung)');
    if (t.render3d === 'blender' && t.depth !== '3d') return bad('render3d', 'the Blender rung renders a 3D world: set depth to 3d with a depth3d subject');
  }

  // A rich stage film plans its density before any page exists: the depth layers of its world,
  // the labelled parts the viewer reads in it and the shots where the camera moves.
  if (t.path === 'stage' && t.register !== 'minimal') {
    const world = t.world;
    if (!world || typeof world !== 'object') return bad('world', 'world is missing: { layers, labels, camera }: a rich film plans its layered world, its labelled parts and its camera moves');
    if (!Array.isArray(world.layers) || world.layers.filter(text).length < RICH_WORLD.layers) return bad('world.layers', `world.layers holds at least ${RICH_WORLD.layers} depth layers, back to front, each saying what lives there`);
    for (const [i, label] of (Array.isArray(world.labels) ? world.labels : []).entries()) {
      if (!text(label) || PLACEHOLDER.test(label)) return bad(`world.labels[${i}]`, 'world.labels[] is the label as it appears on screen');
      if (label.trim().split(/\s+/u).length > RICH_WORLD.labelWords) return bad(`world.labels[${i}]`, `a label is at most ${RICH_WORLD.labelWords} words; longer text is copy`);
    }
    if (!Array.isArray(world.labels) || world.labels.length < RICH_WORLD.labels) return bad('world.labels', `world.labels holds at least ${RICH_WORLD.labels} labelled parts the viewer reads on screen`);
    if (!Array.isArray(world.camera)) return bad('world.camera', 'world.camera lists the camera moves: [{ beat, move }]');
    const moving = new Set();
    for (const [i, move] of world.camera.entries()) {
      if (!Number.isInteger(move?.beat) || move.beat < 0 || move.beat >= t.beats.length) return bad(`world.camera[${i}].beat`, 'world.camera[].beat must be a beat index');
      if (!text(move.move) || PLACEHOLDER.test(move.move) || LOCKED_CAMERA.test(move.move)) return bad(`world.camera[${i}].move`, 'name the move (push-in, truck, crane, orbit, rack focus); a locked shot is not listed');
      moving.add(move.beat);
    }
    if (moving.size < RICH_WORLD.cameraShare * t.beats.length - EPS) return bad('world.camera', `the camera moves in ${moving.size} of ${t.beats.length} shots; a rich film moves it in at least half (keep the flash audit with slow light changes, not a locked camera)`);
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
  // A declared style owns the look: palette, faces and generated bed come from it.
  if (style) {
    const allowed = new Set(styleColors(style));
    const offStyle = t.palette.find((entry) => !allowed.has(String(entry.hex).toLowerCase()));
    if (offStyle) return bad('palette', `"${offStyle.hex}" is not on the ${style.id} style; copy may only use ${style.textRoles.join(', ')}`);
    const families = styleFamilies(style);
    const unknownFace = t.typePlan.faces.find((face) => !families.has(face));
    if (unknownFace !== undefined) return bad('typePlan.faces', `"${unknownFace}" is not a ${style.id} face; use ${[...families].join(', ')}`);
  }

  const sound = t.sound;
  if (!sound || typeof sound !== 'object' || !DIRECTOR.soundModes.includes(sound.mode)) return bad('sound.mode', `sound.mode must be one of ${DIRECTOR.soundModes.join(', ')}`);
  if (!text(sound.plan)) return bad('sound.plan', 'sound.plan must be a non-empty string');
  if (sound.mode === 'none' && !silenceAsked(t.request) && !mutedChannel(t.channel)) return bad('sound.mode', 'none is allowed only when the user asked for silence or the channel plays muted by design; the default is a score');
  if (sound.mode === 'generated' && t.register === 'rich') return bad('sound.mode', 'a rich film scores its own music (mode score); the style beds are for minimal films');
  if ('genre' in sound && sound.genre !== undefined && sound.genre !== null && !SCORE_GENRES.includes(sound.genre)) return bad('sound.genre', `sound.genre must be one of ${SCORE_GENRES.join(', ')}`);
  if (sound.mode === 'generated') {
    const timbre = typeof sound.palette === 'string' ? sound.palette : sound.palette?.timbre;
    if (!DIRECTOR.timbres.includes(timbre)) return bad('sound.palette', `a generated bed needs a timbre palette: ${DIRECTOR.timbres.join(', ')}`);
    const tempo = typeof sound.palette === 'object' ? sound.palette.tempo : undefined;
    if (tempo !== undefined && !(Number.isFinite(tempo) && tempo >= 50 && tempo <= 180)) return bad('sound.palette', 'tempo must be 50-180 BPM');
    // A styled film's bed is one of the style's own; a minimal film's bed is the style default.
    if (style && typeof sound.palette === 'object') {
      const same = (b) => ['timbre', 'key', 'mode', 'tempo'].every((k) => String(b[k]).toLowerCase() === String(sound.palette[k]).toLowerCase());
      if (!style.beds.some(same)) return bad('sound.palette', `a ${style.id} bed is one of its own: ${style.beds.map((b) => `${b.timbre} ${b.key} ${b.mode} ${b.tempo}`).join('; ')}`);
    }
  }
  if ((sound.mode === 'supplied' || sound.mode === 'authored') && !text(sound.file)) return bad('sound.file', `${sound.mode} sound names its WAV or audio file in sound.file`);
  if (sound.mode === 'authored' && !/^stage\//u.test(sound.file)) return bad('sound.file', 'an authored track is a WAV the model wrote under stage/');
  if ((sound.mode === 'generated' || sound.mode === 'score') && t.path === 'stage' && !('events' in sound)) return bad('sound.events', 'list the on-screen events that make a sound: [{ t, on, kind }], at least 2, half of them away from the cuts');
  if ('events' in sound) {
    const events = sound.events;
    if (!Array.isArray(events) || events.length < 2) return bad('sound.events', 'at least 2 on-screen events that make a sound: [{ t, on, kind }]');
    const cuts = t.beats.slice(1).map((b) => b.t0);
    let offCut = 0;
    for (let i = 0; i < events.length; i += 1) {
      const e = events[i], f = `sound.events[${i}]`;
      if (typeof e?.t !== 'number' || !(e.t > 0 && e.t < t.durationSec)) return bad(`${f}.t`, `the second the event happens on screen, inside the film (0-${t.durationSec})`);
      if (!text(e.on) || PLACEHOLDER.test(e.on)) return bad(`${f}.on`, 'what happens on screen at that moment, as a viewer would see it');
      if (!EVENT_SOUNDS.includes(e.kind)) return bad(`${f}.kind`, `must be one of ${EVENT_SOUNDS.join(', ')}`);
      if (cuts.every((c) => Math.abs(c - e.t) >= EVENT_OFF_CUT - 1e-9)) offCut += 1;
    }
    if (offCut * 2 < events.length) return bad('sound.events', `${events.length - offCut} of ${events.length} events sit on a cut; at least half sync to something moving inside a shot`);
  }

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

  // The register defaults to rich: a full frame unless the film opts into negative space.
  if ('register' in t && t.register !== undefined && t.register !== null) {
    if (!['rich', 'minimal'].includes(t.register)) return bad('register', 'register is rich (the default) or minimal');
  } else {
    t.register = 'rich';
  }

  // preview: true only when the request asks for a preview or storyboard first.
  if ('preview' in t && t.preview !== undefined && t.preview !== null) {
    if (typeof t.preview !== 'boolean') return bad('preview', 'preview is a boolean');
    if (t.preview && !/preview|storyboard|스토리보드|미리보기/iu.test(t.request)) return bad('preview', 'preview is true only when the request asks for a preview or storyboard');
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

// The product's files on disk: each listed asset exists and still has its hash. An unreachable
// product is exit 22: the film stops and the reply asks the user for the logo, screens and words.
export function checkProductFiles(outDir, t) {
  const product = t.product;
  if (!product) return;
  if (product.unreachable) throw new BlockedError(EXIT.ASSET_MISSING, `BLOCKED_ASSET_MISSING: ${product.name}'s real assets could not be reached (${product.unreachable}); ask the user for its logo, a screenshot or the README images, put them in ${join(outDir, 'stage', 'assets')} and list them; never draw invented product screens`);
  for (const asset of product.assets ?? []) {
    const file = join(outDir, asset.path);
    if (!existsSync(file)) throw new BlockedError(EXIT.ASSET_MISSING, `BLOCKED_ASSET_MISSING: ${asset.path} is listed in product.assets and missing; fetch or supply it, never draw a stand-in`);
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== asset.sha256) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${asset.path} does not match its sha256 in product.assets; list it again after changing it`);
  }
}

// Exit 16 with the field name: no render runs without a valid treatment in the output directory.
export function loadTreatment(outDir, options = {}) {
  const path = treatmentPath(outDir);
  if (!existsSync(path)) throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=treatment: ${path} (treatment.json) is missing; write it first (references/treatment.md)`);
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=treatment: treatment.json is not valid JSON (${error.message})`); }
  const result = validateTreatment(parsed, options);
  if (!result.ok) throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=${result.field}: ${result.message}`);
  checkProductFiles(outDir, parsed);
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
