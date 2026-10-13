// Where the session is in the LIT workflow, for the status line's third row.
//
// The ledger keeps the history: a prompt that names a workflow skill carries its `stage`, and a test
// run's PostToolUse or PostToolUseFailure record carries its `test` verdict. The status line reads only
// the end of the ledger, so the hooks also keep a small per-session snapshot beside it,
// `<session-hash>.workflow.json`, written only once there is something to show. Neither file holds a
// prompt, a command line, a tool argument or tool output: only stage names, plan checkbox counts and a
// pass or fail verdict with one count. It depends on nothing outside this folder, so the status line
// can import it.

import { randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';

export const WORKFLOW_SCHEMA = 'litgrok.workflow/v1';
export const STAGES = Object.freeze(['interview', 'plan', 'work', 'review', 'done']);
const MAX_STATE_BYTES = 4096;
const MAX_COUNT = 1_000_000;
// The end of a long test log carries its summary.
const RESULT_TAIL_CHARACTERS = 64 * 1024;

// The first workflow skill a prompt names sets the stage. A bare `lit` starts litwork, as on row one.
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

export function stageFromPrompt(visibleText) {
  if (typeof visibleText !== 'string') return null;
  const match = STAGE_PATTERN.exec(visibleText);
  return match ? STAGE_OF[match[1].toLowerCase()] : null;
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
    && (state.plan === null || (isCount(state.plan?.done) && isCount(state.plan?.total) && state.plan.done <= state.plan.total))
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
 * Applies one hook's news to the snapshot: { stage } when a prompt names a workflow skill, { ended }
 * when a turn stops (true) or is held (false), { plan } and { test }. A turn that ends a review with
 * every plan task checked moves the stage to done. Nothing is written for a session with nothing to show.
 */
export function updateWorkflowState(ledgerFile, sessionId, { stage, ended, plan, test, now = new Date() }) {
  const path = workflowStatePath(ledgerFile);
  try {
    if (lstatSync(path).isSymbolicLink()) throw new Error('WORKFLOW_STATE_UNSAFE');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const previous = readWorkflowState(path, sessionId);
  const state = previous ?? { schema: WORKFLOW_SCHEMA, sessionId, stage: null, visited: [], ended: false, plan: null, test: null };
  if (stage !== undefined && stage !== null) {
    state.stage = stage;
    state.ended = false;
    if (!state.visited.includes(stage)) state.visited = STAGES.filter((name) => name === stage || state.visited.includes(name));
  }
  if (plan !== undefined) state.plan = plan;
  if (test) state.test = { ...test, at: now.toISOString() };
  if (typeof ended === 'boolean' && state.stage !== null) {
    state.ended = ended;
    if (ended && state.stage === 'review' && state.plan && state.plan.total > 0 && state.plan.done === state.plan.total) {
      state.stage = 'done';
      state.visited = STAGES.filter((name) => name === 'done' || state.visited.includes(name));
    }
  }
  if (previous === null && state.stage === null && state.test === null) return null;
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
