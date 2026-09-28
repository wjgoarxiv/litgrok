import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const SCRIPT_ROOT = join(PRODUCT_ROOT, '.grok', 'skills', 'lsp-setup', 'scripts');
const DETECT = join(SCRIPT_ROOT, 'detect-lsp.mjs');
const VERIFY = join(SCRIPT_ROOT, 'verify-lsp.mjs');
const TABLE = join(SCRIPT_ROOT, 'lsp-server-table.mjs');

function fixture(label) {
  const root = mkdtempSync(join(tmpdir(), `litgrok-lsp-${label}-`));
  const project = join(root, 'project');
  const home = join(root, 'home');
  const fake = join(root, 'fake-grok.mjs');
  mkdirSync(project, { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(join(project, 'index.ts'), 'const answer: number = 42;\n');
  writeFileSync(join(project, 'script.mjs'), 'export {};\n');
  writeFileSync(fake, [
    `#!${process.execPath}`,
    "import { writeFileSync } from 'node:fs';",
    "const args = process.argv.slice(2);",
    "if (args[0] !== 'inspect' || !args.includes('--json')) process.exit(9);",
    "if (process.env.FAKE_GROK_STDERR) process.stderr.write(process.env.FAKE_GROK_STDERR);",
    "if (process.env.FAKE_GROK_EXIT) process.exit(Number(process.env.FAKE_GROK_EXIT));",
    "process.stdout.write(process.env.FAKE_GROK_INSPECT ?? '{}');",
    '',
  ].join('\n'), { mode: 0o755 });
  chmodSync(fake, 0o755);
  test.after(() => rmSync(root, { recursive: true, force: true }));
  return { fake, home, project, root };
}

function run(script, args, state, inspection, extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: state.project,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: state.home,
      GROK_BIN: state.fake,
      FAKE_GROK_INSPECT: JSON.stringify(inspection),
      ...extraEnv,
    },
  });
}

test('detect-lsp reports project extensions against the host-reported empty LSP inventory', () => {
  const state = fixture('detect');
  const result = run(DETECT, [state.project, '--json'], state, {
    grokVersion: '1.0.5',
    cwd: state.project,
    projectTrusted: true,
    lspServers: [],
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.extensions, [
    { extension: '.mjs', files: 1 },
    { extension: '.ts', files: 1 },
  ]);
  assert.equal(report.host.status, 'unconfigured');
  assert.equal(report.host.lspServerCount, 0);
  assert.deepEqual(report.coverage.map((entry) => entry.status), ['unconfigured', 'unconfigured']);
  assert.doesNotMatch(result.stdout, /extensionToLanguage|\.lsp\.json/);
});

test('detect-lsp preserves only the shape of opaque host entries and never invents a server mapping', () => {
  const state = fixture('opaque');
  const result = run(DETECT, [state.project, '--json'], state, {
    grokVersion: '1.0.5',
    lspServers: [{ name: 'host-owned', command: ['hidden'] }],
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.host.status, 'opaque');
  assert.equal(report.host.lspServerCount, 1);
  assert.deepEqual(report.host.entries, [{ index: 0, keys: ['command', 'name'] }]);
  assert.ok(report.coverage.every((entry) => entry.status === 'opaque'));
  assert.doesNotMatch(result.stdout, /hidden/);
});

test('verify-lsp reports the documented unsupported boundary when Grok exposes no server transport', () => {
  const state = fixture('verify');
  const file = join(state.project, 'index.ts');
  const result = run(VERIFY, [file, `--project=${state.project}`, '--json'], state, {
    grokVersion: '1.0.5',
    lspServers: [],
  });
  assert.equal(result.status, 3, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'unconfigured');
  assert.equal(report.file, file);
  assert.match(report.message, /no language-server entries/i);
});

test('verify-lsp does not treat opaque host entries as a direct diagnostic API', () => {
  const state = fixture('verify-opaque');
  const file = join(state.project, 'index.ts');
  const result = run(VERIFY, [file, `--project=${state.project}`, '--json'], state, {
    grokVersion: '1.0.5',
    lspServers: [{ name: 'host-owned' }],
  });
  assert.equal(result.status, 3, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'opaque');
  assert.match(report.message, /no documented diagnostic transport/i);
});

test('lsp-server-table reports host inspection metadata without a static server table', () => {
  const state = fixture('table');
  const result = run(TABLE, ['--project', state.project, '--json'], state, {
    grokVersion: '1.0.5',
    projectTrusted: true,
    lspServers: [],
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'unconfigured');
  assert.equal(report.lspServerCount, 0);
  assert.equal(report.projectTrusted, true);
  assert.doesNotMatch(readFileSync(TABLE, 'utf8'), /extensionToLanguage|\.lsp\.json/);
});

test('detect-lsp fails closed when the host inspection command fails', () => {
  const state = fixture('inspect-fail');
  const result = run(DETECT, [state.project, '--json'], state, {}, {
    FAKE_GROK_EXIT: '7',
    FAKE_GROK_STDERR: 'host inspection failed\n',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /GROK_INSPECT_FAILED/);
});
