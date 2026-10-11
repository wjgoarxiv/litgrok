#!/usr/bin/env node

import { renderMark } from './lit-mark.mjs';
import { claimSessionIgnition } from './record-passive-event.mjs';

// Decode once: a multi-byte character can straddle two pipe chunks.
const chunks = [];
let bytes = 0;
for await (const chunk of process.stdin) {
  bytes += chunk.length;
  chunks.push(chunk);
  if (bytes > 1024 * 1024) break;
}
let event;
try {
  if (bytes > 1024 * 1024) throw new Error('EVENT_TOO_LARGE');
  event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (claimSessionIgnition(event)) process.stdout.write(`${renderMark({ args: process.argv.slice(2) }).join('\n')}\n`);
} catch (error) {
  process.stderr.write(`LitGrok session-start: ${error.code || 'EVENT_INVALID'}\n`);
  process.exitCode = 1;
}

process.stdout.write('LitGrok payload present: skills, project rules, hooks, and the npx installer.\n');
