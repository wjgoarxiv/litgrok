#!/usr/bin/env node

// No failure-detail field is documented, so this records only the failing toolName and opaque toolInput digest.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('PostToolUseFailure');
