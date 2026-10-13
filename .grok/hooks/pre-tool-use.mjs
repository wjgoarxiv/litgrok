#!/usr/bin/env node

// Records which tool started and when, for the status line's live step. The tool input is never
// stored, not even as a digest. No stdout and exit 0 let the call proceed; a failure fails open.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('PreToolUse');
