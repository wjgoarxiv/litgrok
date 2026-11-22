// The goal question of a lit run with no plan (lit-loop, litwork). It lives with the hooks, beside lit-goal.mjs, so
// the lit-plan skill keeps its size budget; `goal-propose.mjs --loop --check "<check>" <objective>` hands to it.
//
// The condition is `` `<check>` exits 0 and this is done: <objective> [lit:<id>] ``. A plan has unticked rows to keep
// its goal false until the work is done; a run has none, so the check must fail now (`falsifyLoop`) or, when the
// prompt hook records the question and cannot wait on a test run, the objective clause alone keeps it false.
// `proposeLoopGoal` records a `kind: "loop"` consent (`plan: null`) in `.grok/litgrok/goal/consent.json`; lit-goal.mjs
// reads the answer. Data in, data out, except `falsifyLoop`, which runs the check once, time-boxed, with no shell.

import { spawnSync } from 'node:child_process';
import { closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { FALSIFY_TIMEOUT_MS, GOAL_DIR, GOAL_MAX_CHARS, GOAL_STATUS, CONSENT_TTL_MS, conditionHash, goalChoices, goalGuide, goalId, lintCondition } from '../skills/lit-plan/scripts/goal-condition.mjs';

const MAX_OBJECTIVE_CHARS = 180;
const noFollow = constants.O_NOFOLLOW ?? 0;
const SECRET_PATTERNS = [/sk-[A-Za-z0-9_-]{20,}/gu, /(?:api[_-]?key|token|secret|password)\s*=\s*\S+/giu];
const UNSAFE_COMMAND_PATTERNS = [
  /\b(?:rm|rmdir)\s+-r(?:f)?\b[^;&|\n]*/giu,
  /\b(?:sudo|eval|exec)\b[^;&|\n]*/giu,
  /\b(?:npm|pnpm|yarn)\s+(?:publish|unpublish)\b[^;&|\n]*/giu,
  /\bgit\s+(?:push|reset|clean)\b[^;&|\n]*/giu,
];

export const LOOP_STATUS = Object.freeze({
  asked: (condition) => `Set goal for this lit-loop: /goal ${condition}? ${goalChoices('loop')}`,
  armed: (id, condition) => `LitGrok goal armed [lit:${id}]. Grok Build takes /goal only from you; paste: /goal ${condition}`,
});

/**
 * The objective a run puts in its goal condition: slash-command lines dropped, secrets and unsafe commands
 * redacted, a copied goal tag removed, one line, at most 180 characters.
 */
export function normalizeGoalObjective(value) {
  if (typeof value !== 'string') return '';
  const lines = value.split(/\r?\n/u).filter((line) => !line.trimStart().startsWith('/')).join(' ');
  const redacted = SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), lines.replace(/\[lit:[0-9a-f]{8}\]/giu, ''));
  const safe = UNSAFE_COMMAND_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[UNSAFE_COMMAND_REDACTED]'), redacted);
  return safe.replace(/\s+/gu, ' ').trim().slice(0, MAX_OBJECTIVE_CHARS).trim();
}

/** A run's condition: its check exits 0 and its objective is done. No plan, so no rows. */
export function compileLoopCondition({ objective, check }) {
  const id = goalId(`loop\u0000${objective}`, check);
  const condition = `\`${check}\` exits 0 and this is done: ${objective} [lit:${id}]`;
  if (condition.length > GOAL_MAX_CHARS) return { ok: false, reason: `the condition is over ${GOAL_MAX_CHARS} characters; shorten the objective` };
  return { ok: true, condition, id };
}

/** The check must fail right now, or the goal would be met at once. */
export function falsifyLoop({ cwd, check, timeoutMs = FALSIFY_TIMEOUT_MS, run = spawnSync }) {
  const [command, ...args] = check.split(/\s+/u);
  const result = run(command, args, { cwd, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'ignore', 'ignore'], shell: false });
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') return { ok: false, reason: `\`${check}\` did not finish within ${Math.round(timeoutMs / 1000)} s` };
  if (result.error || result.status === 127) return { ok: false, reason: `\`${check}\` cannot run here` };
  if (result.status === 0) return { ok: false, reason: `\`${check}\` already passes, so the goal would be met at once; write the failing test first` };
  return { ok: true, exit: result.status };
}

/** A loop consent is intact, fresh and planless; the plan path's own check rejects it. */
export function loopConsentIsLive(consent, now) {
  return Boolean(consent?.kind === 'loop' && consent.plan === null && typeof consent.condition === 'string'
    && consent.hash === conditionHash(consent.condition) && Number.isFinite(Date.parse(consent.askedAt))
    && now - Date.parse(consent.askedAt) <= CONSENT_TTL_MS);
}

/** The project's own test command, or null when there is none. */
export function detectCheck(cwd) {
  try {
    if (typeof JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))?.scripts?.test === 'string') return 'npm test';
  } catch {
    // No readable package.json.
  }
  for (const [file, check] of [['pytest.ini', 'pytest'], ['pyproject.toml', 'pytest'], ['Cargo.toml', 'cargo test'], ['go.mod', 'go test ./...']]) {
    if (existsSync(join(cwd, file))) return check;
  }
  return null;
}

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

/**
 * A run's question. `falsifyNow: false` skips the dry run (the prompt hook cannot wait on a test run). `asked` marks a
 * question the caller prints itself, so no hook delivers it a second time. With no settable goal it records nothing
 * and returns only `No goal set: <reason>`.
 */
export function proposeLoopGoal({ cwd, check, objective, sessionId = null, asked = false, now = Date.now(), timeoutMs, run, falsifyNow = true } = {}) {
  const goal = normalizeGoalObjective(String(objective ?? ''));
  const command = String(check ?? '').trim();
  if (!goal) return { line: GOAL_STATUS.skipped('name what the loop should finish') };
  const built = compileLoopCondition({ objective: goal, check: command });
  if (!built.ok) return { line: GOAL_STATUS.skipped(built.reason) };
  const lint = lintCondition(built.condition, command);
  if (!lint.ok) return { line: GOAL_STATUS.skipped(lint.reasons.join('; ')) };
  const dry = falsifyNow ? falsifyLoop({ cwd, check: command, ...(timeoutMs ? { timeoutMs } : {}), ...(run ? { run } : {}) }) : { ok: true };
  if (!dry.ok) return { line: GOAL_STATUS.skipped(dry.reason) };
  const directory = goalDirectory(cwd);
  if (directory === null) return { line: GOAL_STATUS.skipped('.grok/litgrok/goal is not a plain directory') };
  const at = new Date(now).toISOString();
  const consent = { version: 2, kind: 'loop', plan: null, condition: built.condition, reason: null, id: built.id, check: command, objective: goal, sessionId: typeof sessionId === 'string' && sessionId ? sessionId : null, hash: conditionHash(built.condition), askedAt: at };
  if (asked) consent.asked = at;
  const staging = join(directory, `consent.json.${process.pid}.tmp`);
  const descriptor = openSync(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  try {
    writeSync(descriptor, `${JSON.stringify(consent)}\n`);
  } finally {
    closeSync(descriptor);
  }
  renameSync(staging, join(directory, 'consent.json'));
  return { line: LOOP_STATUS.asked(built.condition), guide: goalGuide('loop', built.condition), consent };
}
