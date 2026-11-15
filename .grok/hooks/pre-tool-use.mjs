#!/usr/bin/env node

// Records which tool started and when, for the status line's live step. The tool input is never
// stored, not even as a digest. No stdout and exit 0 let the call proceed; a failure fails open.
// The one thing it can print: the first call after a compaction carries the handoff PreCompact saved, as
// `additionalContext`, which the host delivers to the model with that call's results and never as a decision.
import { takeCompactReload } from './compact-handoff.mjs';
import { recordPassiveEvent } from './record-passive-event.mjs';

const observed = await recordPassiveEvent('PreToolUse');
if (observed?.ledgerFile) {
  try {
    const context = takeCompactReload({ ledgerFile: observed.ledgerFile });
    if (context !== null) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: context } })}\n`);
  } catch (error) {
    process.stderr.write(`LitGrok compact handoff: ${error?.code ?? 'RELOAD_FAILED'}\n`);
  }
}
