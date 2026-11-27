#!/usr/bin/env node

// Prompt text is not documented in the UserPromptSubmit payload, so this records that a turn began and
// reads `event.prompt` only when the host supplies it. It does not route a skill and writes no stdout for an
// allowed prompt, because Grok Build drops that output. One prompt has a side effect: an exact `yes` to a lit-plan
// approval question starts start-work on that plan and arms LitGrok's goal record, and `lit cancel` closes it. The
// first `lit <objective>` of a run in a project with a test command also records one goal question for that run,
// which the first tool call or the Stop hook carries to the model (this hook's own output is dropped).
//
// It also owns the start-work run's typed words (start-work-run.mjs): a prompt opening with `start-work` or
// `lit start`, or the approval `yes`, starts the run; `lit approve`, `lit approve x`, `lit deny`, `lit skip-row [N]`,
// `lit pause` and `lit resume` are applied here, before the model runs. Only a near miss of `lit approve x` blocks
// the prompt, because a blocked prompt's reason is the one text this event shows the user. A failure fails open.
import { realpathSync } from 'node:fs';

import { answerGoalPrompt, offerLoopGoal } from './lit-goal.mjs';
import { appendSessionRecord, lastReadEvent, recordPassiveEvent } from './record-passive-event.mjs';
import { applyAnswer, startPlanFromPrompt, startRun } from './start-work-run.mjs';

const observed = await recordPassiveEvent('UserPromptSubmit');
let started = null;
if (observed && typeof observed.event.prompt === 'string') {
  try {
    const goal = answerGoalPrompt({ workspaceRoot: observed.environment.realWorkspaceRoot, sessionId: observed.environment.sessionId, prompt: observed.event.prompt, ledgerFile: observed.ledgerFile });
    if (goal.did !== 'none' && observed.ledgerFile) appendSessionRecord(observed.ledgerFile, observed.record, { signal: `goal-${goal.did}` });
    if (goal.did === 'started' || goal.did === 'started-armed') started = { plan: goal.plan, scopeHash: goal.scopeHash };
    const offer = offerLoopGoal({ workspaceRoot: observed.environment.realWorkspaceRoot, sessionId: observed.environment.sessionId, prompt: observed.event.prompt, entry: observed.entry, before: observed.before });
    if (offer.did !== 'none' && observed.ledgerFile) appendSessionRecord(observed.ledgerFile, observed.record, { signal: `goal-loop-${offer.did}` });
  } catch (error) {
    process.stderr.write(`LitGrok goal: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

const event = observed?.event ?? lastReadEvent();
try {
  const sessionId = observed?.environment.sessionId ?? process.env.GROK_SESSION_ID ?? event?.sessionId;
  if (event && typeof event.prompt === 'string' && typeof event.workspaceRoot === 'string' && typeof sessionId === 'string') {
    const projectRoot = observed?.environment.realWorkspaceRoot ?? realpathSync(event.workspaceRoot);
    const answer = applyAnswer({ projectRoot, sessionId, prompt: event.prompt, event });
    if (answer?.block) {
      process.stdout.write(`${JSON.stringify({ decision: 'block', reason: answer.reason })}\n`);
    } else if (!answer) {
      const planPath = started?.plan ?? startPlanFromPrompt(projectRoot, event.prompt);
      const run = planPath ? startRun({ projectRoot, sessionId, planPath, approvedScopeHash: started?.scopeHash ?? null }) : null;
      if (run && observed?.ledgerFile) appendSessionRecord(observed.ledgerFile, observed.record, { signal: run.run ? 'start-work-run-started' : 'start-work-run-refused' });
    }
  }
} catch (error) {
  process.stderr.write(`LitGrok start-work prompt: ${error instanceof Error ? error.message : String(error)}; fail-open\n`);
}
