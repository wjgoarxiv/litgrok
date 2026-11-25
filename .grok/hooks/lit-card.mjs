// The status line's card: the whole row in one round frame, for a truecolor terminal on a dark background.
//
// Grok shows five lines. The title stands on the top edge, the stage map, the task and the skills inside, and the
// context and the session's figures on the bottom edge. A part without data is left out; nothing is invented.

import { rewindCellRgb } from './lit-mark.mjs';
import { MAX_LINE_CHARACTERS, ROLES, bandOf, cellWidth, clipCells, clock, layoutLine, segment, sgr, width } from './lit-layout.mjs';
import { blend, paintSunset } from './lit-sunset.mjs';

const RESET = '\u001b[0m';
const VIOLET = [180, 140, 255];
const FLAME = [255, 154, 60];
const WHITE = [240, 240, 245];
const AMBER = [255, 190, 80];
const FAINT = [48, 54, 61];
const TRACK = [42, 36, 64];
const PILL_STEPS = 4;
const EDGE_STEPS = 12;
const GAUGE_CELLS = 7;
export const MIN_CARD_CELLS = 35;
// A wider card would spend Grok's 1024 characters on empty cells.
const MAX_CARD_CELLS = 200;
const MAX_LINES = 5;
// The map row keeps these cells for the tool in flight, so the sun does not move as tools come and go.
const CARD_RIGHT_EDGE = 20;

const fg = (text, rgb, bold = false) => (text ? `\u001b[${bold ? '1;' : ''}38;2;${rgb.join(';')}m${text}${RESET}` : '');
const dim = (text) => fg(text, ROLES.dim);
const white = (text, bold = false) => fg(text, WHITE, bold);

function fade(stops, share) {
  const at = Math.max(0, Math.min(0.999, share)) * (stops.length - 1);
  return blend(stops[Math.floor(at)], stops[Math.floor(at) + 1], at % 1);
}

/** A pill: the text on a gradient between two caps, or between two filled cells where caps are not drawn. */
export function pill(text, stops, round, colourAt = null) {
  const cells = [...(round ? text : ` ${text} `)];
  const last = PILL_STEPS - 1;
  const step = (index) => Math.min(last, Math.floor((index / cells.length) * PILL_STEPS));
  const colour = (at) => (colourAt ? colourAt(at, PILL_STEPS) : fade(stops, at / last));
  const body = cells.map((cell, index) => {
    if (index > 0 && step(index) === step(index - 1)) return cell;
    return `${index === 0 ? `\u001b[1;38;2;${ROLES.ink.join(';')};48;2;${colour(0).join(';')}m` : sgr(colour(step(index)), 24, true)}${cell}`;
  }).join('');
  const cap = (glyph, at) => (round ? `\u001b[38;2;${colour(at).join(';')}m${glyph}${RESET}` : '');
  return `${cap('\ue0b6', 0)}${body}${RESET}${cap('\ue0b4', last)}`;
}

/** A gauge of `cells` columns: a filled track between two caps, or a plain filled track where caps are not drawn. */
export function gauge(percent, cells, colour, round) {
  const eighths = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
  const track = sgr(TRACK, 24, true);
  const inner = round ? cells - 2 : cells;
  const filled = Math.max(percent > 0 ? 1 : 0, Math.min(percent < 100 ? inner * 8 - 1 : inner * 8, Math.round((percent / 100) * inner * 8)));
  const bar = `${'█'.repeat(Math.floor(filled / 8))}${eighths[filled % 8]}`;
  const body = `${sgr(colour, 24)}${track}${bar}${' '.repeat(inner - Math.ceil(filled / 8))}${RESET}`;
  if (!round) return body;
  return `${fg('\ue0b6', percent > 0 ? colour : TRACK)}${body}${fg('\ue0b4', percent >= 100 ? colour : TRACK)}`;
}

const pillSegment = (text, stops, round, options = {}) => {
  const inside = (value) => value.slice(1, -1);
  const { colourAt = null, before = '', ...rest } = options;
  const build = (value) => `${before} ${value} `;
  return segment(build(text), (value) => `${dim(before)}${pill(inside(value.slice(before.length)), stops, round, colourAt)}`, {
    ...rest, minCells: width(build('')) + 1, shrink: (cells) => build(clipCells(text, Math.max(1, cells - width(build(''))))),
  });
};

// The colours of one card: where its frame runs to, and how bright it is.
function frameOf({ tone, rewind, running, now, motion, W }) {
  const right = tone === 'turn' ? AMBER : tone === 'error' ? ROLES.red : tone === 'done' ? ROLES.green : ROLES.accent;
  const left = tone === 'turn' ? FLAME : ROLES.pink;
  const shade = (rgb) => (running || tone !== 'idle' ? rgb : blend(rgb, FAINT, 0.45));
  const at = (cell) => {
    const step = Math.min(EDGE_STEPS - 1, Math.floor((cell / W) * EDGE_STEPS));
    return shade(rewind ? rewindCellRgb(now, motion, step, EDGE_STEPS) : fade([left, VIOLET, right], step / (EDGE_STEPS - 1)));
  };
  return { at, left: at(0), right: at(W - 1), shade };
}

function dashes(cells, column, frame) {
  let out = '';
  let style = '';
  for (let cell = 0; cell < cells; cell += 1) {
    const next = `\u001b[38;2;${frame.at(column + cell).join(';')}m`;
    out += `${next === style ? '' : next}─`;
    style = next;
  }
  return cells > 0 ? `${out}${RESET}` : '';
}

function edgeLine({ open, close, left, right, frame, W, ellipsis }) {
  let closed = false;
  const painted = layoutLine({
    left, right, ellipsis, maxCells: W - 3, limit: MAX_LINE_CHARACTERS - 60,
    separator: { plain: ' · ', painted: dim(' · ') },
    rail: { plain: `${open}─ `, painted: `${fg(`${open}─`, frame.left)} ` },
    fill: (cells, column, followed) => {
      closed = followed;
      return ` ${dashes(cells - (followed ? 2 : 1), column + 1, frame)}${followed ? ' ' : ''}`;
    },
  });
  return `${painted}${closed ? ' ' : ''}${fg(`${closed ? '' : '─'}─${close}`, frame.right)}`;
}

const plainOf = (text) => text.replace(/\u001b\[[0-9;]*m/gu, '');

function bodyLine({ left, right = [], frame, W, ellipsis, separator = ' · ', lead = '' }) {
  const bar = { plain: `│ ${lead}`, painted: `${fg('│', frame.left)} ${dim(lead)}` };
  const inner = left.length + right.length === 0 ? bar.painted : layoutLine({
    left: left.length > 0 ? left : [segment('')], right, ellipsis, maxCells: W - 2, rail: bar,
    limit: MAX_LINE_CHARACTERS - 32 - (right.length > 0 ? 0 : W),
    separator: { plain: separator, painted: dim(separator) },
  });
  return `${inner}${' '.repeat(Math.max(0, W - 1 - width(plainOf(inner))))}${fg('│', frame.right)}`;
}

// The stage map in words: warm ticks and rails behind, a pill for the current stage, dim names ahead.
function mapSegment({ pieces, current, running, now, round, rail, turn }) {
  const head = running ? [current > 0 ? current : 1, Math.floor(now / 300) % rail] : null;
  const stops = turn ? [FLAME, AMBER] : [VIOLET, ROLES.accent];
  const warm = turn ? AMBER : ROLES.accent;
  const plain = pieces.map(({ text, role }) => (role === 'current' ? ` ${text} ` : text)).join('');
  const painted = () => pieces.map(({ text, role, rail: cell, behind }) => {
    if (role === 'space') return text;
    if (role === 'current') return pill(text, stops, round);
    if (role === 'dim') return behind ? fg(text, warm) : dim(text);
    if (head && cell[0] === head[0] && cell[1] === head[1]) return fg(text, ROLES.pink, true);
    return fg(text, role === 'lit' ? warm : ROLES.rail);
  }).join('');
  return { plain, painted };
}

// A running turn keeps room for its tool, so the map does not change shape as tools come and go.
function mapRow({ mapAt, round, running, now, turn, room }) {
  const tiers = [{ rail: 2 }, { rail: 1 }];
  const tries = [...(running ? tiers.map((tier) => ({ tier, spare: CARD_RIGHT_EDGE - 2 })) : []), ...tiers.map((tier) => ({ tier, spare: 0 })), { tier: { rail: 1, compact: true }, spare: 0 }];
  for (const { tier, spare } of tries) {
    const map = mapSegment({ ...mapAt(tier), running, now, round, rail: tier.rail, turn });
    if (width(map.plain) <= room - spare) return segment(map.plain, map.painted);
  }
  return null;
}

const stateWord = ({ looks, phase, activity, workflow, glyphs, rainbow }) => {
  if (looks.waiting) {
    const full = `YOUR TURN · ${looks.waiting.reason} ${glyphs.run}`;
    return segment(full, (text) => fg(text, AMBER, true), { clip: 1, minCells: width('YOUR TURN'), shrink: () => `YOUR TURN ${glyphs.run}` });
  }
  if (phase.phase === 'complete') {
    return looks.burst ? segment(`DONE ${glyphs.burst}`, (text) => fg(text, ROLES.pink, true)) : segment(`DONE ${glyphs.tick}`, (text) => fg(text, ROLES.green, true));
  }
  if (phase.phase === 'running') {
    if (looks.look === 'rewind') return segment(`REWIND ${glyphs.run}`, rainbow);
    const word = (workflow?.stage ?? 'running').toUpperCase();
    return segment(`${word} ${glyphs.run}`, (text) => fg(text, ROLES.accent, true));
  }
  if (activity?.failed) return segment(`ERROR ${glyphs.cross}`, (text) => fg(text, ROLES.red, true));
  return segment('IDLE ○', dim);
};

function bottomSegments({ figures, round, glyphs }) {
  const { model, effort, percent, size, handoff, cost, branch } = figures;
  const left = [];
  if (percent === null) left.push(segment(`ctx ?${size ? `/${size}` : ''}`, dim));
  else {
    const band = ROLES[bandOf(percent)];
    left.push(segment(`ctx ${percent}% ${' '.repeat(GAUGE_CELLS)}${size ? ` ${size}` : ''}`, () => (
      `${dim('ctx ')}${fg(`${percent}%`, band, true)} ${gauge(percent, GAUGE_CELLS, band, round)}${dim(size ? ` ${size}` : '')}`)));
  }
  const tail = effort ? ` [${effort}]` : '';
  left.push(segment(`${model}${tail}`, (text) => `${white(text.slice(0, text.length - tail.length))}${dim(tail)}`, {
    drop: 0.5, clip: 2, minCells: width(tail) + 1, shrink: (cells) => `${clipCells(model, Math.max(1, cells - width(tail)), glyphs.ellipsis)}${tail}`,
  }));
  if (handoff) left.push(segment(`handoff@${handoff}%`, (text) => `${dim('handoff@')}${white(text.slice('handoff@'.length))}`, { drop: 4 }));
  if (cost) left.push(segment(cost, (text) => white(text), { drop: 3 }));
  if (branch) left.push(segment(`${glyphs.git}${branch}`, (text) => `${dim(text.slice(0, glyphs.git.length))}${fg(text.slice(glyphs.git.length), ROLES.accent)}`, { drop: 5 }));
  return left;
}

function skillRow({ card, round, glyphs, rainbow, rewind, tone }) {
  const { discipline, workflow, looks, warning, others, notice } = card;
  if (notice) return notice;
  const left = [];
  if (looks.look === 'lanes') {
    const count = workflow?.test?.count;
    const names = looks.lanes.map(({ name, state }) => (state === 'unreported' ? name : `${name} ${state === 'pass' ? glyphs.tick : glyphs.cross}${count === undefined ? '' : ` ${count}`}`));
    const tone = looks.lanes.map(({ state }) => (state === 'pass' ? ROLES.green : state === 'fail' ? ROLES.red : ROLES.dim));
    const reported = looks.lanes.filter(({ state }) => state !== 'unreported').length;
    const full = `lanes ${names.join(' · ')}`;
    left.push(segment(full, (text) => (text === full ? `${dim('lanes ')}${names.map((name, at) => fg(name, tone[at], tone[at] !== ROLES.dim)).join(dim(' · '))}` : dim(text)), {
      clip: 4, minCells: 9, shrink: () => `lanes ${reported}/${looks.lanes.length}`,
    }));
  }
  if (discipline) {
    const lanes = looks.look === 'lanes';
    left.push(pillSegment(clipCells(discipline, 32, glyphs.ellipsis), tone === 'turn' ? [FLAME, AMBER] : [ROLES.pink, VIOLET], round, {
      before: 'skills ', drop: lanes ? 5 : 0, clip: 0.5, colourAt: rewind ? rainbow : null,
    }));
  }
  if (workflow?.test && looks.look !== 'lanes') {
    const pass = workflow.test.verdict === 'pass';
    left.push(segment(`tests ${pass ? glyphs.tick : glyphs.cross}${workflow.test.count === undefined ? '' : ` ${workflow.test.count}`}`, (text) => `${dim('tests')}${fg(text.slice(5), pass ? ROLES.green : ROLES.red, true)}`, { drop: 3 }));
  }
  if (warning) left.push(segment(`${glyphs.warn} ${warning[0]}`, (text) => fg(text, AMBER, true), { drop: 1, clip: 2 }));
  for (const [at, other] of others.entries()) left.push(otherSegment(other, glyphs, { drop: 4 + at }));
  return left;
}

function otherSegment({ label, pane, state }, glyphs, options = {}) {
  const mark = state === 'running' ? glyphs.run : state === 'done' ? glyphs.tick : glyphs.dot;
  const tone = state === 'running' ? ROLES.accent : state === 'done' ? ROLES.green : ROLES.dim;
  const name = pane ? `${label} ${glyphs.dot} ${pane}` : label;
  const build = (text) => `${mark} ${text} ${state}`;
  return segment(build(name), (text) => `${fg(mark, tone)}${white(text.slice(mark.length, text.length - state.length), true)}${fg(state, tone)}`, {
    ...options, clip: 8, minCells: width(build('')) + 1, shrink: (cells) => build(clipCells(name, Math.max(1, cells - width(build(''))), glyphs.ellipsis)),
  });
}

// What stands in for a map while the session has no stage: the session's name and whether it runs.
function sessionSegment({ name, phase, failed, glyphs }) {
  const running = phase.phase === 'running';
  const word = running ? 'running' : phase.phase === 'complete' ? 'complete' : failed ? 'stopped with an error' : name ? 'idle' : 'ready';
  const build = (text) => `${glyphs.run} ${text ? `${text} ` : ''}${word}`;
  const tint = running ? ROLES.green : failed ? ROLES.red : ROLES.dim;
  return segment(build(name), (text) => `${fg(glyphs.run, tint)}${white(text.slice(glyphs.run.length, text.length - word.length), true)}${fg(word, tint)}`, {
    clip: 1, minCells: width(build('')), shrink: (cells) => build(name ? clipCells(name, Math.max(1, cells - width(build('')) - 1), glyphs.ellipsis) : ''),
  });
}

/**
 * The card's lines, or null when the row is too narrow for one. `shownLines` is how many lines Grok last showed:
 * on a short terminal it drops lines from the bottom, so the card draws fewer and keeps its frame closed. The
 * blank lines under it tell the next run whether the terminal has grown.
 */
export function cardLines(card) {
  const { glyphs, round, phase, activity, workflow, live, looks, discipline, warning, others, figures, notice, now, motion, running, version, shownLines, spinner, toolName } = card;
  const W = Math.min(MAX_CARD_CELLS, card.maxCells);
  if (W < MIN_CARD_CELLS) return null;
  const ellipsis = glyphs.ellipsis;
  const rewind = looks.look === 'rewind';
  const rainbow = (text) => {
    // Eight steps round the wheel: one colour a cell would spend Grok's 1024 characters on the name.
    const cells = [...text];
    const run = Math.max(1, Math.ceil(cells.length / 8));
    const steps = Array.from({ length: Math.ceil(cells.length / run) }, (_, at) => `${sgr(rewindCellRgb(now, motion, at * run, cells.length), 24)}${cells.slice(at * run, (at + 1) * run).join('')}`);
    return `\u001b[1m${steps.join('')}${RESET}`;
  };
  const rainbowAt = (at, steps) => rewindCellRgb(now, motion, at, steps);
  const tone = looks.waiting ? 'turn' : phase.phase === 'complete' ? 'done' : phase.phase === 'running' ? 'work' : activity?.failed ? 'error' : 'idle';
  const frame = frameOf({ tone, rewind, running, now, motion, W });
  const base = { frame, W, ellipsis };
  const working = Boolean(discipline || workflow?.stage);

  const label = `${glyphs.fire ? `${glyphs.fire} ` : ''}LIT`;
  const crumb = discipline ?? (workflow?.stage ? 'workflow' : phase.phase === 'running' ? 'session' : 'ready');
  const name = rewind ? `✺ REWIND ${crumb}` : clipCells(crumb, 32, ellipsis);
  const bright = tone === 'turn' ? AMBER : running ? ROLES.accent : WHITE;
  const title = [pillSegment(label, [FLAME, ROLES.pink], round), segment(name, rewind ? rainbow : (text) => fg(text, bright, true), { clip: 0.5, minCells: 2 })];
  if (phase.timer) title.push(segment(phase.timer, dim, { drop: 4, lead: ' ', leadPainted: ' ' }));
  const status = [];
  if (activity && phase.phase !== 'idle' && activity.tools > 0) status.push(segment(glyphs.tools(activity.tools), dim, { drop: 6 }));
  if (phase.phase === 'running' && activity?.agents > 0) {
    const dots = glyphs.run.repeat(Math.min(activity.agents, 5));
    status.push(segment(`${dots} ${glyphs.agents(activity.agents)}`, (text) => `${fg(dots, ROLES.green)}${white(text.slice(dots.length))}`, { drop: 3 }));
  }
  if (warning && !looks.waiting) status.push(segment(`${glyphs.warn} ${warning[1]}`, (text) => fg(text, AMBER, true), { drop: 1 }));
  status.push(stateWord({ looks, phase, activity, workflow, glyphs, rainbow }));
  const top = edgeLine({ ...base, open: '╭', close: '╮', left: title, right: status });
  const bottom = edgeLine({ ...base, open: '╰', close: '╯', left: bottomSegments({ figures, round, glyphs }), right: version ? [segment(`v${version}`, dim, { drop: 7 })] : [] });

  const flight = live ? [segment(`${spinner} ${toolName} · ${clock(now - live.startedAt)}`, (text) => (
    `${fg(spinner, ROLES.accent, true)} ${white(toolName, true)}${dim(text.slice(`${spinner} ${toolName}`.length))}`), { drop: 1 })] : [];
  const body = [];
  if (working) {
    const map = workflow?.stage ? mapRow({ mapAt: card.mapAt, round, running, now, turn: tone === 'turn', room: W - 4 }) : null;
    body.push(bodyLine({ ...base, left: [map ?? sessionSegment({ name: crumb, phase, failed: activity?.failed, glyphs })], right: flight }));
    const plan = workflow?.plan;
    if (plan?.total > 0) {
      const task = [segment(`task ${plan.done}/${plan.total} ${' '.repeat(GAUGE_CELLS + 1)}`, () => (
        `${dim('task ')}${white(`${plan.done}`, true)}${dim(`/${plan.total}`)} ${gauge((plan.done / plan.total) * 100, GAUGE_CELLS + 1, tone === 'turn' ? AMBER : ROLES.accent, round)}`))];
      if (card.next) {
        const ahead = `next ${glyphs.next} `;
        task.push(segment(`${ahead}${card.next}`, (text) => `${dim(ahead)}${white(text.slice(ahead.length))}`, {
          drop: 5, clip: 6, minCells: width(ahead) + 8, shrink: (cells) => `${ahead}${clipCells(card.next, cells - width(ahead), ellipsis)}`,
        }));
      }
      body.push(bodyLine({ ...base, left: task, lead: `${glyphs.elbow} ` }));
    }
    const skills = skillRow({ card, round, glyphs, rainbow: rainbowAt, rewind, tone });
    if (skills.length > 0) body.push(bodyLine({ ...base, left: skills }));
    // A card always takes Grok's five lines, so the row never changes height while work runs.
    while (body.length < MAX_LINES - 2) body.push(bodyLine({ ...base, left: [] }));
  } else {
    body.push(bodyLine({ ...base, left: [sessionSegment({ name: '', phase, failed: activity?.failed, glyphs })], right: flight }));
    // The card's two rows below hold every other session, and the extensions row takes one of them.
    const each = Math.ceil(others.length / (notice ? 1 : 2));
    for (let at = 0; at < others.length; at += each) body.push(bodyLine({ ...base, left: others.slice(at, at + each).map((other, index) => otherSegment(other, glyphs, { drop: index })) }));
    if (notice) body.push(bodyLine({ ...base, left: notice }));
  }
  const full = body.length + 2;
  const height = shownLines >= 2 && shownLines < full ? shownLines : full;
  const kept = body.slice(0, height - 2);
  const scene = kept.length === 0 ? [] : paintSunset(kept, {
    maxCells: W, cellWidth, seconds: running && motion === 'full' ? now / 1000 : null, dim: tone === 'idle' || tone === 'error', amber: Boolean(looks.waiting), rightEdge: CARD_RIGHT_EDGE,
    rainbow: rewind ? (cell, cells) => rewindCellRgb(now, running && motion === 'full' ? 'full' : 'off', cell, cells) : null,
  });
  return [top, ...scene, bottom, ...Array.from({ length: Math.min(MAX_LINES, full) - height }, () => ' ')];
}
