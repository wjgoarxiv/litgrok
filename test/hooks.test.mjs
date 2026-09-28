import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const HOOKS_DIRECTORY = join(PRODUCT_ROOT, '.grok', 'hooks');
const DOCUMENTED_EVENTS = new Set([
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionDenied',
  'Stop',
  'StopFailure',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
]);

const EXPECTED_HOOK_EVENTS = new Set([
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
]);

function hookFiles() {
  if (!existsSync(HOOKS_DIRECTORY)) return [];
  return readdirSync(HOOKS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(HOOKS_DIRECTORY, entry.name));
}

function commandPath(command, label) {
  assert.match(command, /^[^\s;&|`$]+$/, `${label} command must be one hook-directory-relative executable path`);
  assert.equal(isAbsolute(command), false, `${label} command must stay hook-directory-relative`);
  const resolved = resolve(HOOKS_DIRECTORY, command);
  assert.ok(resolved.startsWith(`${PRODUCT_ROOT}/`), `${label} command must stay inside the package`);
  return resolved;
}

test('hook event allowlist is the documented fourteen', () => {
  assert.equal(DOCUMENTED_EVENTS.size, 14);
});

test('package allowlist includes the documented hooks tree', () => {
  const packageJson = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  assert.ok(packageJson.files.includes('.grok/hooks'), 'package files must include .grok/hooks');
});

test('package ships the intended documented hook coverage', () => {
  const configuredEvents = new Set();
  for (const filePath of hookFiles()) {
    const config = JSON.parse(readFileSync(filePath, 'utf8'));
    for (const event of Object.keys(config.hooks ?? {})) configuredEvents.add(event);
  }

  assert.deepEqual([...configuredEvents].sort(), [...EXPECTED_HOOK_EVENTS].sort());
});

test('every hook config uses documented events and executable command paths', () => {
  for (const filePath of hookFiles()) {
    const label = relative(PRODUCT_ROOT, filePath);
    const config = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.equal(typeof config.hooks, 'object', `${label} must have a hooks object`);
    assert.ok(config.hooks && !Array.isArray(config.hooks), `${label} hooks must be an object`);

    const events = Object.keys(config.hooks);
    assert.ok(events.length > 0, `${label} must name at least one hook event`);
    for (const event of events) {
      assert.ok(DOCUMENTED_EVENTS.has(event), `${label} uses undocumented event ${event}`);
      assert.ok(Array.isArray(config.hooks[event]), `${label} ${event} registrations must be an array`);
      for (const [registrationIndex, registration] of config.hooks[event].entries()) {
        assert.ok(Array.isArray(registration.hooks), `${label} ${event}[${registrationIndex}] must have a hooks array`);
        for (const [hookIndex, hook] of registration.hooks.entries()) {
          const hookLabel = `${label} ${event}[${registrationIndex}].hooks[${hookIndex}]`;
          assert.equal(hook.type, 'command', `${hookLabel} must be a command hook`);
          assert.equal(typeof hook.command, 'string', `${hookLabel} must name a command path`);
          const executablePath = commandPath(hook.command, hookLabel);
          assert.ok(existsSync(executablePath), `${hookLabel} command does not exist`);
          const executable = statSync(executablePath);
          assert.ok(executable.isFile(), `${hookLabel} command must be a regular file`);
          assert.notEqual(executable.mode & 0o111, 0, `${hookLabel} command must be executable`);
        }
      }
    }
  }
});
