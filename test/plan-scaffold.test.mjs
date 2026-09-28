import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const SCRIPT = join(PRODUCT_ROOT, '.grok', 'skills', 'lit-plan', 'scripts', 'scaffold-plan.mjs');

function temporaryProject() {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-plan-scaffold-'));
  test.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(args, cwd) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

const FILLED_PLAN = `# demo — Work Plan

## TL;DR (For humans)
Ship one checker.

## Scope
### Must have
### Must NOT have (guardrails, anti-slop, scope boundaries)

## Verification strategy
- Test decision: TDD

## Execution strategy
### Parallel execution waves
### Dependency matrix

## Todos
- [ ] 1. Add the checker
  What to do / Must NOT do: add scripts/check.mjs
  References: scripts/check.mjs
  Acceptance criteria: node --test test/check.test.mjs
  QA scenarios: run the packaged script, Evidence .grok/litgrok/evidence/demo/task-1.txt
  Commit: Y | feat(check): add checker

## Final verification wave
- [ ] F1. Plan compliance audit
- [ ] F2. Code quality review
- [ ] F3. Real Manual-QA
- [ ] F4. Scope fidelity

## Commit strategy

## Success criteria
`;

test('scaffold writes plans/<slug>.md with a column-zero checkbox skeleton', () => {
  const root = temporaryProject();
  const result = run(['demo-plan'], root);

  assert.equal(result.status, 0, result.stderr);
  const planPath = join(root, 'plans', 'demo-plan.md');
  assert.ok(existsSync(planPath), 'plan file must be created');
  const content = readFileSync(planPath, 'utf8');
  assert.match(content, /^# demo-plan — Work Plan$/m);
  assert.match(content, /^- \[ \] 1\. /m, 'skeleton must carry a column-zero implementation row');
  assert.match(content, /^- \[ \] F1\. /m, 'skeleton must carry the final-verifier rows');
  assert.match(content, /\.grok\/litgrok\/evidence\/demo-plan\//, 'evidence path must be package-owned');
  assert.doesNotMatch(content, /Claude Code|Codex|OpenCode/i);
  assert.match(result.stdout, /plans\/demo-plan\.md/);
});

test('scaffold rerun leaves an existing plan untouched and reports it', () => {
  const root = temporaryProject();
  assert.equal(run(['demo-plan'], root).status, 0);
  const planPath = join(root, 'plans', 'demo-plan.md');
  writeFileSync(planPath, `${readFileSync(planPath, 'utf8')}\n- [ ] 2. Appended by hand\n`);
  const before = readFileSync(planPath, 'utf8');

  const result = run(['demo-plan'], root);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /already present/i);
  assert.equal(readFileSync(planPath, 'utf8'), before);
});

test('scaffold rejects an invalid slug and a symlinked plans directory without writing', () => {
  const root = temporaryProject();
  for (const slug of ['Bad Slug', '../escape', 'UPPER', '']) {
    const result = run([slug], root);
    assert.equal(result.status, 1, `slug must be refused: ${JSON.stringify(slug)}`);
    assert.match(result.stderr, /slug/i);
  }
  assert.equal(existsSync(join(root, 'plans')), false, 'a refused slug must not create plans/');

  const outside = mkdtempSync(join(tmpdir(), 'litgrok-plan-outside-'));
  test.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(root, 'plans'));
  const result = run(['demo-plan'], root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /symlink/i);
  assert.equal(existsSync(join(outside, 'demo-plan.md')), false, 'symlinked plans/ must not be followed');
});

test('--check accepts a filled plan and rejects a plan without implementation rows', () => {
  const root = temporaryProject();
  mkdirSync(join(root, 'plans'));
  writeFileSync(join(root, 'plans', 'filled.md'), FILLED_PLAN);
  writeFileSync(join(root, 'plans', 'empty.md'), FILLED_PLAN.replace(/^- \[ \] 1\. [\s\S]*?(?=\n## Final)/m, '(no rows yet)'));
  writeFileSync(join(root, 'plans', 'indented.md'), FILLED_PLAN.replace(/^- \[ \] 1\. /m, '  - [ ] 1. '));

  const accepted = run(['--check', 'plans/filled.md'], root);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /^PASS /m);

  const rejected = run(['--check', 'plans/empty.md'], root);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /no implementation rows/i);

  const indented = run(['--check', 'plans/indented.md'], root);
  assert.equal(indented.status, 1);
  assert.match(indented.stderr, /indented/i);

  const fresh = run(['fresh-plan'], root);
  assert.equal(fresh.status, 0, fresh.stderr);
  const unfilled = run(['--check', 'plans/fresh-plan.md'], root);
  assert.equal(unfilled.status, 1, 'an unfilled skeleton is not a decision-complete plan');
  assert.match(unfilled.stderr, /<fill/);
});
