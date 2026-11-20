#!/usr/bin/env node

// Records which tool started and when, for the status line's live step. The tool input is never
// stored, not even as a digest. No stdout and exit 0 let the call proceed; a failure fails open.
// What it can print is `additionalContext`, which the host delivers to the model with that call's results and never
// as a decision: the handoff PreCompact saved (carried by the first call after a compaction), and a lit run's goal
// question (the first call after the prompt hook recorded it carries the exact line for the model to show the user,
// once). When both are due, they travel in one output.
import { takeCompactReload } from './compact-handoff.mjs';
import { loopGoalNotice } from './lit-goal.mjs';
import { recordPassiveEvent } from './record-passive-event.mjs';

const observed = await recordPassiveEvent('PreToolUse');
if (observed?.ledgerFile) {
  const contexts = [];
  try {
    const context = takeCompactReload({ ledgerFile: observed.ledgerFile });
    if (context !== null) contexts.push(context);
  } catch (error) {
    process.stderr.write(`LitGrok compact handoff: ${error?.code ?? 'RELOAD_FAILED'}\n`);
  }
  try {
    const notice = loopGoalNotice({ workspaceRoot: observed.environment.realWorkspaceRoot, sessionId: observed.environment.sessionId });
    if (notice !== null) contexts.push(notice.text);
  } catch (error) {
    process.stderr.write(`LitGrok goal notice: ${error?.code ?? 'NOTICE_FAILED'}\n`);
  }
  if (contexts.length > 0) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: contexts.join('\n\n') } })}\n`);
}
