#!/usr/bin/env node

// No subagent identifier, result, or status field is documented, so this records only the lifecycle boundary.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('SubagentStop');
