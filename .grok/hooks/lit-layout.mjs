// The status line's building blocks: cell widths, colours at each depth, and a row laid out of segments that fits
// its columns and Grok's cut.

// Grok cuts each line at 1024 characters, escapes included.
export const MAX_LINE_CHARACTERS = 1024;
// The family look: ONE LitGrok accent, flame orange (255 99 55, LitGrok's tick in the v7 armory), for all
// ordinary text and separators. Colour means more only in the context bands (yellow at 70%, red at 90%),
// the pink 🔥 LIT chip, the current-stage chip, a warning, a test verdict and a finished turn.
export const ROLES = {
  accent: [255, 99, 55], dim: [138, 138, 138], empty: [68, 68, 68], rail: [70, 80, 92],
  yellow: [215, 175, 0], red: [215, 95, 95], green: [95, 175, 95], ink: [11, 15, 20], pink: [255, 45, 149],
  pillInk: [11, 14, 20],
};
const ANSI_16 = [[0, 0, 0], [205, 0, 0], [0, 205, 0], [205, 205, 0], [0, 0, 238], [205, 0, 205], [0, 205, 205], [229, 229, 229],
  [127, 127, 127], [255, 0, 0], [0, 255, 0], [255, 255, 0], [92, 92, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
export function plainText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    // Joiners, direction marks, variation selectors and skin tones: terminals disagree on their width.
    .replace(/[\p{Cf}\ufe00-\ufe0f\p{Emoji_Modifier}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  return cleaned || fallback;
}

export function cellWidth(character) {
  if (/[\p{Mark}\p{Cf}\u1160-\u11ff]/u.test(character)) return 0;
  if (/[\u{1f1e6}-\u{1f1ff}]/u.test(character)) return 1;
  return /[ᄀ-ᅟ〈〉⺀-꓏가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦\u{1f200}-\u{1f265}\u{20000}-\u{3fffd}]|\p{Emoji_Presentation}/u.test(character) ? 2 : 1;
}

export function width(text) {
  return [...text].reduce((total, character) => total + cellWidth(character), 0);
}

export function clipCells(text, maximum, ellipsis = '…') {
  if (width(text) <= maximum) return text;
  let result = '';
  for (const character of text) {
    if (width(result) + cellWidth(character) + width(ellipsis) > maximum) break;
    result += character;
  }
  return maximum >= width(ellipsis) ? `${result.trimEnd()}${ellipsis}` : '';
}

function distance(left, right) {
  return left.reduce((total, value, index) => total + (value - right[index]) ** 2, 0);
}

function xterm256(rgb) {
  const levels = [0, 95, 135, 175, 215, 255];
  const nearest = (value) => levels.reduce((best, level, index) => (Math.abs(level - value) < Math.abs(levels[best] - value) ? index : best), 0);
  const cube = rgb.map(nearest);
  const gray = Math.max(0, Math.min(23, Math.round((rgb.reduce((total, value) => total + value, 0) / 3 - 8) / 10)));
  const grayValue = 8 + gray * 10;
  return distance(rgb, [grayValue, grayValue, grayValue]) < distance(rgb, cube.map((index) => levels[index]))
    ? 232 + gray
    : 16 + cube[0] * 36 + cube[1] * 6 + cube[2];
}

// depth is 24 (truecolor), 256 or 16; the 16-colour codes are the nearest of the standard xterm palette.
export function sgr(rgb, depth, background = false) {
  if (depth === 256) return `\u001b[${background ? 48 : 38};5;${xterm256(rgb)}m`;
  if (depth === 16) {
    const index = ANSI_16.reduce((best, color, at) => (distance(rgb, color) < distance(rgb, ANSI_16[best]) ? at : best), 0);
    return `\u001b[${(index < 8 ? 30 : 82) + index + (background ? 10 : 0)}m`;
  }
  return `\u001b[${background ? 48 : 38};2;${rgb.join(';')}m`;
}

// A painter for one colour depth; depth 0 returns the text untouched.
export function painter(depth) {
  return {
    depth,
    fg: (text, role, bold = false) => (depth && text ? `${bold ? '\u001b[1m' : ''}${sgr(ROLES[role], depth)}${text}\u001b[0m` : text),
    hue: (text, rgb, bold = false) => (depth && text ? `${bold ? '\u001b[1m' : ''}${sgr(rgb, depth)}${text}\u001b[0m` : text),
  };
}

// Below 70% a gauge keeps the accent; 70% turns it yellow and 90% red, as the family gauges do.
export function bandOf(percent) {
  return percent >= 90 ? 'red' : percent >= 70 ? 'yellow' : 'accent';
}

export function duration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(seconds / 3600)}h${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m`;
}

export function clock(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return minutes < 60 ? `${minutes}:${rest}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}`;
}

/**
 * A piece of a line. `paint` colours the text it is given. A narrow row works down from the highest
 * `drop` or `clip` number (0 never): a drop removes the segment, a clip shortens it through
 * `shrink(cells)`, which returns the text at that width or '' when it cannot get that small. `lead` (and
 * its coloured form `leadPainted`) is what stands before it, instead of the line's separator.
 */
export const segment = (text, paint = (value) => value, { drop = 0, clip = 0, shrink = null, lead = null, leadPainted = null, minCells = 1 } = {}) => ({
  text, paint, drop, clip, shrink, lead, leadPainted, minCells,
});

// Lays one line out of segments; `right` segments sit flush with the row's right edge. `fill(cells, column, followed)` draws
// the stretch between the two sides in place of spaces, to the edge even without a right side.
export function layoutLine({ left, right = [], separator, rail, maxCells, ellipsis, fill = null, limit = MAX_LINE_CHARACTERS }) {
  const items = [...left.map((item) => ({ ...item, side: 'left' })), ...right.map((item) => ({ ...item, side: 'right' }))];
  for (;;) {
    const join = (side, painted) => items.filter((item) => item.side === side).map((item, index) => {
      // A segment that comes straight after the first one may take its own lead (`|` after the mark).
      const own = index === 1 && item.firstLead ? item.firstLead : item;
      const lead = index === 0 ? '' : own.lead ?? separator.plain;
      const paintedLead = index === 0 ? '' : own.leadPainted ?? own.lead ?? separator.painted;
      return painted ? `${paintedLead}${item.paint(item.text)}` : `${lead}${item.text}`;
    }).join('');
    const leftPlain = `${rail.plain}${join('left', false)}`;
    const rightPlain = join('right', false);
    const bare = `${rail.painted}${join('left', true)}${join('right', true)}`;
    // The padding that pushes the right side to the edge counts toward Grok's cut as well.
    const room = maxCells - width(leftPlain) - width(rightPlain);
    const gap = fill ? Math.max(2, room) : rightPlain ? Math.max(2, Math.min(room, limit - bare.length)) : 0;
    const total = width(leftPlain) + gap + width(rightPlain);
    const painted = `${rail.painted}${join('left', true)}${fill ? fill(gap, width(leftPlain), rightPlain !== '') : ' '.repeat(gap)}${join('right', true)}`;
    if (total <= maxCells && painted.length <= limit) return painted;
    // The highest drop or clip number goes first; a clipped segment can still be dropped later.
    const steps = items.flatMap((item) => [...(item.drop > 0 ? [{ item, at: item.drop, drop: true }] : []), ...(item.clip > 0 ? [{ item, at: item.clip, drop: false }] : [])]);
    if (steps.length === 0) {
      // Nothing left to drop or shorten: the last segment goes, and the first is kept to the end.
      if (items.length > 1) items.pop();
      else return `${rail.painted}${clipCells(items[0]?.text ?? '', Math.max(0, maxCells - width(rail.plain)), ellipsis)}`;
      continue;
    }
    const step = steps.reduce((best, candidate) => (candidate.at > best.at || (candidate.at === best.at && !candidate.drop) ? candidate : best));
    const target = step.item;
    if (step.drop) {
      items.splice(items.indexOf(target), 1);
      continue;
    }
    // A segment that cannot get small enough shrinks as far as it goes, and the next step follows.
    const shrink = (cells) => (target.shrink ? target.shrink(cells) : clipCells(target.text, cells, ellipsis));
    if (total > maxCells) {
      const shorter = shrink(Math.max(target.minCells, width(target.text) - (total - maxCells)));
      if (shorter && width(shorter) < width(target.text)) target.text = shorter;
    } else {
      // Escapes count toward Grok's cut too, so a row can be too long while it fits its columns: the
      // segment shrinks until its painted form is short enough.
      const excess = painted.length - limit;
      const length = target.paint(target.text).length;
      for (let cells = width(target.text) - 1; cells >= target.minCells; cells -= 1) {
        const shorter = shrink(cells);
        if (shorter && (length - target.paint(shorter).length >= excess || cells === target.minCells)) {
          target.text = shorter;
          break;
        }
      }
    }
    target.clip = 0;
  }
}
