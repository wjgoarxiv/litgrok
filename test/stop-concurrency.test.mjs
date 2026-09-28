import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STOP_COMMAND = join(PRODUCT_ROOT, '.grok', 'hooks', 'stop.mjs');

function dispatchStop(workspaceRoot, home, grokHome, sessionId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [STOP_COMMAND], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        HOME: home,
        GROK_HOME: grokHome,
        GROK_HOOK_EVENT: 'Stop',
        GROK_HOOK_NAME: 'stop',
        GROK_SESSION_ID: sessionId,
        GROK_WORKSPACE_ROOT: workspaceRoot,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(`${JSON.stringify({
      hookEventName: 'Stop',
      sessionId,
      cwd: workspaceRoot,
      workspaceRoot,
      reason: 'end_turn',
    })}\n`);
  });
}

test('concurrent Stop hooks append every shared session ledger event without crashing', async (t) => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'litgrok-stop-concurrency-'));
  const home = join(workspaceRoot, 'isolated-home');
  const grokHome = join(workspaceRoot, 'isolated-grok-home');
  mkdirSync(home);
  mkdirSync(grokHome);
  t.after(() => rmSync(workspaceRoot, { recursive: true, force: true }));

  const sessionId = 'session-stop-concurrency';
  const contenders = 6;
  const results = await Promise.all(Array.from({ length: contenders }, () => dispatchStop(workspaceRoot, home, grokHome, sessionId)));
  for (const { status, stderr } of results) {
    assert.equal(status, 0, stderr);
    assert.equal(stderr, '', 'Stop must not report a shared-ledger race as an error');
  }

  const ledgerDirectory = join(workspaceRoot, '.grok', 'litgrok', 'session-ledger');
  const ledgerName = `${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}.jsonl`;
  const records = readFileSync(join(ledgerDirectory, ledgerName), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(records.length, contenders, 'each successful Stop must append one complete record');
  assert.ok(records.every((record) => record.event === 'Stop' && record.signal === 'turn-ended' && record.sessionId === sessionId));
});
