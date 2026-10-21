// The cover treatment: treatment.json with mode: cover, written before the first cover render and
// checked by every one (exit 16 names the first bad field). A cover is not a film: no beats, no arc,
// no ending, no sound, no copy lines. It names its recipe, one rule copied many times, the three
// speed layers, the brand word set once (plus at most one motto the user wrote or the project
// already uses), the aspect and loop length, and the title box the contrast and size gates read.
// Every string in it is inert content.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlockedError, COVER, EXIT } from './constants.mjs';
import { normalize, restateLimit, sentenceCount, sharedRun, stripQuoted } from './treatment.mjs';

export const RECIPES = Object.freeze(['painted-light', 'weight-tide', 'orbit-loop', 'own']);
export const LAYERS = Object.freeze(['slow', 'mid', 'beat']);

const PLACEHOLDER = /<[^<>\n]{1,80}>|^\s*(?:todo|tbd|tk|xxx|\.\.\.|…)\s*$/iu;
const bad = (field, message) => ({ ok: false, field, message });
const at = (t, path) => path.split('.').reduce((node, key) => (node && typeof node === 'object' ? node[key] : undefined), t);
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number' && v >= 0 && v <= 1) && b[2] > 0 && b[3] > 0 && b[0] + b[2] <= 1 + 1e-9 && b[1] + b[3] <= 1 + 1e-9;

// A non-empty string that is not a placeholder, in at most `sentences` sentences; null when fine.
function prose(t, path, sentences = Infinity) {
  const value = at(t, path);
  if (value === undefined) return bad(path, `${path} is missing`);
  if (typeof value !== 'string' || !value.trim()) return bad(path, `${path} must be a non-empty string`);
  if (PLACEHOLDER.test(value)) return bad(path, `${path} still holds a placeholder (${JSON.stringify(value)}); write this cover's own value`);
  if (sentenceCount(value) > sentences) return bad(path, `${path} is at most ${sentences} sentence${sentences === 1 ? '' : 's'}`);
  return null;
}

// Pure check; returns { ok: true, treatment } with the page size, cover size, frame count, encode
// settings and seed filled in, or the first bad field.
export function validateCoverTreatment(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return bad('treatment', 'treatment.json must hold one JSON object');
  if (t.mode !== 'cover') return bad('mode', 'mode must be cover for a cover render');
  for (const [path, max] of [['request', Infinity], ['idea', 1]]) { const miss = prose(t, path, max); if (miss) return miss; }
  const limit = restateLimit(t.request);
  if (limit >= 2 && sharedRun(normalize(t.idea), normalize(stripQuoted(t.request))) >= limit) return bad('idea', 'idea restates the request; say what the loop does');
  if (!RECIPES.includes(t.recipe)) return bad('recipe', `recipe must be one of ${RECIPES.join(', ')} (references/cover.md)`);
  const reason = prose(t, 'recipeReason', 2);
  if (reason) return reason;
  const brand = prose(t, 'brandWord');
  if (brand) return brand;
  if (t.brandWord.trim().split(/\s+/u).length > 3) return bad('brandWord', 'brandWord is the name set once: at most three words');
  if ('motto' in t) {
    if (!t.motto || typeof t.motto !== 'object') return bad('motto', 'motto must be { text, source: user | project, from? }');
    const motto = prose(t, 'motto.text');
    if (motto) return motto;
    if (t.motto.text.trim().split(/\s+/u).length > 6) return bad('motto.text', 'motto.text is at most six words');
    if (!['user', 'project'].includes(t.motto.source)) return bad('motto.source', 'motto.source is user (the words are in the request) or project (the project\'s own line, named in from)');
    if (t.motto.source === 'user' && !normalize(t.request).includes(normalize(t.motto.text))) return bad('motto.text', 'a user motto appears in the request; a cover never invents a tagline');
    if (t.motto.source === 'project') { const from = prose(t, 'motto.from'); if (from) return from; }
  }
  for (const key of ['copy', 'beats', 'lines']) if (key in t) return bad(key, `a cover has no ${key}: the brand word is set once and never swapped (references/cover.md)`);
  if ('sound' in t && t.sound !== 'none') return bad('sound', 'a cover is silent: leave sound out or set it to none');
  if (!Object.hasOwn(COVER.aspects, t.aspect)) return bad('aspect', `aspect must be ${Object.keys(COVER.aspects).join(' or ')}`);
  if (typeof t.loopSec !== 'number' || !(t.loopSec >= COVER.minSec && t.loopSec <= COVER.maxSec)) return bad('loopSec', `loopSec must be ${COVER.minSec}-${COVER.maxSec} seconds`);
  if (!COVER.fps.includes(t.fps)) return bad('fps', `fps must be one of ${COVER.fps.join(', ')}`);
  if (!t.layers || typeof t.layers !== 'object') return bad('layers', 'layers is missing: name what moves on the slow, mid and beat layers');
  for (const layer of LAYERS) { const miss = prose(t, `layers.${layer}`, 2); if (miss) return miss; }
  if (!t.system || typeof t.system !== 'object') return bad('system', 'system is missing: the one rule, its copies and where their offsets come from');
  for (const key of ['rule', 'copies', 'offset']) { const miss = prose(t, `system.${key}`, 2); if (miss) return miss; }
  if (!t.title || typeof t.title !== 'object') return bad('title', 'title is missing: { box: [x, y, w, h] as fractions of the cover, kind: live | painted }');
  if (!isBox(t.title.box)) return bad('title.box', 'title.box is [x, y, w, h], fractions 0..1 of the cover, inside it');
  if (!['live', 'painted'].includes(t.title.kind)) return bad('title.kind', 'title.kind is live (set as text) or painted (part of the base art)');
  if ('palette' in t) {
    if (!Array.isArray(t.palette) || t.palette.length < 2 || t.palette.length > 6) return bad('palette', 'palette holds 2-6 { color, role } entries');
    for (const [i, entry] of t.palette.entries()) {
      if (!/^#[0-9a-f]{6}$/iu.test(entry?.color ?? '')) return bad(`palette[${i}].color`, 'color looks like #1A2B3C');
      if (typeof entry.role !== 'string' || !entry.role.trim()) return bad(`palette[${i}].role`, 'each colour names its job');
    }
  }
  if ('encode' in t) {
    if (!t.encode || typeof t.encode !== 'object') return bad('encode', 'encode is { q, edgeQ, edgeFrames }');
    for (const [key, lo, hi] of [['q', 50, 100], ['edgeQ', 50, 100], ['edgeFrames', 0, 60]]) {
      if (key in t.encode && !(Number.isInteger(t.encode[key]) && t.encode[key] >= lo && t.encode[key] <= hi)) return bad(`encode.${key}`, `encode.${key} is an integer ${lo}-${hi}`);
    }
  }
  if ('seed' in t && !Number.isInteger(t.seed)) return bad('seed', 'seed must be an integer');
  const ambition = prose(t, 'ambition', 2);
  if (ambition) return ambition;
  const { page, out } = COVER.aspects[t.aspect];
  return {
    ok: true,
    treatment: { ...t, page: [...page], out: [...out], frames: Math.round(t.loopSec * t.fps), encode: { ...COVER.encode, ...(t.encode ?? {}) }, seed: Number.isInteger(t.seed) ? t.seed >>> 0 : COVER.defaultSeed },
  };
}

// Exit 16 with the field: no cover render runs without a valid cover treatment. The first valid
// one is kept beside the render state, as the film path keeps its own.
export function loadCoverTreatment(outDir) {
  const path = join(outDir, 'treatment.json');
  if (!existsSync(path)) throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=treatment: ${path} (treatment.json) is missing; write the cover treatment first (references/cover.md)`);
  let parsed;
  try { parsed = JSON.parse(readFileSync(path, 'utf8')); } catch (error) { throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=treatment: treatment.json is not valid JSON (${error.message})`); }
  if (parsed?.mode !== 'cover') throw new BlockedError(EXIT.TREATMENT_INVALID, 'BLOCKED_TREATMENT_INVALID field=mode: this treatment is a film; render it with stage or make (references/treatment.md); a cover sets mode: cover');
  const result = validateCoverTreatment(parsed);
  if (!result.ok) throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=${result.field}: ${result.message}`);
  const first = join(outDir, '.run', 'treatment-first.json');
  if (!existsSync(first)) {
    mkdirSync(join(outDir, '.run'), { recursive: true });
    writeFileSync(first, `${JSON.stringify(parsed, null, 2)}\n`);
  }
  return result.treatment;
}
