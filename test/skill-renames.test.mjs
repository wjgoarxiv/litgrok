import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';
import { restoreHistoricalFixture } from './fixtures/historical-installs/restore.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILLS = {
  hyperplan: 'lit-crucible',
  'init-deep': 'lit-init',
  'git-master': 'lit-commit',
  teammode: 'lit-team',
  'remove-ai-slops': 'lit-burnoff',
  'ai-slop-remover': 'lit-burnoff-file',
  'text-naturalization': 'lit-humanizer',
  'lit-korean': 'lit-humanizer',
  'korean-ai-slop-remover': 'lit-humanizer',
  programming: 'lit-code',
};
const AGENTS = {
  'litgrok-prometheus-planner': 'litgrok-planner',
  'litgrok-boulder-executor': 'litgrok-executor',
  'litgrok-oracle-verifier': 'litgrok-verifier',
};
const humanizerAliases = new Set(['text-naturalization', 'lit-korean', 'korean-ai-slop-remover']);
const note = (old, name) => humanizerAliases.has(old)
  ? `Note: \`${old}\` now opens \`${name}\`; any modified legacy copy is kept for review.`
  : `Note: \`${old}\` was renamed to \`${name}\`; the old name is removed in the next minor.`;

for (const [old, name] of Object.entries(SKILLS)) {
  test(`alias ${old} -> ${name} + one routing note`, () => {
    const rule = readFileSync(join(ROOT, '.grok/rules/00-litgrok.md'), 'utf8');
    const row = rule.split('\n').find((line) => line.startsWith(`| \`${old}\` |`));
    assert.equal(row, `| \`${old}\` | \`${name}\` | ${note(old, name)} |`);
    assert.equal(rule.split(note(old, name)).length - 1, 1);
    assert.equal(existsSync(join(ROOT, '.grok/skills', old)), false);
    const skill = readFileSync(join(ROOT, '.grok/skills', name, 'SKILL.md'), 'utf8');
    assert.ok(skill.startsWith(`---\nname: ${name}\n`));
    assert.doesNotMatch(skill, /formerly known as|was renamed to/i);
  });
}

for (const [old, name] of Object.entries(AGENTS)) {
  test(`alias ${old} -> ${name} + one deprecation note`, () => {
    const rule = readFileSync(join(ROOT, '.grok/rules/00-litgrok.md'), 'utf8');
    assert.ok(rule.includes(`| \`${old}\` | \`${name}\` | ${note(old, name)} |`));
    assert.equal(rule.split(note(old, name)).length - 1, 1);
    assert.equal(existsSync(join(ROOT, '.grok/agents', `${old}.md`)), false);
    assert.ok(readFileSync(join(ROOT, '.grok/agents', `${name}.md`), 'utf8').startsWith(`---\nname: ${name}\n`));
  });
}

for (const [old, name] of Object.entries(AGENTS)) {
  const bare = old.slice('litgrok-'.length);
  test(`alias ${bare} -> ${name} + one deprecation note`, () => {
    const rule = readFileSync(join(ROOT, '.grok/rules/00-litgrok.md'), 'utf8');
    assert.ok(rule.includes(`| \`${bare}\` | \`${name}\` | ${note(bare, name)} |`));
    assert.equal(rule.split(note(bare, name)).length - 1, 1);
  });
}

test('alias guidance keeps quoted data inert and documents the native slash boundary', () => {
  const rule = readFileSync(join(ROOT, '.grok/rules/00-litgrok.md'), 'utf8');
  assert.match(rule, /explicit user invocation/i);
  assert.match(rule, /exact whole token/i);
  assert.match(rule, /once per invoked alias/i);
  assert.match(rule, /quoted text[^\n]*inert/i);
  assert.match(rule, /old slash[^\n]*not guaranteed/i);
  assert.equal(existsSync(join(ROOT, '.grok/commands')), false);
});

function snapshot(root, relative = '') {
  const entries = {};
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const path = join(relative, entry.name);
    const stat = lstatSync(join(root, path));
    entries[path] = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
    if (stat.isDirectory()) Object.assign(entries, snapshot(root, path));
  }
  return entries;
}

function previousInstall(root, { manifest = true } = {}) {
  restoreHistoricalFixture(manifest ? 'before-renames' : 'pre-manifest', root, { payloadOnly: true });
  if (manifest) {
    const files = Object.fromEntries(Object.entries(snapshot(join(root, '.grok'))).filter(([, hash]) => /^[a-f0-9]{64}$/.test(hash)));
    writeFileSync(join(root, '.grok/.litgrok-install-manifest.json'), JSON.stringify({ schema: 'litgrok.install-manifest/v1', package: 'litgrok-ai', version: 'previous', files }));
  }
}

async function install(root, args = ['install'], { interactive = true, noColor = false } = {}) {
  let output = '';
  const stream = { isTTY: interactive, write: (chunk) => { output += chunk; return true; } };
  const env = { HOME: root, ...(noColor ? { NO_COLOR: '1' } : {}) };
  const code = await run(args, { cwd: root, env, stdin: stream, stdout: stream, stderr: stream });
  return { code, output };
}

for (const scope of ['project', 'user']) {
  test(`${scope} update removes all eight owned old skill directories and three old agents`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'litgrok-renames-'));
    try {
      previousInstall(root);
      const result = await install(root, ['install', `--${scope}`]);
      assert.equal(result.code, 0, result.output);
      for (const [old, name] of Object.entries(SKILLS)) {
        assert.equal(existsSync(join(root, '.grok/skills', old)), false, old);
        assert.deepEqual(readFileSync(join(root, '.grok/skills', name, 'SKILL.md')), readFileSync(join(ROOT, '.grok/skills', name, 'SKILL.md')));
      }
      for (const [old, name] of Object.entries(AGENTS)) {
        assert.equal(existsSync(join(root, '.grok/agents', `${old}.md`)), false, old);
        assert.ok(existsSync(join(root, '.grok/agents', `${name}.md`)));
      }
      const installed = JSON.parse(readFileSync(join(root, '.grok/.litgrok-install-manifest.json'), 'utf8'));
      const current = snapshot(join(ROOT, '.grok'));
      assert.deepEqual(installed.files, Object.fromEntries(Object.entries(current).filter(([, hash]) => /^[a-f0-9]{64}$/.test(hash))));
      const before = snapshot(root);
      assert.equal((await install(root, ['install', `--${scope}`])).code, 0);
      assert.deepEqual(snapshot(root), before, 'reinstall must be idempotent');
    } finally {
      rmSync(root, { recursive: true, force: true });
      assert.equal(existsSync(root), false);
    }
  });
}

for (const kind of ['modified', 'foreign', 'symlink', 'new-conflict', 'foreign-agent', 'symlink-agent', 'unowned-empty']) {
  test(`rename migration refuses ${kind} before any writes`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'litgrok-rename-refusal-'));
    try {
      previousInstall(root);
      const old = join(root, '.grok/skills/hyperplan');
      if (kind === 'modified') writeFileSync(join(old, 'SKILL.md'), 'user edit\n');
      if (kind === 'foreign') writeFileSync(join(old, 'keep.txt'), 'user file\n');
      if (kind === 'symlink') { rmSync(old, { recursive: true }); symlinkSync(join(root, '.grok/skills/init-deep'), old, 'dir'); }
      if (kind === 'new-conflict') { mkdirSync(join(root, '.grok/skills/lit-crucible')); writeFileSync(join(root, '.grok/skills/lit-crucible/SKILL.md'), 'foreign\n'); }
      const oldAgent = join(root, '.grok/agents/litgrok-prometheus-planner.md');
      if (kind === 'foreign-agent') writeFileSync(oldAgent, 'foreign\n');
      if (kind === 'symlink-agent') { rmSync(oldAgent); symlinkSync(join(root, '.grok/agents/litgrok-qa-runner.md'), oldAgent); }
      if (kind === 'unowned-empty') {
        rmSync(join(root, '.grok'), { recursive: true });
        mkdirSync(old, { recursive: true });
      }
      const before = snapshot(root);
      const result = await install(root);
      assert.equal(result.code, 1, result.output);
      assert.match(result.output, /Refusing/);
      assert.deepEqual(snapshot(root), before, 'refusal must preserve the complete destination');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

for (const mode of ['dry-run', 'NO_COLOR', 'non-interactive']) {
  test(`rename migration ${mode} preserves the old installed tree`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'litgrok-rename-preview-'));
    try {
      previousInstall(root);
      const before = snapshot(root);
      const result = await install(root, mode === 'dry-run' ? ['install', '--dry-run'] : ['install'], { interactive: mode !== 'non-interactive', noColor: mode === 'NO_COLOR' });
      assert.equal(result.code, 0, result.output);
      assert.deepEqual(snapshot(root), before);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('pristine pre-manifest rename migration removes old skill directories', async () => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-rename-pre-manifest-'));
  try {
    previousInstall(root, { manifest: false });
    const result = await install(root);
    assert.equal(result.code, 0, result.output);
    for (const old of Object.keys(SKILLS)) assert.equal(existsSync(join(root, '.grok/skills', old)), false, old);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function previousHumanizer(root, { modified = false, extra = false } = {}) {
  const oldDirectory = join(root, '.grok', 'skills', 'lit-korean');
  mkdirSync(oldDirectory, { recursive: true });
  const original = '---\nname: lit-korean\n---\nLegacy prose guidance.\n';
  writeFileSync(join(oldDirectory, 'SKILL.md'), modified ? `${original}\nUser addition.\n` : original);
  if (extra) writeFileSync(join(oldDirectory, 'user-notes.md'), 'Keep this note.\n');
  const hash = createHash('sha256').update(original).digest('hex');
  mkdirSync(join(root, '.grok'), { recursive: true });
  writeFileSync(join(root, '.grok/.litgrok-install-manifest.json'), JSON.stringify({
    schema: 'litgrok.install-manifest/v1', package: 'litgrok-ai', version: 'previous',
    files: { 'skills/lit-korean/SKILL.md': hash },
  }));
  return oldDirectory;
}

function previousPreManifestHumanizer(root, { modified = false } = {}) {
  const oldDirectory = join(root, '.grok', 'skills', 'lit-korean');
  mkdirSync(oldDirectory, { recursive: true });
  const shippedBytes = readFileSync(join(ROOT, 'test/fixtures/legacy-lit-korean-SKILL.md'));
  writeFileSync(join(oldDirectory, 'SKILL.md'), modified ? Buffer.concat([shippedBytes, Buffer.from('\nUser addition.\n')]) : shippedBytes);
  return oldDirectory;
}

test('fresh install registers lit-humanizer without a retired skill folder', async () => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-humanizer-fresh-'));
  try {
    const result = await install(root, ['install']);
    assert.equal(result.code, 0, result.output);
    assert.ok(existsSync(join(root, '.grok', 'skills', 'lit-humanizer', 'SKILL.md')));
    assert.equal(existsSync(join(root, '.grok', 'skills', 'lit-korean')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pre-manifest lit-korean upgrade removes the exact shipped copy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-humanizer-pre-manifest-pristine-'));
  try {
    const oldDirectory = previousPreManifestHumanizer(root);
    const result = await install(root, ['install']);
    assert.equal(result.code, 0, result.output);
    assert.equal(existsSync(oldDirectory), false);
    assert.ok(existsSync(join(root, '.grok', 'skills', 'lit-humanizer', 'SKILL.md')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('pre-manifest lit-korean upgrade preserves a modified copy and warns once', async () => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-humanizer-pre-manifest-modified-'));
  try {
    const oldDirectory = previousPreManifestHumanizer(root, { modified: true });
    const before = snapshot(oldDirectory);
    const result = await install(root, ['install']);
    assert.equal(result.code, 0, result.output);
    assert.ok(existsSync(join(root, '.grok', 'skills', 'lit-humanizer', 'SKILL.md')));
    assert.deepEqual(snapshot(oldDirectory), before, 'the modified legacy copy must remain byte-identical');
    assert.equal((result.output.match(/Warning:[^\n]*lit-korean/gi) ?? []).length, 1, result.output);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const state of ['modified', 'foreign']) {
  test(`lit-korean upgrade keeps a ${state} user copy, warns once, and installs lit-humanizer`, async () => {
    const root = mkdtempSync(join(tmpdir(), `litgrok-humanizer-${state}-`));
    try {
      const oldDirectory = previousHumanizer(root, { modified: state === 'modified', extra: state === 'foreign' });
      const before = snapshot(oldDirectory);
      const result = await install(root, ['install']);
      assert.equal(result.code, 0, result.output);
      assert.ok(existsSync(join(root, '.grok', 'skills', 'lit-humanizer', 'SKILL.md')));
      assert.deepEqual(snapshot(oldDirectory), before, 'the complete old user copy must remain byte-identical');
      assert.match(result.output, /Warning: keeping modified legacy skill at [^\n]*lit-korean/i);
      assert.equal((result.output.match(/Warning:[^\n]*lit-korean/gi) ?? []).length, 1);
      const repeat = await install(root, ['install']);
      assert.equal(repeat.code, 0, repeat.output);
      assert.deepEqual(snapshot(oldDirectory), before, 'a later update must continue preserving the unowned copy');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('lit-korean upgrade removes a pristine package-owned copy', async () => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-humanizer-clean-'));
  try {
    const oldDirectory = previousHumanizer(root);
    const result = await install(root, ['install']);
    assert.equal(result.code, 0, result.output);
    assert.equal(existsSync(oldDirectory), false);
    assert.ok(existsSync(join(root, '.grok', 'skills', 'lit-humanizer', 'SKILL.md')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
