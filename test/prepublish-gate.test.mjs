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

function runNpm(args, fixture) {
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
