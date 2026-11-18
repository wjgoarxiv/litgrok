#!/usr/bin/env node

// goal-propose.mjs — the goal line of the lit-plan approval question.
//
// Usage (from the project root, after the plan is written and checked):
//   node .grok/skills/lit-plan/scripts/goal-propose.mjs plans/<slug>.md
//
// Compiles the plan's `## Done when` block into one goal condition, lints it, runs the check once to
// prove the condition is false now, and records the question in `.grok/litgrok/goal/consent.json`.
// It prints the approval question: `Approve plan, start work and set goal: /goal <condition>? (yes / edit / no)`,
// or, when no goal can be set, `Approve plan and start work? (yes / no)` followed by `No goal set: <reason>`.
// A plan it cannot offer at all (outside plans/, unreadable, goal: never) gets only `No goal set: <reason>`.
// It never starts work or arms a goal; only the user's exact `yes`, read by the prompt hook, does.

import { closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { GOAL_DIR, GOAL_STATUS, compileCondition, conditionHash, consentKey, falsify, goalId, lintCondition, parseDoneWhen } from './goal-condition.mjs';

const noFollow = constants.O_NOFOLLOW ?? 0;

// Every directory on the way to the consent file must be a real directory, never a link.
function goalDirectory(cwd) {
  let cursor = cwd;
  for (const part of GOAL_DIR) {
    cursor = join(cursor, part);
    const status = lstatSync(cursor, { throwIfNoEntry: false });
    if (status === undefined) mkdirSync(cursor, { mode: 0o700 });
    else if (!status.isDirectory() || status.isSymbolicLink()) return null;
    // `.grok/litgrok/` holds runtime state only; keep it out of the user's commits as the hooks do.
    if (part === 'litgrok') {
      try {
        writeFileSync(join(cursor, '.gitignore'), '*\n', { flag: 'wx', mode: 0o644 });
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
  }
  return cursor;
}

export function proposeGoal({ cwd, planArg, now = Date.now(), timeoutMs, run } = {}) {
  const planPath = resolve(cwd, String(planArg ?? ''));
  const plan = relative(cwd, planPath).replaceAll('\\', '/');
  if (!planArg || isAbsolute(plan) || plan.startsWith('..') || !/^plans\/[\w.-]+\.md$/u.test(plan)) {
    return { line: GOAL_STATUS.skipped('give the plan as plans/<slug>.md inside this project') };
  }
  let planText;
  try {
    planText = readFileSync(planPath, 'utf8');
  } catch {
    return { line: GOAL_STATUS.skipped(`${plan} cannot be read`) };
  }
  if (/^goal:\s*never\s*$/mu.test(planText)) return { line: GOAL_STATUS.skipped('this plan is marked goal: never') };
  const directory = goalDirectory(cwd);
  if (directory === null) return { line: GOAL_STATUS.skipped('.grok/litgrok/goal is not a plain directory') };
  const goal = goalFor({ cwd, plan, planText, timeoutMs, run });
  const consent = goal.ok
    ? { version: 2, plan, condition: goal.condition, reason: null, id: goal.id, check: goal.check }
    : { version: 2, plan, condition: null, reason: goal.reason, id: goalId(plan, ''), check: null };
  consent.hash = conditionHash(consentKey(consent));
  consent.askedAt = new Date(now).toISOString();
  const staging = join(directory, `consent.json.${process.pid}.tmp`);
  const descriptor = openSync(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  try {
    writeSync(descriptor, `${JSON.stringify(consent)}\n`);
  } finally {
    closeSync(descriptor);
  }
  renameSync(staging, join(directory, 'consent.json'));
  const line = goal.ok ? GOAL_STATUS.asked(goal.condition) : `${GOAL_STATUS.askedStart}\n${GOAL_STATUS.skipped(goal.reason)}`;
  return { line, consent };
}

// The goal half of the question: a condition that is lint-clean and false right now, or the reason there is none.
function goalFor({ cwd, plan, planText, timeoutMs, run }) {
  const done = parseDoneWhen(planText);
  if (!done.ok) return { ok: false, reason: done.reason };
  const built = compileCondition({ plan, check: done.check });
  if (!built.ok) return { ok: false, reason: built.reason };
  const lint = lintCondition(built.condition, done.check);
  if (!lint.ok) return { ok: false, reason: lint.reasons.join('; ') };
  const dry = falsify({ cwd, plan, planText, check: done.check, ...(timeoutMs ? { timeoutMs } : {}), ...(run ? { run } : {}) });
  if (!dry.ok) return { ok: false, reason: dry.reason };
  return { ok: true, condition: built.condition, id: built.id, check: done.check };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { line } = proposeGoal({ cwd: process.cwd(), planArg: process.argv[2] });
  process.stdout.write(`${line}\n`);
}
