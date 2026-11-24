// The status line's sunset: a half-sunk sun, stars, now and then a shooting star, and a sea, painted over
// cells no text uses. It takes finished lines and gives back as many: a word, a colour or a column is never
// moved, and a line never grows past Grok's 1024-character cut. Grok redraws about every 300 ms in a turn, so
// the motion is stepped: each run draws the scene for its own clock. Between turns `seconds` is null and the
// scene stands still. The sun's shape never moves; its light does, and the sea and stars change ASCII marks.

const MAX_LINE_CHARACTERS = 1024;
const RESET = '\u001b[0m';
// No light is drawn this close to a word.
const CLEAR = 3;
// A card keeps these cells free for its right edge (tool counts, the turn's timer, the tool in flight), so a
// sun over several rows does not blink as they come and go.
const RIGHT_EDGE = 28;
// The most a sun row can add: five colour runs over the slit's fill, its eighteen cells and a reset.
const SUN_ROW_CHARACTERS = 210;
const HEAT_CELLS = 4;
const SEA_CELLS = 3;
// The widest sea needs no more than this from the sun, so a wide row costs no more than a narrow one.
const SEA_REACH = 44;
const FAINT = [48, 54, 61];
const SLIT = [26, 16, 48];
const WHITE = [255, 255, 255];
const INK = [[[255, 210, 74], [255, 240, 160]], [[255, 143, 60], [255, 193, 90]], [[255, 45, 138], [255, 107, 143]]];
const SEA = [[255, 220, 115], [255, 154, 74], [255, 79, 139], [180, 87, 214], [90, 70, 168]];
// YOUR TURN keeps its amber.
const AMBER_INK = [[[255, 201, 90], [255, 240, 184]], [[255, 175, 60], [255, 217, 138]], [[224, 138, 30], [255, 185, 90]]];
const AMBER_SEA = [[255, 217, 138], [255, 175, 60], [224, 138, 30], [154, 100, 32], [90, 80, 64]];
// [row of three, cells from the sun's left edge]
const STARS = [[0, -30], [1, -24], [0, -18], [1, -13], [0, -9], [1, -5], [0, 22], [1, 25], [0, 29], [1, 32], [0, 35]];

/** `from` blended toward `to`, in eight steps so that neighbours share a colour. */
export function blend(from, to, amount) {
  const share = Math.max(0, Math.min(8, Math.round(amount * 8))) / 8;
  return from.map((value, at) => Math.round(value + (to[at] - value) * share));
}

const ink = (rgb) => `\u001b[38;2;${rgb.join(';')}m`;
const paper = (rgb) => `\u001b[48;2;${rgb.join(';')}m`;

// The dome in eighth blocks, `rows` high: eight cells wide for one row, twelve for two, eighteen for three.
export function sunShape(rows) {
  const wide = rows === 1 ? 8 : rows * 6;
  return Array.from({ length: rows }, (_, row) => Array.from({ length: wide }, (__, cell) => {
    const across = (cell - (wide - 1) / 2) / (wide / 2);
    const fill = Math.max(0, Math.min(8, Math.round(Math.sqrt(1 - across * across) * rows * 8) - (rows - 1 - row) * 8));
    if (fill === 0) return null;
    if (fill < 8) return { glyph: '▁▂▃▄▅▆▇'[fill - 1], slit: false };
    // A thin dark slit tops the second row and a thicker one the third.
    return row === 0 ? { glyph: '█', slit: false } : { glyph: row === 1 ? '▇' : '▆', slit: true };
  }));
}

// A line as one entry per column; a wide character's second column is null, and `before` holds the escapes that
// come first. A column is free when it is a space no colour or fill is open over.
function columnsOf(line, cellWidth) {
  const columns = [];
  let before = '';
  let open = false;
  for (const [, escape, character] of line.matchAll(/(\u001b\[[0-9;]*m)|(.)/gsu)) {
    if (escape) {
      before += escape;
      open = escape !== RESET;
      continue;
    }
    const cells = cellWidth(character);
    if (cells === 0) {
      const last = columns.findLast(Boolean);
      if (last) last.text += character;
      continue;
    }
    columns.push({ before, text: character, free: character === ' ' && !open });
    if (cells === 2) columns.push(null);
    before = '';
  }
  return { columns, tail: before };
}

// The line with its painted cells in place. A run of equal colour carries one escape, and a colour with no fill
// stays open across free cells.
function compose({ columns, tail }, painted) {
  const last = Math.max(columns.length - 1, ...painted.keys());
  let out = '';
  let style = '';
  let filled = false;
  const close = () => {
    if (style) out += RESET;
    style = '';
    filled = false;
  };
  for (let at = 0; at <= last; at += 1) {
    if (at === columns.length && tail) {
      close();
      out += tail;
    }
    const column = at < columns.length ? columns[at] : { before: '', text: ' ', free: true };
    if (column === null) continue;
    const cell = painted.get(at);
    if (column.before || (!column.free && !cell)) close();
    out += column.before;
    if (!cell) {
      if (filled) close();
      out += column.text;
      continue;
    }
    if (cell.style !== style) {
      if (filled && !cell.filled) close();
      out += cell.style;
      style = cell.style;
      filled = Boolean(cell.filled);
    }
    out += cell.text;
  }
  close();
  return last < columns.length ? `${out}${tail}` : out;
}

// The sea's light `from` cells off the middle of the sun: waves that run outward, brightest near it. Its colour
// comes in short runs; its marks change cell by cell.
function seaCell(from, time, sea) {
  const level = (at) => {
    const far = Math.abs(at);
    return (Math.sin(far * 0.62 - time * 2.3) + 0.8 * Math.sin(at * 0.31 + time * 1.1) + 0.6 * Math.sin(at * 1.37 - time * 0.7)) * 0.62 + 1.05 - far / 34;
  };
  const here = level(from);
  if (here < 0.22) return null;
  const block = Math.sign(from) * (Math.floor(Math.abs(from) / SEA_CELLS) + 0.5) * SEA_CELLS;
  const hue = Math.min(3.99, Math.abs(block) / 13);
  const base = blend(sea[Math.floor(hue)], sea[Math.floor(hue) + 1], hue % 1);
  return { text: here > 1 ? '~' : here > 0.55 ? '-' : '.', rgb: blend(FAINT, base, Math.max(0.35, Math.min(1, 0.18 + level(block) * 0.55))) };
}

// Where the sun stands on the last `rows` lines, or null when it has no room: no text within two cells of it (three for a one-row sun, which shares its row), and
// no line so full of escapes that the sun would pass the cut. Over several rows its place is fixed by the width; a
// one-row sun moves right to stand clear of the row's text.
function sunPlace(lines, grids, rows, maxCells) {
  const wide = sunShape(rows)[0].length;
  const under = grids.slice(-rows);
  const bare = lines.slice(-rows);
  const margin = rows > 1 ? 2 : CLEAR;
  const clear = (at) => at >= margin && at + wide + margin <= maxCells && under.every(({ columns }, row) => (
    // Spaces out to the sun count toward the cut too.
    bare[row].length + columns.slice(0, at).filter((column) => column?.extra).length + SUN_ROW_CHARACTERS <= MAX_LINE_CHARACTERS
    && columns.slice(at - margin, at + wide + margin).every((column) => column?.free)));
  if (rows > 1) {
    const at = Math.min(Math.round(maxCells * 0.62), maxCells - wide - RIGHT_EDGE);
    return clear(at) ? at : null;
  }
  for (let at = Math.round(maxCells * 0.62); at + wide + margin <= maxCells; at += 1) if (clear(at)) return at;
  return null;
}

/**
 * The lines with the sunset painted over the last three of them. `seconds` is the clock while a turn runs, or
 * null for a still scene; `dim` fades it between turns; `rainbow(cell, cells)` gives the rewind look's colours
 * and `amber` the YOUR TURN ones.
 */
export function paintSunset(lines, { maxCells, cellWidth, seconds = null, dim = false, rainbow = null, amber = false }) {
  const time = seconds ?? 0;
  const scene = lines.slice(-3);
  const grids = scene.map((line) => columnsOf(line, cellWidth));
  for (const { columns } of grids) while (columns.length < maxCells) columns.push({ before: '', text: ' ', free: true, extra: true });
  let rows = scene.length;
  let at = sunPlace(scene, grids, rows, maxCells);
  if (at === null && rows > 1) {
    rows = 1;
    at = sunPlace(scene, grids, rows, maxCells);
  }
  if (at === null && seconds === null) return lines;
  const shape = sunShape(rows);
  const wide = shape[0].length;
  const middle = (at ?? Math.round(maxCells * 0.62)) + wide / 2 - 0.5;
  const shade = (rgb) => (dim ? blend(rgb, FAINT, 0.6) : rgb);
  const free = (row, cell) => cell >= 0 && cell < maxCells && Boolean(grids[row].columns[cell]?.free);
  const clear = (row, cell) => {
    for (let near = cell - CLEAR; near <= cell + CLEAR; near += 1) if (near >= 0 && near < maxCells && !free(row, near)) return false;
    return free(row, cell);
  };
  const light = scene.map(() => new Map());
  const put = (row, cell, text, rgb) => light[row].set(cell, { text, style: ink(rgb), far: Math.abs(cell - middle) });

  if (at !== null) {
    for (const [row, from] of STARS) {
      const line = row - (3 - scene.length);
      const cell = at + from + (from > 0 ? wide - 18 : 0);
      if (line < 0 || line === scene.length - 1 || !clear(line, cell)) continue;
      const twinkle = 0.5 + 0.5 * Math.sin(time * 1.7 + from * 2.1);
      put(line, cell, twinkle > 0.85 ? '*' : twinkle > 0.45 ? '+' : '.', blend(FAINT, shade(from % 2 ? [169, 155, 255] : [255, 154, 213]), 0.35 + 0.65 * twinkle));
    }
    const dash = seconds === null || scene.length < 3 ? 9 : time % 9;
    if (dash < 1.1) {
      const head = Math.round(at + wide + 22 - (dash / 1.1) * 34);
      ['*', '-', '-', '.'].forEach((mark, behind) => {
        if (clear(0, head + behind)) put(0, head + behind, mark, blend([255, 244, 224], [180, 87, 214], behind / 3));
      });
    }
  }
  if (!rainbow) {
    const sea = scene.length - 1;
    for (let cell = Math.max(0, Math.ceil(middle - SEA_REACH)); cell < Math.min(maxCells, middle + SEA_REACH); cell += 1) {
      const wave = clear(sea, cell) ? seaCell(cell - middle, time, amber ? AMBER_SEA : SEA) : null;
      if (wave) put(sea, cell, wave.text, shade(wave.rgb));
    }
  }
  if (at !== null) {
    const colours = amber ? AMBER_INK : INK;
    // Three rows take the three colours; two keep the gold and the pink. One row has no height to grade, so its
    // ends take the orange.
    const colourOf = (row, block) => colours[rows === 1 ? (Math.abs(block - wide / 2) > wide / 4 ? 1 : 0) : rows === 2 ? row * 2 : row];
    shape.forEach((cells, row) => cells.forEach((cell, x) => {
      const line = scene.length - rows + row;
      if (!cell) {
        light[line].delete(at + x);
        return;
      }
      const run = rows === 1 ? 2 : HEAT_CELLS;
      const block = (Math.floor(x / run) + 0.5) * run;
      const heat = seconds === null ? 0.25 : 0.5 + 0.5 * Math.sin(time * 2.1 + row * 1.5 + 0.55 * Math.sin(block * 0.8 + time * 1.6));
      const rgb = rainbow ? blend(rainbow(block, wide * 2), WHITE, 0.2 + 0.25 * heat) : blend(...colourOf(row, block), heat);
      light[line].set(at + x, { text: cell.glyph, style: `${cell.slit ? paper(SLIT) : ''}${ink(shade(rgb))}`, filled: cell.slit, far: -1 });
    }));
  }
  return [...lines.slice(0, -scene.length), ...scene.map((line, row) => {
    if (light[row].size === 0) return line;
    const { columns, tail } = grids[row];
    const grid = { columns: columns.filter((column) => !column?.extra), tail };
    // Grok's cut: the light farthest from the sun goes first, the sun never.
    const order = [...light[row]].filter(([, cell]) => cell.far >= 0).sort((left, right) => left[1].far - right[1].far).map(([cell]) => cell);
    let out = compose(grid, light[row]);
    while (out.length > MAX_LINE_CHARACTERS && order.length > 0) {
      light[row].delete(order.pop());
      out = light[row].size > 0 ? compose(grid, light[row]) : line;
    }
    return out.length > MAX_LINE_CHARACTERS ? line : out;
  })];
}
