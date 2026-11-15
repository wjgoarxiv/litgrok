#!/usr/bin/env node

import { homedir } from 'node:os';
import { join } from 'node:path';
import { renderMark } from './lit-mark.mjs';
import { noticeShown, recordNotice } from './notice-record.mjs';
import { claimSessionIgnition } from './record-passive-event.mjs';
import { adhdSuggestion } from '../skills/lit-adhd/scripts/lib/suggest.mjs';

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
  // One nudge toward the catch-up brief per day, only when this project has other recent sessions, and never the
  // same sentence twice: a text already in the project's notice record is skipped.
  // Best effort: a broken suggestion never breaks session start.
  try {
    const home = process.env.HOME || homedir();
    const stateRoot = event.realWorkspaceRoot ?? event.workspaceRoot ?? event.cwd ?? process.cwd();
    const line = adhdSuggestion({
      storeDir: join(home, '.grok', 'sessions'),
      projectRoot: stateRoot,
      sessionId: event.sessionId ?? process.env.GROK_SESSION_ID,
      stateRoot,
    });
    if (line && !noticeShown(stateRoot, line)) {
      recordNotice(stateRoot, line);
      process.stdout.write(`${line}\n`);
    }
  } catch {
    // No suggestion; session start continues.
  }
} catch (error) {
  process.stderr.write(`LitGrok session-start: ${error.code || 'EVENT_INVALID'}\n`);
  process.exitCode = 1;
}

process.stdout.write('LitGrok payload present: skills, project rules, hooks, and the npx installer.\n');
