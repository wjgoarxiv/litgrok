// skills.lock.json pins every packaged skill by hash, size and file count, and
// pins the npm pack list. `npm run sync:lock` (tools/sync-skills-lock.mjs)
// rewrites the generated half; `budgets` are hand-owned floors and ceilings
// that a sync never adds, removes or lowers on its own.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  LOCK_FILE,
  PRODUCT_ROOT,
  budgetViolations,
  composeLock,
  measureSkills,
  packedPaths,
  readLock,
  seedBudget,
  serializeLock,
  untrackedPacked,
} from '../tools/sync-skills-lock.mjs';

const TOOL = join(PRODUCT_ROOT, 'tools', 'sync-skills-lock.mjs');

function scratchRoot(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(root, '.grok', 'skills'), { recursive: true });
  return root;
}

function writeSkill(root, id, skillBytes, extra = {}) {
  const directory = join(root, '.grok', 'skills', id);
  mkdirSync(join(directory, 'references'), { recursive: true });
  writeFileSync(join(directory, 'SKILL.md'), 'x'.repeat(skillBytes));
  for (const [name, content] of Object.entries(extra)) writeFileSync(join(directory, name), content);
}

function sync(root, ...flags) {
  return spawnSync(process.execPath, [TOOL, '--root', root, '--no-pack', ...flags], { encoding: 'utf8' });
}

test('skills.lock.json is current (run npm run sync:lock after a skill or pack change)', () => {
  const lock = readLock();
  const skills = measureSkills();
  const pack = packedPaths();
  const stale = [...new Set([...Object.keys(lock.skills), ...Object.keys(skills)])]
    .filter((id) => JSON.stringify(lock.skills[id]) !== JSON.stringify(skills[id]))
    .sort();
  const added = pack.filter((path) => !lock.pack.includes(path));
  const removed = lock.pack.filter((path) => !pack.includes(path));
  assert.deepEqual({ stale, added, removed }, { stale: [], added: [], removed: [] }, 'skills.lock.json is stale: run npm run sync:lock');
  assert.equal(readFileSync(join(PRODUCT_ROOT, LOCK_FILE), 'utf8'), serializeLock(composeLock({ skills, pack, previous: lock })));
});

test('every packaged skill sits inside its hand-owned budget and the pack ships only tracked files', () => {
  const lock = readLock();
  const skills = measureSkills();
  assert.deepEqual(Object.keys(lock.budgets), Object.keys(skills), 'one budget per packaged skill');
  assert.deepEqual(budgetViolations(skills, lock.budgets), []);
  assert.deepEqual(untrackedPacked(PRODUCT_ROOT, lock.pack), []);
});

test('budget checks catch a placeholder SKILL.md, a trimmed skill and a bloated one', () => {
  const budgets = { a: { minSkillBytes: 15000, maxSkillBytes: 30000, minFiles: 4, maxFiles: 10, maxBytes: 90000 } };
  assert.deepEqual(budgetViolations({ a: { skillMd: { bytes: 16000 }, files: 5, bytes: 40000 } }, budgets), []);
  assert.deepEqual(budgetViolations({ a: { skillMd: { bytes: 300 }, files: 5, bytes: 24300 } }, budgets), ['a: SKILL.md 300 B is below its floor 15000 B']);
  assert.deepEqual(budgetViolations({ a: { skillMd: { bytes: 16000 }, files: 2, bytes: 30000 } }, budgets), ['a: 2 files is below its floor 4']);
  assert.equal(budgetViolations({ a: { skillMd: { bytes: 31000 }, files: 11, bytes: 99000 } }, budgets).length, 3);
});

test('a sync keeps budgets as written and seeds or drops one only when named', () => {
  const root = scratchRoot('litgrok-lock-compose-');
  try {
    writeSkill(root, 'kept', 14000, { 'references/r.md': 'ref' });
    writeSkill(root, 'fresh', 20123, { 'references/r.md': 'ref' });
    const previous = {
      budgets: {
        kept: { minSkillBytes: 13000, maxSkillBytes: 99000, minFiles: 2, maxFiles: 9, maxBytes: 99000 },
        gone: { minSkillBytes: 1, maxSkillBytes: 2, minFiles: 1, maxFiles: 2, maxBytes: 2 },
      },
    };
    const skills = measureSkills(root);
    const plain = composeLock({ skills, pack: [], previous });
    assert.deepEqual(plain.budgets.gone, previous.budgets.gone, 'a gone skill keeps its budget without --drop');
    assert.equal(plain.budgets.fresh, undefined, 'a new skill gets no budget without --accept-new');
    assert.deepEqual(budgetViolations(plain.skills, plain.budgets), [
      'fresh: new skill without a budget (npm run sync:lock -- --accept-new fresh)',
      'gone: budget for a skill that is gone (npm run sync:lock -- --drop gone)',
    ]);

    const lock = composeLock({ skills, pack: ['b', 'a'], previous, acceptNew: ['fresh'], drop: ['gone'] });
    assert.deepEqual(lock.budgets.kept, previous.budgets.kept, 'an existing budget is never rewritten');
    assert.equal(lock.budgets.gone, undefined);
    assert.deepEqual(lock.budgets.fresh, seedBudget(skills.fresh));
    assert.deepEqual(lock.budgets.fresh, { minSkillBytes: 20100, maxSkillBytes: 31000, minFiles: 2, maxFiles: 3, maxBytes: 31000 });
    assert.deepEqual(budgetViolations(lock.skills, lock.budgets), []);
    assert.deepEqual(lock.pack, ['a', 'b']);
    assert.match(lock.skills.kept.sha256, /^[0-9a-f]{64}$/u);
    assert.deepEqual(composeLock({ skills: measureSkills(root), pack: ['a', 'b'], previous: lock }), lock, 'deterministic');

    assert.throws(() => composeLock({ skills, pack: [], previous: lock, acceptNew: ['kept'] }), /--accept-new kept names no new skill/u);
    assert.throws(() => composeLock({ skills, pack: [], previous: lock, drop: ['kept'] }), /--drop kept names no gone skill/u);
    writeFileSync(join(root, '.grok', 'skills', 'kept', 'references', 'r.md'), 'ref2');
    assert.notEqual(measureSkills(root).kept.sha256, lock.skills.kept.sha256, 'a resource edit changes the skill digest');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('removing a skill, syncing and re-adding it smaller cannot lower its floor', () => {
  const root = scratchRoot('litgrok-lock-readd-');
  const lockFile = join(root, LOCK_FILE);
  const budget = { minSkillBytes: 35900, maxSkillBytes: 54000, minFiles: 1, maxFiles: 2, maxBytes: 54000 };
  try {
    writeSkill(root, 'lit-plan', 36000);
    writeFileSync(lockFile, JSON.stringify({ budgets: { 'lit-plan': budget }, skills: {}, pack: [] }));
    let result = sync(root);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const current = readFileSync(lockFile, 'utf8');

    rmSync(join(root, '.grok', 'skills', 'lit-plan'), { recursive: true });
    result = sync(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /lit-plan: budget for a skill that is gone/u);
    assert.equal(readFileSync(lockFile, 'utf8'), current, 'a gone budget is not dropped silently');

    writeSkill(root, 'lit-plan', 13100);
    result = sync(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /lit-plan: SKILL\.md 13100 B is below its floor 35900 B/u);
    assert.equal(readFileSync(lockFile, 'utf8'), current, 'the smaller skill must meet the old floor');

    rmSync(join(root, '.grok', 'skills', 'lit-plan'), { recursive: true });
    result = sync(root, '--drop', 'lit-plan');
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /dropped budget: lit-plan/u);
    const dropped = readFileSync(lockFile, 'utf8');

    writeSkill(root, 'lit-plan', 13100);
    result = sync(root);
    assert.equal(result.status, 1, result.stdout);
    assert.match(result.stdout, /lit-plan: new skill without a budget/u);
    assert.equal(readFileSync(lockFile, 'utf8'), dropped, 'a new skill is not seeded silently');

    result = sync(root, '--accept-new', 'lit-plan');
    assert.equal(result.status, 0, result.stdout);
    assert.match(result.stdout, /seeded budget: lit-plan SKILL\.md 13100-20000 B/u);
    assert.equal(readLock(lockFile).budgets['lit-plan'].minSkillBytes, 13100);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('only Git-tracked skill files are measured: a stray untracked file leaves the lock unchanged', () => {
  const root = scratchRoot('litgrok-lock-tracked-');
  const stray = '.grok/skills/kept/references/stray-local-note.md';
  try {
    writeSkill(root, 'kept', 14000, { 'references/r.md': 'ref' });
    const init = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const add = spawnSync('git', ['add', '--', '.grok'], { cwd: root, encoding: 'utf8' });
    assert.equal(add.status, 0, add.stderr);
    const before = measureSkills(root);
    writeFileSync(join(root, '.DS_Store'), 'finder metadata');
    writeFileSync(join(root, stray), 'a local note nobody tracks');
    assert.deepEqual(measureSkills(root), before);
    assert.deepEqual(untrackedPacked(root, ['.grok/skills/kept/SKILL.md', stray]), [stray], 'a stray file that would ship is reported');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('sync:lock writes nothing while a skill breaks its budget, and the npm script is wired', () => {
  const pkg = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync:lock'], 'node tools/sync-skills-lock.mjs');
  assert.equal(pkg.files.includes(LOCK_FILE), false, 'the lock is a repository check, not a packaged file');
  const root = scratchRoot('litgrok-lock-cli-');
  try {
    writeSkill(root, 'tiny', 11);
    const lockFile = join(root, LOCK_FILE);
    const before = JSON.stringify({ budgets: { tiny: { minSkillBytes: 13000, maxSkillBytes: 20000, minFiles: 1, maxFiles: 2, maxBytes: 20000 } }, skills: {}, pack: [] });
    writeFileSync(lockFile, before);
    const result = sync(root);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /SKILLS_LOCK_REFUSED: 1 problem\(s\)/u);
    assert.match(result.stdout, /tiny: SKILL\.md 11 B is below its floor 13000 B/u);
    assert.equal(readFileSync(lockFile, 'utf8'), before, 'nothing written');
    assert.equal(sync(root, '--drop').status, 1, 'a flag without an id is a usage error');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
