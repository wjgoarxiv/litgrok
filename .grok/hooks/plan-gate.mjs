// Stop plan gate: a planning turn must persist plans/<slug>.md with column-zero checkbox rows.
//
// Host contract (documented Stop decision control): stdout `{"decision":"block","reason"}` keeps
// the agent working; empty stdout with exit 0 allows the stop; failures fail open. The prompt text
// is never persisted, so the gate arms on `permissionMode === "plan"`, on the ledger's lit-plan
// discipline marker for the turn, on a plan file written this turn that carries zero rows, and on
// one whose todos name a folder outside the project with no `Scope roots:` line covering it. At
// most two blocks per session; after that it passes with a stderr warning so a condition the model
// cannot resolve never loops.

import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { countImplementationRows, planLinesOutsideFences } from '../skills/lit-plan/scripts/scaffold-plan.mjs';
import { describeScopePath, uncoveredScopePaths } from '../skills/lit-plan/scripts/scope-roots.mjs';
import { readLedgerRecords } from './record-passive-event.mjs';

export const PLAN_GATE_SIGNAL = 'plan-gate-block';
export const PLAN_GATE_MAX_BLOCKS = 2;
const SCAFFOLD = '.grok/skills/lit-plan/scripts/scaffold-plan.mjs';
const MAX_PLAN_BYTES = 256 * 1024;

function turnStart(records, promptId) {
  const prompts = records.filter((record) => record.event === 'UserPromptSubmit');
  const matching = typeof promptId === 'string' ? prompts.filter((record) => record.promptId === promptId) : [];
  const start = (matching.length > 0 ? matching : prompts).at(-1);
  return {
    since: start ? Date.parse(start.recordedAt) : null,
    litPlanTurn: start?.discipline === 'lit-plan',
  };
}

function plansWrittenSince(workspaceRoot, since) {
  const directory = join(workspaceRoot, 'plans');
  if (!existsSync(directory) || lstatSync(directory).isSymbolicLink() || !statSync(directory).isDirectory()) return [];
  const plans = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const path = join(directory, entry.name);
    const status = statSync(path);
    if (status.size > MAX_PLAN_BYTES) continue;
    if (since !== null && status.mtimeMs < since) continue;
    const text = readFileSync(path, 'utf8');
    plans.push({
      name: `plans/${entry.name}`,
      mtimeMs: status.mtimeMs,
      rows: countImplementationRows(text),
      outside: uncoveredScopePaths(planLinesOutsideFences(text), workspaceRoot),
    });
  }
  return plans.sort((left, right) => right.mtimeMs - left.mtimeMs);
}

/**
 * Decide whether this Stop fire must block. Returns `{ block: false }`, `{ block: true, reason }`,
 * or `{ block: false, warning }` when the per-session cap has been reached.
 */
export function evaluatePlanGate({ event, workspaceRoot, sessionId, ledgerFile }) {
  if (event.reason !== undefined && event.reason !== 'end_turn') return { block: false };
  if (event.subagentType !== undefined) return { block: false };

  const records = readLedgerRecords(ledgerFile, sessionId);
  const { since, litPlanTurn } = turnStart(records, event.promptId);
  const planMode = event.permissionMode === 'plan' || litPlanTurn;
  const written = plansWrittenSince(workspaceRoot, since);
  const newest = written[0];

  let reason = null;
  if (planMode && !newest) {
    reason = `lit-plan must persist plans/<slug>.md before finishing this planning turn: run \`node ${SCAFFOLD} <slug>\` from the project root, append column-zero \`- [ ] N. <title>\` task rows under "## Todos", then run \`node ${SCAFFOLD} --check plans/<slug>.md\`.`;
  } else if (newest && newest.rows === 0 && (planMode || since !== null)) {
    reason = `${newest.name} was written this turn but has no column-zero \`- [ ] 1. <title>\` task row; start-work cannot execute it. Append the task rows under "## Todos", then run \`node ${SCAFFOLD} --check ${newest.name}\`.`;
  } else if (newest && newest.outside.length > 0 && (planMode || since !== null)) {
    reason = `${newest.name} names folders outside the project that start-work would have to stop and ask for. ${newest.outside.map(describeScopePath).join(' ')} Then run \`node ${SCAFFOLD} --check ${newest.name}\`.`;
  }
  if (reason === null) return { block: false };

  const blocks = records.filter((record) => record.signal === PLAN_GATE_SIGNAL).length;
  if (blocks >= PLAN_GATE_MAX_BLOCKS) {
    return { block: false, warning: `LitGrok plan gate: ${blocks} blocks already issued this session; passing with a warning. ${reason}` };
  }
  return { block: true, reason };
}
