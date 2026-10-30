import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGE = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));
const GATE_SCRIPT = 'node scripts/prepublish-test-gate.mjs';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function createFixture({ testCommand = 'node --test', failingSuite = false } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'litgrok-prepublish-gate-'));
  const root = join(scratch, 'package');
  const home = join(scratch, 'home');
  const name = `litgrok-prepublish-gate-fixture-${process.pid}`;
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(home);
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name,
    version: '1.0.0',
    scripts: { prepublishOnly: PACKAGE.scripts.prepublishOnly, test: testCommand },
  }));
  writeFileSync(
    join(root, 'scripts', 'prepublish-test-gate.mjs'),
    readFileSync(join(PRODUCT_ROOT, 'scripts', 'prepublish-test-gate.mjs')),
  );

  if (failingSuite) {
    mkdirSync(join(root, 'test'));
    const archive = `${name}-1.0.0.tgz`;
    writeFileSync(join(root, 'test', 'fails.test.mjs'), `
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import test from 'node:test';

writeFileSync(new URL('../suite-started', import.meta.url), 'yes');
test('nested npm pack stays real under publish dry-run', () => {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : ${JSON.stringify(NPM)};
  const args = npmCli ? [npmCli, 'pack', '--ignore-scripts'] : ['pack', '--ignore-scripts'];
  const packed = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32' && !npmCli,
  });
  assert.equal(packed.status, 0, packed.stderr);
  assert.equal(existsSync(${JSON.stringify(archive)}), true);
});
test('intentional release gate failure', () => assert.fail('intentional LitGrok gate suite failure'));
`);
  }

  return { archive: `${name}-1.0.0.tgz`, home, root, scratch };
}

function runNpm(args, fixture, extraEnv = {}) {
  const env = {
    ...process.env,
    HOME: fixture.home,
    NPM_CONFIG_USERCONFIG: join(fixture.home, '.npmrc'),
    NPM_CONFIG_CACHE: join(fixture.home, 'npm-cache'),
    NPM_CONFIG_REGISTRY: 'http://127.0.0.1:9',
    NPM_CONFIG_OFFLINE: 'true',
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_FUND: 'false',
  };
  delete env.NODE_TEST_CONTEXT;
  delete env.LITGROK_PUBLISH_FROM_CI;
  Object.assign(env, extraEnv);
  for (const [key, value] of Object.entries(extraEnv)) if (value === undefined) delete env[key];
  return spawnSync(NPM, args, {
    cwd: fixture.root,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    shell: process.platform === 'win32',
    timeout: 30_000,
    env,
  });
}

function output(result) {
  return `${result.stdout}\n${result.stderr}`;
}

test('publish-only hook delegates to the test suite', () => {
  assert.equal(PACKAGE.scripts.prepublishOnly, GATE_SCRIPT);
});

test('publish refuses when a test fails and the gate clears inherited dry-run state', () => {
  const fixture = createFixture({ failingSuite: true });
  try {
    const result = runNpm([
      'publish', '--dry-run', '--offline', '--foreground-scripts', '--ignore-scripts=false',
      '--registry=http://127.0.0.1:9',
    ], fixture);

    assert.equal(result.error, undefined, result.error?.message);
    assert.notEqual(result.status, 0, output(result));
    assert.match(output(result), /intentional LitGrok gate suite failure/u);
    assert.equal(existsSync(join(fixture.root, 'suite-started')), true, 'the failing suite must actually start');
    assert.equal(existsSync(join(fixture.root, fixture.archive)), true, 'nested npm pack must create a real archive');
  } finally {
    rmSync(fixture.scratch, { recursive: true, force: true });
  }
});

test('publish refuses when the test command cannot start', () => {
  const fixture = createFixture({ testCommand: 'litgrok-missing-test-runner' });
  try {
    const result = runNpm([
      'publish', '--dry-run', '--offline', '--foreground-scripts', '--ignore-scripts=false',
      '--registry=http://127.0.0.1:9',
    ], fixture);

    assert.equal(result.error, undefined, result.error?.message);
    assert.notEqual(result.status, 0, output(result));
    assert.equal(existsSync(join(fixture.root, 'suite-started')), false);
  } finally {
    rmSync(fixture.scratch, { recursive: true, force: true });
  }
});

test('a local publish without the CI flag still runs the full suite', () => {
  const fixture = createFixture({ failingSuite: true });
  try {
    const result = runNpm([
      'publish', '--dry-run', '--offline', '--foreground-scripts', '--ignore-scripts=false',
      '--registry=http://127.0.0.1:9',
    ], fixture, { GITHUB_ACTIONS: 'true' });

    assert.notEqual(result.status, 0, output(result));
    assert.equal(existsSync(join(fixture.root, 'suite-started')), true, 'the suite must run without the CI flag');
    assert.doesNotMatch(output(result), /the suite is not run again/u);
  } finally {
    rmSync(fixture.scratch, { recursive: true, force: true });
  }
});

test('the CI flag outside GitHub Actions refuses the publish instead of skipping the suite', () => {
  const fixture = createFixture({ testCommand: 'node -e "process.exitCode = 0"' });
  try {
    const result = runNpm([
      'publish', '--dry-run', '--offline', '--foreground-scripts', '--ignore-scripts=false',
      '--registry=http://127.0.0.1:9',
    ], fixture, { LITGROK_PUBLISH_FROM_CI: '1', GITHUB_ACTIONS: undefined });

    assert.notEqual(result.status, 0, output(result));
    assert.match(output(result), /prepublish test gate refused: this is not a GitHub Actions run/u);
  } finally {
    rmSync(fixture.scratch, { recursive: true, force: true });
  }
});

const SHA = 'f'.repeat(40);
const CI_ENV = { GITHUB_ACTIONS: 'true', GITHUB_SHA: SHA, GITHUB_REPOSITORY: 'wjgoarxiv/litgrok', GITHUB_TOKEN: 'token' };
const cleanCheckout = (args) => (args[0] === 'rev-parse' ? SHA : '');
const reply = (payload, status = 200) => async () => ({ ok: status === 200, status, json: async () => payload });
const GREEN = { workflow_runs: [{ id: 41, head_sha: SHA, conclusion: 'success' }] };

test('the CI gate passes when ci.yml passed on the same clean commit', async () => {
  const { checkCiRun } = await import('../scripts/prepublish-test-gate.mjs');
  const asked = [];
  const request = async (url, init) => {
    asked.push({ url, authorization: init.headers.authorization });
    return reply(GREEN)();
  };
  const verdict = await checkCiRun({ env: CI_ENV, request, runGit: cleanCheckout });
  assert.equal(verdict.passed, true, verdict.why);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].authorization, 'Bearer token');
  assert.equal(
    asked[0].url,
    `https://api.github.com/repos/wjgoarxiv/litgrok/actions/workflows/ci.yml/runs?head_sha=${SHA}&status=success&event=push&per_page=1`,
  );
});

test('the CI gate refuses every case without a green ci.yml run on this checkout', async () => {
  const { checkCiRun } = await import('../scripts/prepublish-test-gate.mjs');
  const cases = [
    ['no matching run', { request: reply({ workflow_runs: [] }) }, /no successful push run/u],
    ['run for another commit', { request: reply({ workflow_runs: [{ id: 1, head_sha: 'e'.repeat(40), conclusion: 'success' }] }) }, /no successful push run/u],
    ['failed run', { request: reply({ workflow_runs: [{ id: 1, head_sha: SHA, conclusion: 'failure' }] }) }, /no successful push run/u],
    ['HTTP error', { request: reply({}, 404) }, /answered 404/u],
    ['offline', { request: async () => { throw new Error('getaddrinfo ENOTFOUND'); } }, /could not be reached: getaddrinfo ENOTFOUND/u],
    ['HEAD mismatch', { runGit: (args) => (args[0] === 'rev-parse' ? 'd'.repeat(40) : '') }, /checkout is not/u],
    ['dirty tree', { runGit: (args) => (args[0] === 'rev-parse' ? SHA : ' M bin/litgrok.mjs') }, /local changes/u],
    ['git unavailable', { runGit: () => null }, /checkout is not/u],
    ['not in Actions', { env: { ...CI_ENV, GITHUB_ACTIONS: undefined } }, /not a GitHub Actions run/u],
    ['short sha', { env: { ...CI_ENV, GITHUB_SHA: 'abc123' } }, /not a GitHub Actions run/u],
    ['bad repository string', { env: { ...CI_ENV, GITHUB_REPOSITORY: 'wjgoarxiv/litgrok?per_page=100' } }, /not a GitHub Actions run/u],
  ];
  for (const [label, override, reason] of cases) {
    let calls = 0;
    const request = override.request ?? reply(GREEN);
    const verdict = await checkCiRun({
      env: override.env ?? CI_ENV,
      runGit: override.runGit ?? cleanCheckout,
      request: async (...args) => { calls += 1; return request(...args); },
    });
    assert.equal(verdict.passed, false, label);
    assert.match(verdict.why, reason, label);
    if (!override.request) assert.equal(calls, 0, `${label} must refuse before asking the GitHub API`);
  }
});
