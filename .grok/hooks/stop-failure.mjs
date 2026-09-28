#!/usr/bin/env node

// No API-error detail field is documented; StopFailure itself is the only recorded failure signal.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('StopFailure');
