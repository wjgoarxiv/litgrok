#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync, readSync, realpathSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAutoHandoff } from './auto-handoff.mjs';
import { drawsRoundCaps, hasIconFont, readHudSettings } from './lit-caps.mjs';
import { cardLines, gauge } from './lit-card.mjs';
import { rewindCellRgb } from './lit-mark.mjs';
import { MAX_LINE_CHARACTERS, ROLES, bandOf, cellWidth, clipCells, clock, duration, layoutLine, painter, plainText, segment, sgr, width } from './lit-layout.mjs';
import { blend, paintSunset } from './lit-sunset.mjs';
import { CHROME } from './lit-synthwave.mjs';
import { readHudRecordForCwd, rememberedIconFont, writeContextRecord } from './litgrok-hud-state.mjs';
import { readOtherSessions } from './session-rows.mjs';
import { STAGES, readWorkflowState } from './workflow-stage.mjs';

const MAX_INPUT_BYTES = 64 * 1024;
// The truecolor [🔥LIT] pill runs from the second to the fifth stop of the synthwave chrome.
const PILL_STOPS = [CHROME[1], CHROME[4]].map((hex) => [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16)));
// Truecolor only: the 🔥 LIT chip runs from orange to pink, the current-stage chip from violet to the accent, and
// the card's edge from pink through violet to the accent.
const VIOLET = [180, 140, 255];
const CHIP_STOPS = { pink: [[255, 154, 60], ROLES.pink], accent: [VIOLET, ROLES.accent] };
const CHIP_STEPS = 4;
const FAINT_EDGE = [48, 54, 61];
// Grok shows five lines and cuts each at 1024 characters, escapes included.
const MAX_LINES = 5;
const RECORD_SCHEMA = 'litgrok.hook-event/v1';
// The card reads only the end of the session ledger, enough for a few hundred records.
const LEDGER_TAIL_BYTES = 128 * 1024;
const COMPLETE_SHOWN_MS = 20 * 1000;
const HANDOFF_NEAR_POINTS = 10;
const CLOCK_SKEW_MS = 5 * 1000;
// A turn the ledger has not heard from for this long is no longer shown as running.
const LEDGER_TURN_QUIET_MS = 10 * 60 * 1000;
const TOOL_EVENTS = new Set(['PostToolUse', 'PostToolUseFailure']);
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

// The rewind look's motion: 'full' cycles the hue, 'subtle' drifts it slowly, 'off' holds one still
// rainbow frame. Anything else is 'full'.
function hudMotion(env = process.env) {
  const motion = (env.LITGROK_HUD_MOTION ?? 'full').toLowerCase();
  return motion === 'off' || motion === 'subtle' ? motion : 'full';
}

// A filled chip on the pink (the brand) or the accent (the current stage) with dark text and a space of
// padding each side; a Nerd Font gives it rounded caps, and without colour it falls back to brackets.
function chip(text, background, paint, round, open = '(', close = ')') {
  if (!paint.depth) return { plain: `${open}${text}${close}`, painted: `${open}${text}${close}` };
  const fill = `${sgr(ROLES[background], paint.depth, true)}${sgr(ROLES.ink, paint.depth)}\u001b[1m`;
  if (!round) return { plain: ` ${text} `, painted: `${fill} ${text} \u001b[0m` };
  const cap = (glyph) => `${sgr(ROLES[background], paint.depth)}${glyph}\u001b[0m`;
  return { plain: `${text}`, painted: `${cap('')}${fill}${text}\u001b[0m${cap('')}` };
}

function blockBar(percent, cells, glyphs) {
  const [full, empty, partials] = glyphs.bar;
  const exact = (percent * cells) / 100;
  const filled = Math.floor(exact);
  const partial = partials.length > 1 && filled < cells && exact > filled ? Math.max(1, Math.min(partials.length - 1, Math.round((exact - filled) * partials.length))) : 0;
  return { filled: `${full.repeat(filled)}${partials[partial]}`, empty: empty.repeat(cells - filled - (partial > 0 ? 1 : 0)) };
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

// The figures as plain values, for the card's bottom edge.
function figuresOf(status, glyphs, handoff) {
  const cost = status?.cost?.total_cost_usd;
  const branch = plainText(status?.workspace?.branch, '');
  const worktree = plainText(status?.workspace?.git_worktree, '');
  return {
    model: plainText(status?.model?.display_name, plainText(status?.model?.id, 'grok')),
    effort: effortLevel(status?.effort?.level),
    percent: finitePercent(status?.context_window?.used_percentage),
    size: windowSize(status?.context_window?.context_window_size),
    handoff: handoff.active ? handoff.percent : null,
    cost: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0.005 ? `$${cost < 100 ? cost.toFixed(2) : Math.round(cost)}` : '',
    branch: branch ? `${clipCells(branch, 32, glyphs.ellipsis)}${worktree ? ` ${glyphs.dot} ${clipCells(worktree, 20, glyphs.ellipsis)}` : ''}` : '',
  };
}

// The figures in the family order: model [effort] │ ctx [█▎░] n%/size, then the automatic handoff percent,
// the session's cost and the Git branch, each left out when Grok did not send it.
function figureSegments(status, { glyphs, paint, handoff, round = false }) {
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
    if (round) segments.push(segment(`ctx ${' '.repeat(5)} ${figure}`, () => `${accent('ctx ')}${gauge(percent, 5, ROLES[band], true)} ${paint.fg(figure, band)}`));
    else segments.push(segment(`ctx [${bar.filled}${bar.empty}] ${figure}`, () => (
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

// The family mark. In truecolor it is a pill: bold dark ink on a gradient from the second to the fifth
// stop of LitGrok's synthwave chrome, one background step per cell, with a space in place of each bracket
// (the same cells). 256 colours make it bold magenta and 16 colours bold cyan, brackets kept.
function brandSegment(version, glyphs, paint, { round = false, ...options } = {}) {
  const paintBrand = (text) => {
    if (!paint.depth) return text;
    if (paint.depth === 256) return `\u001b[0m\u001b[1m\u001b[38;5;201m${text}\u001b[0m`;
    if (paint.depth === 16) return `\u001b[0m\u001b[1m\u001b[36m${text}\u001b[0m`;
    const cells = [...text.replace(/^\[/u, ' ').replace(/\]$/u, ' ')];
    const fill = (index) => PILL_STOPS[0].map((value, at) => Math.round(value + (PILL_STOPS[1][at] - value) * (cells.length > 1 ? index / (cells.length - 1) : 0)));
    const body = (from, to) => `\u001b[1m${sgr(ROLES.pillInk, 24)}${cells.slice(from, to).map((cell, at) => `${sgr(fill(from + at), 24, true)}${cell}`).join('')}\u001b[0m`;
    const last = cells.length - 1;
    // Round caps take the two padding cells.
    return round ? `${sgr(fill(0), 24)}\ue0b6\u001b[0m${body(1, last)}${sgr(fill(last), 24)}\ue0b4\u001b[0m` : `\u001b[0m${body(0, last + 1)}`;
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
function ignitionSegment(discipline, glyphs, paint, round, options = {}) {
  const label = glyphs.fire ? `${glyphs.fire} LIT` : 'LIT';
  const brand = chip(label, 'pink', paint, round, '', '');
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
function compactRow({ status, discipline, version, glyphs, paint, round, handoff, maxCells, looks = null, phase = null }) {
  const [model, context, ...extras] = figureSegments(status, { glyphs, paint, handoff, round });
  const figures = [model, context];
  if (discipline) {
    figures.push(looks?.look === 'lanes'
      ? ignitionSegment(discipline, glyphs, paint, round, { clip: 1, lanes: looks.lanes, look: looks.look })
      : ignitionSegment(discipline, glyphs, paint, round, { clip: 1 }));
  }
  figures.push(...extras);
  const left = [brandSegment(version, glyphs, paint, { clip: 3, round }), ...figureLeads(figures, glyphs, paint, true)];
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
    else if (workflow.visited.includes(stage)) pieces.push({ text: compact ? glyphs.tick : `${stage} ${glyphs.tick}`, role: 'dim', behind: true });
    else pieces.push({ text: compact ? glyphs.unlit : stage, role: 'dim' });
  });
  return { pieces, current };
}

// While a turn runs, one pink cell rides the rail into the current stage and moves on at each redraw
// (Grok redraws about every 300 ms during a turn).
function renderMap(workflow, tier, { paint, glyphs, round, running, now }) {
  const { pieces, current } = mapPieces(workflow, tier, glyphs);
  const pill = (text) => chip(text, 'accent', paint, round, '[', ']');
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
  return `${rail.painted}${chip(label, 'accent', context.paint, context.round, '[', ']').painted}`;
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
function titleLine({ discipline, version, glyphs, paint, round, phase, warning, activity, maxCells, rail, now, looks = null }) {
  const brand = chip(glyphs.fire ? `${glyphs.fire} LIT` : 'LIT', 'pink', paint, round);
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
    brandSegment(version, glyphs, paint, { clip: 3, round }),
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
function detailLine({ workflow, live, warning, glyphs, paint, now, maxCells, rail, round = false }) {
  const left = [];
  const plan = workflow?.plan;
  if (plan?.total > 0) {
    const cells = round ? Math.max(4, Math.min(plan.total, 10)) : Math.min(plan.total, 10);
    const filled = Math.round((plan.done / plan.total) * cells);
    const bar = `${glyphs.full.repeat(filled)}${glyphs.empty.repeat(cells - filled)}`;
    left.push(segment(`task ${plan.done}/${plan.total} ${bar}`, () => `${paint.fg('task ', 'dim')}${paint.fg(`${plan.done}/${plan.total}`, 'accent', true)} ${round ? gauge((plan.done / plan.total) * 100, cells, ROLES.accent, true) : `${paint.fg(glyphs.full.repeat(filled), 'accent')}${paint.fg(glyphs.empty.repeat(cells - filled), 'empty')}`}`));
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

// One row per other session of this workspace: `● start-work · w2B:p2 running`. The name clips first;
// the state word stays.
function otherSessionLine(row, { glyphs, paint, maxCells, rail }) {
  const mark = row.state === 'running' ? glyphs.run : row.state === 'done' ? glyphs.tick : glyphs.dot;
  const role = row.state === 'running' ? 'accent' : row.state === 'done' ? 'green' : 'dim';
  const name = row.pane ? `${plainText(row.label, 'session')} ${glyphs.dot} ${row.pane}` : plainText(row.label, 'session');
  const text = mark ? `${mark} ${name}` : name;
  const lead = mark ? `${mark} ` : '';
  return layoutLine({
    left: [
      segment(text, (value) => paint.fg(value, role, row.state !== 'idle'), {
        clip: 1, minCells: width(lead) + 1, shrink: (cells) => `${lead}${clipCells(name, Math.max(1, cells - width(lead)), glyphs.ellipsis)}`,
      }),
      segment(row.state, (value) => paint.fg(value, role)),
    ],
    separator: { plain: ' ', painted: ' ' },
    rail,
    maxCells,
    ellipsis: glyphs.ellipsis,
  });
}

// The nine skills that make files are LitFamily extensions now. Grok Build ignores a SessionStart hook's stdout, so
// the status row is where a session can say so: one row for the whole first session an installed copy sees, then
// never again. The marker sits beside the install manifest and keeps a hash of that session's id, not the id. It
// stays out of .grok/litgrok/: in a user install that folder is ~/.grok/litgrok/, whose presence makes the
// auto-handoff command count the home folder as a project root.
const EXTENSIONS_NOTICE = 'litfamily-extensions-v1';

function extensionsNoticeSession(sessionId) {
  if (!installedVersion() || typeof sessionId !== 'string' || sessionId === '' || sessionId.length > 512) return false;
  const marker = join(dirname(dirname(fileURLToPath(import.meta.url))), '.litgrok-extensions-notice.json');
  const session = createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
  const noFollow = constants.O_NOFOLLOW ?? 0;
  let descriptor;
  try {
    descriptor = openSync(marker, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
    writeSync(descriptor, `${JSON.stringify({ notice: EXTENSIONS_NOTICE, session })}\n`);
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') return false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  try {
    descriptor = openSync(marker, constants.O_RDONLY | noFollow);
    const status = fstatSync(descriptor);
    if (!status.isFile() || status.size > 1024) return false;
    const buffer = Buffer.alloc(status.size);
    const read = readSync(descriptor, buffer, 0, status.size, 0);
    const record = JSON.parse(buffer.subarray(0, read).toString('utf8'));
    return record?.notice === EXTENSIONS_NOTICE && record.session === session;
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function extensionsSegments(paint) {
  return [
    segment('LitFamily extensions', (text) => paint.fg(text, 'accent', true)),
    segment('github.com/wjgoarxiv/wjgoarxiv-skills', (text) => paint.fg(text, 'accent')),
    segment('litgrok extensions install <skill>', (text) => paint.fg(text, 'accent'), { drop: 1 }),
    segment('decks, documents, figures, design and video covers install beside LitGrok', (text) => paint.fg(text, 'dim'), { drop: 2 }),
  ];
}

function extensionsLine({ glyphs, paint, maxCells, rail }) {
  return layoutLine({
    left: extensionsSegments(paint),
    separator: { plain: ` ${glyphs.dot} `, painted: ` ${paint.fg(glyphs.dot, 'dim')} ` },
    rail,
    maxCells,
    ellipsis: glyphs.ellipsis,
  });
}

function figuresLine({ status, glyphs, paint, handoff, maxCells, rail, round }) {
  return layoutLine({
    left: figureLeads(figureSegments(status, { glyphs, paint, handoff, round }), glyphs, paint, false),
    separator: { plain: ' ', painted: ' ' },
    rail,
    maxCells,
    ellipsis: glyphs.ellipsis,
  });
}

// The truecolor finish of a laid-out line: the same cells in other colours. It comes after the layout, so no word, row or column moves, and a step
// that would push the line past Grok's cut is left out.
function finishLine(line, { glyphs, edge }) {
  const fits = (next) => (next.length <= MAX_LINE_CHARACTERS ? next : line);
  for (const [role, [from, to]] of Object.entries(CHIP_STOPS)) {
    const fill = `${sgr(ROLES[role], 24, true)}${sgr(ROLES.ink, 24)}\u001b[1m`;
    const start = line.indexOf(fill);
    if (start < 0) continue;
    const end = line.indexOf('\u001b[0m', start);
    const cells = [...line.slice(start + fill.length, end)];
    const step = (index) => Math.floor((index / cells.length) * CHIP_STEPS);
    const body = cells.map((cell, index) => (index > 0 && step(index) === step(index - 1)
      ? cell : `${sgr(blend(from, to, step(index) / (CHIP_STEPS - 1)), 24, true)}${cell}`)).join('');
    const cap = (text, rgb) => text.replace(sgr(ROLES[role], 24), sgr(rgb, 24));
    const before = line.slice(0, start);
    const open = `${sgr(ROLES[role], 24)}\ue0b6\u001b[0m`;
    const head = before.endsWith(open) ? `${before.slice(0, -open.length)}${cap(open, from)}` : before;
    const rest = line.slice(end);
    const close = `\u001b[0m${sgr(ROLES[role], 24)}\ue0b4`;
    line = fits(`${head}${sgr(ROLES.ink, 24)}\u001b[1m${body}${rest.startsWith(close) ? `${cap(close, to)}${rest.slice(close.length)}` : rest}`);
  }
  const plainEdge = `${sgr(ROLES.accent, 24)}${glyphs.rail}`;
  return line.startsWith(plainEdge) ? fits(`${sgr(edge, 24)}${line.slice(plainEdge.length - glyphs.rail.length)}`) : line;
}

// A terminal that names a light background (COLORFGBG ends in 7 or 15) keeps the rows as they were.
function lightBackground(env = process.env) {
  return /(?:^|;)(?:7|15)$/u.test(env.COLORFGBG ?? '');
}

// The finished rows with the sunset in the cells they leave free. It stays away from a finished turn and stands
// above the extensions row, and moves only while a turn runs with the motion full.
function dressed(lines, { glyphs, running, now, maxCells, scene, notice, waiting, rewind }) {
  const out = lines.map((line, row) => {
    const share = lines.length > 1 ? (row / (lines.length - 1)) * 2 : 0;
    const edge = share < 1 ? blend(ROLES.pink, VIOLET, share) : blend(VIOLET, ROLES.accent, share - 1);
    return finishLine(line, { glyphs, edge: running ? edge : blend(edge, FAINT_EDGE, 0.45) });
  });
  if (!scene) return out;
  const seconds = running && hudMotion() === 'full' ? now / 1000 : null;
  const under = Math.min(MAX_LINES, out.length - (notice ? 1 : 0));
  const shown = paintSunset(out.slice(0, under), {
    maxCells, cellWidth, seconds, dim: !running, amber: waiting,
    rainbow: rewind ? (cell, cells) => rewindCellRgb(now, seconds === null ? 'off' : 'full', cell, cells) : null,
  });
  return [...shown, ...out.slice(under)];
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
  // Round caps belong to truecolor on a dark background; everything else keeps one square form.
  const framed = depth === 24 && glyphs !== GLYPHS.ascii && !lightBackground();
  const round = framed && drawsRoundCaps(process.env, () => rememberedIconFont(() => hasIconFont(), process.env, Date.now(), readHudSettings().fontCheckedAt));
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
  const shared = { status: input, discipline, version, glyphs, paint, round, handoff, maxCells, now };
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
  const finish = (lines, notice = false) => (!framed ? lines : dressed(lines, {
    glyphs, running: turn.running, now, maxCells,
    scene: phase.phase !== 'complete', notice, waiting: Boolean(looks.waiting), rewind: looks.look === 'rewind',
  }));
  if (process.env.LITGROK_HUD_LINES === '1') return finish([compactRow({ ...shared, looks, phase })]);
  let others = [];
  try {
    others = readOtherSessions(statusDirs(input), input?.session_id, now);
  } catch {
    others = [];
  }
  const rail = railFor(paint, glyphs);
  const otherLines = others.map((row) => otherSessionLine(row, { glyphs, paint, maxCells, rail }));
  let notice = false;
  try {
    notice = extensionsNoticeSession(input?.session_id);
  } catch {
    notice = false;
  }
  if (notice) otherLines.push(extensionsLine({ glyphs, paint, maxCells, rail }));
  if (framed) {
    const live = turn.running ? activity?.live ?? null : null;
    const card = cardLines({
      glyphs, round, phase, activity, workflow, live, looks, discipline, version, now, maxCells, running: turn.running, motion: hudMotion(),
      warning: warningText(input, activity, handoff), figures: figuresOf(input, glyphs, handoff),
      others: others.map((row) => ({ ...row, label: plainText(row.label, 'session'), pane: plainText(row.pane, '') })),
      notice: notice ? extensionsSegments(paint) : null,
      mapAt: (tier) => mapPieces(workflow, tier, glyphs),
      next: workflow?.plan && workflow.plan.done < workflow.plan.total ? plainText(workflow.plan.next, '') : '',
      spinner: glyphs.spinner[Math.floor(now / 100) % glyphs.spinner.length], toolName: live ? toolLabel(live.name) : '',
      shownLines: Number.parseInt(process.env.LINES ?? '', 10) || 0,
    });
    if (card) return card;
  }
  // The card shows while a discipline is active or the session has a workflow stage; otherwise the
  // HUD is the single row, with the other sessions' rows under it.
  if (!discipline && !workflow?.stage) return finish([compactRow({ ...shared, looks, phase }), ...otherLines], notice);
  const warning = warningText(input, activity, handoff);
  const live = turn.running ? activity?.live ?? null : null;
  const lines = [titleLine({ ...shared, phase, warning, activity: phase.phase === 'idle' ? null : activity, rail, looks })];
  if (workflow?.stage) lines.push(mapLine(workflow, { paint, glyphs, round, running: turn.running, now }, rail, maxCells));
  const detail = detailLine({ workflow, live, warning, glyphs, paint, now, maxCells, rail, round });
  if (detail) lines.push(detail);
  lines.push(figuresLine({ ...shared, rail }));
  return finish([...lines, ...otherLines], notice);
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
