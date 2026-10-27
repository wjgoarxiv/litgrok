import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { writeHudRecords } from '../.grok/hooks/litgrok-hud-state.mjs';
import { planProgress } from '../.grok/hooks/plan-progress.mjs';
import { writeLiveness } from '../.grok/hooks/session-liveness.mjs';
import { readWorkflowState, stageFromPrompt, testVerdict, updateWorkflowState, workflowStatePath } from '../.grok/hooks/workflow-stage.mjs';

// The card's stage map and detail line: where the session is in the LIT workflow (interview, plan,
// work, review, done), the plan's checked tasks with the next one, the tool in flight with its elapsed
// time, and the last test run's verdict.

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOKS_DIRECTORY = join(PRODUCT_ROOT, '.grok', 'hooks');
const STATUS_SCRIPT = join(HOOKS_DIRECTORY, 'lit-status-line.mjs');
const SESSION = 'workflow-session';
const ENV_KEYS = ['CI', 'NO_COLOR', 'COLUMNS', 'LITGROK_HUD_COLOR', 'LITGROK_HUD_LINES', 'LITGROK_HUD_GLYPHS', 'LITGROK_AUTO_HANDOFF', 'LITGROK_AUTO_HANDOFF_PERCENT'];
const PLAIN = { LITGROK_HUD_COLOR: '0' };
const SPIN = '[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]';

function sandbox(t, discipline = 'litwork') {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-workflow-row-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sb = { root, home: join(root, 'home'), workspace: join(root, 'workspace'), stateRoot: join(root, 'state') };
  mkdirSync(sb.home);
  mkdirSync(sb.workspace);
  if (discipline) writeHudRecords({ env: { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot }, sessionId: SESSION, cwd: sb.workspace, workspaceRoot: sb.workspace, discipline });
  return sb;
}

function ledgerFile(workspace, sessionId = SESSION) {
  return join(workspace, '.grok', 'litgrok', 'session-ledger', `${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}.jsonl`);
}

function seedLedger(workspace, entries) {
  const file = ledgerFile(workspace);
  mkdirSync(dirname(file), { recursive: true });
  const now = Date.now();
  writeFileSync(file, `${entries.map(([event, secondsAgo, extra = {}]) => JSON.stringify({
    schema: 'litgrok.hook-event/v1', event, sessionId: SESSION, cwd: workspace, workspaceRoot: workspace, hookName: 'test',
    recordedAt: new Date(now - secondsAgo * 1000).toISOString(), ...extra,
  })).join('\n')}\n`);
  return file;
}

function seedWorkflow(workspace, ...patches) {
  const file = ledgerFile(workspace);
  mkdirSync(dirname(file), { recursive: true });
  for (const patch of patches) updateWorkflowState(file, SESSION, patch);
}

// A turn that started 100 s ago and has had a shell command running for 31 s.
function liveTurn() {
  return [
    ['UserPromptSubmit', 100, { promptId: 'p1', stage: 'work' }],
    ['PreToolUse', 90, { tool: { name: 'read_file' } }],
    ['PostToolUse', 89, { tool: { name: 'read_file', inputSha256: 'x' } }],
    ['PreToolUse', 31, { tool: { name: 'run_terminal_command' } }],
  ];
}

function runStatus(sb, { env = {}, turnAgoMs, promptId } = {}) {
  const input = {
    cwd: sb.workspace,
    session_id: SESSION,
    workspace: { current_dir: sb.workspace },
    model: { display_name: 'Grok 4.5' },
    effort: { level: 'high' },
    context_window: { used_percentage: 42, context_window_size: 2000000 },
  };
  if (promptId) input.prompt_id = promptId;
  if (turnAgoMs !== undefined) input.turn = { started_at_ms: Date.now() - turnAgoMs };
  const baseEnv = { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot };
  for (const key of ENV_KEYS) delete baseEnv[key];
  const result = spawnSync(process.execPath, [STATUS_SCRIPT], { cwd: sb.workspace, encoding: 'utf8', env: { ...baseEnv, COLUMNS: '120', ...env }, input: `${JSON.stringify(input)}\n` });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.slice(0, -1).split('\n');
  for (const line of lines) assert.ok(line.length <= 1024, `Grok cuts a line at 1024 characters including escapes; got ${line.length}`);
  return { raw: result.stdout, lines, plain: lines.map((line) => stripVTControlCharacters(line)) };
}

function cells(text) {
  return [...text].reduce((total, character) => total + (/[ᄀ-ᅟ가-힣\u{1f300}-\u{1faff}]/u.test(character) ? 2 : 1), 0);
}

const WORK_MAP = 'plan ✓ ━━━━ [work 3/7] ━━━━ review · ──── done ·';
const detail = (tail = '') => new RegExp(`^└ task 3/7 ▮▮▮▯▯▯▯ · tests ✓ 214${tail}$`, 'u');

function planFile(workspace, name, text, mtimeSeconds) {
  mkdirSync(join(workspace, 'plans'), { recursive: true });
  const path = join(workspace, 'plans', name);
  writeFileSync(path, text);
  if (mtimeSeconds !== undefined) utimesSync(path, mtimeSeconds, mtimeSeconds);
  return path;
}

const SEVEN_ROWS = ['- [x] 1. a', '- [x] 2. b', '- [x] 3. c', '- [ ] 4. d', '- [ ] 5. e', '- [ ] 6. f', '- [ ] 7. g'].join('\n');

test('a prompt that names a workflow skill sets the stage; mentions and other words do not', () => {
  assert.equal(stageFromPrompt('deep-interview the parser idea'), 'interview');
  assert.equal(stageFromPrompt('/lit-plan add a --shout flag'), 'plan');
  assert.equal(stageFromPrompt('start-work plans/shout.md'), 'work');
  assert.equal(stageFromPrompt('/litwork fix it'), 'work');
  assert.equal(stageFromPrompt('lit add a --shout flag'), 'work');
  assert.equal(stageFromPrompt('please review-work the change'), 'review');
  assert.equal(stageFromPrompt('Explain the lit-planning of crops.'), null);
  assert.equal(stageFromPrompt('a literal question'), null);
  assert.equal(stageFromPrompt(undefined), null);
});

test('test runs give a verdict and one count, and nothing else', () => {
  const run = (command, toolResult, failed = false) => testVerdict({ toolInput: { command }, toolResult }, failed);
  assert.equal(run('ls -la', '# pass 3\n# fail 0'), null, 'only a test runner counts');
  assert.equal(testVerdict({ toolInput: { path: 'x' }, toolResult: '# pass 3' }), null);
  assert.deepEqual(run('npm test', 'TAP version 13\n# tests 214\n# suites 0\n# pass 214\n# fail 0\n'), { verdict: 'pass', count: 214 });
  assert.deepEqual(run('node --test test/*.test.mjs', 'ℹ tests 5\nℹ pass 3\nℹ fail 2\n'), { verdict: 'fail', count: 2 });
  assert.deepEqual(run('npx vitest run', ' Test Files  1 failed | 9 passed (10)\n      Tests  3 failed | 211 passed (214)\n'), { verdict: 'fail', count: 3 });
  assert.deepEqual(run('yarn test', 'Tests:       213 passed, 213 total\n'), { verdict: 'pass', count: 213 });
  assert.deepEqual(run('uv run pytest -q', '==== 2 failed, 40 passed in 1.20s ====\n'), { verdict: 'fail', count: 2 });
  assert.deepEqual(run('cargo test', 'test result: ok. 12 passed; 0 failed; 0 ignored\n'), { verdict: 'pass', count: 12 });
  assert.deepEqual(run('go test ./...', { output: 'ok  \texample.com/x\t0.2s', exitCode: 1 }), { verdict: 'fail' }, 'an exit code decides without counts');
  assert.deepEqual(run('go test ./...', { output: 'ok  \texample.com/x\t0.2s', exit_code: 0 }), { verdict: 'pass' });
  assert.deepEqual(run('pytest', 'collected 4 items\nProcess exited with code 1\n'), { verdict: 'fail' });
  assert.deepEqual(run('npm test', 'boom', true), { verdict: 'fail' }, 'a failed tool call is a failed run');
  assert.equal(run('npm test', 'still running…'), null, 'an unreadable outcome is left out');
  // Seen in a real Grok session: a plan check whose heredoc script only mentions the plan's test command.
  const heredoc = "node scaffold-plan.mjs --check plans/sum.md && python3 - <<'PY'\nqa = 'cd /repo && node --test sum.test.mjs'\nprint('ok')\nPY";
  assert.equal(run(heredoc, { output: 'ok', exit_code: 0 }), null, 'a heredoc body is data, not a command');
  assert.equal(run('echo "then run npm test" && git status', { output: 'clean', exit_code: 0 }), null, 'a quoted mention is not a test run');
  assert.deepEqual(run("cat > t.txt <<EOF\nx\nEOF\nnode --test sum.test.mjs", '# pass 1\n# fail 0'), { verdict: 'pass', count: 1 }, 'a test command after a heredoc still counts');
  assert.deepEqual(run('npx vitest run "src/a test.ts"', 'Tests  4 passed (4)'), { verdict: 'pass', count: 4 }, 'a quoted argument leaves the runner visible');
});

test('plan progress reads the newest plan that has task rows and ignores fenced rows and symlinks', (t) => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-workflow-plan-'));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  assert.equal(planProgress(workspace), null, 'no plans folder');
  planFile(workspace, 'old.md', '- [ ] 1. a\n- [ ] 2. b\n', 1_000_000);
  planFile(workspace, 'current.md', `${SEVEN_ROWS}\n\`\`\`\n- [ ] 8. fenced\n\`\`\`\n  - [ ] 9. indented\n`, 2_000_000);
  planFile(workspace, 'notes.md', '# notes without rows\n', 3_000_000);
  assert.deepEqual(planProgress(workspace), { done: 3, total: 7, next: '4. d' }, 'the first unchecked row is the next task');
  const elsewhere = join(workspace, 'elsewhere.md');
  writeFileSync(elsewhere, '- [x] 1. a\n');
  symlinkSync(elsewhere, join(workspace, 'plans', 'linked.md'));
  utimesSync(elsewhere, 4_000_000, 4_000_000);
  assert.deepEqual(planProgress(workspace), { done: 3, total: 7, next: '4. d' }, 'a symlinked plan is not read');
  planFile(workspace, 'long.md', `- [x] 1. a\n- [ ] 2. ${'word '.repeat(30)}\u001b[31m\n`, 5_000_000);
  const long = planProgress(workspace).next;
  assert.equal([...long].length, 60, 'a long title is cut to sixty characters');
  assert.ok(long.endsWith('…') && !long.includes('\u001b'), 'with an ellipsis and no control characters');
  planFile(workspace, 'finished.md', '- [x] 1. a\n- [x] 2. b\n', 6_000_000);
  assert.deepEqual(planProgress(workspace), { done: 2, total: 2 }, 'a finished plan has no next task');
});

test('the workflow snapshot keeps the stage path, closes a stage at its stop and reaches done only after a finished review', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-workflow-state-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const file = join(root, 'session.jsonl');
  assert.equal(updateWorkflowState(file, SESSION, { ended: true, plan: null }), null, 'nothing to show writes nothing');
  assert.equal(existsSync(workflowStatePath(file)), false);

  updateWorkflowState(file, SESSION, { stage: 'plan' });
  updateWorkflowState(file, SESSION, { ended: true, plan: { done: 0, total: 7 } });
  let state = readWorkflowState(workflowStatePath(file), SESSION);
  assert.equal(state.stage, 'plan');
  assert.equal(state.ended, true);
  updateWorkflowState(file, SESSION, { stage: 'work', plan: { done: 7, total: 7 } });
  updateWorkflowState(file, SESSION, { test: { verdict: 'pass', count: 214 } });
  updateWorkflowState(file, SESSION, { stage: 'review' });
  updateWorkflowState(file, SESSION, { ended: false });
  assert.equal(readWorkflowState(workflowStatePath(file), SESSION).stage, 'review', 'a held stop keeps the review open');
  state = updateWorkflowState(file, SESSION, { ended: true });
  assert.equal(state.stage, 'done');
  assert.deepEqual(state.visited, ['plan', 'work', 'review', 'done']);
  assert.deepEqual({ verdict: state.test.verdict, count: state.test.count }, { verdict: 'pass', count: 214 });
  assert.equal(readWorkflowState(workflowStatePath(file), 'another-session'), null, 'another session reads nothing');

  const unfinished = join(root, 'unfinished.jsonl');
  updateWorkflowState(unfinished, SESSION, { stage: 'review', plan: { done: 2, total: 7 } });
  assert.equal(updateWorkflowState(unfinished, SESSION, { ended: true }).stage, 'review', 'unchecked tasks keep the review stage');

  const linked = join(root, 'linked.jsonl');
  writeFileSync(join(root, 'target.json'), '{}\n');
  symlinkSync(join(root, 'target.json'), workflowStatePath(linked));
  assert.throws(() => updateWorkflowState(linked, SESSION, { stage: 'plan' }), /WORKFLOW_STATE_UNSAFE/u);
  assert.equal(readFileSync(join(root, 'target.json'), 'utf8'), '{}\n', 'a symlinked snapshot is never written through');
  assert.equal(readWorkflowState(workflowStatePath(linked), SESSION), null);
});

test('the card shows the stage path, the tool in flight and the last test run', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, liveTurn());
  seedWorkflow(sb.workspace, { stage: 'plan' }, { ended: true }, { stage: 'work', plan: { done: 3, total: 7 } }, { test: { verdict: 'pass', count: 214 } });
  const running = runStatus(sb, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' });
  assert.equal(running.lines.length, 4, 'title, stage map, detail and figures');
  assert.equal(running.plain[1], WORK_MAP);
  assert.match(running.plain[2], detail(` +${SPIN} Bash 0:3[1-4]`));

  // Grok Build 1.0.13 sends no turn field; the ledger's unended turn still shows the tool in flight.
  const ledgerOnly = runStatus(sb, { env: PLAIN });
  assert.equal(ledgerOnly.lines.length, 4);
  assert.match(ledgerOnly.plain[2], detail(` +${SPIN} Bash 0:3[1-4]`));

  // Between turns there is no tool in flight, and the map and the verdict stay.
  seedLedger(sb.workspace, [...liveTurn(), ['PostToolUse', 25, { tool: { name: 'run_terminal_command', inputSha256: 'x' } }], ['Stop', 24, { signal: 'turn-ended' }]]);
  const idle = runStatus(sb, { env: PLAIN });
  assert.equal(idle.lines.length, 4);
  assert.equal(idle.plain[1], WORK_MAP);
  assert.match(idle.plain[2], detail());

  // The next task the hooks noted shows after the count while tasks remain.
  seedWorkflow(sb.workspace, { plan: { done: 3, total: 7, next: '4. README demo GIF' } });
  assert.equal(runStatus(sb, { env: PLAIN }).plain[2], '└ task 3/7 ▮▮▮▯▯▯▯ · next ▸ 4. README demo GIF · tests ✓ 214');
});

test('a finished call, an earlier stage path and a finished workflow read correctly', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, [...liveTurn(), ['PostToolUseFailure', 2, { tool: { name: 'run_terminal_command', inputSha256: 'x' }, test: { verdict: 'fail', count: 2 } }]]);
  seedWorkflow(sb.workspace, { stage: 'interview' }, { stage: 'plan' }, { stage: 'work', plan: { done: 3, total: 7 } }, { test: { verdict: 'fail', count: 2 } });
  const result = runStatus(sb, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' });
  assert.deepEqual(result.plain.slice(1, 3), [
    'interview ✓ ━━━━ plan ✓ ━━━━ [work 3/7] ━━━━ review · ──── done ·',
    '└ task 3/7 ▮▮▮▯▯▯▯ · tests ✗ 2',
  ], 'a completed call shows no live step; a visited interview joins the path');

  const done = sandbox(t, null);
  seedWorkflow(done.workspace, { stage: 'work', plan: { done: 7, total: 7 } }, { stage: 'review' }, { ended: true });
  const finished = runStatus(done, { env: PLAIN });
  assert.match(finished.plain[0], /^\[🔥LIT\] \| \(🔥 LIT\) · workflow +idle$/u, 'a workflow without an active skill still opens the card');
  assert.deepEqual(finished.plain.slice(1, 3), ['plan ━━━━ work ✓ ━━━━ review ✓ ━━━━ [done ✓]', '└ task 7/7 ▮▮▮▮▮▮▮'], 'a skipped stage has no tick');
});

test('the card needs a workflow stage or an active skill, and LITGROK_HUD_LINES=1 keeps one row', (t) => {
  const quiet = sandbox(t, null);
  seedLedger(quiet.workspace, liveTurn().map(([event, ago, extra]) => [event, ago, event === 'UserPromptSubmit' ? { promptId: 'p1' } : extra]));
  assert.equal(runStatus(quiet, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' }).lines.length, 1, 'no skill and no stage: one line');

  const skill = sandbox(t);
  seedLedger(skill.workspace, liveTurn().map(([event, ago, extra]) => [event, ago, event === 'UserPromptSubmit' ? { promptId: 'p1' } : extra]));
  const live = runStatus(skill, { env: PLAIN, turnAgoMs: 100_000, promptId: 'p1' });
  assert.equal(live.lines.length, 3, 'no stage: no map');
  assert.match(live.plain[1], new RegExp(`^└ ${SPIN} Bash 0:3[1-4]$`, 'u'), 'an active skill shows the tool in flight by the elbow');

  const sb = sandbox(t);
  seedLedger(sb.workspace, liveTurn());
  seedWorkflow(sb.workspace, { stage: 'work', plan: { done: 3, total: 7 } });
  assert.equal(runStatus(sb, { env: { ...PLAIN, LITGROK_HUD_LINES: '1' }, turnAgoMs: 100_000, promptId: 'p1' }).lines.length, 1);
});

// Another session of the same workspace, seeded the way its hooks would leave it.
function seedOther(workspace, sessionId, { state, pane = null, workflow = [], atMs = Date.now() }) {
  const file = ledgerFile(workspace, sessionId);
  mkdirSync(dirname(file), { recursive: true });
  if (state) writeLiveness({ ledgerFile: file, sessionId, cwd: workspace, state, env: pane ? { HERDR_PANE_ID: pane } : {}, now: atMs });
  for (const patch of workflow) updateWorkflowState(file, sessionId, { ...patch, now: new Date(atMs) });
}

const FINISHED_WORK = [{ stage: 'work', active: 'start-work', plan: { done: 2, total: 2 } }, { ended: true }];

test('other sessions show as rows: running first, then idle, then a finished start-work', (t) => {
  const sb = sandbox(t);
  seedWorkflow(sb.workspace, { stage: 'work', plan: { done: 3, total: 7 } });
  seedOther(sb.workspace, 'other-done', { state: 'idle', workflow: FINISHED_WORK, atMs: Date.now() - 30_000 });
  seedOther(sb.workspace, 'other-idle', { state: 'idle', workflow: [{ stage: 'plan', active: 'lit-plan' }] });
  seedOther(sb.workspace, 'other-run', { state: 'alive', pane: 'w2B:p2', workflow: [{ stage: 'work', active: 'start-work', plan: { done: 1, total: 4 } }] });
  seedOther(sb.workspace, 'other-gone', { state: 'ended', workflow: [{ stage: 'review' }] });
  const { plain } = runStatus(sb, { env: PLAIN });
  const rows = plain.filter((line) => / (?:running|idle|done)$/u.test(line) && !line.startsWith('['));
  assert.deepEqual(rows, ['● start-work · w2B:p2 running', '· lit-plan idle', '✓ start-work done'], plain.join('\n'));
  assert.equal(plain.indexOf(rows[0]) > 0, true, 'rows come after this session\'s own card line');
  assert.equal(plain.some((line) => line.includes('review') && line.endsWith('ended')), false, 'an ended session leaves');
});

test('a finished start-work row shows done for 60 s, then leaves', (t) => {
  for (const [ago, shown] of [[59_000, true], [61_000, false]]) {
    const sb = sandbox(t, null);
    seedOther(sb.workspace, 'other-done', { state: 'idle', workflow: FINISHED_WORK, atMs: Date.now() - ago });
    const { plain } = runStatus(sb, { env: PLAIN });
    assert.equal(plain.includes('✓ start-work done'), shown, `${ago} ms: ${plain.join(' / ')}`);
  }
});

test('a lone other row still shows under a quiet one-row HUD, and a stale record reads as ended', (t) => {
  const sb = sandbox(t, null);
  seedOther(sb.workspace, 'other-run', { state: 'alive', pane: 'w2B:p9', workflow: [{ stage: 'review', active: 'review-work' }] });
  const { plain } = runStatus(sb, { env: PLAIN });
  assert.equal(plain.length, 2, plain.join('\n'));
  assert.equal(plain[1], '● review-work · w2B:p9 running');
  assert.equal(runStatus(sb, { env: { ...PLAIN, LITGROK_HUD_LINES: '1' } }).lines.length, 1, 'LITGROK_HUD_LINES=1 keeps one row');

  const stale = sandbox(t, null);
  seedOther(stale.workspace, 'other-stale', { state: 'alive', workflow: [{ stage: 'work', active: 'start-work' }], atMs: Date.now() - 16 * 60_000 });
  assert.equal(runStatus(stale, { env: PLAIN }).lines.length, 1, 'a record older than 15 minutes is ended');
});

test('other-session rows keep the width with colour on and off', (t) => {
  const sb = sandbox(t);
  seedWorkflow(sb.workspace, { stage: 'work', plan: { done: 3, total: 7 } });
  seedOther(sb.workspace, 'other-run', { state: 'alive', pane: 'w2B:p2', workflow: [{ stage: 'work', active: 'lit-scientific-visualization' }] });
  seedOther(sb.workspace, 'other-idle', { state: 'idle', workflow: [{ stage: 'plan', active: 'lit-plan' }] });
  for (const columns of [20, 30, 40, 79]) {
    for (const env of [PLAIN, { LITGROK_HUD_COLOR: '24' }, { NO_COLOR: '1' }]) {
      const { plain, raw } = runStatus(sb, { env: { ...env, COLUMNS: String(columns) } });
      for (const line of plain) assert.ok(cells(line) <= columns - 1, `${columns} columns ${JSON.stringify(env)}: "${line}" is ${cells(line)} cells`);
      if (env !== PLAIN && env.NO_COLOR === undefined) assert.match(raw, /\u001b\[/u, 'colour on paints');
      else assert.doesNotMatch(raw, /\u001b\[/u, 'colour off has no escapes');
      assert.equal(plain.filter((line) => /(?:running|idle)$/u.test(line) && !line.includes('LIT')).length, 2, `${columns}: both rows stay`);
    }
  }
});

test('narrow rows shorten the rails, then drop the stage names, and always fit', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, liveTurn());
  seedWorkflow(sb.workspace, { stage: 'interview' }, { stage: 'plan' }, { stage: 'work', plan: { done: 3, total: 7, next: '4. a fairly long task title to clip' } }, { test: { verdict: 'pass', count: 214 } });
  const shown = (columns) => runStatus(sb, { env: { ...PLAIN, COLUMNS: String(columns) }, turnAgoMs: 100_000, promptId: 'p1' }).plain;
  assert.equal(shown(66)[1], 'interview ✓ ━━━━ plan ✓ ━━━━ [work 3/7] ━━━━ review · ──── done ·');
  assert.equal(shown(60)[1], 'interview ✓ ━━ plan ✓ ━━ [work 3/7] ━━ review · ── done ·');
  assert.equal(shown(54)[1], 'interview ✓ ━ plan ✓ ━ [work 3/7] ━ review · ─ done ·');
  assert.equal(shown(30)[1], '✓━✓━[work 3/7]━·─·');
  assert.match(shown(79)[2], new RegExp(`^└ task 3/7 ▮▮▮▯▯▯▯ · next ▸ 4\\. a fairly long task… · tests ✓ 214 +${SPIN} Bash 0:3[1-4]$`, 'u'), 'the next task is clipped before anything goes');
  assert.match(shown(50)[2], new RegExp(`^└ task 3/7 ▮▮▮▯▯▯▯ · tests ✓ 214 +${SPIN} Bash 0:3[1-4]$`, 'u'), 'then it goes');
  for (const columns of [20, 24, 30, 40, 64, 79, 90, 120]) {
    const lines = shown(columns);
    for (const line of lines) assert.ok(cells(line) <= columns - 1, `${columns} columns: "${line}" is ${cells(line)} cells`);
    assert.match(lines[1], /work/u, `${columns} columns keep the current stage`);
  }
});

test('colour: accent rails with a pink head while a turn runs, fallbacks, and no escapes without colour', (t) => {
  const sb = sandbox(t);
  seedLedger(sb.workspace, liveTurn());
  seedWorkflow(sb.workspace, { stage: 'interview' }, { stage: 'plan' }, { stage: 'work', plan: { done: 3, total: 7 } }, { test: { verdict: 'pass', count: 214 } });
  const run = (env, turn = true) => runStatus(sb, { env, ...(turn ? { turnAgoMs: 100_000, promptId: 'p1' } : {}) });

  const truecolor = run({});
  const row = truecolor.lines[1];
  const railColours = new Set([...row.matchAll(/\u001b\[38;2;(\d+;\d+;\d+)m━/gu)].map((match) => match[1]));
  assert.deepEqual([...railColours].sort(), ['255;45;149', '255;99;55', '70;80;92'], `rails are the accent into the current stage and grey after it, with the head; got ${[...railColours].join(' ')}`);
  // The head is the family pink rather than white, which vanishes on a light terminal.
  assert.ok(railColours.has('255;45;149'), 'a pink head cell rides the rail while the turn runs');
  assert.ok(!railColours.has('255;255;255'), 'no white cell on the rail');
  assert.match(row, /\u001b\[48;2;\d+;\d+;\d+m/u, 'the current stage is a filled pill');
  assert.match(truecolor.lines[2], /\u001b\[1m\u001b\[38;2;255;99;55m[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Bash/u, 'the live step is the bold accent');
  assert.match(truecolor.lines[2], /\u001b\[1m\u001b\[38;2;95;175;95mtests ✓ 214/u, 'a passing run is green');
  seedLedger(sb.workspace, [...liveTurn(), ['PostToolUse', 25, { tool: { name: 'run_terminal_command', inputSha256: 'x' } }], ['Stop', 24, { signal: 'turn-ended' }]]);
  const between = run({}, false);
  assert.equal(between.lines.length, 4);
  assert.doesNotMatch(between.lines[1], /38;2;255;45;149m━/u, 'no head between turns');
  seedLedger(sb.workspace, liveTurn());

  for (const [value, pattern] of [['256', /\u001b\[(?:38|48);5;\d{1,3}m/u], ['16', /\u001b\[(?:3[0-7]|4[0-7]|9[0-7]|10[0-7])m/u]]) {
    const fallback = run({ LITGROK_HUD_COLOR: value });
    assert.doesNotMatch(fallback.lines[1], /\u001b\[(?:38|48);2;/u, `${value}: no truecolor escapes`);
    assert.match(fallback.lines[1], pattern, `${value}: its own palette`);
  }

  for (const env of [{ NO_COLOR: '' }, { LITGROK_HUD_COLOR: '0' }]) {
    const plain = run(env);
    assert.equal(plain.raw.includes('\u001b'), false, `${JSON.stringify(env)}: zero escape bytes`);
    assert.equal(plain.lines[1], 'interview ✓ ━━━━ plan ✓ ━━━━ [work 3/7] ━━━━ review · ──── done ·');
  }
});

function hookEnvironment(event, hookName) {
  const env = { ...process.env, GROK_HOOK_EVENT: event.hookEventName, GROK_HOOK_NAME: hookName, GROK_SESSION_ID: event.sessionId, GROK_WORKSPACE_ROOT: event.workspaceRoot };
  for (const key of ['NO_COLOR', 'LITGROK_AUTO_HANDOFF', 'LITGROK_AUTO_HANDOFF_PERCENT']) delete env[key];
  return env;
}

function runHook(stem, event, env = {}) {
  return spawnSync(join(HOOKS_DIRECTORY, `${stem}.mjs`), [], { cwd: PRODUCT_ROOT, encoding: 'utf8', env: { ...hookEnvironment(event, stem), ...env }, input: `${JSON.stringify(event)}\n` });
}

function hookWorkspace(t) {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-workflow-hooks-'));
  const stateRoot = mkdtempSync(join(tmpdir(), 'litgrok-workflow-hud-'));
  t.after(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(stateRoot, { recursive: true, force: true });
  });
  return { workspace, hud: { LITGROK_HUD_STATE_ROOT: join(stateRoot, 'state') } };
}

const base = (workspace, hookEventName, extra = {}) => ({ hookEventName, sessionId: SESSION, cwd: workspace, workspaceRoot: workspace, ...extra });

test('hooks record the stage, the tool that started and a test verdict, never the prompt, input or output', (t) => {
  const { workspace, hud } = hookWorkspace(t);
  planFile(workspace, 'shout.md', SEVEN_ROWS);
  const secret = 'SECRET-ARGUMENT-7f3a';

  const prompt = runHook('user-prompt-submit', base(workspace, 'UserPromptSubmit', { promptId: 'p1', prompt: `/start-work plans/shout.md ${secret}` }), hud);
  assert.equal(prompt.status, 0, prompt.stderr);
  const fenced = runHook('user-prompt-submit', base(workspace, 'UserPromptSubmit', { promptId: 'p2', prompt: '```\nreview-work\n```\nwhat does this do?' }), hud);
  assert.equal(fenced.status, 0, fenced.stderr);
  const pre = runHook('pre-tool-use', base(workspace, 'PreToolUse', { promptId: 'p2', toolName: 'run_terminal_command', toolUseId: 'call-1', toolInput: { command: `npm test -- ${secret}` } }));
  assert.equal(pre.status, 0, pre.stderr);
  assert.equal(pre.stdout, '', 'a PreToolUse recorder never answers, so the call proceeds');
  const post = runHook('post-tool-use', base(workspace, 'PostToolUse', { promptId: 'p2', toolName: 'run_terminal_command', toolInput: { command: `npm test -- ${secret}` }, toolResult: `${secret}\n# pass 214\n# fail 0\n` }));
  assert.equal(post.status, 0, post.stderr);
  const failed = runHook('post-tool-use-failure', base(workspace, 'PostToolUseFailure', { promptId: 'p2', toolName: 'run_terminal_command', toolInput: { command: 'pytest -q' } }));
  assert.equal(failed.status, 0, failed.stderr);

  const ledger = readFileSync(ledgerFile(workspace), 'utf8');
  assert.equal(ledger.includes(secret), false, 'no prompt text, command or output reaches the ledger');
  const records = ledger.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.event), ['UserPromptSubmit', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure']);
  assert.equal(records[0].stage, 'work');
  assert.equal('stage' in records[1], false, 'a skill name inside a code fence sets no stage');
  assert.deepEqual(records[2].tool, { name: 'run_terminal_command' }, 'PreToolUse keeps the tool name only, not even a digest');
  assert.deepEqual(records[3].test, { verdict: 'pass', count: 214 });
  assert.deepEqual(records[4].test, { verdict: 'fail' });

  const state = readWorkflowState(workflowStatePath(ledgerFile(workspace)), SESSION);
  assert.equal(state.stage, 'work');
  assert.deepEqual(state.plan, { done: 3, total: 7, next: '4. d' });
  assert.equal(state.test.verdict, 'fail');
  assert.equal(readFileSync(workflowStatePath(ledgerFile(workspace)), 'utf8').includes(secret), false);
});

test('Stop closes the stage, and a review that ends with every task checked reaches done', (t) => {
  const { workspace, hud } = hookWorkspace(t);
  planFile(workspace, 'shout.md', SEVEN_ROWS.replaceAll('[ ]', '[x]'));
  assert.equal(runHook('user-prompt-submit', base(workspace, 'UserPromptSubmit', { promptId: 'p1', prompt: '/review-work' }), hud).status, 0);
  const stop = runHook('stop', base(workspace, 'Stop', { promptId: 'p1', reason: 'end_turn', permissionMode: 'default' }));
  assert.equal(stop.status, 0, stop.stderr);
  assert.equal(stop.stdout, '');
  const state = readWorkflowState(workflowStatePath(ledgerFile(workspace)), SESSION);
  assert.equal(state.stage, 'done');
  assert.deepEqual(state.plan, { done: 7, total: 7 });
});

test('the hook configs register the tool recorders for every tool, in the project and plugin manifests', () => {
  const pre = JSON.parse(readFileSync(join(HOOKS_DIRECTORY, 'pre-tool-use.json'), 'utf8'));
  assert.deepEqual(pre, { hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'pre-tool-use.mjs', timeout: 5 }] }] } });
  const post = JSON.parse(readFileSync(join(HOOKS_DIRECTORY, 'post-tool-use.json'), 'utf8'));
  assert.deepEqual(post, { hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'post-tool-use.mjs', timeout: 5 }] }] } });
  const plugin = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'hooks', 'hooks.json'), 'utf8'));
  const commands = (event) => plugin.hooks[event].flatMap((group) => group.hooks.map((hook) => [group.matcher ?? null, hook.command]));
  assert.ok(commands('PreToolUse').some(([matcher, command]) => matcher === null && command.endsWith('/pre-tool-use.mjs"')));
  assert.ok(commands('PostToolUse').some(([matcher, command]) => matcher === null && command.endsWith('/post-tool-use.mjs"')));
  assert.equal(readdirSync(HOOKS_DIRECTORY).includes('workflow-stage.mjs'), true);
});
