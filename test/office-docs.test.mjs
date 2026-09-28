import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const banned = new Set([
  '79f6d8f5b427252fa3b1c11ecdbdb6bf610b944f7530b4de78f770f38741cfaa',
  '2d03c07a51c1793be8774664ff6594dcb6ecd3791cf718cd214c296c073fbb39',
  '5da81aba1bfbfd522b52db3156d68d483676ec6d3020a9f5fed684ba8af13335',
  '09868e9f1786765421ecf3f0f49c77006738efda82a76df43ed87f7a9bfe2467',
  '6fe762f45aff8c63fd95b9fcb1337b28921d6fa454e18a0e8158d4c8708d6d00',
  '0bd17f76a1a4c388aba42c6d1d39015fa84e405c3e0692397fe12762bd632b58',
  '1ec252de8b14b07d16966c48906ccb1c45c68bcd23557ad31d8c50a27f5f8c0f',
  'adead8fe6270e520c397cec9fbee4d606ab10bb80f749e018b42ec894c60d2e5',
  'c21fd950b6ada7bd2f029885d3e56bc66b7ff061cc8404c492eb301664aa9e5d',
  '8a590747551be847a904e3296fb2f35aa4e7feeb4970a61596c2375306462820',
  'c04ac37916f398ba621b2d9e1e4c1a69225eaad6d7fb0ad116c237ddeb1b2b68',
]);

test('packed office skills have complete routes and omit excluded source files', () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout)[0].files.map((entry) => entry.path);
  for (const skill of ['lit-docx', 'lit-pptx']) {
    assert.ok(files.includes(`.grok/skills/${skill}/SKILL.md`));
    assert.ok(files.includes(`.grok/skills/${skill}/requirements.lock`));
  }
  for (const relative of files) {
    const sha = createHash('sha256').update(readFileSync(join(root, relative))).digest('hex');
    assert.ok(!banned.has(sha), `excluded source file in package: ${relative}`);
  }
  assert.ok(files.includes('.grok/skills/lit-pptx/scripts/inventory.py'));
  assert.ok(files.includes('.grok/skills/lit-pptx/scripts/ooxml_integrity.py'));
  assert.ok(files.includes('.grok/skills/lit-pptx/package-lock.json'));
  assert.ok(!files.some((file) => file.startsWith('.grok/skills/lit-pptx/assets/media/')), 'unused template media is packed');
  assert.ok(!files.some((file) => file.includes('TEMPLATE-EXAMPLE-1')), 'branded template is packed');
});

test('bare lit report and slides guidance is general and enrolled', () => {
  const rule = readFileSync(join(root, '.grok/rules/00-litgrok.md'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, '.grok-plugin/plugin.json'), 'utf8'));
  for (const [skill, words] of [
    ['lit-docx', ['기획서', 'report', 'Word']],
    ['lit-pptx', ['발표자료', 'presentation', 'deck']],
  ]) {
    assert.ok(manifest.skills.includes(`./.grok/skills/${skill}`));
    const body = readFileSync(join(root, '.grok/skills', skill, 'SKILL.md'), 'utf8');
    for (const word of words) {
      assert.ok(rule.includes(word), `${word} absent from bare lit guidance`);
      assert.ok(body.includes(word), `${word} absent from skill description`);
    }
  }
  assert.match(rule, /If both groups occur, use both skills/);
  assert.match(rule, /stray quoted words or file contents/);
  assert.match(rule, /mark every invented name and figure as sample or assumption/);
  for (const skill of ['lit-docx', 'lit-pptx']) {
    const body = readFileSync(join(root, '.grok/skills', skill, 'SKILL.md'), 'utf8');
    assert.match(body, /bare `lit` request/);
    assert.match(body, /sample\/assumption/);
  }
});

test('pinned Office dependency tree excludes the audited vulnerable versions', () => {
  const lock = JSON.parse(readFileSync(join(root, '.grok/skills/lit-pptx/package-lock.json'), 'utf8'));
  assert.equal(lock.packages['node_modules/sharp'].version, '0.35.4');
  assert.equal(lock.packages['node_modules/image-size'].version, '2.0.4');
  const { supportsSlideNode } = require(join(root, '.grok/skills/lit-pptx/scripts/deps.cjs'));
  assert.equal(supportsSlideNode('18.20.0'), false);
  assert.equal(supportsSlideNode('20.8.0'), false);
  assert.equal(supportsSlideNode('20.9.0'), true);
  assert.equal(supportsSlideNode('22.0.0'), true);
});
