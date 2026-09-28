#!/usr/bin/env node

// No compacted-context or durable-goal payload is documented, so this records only the pre-compaction boundary.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('PreCompact');
