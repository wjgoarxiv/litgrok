#!/usr/bin/env node

// No completion-summary field is documented, so this records only the documented turn-end event and identity.
import { appendSessionRecord, recordPassiveEvent } from './record-passive-event.mjs';
import { PLAN_GATE_SIGNAL, evaluatePlanGate } from './plan-gate.mjs';
import { evaluateAutoHandoff } from './auto-handoff-gate.mjs';

const observed = await recordPassiveEvent('Stop');
if (observed) {
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
      if (handoff.block) process.stdout.write(`${JSON.stringify({ decision: 'block', reason: handoff.reason })}\n`);
    } catch (error) {
      process.stderr.write(`LitGrok auto-handoff: AUTO_HANDOFF_FAILED ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }
}
