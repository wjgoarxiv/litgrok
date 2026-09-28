#!/usr/bin/env node

// Prompt text is not documented in the UserPromptSubmit payload, so this records only that a turn began.
// It does not route a skill and writes no stdout because passive-hook stdout is ignored.
import { recordPassiveEvent } from './record-passive-event.mjs';

await recordPassiveEvent('UserPromptSubmit');
