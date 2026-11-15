#!/usr/bin/env node

// Records the pre-compaction boundary and, unless LITGROK_COMPACT_HANDOFF=0, saves a handoff naming the plan row
// the session is on. PreCompact cannot block and prints nothing to the model; a failure is reported on stderr.
import { saveCompactHandoff } from './compact-handoff.mjs';
import { recordPassiveEvent } from './record-passive-event.mjs';

const observed = await recordPassiveEvent('PreCompact');
if (observed?.ledgerFile) {
  try {
    await saveCompactHandoff({
      event: observed.event,
      workspaceRoot: observed.environment.realWorkspaceRoot,
      sessionId: observed.environment.sessionId,
      ledgerFile: observed.ledgerFile,
    });
  } catch (error) {
    process.stderr.write(`LitGrok compact handoff: ${error?.code ?? 'HANDOFF_FAILED'}\n`);
    process.exitCode = 1;
  }
}
