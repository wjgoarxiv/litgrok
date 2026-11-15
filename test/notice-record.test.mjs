import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// SessionStart words the lit-adhd nudge itself. The nudge is limited to one per calendar day, so a user saw the same
// sentence every day. The record keeps a hash and a time per text the hook prints, and the hook skips a text already
// recorded; a missing, corrupt, oversized or symlinked record behaves as before.
const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SESSION_START = join(PRODUCT_ROOT, '.grok', 'hooks', 'session-start.mjs');
const NUDGE = /lit adhd/u;

function sandbox(t, otherSessions = 1) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-notice-record-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const home = join(root, 'home');
  mkdirSync(workspace);
  mkdirSync(home);
  setOtherSessions({ workspace, home }, otherSessions);
  return { root, workspace, home, hud: join(root, 'hud') };
}

function setOtherSessions({ workspace, home }, count) {
  for (let index = 0; index < count; index += 1) mkdirSync(join(home, '.grok', 'sessions', encodeURIComponent(workspace), `other-${index}`), { recursive: true });
}

function sessionStart(sb, sessionId) {
  const event = { hookEventName: 'SessionStart', source: 'startup', sessionId, cwd: sb.workspace, workspaceRoot: sb.workspace };
  const env = { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.hud, GROK_HOOK_EVENT: 'SessionStart', GROK_HOOK_NAME: 'session-start', GROK_SESSION_ID: sessionId, GROK_WORKSPACE_ROOT: sb.workspace, LANG: 'C', LC_ALL: 'C' };
  for (const name of ['CI', 'NO_COLOR']) delete env[name];
  const result = spawnSync(process.execPath, [SESSION_START], { cwd: sb.workspace, encoding: 'utf8', env, input: `${JSON.stringify(event)}\n` });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const markerPath = (sb) => join(sb.workspace, '.grok', 'litgrok', 'adhd', 'suggested.json');
const recordPath = (sb) => join(sb.workspace, '.grok', 'litgrok', 'notices.jsonl');

// The next calendar day: the daily marker no longer matches today.
function nextDay(sb) {
  if (existsSync(markerPath(sb))) writeFileSync(markerPath(sb), `${JSON.stringify({ day: '1970-01-01' })}\n`);
}

test('the same nudge is printed once across sessions on different days', (t) => {
  const sb = sandbox(t);
  assert.match(sessionStart(sb, 'session-1'), NUDGE, 'the first session shows it');
  nextDay(sb);
  assert.doesNotMatch(sessionStart(sb, 'session-2'), NUDGE, 'the next day repeats nothing');
  nextDay(sb);
  assert.doesNotMatch(sessionStart(sb, 'session-3'), NUDGE);
});

test('a nudge with different words is still shown', (t) => {
  const sb = sandbox(t);
  assert.match(sessionStart(sb, 'session-1'), /One other recent session/u);
  nextDay(sb);
  setOtherSessions(sb, 3);
  assert.match(sessionStart(sb, 'session-2'), /\d+ other recent sessions/u);
});

test('the record keeps a hash and a time, never the text', (t) => {
  const sb = sandbox(t);
  sessionStart(sb, 'session-1');
  const lines = readFileSync(recordPath(sb), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.match(lines[0].hash, /^[0-9a-f]{16}$/u);
  assert.ok(Number.isFinite(Date.parse(lines[0].at)));
  assert.equal(lines[0].schema, 'litgrok.notice/v1');
  assert.doesNotMatch(readFileSync(recordPath(sb), 'utf8'), /lit adhd|recent session/u);
});

test('a corrupt record shows the nudge as before and the record recovers', (t) => {
  const sb = sandbox(t);
  mkdirSync(dirname(recordPath(sb)), { recursive: true });
  writeFileSync(recordPath(sb), '{"schema":"litgrok.notice/v1","hash":"not-a-hash"\n\u0000\u0001garbage');
  assert.match(sessionStart(sb, 'session-1'), NUDGE, 'a record that cannot be read does not hide the nudge');
  nextDay(sb);
  assert.doesNotMatch(sessionStart(sb, 'session-2'), NUDGE, 'the valid line appended after the damage counts');
});

test('an oversized record is not trusted and not extended', (t) => {
  const sb = sandbox(t);
  mkdirSync(dirname(recordPath(sb)), { recursive: true });
  const filler = `${JSON.stringify({ schema: 'litgrok.notice/v1', hash: '0123456789abcdef', at: new Date().toISOString() })}\n`.repeat(1000);
  writeFileSync(recordPath(sb), filler);
  assert.match(sessionStart(sb, 'session-1'), NUDGE);
  nextDay(sb);
  assert.match(sessionStart(sb, 'session-2'), NUDGE, 'with no usable record the old behaviour holds');
  assert.equal(readFileSync(recordPath(sb), 'utf8'), filler, 'the oversized file is left alone');
});

test('a symlinked record is neither read nor written through', (t) => {
  const sb = sandbox(t);
  const target = join(sb.root, 'target.jsonl');
  writeFileSync(target, '');
  mkdirSync(dirname(recordPath(sb)), { recursive: true });
  symlinkSync(target, recordPath(sb));
  assert.match(sessionStart(sb, 'session-1'), NUDGE);
  nextDay(sb);
  assert.match(sessionStart(sb, 'session-2'), NUDGE);
  assert.equal(readFileSync(target, 'utf8'), '', 'nothing was written through the link');
});

test('the presence line and the mark are not notices and appear every session', (t) => {
  const sb = sandbox(t, 0);
  for (const id of ['session-1', 'session-2']) {
    const output = sessionStart(sb, id);
    assert.match(output, /LitGrok payload present/u);
    assert.match(output, /^LIT\n/u);
  }
  assert.equal(existsSync(recordPath(sb)), false, 'nothing was recorded because nothing was said');
});
