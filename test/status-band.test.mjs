import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { writeHudRecords } from '../.grok/hooks/litgrok-hud-state.mjs';

// The LIT card: while a LitGrok skill is active the status line becomes a card whose title carries the
// skill and, at its right edge, the turn's state (running with its timer, just complete, a warning, or
// idle), with the turn's tool calls and running subagents beside it. Everything on it comes from Grok's
// stdin or LitGrok's own records.

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATUS_SCRIPT = join(PRODUCT_ROOT, '.grok', 'hooks', 'lit-status-line.mjs');
const SESSION = 'band-session';
const ENV_KEYS = ['CI', 'NO_COLOR', 'COLUMNS', 'LITGROK_HUD_COLOR', 'LITGROK_HUD_LINES', 'LITGROK_HUD_GLYPHS', 'LITGROK_AUTO_HANDOFF', 'LITGROK_AUTO_HANDOFF_PERCENT'];

function sandbox(t, discipline = 'litwork') {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-status-band-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const workspace = join(root, 'workspace');
  const stateRoot = join(root, 'state');
  mkdirSync(home);
  mkdirSync(workspace);
  const sb = { root, home, workspace, stateRoot };
  if (discipline) setDiscipline(sb, discipline);
  return sb;
}

function setDiscipline(sb, discipline) {
  writeHudRecords({ env: { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot }, sessionId: SESSION, cwd: sb.workspace, workspaceRoot: sb.workspace, discipline });
}

function ledgerFile(workspace, sessionId = SESSION) {
  return join(workspace, '.grok', 'litgrok', 'session-ledger', `${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}.jsonl`);
}

// Each entry is [event, secondsAgo, extra fields], written in the shape the passive hooks append.
function seedLedger(workspace, entries, sessionId = SESSION) {
  const file = ledgerFile(workspace, sessionId);
  mkdirSync(dirname(file), { recursive: true });
  const now = Date.now();
  const lines = entries.map(([event, secondsAgo, extra = {}]) => JSON.stringify({
    schema: 'litgrok.hook-event/v1',
    event,
    sessionId,
    cwd: workspace,
    workspaceRoot: workspace,
    hookName: 'test',
    recordedAt: new Date(now - secondsAgo * 1000).toISOString(),
    ...extra,
  }));
  writeFileSync(file, `${lines.join('\n')}\n`);
  return file;
}

// An earlier turn, then the current one: 3 tool calls (one failed) and one of two subagents still running.
function busyTurn(secondsAgo = 100) {
  return [
    ['UserPromptSubmit', 900, { promptId: 'old' }],
    ['PostToolUse', 890, { tool: { name: 'read' } }],
    ['SubagentStart', 889],
    ['Stop', 880, { signal: 'turn-ended' }],
    ['UserPromptSubmit', secondsAgo, { promptId: 'p1' }],
    ['PostToolUse', secondsAgo - 10, { tool: { name: 'read' } }],
    ['SubagentStart', secondsAgo - 20],
    ['SubagentStart', secondsAgo - 21],
    ['PostToolUseFailure', secondsAgo - 30, { tool: { name: 'bash' } }],
    ['SubagentStop', secondsAgo - 40],
    ['PostToolUse', secondsAgo - 50, { tool: { name: 'edit' } }],
  ];
}

function runStatus(sb, { env = {}, turnAgoMs, sessionId = SESSION, promptId, percent = 42, extra = {} } = {}) {
  const input = {
    cwd: sb.workspace,
    workspace: { current_dir: sb.workspace },
    model: { display_name: 'Grok 4.5' },
    effort: { level: 'high' },
    context_window: { used_percentage: percent, context_window_size: 2000000 },
    ...extra,
  };
  if (sessionId !== null) input.session_id = sessionId;
  if (promptId) input.prompt_id = promptId;
  if (turnAgoMs !== undefined) input.turn = { started_at_ms: Date.now() - turnAgoMs };
  const baseEnv = { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot };
  for (const key of ENV_KEYS) delete baseEnv[key];
  const result = spawnSync(process.execPath, [STATUS_SCRIPT], {
    cwd: sb.workspace,
    encoding: 'utf8',
    env: { ...baseEnv, COLUMNS: '120', ...env },
    input: `${JSON.stringify(input)}\n`,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.endsWith('\n'), true);
  const lines = result.stdout.slice(0, -1).split('\n');
  for (const line of lines) assert.ok(line.length <= 1024, `Grok cuts a line at 1024 characters including escapes; got ${line.length}`);
  return { raw: result.stdout, lines, plain: lines.map((line) => stripVTControlCharacters(line)) };
}

const PLAIN = { LITGROK_HUD_COLOR: '0' };
const LINE_ONE = '[🔥LIT] | Grok 4.5 [high] │ ctx [█▎░] 42%/2m │ 🔥 LIT IGNITED · litwork 🔥';
const FIGURES = 'Grok 4.5 [high] │ ctx [█▎░] 42%/2m';

function cells(text) {
  return [...text].reduce((total, character) => total + (/[ᄀ-ᅟ가-힣\u{1f300}-\u{1faff}]/u.test(character) ? 2 : 1), 0);
}

// The card's title, its right edge squeezed to one space so a pattern can read it.
const title = (result) => result.plain[0].replace(/ {2,}/gu, '  ');

test('one-line mode keeps the family row within the 1024-character cut for the longest skill name', (t) => {
  const sb = sandbox(t, 'lit-scientific-visualization');
  for (const columns of ['120', '400']) {
    const { lines, plain } = runStatus(sb, { env: { COLUMNS: columns, LITGROK_HUD_LINES: '1' } });
    assert.equal(lines.length, 1);
    assert.equal(plain[0], '[🔥LIT] | Grok 4.5 [high] │ ctx [█▎░] 42%/2m │  🔥 LIT  IGNITED · lit-scientific-visualization 🔥');
    const card = runStatus(sb, { env: { COLUMNS: columns } });
    assert.match(card.plain[0], /^▎ \[🔥LIT\] \| {2}🔥 LIT {2}· lit-scientific-visualization +idle$/u, 'the card title carries the whole skill name');
  }
});

test('no card without an active skill; a skill between turns shows an idle card; one-line mode keeps the row', (t) => {
  const idleSkill = sandbox(t, null);
  seedLedger(idleSkill.workspace, busyTurn());
  assert.equal(runStatus(idleSkill, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' }).lines.length, 1, 'no skill, no card');

  const sb = sandbox(t);
  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }]]);
  const between = runStatus(sb, { env: PLAIN });
  assert.deepEqual([title(between), between.plain[1]], ['[🔥LIT] | (🔥 LIT) · litwork  idle', FIGURES], 'a skill between turns: the title says idle');

  const oneLine = runStatus(sb, { env: { ...PLAIN, LITGROK_HUD_LINES: '1' }, turnAgoMs: 100_000, promptId: 'p1' });
  assert.deepEqual(oneLine.plain, [LINE_ONE], 'LITGROK_HUD_LINES=1 keeps the compact row alone');
});

test('a running turn shows the turn timer, tool calls and running subagents from the ledger', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, busyTurn());
  const result = runStatus(sb, { env: PLAIN, turnAgoMs: 102_000, promptId: 'p1' });
  assert.equal(result.lines.length, 2, 'title and figures; no stage yet');
  assert.match(title(result), /^\[🔥LIT\] \| \(🔥 LIT\) · litwork {2}3 tools · 1 agent ● 1m4\ds$/u);
  assert.equal(result.plain[1], FIGURES);

  // Without a prompt id the latest prompt in the ledger starts the turn.
  assert.match(title(runStatus(sb, { env: PLAIN, turnAgoMs: 5_000 })), / 3 tools · 1 agent ● [5-9]s$/u);
  assert.match(title(runStatus(sb, { env: PLAIN, turnAgoMs: 3_725_000 })), /● 1h02m$/u, 'an hour-long turn shows hours and minutes');
});

// Grok Build 1.0.13 sends no turn field at all: during a turn it re-runs the command with the payload of
// the last state change. Without the field the ledger tells whether a turn is in flight.
test('without a turn field, an unended recent turn in the ledger runs, and a stop, a failure or a quiet ledger ends it', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, busyTurn());
  assert.match(title(runStatus(sb, { env: PLAIN })), / 3 tools · 1 agent ● 1m4\ds$/u, 'the timer starts at the prompt record');

  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }]]);
  assert.match(title(runStatus(sb, { env: PLAIN })), / idle$/u, 'a stop ends the turn');
  seedLedger(sb.workspace, [...busyTurn(), ['StopFailure', 5]]);
  assert.match(title(runStatus(sb, { env: PLAIN })), / idle$/u, 'a failed turn has ended and is not shown as complete');
  seedLedger(sb.workspace, busyTurn(700));
  assert.match(title(runStatus(sb, { env: PLAIN })), / idle$/u, 'a turn whose ledger has been quiet for ten minutes is not shown as running');
  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }], ['Stop', 30, { signal: 'plan-gate-block' }]]);
  const held = runStatus(sb, { env: PLAIN });
  assert.match(title(held), / YOUR TURN · plan gate ● 1m4\ds$/u, 'a held stop keeps the turn running and names the wait');
  assert.equal(held.plain[1], '└ ⚠ plan gate: save plans/<slug>.md');
});

test('the card leaves out what LitGrok does not know instead of guessing', (t) => {
  const sb = sandbox(t);
  // No session id: Grok's timer is known, the ledger is not.
  assert.match(title(runStatus(sb, { env: PLAIN, turnAgoMs: 7_000, sessionId: null })), /^\[🔥LIT\] \| \(🔥 LIT\) · litwork {2}● [7-9]s$/u);
  // A session with no ledger yet.
  assert.match(title(runStatus(sb, { env: PLAIN, turnAgoMs: 7_000 })), /^\[🔥LIT\] \| \(🔥 LIT\) · litwork {2}● [7-9]s$/u);
  // A turn start Grok did not send, or one in the future, gives no timer.
  seedLedger(sb.workspace, busyTurn());
  assert.match(title(runStatus(sb, { env: PLAIN, extra: { turn: {} } })), / idle$/u);
  assert.equal(title(runStatus(sb, { env: PLAIN, turnAgoMs: -600_000, promptId: 'p1' })), '[🔥LIT] | (🔥 LIT) · litwork  3 tools · 1 agent ● running');
  // Torn lines and other sessions' records are skipped; a ledger reached through a symlink is not read.
  const file = seedLedger(sb.workspace, busyTurn());
  writeFileSync(file, `${JSON.stringify({ schema: 'litgrok.hook-event/v1', event: 'PostToolUse', sessionId: 'other', recordedAt: new Date().toISOString() })}\n{"torn`, { flag: 'a' });
  assert.match(title(runStatus(sb, { env: PLAIN, turnAgoMs: 9_000, promptId: 'p1' })), / 3 tools · 1 agent ● /u);
  rmSync(file);
  const elsewhere = join(sb.root, 'elsewhere.jsonl');
  writeFileSync(elsewhere, `${JSON.stringify({ schema: 'litgrok.hook-event/v1', event: 'UserPromptSubmit', sessionId: SESSION, recordedAt: new Date().toISOString() })}\n`);
  symlinkSync(elsewhere, file);
  assert.match(title(runStatus(sb, { env: PLAIN, turnAgoMs: 9_000 })), /^\[🔥LIT\] \| \(🔥 LIT\) · litwork {2}● (9|10)s$/u);
});

test('a turn that just ended shows a brief complete state, and only when the stop was not held', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, [...busyTurn(125), ['Stop', 5, { signal: 'turn-ended' }]]);
  assert.equal(title(runStatus(sb, { env: PLAIN })), '[🔥LIT] | (🔥 LIT) · litwork  3 tools ✓ complete 2m00s');

  seedLedger(sb.workspace, [...busyTurn(125), ['Stop', 40, { signal: 'turn-ended' }]]);
  assert.match(title(runStatus(sb, { env: PLAIN })), / idle$/u, 'the complete state fades after twenty seconds');

  seedLedger(sb.workspace, [...busyTurn(125), ['Stop', 5, { signal: 'turn-ended' }], ['Stop', 5, { signal: 'plan-gate-block' }]]);
  assert.doesNotMatch(runStatus(sb, { env: PLAIN }).plain.join('\n'), /complete/u, 'a held stop is not a completion');
});

test('amber warnings: a plan-gate block this turn and a context nearing the automatic handoff', (t) => {
  const sb = sandbox(t, 'lit-plan');
  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }], ['Stop', 30, { signal: 'plan-gate-block' }]]);
  const gate = runStatus(sb, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' });
  assert.match(title(gate), /^\[🔥LIT\] \| \(🔥 LIT\) · lit-plan {2}3 tools · 1 agent YOUR TURN · plan gate ● 1m4\ds$/u);
  assert.equal(gate.plain[1], '└ ⚠ plan gate: save plans/<slug>.md');

  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }], ['Stop', 30, { signal: 'auto-handoff-directive', percent: 80 }]]);
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' }).plain[1], /^└ ⚠ handoff requested$/u);

  seedLedger(sb.workspace, busyTurn());
  const handoff = { ...PLAIN, LITGROK_AUTO_HANDOFF: '1', LITGROK_AUTO_HANDOFF_PERCENT: '80' };
  const near = runStatus(sb, { env: handoff, turnAgoMs: 100_000, promptId: 'p1', percent: 76 });
  assert.match(title(near), /⚠ ctx 76%→80%/u);
  assert.deepEqual(near.plain.slice(1), ['└ ⚠ ctx 76% → handoff at 80%', 'Grok 4.5 [high] │ ctx [██▎] 76%/2m │ handoff@80%']);
  assert.equal(runStatus(sb, { env: handoff, turnAgoMs: 100_000, promptId: 'p1', percent: 85 }).plain[1], '└ ⚠ ctx 85% ≥ handoff at 80%');
  assert.doesNotMatch(runStatus(sb, { env: handoff, turnAgoMs: 100_000, promptId: 'p1', percent: 50 }).plain.join('\n'), /⚠/u, 'far below the percent there is no warning');
  assert.doesNotMatch(runStatus(sb, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1', percent: 85 }).plain.join('\n'), /⚠/u, 'no warning while automatic handoff is off');
  // Between turns a context warning still shows, so the next turn's handoff is no surprise.
  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }]]);
  const between = runStatus(sb, { env: handoff, percent: 78 });
  assert.equal(title(between), '[🔥LIT] | (🔥 LIT) · lit-plan  ⚠ ctx 78%→80%');
  assert.equal(between.plain[1], '└ ⚠ ctx 78% → handoff at 80%');
});

test('narrow rows give up the counts, then the timer, then the warning chip, and every line always fits', (t) => {
  const sb = sandbox(t, 'lit-plan');
  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }], ['Stop', 30, { signal: 'plan-gate-block' }]]);
  const shown = (columns) => runStatus(sb, { env: { ...PLAIN, COLUMNS: String(columns) }, turnAgoMs: 100_000, promptId: 'p1' });
  assert.match(title(shown(80)), /^\[🔥LIT\] \| \(🔥 LIT\) · lit-plan {2}3 tools · 1 agent YOUR TURN · plan gate ● 1m4\ds$/u);
  assert.match(title(shown(56)), /^\[🔥LIT\] \| \(🔥 LIT\) · lit-plan {2}YOUR TURN ● 1m4\ds$/u);
  assert.equal(title(shown(44)), '[🔥LIT] | (🔥 LIT) · lit-plan  YOUR TURN');
  assert.equal(title(shown(31)), '[🔥LIT] | (🔥 LIT) · lit-plan', 'the chips go before the skill name is clipped');
  assert.equal(title(shown(26)), '[🔥LIT] | (🔥 LIT) · lit…', 'and the skill name is clipped last');
  for (const columns of [20, 22, 24, 30, 45, 64, 90, 120]) {
    const { plain } = shown(columns);
    for (const line of plain) assert.ok(cells(line) <= columns - 1, `${columns} columns: "${line}" is ${cells(line)} cells`);
    assert.match(plain[0], /^\[🔥LIT\] \| \(🔥 LIT\)/u, `${columns} columns keep the brand`);
    assert.match(plain.at(-1), /ctx/u, `${columns} columns keep the context gauge`);
  }
});

test('colour: truecolor by default, 256 and 16 colour fallbacks, and none for NO_COLOR or LITGROK_HUD_COLOR=0', (t) => {
  const sb = sandbox(t, 'lit-scientific-visualization');
  seedLedger(sb.workspace, busyTurn());
  const run = (env) => runStatus(sb, { env: { COLUMNS: '400', ...env }, turnAgoMs: 100_000, promptId: 'p1' });

  const truecolor = run({});
  assert.equal(truecolor.lines.length, 2);
  assert.match(truecolor.lines[0], /\u001b\[48;2;255;45;149m/u, 'the brand chip is pink');
  assert.match(truecolor.lines[0], /\u001b\[1m\u001b\[38;2;255;99;55m● 1m\d\ds\u001b\[0m$/u, 'the running state is the bold accent');
  assert.match(truecolor.lines[0], /^\u001b\[38;2;255;99;55m▎\u001b\[0m /u, 'an accent edge opens every card line');
  assert.match(truecolor.lines[1], /^\u001b\[38;2;\d+;\d+;\d+m▎\u001b\[0m /u);
  assert.equal(truecolor.plain[0].includes('\ue0b6'), false, 'basic glyphs by default');

  for (const [value, pattern] of [['256', /\u001b\[(?:38|48);5;\d{1,3}m/u], ['16', /\u001b\[(?:3[0-7]|4[0-7]|9[0-7]|10[0-7])m/u]]) {
    const fallback = run({ LITGROK_HUD_COLOR: value });
    const text = (result) => result.plain.map((line) => line.replace(/ {2,}/gu, '  ').replace(/\d+s $/u, ''));
    assert.deepEqual(text(fallback), text(truecolor), `${value}: the same text`);
    for (const line of fallback.lines) {
      assert.doesNotMatch(line, /\u001b\[(?:38|48);2;/u, `${value}: no truecolor escapes on any line`);
      assert.match(line, pattern, `${value}: its own palette`);
    }
    if (value === '16') assert.doesNotMatch(fallback.raw, /;5;/u);
  }

  for (const env of [{ NO_COLOR: '' }, { LITGROK_HUD_COLOR: '0' }]) {
    const plain = run(env);
    assert.equal(plain.raw.includes('\u001b'), false, `${JSON.stringify(env)}: zero escape bytes`);
    assert.match(title(plain), /^\[🔥LIT\] \| \(🔥 LIT\) · lit-scientific-visualization {2}3 tools · 1 agent ● 1m\d\ds$/u, 'chips fall back to brackets and the edge is left out');
    assert.equal(plain.lines[1], FIGURES);
  }
});

test('the card\'s context gauge keeps the family bands: the accent, yellow at 70% and red at 90%', (t) => {
  const sb = sandbox(t);
  const tone = (percent) => /ctx \[\u001b\[0m\u001b\[38;2;(\d+;\d+;\d+)m/u.exec(runStatus(sb, { percent }).lines.at(-1))[1];
  assert.equal(tone(42), '255;99;55');
  assert.equal(tone(71), '215;175;0');
  assert.equal(tone(90), '215;95;95');
  const handoff = runStatus(sb, { percent: 61, env: { LITGROK_AUTO_HANDOFF: '1', LITGROK_AUTO_HANDOFF_PERCENT: '60' } });
  assert.match(handoff.lines.at(-1), /\u001b\[38;2;255;99;55m61%/u, 'a handoff percent warns in its own words, not in the gauge');
});

test('the figures line shows cost, branch and worktree when Grok sends them, and drops them first when narrow', (t) => {
  const sb = sandbox(t);
  const extra = { cost: { total_cost_usd: 1.874 }, workspace: { current_dir: sb.workspace, branch: 'feat/lit-humanizer', git_worktree: 'humanizer' } };
  assert.equal(runStatus(sb, { env: PLAIN, extra }).plain.at(-1), `${FIGURES} │ $1.87 │ git feat/lit-humanizer · humanizer`);
  assert.equal(runStatus(sb, { env: PLAIN, extra: { cost: { total_cost_usd: 0.004 } } }).plain.at(-1), FIGURES, 'a cost under half a cent is not shown');
  assert.equal(runStatus(sb, { env: PLAIN, extra: { cost: {} } }).plain.at(-1), FIGURES, 'an absent cost is unknown, not zero');
  assert.equal(runStatus(sb, { env: { ...PLAIN, COLUMNS: '50' }, extra }).plain.at(-1), `${FIGURES} │ $1.87`, 'the branch goes before the cost');
  assert.equal(runStatus(sb, { env: { ...PLAIN, COLUMNS: '40' }, extra }).plain.at(-1), FIGURES);
  const idle = sandbox(t, null);
  assert.equal(runStatus(idle, { env: PLAIN, extra }).plain[0], '[🔥LIT] | Grok 4.5 [high] │ ctx [█▎░] 42%/2m │ $1.87 │ git feat/lit-humanizer · humanizer', 'the one-line row carries them too');
});

test('Nerd glyphs are opt-in and need colour for the rounded caps; ascii glyphs print nothing outside ASCII', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, busyTurn());
  const nerd = runStatus(sb, { env: { LITGROK_HUD_GLYPHS: 'nerd' }, turnAgoMs: 100_000, promptId: 'p1' });
  assert.match(nerd.lines[0], /\ue0b6/u);
  assert.match(nerd.lines[0], /\ue0b4/u);
  assert.match(title(nerd), /^▎ \[🔥LIT\] \| \ue0b6🔥 LIT\ue0b4 · litwork {2}\uf0ad 3 · \uf0c0 1 \uf111 \uf017 1m4\ds$/u);

  const nerdPlain = runStatus(sb, { env: { LITGROK_HUD_GLYPHS: 'nerd', LITGROK_HUD_COLOR: '0' }, turnAgoMs: 100_000, promptId: 'p1' });
  assert.match(title(nerdPlain), /^\[🔥LIT\] \| \(🔥 LIT\) · litwork {2}\uf0ad 3 · \uf0c0 1 \uf111 \uf017 1m4\ds$/u, 'without colour the chips fall back to brackets');
  const other = runStatus(sb, { env: { ...PLAIN, LITGROK_HUD_GLYPHS: 'fancy' }, turnAgoMs: 100_000, promptId: 'p1' });
  assert.match(title(other), / 3 tools · 1 agent ● 1m4\ds$/u, 'an unknown value keeps basic glyphs');

  for (const env of [{ LITGROK_HUD_GLYPHS: 'ascii' }, { LITGROK_HUD_GLYPHS: 'ascii', LITGROK_HUD_COLOR: '0' }, { LITGROK_HUD_GLYPHS: 'ascii', LITGROK_HUD_LINES: '1' }]) {
    const ascii = runStatus(sb, { env, turnAgoMs: 100_000, promptId: 'p1', extra: { workspace: { current_dir: sb.workspace, branch: 'main' } } });
    assert.match(ascii.plain.join('\n'), /^[\x20-\x7e\n]+$/u, `${JSON.stringify(env)}: ASCII only`);
  }
  assert.equal(runStatus(sb, { env: { ...PLAIN, LITGROK_HUD_GLYPHS: 'ascii', LITGROK_HUD_LINES: '1' } }).plain[0], '[LIT] | Grok 4.5 [high] | ctx [#--] 42%/2m | LIT IGNITED - litwork');
});

test('a wide-character model name is measured in cells', (t) => {
  const sb = sandbox(t);
  const model = { model: { display_name: '그록 모델 '.repeat(8) } };
  const result = runStatus(sb, { env: { ...PLAIN, COLUMNS: '60' }, extra: model });
  for (const line of result.plain) assert.ok(cells(line) <= 59, `"${line}" is ${cells(line)} cells`);
  assert.match(result.plain.at(-1), /… \[high\] │ ctx \[█▎░\] 42%\/2m$/u);
  const row = runStatus(sb, { env: { ...PLAIN, COLUMNS: '70', LITGROK_HUD_LINES: '1' }, extra: model });
  assert.ok(cells(row.plain[0]) <= 69, `"${row.plain[0]}" is ${cells(row.plain[0])} cells`);
  assert.match(row.plain[0], /^\[🔥LIT\] \| [^│]*… \[high\] │ ctx \[█▎░\] 42%\/2m │ 🔥 LIT IGNITED · litwork 🔥$/u, 'the model is clipped before the discipline');
  const narrow = runStatus(sb, { env: { ...PLAIN, COLUMNS: '56', LITGROK_HUD_LINES: '1' }, extra: model });
  assert.match(narrow.plain[0], /^\[🔥LIT\] \| ctx \[█▎░\] 42%\/2m │ 🔥 LIT IGNITED · /u, 'narrower still the gauge and the mark outlast the model, and | follows the mark');
});

test('the prompt id Grok sends picks the turn the card counts', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, busyTurn());
  // From the earlier prompt on: four tool calls and two subagents still open.
  assert.match(title(runStatus(sb, { env: PLAIN, turnAgoMs: 102_000, promptId: 'old' })), / 4 tools · 2 agents ● /u);
  assert.match(title(runStatus(sb, { env: PLAIN, turnAgoMs: 102_000, promptId: 'p1' })), / 3 tools · 1 agent ● /u);
});

test('escape sequences in the model name never reach the row', (t) => {
  const sb = sandbox(t);
  const { lines } = runStatus(sb, { env: PLAIN, extra: { model: { display_name: '\u001b[31mGrok\u001b[0m 4.5' } } });
  assert.equal(lines.at(-1), FIGURES);
});

test('malformed or hostile stdin still prints a safe row, quickly', (t) => {
  const sb = sandbox(t);
  const raw = (input, env = PLAIN) => {
    const baseEnv = { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot };
    for (const key of ENV_KEYS) delete baseEnv[key];
    const started = process.hrtime.bigint();
    const result = spawnSync(process.execPath, [STATUS_SCRIPT], { cwd: sb.workspace, encoding: 'utf8', env: { ...baseEnv, ...env }, input });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    return { out: stripVTControlCharacters(result.stdout), ms };
  };
  for (const input of ['', '{"model": [1,2', 'null', '[]', '"text"', '{"model":{"display_name":7},"context_window":{"used_percentage":"42"},"cost":{"total_cost_usd":"9"},"workspace":{"branch":{"x":1}},"turn":"now"}', 'x'.repeat(70 * 1024)]) {
    const { out } = raw(input);
    assert.match(out, /^\[🔥LIT\] \| grok │ ctx \?\n$/u, `${input.slice(0, 40)}: the minimal row`);
  }
  const card = raw(JSON.stringify({ cwd: sb.workspace, session_id: SESSION, model: { display_name: 'Grok 4.5' }, context_window: { used_percentage: 1e9, context_window_size: -5 }, workspace: { current_dir: 7 } }));
  assert.match(card.out, /ctx \[███\] 100%\n$/u, 'an impossible percent is clamped and a negative window is left out');
  // A node start dominates; the rendering itself must stay small next to it.
  const times = Array.from({ length: 5 }, () => raw(JSON.stringify({ cwd: sb.workspace, session_id: SESSION, model: { display_name: 'Grok 4.5' } })).ms).sort((a, b) => a - b);
  assert.ok(times[2] < 500, `median run ${times[2]} ms`);
});
