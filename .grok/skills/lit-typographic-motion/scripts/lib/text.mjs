// Text rules that decide timing and type before any frame exists: punctuation, script runs,
// 어절 breaks, the reading floor and the preset auto-pick.
import { TIMING } from './constants.mjs';

// MO-A-34, adapted from pdoom-video app/src/engine/type.ts (MIT, see NOTICE).
export function smart(text) {
  return String(text)
    .replace(/\.\.\./g, '…')
    .replace(/(^|[\s([{—–-])'(?=(?:cause|cos|til|em|round|n|tis|twas|\d0s)\b)/gi, '$1’')
    .replace(/(^|[\s([{—–-])'/g, '$1‘')
    .replace(/'/g, '’')
    .replace(/(^|[\s([{—–-])"/g, '$1“')
    .replace(/"/g, '”');
}

export const plain = (text) => String(text).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...');

export function isHangul(char) {
  const code = char.codePointAt(0);
  return (code >= 0xac00 && code <= 0xd7a3) || (code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f)
    || (code >= 0xa960 && code <= 0xa97f) || (code >= 0xd7b0 && code <= 0xd7ff);
}
export const isHangulSyllable = (char) => { const code = char.codePointAt(0); return code >= 0xac00 && code <= 0xd7a3; };
const isLatinLetter = (char) => /\p{Script=Latin}/u.test(char);

function charClass(char) {
  if (isHangul(char)) return 'hangul';
  if (isLatinLetter(char)) return 'latin';
  return null; // digits, punctuation and spaces attach to a neighbouring run
}

// MO-FT-04: runs split exactly at the script boundary. A neutral character joins the run on its
// left; with nothing on the left it joins the run on its right. An all-neutral string is Latin.
export function scriptRuns(text) {
  const chars = Array.from(String(text));
  const classes = chars.map(charClass);
  let firstScript = classes.find(Boolean) ?? 'latin';
  let current = null;
  const resolved = classes.map((kind) => {
    if (kind) { current = kind; return kind; }
    return current ?? firstScript;
  });
  const runs = [];
  chars.forEach((char, index) => {
    const script = resolved[index];
    const last = runs.at(-1);
    if (last && last.script === script) last.text += char;
    else runs.push({ script, text: char, start: index });
  });
  for (const run of runs) run.end = run.start + Array.from(run.text).length;
  return runs;
}

export function scriptOf(text) {
  const kinds = new Set(Array.from(String(text)).map(charClass).filter(Boolean));
  if (kinds.has('hangul') && kinds.has('latin')) return 'mixed';
  return kinds.has('hangul') ? 'hangul' : 'latin';
}

// MO-A-13 / MO-FT-05: a line break or reveal step never splits a 어절 (whitespace-delimited unit).
export const eojeol = (text) => String(text).trim().split(/\s+/u).filter(Boolean);

export function countUnits(text) {
  const value = String(text);
  const hangul = Array.from(value).filter(isHangulSyllable).length;
  const words = (value.match(/[\p{Script=Latin}0-9'’-]+/gu) ?? []).filter((word) => /[\p{Script=Latin}0-9]/u.test(word)).length;
  const latinChars = scriptRuns(value).filter((run) => run.script === 'latin').reduce((sum, run) => sum + Array.from(run.text).length, 0);
  return { hangul, words, latinChars };
}

// MO-C-07/08: one floor function for every timeline unit.
export function readingFloor(text, kind = 'line') {
  if (kind === 'reveal') return TIMING.revealFloor;
  const { hangul, words } = countUnits(text);
  const rate = TIMING.secondsPerHangulSyllable * hangul + words / TIMING.latinWordsPerSecond;
  if (kind === 'word') return Math.max(TIMING.wordFloor, rate);
  return Math.max(hangul > 0 ? TIMING.hangulLineFloor : TIMING.latinLineFloor, rate);
}

// MO-B-00: whole-word keywords, first matching row wins; an explicit style always wins.
const PRESET_ROWS = Object.freeze([
  { preset: 'terminalcore', hangul: ['터미널', '해커'], latin: ['crt', 'terminal', 'hacker'] },
  { preset: 'tidal', hangul: ['물결', '파도', '잔잔한', '흐름'], latin: ['gradient', 'wave', 'tide', 'calm'] },
]);
export const PRESET_IDS = Object.freeze(['swiss-signal', 'terminalcore', 'tidal']);

function hangulKeywordAt(text, keyword) {
  let index = text.indexOf(keyword);
  while (index >= 0) {
    const before = index === 0 ? '' : Array.from(text.slice(0, index)).at(-1);
    if (!before || !/[\p{L}\p{N}]/u.test(before)) return true;
    index = text.indexOf(keyword, index + 1);
  }
  return false;
}

// An explicit style counts as user-specified only when the user's own request names it (the id or
// one of its MO-B-00 keywords); a style the agent picked is labelled "agent default".
export function autoPickPreset(text, explicit, request = null) {
  if (explicit) {
    if (!PRESET_IDS.includes(explicit)) throw new Error(`unknown style "${explicit}"; use one of ${PRESET_IDS.join(', ')}`);
    const row = PRESET_ROWS.find((r) => r.preset === explicit);
    const asked = request !== null && (String(request).toLowerCase().includes(explicit) || Boolean(row && (row.latin.some((w) => new RegExp(`(?<![\\p{L}\\p{N}])${w}(?![\\p{L}\\p{N}])`, 'iu').test(request)) || row.hangul.some((w) => hangulKeywordAt(String(request), w)))));
    return { preset: explicit, reason: asked ? 'user-specified' : 'agent default' };
  }
  const value = String(text ?? '');
  for (const row of PRESET_ROWS) {
    const latin = row.latin.find((word) => new RegExp(`(?<![\\p{L}\\p{N}])${word}(?![\\p{L}\\p{N}])`, 'iu').test(value));
    if (latin) return { preset: row.preset, reason: `brief mentions "${latin}" (MO-B-00 row ${row.preset})` };
    const hangul = row.hangul.find((word) => hangulKeywordAt(value, word));
    if (hangul) return { preset: row.preset, reason: `brief mentions "${hangul}" (MO-B-00 row ${row.preset})` };
  }
  return { preset: 'swiss-signal', reason: 'no MO-B-00 keyword matched; swiss-signal is the default' };
}
