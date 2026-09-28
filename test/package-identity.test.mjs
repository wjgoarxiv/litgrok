import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test('scoped npm metadata keeps the native aliases and plugin identity', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  const plugin = JSON.parse(readFileSync(join(root, 'plugin.json')));
  assert.equal(pkg.name, '@litfamily/litgrok');
  assert.deepEqual(pkg.publishConfig, { access: 'public' });
  assert.deepEqual(pkg.bin, { 'litgrok-ai': 'bin/litgrok.mjs', litgrok: 'bin/litgrok.mjs' });
  assert.equal(plugin.name, 'litgrok');
  assert.equal(plugin.version, pkg.version);
});

test('npm rename preserves legacy ownership while refusing forged owners and modified files', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'litgrok-identity-'));
  try {
    const source = join(temporary, 'source');
    const project = join(temporary, 'project');
    for (const path of ['bin', '.grok/hooks', '.grok/skills/example']) mkdirSync(join(source, path), { recursive: true });
    mkdirSync(project);
    copyFileSync(join(root, 'bin/litgrok.mjs'), join(source, 'bin/litgrok.mjs'));
    copyFileSync(join(root, 'bin/status-line-config.mjs'), join(source, 'bin/status-line-config.mjs'));
    copyFileSync(join(root, '.grok/hooks/lit-mark.mjs'), join(source, '.grok/hooks/lit-mark.mjs'));
    copyFileSync(join(root, 'package.json'), join(source, 'package.json'));
    const sourceSkill = join(source, '.grok/skills/example/SKILL.md');
    writeFileSync(sourceSkill, 'old owned payload\n');
    const { run } = await import(pathToFileURL(join(source, 'bin/litgrok.mjs')));
    const io = { stdin: { isTTY: true }, stdout: { isTTY: true, write() {} }, stderr: { write() {} }, cwd: project, env: { HOME: temporary, TERM: 'dumb', LANG: 'en_US.UTF-8' } };
    assert.equal(await run(['install', '--yes'], io), 0);
    const receipt = join(project, '.grok/.litgrok-install-manifest.json');
    const installed = join(project, '.grok/skills/example/SKILL.md');
    const settings = join(project, '.grok/settings.json');
    writeFileSync(settings, '{"user":"preserve"}\n');
    const oldReceipt = JSON.parse(readFileSync(receipt));
    assert.equal(oldReceipt.package, 'litgrok-ai');
    writeFileSync(sourceSkill, 'new owned payload\n');
    assert.equal(await run(['install', '--yes'], io), 0);
    assert.equal(readFileSync(installed, 'utf8'), 'new owned payload\n');
    assert.equal(await run(['install', '--yes'], io), 0);
    const validReceipt = readFileSync(receipt, 'utf8');
    for (const owner of ['@litfamily/litgrok', '@litfamily/grok', 'foreign', '../litgrok-ai', '']) {
      writeFileSync(receipt, JSON.stringify({ ...JSON.parse(validReceipt), package: owner }));
      assert.notEqual(await run(['uninstall', '--yes'], io), 0, `must refuse forged owner ${owner}`);
      assert.equal(readFileSync(installed, 'utf8'), 'new owned payload\n');
    }
    writeFileSync(receipt, validReceipt);
    writeFileSync(installed, 'user modification\n');
    for (const command of ['install', 'uninstall']) {
      assert.notEqual(await run([command, '--yes'], io), 0);
      assert.equal(readFileSync(installed, 'utf8'), 'user modification\n');
      assert.equal(readFileSync(receipt, 'utf8'), validReceipt);
    }
    writeFileSync(installed, 'new owned payload\n');
    assert.equal(await run(['uninstall', '--yes'], io), 0);
    assert.equal(readFileSync(settings, 'utf8'), '{"user":"preserve"}\n');
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
