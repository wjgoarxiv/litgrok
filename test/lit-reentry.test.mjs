import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readHudRecordForCwd } from '../.grok/hooks/litgrok-hud-state.mjs';
import { readWorkflowState, updateWorkflowState, workflowStatePath } from '../.grok/hooks/workflow-stage.mjs';

// D1, the re-entry rule, in the two places LitGrok can carry it. Grok Build discards the stdout of an
// allowing UserPromptSubmit hook, so the prompt hook adds 0 bytes whatever the prompt says; the model
// is steered by the always-loaded rule, and the hooks' per-session state must not be reset by a
// repeated `lit`.

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOKS_DIRECTORY = join(PRODUCT_ROOT, '.grok', 'hooks');
const RULE = readFileSync(join(PRODUCT_ROOT, '.grok', 'rules', '00-litgrok.md'), 'utf8');
const SESSION = 'reentry-session';
const SEVEN_ROWS = ['## Todos', ...[1, 2, 3, 4, 5, 6, 7].map((n) => `- [${n <= 3 ? 'x' : ' '}] ${n}. step ${n}`)].join('\n');

function workspaceFor(t) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-reentry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  mkdirSync(workspace);
  return { workspace, hud: { HOME: join(root, 'home'), LITGROK_HUD_STATE_ROOT: join(root, 'state') } };
}

function ledgerFile(workspace, sessionId = SESSION) {
  return join(workspace, '.grok', 'litgrok', 'session-ledger', `${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}.jsonl`);
}

function prompt(box, text, { sessionId = SESSION, promptId = `p-${Math.random()}` } = {}) {
  const event = { hookEventName: 'UserPromptSubmit', sessionId, promptId, cwd: box.workspace, workspaceRoot: box.workspace, prompt: text };
  const env = { ...process.env, ...box.hud, GROK_HOOK_EVENT: 'UserPromptSubmit', GROK_HOOK_NAME: 'user-prompt-submit', GROK_SESSION_ID: sessionId, GROK_WORKSPACE_ROOT: box.workspace };
  for (const key of ['NO_COLOR', 'CI']) delete env[key];
  const result = spawnSync(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), [], { cwd: PRODUCT_ROOT, encoding: 'utf8', env, input: `${JSON.stringify(event)}\n` });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(Buffer.byteLength(result.stdout), 0, 'the prompt hook adds 0 bytes of context');
  return readWorkflowState(workflowStatePath(ledgerFile(box.workspace, sessionId)), sessionId);
}

function plan(workspace) {
  mkdirSync(join(workspace, 'plans'), { recursive: true });
  writeFileSync(join(workspace, 'plans', 'shout.md'), `# shout\n\n${SEVEN_ROWS}\n`);
}

test('five lit prompts in one session never move the stage or clear the plan progress or the test verdict', (t) => {
  const box = workspaceFor(t);
  plan(box.workspace);
  assert.equal(prompt(box, 'review-work plans/shout.md').stage, 'review');
  updateWorkflowState(ledgerFile(box.workspace), SESSION, { test: { verdict: 'pass', count: 214 } });
  for (const text of ['lit fix the bug', 'lit add a test', 'lit planning notes', 'lit', 'lit continue']) {
    const state = prompt(box, text);
    assert.equal(state.stage, 'review', `"${text}" keeps the running stage`);
    assert.deepEqual(state.visited, ['review']);
    assert.deepEqual(state.plan, { done: 3, total: 7, next: '4. step 4' }, `"${text}" keeps the progress card`);
    assert.equal(state.test.verdict, 'pass');
    assert.equal(state.ended, false, 'a new turn is running again');
  }
});

test('a first lit, and a lit after a finished run, starts the work stage', (t) => {
  const box = workspaceFor(t);
  assert.equal(prompt(box, 'lit fix the bug').stage, 'work');
  assert.equal(prompt(box, 'lit add a test').stage, 'work');
  const finished = workspaceFor(t);
  assert.equal(prompt(finished, 'review-work').stage, 'review');
  updateWorkflowState(ledgerFile(finished.workspace), SESSION, { ended: true, plan: { done: 7, total: 7 } });
  assert.equal(readWorkflowState(workflowStatePath(ledgerFile(finished.workspace)), SESSION).stage, 'done');
  assert.equal(prompt(finished, 'lit add a test').stage, 'work', 'a new task after done is new work');
});

test('a named discipline switches the stage, and lit-plan arms the plan gate for its own turn and for a bare lit that continues it', (t) => {
  const box = workspaceFor(t);
  assert.equal(prompt(box, 'lit fix the bug').stage, 'work');
  assert.equal(prompt(box, '/lit-plan the cache rewrite').stage, 'plan');
  assert.equal(prompt(box, 'lit continue').stage, 'plan', 'a bare lit continues the plan stage');
  assert.equal(prompt(box, 'start-work plans/shout.md').stage, 'work');
  assert.equal(prompt(box, 'review-work').stage, 'review');
  const records = readFileSync(ledgerFile(box.workspace), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(records.map((record) => record.discipline ?? null), [null, 'lit-plan', 'lit-plan', null, null]);
});

test('lit plan, with a space, switches to lit-plan exactly like lit-plan: the row, the HUD label and the plan gate', (t) => {
  for (const text of ['lit plan the cache rewrite', 'lit plan', '/lit plan X', 'Lit Plan: the cache']) {
    const box = workspaceFor(t);
    assert.equal(prompt(box, 'review-work').stage, 'review');
    const state = prompt(box, text);
    assert.equal(state.stage, 'plan', text);
    assert.deepEqual(state.visited, ['plan', 'review']);
    const records = readFileSync(ledgerFile(box.workspace), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(records.at(-1).discipline, 'lit-plan', `${text}: the plan gate arms for this turn`);
    assert.equal(readHudRecordForCwd(box.workspace, { ...process.env, ...box.hud }).discipline, 'lit-plan', `${text}: the status row shows lit-plan`);
    assert.equal(prompt(box, 'lit continue').stage, 'plan');
    const after = readFileSync(ledgerFile(box.workspace), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(after.at(-1).discipline, 'lit-plan', 'the next bare lit continues the plan and keeps the gate armed');
  }
  for (const text of ['lit planning notes', 'please lit plan this', 'the lit plan was late', '```\nlit plan X\n```\nwhat is this?']) {
    const box = workspaceFor(t);
    assert.equal(prompt(box, 'review-work').stage, 'review');
    assert.notEqual(prompt(box, text).stage ?? 'review', 'plan', `${text} is no switch`);
    const records = readFileSync(ledgerFile(box.workspace), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal('discipline' in records.at(-1), false, `${text} arms no gate`);
  }
});

test('an approved plan with a bare lit resumes it: the stage and the checked tasks stay, no plan file is made', (t) => {
  const box = workspaceFor(t);
  plan(box.workspace);
  assert.equal(prompt(box, 'start-work plans/shout.md').stage, 'work');
  const before = readdirSync(join(box.workspace, 'plans'));
  const state = prompt(box, 'lit');
  assert.equal(state.stage, 'work');
  assert.deepEqual(state.plan, { done: 3, total: 7, next: '4. step 4' });
  assert.deepEqual(readdirSync(join(box.workspace, 'plans')), before, 'the hook creates no plan');
});

test('lit new and lit restart start the row over; a mention, a word that only starts with new and a fenced one do not', (t) => {
  const box = workspaceFor(t);
  plan(box.workspace);
  assert.equal(prompt(box, 'review-work plans/shout.md').stage, 'review');
  updateWorkflowState(ledgerFile(box.workspace), SESSION, { test: { verdict: 'fail', count: 2 } });
  for (const text of ['lit news digest', 'please summarise the lit new world', '```\nlit new thing\n```\nwhat is this?']) {
    assert.equal(prompt(box, text).stage ?? 'review', 'review', text);
  }
  assert.equal(readWorkflowState(workflowStatePath(ledgerFile(box.workspace)), SESSION).test.verdict, 'fail');

  const fresh = prompt(box, 'lit new Y');
  assert.equal(fresh.stage, 'work');
  assert.deepEqual(fresh.visited, ['work'], 'the earlier path is gone');
  assert.equal(fresh.test, null, 'the earlier test verdict is gone');
  assert.deepEqual(fresh.plan, { done: 3, total: 7, next: '4. step 4' }, 'the plan on disk is read again, not remembered');
  assert.equal(prompt(box, 'review-work').stage, 'review');
  assert.deepEqual(prompt(box, 'lit restart the migration').visited, ['work']);
});

test('another session id starts fresh and is not touched by the first one', (t) => {
  const box = workspaceFor(t);
  assert.equal(prompt(box, 'review-work').stage, 'review');
  const other = prompt(box, 'lit fix the bug', { sessionId: 'another-session' });
  assert.equal(other.stage, 'work');
  assert.deepEqual(other.visited, ['work']);
  assert.equal(readWorkflowState(workflowStatePath(ledgerFile(box.workspace)), SESSION).stage, 'review');
});

test('unreadable, foreign or oversized state falls back to a first activation and never blocks the prompt', (t) => {
  for (const content of ['not json', JSON.stringify({ schema: 'litgrok.workflow/v1', sessionId: 'someone-else', stage: 'review', visited: ['review'], ended: false, plan: null, test: null, updatedAt: new Date().toISOString() }), 'x'.repeat(8192)]) {
    const box = workspaceFor(t);
    assert.equal(prompt(box, 'lit fix the bug').stage, 'work');
    writeFileSync(workflowStatePath(ledgerFile(box.workspace)), content);
    const state = prompt(box, 'lit add a test');
    assert.equal(state.stage, 'work', 'a state that cannot be trusted is replaced by a first activation');
    assert.deepEqual(state.visited, ['work']);
  }
});

test('the always-loaded rule states the re-entry rule in plain lines', () => {
  const section = RULE.split('\n## Re-entry\n')[1]?.split('\n## ')[0];
  assert.ok(section, 'the rule has a Re-entry section');
  assert.match(section, /already active[^\n]*continu/i, 'same discipline continues');
  assert.match(section, /do not reload[^\n]*skill|not reload[^\n]*SKILL\.md/i, 'a continuation does not reload the skill');
  assert.match(section, /no new (?:plan|run)|opens? no new (?:plan|run)|not (?:open|start|create) a new (?:plan|run)/i, 'a continuation starts no new plan or run');
  assert.match(section, /named discipline[^\n]*switch|switch[^\n]*lit-plan/i, 'another discipline switches');
  assert.match(section, /approved plan[^\n]*(?:start-work)?[^\n]*resum/i, 'an approved plan resumes');
  assert.match(section, /`lit new[^\n]*`lit restart[^\n]*fresh|`lit restart[^\n]*`lit new[^\n]*fresh/i, 'new and restart start fresh');
  assert.match(section, /bare `lit`[^\n]*nothing (?:is )?active[^\n]*(?:ask|confirm)/i, 'only an idle bare lit asks');
  assert.ok(Buffer.byteLength(section) <= 1100, `the section is ${Buffer.byteLength(section)} bytes`);
});

test('the litwork activation contract and the meta skill carry the same rule', () => {
  const work = readFileSync(join(PRODUCT_ROOT, '.grok', 'skills', 'litwork', 'SKILL.md'), 'utf8');
  const contract = work.split('## #contract.activation')[1].split('\n## ')[0];
  assert.match(contract, /already active[^\n]*continu/i);
  assert.match(contract, /`lit new`|lit new/);
  const meta = readFileSync(join(PRODUCT_ROOT, '.grok', 'skills', 'litgrok', 'SKILL.md'), 'utf8');
  assert.match(meta, /repeated `lit`[^\n]*(?:keeps|does not reset)[^\n]*stage/i);
  assert.equal(existsSync(join(PRODUCT_ROOT, '.grok', 'hooks', 'user-prompt-submit.mjs')), true);
});
