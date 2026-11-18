#!/usr/bin/env node

// Prompt text is not documented in the UserPromptSubmit payload, so this records that a turn began and
// reads `event.prompt` only when the host supplies it. It does not route a skill and writes no stdout
// because passive-hook stdout is ignored. One prompt has a side effect: an exact `yes` to a lit-plan approval
// question starts start-work on that plan and arms LitGrok's goal record, and `lit cancel` closes it.
import { answerGoalPrompt } from './lit-goal.mjs';
import { appendSessionRecord, recordPassiveEvent } from './record-passive-event.mjs';

const observed = await recordPassiveEvent('UserPromptSubmit');
if (observed && typeof observed.event.prompt === 'string') {
  try {
    const goal = answerGoalPrompt({ workspaceRoot: observed.environment.realWorkspaceRoot, sessionId: observed.environment.sessionId, prompt: observed.event.prompt, ledgerFile: observed.ledgerFile });
    if (goal.did !== 'none' && observed.ledgerFile) appendSessionRecord(observed.ledgerFile, observed.record, { signal: `goal-${goal.did}` });
  } catch (error) {
    process.stderr.write(`LitGrok goal: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
