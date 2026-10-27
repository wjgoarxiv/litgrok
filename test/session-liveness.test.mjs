import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  LIVENESS_REPEAT_MS,
  LIVENESS_STALE_MS,
  livenessPath,
  paneIdFrom,
  readLiveness,
  writeLiveness,
} from '../.grok/hooks/session-liveness.mjs';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOKS_DIRECTORY = join(PRODUCT_ROOT, '.grok', 'hooks');
const T0 = Date.parse('2026-10-28T09:00:00.000Z');

function scratch(label) {
  const root = mkdtempSync(join(tmpdir(), `litgrok-liveness-${label}-`));
  test.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function ledgerIn(root) {
  const directory = join(root, '.grok', 'litgrok', 'session-ledger');
  mkdirSync(directory, { recursive: true });
  return join(directory, 'abc.jsonl');
}

test('liveness goes alive, then idle, then ended, and the record names the pane', () => {
  const ledgerFile = ledgerIn(scratch('states'));
  const base = { ledgerFile, sessionId: 'session-a', cwd: '/work/a', env: { HERDR_PANE_ID: 'w2B:p3' } };
  assert.equal(writeLiveness({ ...base, state: 'alive', now: T0 }), 'written');
  assert.deepEqual(readLiveness(livenessPath(ledgerFile), T0), { sessionId: 'session-a', cwd: '/work/a', state: 'alive', pane: 'w2B:p3', at: new Date(T0).toISOString() });
  assert.equal(writeLiveness({ ...base, state: 'idle', now: T0 + 1_000 }), 'written', 'a state change writes at once');
  assert.equal(readLiveness(livenessPath(ledgerFile), T0 + 1_000).state, 'idle');
  assert.equal(writeLiveness({ ...base, state: 'ended', now: T0 + 2_000 }), 'written');
  assert.equal(readLiveness(livenessPath(ledgerFile), T0 + 2_000).state, 'ended');
});

test('a repeat of the same state within 30 s writes nothing', () => {
  const ledgerFile = ledgerIn(scratch('throttle'));
  const base = { ledgerFile, sessionId: 'session-a', cwd: '/work/a', env: {}, state: 'alive' };
  assert.equal(LIVENESS_REPEAT_MS, 30_000);
  assert.equal(writeLiveness({ ...base, now: T0 }), 'written');
  assert.equal(writeLiveness({ ...base, now: T0 + 29_000 }), 'unchanged');
  assert.equal(readLiveness(livenessPath(ledgerFile), T0 + 29_000).at, new Date(T0).toISOString());
  assert.equal(writeLiveness({ ...base, now: T0 + 31_000 }), 'written');
  assert.equal(readLiveness(livenessPath(ledgerFile), T0 + 31_000).at, new Date(T0 + 31_000).toISOString());
});

test('a record older than 15 minutes reads as ended', () => {
  const ledgerFile = ledgerIn(scratch('stale'));
  writeLiveness({ ledgerFile, sessionId: 'session-a', cwd: '/work/a', env: {}, state: 'alive', now: T0 });
  assert.equal(LIVENESS_STALE_MS, 15 * 60_000);
  assert.equal(readLiveness(livenessPath(ledgerFile), T0 + LIVENESS_STALE_MS).state, 'alive');
  assert.equal(readLiveness(livenessPath(ledgerFile), T0 + LIVENESS_STALE_MS + 1).state, 'ended');
});

test('a bad pane id is dropped, never stored', () => {
  for (const bad of ['', 'a b', 'x'.repeat(65), '../p', 'p;rm', '\u001b[31m']) assert.equal(paneIdFrom({ HERDR_PANE_ID: bad }), null, JSON.stringify(bad));
  assert.equal(paneIdFrom({}), null);
  assert.equal(paneIdFrom({ HERDR_PANE_ID: 'w2B:p3' }), 'w2B:p3');
  const ledgerFile = ledgerIn(scratch('pane'));
  writeLiveness({ ledgerFile, sessionId: 'session-a', cwd: '/work/a', env: { HERDR_PANE_ID: 'p;rm' }, state: 'alive', now: T0 });
  assert.equal(readLiveness(livenessPath(ledgerFile), T0).pane, null);
});

test('a symlinked liveness record is refused and left alone', () => {
  const root = scratch('symlink');
  const ledgerFile = ledgerIn(root);
  const victim = join(root, 'victim.txt');
  writeFileSync(victim, 'keep');
  mkdirSync(dirname(livenessPath(ledgerFile)), { recursive: true });
  symlinkSync(victim, livenessPath(ledgerFile));
  assert.throws(() => writeLiveness({ ledgerFile, sessionId: 'session-a', cwd: '/work/a', env: {}, state: 'alive', now: T0 }), /LIVENESS_RECORD_UNSAFE/);
  assert.equal(readFileSync(victim, 'utf8'), 'keep');
  assert.equal(readLiveness(livenessPath(ledgerFile), T0), null, 'a symlink is never read');

  const linkedRoot = scratch('symlink-dir');
  const linkedLedger = ledgerIn(linkedRoot);
  const elsewhere = scratch('symlink-elsewhere');
  symlinkSync(elsewhere, dirname(livenessPath(linkedLedger)));
  assert.throws(() => writeLiveness({ ledgerFile: linkedLedger, sessionId: 'session-a', cwd: '/work/a', env: {}, state: 'alive', now: T0 }), /LIVENESS_DIRECTORY_UNSAFE/);
});

function runHook(script, eventName, workspaceRoot, extraEnv = {}) {
  const event = { hookEventName: eventName, sessionId: 'session-live', cwd: workspaceRoot, workspaceRoot };
  if (eventName.startsWith('PostToolUse')) Object.assign(event, { toolName: 'Edit', toolInput: {} });
  if (eventName === 'Stop') event.reason = 'end_turn';
  return spawnSync(join(HOOKS_DIRECTORY, script), [], {
    cwd: PRODUCT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, GROK_HOOK_EVENT: eventName, GROK_HOOK_NAME: script.replace(/\.mjs$/u, ''), GROK_SESSION_ID: 'session-live', GROK_WORKSPACE_ROOT: workspaceRoot, HERDR_PANE_ID: 'w2B:p7', ...extraEnv },
    input: `${JSON.stringify(event)}\n`,
  });
}

test('the hooks write liveness: PostToolUse and its failure alive, Stop idle, SessionEnd ended', () => {
  const workspaceRoot = scratch('hooks');
  const key = createHash('sha256').update('session-live').digest('hex').slice(0, 32);
  const record = join(workspaceRoot, '.grok', 'litgrok', 'liveness', `${key}.json`);
  const read = () => JSON.parse(readFileSync(record, 'utf8'));

  const tool = runHook('post-tool-use.mjs', 'PostToolUse', workspaceRoot);
  assert.equal(tool.status, 0, tool.stderr);
  assert.equal(tool.stdout, '', 'liveness never changes hook output');
  assert.equal(read().state, 'alive');
  assert.equal(read().pane, 'w2B:p7');

  const stop = runHook('stop.mjs', 'Stop', workspaceRoot);
  assert.equal(stop.status, 0, stop.stderr);
  assert.equal(read().state, 'idle');

  const failure = runHook('post-tool-use-failure.mjs', 'PostToolUseFailure', workspaceRoot);
  assert.equal(failure.status, 0, failure.stderr);
  assert.equal(read().state, 'alive');

  const end = runHook('session-end.mjs', 'SessionEnd', workspaceRoot);
  assert.equal(end.status, 0, end.stderr);
  assert.equal(end.stdout, '');
  assert.equal(read().state, 'ended');
});

test('a liveness write that fails leaves the hook output and exit unchanged', () => {
  const workspaceRoot = scratch('hook-fail');
  const key = createHash('sha256').update('session-live').digest('hex').slice(0, 32);
  const directory = join(workspaceRoot, '.grok', 'litgrok', 'liveness');
  mkdirSync(directory, { recursive: true });
  mkdirSync(join(directory, `${key}.json`));
  const result = runHook('post-tool-use.mjs', 'PostToolUse', workspaceRoot);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.ok(existsSync(join(workspaceRoot, '.grok', 'litgrok', 'session-ledger', `${key}.jsonl`)), 'the ledger record is still written');
});
