// Canonical rows and cell colors are generated from pinned Ignition B; do not edit glyphs.
// BEGIN CANONICAL ROWS
export const standard = Object.freeze([
  "          ▄▖  ▄█▄     ",
  "▗▄▄▖    ▄██▌  ▜█▛     ",
  "▐██▌  ▄████████████▜▛ ",
  "▐██▌ ▐█▀▀▀▀▀▀▀▀▀▀▀▀▘  ",
  "▐██▌   ▄█▌█████████▌  ",
  "▐██▌ ▄██▛▘  ▗▄▄  ▗    ",
  "▐██▌▐█▛▘    ▐██  ▝▀   ",
  "▐██▌▝       ▐██       ",
  "▐██████▘    ▐██       ",
  "▝▀▀▀▀▀      ▝▀▀       "
]);

export const banner = Object.freeze([
  "                             ▄▄▄▄           ",
  "                   ▗███▌   ▗██████▖         ",
  " ▗▄▄▄▄▄          ▗▟████▌   ▝██████▘         ",
  " ▐█████        ▗▟██████▌    ▝▀▜█▀▘          ",
  " ▐█████      ▗▟███████▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄  ",
  " ▐█████    ▗▟█████████████████████████ ▐█▀  ",
  " ▐█████    ████████████████████████████▀    ",
  " ▐█████    ██▛▘   ▄ ▄▄▄▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▖     ",
  " ▐█████    ▀    ▄██ ████▌█████████████▌     ",
  " ▐█████       ▄████ ████▌█████████████▌     ",
  " ▐█████     ▄█████▛                         ",
  " ▐█████  ▗▟█████▀▘       ▄▄▄▄▄     ▗▖       ",
  " ▐█████ ▐█████▀          █████     ▐▛▀      ",
  " ▐█████ ▐███▀            █████              ",
  " ▐█████ ▐█▀              █████              ",
  " ▐█████ ▝                █████              ",
  " ▐█████▄▄▄▄▄▄▄▖          █████              ",
  " ▐███████████▛           █████              ",
  " ▐██████████▀            █████              ",
  "                                            "
]);

export const micro = Object.freeze([
  "▗▖  ▄▄ █▌       ",
  "▐▌▗█▀▀▀▀▀▀▘     ",
  "▐▌ ▄▌▀▝▀▀▘      ",
  "▐▌▛▘  ▐▌        ",
  "▝▀▀▘  ▝▘        "
]);

const COLOR_KEYS = Object.freeze({
  standard: Object.freeze([
    "..........II..LLL.....",
    "OOOO....IIII..LLL.....",
    "OOOO..IIIIOOOOOOOOOOO.",
    "OOOO.IIIOOOOOOOOOOOO..",
    "OOOO...IIILLLIIIIIII..",
    "OOOO.IIIII..III..I....",
    "OOOOIIII....III..II...",
    "OOOOI.......III.......",
    "OOOOOOOO....III.......",
    "OOOOOO......III......."
  ]),
  banner: Object.freeze([
    ".............................LLLL...........",
    "...................IIIII...LLLLLLLL.........",
    ".OOOOOO..........IIIIIII...LLLLLLLL.........",
    ".OOOOOO........IIIIIIIII....LLLLLL..........",
    ".OOOOOO......IIIIIIIIIOOOOOOOOOOOOOOOOOOOO..",
    ".OOOOOO....IIIIIIIIOOOOOOOOOOOOOOOOOOO.OOO..",
    ".OOOOOO....IIIIIIOOOOOOOOOOOOOOOOOOOOOOO....",
    ".OOOOOO....IIII...I.LLLLLIIIIIIIIIIIIII.....",
    ".OOOOOO....I....III.LLLLLIIIIIIIIIIIIII.....",
    ".OOOOOO.......IIIII.LLLLLIIIIIIIIIIIIII.....",
    ".OOOOOO.....IIIIIII.........................",
    ".OOOOOO..IIIIIIIII.......IIIII.....II.......",
    ".OOOOOO.IIIIIII..........IIIII.....III......",
    ".OOOOOO.IIIII............IIIII..............",
    ".OOOOOO.III..............IIIII..............",
    ".OOOOOO.I................IIIII..............",
    ".OOOOOOOOOOOOOO..........IIIII..............",
    ".OOOOOOOOOOOOO...........IIIII..............",
    ".OOOOOOOOOOOO............IIIII..............",
    "............................................"
  ]),
  micro: Object.freeze([
    "OO..II.LL.......",
    "OOIIIOOOOOO.....",
    "OO.IILIIII......",
    "OOII..II........",
    "OOOO..II........"
  ]),
});
// END CANONICAL ROWS

const MARK_GLYPHS = new Set('█▀▄▌▐▖▗▘▝▙▛▜▟▚▞');
const RESET = '\x1b[0m';
const PALETTE = Object.freeze({ O: '255;99;55', L: '215;247;91', I: '242;239;223' });
const INDEXED_PALETTE = Object.freeze({ O: 203, L: 191, I: 230 });

function productLabel(productName) {
  if (typeof productName !== 'string' || !/^[\p{L}\p{N} .·-]{1,80}$/u.test(productName)) throw new TypeError('Invalid product name');
  return productName;
}

export function lockup(productName) {
  const label = productLabel(productName);
  return standard.map((row, index) => row.padEnd(28) + (index === 5 ? `  ${label}` : ''));
}

// The psychedelic rewind hue for the lit-adhd card and ignition mark: one hue at a time at a
// steady lightness, so the card never flashes. `motion` is 'full' (a 24-second hue cycle),
// 'subtle' (a slow 96-second drift) or 'off' (one still rainbow frame). Returns [r, g, b].
export function rewindHue(nowMs, motion = 'full') {
  return hueToRgb(rewindBaseAngle(nowMs, motion));
}

// One full wheel across a run of `total` cells, so each cell of a pill or mark takes its own
// step round the wheel at the same steady lightness. Colour moves only on fixed glyphs.
export function rewindCellRgb(nowMs, motion, index, total) {
  const base = rewindBaseAngle(nowMs, motion);
  const step = total > 1 ? 360 / total : 0;
  return hueToRgb((((base + step * index) % 360) + 360) % 360);
}

function rewindBaseAngle(nowMs, motion = 'full') {
  if (motion !== 'subtle' && motion !== 'off' && motion !== 'full') motion = 'full';
  const time = Number.isFinite(nowMs) ? nowMs : 0;
  const hue = motion === 'off' ? 280 : (((time % 96_000) + 96_000) % 96_000) / 96_000 * 360;
  const period = motion === 'subtle' ? 1 : 4;
  return (((hue * period) % 360) + 360) % 360;
}

function hueToRgb(angle) {
  const saturation = 0.85;
  const lightness = 0.62;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const part = chroma * (1 - Math.abs(((angle / 60) % 2) - 1));
  const match = lightness - chroma / 2;
  let red;
  let green;
  let blue;
  if (angle < 60) [red, green, blue] = [chroma, part, 0];
  else if (angle < 120) [red, green, blue] = [part, chroma, 0];
  else if (angle < 180) [red, green, blue] = [0, chroma, part];
  else if (angle < 240) [red, green, blue] = [0, part, chroma];
  else if (angle < 300) [red, green, blue] = [part, 0, chroma];
  else [red, green, blue] = [chroma, 0, part];
  const channel = (value) => Math.max(0, Math.min(255, Math.round((value + match) * 255)));
  return [channel(red), channel(green), channel(blue)];
}

export function colorize(rows, { mode = 'none' } = {}) {
  if (!['truecolor', '256', 'none'].includes(mode)) throw new TypeError('Invalid color mode');
  if (mode === 'none') return [...rows];
  const variants = { standard, banner, micro };
  const variant = Object.keys(variants).find((name) => rows.length === variants[name].length && rows.every((row, index) => row.startsWith(variants[name][index])));
  return rows.map((row, index) => {
    return [...row].map((glyph, column) => {
      if (!MARK_GLYPHS.has(glyph)) return glyph;
      const key = variant ? COLOR_KEYS[variant][index][column] : 'I';
      if (!Object.hasOwn(PALETTE, key)) return glyph;
      const foreground = mode === '256' ? `\x1b[38;5;${INDEXED_PALETTE[key]}m` : `\x1b[38;2;${PALETTE[key]}m`;
      return `${foreground}${glyph}${RESET}`;
    }).join('');
  });
}

function unicodeTerminal(env) {
  return env.TERM !== 'dumb' && /utf-?8/iu.test(env.LC_ALL || env.LC_CTYPE || env.LANG || '');
}

export function terminalMode({ env = process.env, isTTY = process.stdout.isTTY, args = [] } = {}) {
  if (!isTTY || Object.hasOwn(env, 'NO_COLOR') || Object.hasOwn(env, 'CI') || args.includes('--json') || args.includes('--no-color') || !unicodeTerminal(env)) return 'none';
  return /truecolor|24bit/iu.test(env.COLORTERM || '') ? 'truecolor' : '256';
}

export function renderMark({ size = 'standard', productName, env = process.env, isTTY = process.stdout.isTTY, args = [] } = {}) {
  if (!Object.hasOwn({ standard, banner, micro }, size)) throw new TypeError('Invalid mark size');
  const label = productName === undefined ? undefined : productLabel(productName);
  if (!unicodeTerminal(env)) return label ? ['LIT', label] : ['LIT'];
  const rows = { standard, banner, micro }[size];
  const painted = colorize(rows, { mode: terminalMode({ env, isTTY, args }) });
  if (!label) return painted;
  const width = size === 'banner' ? 50 : size === 'standard' ? 28 : 16;
  const labelRow = size === 'banner' ? 10 : size === 'standard' ? 5 : 2;
  return painted.map((row, index) => row + ' '.repeat(width - rows[index].length) + (index === labelRow ? `  ${label}` : ''));
}
