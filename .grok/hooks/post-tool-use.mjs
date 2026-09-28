#!/usr/bin/env node

// A documented edited-file path or tool-result field would make this ledger richer; neither is documented.
// Record only toolName and a digest of the opaque documented toolInput, never its contents.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('PostToolUse');
