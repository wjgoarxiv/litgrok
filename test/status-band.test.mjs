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

// The second status line: a ribbon that shows only while a LitGrok skill is active and a turn runs,
// just ended, or needs attention. Everything on it comes from Grok's stdin or LitGrok's own records.

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
const LINE_ONE = '[🔥LIT] 🔥 LIT IGNITED · litwork 🔥 | Grok 4.5 [high] │ ctx [█▎░] 42%/2m';

function cells(text) {
  return [...text].reduce((total, character) => total + (/[ᄀ-ᅟ가-힣\u{1f300}-\u{1faff}]/u.test(character) ? 2 : 1), 0);
}

test('line one stays within the 1024-character cut for the longest skill name', (t) => {
  const sb = sandbox(t, 'lit-scientific-visualization');
  for (const columns of ['120', '400']) {
    const { lines, plain } = runStatus(sb, { env: { COLUMNS: columns } });
    assert.equal(lines.length, 1);
    assert.equal(plain[0], '[🔥LIT] 🔥 LIT IGNITED · lit-scientific-visualization 🔥 | Grok 4.5 [high] │ ctx [█▎░] 42%/2m');
  }
});

test('no second line without an active skill, without a turn, or in one-line mode', (t) => {
  const idleSkill = sandbox(t, null);
  seedLedger(idleSkill.workspace, busyTurn());
  assert.equal(runStatus(idleSkill, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' }).lines.length, 1, 'no skill, no ribbon');

  const sb = sandbox(t);
  seedLedger(sb.workspace, busyTurn());
  const between = runStatus(sb, { env: PLAIN });
  assert.deepEqual(between.plain, [LINE_ONE], 'a skill between turns, with nothing to report, keeps one line');

  const oneLine = runStatus(sb, { env: { ...PLAIN, LITGROK_HUD_LINES: '1' }, turnAgoMs: 100_000, promptId: 'p1' });
  assert.deepEqual(oneLine.plain, [LINE_ONE], 'LITGROK_HUD_LINES=1 keeps the compact row alone');
});

test('a running turn shows the skill, the turn timer, tool calls and running subagents from the ledger', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, busyTurn());
  const { lines, plain } = runStatus(sb, { env: PLAIN, turnAgoMs: 102_000, promptId: 'p1' });
  assert.equal(lines.length, 2);
  assert.equal(plain[0], LINE_ONE, 'line one is unchanged');
  assert.match(plain[1], /^\(🔥 LIT\) \(● litwork\) 1m4\ds · 3 tools · 1 agent$/u);

  // Without a prompt id the latest prompt in the ledger starts the turn.
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 5_000 }).plain[1], /^\(🔥 LIT\) \(● litwork\) [5-9]s · 3 tools · 1 agent$/u);
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 3_725_000 }).plain[1], / 1h02m · /u, 'an hour-long turn shows hours and minutes');
});

test('the ribbon leaves out what LitGrok does not know instead of guessing', (t) => {
  const sb = sandbox(t);
  // No session id: Grok's timer is known, the ledger is not.
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 7_000, sessionId: null }).plain[1], /^\(🔥 LIT\) \(● litwork\) [7-9]s$/u);
  // A session with no ledger yet.
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 7_000 }).plain[1], /^\(🔥 LIT\) \(● litwork\) [7-9]s$/u);
  // A turn start Grok did not send, or one in the future, gives no timer.
  seedLedger(sb.workspace, busyTurn());
  assert.equal(runStatus(sb, { env: PLAIN, extra: { turn: {} } }).lines.length, 1);
  assert.equal(runStatus(sb, { env: PLAIN, turnAgoMs: -600_000, promptId: 'p1' }).plain[1], '(🔥 LIT) (● litwork) 3 tools · 1 agent');
  // Torn lines and other sessions' records are skipped; a ledger reached through a symlink is not read.
  const file = seedLedger(sb.workspace, busyTurn());
  writeFileSync(file, `${JSON.stringify({ schema: 'litgrok.hook-event/v1', event: 'PostToolUse', sessionId: 'other', recordedAt: new Date().toISOString() })}\n{"torn`, { flag: 'a' });
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 9_000, promptId: 'p1' }).plain[1], / 3 tools · 1 agent$/u);
  rmSync(file);
  const elsewhere = join(sb.root, 'elsewhere.jsonl');
  writeFileSync(elsewhere, `${JSON.stringify({ schema: 'litgrok.hook-event/v1', event: 'UserPromptSubmit', sessionId: SESSION, recordedAt: new Date().toISOString() })}\n`);
  symlinkSync(elsewhere, file);
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 9_000 }).plain[1], /^\(🔥 LIT\) \(● litwork\) (9|10)s$/u);
});

test('a turn that just ended shows a brief complete state, and only when the stop was not held', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, [...busyTurn(125), ['Stop', 5, { signal: 'turn-ended' }]]);
  assert.equal(runStatus(sb, { env: PLAIN }).plain[1], '(🔥 LIT) (✓ litwork) complete · 2m00s · 3 tools');

  seedLedger(sb.workspace, [...busyTurn(125), ['Stop', 40, { signal: 'turn-ended' }]]);
  assert.equal(runStatus(sb, { env: PLAIN }).lines.length, 1, 'the complete state fades after twenty seconds');

  seedLedger(sb.workspace, [...busyTurn(125), ['Stop', 5, { signal: 'turn-ended' }], ['Stop', 5, { signal: 'plan-gate-block' }]]);
  assert.doesNotMatch(runStatus(sb, { env: PLAIN }).plain.join('\n'), /complete/u, 'a held stop is not a completion');
});

test('amber warnings: a plan-gate block this turn and a context nearing the automatic handoff', (t) => {
  const sb = sandbox(t, 'lit-plan');
  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }], ['Stop', 30, { signal: 'plan-gate-block' }]]);
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' }).plain[1], /^\(🔥 LIT\) \(⚠ lit-plan\) plan gate: save plans\/<slug>\.md · 1m4\ds · 3 tools · 1 agent$/u);

  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }], ['Stop', 30, { signal: 'auto-handoff-directive', percent: 80 }]]);
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' }).plain[1], /^\(🔥 LIT\) \(⚠ lit-plan\) handoff requested · /u);

  seedLedger(sb.workspace, busyTurn());
  const handoff = { ...PLAIN, LITGROK_AUTO_HANDOFF: '1', LITGROK_AUTO_HANDOFF_PERCENT: '80' };
  assert.match(runStatus(sb, { env: handoff, turnAgoMs: 100_000, promptId: 'p1', percent: 76 }).plain[1], /^\(🔥 LIT\) \(⚠ lit-plan\) ctx 76% → handoff at 80% · /u);
  assert.match(runStatus(sb, { env: handoff, turnAgoMs: 100_000, promptId: 'p1', percent: 85 }).plain[1], /^\(🔥 LIT\) \(⚠ lit-plan\) ctx 85% ≥ handoff at 80% · /u);
  assert.match(runStatus(sb, { env: handoff, turnAgoMs: 100_000, promptId: 'p1', percent: 50 }).plain[1], /^\(🔥 LIT\) \(● lit-plan\) /u, 'far below the percent there is no warning');
  assert.match(runStatus(sb, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1', percent: 85 }).plain[1], /^\(🔥 LIT\) \(● lit-plan\) /u, 'no warning while automatic handoff is off');
  // Between turns a context warning still shows, so the next turn's handoff is no surprise.
  assert.deepEqual(runStatus(sb, { env: handoff, percent: 78 }).plain.slice(1), ['(🔥 LIT) (⚠ lit-plan) ctx 78% → handoff at 80%']);
});

test('narrow rows drop tool calls first, then subagents, then the timer, then shorten the warning', (t) => {
  const sb = sandbox(t, 'lit-plan');
  seedLedger(sb.workspace, [...busyTurn(), ['Stop', 30, { signal: 'turn-ended' }], ['Stop', 30, { signal: 'plan-gate-block' }]]);
  const shown = (columns) => runStatus(sb, { env: { ...PLAIN, COLUMNS: String(columns) }, turnAgoMs: 100_000, promptId: 'p1' }).plain[1];
  assert.match(shown(80), /^\(🔥 LIT\) \(⚠ lit-plan\) plan gate: save plans\/<slug>\.md · 1m4\ds · 1 agent$/u);
  assert.match(shown(70), /^\(🔥 LIT\) \(⚠ lit-plan\) plan gate: save plans\/<slug>\.md · 1m4\ds$/u);
  assert.equal(shown(60), '(🔥 LIT) (⚠ lit-plan) plan gate: save plans/<slug>.md');
  assert.equal(shown(40), '(🔥 LIT) (⚠ lit-plan) plan gate');
  assert.equal(shown(28), '(🔥) (⚠ lit-plan) plan gate');
  assert.equal(shown(26), '(🔥) (⚠ lit-plan)', 'the warning text goes before the skill name is clipped');
  for (const columns of [20, 22, 24, 30, 45, 64, 90]) {
    const line = shown(columns);
    assert.ok(cells(line) <= columns - 1, `${columns} columns: "${line}" is ${cells(line)} cells`);
    assert.match(line, /^\(🔥/u, `${columns} columns keep the brand`);
  }
});

test('colour: truecolor by default, 256 and 16 colour fallbacks, and none for NO_COLOR or LITGROK_HUD_COLOR=0', (t) => {
  const sb = sandbox(t, 'lit-scientific-visualization');
  seedLedger(sb.workspace, busyTurn());
  const run = (env) => runStatus(sb, { env: { COLUMNS: '400', ...env }, turnAgoMs: 100_000, promptId: 'p1' });

  const truecolor = run({});
  assert.equal(truecolor.lines.length, 2);
  assert.match(truecolor.lines[1], /\u001b\[48;2;255;45;149m/u, 'the brand pill is pink');
  assert.match(truecolor.lines[1], /\u001b\[48;2;10;166;194m/u, 'the running skill pill is cyan');
  assert.equal(truecolor.plain[1].includes(''), false, 'basic glyphs by default');

  for (const [value, pattern] of [['256', /\u001b\[(?:38|48);5;\d{1,3}m/u], ['16', /\u001b\[(?:3[0-7]|4[0-7]|9[0-7]|10[0-7])m/u]]) {
    const fallback = run({ LITGROK_HUD_COLOR: value });
    assert.deepEqual(fallback.plain, truecolor.plain, `${value}: the same text`);
    for (const line of fallback.lines) {
      assert.doesNotMatch(line, /\u001b\[(?:38|48);2;/u, `${value}: no truecolor escapes on any line`);
      assert.match(line, pattern, `${value}: its own palette`);
    }
    if (value === '16') assert.doesNotMatch(fallback.raw, /;5;/u);
  }

  for (const env of [{ NO_COLOR: '' }, { LITGROK_HUD_COLOR: '0' }]) {
    const plain = run(env);
    assert.equal(plain.raw.includes('\u001b'), false, `${JSON.stringify(env)}: zero escape bytes`);
    assert.equal(plain.lines[0], truecolor.plain[0]);
    assert.match(plain.lines[1], /^\(🔥 LIT\) \(● lit-scientific-visualization\) 1m\d\ds · 3 tools · 1 agent$/u, 'pills fall back to brackets');
  }
});

test('Nerd glyphs are opt-in and need colour for the rounded caps', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, busyTurn());
  const nerd = runStatus(sb, { env: { LITGROK_HUD_GLYPHS: 'nerd' }, turnAgoMs: 100_000, promptId: 'p1' });
  assert.match(nerd.lines[1], //u);
  assert.match(nerd.lines[1], //u);
  assert.match(nerd.plain[1], /^🔥 LIT  litwork  1m4\ds ·  3 ·  1$/u);

  const nerdPlain = runStatus(sb, { env: { LITGROK_HUD_GLYPHS: 'nerd', LITGROK_HUD_COLOR: '0' }, turnAgoMs: 100_000, promptId: 'p1' });
  assert.match(nerdPlain.plain[1], /^\(🔥 LIT\) \( litwork\) /u, 'without colour the pills fall back to brackets');
  const other = runStatus(sb, { env: { ...PLAIN, LITGROK_HUD_GLYPHS: 'fancy' }, turnAgoMs: 100_000, promptId: 'p1' });
  assert.match(other.plain[1], /^\(🔥 LIT\) \(● litwork\) /u, 'an unknown value keeps basic glyphs');
});

test('a wide-character model name is measured in cells on line one', (t) => {
  const sb = sandbox(t);
  const result = runStatus(sb, { env: { ...PLAIN, COLUMNS: '60' }, extra: { model: { display_name: '그록 모델 '.repeat(8) } } });
  assert.ok(cells(result.plain[0]) <= 59, `"${result.plain[0]}" is ${cells(result.plain[0])} cells`);
  assert.match(result.plain[0], /… \[high\] │ ctx \[█▎░\] 42%\/2m$/u);
});
