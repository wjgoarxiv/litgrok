#!/usr/bin/env node

// No failure-detail field is documented, so this records only the failing toolName and opaque toolInput digest,
// plus a fail verdict when the call was a test run.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('PostToolUseFailure');
