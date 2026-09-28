#!/usr/bin/env node

// No compaction-result or durable-goal payload is documented, so this records only the post-compaction boundary.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('PostCompact');
