// The synthwave LIT mark for the installer frame and `--help`. It is terminal art for people only:
// hook output, activation lines and anything the model reads never carry it.
import { MONO_ROWS, PIXEL_ROWS, SHARED_COLOURS } from './lit-synthwave-rows.mjs';

export const HOST = 'grok build';
export const PLAIN_LINE = `LIT · ${HOST}`;
// LitGrok's chrome: lilac at the top of each letter down to deep violet at the base.
export const CHROME = Object.freeze(['#f5e8ff', '#d8b4fe', '#8b5cf6', '#ffffff', '#c4b5fd', '#5b21b6']);
const TAGLINE = Object.freeze(['#8be9fd', '#ff2d95', '#ffd23f']);
const EDGE = '#ffffff';
// Widest first; a terminal narrower than the last one gets the plain line.
const LADDER = Object.freeze([['B-L', 76], ['B-M', 44], ['B-S', 24]]);

const channels = (hex) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));

// Piecewise-linear sample of a stop list at t in 0..1, as [r, g, b].
export function sampleStops(stops, t) {
  const spans = stops.length - 1;
  const index = Math.min(spans - 1, Math.floor(t * spans));
  const fraction = t * spans - index;
  const from = channels(stops[index]);
  const to = channels(stops[index + 1]);
  return from.map((value, at) => Math.round(value + (to[at] - value) * fraction));
}

function pixel(symbol) {
  if (symbol === ' ') return null;
  if (symbol >= 'a' && symbol <= 'l') return sampleStops(CHROME, (symbol.charCodeAt(0) - 97) / 11);
  if (symbol === 'm') return channels(EDGE);
  return Object.hasOwn(SHARED_COLOURS, symbol) ? channels(SHARED_COLOURS[symbol]) : null;
}

function code(rgb, layer, mode) {
  const base = layer === 'fg' ? 38 : 48;
  if (mode === 'truecolor') return `${base};2;${rgb.join(';')}`;
  const [r, g, b] = rgb.map((value) => Math.round((value / 255) * 5));
  return `${base};5;${16 + 36 * r + 6 * g + b}`;
}

function cell(glyph, fg, bg, mode) {
  const codes = [fg && code(fg, 'fg', mode), bg && code(bg, 'bg', mode)].filter(Boolean);
  return codes.length ? `\u001b[${codes.join(';')}m${glyph}\u001b[0m` : glyph;
}

const same = (left, right) => left === right || (left !== null && right !== null && left.every((value, at) => value === right[at]));

// Two pixel rows make one terminal row: ▀ takes the upper pixel as ink and the lower as paper.
function paintedRows(size, mode) {
  const rows = PIXEL_ROWS[size];
  const out = [];
  for (let y = 0; y < rows.length; y += 2) {
    let line = '';
    for (let x = 0; x < rows[y].length; x += 1) {
      const upper = pixel(rows[y][x]);
      const lower = pixel(rows[y + 1][x]);
      if (same(upper, lower)) line += upper ? cell(' ', null, upper, mode) : ' ';
      else if (upper === null) line += cell('▄', lower, null, mode);
      else line += cell('▀', upper, lower, mode);
    }
    out.push(line);
  }
  return out;
}

function taglineRow(columns, mode) {
  const pad = ' '.repeat(Math.max(0, Math.floor((columns - PLAIN_LINE.length) / 2)));
  if (mode === 'mono') return `${pad}${PLAIN_LINE}`;
  const glyphs = [...PLAIN_LINE];
  return pad + glyphs.map((glyph, at) => (glyph === ' ' ? glyph : cell(glyph, sampleStops(TAGLINE, at / (glyphs.length - 1)), null, mode))).join('');
}

// The size that fits the terminal, or null for the plain line. An unknown width counts as 80.
export function synthwaveSize(columns) {
  const cells = Number.isFinite(columns) && columns > 0 ? columns : 80;
  return LADDER.find(([, minimum]) => cells >= minimum)?.[0] ?? null;
}

/**
 * The mark's rows for a terminal `columns` wide. `mode` is 'truecolor' or '256' (painted pixels),
 * 'mono' (the scene in plain glyphs, no escapes) or 'plain' (the one text line).
 */
export function synthwaveRows({ columns, mode = 'mono' } = {}) {
  const size = synthwaveSize(columns);
  if (mode === 'plain' || size === null) return [PLAIN_LINE];
  const resolved = mode === 'truecolor' || mode === '256' ? mode : 'mono';
  const art = resolved === 'mono' ? [...MONO_ROWS[size]] : paintedRows(size, resolved);
  return [...art, taglineRow(PIXEL_ROWS[size][0].length, resolved)];
}
