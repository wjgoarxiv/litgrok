#!/usr/bin/env node

// No subagent identifier or type field is documented, so this records only the lifecycle boundary and session identity.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('SubagentStart');
