#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAutoHandoff } from './auto-handoff.mjs';
import { readHudRecordForCwd, writeContextRecord } from './litgrok-hud-state.mjs';

const MAX_INPUT_BYTES = 64 * 1024;
const GRADIENT_STOPS = [[255, 99, 55], [255, 45, 149], [0, 229, 255]];
const BRAND_COLOR = [255, 99, 55];
// Grok cuts each line at 1024 characters, escapes included.
const MAX_LINE_CHARACTERS = 1024;
const RECORD_SCHEMA = 'litgrok.hook-event/v1';
// The ribbon reads only the end of the session ledger, enough for a few hundred records.
const LEDGER_TAIL_BYTES = 128 * 1024;
const COMPLETE_SHOWN_MS = 20 * 1000;
const HANDOFF_NEAR_POINTS = 10;
const CLOCK_SKEW_MS = 5 * 1000;
const TOOL_EVENTS = new Set(['PostToolUse', 'PostToolUseFailure']);
// [background, foreground] of each pill.
const PILLS = {
  brand: [[255, 45, 149], [18, 6, 12]],
  running: [[10, 166, 194], [0, 19, 24]],
  complete: [[29, 77, 54], [184, 245, 207]],
  warning: [[90, 58, 8], [255, 210, 138]],
};
const TEXT = { dim: [139, 148, 158], amber: [255, 175, 60], green: [107, 219, 143] };
const GLYPHS = {
  basic: { running: '●', complete: '✓', warning: '⚠', timer: '', tools: (n) => `${n} tool${n === 1 ? '' : 's'}`, agents: (n) => `${n} agent${n === 1 ? '' : 's'}` },
  nerd: { running: '\uf111', complete: '\uf00c', warning: '\uf071', timer: '\uf017 ', tools: (n) => `\uf0ad ${n}`, agents: (n) => `\uf0c0 ${n}` },
};
const ANSI_16 = [[0, 0, 0], [205, 0, 0], [0, 205, 0], [205, 205, 0], [0, 0, 238], [205, 0, 205], [0, 205, 205], [229, 229, 229],
  [127, 127, 127], [255, 0, 0], [0, 255, 0], [255, 255, 0], [92, 92, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];

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

function contextBar(percent) {
  const exact = (percent * 3) / 100;
  const filled = Math.floor(exact);
  const partialBlocks = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'];
  const partial = filled < 3 && exact > filled ? Math.max(1, Math.min(7, Math.round((exact - filled) * 8))) : 0;
  return `${'█'.repeat(filled)}${partialBlocks[partial]}${'░'.repeat(3 - filled - (partial > 0 ? 1 : 0))}`;
}

// A percent Grok did not send shows as ?, never as a guess.
function contextText(contextWindow) {
  const size = windowSize(contextWindow?.context_window_size);
  const value = contextWindow?.used_percentage;
  if (typeof value !== 'number' || !Number.isFinite(value)) return size ? `ctx ?/${size}` : 'ctx ?';
  const percent = Math.round(Math.max(0, Math.min(100, value)));
  return `ctx [${contextBar(percent)}] ${percent}%${size ? `/${size}` : ''}`;
}

function cellWidth(character) {
  if (/\p{Mark}/u.test(character) || character === '\u200d') return 0;
  return /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(character) ? 2 : 1;
}

function width(text) {
  return [...text].reduce((total, character) => total + cellWidth(character), 0);
}

function clipCells(text, maximum) {
  let result = '';
  let used = 0;
  let truncated = false;
  for (const character of text) {
    const cells = cellWidth(character);
    if (used + cells > maximum || result.length + character.length > 78) {
      truncated = true;
      break;
    }
    result += character;
    used += cells;
  }
  if (truncated && maximum > 0) {
    while (result && (width(result) + 1 > maximum || result.length >= 78)) result = [...result].slice(0, -1).join('');
    result += '…';
  }
  return result;
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

function gradientColor(position) {
  const stop = position <= 0.5 ? 0 : 1;
  const fraction = position <= 0.5 ? position * 2 : (position - 0.5) * 2;
  return GRADIENT_STOPS[stop].map((value, index) => Math.round(value + (GRADIENT_STOPS[stop + 1][index] - value) * fraction));
}

// Bold is set once and each letter only changes the colour, so the longest label stays far below the cut.
function paintLabel(text, depth) {
  const characters = [...text];
  return `\u001b[1m${characters.map((character, index) => {
    if (character === ' ') return character;
    const position = characters.length === 1 ? 0 : index / (characters.length - 1);
    return `${sgr(gradientColor(position), depth)}${character}`;
  }).join('')}\u001b[0m`;
}

function formatRow({ discipline, model, effort, context, version }, depth, maxCells) {
  const brand = `[🔥LIT${version ? ` v${version}` : ''}]`;
  const suffix = `${effort ? ` [${effort}]` : ''} │ ${context}`;
  let ignition = '';
  let ignitionText = '';
  if (discipline) {
    // The skill name gives way after the model, and the model keeps at least its ellipsis.
    const room = maxCells - width(`${brand} 🔥 LIT IGNITED ·  🔥 | ${suffix}`) - 1;
    const maxDisciplineCells = Math.max(1, Math.min(discipline === 'lit-scientific-visualization' ? 32 : 24, room));
    const label = `LIT IGNITED · ${clipCells(discipline, maxDisciplineCells)}`;
    ignitionText = ` 🔥 ${label} 🔥`;
    ignition = ` 🔥 ${depth ? paintLabel(label, depth) : label} 🔥`;
  }
  const modelText = clipCells(model, Math.max(1, maxCells - width(`${brand}${ignitionText} | ${suffix}`)));
  return `${depth ? `\u001b[1m${sgr(BRAND_COLOR, depth)}${brand}\u001b[0m` : brand}${ignition} | ${modelText}${suffix}`;
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
  const ended = last?.event === 'Stop' && !held(last);
  return {
    startedAt: Date.parse(records[start].recordedAt),
    endedAt: ended ? Date.parse(last.recordedAt) : null,
    tools: turn.filter((record) => TOOL_EVENTS.has(record.event)).length,
    agents: Math.max(0, count('SubagentStart') - count('SubagentStop')),
    planGate: !ended && turn.some((record) => record.signal === 'plan-gate-block'),
    handoffAsked: !ended && turn.some((record) => record.signal === 'auto-handoff-directive'),
  };
}

function duration(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
  return `${Math.floor(seconds / 3600)}h${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m`;
}

// Returns [long, short] warning text, or null. A plan-gate hold comes first, then a handoff request,
// then a context at or near the automatic-handoff percent.
function warningText(status, activity) {
  if (activity?.planGate) return ['plan gate: save plans/<slug>.md', 'plan gate'];
  if (activity?.handoffAsked) return ['handoff requested', 'handoff'];
  const used = status?.context_window?.used_percentage;
  if (typeof used !== 'number' || !Number.isFinite(used)) return null;
  const settings = resolveAutoHandoff({ env: process.env, dirs: statusDirs(status) });
  if (!settings.active) return null;
  const percent = Math.round(Math.max(0, Math.min(100, used)));
  if (percent >= settings.percent) return [`ctx ${percent}% ≥ handoff at ${settings.percent}%`, `ctx ${percent}%≥${settings.percent}%`];
  if (percent >= settings.percent - HANDOFF_NEAR_POINTS) return [`ctx ${percent}% → handoff at ${settings.percent}%`, `ctx ${percent}%→${settings.percent}%`];
  return null;
}

function bandState(status, now) {
  const started = status?.turn?.started_at_ms;
  const running = typeof started === 'number' && Number.isFinite(started) && started > 0;
  const activity = turnActivity(readLedgerTail(status), running ? status.prompt_id : undefined);
  const warning = warningText(status, activity);
  let timer = null;
  let state = null;
  if (running) {
    state = 'running';
    if (started <= now + CLOCK_SKEW_MS) timer = duration(Math.max(0, now - started));
  } else if (activity?.endedAt && now - activity.endedAt <= COMPLETE_SHOWN_MS && activity.endedAt <= now + CLOCK_SKEW_MS) {
    state = 'complete';
    timer = duration(Math.max(0, activity.endedAt - activity.startedAt));
  }
  if (state === null && warning === null) return null;
  return { state, timer, warning, activity: running || state === 'complete' ? activity : null };
}

function pill(text, kind, depth, nerd) {
  if (!depth) return { plain: `(${text})`, painted: `(${text})` };
  const [background, foreground] = PILLS[kind];
  if (nerd) {
    const cap = (glyph) => `${sgr(background, depth)}${glyph}\u001b[0m`;
    return { plain: `${text}`, painted: `${cap('')}${sgr(background, depth, true)}${sgr(foreground, depth)}\u001b[1m${text}\u001b[0m${cap('')}` };
  }
  return { plain: ` ${text} `, painted: `${sgr(background, depth, true)}${sgr(foreground, depth)}\u001b[1m ${text} \u001b[0m` };
}

function renderBand(discipline, band, depth, nerd, { warningIndex = 0, tools = true, agents = true, timer = true, warning = true, brand = 'full', skillCells = Infinity }) {
  const glyphs = nerd ? GLYPHS.nerd : GLYPHS.basic;
  const kind = band.warning ? 'warning' : band.state === 'complete' ? 'complete' : 'running';
  const pills = [pill(brand === 'full' ? '🔥 LIT' : '🔥', 'brand', depth, nerd), pill(`${glyphs[kind]} ${clipCells(discipline, skillCells)}`, kind, depth, nerd)];
  const items = [];
  const paint = (text, rgb, bold = false) => (depth ? `${bold ? '\u001b[1m' : ''}${sgr(rgb, depth)}${text}\u001b[0m` : text);
  if (band.warning && warning) items.push({ plain: band.warning[warningIndex], painted: paint(band.warning[warningIndex], TEXT.amber, true) });
  if (band.state === 'complete') items.push({ plain: 'complete', painted: paint('complete', TEXT.green, true) });
  if (band.timer && timer) items.push({ plain: `${glyphs.timer}${band.timer}`, painted: paint(`${glyphs.timer}${band.timer}`, TEXT.dim) });
  if (band.activity && tools) items.push({ plain: glyphs.tools(band.activity.tools), painted: paint(glyphs.tools(band.activity.tools), TEXT.dim) });
  if (band.activity && agents && band.state === 'running' && band.activity.agents > 0) {
    items.push({ plain: glyphs.agents(band.activity.agents), painted: paint(glyphs.agents(band.activity.agents), TEXT.dim) });
  }
  const separator = { plain: ' · ', painted: paint(' · ', TEXT.dim) };
  const join = (key) => [pills.map((part) => part[key]).join(' '), items.map((part) => part[key]).join(separator[key])].filter(Boolean).join(' ');
  return { plain: join('plain'), painted: join('painted') };
}

// Narrow rows give up tool calls first, then subagents, the timer, the long warning, the warning itself
// and the brand's name, and last of all clip the skill name.
function formatBand(discipline, band, depth, nerd, maxCells) {
  const tiers = [
    {},
    { tools: false },
    { tools: false, agents: false },
    { tools: false, agents: false, timer: false },
    { tools: false, agents: false, timer: false, warningIndex: 1 },
    { tools: false, agents: false, timer: false, warningIndex: 1, brand: 'compact' },
    { tools: false, agents: false, timer: false, warning: false, brand: 'compact' },
  ];
  for (const tier of tiers) {
    const row = renderBand(discipline, band, depth, nerd, tier);
    if (width(row.plain) <= maxCells && row.painted.length <= MAX_LINE_CHARACTERS) return row.painted;
  }
  const last = tiers.at(-1);
  const room = maxCells - width(renderBand('', band, depth, nerd, { ...last, skillCells: 0 }).plain);
  return renderBand(discipline, band, depth, nerd, { ...last, skillCells: Math.max(1, room) }).painted;
}

const input = await readInput();
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
const model = plainText(input?.model?.display_name, 'grok');
const colorSetting = process.env.LITGROK_HUD_COLOR;
const depth = colorSetting === '0' || Object.hasOwn(process.env, 'NO_COLOR') ? 0 : colorSetting === '256' ? 256 : colorSetting === '16' ? 16 : 24;
// Grok sets COLUMNS to the width of the row; without it the row keeps to 79 cells.
const columns = Number.parseInt(process.env.COLUMNS ?? '', 10);
const maxCells = Number.isFinite(columns) && columns >= 20 ? Math.min(columns, 1000) - 1 : 79;
const row = formatRow({
  discipline,
  model,
  effort: effortLevel(input?.effort?.level),
  context: contextText(input?.context_window),
  version: installedVersion(),
}, depth, maxCells);
// The ribbon is a second line, shown only while a skill is active and a turn runs, has just ended or
// needs attention. LITGROK_HUD_LINES=1 keeps the compact row alone.
let band = null;
if (discipline && process.env.LITGROK_HUD_LINES !== '1') {
  try {
    const state = bandState(input, Date.now());
    if (state) band = formatBand(discipline, state, depth, process.env.LITGROK_HUD_GLYPHS === 'nerd', maxCells);
  } catch {
    band = null;
  }
}
process.stdout.write(band ? `${row}\n${band}\n` : `${row}\n`);
