// The hook half of lit-plan's approval. goal-propose.mjs asked the question and wrote consent.json; when the
// user's whole prompt is exactly `yes`, this module starts start-work on the plan and arms LitGrok's own goal
// record in one step, closes it on `lit cancel`, and gives the Stop hook its turn-end work. Grok Build's native
// `/goal` is typed by the user alone, so nothing here sets, reads or clears it.
//
//   owner.json   { plan, condition|null, reason|null, hash, id, check, sessionId, armedAt, start, asked?, closed? }
//   answer.json  { id, did, line, at }: the one status line for that yes
//
// Starting is code-owned: the hook moves this session's workflow row to the work stage, exactly as typing
// `/start-work <plan>` does, and the Stop hook at the end of that same turn holds it once with the instruction
// to run start-work on the plan. Grok Build drops what a prompt hook prints, so the Stop decision is the one
// channel that reaches the model. If the start is refused (the plan is gone, another session's start-work is
// running), no goal is armed either. The goal check at turn end is advisory: when every row is ticked, the Stop
// hook holds the turn once and asks for the plan's check; it never runs the check itself.

import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync, readdirSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { GOAL_DIR, GOAL_STATUS, conditionHash, consentAnswer, consentIsLive, consentKey, planRows } from '../skills/lit-plan/scripts/goal-condition.mjs';
import { updateWorkflowState } from './workflow-stage.mjs';

export const GOAL_SIGNAL = 'goal-turn-end-check';
export const START_SIGNAL = 'start-work-handoff';
const MAX_RECORD_BYTES = 16 * 1024;
const noFollow = constants.O_NOFOLLOW ?? 0;
const RUN_FRESH_MS = 30 * 60 * 1000;

// The goal directory if every part of it is a real directory; it is never created here.
function goalDirectory(workspaceRoot) {
  let cursor = workspaceRoot;
  for (const part of GOAL_DIR) {
    cursor = join(cursor, part);
    const status = lstatSync(cursor, { throwIfNoEntry: false });
    if (status === undefined || !status.isDirectory() || status.isSymbolicLink()) return null;
  }
  return cursor;
}

function readRecord(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | noFollow);
  } catch {
    return null;
  }
  try {
    const status = fstatSync(descriptor);
    if (!status.isFile() || status.size > MAX_RECORD_BYTES) return null;
    const buffer = Buffer.alloc(status.size);
    const value = JSON.parse(buffer.subarray(0, readSync(descriptor, buffer, 0, status.size, 0)).toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  } finally {
    closeSync(descriptor);
  }
}

function writeRecord(directory, name, value) {
  const staging = join(directory, `${name}.${process.pid}.tmp`);
  const descriptor = openSync(staging, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600);
  try {
    writeSync(descriptor, `${JSON.stringify(value)}\n`);
  } finally {
    closeSync(descriptor);
  }
  renameSync(staging, join(directory, name));
}

function removeRecord(directory, name) {
  try {
    if (lstatSync(join(directory, name)).isFile()) unlinkSync(join(directory, name));
  } catch {
    // Nothing to remove.
  }
}

/** Read the live owner record of this project, or null. */
export function readGoalOwner(workspaceRoot) {
  const directory = goalDirectory(workspaceRoot);
  if (directory === null) return null;
  const owner = readRecord(join(directory, 'owner.json'));
  const key = consentKey(owner);
  return owner && key && owner.hash === conditionHash(key) ? owner : null;
}

// Why start-work cannot start on this plan now, or null. The plan must be a regular file inside the project, and no
// other session may have a start-work run going: an open owner record, or a fresh unfinished work stage.
function startRefusal({ workspaceRoot, sessionId, plan, now }) {
  const root = resolve(workspaceRoot);
  const planPath = resolve(root, String(plan ?? ''));
  if (relative(root, planPath).startsWith('..')) return `${plan} is outside this project`;
  const status = lstatSync(planPath, { throwIfNoEntry: false });
  if (!status?.isFile()) return `${plan} was not found`;
  const owner = readGoalOwner(workspaceRoot);
  if (owner && !owner.closed && owner.start && owner.sessionId !== sessionId) {
    return `another session's start-work is running ${owner.plan} (session ${String(owner.sessionId).slice(0, 8)})`;
  }
  const ledger = join(root, '.grok', 'litgrok', 'session-ledger');
  let names = [];
  try {
    names = readdirSync(ledger).filter((name) => name.endsWith('.workflow.json'));
  } catch {
    return null;
  }
  for (const name of names) {
    const state = readRecord(join(ledger, name));
    if (!state || state.sessionId === sessionId || state.stage !== 'work' || state.ended !== false) continue;
    if (now - Date.parse(state.updatedAt) > RUN_FRESH_MS) continue;
    // A run whose own plan has every row ticked is finished, whatever its row still says.
    if (typeof state.planPath === 'string' && finished(root, state.planPath)) continue;
    return `another session's start-work is running (session ${String(state.sessionId).slice(0, 8)})`;
  }
  return null;
}

function finished(root, plan) {
  try {
    const rows = planRows(readFileSync(resolve(root, plan), 'utf8'));
    return rows.length > 0 && rows.every((row) => row.checked);
  } catch {
    return false;
  }
}

function answer(directory, id, did, line, now) {
  writeRecord(directory, 'answer.json', { id, did, line, at: new Date(now).toISOString() });
  return line;
}

/**
 * The prompt side. `yes` to a live consent arms the owner record for this session; `no` drops the
 * consent; `edit` leaves it for the next question. `lit cancel` closes this session's own record.
 * Returns what happened, for tests and the ledger; it prints nothing (the host drops the output).
 */
export function answerGoalPrompt({ workspaceRoot, sessionId, prompt, ledgerFile = null, now = Date.now() }) {
  const directory = goalDirectory(workspaceRoot);
  if (directory === null || typeof sessionId !== 'string' || !sessionId) return { did: 'none' };
  const reply = consentAnswer(prompt);
  if (reply !== null) {
    const consent = readRecord(join(directory, 'consent.json'));
    if (!consentIsLive(consent, now)) return { did: 'none' };
    if (reply === 'edit') return { did: 'edit' };
    removeRecord(directory, 'consent.json');
    if (reply === 'no') return { did: 'declined' };
    const { condition, reason, hash, id, plan, check } = consent;
    const refusal = startRefusal({ workspaceRoot, sessionId, plan, now });
    if (refusal) return { did: 'refused', id, status: answer(directory, id, 'refused', GOAL_STATUS.refused(refusal), now) };
    // The same row change `/start-work <plan>` makes: this session is now in the work stage.
    if (ledgerFile) updateWorkflowState(ledgerFile, sessionId, { stage: 'work', entry: 'switch', active: null, planPath: plan });
    const at = new Date(now).toISOString();
    writeRecord(directory, 'owner.json', { version: 2, plan, condition: condition ?? null, reason: reason ?? null, hash, id, check: check ?? null, sessionId, armedAt: at, start: { at } });
    const line = typeof condition === 'string' ? GOAL_STATUS.started(plan, id, condition) : GOAL_STATUS.startedNoGoal(plan, reason);
    return { did: typeof condition === 'string' ? 'started-armed' : 'started', id, status: answer(directory, id, 'started', line, now) };
  }
  if (/^\s*lit\s+cancel\s*$/iu.test(String(prompt ?? ''))) {
    const owner = readGoalOwner(workspaceRoot);
    if (!owner || owner.closed || owner.sessionId !== sessionId) return { did: 'none' };
    writeRecord(directory, 'owner.json', { ...owner, closed: { why: 'lit cancel', at: new Date(now).toISOString() } });
    return { did: 'cleared', id: owner.id, status: GOAL_STATUS.cleared(owner.id, 'lit cancel') };
  }
  return { did: 'none' };
}

/**
 * The Stop side. With every row of the owned plan ticked, hold the turn once and ask for the check.
 * The next stop after that closes the record: the check was asked for, and the model reported it.
 */
export function goalTurnEnd({ workspaceRoot, sessionId, now = Date.now() }) {
  const owner = readGoalOwner(workspaceRoot);
  if (!owner || owner.closed || owner.sessionId !== sessionId) return { block: false };
  // The start: the turn in which the user said yes ends once with the order to run start-work.
  if (owner.start && !owner.start.handed) {
    writeRecord(goalDirectory(workspaceRoot), 'owner.json', { ...owner, start: { ...owner.start, handed: new Date(now).toISOString() } });
    return {
      block: true,
      start: true,
      reason: `LitGrok start-work [lit:${owner.id}]: the user approved ${owner.plan} with yes. Load the start-work skill and run that plan now, `
        + 'row by row, exactly as if they had typed /start-work with it. Do not ask again.',
    };
  }
  if (typeof owner.condition !== 'string') return { block: false };
  const root = resolve(workspaceRoot);
  const planPath = resolve(root, owner.plan);
  if (relative(root, planPath).startsWith('..')) return { block: false };
  let rows;
  try {
    rows = planRows(readFileSync(planPath, 'utf8'));
  } catch {
    return { block: false };
  }
  if (!rows.length || rows.some((row) => !row.checked)) return { block: false };
  const directory = goalDirectory(workspaceRoot);
  if (owner.asked) {
    writeRecord(directory, 'owner.json', { ...owner, closed: { why: 'turn-end check reported', at: new Date(now).toISOString() } });
    return { block: false, closed: owner.id };
  }
  writeRecord(directory, 'owner.json', { ...owner, asked: new Date(now).toISOString() });
  return {
    block: true,
    reason: `LitGrok goal [lit:${owner.id}]: every row in ${owner.plan} is ticked. Run \`${owner.check}\` once now. `
      + `Exit 0: reply with the line "${GOAL_STATUS.met(owner.id)}". Any other exit: say what failed and keep working. `
      + 'This check is advisory; if the user pasted the /goal line, Grok Build runs its own review as well.',
  };
}

/** SessionStart: a record armed by another session that never closed (a crash, a closed window) closes. */
export function sweepGoal({ workspaceRoot, sessionId, now = Date.now() }) {
  const owner = readGoalOwner(workspaceRoot);
  if (!owner || owner.closed || owner.sessionId === sessionId) return { did: 'none' };
  writeRecord(goalDirectory(workspaceRoot), 'owner.json', { ...owner, closed: { why: 'its session ended', at: new Date(now).toISOString() } });
  return { did: 'swept', id: owner.id };
}
