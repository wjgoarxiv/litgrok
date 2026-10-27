#!/usr/bin/env node

// No end-reason field is documented, so this records only the session end and marks its liveness `ended`.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('SessionEnd');
