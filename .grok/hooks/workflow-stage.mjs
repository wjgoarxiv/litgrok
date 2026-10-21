// Where the session is in the LIT workflow, for the status line's stage map.
//
// The ledger keeps the history: a prompt that names a workflow skill carries its `stage`, and a test
// run's PostToolUse or PostToolUseFailure record carries its `test` verdict. The status line reads only
// the end of the ledger, so the hooks also keep a small per-session snapshot beside it,
// `<session-hash>.workflow.json`, written only once there is something to show. Neither file holds a
// prompt, a command line, a tool argument or tool output: only stage names, plan checkbox counts with the
// next unchecked task's title, and a pass or fail verdict with one count. It depends on nothing outside this folder, so the status line
// can import it.

import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

export const WORKFLOW_SCHEMA = 'litgrok.workflow/v1';
export const STAGES = Object.freeze(['interview', 'plan', 'work', 'review', 'done']);
const MAX_STATE_BYTES = 4096;
const MAX_COUNT = 1_000_000;
// The status line shows the plan's next task, cut to this many characters.
export const MAX_NEXT_CHARACTERS = 60;
// The end of a long test log carries its summary.
const RESULT_TAIL_CHARACTERS = 64 * 1024;

// The first workflow skill a prompt names sets the stage. A bare `lit` starts litwork, as on row one, but
// only when no stage is running: it continues a running stage, and only `lit new` or `lit restart` as the
// prompt's first words starts the row over.
const STAGE_PATTERN = /(?:^|[\s/])(deep-interview|lit-plan|start-work|review-work|litwork|lit)(?=$|[^\w-])/iu;
const STAGE_OF = { 'deep-interview': 'interview', 'lit-plan': 'plan', 'start-work': 'work', litwork: 'work', lit: 'work', 'review-work': 'review' };

// A command counts as a test run when it calls a test runner; the command text itself is never stored.
const TEST_COMMAND = /(?:^|[\s;&|(])(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|node\s+(?:[^;&|\n]*\s)?--test\b|(?:npx\s+|bunx\s+)?(?:vitest|jest|mocha)\b|(?:python3?\s+-m\s+)?(?:pytest|unittest)\b|cargo\s+(?:test|nextest)\b|go\s+test\b|deno\s+test\b|make\s+(?:test|check)\b|(?:\.\/)?gradlew?\s+test\b|mvn\s+(?:-\S+\s+)*test\b|rspec\b|ctest\b|swift\s+test\b|dotnet\s+test\b)/u;
const TAP_PASS = /^\s*[#ℹ]\s*pass\s+(\d+)\s*$/gmu;
const TAP_FAIL = /^\s*[#ℹ]\s*fail\s+(\d+)\s*$/gmu;
const PASSED = /\b(\d+)\s+(?:tests?\s+)?(?:passed|passing)\b/gu;
const FAILED = /\b(\d+)\s+(?:tests?\s+)?(?:failed|failing)\b/gu;
const EXIT_TEXT = /\bexit(?:ed with)?\s+(?:code|status)[\s:=]+(-?\d+)/giu;
const EXIT_KEY = /^(?:exit_?code|exitCode|exit_?status|returncode)$/iu;
const FAIL_MARK = /^(?:FAIL\b|not ok \d)/mu;

// Heredoc bodies and quoted strings are data: a script that only mentions a test runner, such as a plan
// check that embeds the plan's test command, is not a test run.
function commandWords(command) {
  const kept = [];
  let delimiter = null;
  for (const line of command.split('\n')) {
    if (delimiter !== null) {
      if (line.trim() === delimiter) delimiter = null;
      continue;
    }
    kept.push(line);
    const heredoc = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1/u.exec(line);
    if (heredoc) delimiter = heredoc[2];
  }
  return kept.join('\n').replace(/'[^'\n]*'|"(?:[^"\\\n]|\\.)*"/gu, "''");
}

const RESTART_PATTERN = /^\s*\/?lit\s+(?:new|restart)(?=$|[^\w-])/iu;
// `lit plan` as the prompt's first words is the spaced spelling of `lit-plan`.
const SPACED_PLAN_PATTERN = /^\s*\/?lit\s+plan(?=$|[^\w-])/iu;
// `lit review` is the spaced spelling of `review-work`; the mode word after it is for the skill to read.
const SPACED_REVIEW_PATTERN = /^\s*\/?lit\s+review(?=$|[^\w-])/iu;
// Open brainstorming is no workflow stage: it names its own discipline and leaves the row where it was.
const BRAINSTORM_PATTERN = /^\s*\/?(?:lit-brainstorm|lit\s+(?:brainstorm|brainstorming|ideation|ideate|idea|ideas))(?=$|[^\w-])/iu;

/**
 * The stage a prompt names and how it enters it: 'switch' for a named skill (`discipline` is 'lit-plan' for the
 * spaced `lit plan`, null for the spaced `lit review`), 'continue' or 'restart' for lit. A brainstorm prompt
 * carries the discipline 'lit-brainstorm' and no stage.
 */
export function entryFromPrompt(visibleText) {
  if (typeof visibleText !== 'string') return null;
  if (BRAINSTORM_PATTERN.test(visibleText)) return { stage: null, entry: 'switch', discipline: 'lit-brainstorm' };
  const match = STAGE_PATTERN.exec(visibleText);
  if (!match) return null;
  const token = match[1].toLowerCase();
  if (token !== 'lit') return { stage: STAGE_OF[token], entry: 'switch' };
  if (SPACED_PLAN_PATTERN.test(visibleText)) return { stage: STAGE_OF['lit-plan'], entry: 'switch', discipline: 'lit-plan' };
  if (SPACED_REVIEW_PATTERN.test(visibleText)) return { stage: STAGE_OF['review-work'], entry: 'switch', discipline: null };
  return { stage: STAGE_OF.lit, entry: RESTART_PATTERN.test(visibleText) ? 'restart' : 'continue' };
}

export function stageFromPrompt(visibleText) {
  return entryFromPrompt(visibleText)?.stage ?? null;
}

function lastCount(text, pattern) {
  let count = null;
  for (const match of text.matchAll(pattern)) count = Number(match[1]);
  return count !== null && Number.isSafeInteger(count) && count <= MAX_COUNT ? count : null;
}

function resultText(result) {
  if (typeof result === 'string') return { text: result.slice(-RESULT_TAIL_CHARACTERS), exitCode: null };
  const parts = [];
  let exitCode = null;
  const walk = (value, key, depth) => {
    if (depth > 4) return;
    if (typeof value === 'string') parts.push(value);
    else if (typeof value === 'number' && Number.isInteger(value) && EXIT_KEY.test(key)) exitCode = value;
    else if (value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) walk(child, childKey, depth + 1);
    }
  };
  walk(result, '', 0);
  return { text: parts.join('\n').slice(-RESULT_TAIL_CHARACTERS), exitCode };
}

/**
 * The verdict of a test run, or null when the tool call was not a test run or its outcome cannot be
 * read. Returns { verdict: 'pass' | 'fail', count? }: the passing count for a pass, the failing count
 * for a fail, each only when the runner printed it.
 */
export function testVerdict({ toolInput, toolResult }, failed = false) {
  const command = toolInput?.command ?? toolInput?.cmd;
  if (typeof command !== 'string' || command.length > 16 * 1024 || !TEST_COMMAND.test(commandWords(command))) return null;
  const { text, exitCode: exitKey } = resultText(toolResult);
  const tapPassed = lastCount(text, TAP_PASS);
  const tapFailed = lastCount(text, TAP_FAIL);
  const tap = tapPassed !== null || tapFailed !== null;
  const passed = tap ? tapPassed : lastCount(text, PASSED);
  const failedCount = tap ? tapFailed : lastCount(text, FAILED);
  const exitCode = exitKey ?? lastCount(text, EXIT_TEXT);
  let verdict = null;
  if (failed || (failedCount ?? 0) > 0) verdict = 'fail';
  else if (exitCode !== null) verdict = exitCode === 0 ? 'pass' : 'fail';
  else if (passed !== null) verdict = 'pass';
  else if (FAIL_MARK.test(text)) verdict = 'fail';
  if (verdict === null) return null;
  const count = verdict === 'pass' ? passed : failedCount;
  return count !== null && (verdict === 'pass' || count > 0) ? { verdict, count } : { verdict };
}

export function workflowStatePath(ledgerFile) {
  return ledgerFile.replace(/\.jsonl$/u, '.workflow.json');
}

const isCount = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_COUNT;
const isTime = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));

function validState(state, sessionId) {
  return state !== null && typeof state === 'object' && !Array.isArray(state)
    && state.schema === WORKFLOW_SCHEMA && state.sessionId === sessionId
    && (state.stage === null || STAGES.includes(state.stage))
    && Array.isArray(state.visited) && state.visited.length <= STAGES.length && state.visited.every((stage) => STAGES.includes(stage))
    && typeof state.ended === 'boolean'
    && (state.active === undefined || (typeof state.active === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/iu.test(state.active)))
    && (state.plan === null || (isCount(state.plan?.done) && isCount(state.plan?.total) && state.plan.done <= state.plan.total
      && (state.plan.next === undefined || (typeof state.plan.next === 'string' && [...state.plan.next].length <= MAX_NEXT_CHARACTERS && !/[\u0000-\u001f\u007f-\u009f]/u.test(state.plan.next)))))
    && (state.test === null || (['pass', 'fail'].includes(state.test?.verdict) && (state.test.count === undefined || isCount(state.test.count)) && isTime(state.test.at)))
    && isTime(state.updatedAt);
}

/** This session's snapshot, or null when it is missing, malformed, oversized, a symlink or another session's. */
export function readWorkflowState(path, sessionId) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    return null;
  }
  try {
    const status = fstatSync(descriptor);
    if (!status.isFile() || status.size > MAX_STATE_BYTES) return null;
    const buffer = Buffer.alloc(status.size);
    const state = JSON.parse(buffer.subarray(0, readSync(descriptor, buffer, 0, status.size, 0)).toString('utf8'));
    return validState(state, sessionId) ? state : null;
  } catch {
    return null;
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Applies one hook's news to the snapshot: { stage } when a prompt names a workflow skill (with its
 * { entry }: a 'continue' keeps a running stage, a 'restart' clears the path and the test verdict),
 * { active } the discipline an explicit switch selected (a bare lit continues it; null clears it), { ended } when a turn stops (true) or is held (false), { plan } and { test }. A turn that ends a review with
 * every plan task checked moves the stage to done. Nothing is written for a session with nothing to show.
 */
export function updateWorkflowState(ledgerFile, sessionId, { stage, entry, active, ended, plan, test, now = new Date() }) {
  const path = workflowStatePath(ledgerFile);
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error('WORKFLOW_STATE_UNSAFE');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const previous = readWorkflowState(path, sessionId);
  const state = previous ?? { schema: WORKFLOW_SCHEMA, sessionId, stage: null, visited: [], ended: false, plan: null, test: null };
  if (stage !== undefined && stage !== null) {
    if (entry === 'restart') Object.assign(state, { visited: [], plan: null, test: null });
    if (!(entry === 'continue' && state.stage !== null && state.stage !== 'done')) {
      state.stage = stage;
      if (!state.visited.includes(stage)) state.visited = STAGES.filter((name) => name === stage || state.visited.includes(name));
    }
    state.ended = false;
  }
  if (typeof active === 'string') state.active = active;
  else if (active === null) delete state.active;
  if (plan !== undefined) state.plan = plan;
  if (test) state.test = { ...test, at: now.toISOString() };
  if (typeof ended === 'boolean' && state.stage !== null) {
    state.ended = ended;
    if (ended && state.stage === 'review' && state.plan && state.plan.total > 0 && state.plan.done === state.plan.total) {
      state.stage = 'done';
      state.visited = STAGES.filter((name) => name === 'done' || state.visited.includes(name));
    }
  }
  if (previous === null && state.stage === null && state.test === null && state.active === undefined) return null;
  state.updatedAt = now.toISOString();
  if (!validState(state, sessionId)) throw new Error('WORKFLOW_STATE_INVALID');
  const content = `${JSON.stringify(state)}\n`;
  if (Buffer.byteLength(content) > MAX_STATE_BYTES) throw new Error('WORKFLOW_STATE_TOO_LARGE');
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return state;
}
