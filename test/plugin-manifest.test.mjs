import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MANIFEST_PATH = join(PRODUCT_ROOT, 'plugin.json');
const MARKETPLACE_MANIFEST_PATH = join(PRODUCT_ROOT, '.grok-plugin', 'plugin.json');
// Resolve the host Grok rather than hardcoding one developer's home directory. The
// previous absolute path passed only on the machine that wrote it; the first CI run
// after this suite gained a workflow failed here with ENOENT.
function findGrokBinary() {
  const candidates = [join(homedir(), '.grok', 'bin', 'grok')];
  for (const entry of (process.env.PATH ?? '').split(delimiter)) {
    if (entry) candidates.push(join(entry, 'grok'));
  }
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const GROK_BIN = findGrokBinary();

test('declares the live Grok plugin components without unsupported surfaces', () => {
  assert.equal(existsSync(MANIFEST_PATH), true, 'plugin.json must be shipped at the package root');
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  assert.equal(manifest.name, 'litgrok');
  assert.equal(manifest.version, '1.0.12');
  assert.equal(typeof manifest.description, 'string');
  assert.equal(manifest.skills, './.grok/skills');
  assert.equal(manifest.agents, './.grok/agents');
  assert.equal(manifest.hooks, './hooks/hooks.json');
  assert.ok(existsSync(join(PRODUCT_ROOT, 'hooks/hooks.json')), 'native hook manifest must be present in the package');

  for (const unsupported of ['commands', 'mcpServers', 'lspServers', 'outputStyles']) {
    assert.equal(Object.hasOwn(manifest, unsupported), false, `${unsupported} is not shipped by LitGrok`);
  }
});

test('uses the native plugin hook manifest form', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  assert.equal(manifest.hooks, './hooks/hooks.json', 'native plugins must point hooks at hooks/hooks.json');
  const hooksPath = join(PRODUCT_ROOT, manifest.hooks.slice(2));
  assert.equal(existsSync(hooksPath), true, 'native hook manifest must be shipped at hooks/hooks.json');
  const hooks = JSON.parse(readFileSync(hooksPath, 'utf8'));
  assert.equal(typeof hooks.hooks, 'object');
  assert.deepEqual(
    Object.keys(hooks.hooks).sort(),
    [
      'PostCompact',
      'PostToolUse',
      'PostToolUseFailure',
      'PreCompact',
      'PreToolUse',
      'SessionStart',
      'Stop',
      'StopFailure',
      'SubagentStart',
      'SubagentStop',
      'UserPromptSubmit',
    ],
  );
  for (const registrations of Object.values(hooks.hooks)) {
    for (const registration of registrations) {
      for (const hook of registration.hooks) {
        assert.equal(hook.type, 'command');
        assert.match(hook.command, /^node "\$GROK_PLUGIN_ROOT\/\.grok\/hooks\/[^"\s]+\.mjs"$/u);
        const scriptName = hook.command.match(/\.grok\/hooks\/([^"\s]+)"$/u)[1];
        assert.equal(existsSync(join(PRODUCT_ROOT, '.grok/hooks', scriptName)), true);
      }
    }
  }
});

test('publishes a marketplace scanner manifest for the custom payload directories', () => {
  assert.equal(existsSync(MARKETPLACE_MANIFEST_PATH), true, 'marketplace scanner manifest must be present');
  const manifest = JSON.parse(readFileSync(MARKETPLACE_MANIFEST_PATH, 'utf8'));
  assert.equal(manifest.name, 'litgrok');
  assert.equal(manifest.version, '1.0.12');
  const skillDirectories = readdirSync(join(PRODUCT_ROOT, '.grok', 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `./.grok/skills/${entry.name}`)
    .sort();
  assert.equal(manifest.skills.length, skillDirectories.length);
  assert.deepEqual([...manifest.skills].sort(), skillDirectories);
  assert.ok(manifest.skills.every((path) => /^\.\/\.grok\/skills\/[^/]+$/u.test(path)));
  assert.equal(manifest.agents.length, 11);
  assert.ok(manifest.agents.every((path) => /^\.\/\.grok\/agents\/[^/]+\.md$/u.test(path)));
  assert.equal(manifest.hooks, './hooks/hooks.json');
});

// Skipped where no Grok host is installed, which includes CI. The manifest's shape is
// asserted unconditionally above; only the host's own verdict needs the binary.
test('grok plugin validate accepts the shipped manifest', { skip: GROK_BIN === null }, () => {
  const isolatedHome = mkdtempSync(join(tmpdir(), 'litgrok-plugin-validate-'));
  try {
    const result = spawnSync(GROK_BIN, ['plugin', 'validate', PRODUCT_ROOT], {
      cwd: PRODUCT_ROOT,
      encoding: 'utf8',
      env: { ...process.env, HOME: isolatedHome, GROK_HOME: join(isolatedHome, '.grok') },
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(`${result.stdout}\n${result.stderr}`, /Plugin manifest is valid/i);
  } finally {
    rmSync(isolatedHome, { recursive: true, force: true });
  }
});
