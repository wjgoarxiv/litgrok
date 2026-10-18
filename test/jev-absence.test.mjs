import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// The family's skill-hint feature (Jev) sent prompts to the external Typesafe API. It was retired on
// 2026-10-18. LitGrok never wired it in, and these checks keep any hint hook, env switch or Typesafe
// call from arriving later.
const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const THIS_FILE = 'test/jev-absence.test.mjs';
const ALLOWED = new Set(['CHANGELOG.md', THIS_FILE]);
const PATTERN = /\bjev\b|typesafe|_JEV\b/iu;

test('no tracked text file names the retired hint feature, its switches or the Typesafe API', () => {
  const listing = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: PRODUCT_ROOT });
  assert.equal(listing.status, 0, listing.stderr.toString());
  const hits = [];
  for (const name of listing.stdout.toString().split('\0').filter(Boolean)) {
    if (ALLOWED.has(name)) continue;
    const path = join(PRODUCT_ROOT, name);
    if (!existsSync(path) || !statSync(path).isFile()) continue;
    const bytes = readFileSync(path);
    if (bytes.subarray(0, 8000).includes(0)) continue;
    const lines = bytes.toString('utf8').split('\n');
    lines.forEach((line, index) => { if (PATTERN.test(line)) hits.push(`${name}:${index + 1}`); });
  }
  assert.deepEqual(hits, []);
});

test('UserPromptSubmit adds no hint and opens no connection even with the old switches set', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'litgrok-no-hint-'));
  const hudRoot = mkdtempSync(join(tmpdir(), 'litgrok-no-hint-hud-'));
  const tripwire = join(hudRoot, 'network-attempt');
  // Any fetch or http(s) request from the hook writes the tripwire file and fails.
  const preload = `data:text/javascript,${encodeURIComponent(`
    import { writeFileSync } from 'node:fs';
    import http from 'node:http';
    import https from 'node:https';
    import { syncBuiltinESMExports } from 'node:module';
    const trip = (what) => () => { writeFileSync(process.env.LITGROK_TEST_TRIPWIRE, what); throw new Error('network blocked'); };
    globalThis.fetch = trip('fetch');
    for (const mod of [http, https]) { mod.request = trip('request'); mod.get = trip('get'); }
    syncBuiltinESMExports();
  `)}`;
  const event = {
    hookEventName: 'UserPromptSubmit',
    sessionId: 'session-no-hint',
    cwd: workspaceRoot,
    workspaceRoot,
    prompt: 'Make a ten-slide PowerPoint deck about our third-quarter sales.',
  };
  try {
    const result = spawnSync(process.execPath, ['--import', preload, join(PRODUCT_ROOT, '.grok', 'hooks', 'user-prompt-submit.mjs')], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      input: `${JSON.stringify(event)}\n`,
      env: {
        ...process.env,
        GROK_HOOK_EVENT: 'UserPromptSubmit',
        GROK_HOOK_NAME: 'user-prompt-submit',
        GROK_SESSION_ID: event.sessionId,
        GROK_WORKSPACE_ROOT: workspaceRoot,
        LITGROK_HUD_STATE_ROOT: join(hudRoot, 'state'),
        LITGROK_JEV: '1',
        TYPESAFE_API_KEY: 'placeholder-not-a-key',
        LITGROK_TEST_TRIPWIRE: tripwire,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '', 'the prompt hook must not inject any text');
    assert.equal(existsSync(tripwire), false, 'the prompt hook must not reach the network');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
    rmSync(hudRoot, { recursive: true, force: true });
  }
});
