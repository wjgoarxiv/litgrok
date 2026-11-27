#!/usr/bin/env node

// No completion-summary field is documented, so this records only the documented turn-end event and identity.
import { appendSessionRecord, readLedgerRecords, recordPassiveEvent } from './record-passive-event.mjs';
import { PLAN_GATE_SIGNAL, evaluatePlanGate } from './plan-gate.mjs';
import { evaluateAutoHandoff } from './auto-handoff-gate.mjs';
import { GOAL_SIGNAL, LOOP_SIGNAL, START_SIGNAL, closeGoalOwner, goalTurnEnd } from './lit-goal.mjs';
import { planProgress } from './plan-progress.mjs';
import { RUN_SIGNAL, activeRun, capContext, driveTurnEnd } from './start-work-run.mjs';
import { readWorkflowState, updateWorkflowState, workflowStatePath } from './workflow-stage.mjs';

const observed = await recordPassiveEvent('Stop');
if (observed) {
  let held = false;
  // Plan gate: a planning turn must persist plans/<slug>.md; evaluated after the ledger record so a block is counted.
  let gate;
  try {
    gate = evaluatePlanGate({
      event: observed.event,
      workspaceRoot: observed.environment.realWorkspaceRoot,
      sessionId: observed.environment.sessionId,
      ledgerFile: observed.ledgerFile,
    });
  } catch (error) {
    process.stderr.write(`LitGrok plan gate: PLAN_GATE_FAILED ${error instanceof Error ? error.message : String(error)}\n`);
    gate = { block: false };
  }
  if (gate.block) {
    held = true;
    appendSessionRecord(observed.ledgerFile, observed.record, { signal: PLAN_GATE_SIGNAL, reason: gate.reason });
    process.stdout.write(`${JSON.stringify({ decision: 'block', reason: gate.reason })}\n`);
  } else {
    if (gate.warning) process.stderr.write(`${gate.warning}\n`);
    // Automatic handoff (opt-in): evaluated only when the plan gate let this stop through.
    try {
      const handoff = evaluateAutoHandoff({
        event: observed.event,
        workspaceRoot: observed.environment.realWorkspaceRoot,
        eventCwd: observed.environment.eventCwd,
        sessionId: observed.environment.sessionId,
        ledgerFile: observed.ledgerFile,
      });
      if (handoff.record) appendSessionRecord(observed.ledgerFile, observed.record, handoff.record);
      if (handoff.block) {
        held = true;
        process.stdout.write(`${JSON.stringify({ decision: 'block', reason: handoff.reason })}\n`);
      }
    } catch (error) {
      process.stderr.write(`LitGrok auto-handoff: AUTO_HANDOFF_FAILED ${error instanceof Error ? error.message : String(error)}\n`);
    }
    // The approved plan's start-work hand-off, then the advisory goal check: only when nothing above held the turn.
    // While this session's start-work run is active its own driver owns the rows check, so the goal gives only the start.
    let runOwnsTurnEnd = false;
    try {
      runOwnsTurnEnd = activeRun(observed.environment.realWorkspaceRoot, observed.environment.sessionId) !== null;
    } catch {
      runOwnsTurnEnd = false;
    }
    if (!held) {
      try {
        const goal = goalTurnEnd({ workspaceRoot: observed.environment.realWorkspaceRoot, sessionId: observed.environment.sessionId, runOwnsTurnEnd });
        if (goal.block) {
          held = true;
          appendSessionRecord(observed.ledgerFile, observed.record, { signal: goal.start ? START_SIGNAL : goal.notice ? LOOP_SIGNAL : GOAL_SIGNAL });
          process.stdout.write(`${JSON.stringify({ decision: 'block', reason: goal.reason })}\n`);
        }
      } catch (error) {
        process.stderr.write(`LitGrok goal check: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
    // The start-work driver runs on the re-entry turn end (stopHookActive) too, so a row ticked during a
    // continuation closes the run there; its per-state budget (two nudges, one list) keeps it from looping.
    if (!held && runOwnsTurnEnd && observed.ledgerFile) {
      try {
        const drive = driveTurnEnd({
          projectRoot: observed.environment.realWorkspaceRoot,
          sessionId: observed.environment.sessionId,
          event: observed.event,
          records: readLedgerRecords(observed.ledgerFile, observed.environment.sessionId),
        });
        if (drive.decision !== 'none') appendSessionRecord(observed.ledgerFile, observed.record, { signal: drive.block ? RUN_SIGNAL : 'start-work-quiet', decision: drive.decision });
        if (drive.decision === 'done') closeGoalOwner({ workspaceRoot: observed.environment.realWorkspaceRoot, sessionId: observed.environment.sessionId, why: 'start-work run complete' });
        if (drive.block) {
          held = true;
          process.stdout.write(`${JSON.stringify({ decision: 'block', reason: capContext(drive.reason) })}\n`);
        }
      } catch (error) {
        process.stderr.write(`LitGrok start-work driver: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  }
  // The workflow row: a stop that ends the turn closes the current stage, a held one keeps it open.
  if (observed.ledgerFile) {
    try {
      updateWorkflowState(observed.ledgerFile, observed.environment.sessionId, {
        ended: !held,
        plan: planProgress(observed.environment.realWorkspaceRoot, readWorkflowState(workflowStatePath(observed.ledgerFile), observed.environment.sessionId)?.planPath),
      });
    } catch (error) {
      process.stderr.write(`LitGrok workflow state: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}
