#!/usr/bin/env node

// scaffold-plan.mjs — write the plans/<slug>.md checkbox skeleton that start-work reads.
//
// Usage:
//   node .grok/skills/lit-plan/scripts/scaffold-plan.mjs <slug>
//   node .grok/skills/lit-plan/scripts/scaffold-plan.mjs --check <plan.md>
//
// Node built-ins only. Writes exactly one path, plans/<slug>.md below the current
// working directory, and refuses a symlinked plans/ directory or target. A rerun over an
// existing file is a no-op success so a resumed session cannot clobber appended tasks.
// The Stop hook plan gate names this script when a planning turn ends without the file.

import { constants, existsSync, lstatSync, mkdirSync, openSync, closeSync, readFileSync, realpathSync, writeSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const PLAN_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const IMPLEMENTATION_ROW = /^- \[[ xX]\] (\d+)\. .+$/u;
export const FINAL_VERIFIER_ROW = /^- \[[ xX]\] F(\d+)\. .+$/u;
const INDENTED_ROW = /^[ \t]+- \[[ xX]\] (?:\d+|F\d+)\. /u;
const MAX_PLAN_BYTES = 256 * 1024;

export const PLAN_SECTION_HEADERS = [
  '## TL;DR (For humans)',
  '## Scope',
  '## Verification strategy',
  '## Execution strategy',
  '## Todos',
  '## Final verification wave',
  '## Commit strategy',
  '## Success criteria',
];

const FINAL_VERIFICATION_ITEMS = [
  'F1. Plan compliance audit',
  'F2. Code quality review',
  'F3. Real Manual-QA',
  'F4. Scope fidelity',
];

function fail(message) {
  process.stderr.write(`${message}\n`);
  return 1;
}

export function isValidPlanSlug(slug) {
  return typeof slug === 'string' && slug.length > 0 && slug.length <= 80 && PLAN_SLUG_PATTERN.test(slug);
}

export function buildPlanSkeleton(slug) {
  return `# ${slug} — Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain language for a non-engineer: NO file paths, NO todo numbers, NO wave or subagent names. -->

**What you'll get:** <fill last — deliverables in human terms, 1-2 sentences>

**Why this approach:** <fill last — the one or two load-bearing decisions and why>

**What it will NOT do:** <fill last — 1-3 plain lines mirroring Must NOT have>

**Effort:** <Quick | Short | Medium | Large | XL>
**Risk:** <Low | Medium | High> — <one-line driver>
**Decisions to sanity-check:** <fill last — the few choices worth a human glance>

Your next move: <fill — e.g. approve, or ask for a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line — effort, risk, deliverables>

## Scope
### Must have
### Must NOT have (guardrails, anti-slop, scope boundaries)

## Verification strategy
> Zero human intervention — every verification step is agent-executed.
- Test decision: <TDD | tests-after | none> + framework
- Manual-QA channel per criterion: <Grok Build session | shell | browser>
- Evidence: .grok/litgrok/evidence/${slug}/task-<N>.<ext>; record criteria and blockers in the litgoal ledger

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final wave) means you under-split.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |

## Todos
> Implementation + Test = ONE todo. Never separate them.
> Rows start at column zero as \`- [ ] N. <title>\`; start-work cannot see an indented row.
<!-- APPEND TASK BATCHES BELOW THIS LINE — never rewrite the headers above. -->
- [ ] 1. <title>
  What to do / Must NOT do: <...>
  Parallelization: Wave <N> | Blocked by: <...> | Blocks: <...>
  References (the executor has NO interview context — be exhaustive): <src/path:lines>
  Acceptance criteria (agent-executable): <exact command or assertion>
  QA scenarios (name the exact tool + invocation): happy + failure, Evidence .grok/litgrok/evidence/${slug}/task-1.<ext>
  Commit: <Y/N> | <type>(<scope>): <summary>

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface the results and wait for the user's explicit okay before declaring the work complete.
${FINAL_VERIFICATION_ITEMS.map((item) => `- [ ] ${item}`).join('\n')}

## Commit strategy

## Success criteria
`;
}

export function planLinesOutsideFences(text) {
  const visible = [];
  let fence = null;
  const lines = text.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (!fence && fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      continue;
    }
    if (fence && fenceMatch && fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length && fenceMatch[2].trim() === '') {
      fence = null;
      continue;
    }
    if (!fence) visible.push({ line, index });
  }
  return visible;
}

export function countImplementationRows(text) {
  return planLinesOutsideFences(text).filter(({ line }) => IMPLEMENTATION_ROW.test(line)).length;
}

export function checkPlanStructure(text) {
  const problems = [];
  const visibleLines = planLinesOutsideFences(text);

  let searchFrom = -1;
  for (const header of PLAN_SECTION_HEADERS) {
    const heading = visibleLines.find(({ line }) => line.trimEnd() === header);
    if (!heading) problems.push(`missing section: ${header}`);
    else if (heading.index < searchFrom) problems.push(`section out of order: ${header}`);
    else searchFrom = heading.index;
  }

  const implementationRows = visibleLines.filter(({ line }) => IMPLEMENTATION_ROW.test(line));
  const finalRows = visibleLines.filter(({ line }) => FINAL_VERIFIER_ROW.test(line));
  if (implementationRows.length === 0) problems.push('no implementation rows: expected at least one column-zero `- [ ] N. <title>`');
  if (finalRows.length === 0) problems.push('no final-verifier rows: expected column-zero `- [ ] F<number>. <title>`');

  for (const { line } of visibleLines) {
    if (INDENTED_ROW.test(line)) problems.push(`indented task row is invisible to start-work: ${line.trim()}`);
  }

  const numbers = implementationRows.map(({ line }) => Number(IMPLEMENTATION_ROW.exec(line)[1]));
  const duplicates = numbers.filter((value, index) => numbers.indexOf(value) !== index);
  if (duplicates.length > 0) problems.push(`duplicate todo numbers: ${[...new Set(duplicates)].join(', ')}`);

  const rowIndexes = visibleLines.filter(({ line }) => IMPLEMENTATION_ROW.test(line) || FINAL_VERIFIER_ROW.test(line));
  for (let position = 0; position < rowIndexes.length; position += 1) {
    const { line, index } = rowIndexes[position];
    if (!IMPLEMENTATION_ROW.test(line)) continue;
    const end = rowIndexes[position + 1]?.index ?? Number.MAX_SAFE_INTEGER;
    const block = visibleLines
      .filter(({ index: lineIndex }) => lineIndex >= index && lineIndex < end)
      .map(({ line: visibleLine }) => visibleLine)
      .join('\n');
    for (const [label, pattern] of [
      ['What to do', /What to do/u],
      ['References', /References/u],
      ['Acceptance criteria', /Acceptance criteria/u],
      ['QA scenarios', /QA scenarios/u],
      ['Commit', /Commit:/u],
    ]) {
      if (!pattern.test(block)) problems.push(`${line.trim()} — missing "${label}"`);
    }
  }

  if (/<fill\b/u.test(text)) problems.push('unfilled <fill ...> placeholders remain — the plan is not decision-complete');

  return { ok: problems.length === 0, problems };
}

function refuseSymlink(path, label) {
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`refused: ${label} is a symlink: ${path}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function scaffold(slug, cwd) {
  if (!isValidPlanSlug(slug)) return fail(`refused: slug must match ${PLAN_SLUG_PATTERN} (got ${JSON.stringify(slug ?? '')})`);
  const workspace = realpathSync(cwd);
  const plansDirectory = join(workspace, 'plans');
  const target = join(plansDirectory, `${slug}.md`);
  refuseSymlink(plansDirectory, 'plans/');
  refuseSymlink(target, `plans/${slug}.md`);

  if (existsSync(target)) {
    process.stdout.write(`plans/${slug}.md already present — left untouched. Append task rows into "## Todos"; fill "## TL;DR (For humans)" last, then run --check.\n`);
    return 0;
  }

  mkdirSync(plansDirectory, { recursive: true });
  const containment = relative(workspace, realpathSync(plansDirectory));
  if (containment.startsWith('..') || isAbsolute(containment) || containment.split(sep)[0] !== 'plans') {
    return fail(`refused: plans/ resolves outside the workspace: ${plansDirectory}`);
  }

  const noFollow = constants.O_NOFOLLOW ?? 0;
  const descriptor = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o644);
  try {
    writeSync(descriptor, buildPlanSkeleton(slug));
  } finally {
    closeSync(descriptor);
  }
  process.stdout.write(`wrote plans/${slug}.md\nnext: append task batches into the "## Todos" region (column-zero \`- [ ] N. <title>\` rows), fill "## TL;DR (For humans)" LAST, then run --check plans/${slug}.md\n`);
  return 0;
}

function check(planPath, cwd) {
  const path = resolve(cwd, planPath);
  let status;
  try {
    status = lstatSync(path);
  } catch {
    return fail(`FAIL PLAN_NOT_FOUND: ${path}`);
  }
  if (status.isSymbolicLink() || !status.isFile()) return fail(`FAIL PLAN_UNSAFE: ${path} must be a regular file`);
  if (status.size > MAX_PLAN_BYTES) return fail(`FAIL PLAN_TOO_LARGE: ${path}`);
  const result = checkPlanStructure(readFileSync(path, 'utf8'));
  if (!result.ok) {
    for (const problem of result.problems) process.stderr.write(`FAIL ${problem}\n`);
    return 1;
  }
  process.stdout.write(`PASS ${planPath}: structure complete\n`);
  return 0;
}

export function runScaffoldPlanCli(argv = process.argv.slice(2), cwd = process.cwd()) {
  if (argv[0] === '--check') {
    if (argv.length !== 2) return fail('usage: scaffold-plan.mjs --check <plan.md>');
    return check(argv[1], cwd);
  }
  if (argv.length !== 1) return fail('usage: scaffold-plan.mjs <slug> | --check <plan.md>');
  return scaffold(argv[0], cwd);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(new URL(import.meta.url).pathname)) {
  try {
    process.exitCode = runScaffoldPlanCli();
  } catch (error) {
    process.exitCode = fail(error instanceof Error ? error.message : String(error));
  }
}
