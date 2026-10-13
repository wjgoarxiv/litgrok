#!/usr/bin/env node

// Every finished call is recorded for the status line: toolName and a digest of the opaque toolInput,
// never its contents. A test run also keeps its verdict and one count, read from toolResult.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('PostToolUse');
