#!/usr/bin/env node

import { renderMark } from './lit-mark.mjs';
import { claimSessionIgnition } from './record-passive-event.mjs';

let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 1024 * 1024) break;
}
let event;
try {
  if (Buffer.byteLength(input) > 1024 * 1024) throw new Error('EVENT_TOO_LARGE');
  event = JSON.parse(input);
  if (claimSessionIgnition(event)) process.stdout.write(`${renderMark({ args: process.argv.slice(2) }).join('\n')}\n`);
} catch (error) {
  process.stderr.write(`LitGrok session-start: ${error.code || 'EVENT_INVALID'}\n`);
  process.exitCode = 1;
}

process.stdout.write('LitGrok payload present: skills, project rules, hooks, and the npx installer.\n');
