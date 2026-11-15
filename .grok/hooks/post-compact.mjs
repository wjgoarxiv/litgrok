#!/usr/bin/env node

// Records the post-compaction boundary and arms one reload of the handoff PreCompact saved. The reload itself
// rides the next PreToolUse, because a passive hook cannot hand the model anything.
import { armCompactReload } from './compact-handoff.mjs';
import { recordPassiveEvent } from './record-passive-event.mjs';

const observed = await recordPassiveEvent('PostCompact');
if (observed?.ledgerFile) {
  try {
    armCompactReload({ ledgerFile: observed.ledgerFile });
  } catch (error) {
    process.stderr.write(`LitGrok compact handoff: ${error?.code ?? 'RELOAD_FAILED'}\n`);
    process.exitCode = 1;
  }
}
