import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Content-production skills moved to the wjgoarxiv-skills repository, one plugin per family. LitGrok keeps a
// same-name SKILL.md for each, so `/<id>`, the project rule's bare `lit` routes, agent preloads and the status row
// still answer. Each note says three things: the skill moved, where it lives now, and Grok Build's one-line install.
const MOVED = {
  'frontend-ui-ux': 'design',
  'visual-qa': 'design',
  'lit-typographic-motion': 'video-covers',
  'readme-studio': 'video-covers',
  'lit-diagram-drawer': 'figures',
  'lit-schematic': 'figures',
  'lit-scientific-visualization': 'figures',
  'lit-docx': 'documents',
};

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = join(PRODUCT_ROOT, '.grok', 'skills');
const PLACEHOLDER = '<path to your wjgoarxiv-skills clone>';
const note = (id) => readFileSync(join(SKILLS, id, 'SKILL.md'), 'utf8');
const tracked = (prefix) => spawnSync('git', ['-C', PRODUCT_ROOT, 'ls-files', '--cached', '--others', '--exclude-standard', prefix], { encoding: 'utf8' })
  .stdout.split('\n').filter(Boolean);
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]));

test('each moved skill is a same-name note, SKILL.md alone', () => {
  for (const id of Object.keys(MOVED)) {
    assert.deepEqual(tracked(`.grok/skills/${id}`), [`.grok/skills/${id}/SKILL.md`], `${id} keeps no body file`);
    const bytes = statSync(join(SKILLS, id, 'SKILL.md')).size;
    assert.ok(bytes < 6000, `${id} note is ${bytes} bytes`);
  }
});

test('each note says it moved, where it lives now, and the one-line Grok Build install', () => {
  for (const [id, family] of Object.entries(MOVED)) {
    const text = note(id);
    assert.match(text, new RegExp(`^---\\nname: ${id}\\n`, 'u'), `${id} keeps its name`);
    assert.match(text, /\ndescription: "Moved: /u, `${id} description starts with Moved:`);
    assert.match(text, /\nuser-invocable: true\n/u);
    assert.ok(text.includes('wjgoarxiv-skills'), `${id} names the repository`);
    assert.ok(text.includes(`plugins/${family}/skills/${id}/`), `${id} names its folder in the repository`);
    assert.ok(text.includes(`grok plugin install "${PLACEHOLDER}#plugins/${family}" --trust`), `${id} carries the local install line`);
    assert.ok(text.includes(`grok plugin install wjgoarxiv/wjgoarxiv-skills#plugins/${family} --trust`), `${id} carries the published form`);
    assert.match(text, /not published yet/u, `${id} says the repository is not published yet`);
    assert.ok(text.includes(`\`${family}:${id}\``), `${id} names the qualified plugin skill`);
    assert.ok(text.includes(`grok plugin uninstall ${family}`), `${id} says how to remove the plugin`);
  }
});

test('no note carries a leftover procedure from the body it replaced', () => {
  for (const id of Object.keys(MOVED)) {
    const text = note(id);
    for (const leftover of [/references\//u, /Load `?references/u, /node \.grok\/skills\//u, /FRONTEND_SKILL_ROOT/u, /SKILL_ROOT/u, /\.\.\/[a-z-]+\/SKILL\.md/u]) {
      assert.doesNotMatch(text, leftover, `${id}: ${leftover}`);
    }
  }
});

test('the pack ships each moved skill as its note alone', () => {
  const lock = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'skills.lock.json'), 'utf8'));
  for (const id of Object.keys(MOVED)) {
    assert.deepEqual(lock.pack.filter((path) => path.startsWith(`.grok/skills/${id}/`)), [`.grok/skills/${id}/SKILL.md`], id);
    assert.equal(lock.skills[id].files, 1, id);
  }
});

test('every route still reaches the note: plugin manifest, rule, agents and the lock', () => {
  const manifest = JSON.parse(readFileSync(join(PRODUCT_ROOT, '.grok-plugin', 'plugin.json'), 'utf8'));
  const rule = readFileSync(join(PRODUCT_ROOT, '.grok', 'rules', '00-litgrok.md'), 'utf8');
  const lock = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'skills.lock.json'), 'utf8'));
  for (const id of Object.keys(MOVED)) {
    assert.ok(manifest.skills.includes(`./.grok/skills/${id}`), `${id} stays in the plugin manifest`);
    assert.ok(Object.hasOwn(lock.budgets, id), `${id} keeps its lock budget`);
  }
  if (MOVED['frontend-ui-ux']) assert.match(rule, /`\/frontend-ui-ux`/u, 'the rule still routes interfaces to frontend-ui-ux');
  if (MOVED['visual-qa']) {
    for (const agent of ['litgrok-verifier.md', 'litgrok-quality-reviewer.md']) {
      assert.match(readFileSync(join(PRODUCT_ROOT, '.grok', 'agents', agent), 'utf8'), /^\s*- visual-qa$/mu, `${agent} still preloads visual-qa`);
    }
    assert.match(note('visual-qa'), /no visual verdict/u, 'a reviewer without visual-qa records the gap');
  }
  if (MOVED['frontend-ui-ux']) assert.match(note('frontend-ui-ux'), /Never report the missing probe as passed/u);
});

test('no core surface still runs a moved skill\'s body', () => {
  const moved = Object.keys(MOVED);
  const surfaces = [
    '.grok/rules/00-litgrok.md', 'AGENTS.md', 'CONTRIBUTING.md', '.github/workflows/ci.yml', '.github/workflows/publish.yml',
    ...walk(join(PRODUCT_ROOT, '.grok', 'skills')).map((file) => relative(PRODUCT_ROOT, file)).filter((file) => !moved.some((id) => file.startsWith(`.grok/skills/${id}/`))),
    ...walk(join(PRODUCT_ROOT, '.grok', 'agents')).map((file) => relative(PRODUCT_ROOT, file)),
  ];
  for (const file of surfaces) {
    const bytes = readFileSync(join(PRODUCT_ROOT, file));
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    for (const id of moved) {
      assert.doesNotMatch(text, new RegExp(`\\.grok/skills/${id}/(?:scripts|references|kit|assets|templates|engine)/`, 'u'), `${file} still reaches into ${id}`);
      assert.doesNotMatch(text, new RegExp(`\\.\\./${id}/(?!SKILL\\.md)`, 'u'), `${file} still reaches into ${id}`);
    }
  }
});

test('no shipped file or doc names a private machine path', () => {
  const privatePath = [/~\/Desktop/u, /27_LITFAMILY/u, /\.worktrees\/(?!<)/u, /\/Users\/[a-z]/u];
  const offenders = [];
  for (const file of [...walk(join(PRODUCT_ROOT, '.grok')), ...walk(join(PRODUCT_ROOT, 'docs'))]) {
    const bytes = readFileSync(file);
    if (bytes.includes(0)) continue;
    const text = bytes.toString('utf8');
    for (const pattern of privatePath) if (pattern.test(text)) offenders.push(`${relative(PRODUCT_ROOT, file)} ${pattern}`);
  }
  assert.deepEqual(offenders, []);
});
