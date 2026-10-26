#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAutoHandoff } from './auto-handoff.mjs';
import { rewindCellRgb } from './lit-mark.mjs';
import { readHudRecordForCwd, writeContextRecord } from './litgrok-hud-state.mjs';
import { STAGES, readWorkflowState } from './workflow-stage.mjs';

const MAX_INPUT_BYTES = 64 * 1024;
// The family look: ONE LitGrok accent, flame orange (255 99 55, LitGrok's tick in the v7 armory), for all
// ordinary text and separators. Colour means more only in the context bands (yellow at 70%, red at 90%),
// the pink 🔥 LIT chip, the current-stage chip, a warning, a test verdict and a finished turn.
const ROLES = {
  accent: [255, 99, 55], dim: [138, 138, 138], empty: [68, 68, 68], rail: [70, 80, 92],
  yellow: [215, 175, 0], red: [215, 95, 95], green: [95, 175, 95], ink: [11, 15, 20], pink: [255, 45, 149],
};
// The family mark: L, I and T on pink, violet and cyan.
const BRAND_STOPS = [[255, 45, 149], [128, 137, 202], [0, 229, 255]];
// Grok cuts each line at 1024 characters, escapes included.
const MAX_LINE_CHARACTERS = 1024;
const RECORD_SCHEMA = 'litgrok.hook-event/v1';
// The card reads only the end of the session ledger, enough for a few hundred records.
const LEDGER_TAIL_BYTES = 128 * 1024;
const COMPLETE_SHOWN_MS = 20 * 1000;
const HANDOFF_NEAR_POINTS = 10;
const CLOCK_SKEW_MS = 5 * 1000;
// A turn the ledger has not heard from for this long is no longer shown as running.
const LEDGER_TURN_QUIET_MS = 10 * 60 * 1000;
const TOOL_EVENTS = new Set(['PostToolUse', 'PostToolUseFailure']);
const ANSI_16 = [[0, 0, 0], [205, 0, 0], [0, 205, 0], [205, 205, 0], [0, 0, 238], [205, 0, 205], [0, 205, 205], [229, 229, 229],
  [127, 127, 127], [255, 0, 0], [0, 255, 0], [255, 255, 0], [92, 92, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Every symbol the card draws, per glyph set. `ascii` is for terminals and fonts without box, braille or emoji.
const GLYPHS = {
  basic: {
    fire: '🔥', tick: '✓', cross: '✗', dot: '·', lit: '━', unlit: '─', run: '●', warn: '⚠', elbow: '└', next: '▸', sep: '│',
    full: '▮', empty: '▯', rail: '▎', ellipsis: '…', spinner: BRAILLE, bar: ['█', '░', ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']],
    timer: '', burst: '★', tools: (n) => plural(n, 'tool'), agents: (n) => plural(n, 'agent'), git: 'git ',
  },
  nerd: {
    fire: '🔥', tick: '', cross: '', dot: '·', lit: '━', unlit: '─', run: '', warn: '', elbow: '└', next: '▸', sep: '│',
    full: '▮', empty: '▯', rail: '▎', ellipsis: '…', spinner: BRAILLE, bar: ['█', '░', ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']],
    timer: ' ', burst: '★', tools: (n) => ` ${n}`, agents: (n) => ` ${n}`, git: ' ',
  },
  ascii: {
    fire: '', tick: '+', cross: 'x', dot: '-', lit: '=', unlit: '-', run: '*', warn: '!', elbow: '`', next: '>', sep: '|',
    full: '#', empty: '-', rail: '|', ellipsis: '~', spinner: ['|', '/', '-', '\\'], bar: ['#', '-', ['']],
    timer: '', burst: '*', tools: (n) => plural(n, 'tool'), agents: (n) => plural(n, 'agent'), git: 'git ',
  },
};
// Grok's own tool names, shortened to the words people know them by. Any other name shows as sent.
const TOOL_LABELS = {
  run_terminal_command: 'Bash', read_file: 'Read', search_replace: 'Edit', write: 'Write', grep: 'Grep', list_dir: 'List',
  todo_write: 'Todo', web_search: 'Search', web_fetch: 'Fetch', image_edit: 'Image', monitor: 'Monitor', ask_user_question: 'Ask',
};

async function readInput() {
  // Decode once: a multi-byte character can straddle two pipe chunks.
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_INPUT_BYTES) return null;
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function plainText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return cleaned || fallback;
}

// The installer writes its manifest beside the hooks folder, so an installed copy can name its version.
function installedVersion() {
  try {
    const manifest = JSON.parse(readFileSync(join(dirname(dirname(fileURLToPath(import.meta.url))), '.litgrok-install-manifest.json'), 'utf8'));
    return typeof manifest?.version === 'string' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(manifest.version) ? manifest.version : '';
  } catch {
    return '';
  }
}

// Grok sends effort.level only for models that take a reasoning effort.
function effortLevel(value) {
  return typeof value === 'string' && /^[a-z][a-z-]{0,11}$/u.test(value) ? value : '';
}

function windowSize(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '';
  if (value >= 1000000 && value % 100000 === 0) return `${value / 1000000}m`;
  return `${Math.max(1, Math.round(value / 1000))}k`;
}

function finitePercent(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(0, Math.min(100, value))) : null;
}

function cellWidth(character) {
  if (/\p{Mark}/u.test(character) || character === '‍') return 0;
  return /[ᄀ-ᅟ〈〉⺀-꓏가-힣豈-﫿︐-︙︰-﹯＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(character) ? 2 : 1;
}

function width(text) {
  return [...text].reduce((total, character) => total + cellWidth(character), 0);
}

function clipCells(text, maximum, ellipsis = '…') {
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
function sgr(rgb, depth, background = false) {
  if (depth === 256) return `\u001b[${background ? 48 : 38};5;${xterm256(rgb)}m`;
  if (depth === 16) {
    const index = ANSI_16.reduce((best, color, at) => (distance(rgb, color) < distance(rgb, ANSI_16[best]) ? at : best), 0);
    return `\u001b[${(index < 8 ? 30 : 82) + index + (background ? 10 : 0)}m`;
  }
  return `\u001b[${background ? 48 : 38};2;${rgb.join(';')}m`;
}

// A painter for one colour depth; depth 0 returns the text untouched.
function painter(depth) {
  return {
    depth,
    fg: (text, role, bold = false) => (depth && text ? `${bold ? '\u001b[1m' : ''}${sgr(ROLES[role], depth)}${text}\u001b[0m` : text),
    hue: (text, rgb, bold = false) => (depth && text ? `${bold ? '\u001b[1m' : ''}${sgr(rgb, depth)}${text}\u001b[0m` : text),
  };
}

// The rewind look's motion: 'full' cycles the hue, 'subtle' drifts it slowly, 'off' holds one still
// rainbow frame. Anything else is 'full'.
function hudMotion(env = process.env) {
  const motion = (env.LITGROK_HUD_MOTION ?? 'full').toLowerCase();
  return motion === 'off' || motion === 'subtle' ? motion : 'full';
}

// A filled chip on the pink (the brand) or the accent (the current stage) with dark text and a space of
// padding each side; a Nerd Font gives it rounded caps, and without colour it falls back to brackets.
function chip(text, background, paint, nerd, open = '(', close = ')') {
  if (!paint.depth) return { plain: `${open}${text}${close}`, painted: `${open}${text}${close}` };
  const fill = `${sgr(ROLES[background], paint.depth, true)}${sgr(ROLES.ink, paint.depth)}\u001b[1m`;
  if (!nerd) return { plain: ` ${text} `, painted: `${fill} ${text} \u001b[0m` };
  const cap = (glyph) => `${sgr(ROLES[background], paint.depth)}${glyph}\u001b[0m`;
  return { plain: `${text}`, painted: `${cap('')}${fill}${text}\u001b[0m${cap('')}` };
}

// Below 70% a gauge keeps the accent; 70% turns it yellow and 90% red, as the family gauges do.
function bandOf(percent) {
  return percent >= 90 ? 'red' : percent >= 70 ? 'yellow' : 'accent';
}

function blockBar(percent, cells, glyphs) {
  const [full, empty, partials] = glyphs.bar;
  const exact = (percent * cells) / 100;
  const filled = Math.floor(exact);
  const partial = partials.length > 1 && filled < cells && exact > filled ? Math.max(1, Math.min(partials.length - 1, Math.round((exact - filled) * partials.length))) : 0;
  return { filled: `${full.repeat(filled)}${partials[partial]}`, empty: empty.repeat(cells - filled - (partial > 0 ? 1 : 0)) };
}

function duration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(seconds / 3600)}h${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m`;
}

function clock(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, '0');
  return minutes < 60 ? `${minutes}:${rest}` : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}`;
}

// Automatic handoff needs Grok's context percent, which only the status line receives. Nothing is
// written unless the user turned the feature on and Grok reported a percent.
function recordContextForHandoff(status) {
  const sessionId = status?.session_id;
  const percent = status?.context_window?.used_percentage;
  if (typeof sessionId !== 'string' || sessionId === '' || typeof percent !== 'number' || !Number.isFinite(percent)) return;
  if (typeof status.cwd !== 'string' || !isAbsolute(status.cwd)) return;
  const dirs = [status.workspace?.repo_root, status.workspace?.current_dir, status.cwd];
  if (!resolveAutoHandoff({ env: process.env, dirs }).active) return;
  writeContextRecord({
    env: process.env,
    sessionId,
    cwd: status.cwd,
    usedPercentage: percent,
    autoCompactThresholdPercent: status.context_window.auto_compact_threshold_percent,
  });
}

function statusDirs(status) {
  return [status?.workspace?.repo_root, status?.workspace?.current_dir, status?.cwd];
}

// The passive hooks keep the session ledger under the workspace root Grok gives them, which the status
// input names as one of these folders. Only a regular file is read, and only its end.
function readLedgerTail(status) {
  const sessionId = status?.session_id;
  if (typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 512) return null;
  const name = `${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}.jsonl`;
  for (const directory of statusDirs(status)) {
    if (typeof directory !== 'string' || !isAbsolute(directory)) continue;
    let descriptor;
    try {
      descriptor = openSync(join(realpathSync(directory), '.grok', 'litgrok', 'session-ledger', name), constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch {
      continue;
    }
    try {
      const file = fstatSync(descriptor);
      if (!file.isFile()) return null;
      const length = Math.min(file.size, LEDGER_TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      let text = buffer.subarray(0, readSync(descriptor, buffer, 0, length, file.size - length)).toString('utf8');
      // A read that starts mid-file drops its first, partial line.
      if (length < file.size) text = text.slice(text.indexOf('\n') + 1 || text.length);
      return text.split('\n').flatMap((line) => {
        try {
          const record = JSON.parse(line);
          return record?.schema === RECORD_SCHEMA && record.sessionId === sessionId && Number.isFinite(Date.parse(record.recordedAt)) ? [record] : [];
        } catch {
          return [];
        }
      });
    } catch {
      return null;
    } finally {
      closeSync(descriptor);
    }
  }
  return null;
}

// The hooks keep the session's workflow snapshot beside its ledger, in the same folders.
function readWorkflow(status) {
  const sessionId = status?.session_id;
  if (typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 512) return null;
  const name = `${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}.workflow.json`;
  for (const directory of statusDirs(status)) {
    if (typeof directory !== 'string' || !isAbsolute(directory)) continue;
    let root;
    try {
      root = realpathSync(directory);
    } catch {
      continue;
    }
    const state = readWorkflowState(join(root, '.grok', 'litgrok', 'session-ledger', name), sessionId);
    if (state) return state;
  }
  return null;
}

// What the ledger says about the current turn: it starts at the prompt Grok names, or the latest one.
// A turn whose start is not in the tail is unknown, so nothing is counted.
function turnActivity(records, promptId) {
  if (!records) return null;
  const prompts = records.flatMap((record, index) => (record.event === 'UserPromptSubmit' ? [index] : []));
  const matching = typeof promptId === 'string' ? prompts.filter((index) => records[index].promptId === promptId) : [];
  const start = (matching.length > 0 ? matching : prompts).at(-1);
  if (start === undefined) return null;
  const turn = records.slice(start + 1);
  const count = (event) => turn.filter((record) => record.event === event).length;
  const held = (record) => record.signal === 'plan-gate-block' || record.signal === 'auto-handoff-directive'
    || (record.signal === 'auto-handoff-reload' && record.outcome === 'loaded');
  const last = turn.at(-1);
  const failed = last?.event === 'StopFailure';
  const ended = (last?.event === 'Stop' && !held(last)) || failed;
  // A call is in flight while its PreToolUse is the turn's newest tool record. Parallel calls can hide
  // one that is still running; that shows less, never a finished call as running.
  const lastTool = turn.filter((record) => record.event === 'PreToolUse' || TOOL_EVENTS.has(record.event)).at(-1);
  const liveStart = Date.parse(lastTool?.recordedAt);
  return {
    live: !ended && lastTool?.event === 'PreToolUse' && typeof lastTool.tool?.name === 'string' && Number.isFinite(liveStart)
      ? { name: lastTool.tool.name, startedAt: liveStart }
      : null,
    startedAt: Date.parse(records[start].recordedAt),
    lastAt: Date.parse((last ?? records[start]).recordedAt),
    endedAt: ended ? Date.parse(last.recordedAt) : null,
    failed,
    tools: turn.filter((record) => TOOL_EVENTS.has(record.event)).length,
    agents: Math.max(0, count('SubagentStart') - count('SubagentStop')),
    planGate: !ended && turn.some((record) => record.signal === 'plan-gate-block'),
    handoffAsked: !ended && turn.some((record) => record.signal === 'auto-handoff-directive'),
  };
}

// Returns [long, short] warning text, or null. A plan-gate hold comes first, then a handoff request,
// then a context at or near the automatic-handoff percent.
function warningText(status, activity, handoff) {
  if (activity?.planGate) return ['plan gate: save plans/<slug>.md', 'plan gate'];
  if (activity?.handoffAsked) return ['handoff requested', 'handoff'];
  const percent = finitePercent(status?.context_window?.used_percentage);
  if (percent === null || !handoff.active) return null;
  if (percent >= handoff.percent) return [`ctx ${percent}% ≥ handoff at ${handoff.percent}%`, `ctx ${percent}%≥${handoff.percent}%`];
  if (percent >= handoff.percent - HANDOFF_NEAR_POINTS) return [`ctx ${percent}% → handoff at ${handoff.percent}%`, `ctx ${percent}%→${handoff.percent}%`];
  return null;
}

// Whether a turn runs and since when. Grok's turn field decides when Grok sends one. Grok Build 1.0.13
// sends none and, during a turn, re-runs the command with the payload of the last state change; then a
// turn runs while the ledger's newest prompt has nothing that ended it and the ledger heard from it
// recently. A cancel that records no stop shows as running until the ledger has been quiet that long.
function turnState(status, activity, now) {
  if (status !== null && typeof status === 'object' && Object.hasOwn(status, 'turn')) {
    const started = status.turn?.started_at_ms;
    const running = typeof started === 'number' && Number.isFinite(started) && started > 0;
    return { running, startedAt: running && started <= now + CLOCK_SKEW_MS ? started : null };
  }
  const running = activity !== null && activity.endedAt === null && Number.isFinite(activity.startedAt)
    && activity.startedAt <= now + CLOCK_SKEW_MS && now - activity.lastAt <= LEDGER_TURN_QUIET_MS;
  return { running, startedAt: running ? activity.startedAt : null };
}

// running, complete (for twenty seconds after a clean stop) or idle, with the turn's timer.
function phaseOf(now, activity, turn) {
  if (turn.running) return { phase: 'running', timer: turn.startedAt === null ? null : duration(Math.max(0, now - turn.startedAt)) };
  if (activity?.endedAt && !activity.failed && now - activity.endedAt <= COMPLETE_SHOWN_MS && activity.endedAt <= now + CLOCK_SKEW_MS) {
    return { phase: 'complete', timer: duration(Math.max(0, activity.endedAt - activity.startedAt)) };
  }
  return { phase: 'idle', timer: null };
}

/**
 * A piece of a line. `paint` colours the text it is given. A narrow row works down from the highest
 * `drop` or `clip` number (0 never): a drop removes the segment, a clip shortens it through
 * `shrink(cells)`, which returns the text at that width or '' when it cannot get that small. `lead` (and
 * its coloured form `leadPainted`) is what stands before it, instead of the line's separator.
 */
const segment = (text, paint = (value) => value, { drop = 0, clip = 0, shrink = null, lead = null, leadPainted = null, minCells = 1 } = {}) => ({
  text, paint, drop, clip, shrink, lead, leadPainted, minCells,
});

// Lays one line out of segments; `right` segments sit flush with the row's right edge.
function layoutLine({ left, right = [], separator, rail, maxCells, ellipsis }) {
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
    const gap = rightPlain ? Math.max(2, Math.min(maxCells - width(leftPlain) - width(rightPlain), MAX_LINE_CHARACTERS - bare.length)) : 0;
    const total = width(leftPlain) + gap + width(rightPlain);
    const painted = `${rail.painted}${join('left', true)}${' '.repeat(gap)}${join('right', true)}`;
    if (total <= maxCells && painted.length <= MAX_LINE_CHARACTERS) return painted;
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
      const excess = painted.length - MAX_LINE_CHARACTERS;
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

// The figures in the family order: model [effort] │ ctx [█▎░] n%/size, then the automatic handoff percent,
// the session's cost and the Git branch, each left out when Grok did not send it.
function figureSegments(status, { glyphs, paint, handoff }) {
  const model = plainText(status?.model?.display_name, plainText(status?.model?.id, 'grok'));
  const effort = effortLevel(status?.effort?.level);
  const percent = finitePercent(status?.context_window?.used_percentage);
  const size = windowSize(status?.context_window?.context_window_size);
  const accent = (text) => paint.fg(text, 'accent');
  // A narrow row clips the model name and keeps the effort beside it; the narrowest give it up for the gauge.
  const tail = effort ? ` [${effort}]` : '';
  const segments = [segment(`${model}${tail}`, accent, {
    drop: 0.5, clip: 2, minCells: width(tail) + 1, shrink: (cells) => `${clipCells(model, Math.max(1, cells - width(tail)), glyphs.ellipsis)}${tail}`,
  })];
  if (percent === null) {
    segments.push(segment(`ctx ?${size ? `/${size}` : ''}`, accent));
  } else {
    const band = bandOf(percent);
    const bar = blockBar(percent, 3, glyphs);
    const figure = `${percent}%${size ? `/${size}` : ''}`;
    segments.push(segment(`ctx [${bar.filled}${bar.empty}] ${figure}`, () => (
      `${accent('ctx [')}${paint.fg(bar.filled, band)}${paint.fg(bar.empty, 'empty')}${accent(']')} ${paint.fg(figure, band)}`)));
  }
  if (handoff.active) segments.push(segment(`handoff@${handoff.percent}%`, accent, { drop: 4 }));
  const cost = status?.cost?.total_cost_usd;
  // Grok's own row hides a cost under half a cent so it never shows a misleading $0.00.
  if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0.005) {
    segments.push(segment(`$${cost < 100 ? cost.toFixed(2) : Math.round(cost)}`, accent, { drop: 3 }));
  }
  const branch = plainText(status?.workspace?.branch, '');
  if (branch) {
    const worktree = plainText(status?.workspace?.git_worktree, '');
    segments.push(segment(`${glyphs.git}${clipCells(branch, 32, glyphs.ellipsis)}${worktree ? ` ${glyphs.dot} ${clipCells(worktree, 20, glyphs.ellipsis)}` : ''}`, accent, { drop: 5 }));
  }
  return segments;
}

function brandText(version, glyphs) {
  return `[${glyphs.fire}LIT${version ? ` v${version}` : ''}]`;
}

// The family mark: bold, the fire and the brackets in the terminal's own colour, L, I and T on the
// gradient, the version in its last stop. 256 colours make it bold magenta and 16 colours bold cyan.
function brandSegment(version, glyphs, paint, options = {}) {
  const paintBrand = (text) => {
    if (!paint.depth) return text;
    if (paint.depth === 256) return `\u001b[0m\u001b[1m\u001b[38;5;201m${text}\u001b[0m`;
    if (paint.depth === 16) return `\u001b[0m\u001b[1m\u001b[36m${text}\u001b[0m`;
    const at = text.indexOf('LIT');
    const letters = [...'LIT'].map((letter, index) => `${sgr(BRAND_STOPS[index], 24)}${letter}`).join('');
    return `\u001b[0m\u001b[1m${text.slice(0, at)}${letters}${sgr(BRAND_STOPS[2], 24)}${text.slice(at + 3)}\u001b[0m`;
  };
  // A narrow row lets the version go before anything else on the mark.
  return segment(brandText(version, glyphs), paintBrand, { ...options, shrink: () => brandText('', glyphs) });
}

// The discipline keeps to 24 cells (32 for the longest skill name) so the line stays far below Grok's
// 1024-character cut.
function disciplineName(name, glyphs, cells = Infinity) {
  return clipCells(name, Math.min(cells, name === 'lit-scientific-visualization' ? 32 : 24), glyphs.ellipsis);
}

// The look registry: a discipline maps to one look, and every route that runs a skill goes through
// the collector's discipline, so bare words, slash commands, skill loads and aliases all select it.
// Grok's one line can only tint and label, so a look is a tint plus a label (the card adds the pill).
const LOOKS = { 'lit-adhd': 'rewind', 'review-work': 'lanes' };
function lookOf(discipline, stage = null) {
  if (typeof discipline === 'string' && Object.hasOwn(LOOKS, discipline)) return LOOKS[discipline];
  if (stage === 'review') return 'lanes';
  return 'plain';
}

// review-work's six lanes. Progress is real only: the test lane follows the workflow test verdict
// and a lane with no report stays dim, never a fake fill.
const REVIEW_LANES = ['behavior', 'test', 'safety', 'integration', 'documentation', 'regression'];
function laneStates(workflow) {
  const verdict = workflow?.test?.verdict;
  return REVIEW_LANES.map((name) => ({
    name,
    state: name === 'test' && (verdict === 'pass' || verdict === 'fail') ? verdict : 'unreported',
  }));
}

// Waiting on the user: a held plan gate (the typed start-work boundary) or a live Ask tool call.
// The next UserPromptSubmit starts a new turn, so the label stops the moment the user types.
function waitingOf(activity) {
  if (!activity) return null;
  if (activity.planGate) return { reason: 'plan gate' };
  if (activity.live?.name === 'ask_user_question') return { reason: 'question' };
  return null;
}

// The ignition mark of the one-line row: the pink 🔥 LIT chip, then IGNITED · <discipline> 🔥 in the accent.
// Without colour it reads 🔥 LIT IGNITED · <discipline> 🔥. A narrow row clips the discipline, never the frame.
// While lit-adhd is the discipline the mark keeps its shape but the discipline rides a hue that turns
// (one still rainbow frame when the HUD motion is off): the tint, never a flash.
function ignitionSegment(discipline, glyphs, paint, nerd, options = {}) {
  const label = glyphs.fire ? `${glyphs.fire} LIT` : 'LIT';
  const brand = chip(label, 'pink', paint, nerd, '', '');
  const build = (name) => `${brand.plain} IGNITED ${glyphs.dot} ${name}${glyphs.fire ? ` ${glyphs.fire}` : ''}`;
  const frame = width(build(''));
  const ignitionLook = options.look ?? lookOf(discipline);
  if (ignitionLook === 'rewind') {
    // Each cell of the mark past the brand rides its own step round the wheel (one still rainbow
    // frame when the HUD motion is off): the tint, never a flash.
    const motion = hudMotion();
    const when = options.now ?? Date.now();
    const rainbow = (text) => {
      const cells = [...text];
      return cells.map((cell, index) => paint.hue(cell, rewindCellRgb(when, motion, index, cells.length), true)).join('');
    };
    return segment(build(disciplineName(discipline, glyphs)), (text) => `${brand.painted}${rainbow(text.slice(brand.plain.length))}`, {
      ...options, minCells: frame + 1, shrink: (cells) => build(disciplineName(discipline, glyphs, Math.max(1, cells - frame))),
    });
  }
  if (ignitionLook === 'lanes') {
    const lanes = options.lanes ?? laneStates(null);
    const reported = lanes.filter((lane) => lane.state !== 'unreported').length;
    const full = build(`REVIEW ${reported}/${lanes.length}`);
    return segment(full, (text) => `${brand.painted}${paint.fg(text.slice(brand.plain.length), 'accent', true)}`, {
      ...options, minCells: frame + 1,
      shrink: (cells) => (cells < width(full) ? clipCells(full, Math.max(1, cells), glyphs.ellipsis) : full),
    });
  }
  return segment(build(disciplineName(discipline, glyphs)), (text) => `${brand.painted}${paint.fg(text.slice(brand.plain.length), 'accent', true)}`, {
    ...options, minCells: frame + 1, shrink: (cells) => build(disciplineName(discipline, glyphs, Math.max(1, cells - frame))),
  });
}

// Joins the figures to a line: `|` after the mark, `│` between the rest, all in the accent.
function figureLeads(figures, glyphs, paint, afterMark) {
  return figures.map((item, index) => {
    const lead = ` ${glyphs.sep} `;
    return { ...item, lead, leadPainted: paint.fg(lead, 'accent'), firstLead: afterMark ? { lead: ' | ', leadPainted: paint.fg(' | ', 'accent') } : null };
  });
}

// One row: the mark, model [effort] │ ctx, the ignition mark while a discipline is active, then the
// handoff percent, cost and branch. It is the whole HUD between workflows and in LITGROK_HUD_LINES=1
// mode. A narrow row gives up the branch, the handoff percent, the cost and the version, then clips the
// model name and last the discipline.
function compactRow({ status, discipline, version, glyphs, paint, nerd, handoff, maxCells, looks = null, phase = null }) {
  const [model, context, ...extras] = figureSegments(status, { glyphs, paint, handoff });
  const figures = [model, context];
  if (discipline) {
    figures.push(looks?.look === 'lanes'
      ? ignitionSegment(discipline, glyphs, paint, nerd, { clip: 1, lanes: looks.lanes, look: looks.look })
      : ignitionSegment(discipline, glyphs, paint, nerd, { clip: 1 }));
  }
  figures.push(...extras);
  const left = [brandSegment(version, glyphs, paint, { clip: 3 }), ...figureLeads(figures, glyphs, paint, true)];
  const right = [];
  if (looks?.waiting) right.push(segment(`YOUR TURN · ${looks.waiting.reason}`, (text) => paint.fg(text, 'yellow', true), {
    drop: 0.6, clip: 3, minCells: width('YOUR TURN'),
    shrink: (cells) => (cells < width(`YOUR TURN · ${looks.waiting.reason}`) ? clipCells('YOUR TURN', Math.max(1, cells), glyphs.ellipsis) : `YOUR TURN · ${looks.waiting.reason}`),
  }));
  if (looks?.burst) right.push(segment(`${glyphs.burst} complete${phase?.timer ? ` ${phase.timer}` : ''}`, (text) => paint.fg(text, 'pink', true), { drop: 1 }));
  return layoutLine({ left, right, separator: { plain: ' ', painted: ' ' }, rail: { plain: '', painted: '' }, maxCells, ellipsis: glyphs.ellipsis });
}

// The current stage's label: its name, the plan's checked tasks while working, and a tick once the
// stage's turn has ended (for work, only once every task is checked).
function stageLabel(workflow, glyphs) {
  if (workflow.stage === 'done') return `done ${glyphs.tick}`;
  const plan = workflow.plan;
  const counter = workflow.stage === 'work' && plan?.total > 0 ? ` ${plan.done}/${plan.total}` : '';
  const finished = workflow.ended && (workflow.stage !== 'work' || (plan?.total > 0 && plan.done === plan.total));
  return `${workflow.stage}${counter}${finished ? ` ${glyphs.tick}` : ''}`;
}

// The stage map as the family card draws it: interview ✓ ━━ plan ✓ ━━ [work 3/7] ━━ review · ── done ·.
// Stages behind are dim with a tick when the session went through them, the current stage is a chip on the
// accent, the stages ahead are dim with a dot. Rails into a passed or the current stage are accent `━`, the
// rail leaving the current stage is a grey `━` and the rails further on are grey `─`. Interview shows only
// when it happened.
function mapPieces(workflow, { rail, compact }, glyphs) {
  const shown = STAGES.filter((stage) => stage !== 'interview' || workflow.visited.includes('interview') || workflow.stage === 'interview');
  const current = shown.indexOf(workflow.stage);
  const pieces = [];
  shown.forEach((stage, index) => {
    if (index > 0) {
      if (!compact) pieces.push({ text: ' ', role: 'space' });
      for (let cell = 0; cell < rail; cell += 1) {
        const role = index <= current ? 'lit' : index === current + 1 ? 'leaving' : 'ahead';
        pieces.push({ text: role === 'ahead' ? glyphs.unlit : glyphs.lit, role, rail: [index, cell] });
      }
      if (!compact) pieces.push({ text: ' ', role: 'space' });
    }
    if (index === current) pieces.push({ text: stageLabel(workflow, glyphs), role: 'current' });
    else if (index > current) pieces.push({ text: compact ? glyphs.dot : `${stage} ${glyphs.dot}`, role: 'dim' });
    else if (workflow.visited.includes(stage)) pieces.push({ text: compact ? glyphs.tick : `${stage} ${glyphs.tick}`, role: 'dim' });
    else pieces.push({ text: compact ? glyphs.unlit : stage, role: 'dim' });
  });
  return { pieces, current };
}

// While a turn runs, one pink cell rides the rail into the current stage and moves on at each redraw
// (Grok redraws about every 300 ms during a turn).
function renderMap(workflow, tier, { paint, glyphs, nerd, running, now }) {
  const { pieces, current } = mapPieces(workflow, tier, glyphs);
  const pill = (text) => chip(text, 'accent', paint, nerd, '[', ']');
  const plain = pieces.map(({ text, role }) => (role === 'current' ? pill(text).plain : text)).join('');
  if (!paint.depth) return { plain, painted: plain };
  const head = running ? [current > 0 ? current : 1, Math.floor(now / 300) % tier.rail] : null;
  const painted = pieces.map(({ text, role, rail }) => {
    if (role === 'space') return text;
    if (role === 'current') return pill(text).painted;
    if (role === 'dim') return paint.fg(text, 'dim');
    if (head && rail[0] === head[0] && rail[1] === head[1]) return paint.fg(text, 'pink', true);
    return paint.fg(text, role === 'lit' ? 'accent' : 'rail');
  }).join('');
  return { plain, painted };
}

// Narrow rows shorten the rails to two cells and one, then drop the stage names, and last of all keep
// only the current stage.
function mapLine(workflow, context, rail, maxCells) {
  const room = maxCells - width(rail.plain);
  for (const tier of [{ rail: 4 }, { rail: 2 }, { rail: 1 }, { rail: 1, compact: true }]) {
    const map = renderMap(workflow, tier, context);
    if (width(map.plain) <= room && map.painted.length + rail.painted.length <= MAX_LINE_CHARACTERS) return `${rail.painted}${map.painted}`;
  }
  const label = clipCells(stageLabel(workflow, context.glyphs), Math.max(1, room - 2), context.glyphs.ellipsis);
  return `${rail.painted}${chip(label, 'accent', context.paint, context.nerd, '[', ']').painted}`;
}

function toolLabel(name) {
  return Object.hasOwn(TOOL_LABELS, name) ? TOOL_LABELS[name] : clipCells(plainText(name, 'tool'), 20);
}

// The card's left edge: one accent bar per line, so the lines read as one card.
function railFor(paint, glyphs) {
  if (!paint.depth) return { plain: '', painted: '' };
  return { plain: `${glyphs.rail} `, painted: `${paint.fg(glyphs.rail, 'accent')} ` };
}

// The card's title: the mark, the pink 🔥 LIT chip and the discipline, then at the right edge the turn's
// tool calls and subagents beside its state, as the family card's corner reads (● 1m42s running,
// ✓ complete, ⚠ a warning, idle).
function titleLine({ discipline, version, glyphs, paint, nerd, phase, warning, activity, maxCells, rail, now, looks = null }) {
  const brand = chip(glyphs.fire ? `${glyphs.fire} LIT` : 'LIT', 'pink', paint, nerd);
  const name = discipline ?? 'workflow';
  const look = looks?.look ?? lookOf(discipline);
  const lanes = look === 'lanes' ? (looks?.lanes ?? laneStates(null)) : null;
  const reported = lanes ? lanes.filter((lane) => lane.state !== 'unreported').length : 0;
  // The rewind pill rides the wheel cell by cell, like the ignition mark below. The lanes pill
  // names review-work's six lanes; a lane with a verdict takes its colour, the rest stay dim.
  const nameText = look === 'rewind' ? `✺ REWIND ${disciplineName(name, glyphs)}`
    : lanes ? `REVIEW ${lanes.map((lane) => lane.name).join(' · ')}` : `${glyphs.dot} ${disciplineName(name, glyphs)}`;
  const paintLane = (laneName) => {
    const state = lanes.find((lane) => lane.name === laneName)?.state;
    if (state === 'pass') return paint.fg(laneName, 'green', true);
    if (state === 'fail') return paint.fg(laneName, 'red', true);
    return paint.fg(laneName, 'dim');
  };
  const namePaint = look === 'rewind'
    ? (text) => {
      const motion = hudMotion();
      const when = now ?? Date.now();
      const cells = [...text];
      return cells.map((cell, index) => paint.hue(cell, rewindCellRgb(when, motion, index, cells.length), true)).join('');
    }
    : lanes
      ? (text) => {
        const prefix = 'REVIEW ';
        if (!text.startsWith(prefix)) return paint.fg(text, 'accent', true);
        const names = text.slice(prefix.length).split(' · ');
        const painted = names.map((laneName) => (lanes.some((lane) => lane.name === laneName)
          ? paintLane(laneName) : paint.fg(laneName, 'accent', true)));
        return `${paint.fg(prefix, 'accent', true)}${painted.join(paint.fg(' · ', 'dim'))}`;
      }
      : (text) => `${paint.fg(glyphs.dot, 'dim')} ${paint.fg(text.slice(glyphs.dot.length + 1), discipline ? 'accent' : 'dim', Boolean(discipline))}`;
  const shrinkName = lanes
    ? (cells) => {
      const short = `REVIEW ${reported}/${lanes.length}`;
      return cells < width(nameText) ? clipCells(short, Math.max(1, cells), glyphs.ellipsis) : nameText;
    }
    : (cells) => `${glyphs.dot} ${disciplineName(name, glyphs, Math.max(1, cells - width(glyphs.dot) - 1))}`;
  const left = [
    brandSegment(version, glyphs, paint, { clip: 3 }),
    { ...segment(brand.plain, () => brand.painted), lead: ' | ', leadPainted: paint.fg(' | ', 'accent') },
    segment(nameText, namePaint, {
      clip: 0.5, minCells: lanes ? width(`REVIEW ${reported}/${lanes.length}`) : width(glyphs.dot) + 2, shrink: shrinkName,
    }),
  ];
  const right = [];
  if (activity && phase.phase !== 'idle') {
    const parts = activity.tools > 0 ? [glyphs.tools(activity.tools)] : [];
    if (phase.phase === 'running' && activity.agents > 0) parts.push(glyphs.agents(activity.agents));
    if (parts.length > 0) right.push(segment(parts.join(` ${glyphs.dot} `), (text) => paint.fg(text, 'dim'), { drop: 4 }));
  }
  if (looks?.waiting) right.push(segment(`YOUR TURN · ${looks.waiting.reason}`, (text) => paint.fg(text, 'yellow', true), {
    drop: 0.6, clip: 3, minCells: width('YOUR TURN'),
    shrink: (cells) => (cells < width(`YOUR TURN · ${looks.waiting.reason}`) ? clipCells('YOUR TURN', Math.max(1, cells), glyphs.ellipsis) : `YOUR TURN · ${looks.waiting.reason}`),
  }));
  else if (warning) right.push(segment(`${glyphs.warn} ${warning[1]}`, (text) => paint.fg(text, 'yellow', true), { drop: 1 }));
  if (phase.phase === 'running') right.push(segment(`${glyphs.run} ${phase.timer ? `${glyphs.timer}${phase.timer}` : 'running'}`, (text) => paint.fg(text, 'accent', true), { drop: 2 }));
  else if (phase.phase === 'complete') {
    if (looks?.burst) right.push(segment(`${glyphs.burst} complete ${phase.timer}`, (text) => paint.fg(text, 'pink', true), { drop: 2 }));
    else right.push(segment(`${glyphs.tick} complete ${phase.timer}`, (text) => paint.fg(text, 'green', true), { drop: 2 }));
  } else if (!warning && !looks?.waiting) right.push(segment('idle', (text) => paint.fg(text, 'dim'), { drop: 2 }));
  return layoutLine({ left, right, separator: { plain: ' ', painted: ' ' }, rail, maxCells, ellipsis: glyphs.ellipsis });
}

// The detail line: checked plan tasks with the next one, the last test verdict and the long form of a
// warning on the left; the tool in flight with its clock on the right.
function detailLine({ workflow, live, warning, glyphs, paint, now, maxCells, rail }) {
  const left = [];
  const plan = workflow?.plan;
  if (plan?.total > 0) {
    const cells = Math.min(plan.total, 10);
    const filled = Math.round((plan.done / plan.total) * cells);
    const bar = `${glyphs.full.repeat(filled)}${glyphs.empty.repeat(cells - filled)}`;
    left.push(segment(`task ${plan.done}/${plan.total} ${bar}`, () => `${paint.fg('task ', 'dim')}${paint.fg(`${plan.done}/${plan.total}`, 'accent', true)} ${paint.fg(glyphs.full.repeat(filled), 'accent')}${paint.fg(glyphs.empty.repeat(cells - filled), 'empty')}`));
    if (typeof plan.next === 'string' && plan.next && plan.done < plan.total) {
      const lead = `next ${glyphs.next} `;
      const title = plainText(plan.next, '');
      left.push(segment(`${lead}${title}`, (text) => `${paint.fg(lead, 'dim')}${paint.fg(text.slice(lead.length), 'accent')}`, {
        drop: 5, clip: 6, minCells: width(lead) + 8, shrink: (cells) => `${lead}${clipCells(title, cells - width(lead), glyphs.ellipsis)}`,
      }));
    }
  }
  if (workflow?.test) {
    const pass = workflow.test.verdict === 'pass';
    left.push(segment(`tests ${pass ? glyphs.tick : glyphs.cross}${workflow.test.count === undefined ? '' : ` ${workflow.test.count}`}`, (text) => paint.fg(text, pass ? 'green' : 'red', true), { drop: 3 }));
  }
  if (warning) left.push(segment(`${glyphs.warn} ${warning[0]}`, (text) => paint.fg(text, 'yellow', true), { drop: 2 }));
  const right = [];
  if (live) {
    const spinner = glyphs.spinner[Math.floor(now / 100) % glyphs.spinner.length];
    // Alone on the line, the tool in flight sits by the elbow rather than across the row.
    (left.length > 0 ? right : left).push(segment(`${spinner} ${toolLabel(live.name)} ${clock(now - live.startedAt)}`, (text) => paint.fg(text, 'accent', true), { drop: 1 }));
  }
  if (left.length === 0 && right.length === 0) return null;
  const elbow = { plain: `${rail.plain}${glyphs.elbow} `, painted: `${rail.painted}${paint.fg(`${glyphs.elbow} `, 'dim')}` };
  return layoutLine({ left, right, separator: { plain: ` ${glyphs.dot} `, painted: paint.fg(` ${glyphs.dot} `, 'dim') }, rail: elbow, maxCells, ellipsis: glyphs.ellipsis });
}

function figuresLine({ status, glyphs, paint, handoff, maxCells, rail }) {
  return layoutLine({
    left: figureLeads(figureSegments(status, { glyphs, paint, handoff }), glyphs, paint, false),
    separator: { plain: ' ', painted: ' ' },
    rail,
    maxCells,
    ellipsis: glyphs.ellipsis,
  });
}

function render(input) {
  try {
    recordContextForHandoff(input);
  } catch {
    // The row must always render; a failed record only means this refresh adds nothing for the handoff.
  }
  const cwd = typeof input?.cwd === 'string' ? input.cwd : '';
  let record = null;
  try {
    record = readHudRecordForCwd(cwd);
  } catch {
    record = null;
  }
  const discipline = record?.discipline ?? null;
  const colorSetting = process.env.LITGROK_HUD_COLOR;
  const depth = colorSetting === '0' || Object.hasOwn(process.env, 'NO_COLOR') ? 0 : colorSetting === '256' ? 256 : colorSetting === '16' ? 16 : 24;
  const paint = painter(depth);
  const glyphSetting = process.env.LITGROK_HUD_GLYPHS;
  const glyphs = Object.hasOwn(GLYPHS, glyphSetting ?? '') ? GLYPHS[glyphSetting] : GLYPHS.basic;
  const nerd = glyphSetting === 'nerd';
  // Grok sets COLUMNS to the width of the row; without it the row keeps to 79 cells.
  const columns = Number.parseInt(process.env.COLUMNS ?? '', 10);
  const maxCells = Number.isFinite(columns) && columns >= 20 ? Math.min(columns, 1000) - 1 : 79;
  let handoff = { active: false, percent: null };
  try {
    handoff = resolveAutoHandoff({ env: process.env, dirs: statusDirs(input) });
  } catch {
    handoff = { active: false, percent: null };
  }
  const version = installedVersion();
  const now = Date.now();
  const shared = { status: input, discipline, version, glyphs, paint, nerd, handoff, maxCells, now };
  let activity = null;
  try {
    activity = turnActivity(readLedgerTail(input), input?.prompt_id);
  } catch {
    activity = null;
  }
  let workflow = null;
  try {
    workflow = readWorkflow(input);
  } catch {
    workflow = null;
  }
  const turn = turnState(input, activity, now);
  const phase = phaseOf(now, activity, turn);
  const looks = {
    look: lookOf(discipline, workflow?.stage ?? null),
    lanes: laneStates(workflow),
    waiting: waitingOf(activity),
    burst: phase.phase === 'complete' && workflow?.stage === 'done',
  };
  if (process.env.LITGROK_HUD_LINES === '1') return [compactRow({ ...shared, looks, phase })];
  // The card shows while a discipline is active or the session has a workflow stage; otherwise the
  // HUD is the single row.
  if (!discipline && !workflow?.stage) return [compactRow({ ...shared, looks, phase })];
  const warning = warningText(input, activity, handoff);
  const live = turn.running ? activity?.live ?? null : null;
  const rail = railFor(paint, glyphs);
  const lines = [titleLine({ ...shared, phase, warning, activity: phase.phase === 'idle' ? null : activity, rail, looks })];
  if (workflow?.stage) lines.push(mapLine(workflow, { paint, glyphs, nerd, running: turn.running, now }, rail, maxCells));
  const detail = detailLine({ workflow, live, warning, glyphs, paint, now, maxCells, rail });
  if (detail) lines.push(detail);
  lines.push(figuresLine({ ...shared, rail }));
  return lines;
}


const input = await readInput();
let lines;
try {
  lines = render(input);
} catch {
  // Never a blank row and never a stack trace: the brand alone says the HUD is alive.
  lines = [`[🔥LIT${installedVersion() ? ` v${installedVersion()}` : ''}] | ${plainText(input?.model?.display_name, 'grok')}`];
}
process.stdout.write(`${lines.join('\n')}\n`);
