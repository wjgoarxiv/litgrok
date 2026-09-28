import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { classifyVersion, parseVersion, probe } from '../.grok/skills/browser-drive/scripts/capability-probe.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('agent-browser probe accepts the floor and identifies versions beyond local verification', () => {
  assert.deepEqual(parseVersion('agent-browser 0.34.0'), { major: 0, minor: 34, patch: 0, prerelease: '' });
  assert.equal(classifyVersion('agent-browser 0.34.0').state, 'supported');
  assert.equal(classifyVersion('agent-browser 0.38.1').state, 'supported');
  assert.equal(classifyVersion('agent-browser 0.39.0').state, 'beyond-verified');
  assert.equal(classifyVersion('agent-browser 1.0.0').accepted, true);
  assert.equal(classifyVersion('agent-browser 0.33.9').accepted, false);
  assert.equal(classifyVersion('agent-browser development build').state, 'version-unrecognized');
});

test('agent-browser probe fails clearly when the executable is absent without installing it', () => {
  const result = probe({ ...process.env, PATH: '' });
  assert.equal(result.available, false);
  assert.deepEqual(result.install, ['npm install -g agent-browser', 'agent-browser install']);
  assert.equal(result.source, 'https://github.com/vercel-labs/agent-browser');
});

test('browser-drive documents the engine source, probe, and user-run installation path', () => {
  const skill = readFileSync(join(ROOT, '.grok', 'skills', 'browser-drive', 'SKILL.md'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.match(skill, /vercel-labs\/agent-browser/);
  assert.match(skill, /npm install -g agent-browser/);
  assert.match(skill, /agent-browser install/);
  assert.match(skill, /must not run the installation commands itself/i);
  assert.ok(pkg.scripts['probe:browser-drive']);
});
