// Font pins, cache paths and the pre-flight checks that run before the first frame: every required
// font present with its pinned sha256 (exit 15), and every codepoint of the brief covered by the
// cmap of the font its script run resolves to (MO-D-04).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scriptRuns } from './text.mjs';

export const SKILL_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const PINS = JSON.parse(readFileSync(join(SKILL_ROOT, 'fonts', 'pins.json'), 'utf8'));
export const LOCKFILE = join(SKILL_ROOT, 'package-lock.json');

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const lockHash = () => sha256(readFileSync(LOCKFILE));

// ${XDG_CACHE_HOME:-~/.cache}/litgrok/motion-runtime for both install scopes (MO-A-53), keyed by the
// lockfile digest the way the office cache is. LITGROK_MOTION_CACHE (absolute) overrides the base.
export function cacheBase(env = process.env) {
  if (env.LITGROK_MOTION_CACHE) {
    if (!isAbsolute(env.LITGROK_MOTION_CACHE)) throw new Error('LITGROK_MOTION_CACHE must be an absolute path');
    return env.LITGROK_MOTION_CACHE;
  }
  const home = env.HOME || homedir();
  return join(env.XDG_CACHE_HOME || join(home, '.cache'), 'litgrok', 'motion-runtime');
}
export const cacheRoot = (env = process.env) => join(cacheBase(env), lockHash().slice(0, 16));

export function fontPath(key, env = process.env) {
  const pin = PINS.fonts[key];
  if (!pin) throw new Error(`unknown font key ${key}`);
  return pin.source === 'fetched' ? join(cacheRoot(env), 'fonts', pin.file) : join(SKILL_ROOT, pin.file);
}

export function licencePath(licence, pin, env = process.env) {
  return pin.source === 'fetched' ? join(cacheRoot(env), 'fonts', licence.file) : join(SKILL_ROOT, licence.file);
}

// Reused lit-pptx files are checked against LitGrok's own recorded hashes (MO-A-55); when they are
// absent, the pinned official Pretendard fetched at pre-warm stands in for both weights.
export function resolveFontKey(key, env = process.env) {
  const pin = PINS.fonts[key];
  if (pin?.source === 'reused' && !existsSync(fontPath(key, env)) && pin.fallback) return pin.fallback;
  return key;
}

export function fontState(key, env = process.env) {
  const resolved = resolveFontKey(key, env);
  const pin = PINS.fonts[resolved];
  const path = fontPath(resolved, env);
  if (!existsSync(path)) return { key, resolved, path, state: 'missing' };
  if (sha256(readFileSync(path)) !== pin.sha256) return { key, resolved, path, state: 'hash mismatch' };
  const licences = pin.licence.map((licence) => {
    const file = licencePath(licence, pin, env);
    if (!existsSync(file)) return { file, state: 'missing' };
    if (licence.sha256 && sha256(readFileSync(file)) !== licence.sha256) return { file, state: 'hash mismatch' };
    return { file, state: 'ready' };
  });
  const bad = licences.find((licence) => licence.state !== 'ready');
  if (bad) return { key, resolved, path, state: `licence ${bad.state}: ${bad.file}` };
  return { key, resolved, path, state: 'ready' };
}

// Minimal sfnt cmap reader (formats 4 and 12) for TrueType and CFF-flavoured OpenType files.
export function cmapCoverage(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = view.getUint16(4);
  let cmapOffset = -1;
  for (let i = 0; i < tables; i += 1) {
    const record = 12 + i * 16;
    const tag = String.fromCharCode(bytes[record], bytes[record + 1], bytes[record + 2], bytes[record + 3]);
    if (tag === 'cmap') cmapOffset = view.getUint32(record + 8);
  }
  if (cmapOffset < 0) throw new Error('font has no cmap table');
  const subtables = view.getUint16(cmapOffset + 2);
  const candidates = [];
  for (let i = 0; i < subtables; i += 1) {
    const record = cmapOffset + 4 + i * 8;
    const platform = view.getUint16(record), encoding = view.getUint16(record + 2);
    const offset = cmapOffset + view.getUint32(record + 4);
    const format = view.getUint16(offset);
    if ((platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0) candidates.push({ format, offset });
  }
  candidates.sort((a, b) => (b.format === 12) - (a.format === 12));
  const table = candidates.find((c) => c.format === 12 || c.format === 4);
  if (!table) throw new Error('font has no Unicode cmap (format 4 or 12)');
  const ranges = [];
  if (table.format === 12) {
    const groups = view.getUint32(table.offset + 12);
    for (let i = 0; i < groups; i += 1) {
      const g = table.offset + 16 + i * 12;
      ranges.push([view.getUint32(g), view.getUint32(g + 4), view.getUint32(g + 8)]);
    }
    return (code) => ranges.some(([start, end, glyph]) => code >= start && code <= end && glyph + (code - start) !== 0);
  }
  const segX2 = view.getUint16(table.offset + 6);
  const segments = segX2 / 2;
  const ends = table.offset + 14, starts = ends + segX2 + 2, deltas = starts + segX2, rangeOffsets = deltas + segX2;
  return (code) => {
    if (code > 0xffff) return false;
    for (let i = 0; i < segments; i += 1) {
      const end = view.getUint16(ends + i * 2);
      if (code > end) continue;
      const start = view.getUint16(starts + i * 2);
      if (code < start) return false;
      const delta = view.getInt16(deltas + i * 2);
      const rangeOffset = view.getUint16(rangeOffsets + i * 2);
      if (rangeOffset === 0) return ((code + delta) & 0xffff) !== 0;
      const glyphAddress = rangeOffsets + i * 2 + rangeOffset + (code - start) * 2;
      const glyph = view.getUint16(glyphAddress);
      return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
    }
    return false;
  };
}

export function strokeCoverage(svgText) {
  const chars = new Set([' ']);
  for (const match of svgText.matchAll(/<glyph[^>]*\sunicode="([^"]*)"/g)) {
    const value = match[1].replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec))).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'");
    chars.add(value);
  }
  return (code) => chars.has(String.fromCodePoint(code));
}

const coverageCache = new Map();
export function coverageFor(key, env = process.env) {
  const resolved = resolveFontKey(key, env);
  if (!coverageCache.has(resolved)) {
    const bytes = readFileSync(fontPath(resolved, env));
    coverageCache.set(resolved, PINS.fonts[resolved].kind === 'stroke' ? strokeCoverage(bytes.toString('utf8')) : cmapCoverage(new Uint8Array(bytes)));
  }
  return coverageCache.get(resolved);
}

// Which font draws each character of `text` under a voice pair (MO-FT-04 run classification).
export function missingGlyphs(text, pair, env = process.env) {
  const missing = [];
  for (const run of scriptRuns(text)) {
    const key = run.script === 'hangul' ? (pair.hangul ?? pair.latin) : (pair.latin ?? pair.hangul);
    if (!key) { missing.push({ char: run.text, font: '(no font for this script)' }); continue; }
    const covers = coverageFor(key, env);
    for (const char of new Set(Array.from(run.text))) {
      if (char === '\n') continue;
      if (!covers(char.codePointAt(0))) missing.push({ char, codepoint: `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`, font: PINS.fonts[resolveFontKey(key, env)].family });
    }
  }
  return missing;
}
