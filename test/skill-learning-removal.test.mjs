import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL_ROOT = join(PRODUCT_ROOT, '.grok', 'skills', 'skill-observer');

test('automatic skill learning is absent from LitGrok runtime and marketplace surfaces', () => {
  assert.equal(existsSync(SKILL_ROOT), false, 'the skill-observer payload must be removed');

  const stop = readFileSync(join(PRODUCT_ROOT, '.grok', 'hooks', 'stop.mjs'), 'utf8');
  const sessionStart = readFileSync(join(PRODUCT_ROOT, '.grok', 'hooks', 'session-start.mjs'), 'utf8');
  const cli = readFileSync(join(PRODUCT_ROOT, 'bin', 'litgrok.mjs'), 'utf8');
  const market = JSON.parse(readFileSync(join(PRODUCT_ROOT, '.grok-plugin', 'plugin.json'), 'utf8'));

  assert.doesNotMatch(stop, /skill-observer|skill-loop|recordTurnEnded/u, 'Stop must not schedule or record learning review state');
  assert.doesNotMatch(sessionStart, /pendingReviewState|pending-review|skill-observer/u, 'SessionStart must not surface learning review state');
  assert.doesNotMatch(cli, /runSkillLoop|skill-loop <review/u, 'the installer CLI must not expose the removed route');
  const route = spawnSync(process.execPath, [join(PRODUCT_ROOT, 'bin', 'litgrok.mjs'), 'skill-loop', 'list'], {
    cwd: PRODUCT_ROOT,
    encoding: 'utf8',
    env: { ...process.env, HOME: join(tmpdir(), 'litgrok-no-host-state') },
  });
  assert.equal(route.status, 1, 'removed CLI route must be rejected');
  assert.match(route.stderr, /Usage: litgrok \[install\|uninstall\]/u);
  assert.doesNotMatch(route.stderr, /skill-loop/u);
  assert.equal(market.skills.length, readdirSync(join(PRODUCT_ROOT, '.grok', 'skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length, 'the marketplace manifest must enumerate the current skills');
  assert.equal(market.skills.some((skill) => skill.endsWith('/skill-observer')), false);
});

test('Stop and PreToolUse leave pre-existing review state byte-identical', () => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-inert-review-state-'));
  const home = join(root, 'home');
  const state = join(root, '.grok', 'litgrok');
  const pending = join(state, 'pending-review', 'stale.json');
  const loopState = join(state, 'skill-loop-state.json');
  const event = (hookEventName) => ({ hookEventName, sessionId: 'removal-session', cwd: root, workspaceRoot: root });
  const envFor = (hookEventName, hookName) => ({
    ...process.env,
    HOME: home,
    GROK_HOOK_EVENT: hookEventName,
    GROK_HOOK_NAME: hookName,
    GROK_SESSION_ID: 'removal-session',
    GROK_WORKSPACE_ROOT: root,
    LITGROK_SKILL_REVIEW: '1',
  });

  try {
    mkdirSync(join(state, 'pending-review'), { recursive: true });
    writeFileSync(pending, '{"legacy":"pending"}\n', { flag: 'wx' });
    writeFileSync(loopState, '{"legacy":"loop-state"}\n', { flag: 'wx' });
    const before = [readFileSync(pending), readFileSync(loopState)];
    const stop = spawnSync(process.execPath, [join(PRODUCT_ROOT, '.grok', 'hooks', 'stop.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: envFor('Stop', 'stop'),
      input: `${JSON.stringify(event('Stop'))}\n`,
    });
    assert.equal(stop.status, 0, stop.stderr);
    assert.equal(stop.stderr, '');
    const preTool = spawnSync(process.execPath, [join(PRODUCT_ROOT, '.grok', 'hooks', 'deliverable-hedge-guard.mjs')], {
      cwd: root,
      encoding: 'utf8',
      env: envFor('PreToolUse', 'deliverable-hedge-guard'),
      input: `${JSON.stringify({ ...event('PreToolUse'), toolName: 'Edit', toolInput: { path: 'notes.md', content: 'safe' } })}\n`,
    });
    assert.equal(preTool.status, 0, preTool.stderr);
    assert.equal(preTool.stderr, '');
    assert.deepEqual([readFileSync(pending), readFileSync(loopState)], before, 'old review state must remain byte-identical');
    assert.deepEqual(readdirSync(dirname(pending)), ['stale.json'], 'Stop must not create new pending reviews');
    const ledgerDirectory = join(root, '.grok', 'litgrok', 'session-ledger');
    const ledger = readFileSync(join(ledgerDirectory, readdirSync(ledgerDirectory)[0]), 'utf8').trim().split('\n');
    assert.equal(ledger.length, 1, 'PreToolUse must not add a passive or review record');
    assert.equal(JSON.parse(ledger[0]).event, 'Stop');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
