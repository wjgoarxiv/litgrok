import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));

function runGuardWithShape({ sourceTest, testName, createShape }) {
  const productRoot = mkdtempSync(join(tmpdir(), 'litgrok-blocked-surface-'));
  const isolatedTestDirectory = join(productRoot, 'test');
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;

  try {
    mkdirSync(isolatedTestDirectory);
    const isolatedTestPath = join(isolatedTestDirectory, sourceTest);
    copyFileSync(join(TEST_DIRECTORY, sourceTest), isolatedTestPath);
    createShape(productRoot);

    return spawnSync(
      process.execPath,
      ['--test', `--test-name-pattern=${testName}`, isolatedTestPath],
      { encoding: 'utf8', env: childEnvironment },
    );
  } finally {
    rmSync(productRoot, { recursive: true, force: true });
  }
}

test('a real .grok/lsp directory remains prohibited', () => {
  const result = runGuardWithShape({
    sourceTest: 'skills-and-rules.test.mjs',
    testName: 'does not add undocumented surface directories',
    createShape(productRoot) {
      mkdirSync(join(productRoot, '.grok', 'lsp'), { recursive: true });
    },
  });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /prohibited v1 directories found: \.grok\/lsp/);
});

test('a real .grok/plugins directory remains prohibited', () => {
  const result = runGuardWithShape({
    sourceTest: 'skills-and-rules.test.mjs',
    testName: 'does not add undocumented surface directories',
    createShape(productRoot) {
      mkdirSync(join(productRoot, '.grok', 'plugins'), { recursive: true });
    },
  });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /prohibited v1 directories found: \.grok\/plugins/);
});

test('an [lsp_servers] block in .grok/config.toml remains prohibited', () => {
  const result = runGuardWithShape({
    sourceTest: 'blocked-surfaces.test.mjs',
    testName: 'ships no plugin-supplied LSP server configuration',
    createShape(productRoot) {
      const grokRoot = join(productRoot, '.grok');
      mkdirSync(grokRoot, { recursive: true });
      writeFileSync(join(grokRoot, 'config.toml'), '[lsp_servers.example]\ncommand = "example"\n');
    },
  });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /expected to not match the regular expression/);
});

test('a manifest-listed mirror may contain a host token', () => {
  const result = runGuardWithShape({
    sourceTest: 'blocked-surfaces.test.mjs',
    testName: 'shipped prose stays Grok-native',
    createShape(productRoot) {
      const referencesRoot = join(productRoot, '.grok', 'skills', 'ported', 'references');
      mkdirSync(join(referencesRoot, '_canonical-corpus'), { recursive: true });
      mkdirSync(join(referencesRoot, 'design'), { recursive: true });
      writeFileSync(
        join(referencesRoot, '_canonical-corpus', 'manifest.json'),
        JSON.stringify({ files: [{ path: 'design/source.md' }], legal: [] }),
      );
      writeFileSync(join(referencesRoot, 'design', 'source.md'), 'Claude Code\n');
    },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('the canonical manifest itself may contain a host token', () => {
  const result = runGuardWithShape({
    sourceTest: 'blocked-surfaces.test.mjs',
    testName: 'shipped prose stays Grok-native',
    createShape(productRoot) {
      const referencesRoot = join(productRoot, '.grok', 'skills', 'ported', 'references');
      mkdirSync(join(referencesRoot, '_canonical-corpus'), { recursive: true });
      writeFileSync(
        join(referencesRoot, '_canonical-corpus', 'manifest.json'),
        JSON.stringify({ note: 'Claude Code', files: [], legal: [] }),
      );
    },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('an authored file containing a host token remains prohibited', () => {
  const result = runGuardWithShape({
    sourceTest: 'blocked-surfaces.test.mjs',
    testName: 'shipped prose stays Grok-native',
    createShape(productRoot) {
      const authoredPath = join(productRoot, '.grok', 'skills', 'rules', 'references', 'tmp.md');
      mkdirSync(dirname(authoredPath), { recursive: true });
      writeFileSync(authoredPath, 'Claude Code\n');
    },
  });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /rules[\\/]references[\\/]tmp\.md/);
});

test('a non-manifest JSON reference containing a host token remains prohibited', () => {
  const result = runGuardWithShape({
    sourceTest: 'blocked-surfaces.test.mjs',
    testName: 'shipped prose stays Grok-native',
    createShape(productRoot) {
      const referencesRoot = join(productRoot, '.grok', 'skills', 'ported', 'references');
      mkdirSync(join(referencesRoot, '_canonical-corpus'), { recursive: true });
      writeFileSync(
        join(referencesRoot, '_canonical-corpus', 'manifest.json'),
        JSON.stringify({ files: [], legal: [] }),
      );
      writeFileSync(join(referencesRoot, '_canonical-corpus', 'not-manifest.json'), '{"text":"Claude Code"}\n');
    },
  });

  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout + result.stderr, /not-manifest\.json/);
});
