#!/usr/bin/env node

// Records which tool started and when, for the status line's live step. The tool input is never
// stored, not even as a digest. No stdout and exit 0 let the call proceed; a failure fails open.
// What it can print is `additionalContext`, which the host delivers to the model with that call's results and never
// as a decision: the handoff PreCompact saved (carried by the first call after a compaction), a lit run's goal
// question (the first call after the prompt hook recorded it carries the exact line for the model to show the user,
// once), and the outcome of a start-work answer the user typed (`lit approve` and the rest). When several are due,
// they travel in one output.
//
// During this session's active start-work run it is also the run guard (start-work-run.mjs): a shell call it will
// not run now is denied with exit 2 and a JSON reason, which Grok Build returns to the model as the tool result,
// and parked for the wrap-up list; an edit into `.git` or the run state is refused. A denied call carries no
// context, so what was due waits for the next call. A guard error fails open.
import { realpathSync } from 'node:fs';

import { takeCompactReload } from './compact-handoff.mjs';
import { loopGoalNotice } from './lit-goal.mjs';
import { lastReadEvent, recordPassiveEvent } from './record-passive-event.mjs';
import { capContext, guardEditCall, guardShellCall, runMayBeActive, takeAnswerNotice } from './start-work-run.mjs';
import { SHELL_TOOL } from './start-work-shell.mjs';

const observed = await recordPassiveEvent('PreToolUse');
const event = observed?.event ?? lastReadEvent();
let denied = false;
let projectRoot = null;
const sessionId = observed?.environment.sessionId ?? process.env.GROK_SESSION_ID ?? event?.sessionId;
try {
  if (event && typeof event.workspaceRoot === 'string' && typeof sessionId === 'string') {
    projectRoot = observed?.environment.realWorkspaceRoot ?? realpathSync(event.workspaceRoot);
    const command = event.toolInput?.command;
    const verdict = SHELL_TOOL.test(event.toolName ?? '') && typeof command === 'string'
      ? guardShellCall({ projectRoot, sessionId, command, cwd: typeof event.cwd === 'string' ? event.cwd : projectRoot, event })
      : guardEditCall({ projectRoot, sessionId, toolName: event.toolName, toolInput: event.toolInput, event });
    if (!verdict.allow) deny(verdict.reason);
  }
} catch (error) {
  // A guard error fails closed while this project may have a run going (H1), and open otherwise.
  const message = error instanceof Error ? error.message : String(error);
  if (projectRoot !== null && runMayBeActive(projectRoot)) deny(`LitGrok start-work could not check this call (${message}), so it did not run. Continue without it.`);
  else process.stderr.write(`LitGrok start-work guard: ${message}; fail-open\n`);
}

function deny(reason) {
  denied = true;
  process.stdout.write(`${JSON.stringify({ decision: 'deny', reason })}\n`);
  process.stderr.write(`${reason.replace(/\s*\n\s*/gu, ' ')}\n`);
  process.exitCode = 2;
}

if (observed?.ledgerFile && !denied) {
  const contexts = [];
  try {
    const context = takeCompactReload({ ledgerFile: observed.ledgerFile });
    if (context !== null) contexts.push(context);
  } catch (error) {
    process.stderr.write(`LitGrok compact handoff: ${error?.code ?? 'RELOAD_FAILED'}\n`);
  }
  try {
    const notice = loopGoalNotice({ workspaceRoot: observed.environment.realWorkspaceRoot, sessionId: observed.environment.sessionId });
    if (notice !== null) contexts.push(notice.text);
  } catch (error) {
    process.stderr.write(`LitGrok goal notice: ${error?.code ?? 'NOTICE_FAILED'}\n`);
  }
  try {
    const answer = projectRoot === null ? null : takeAnswerNotice({ projectRoot, sessionId });
    if (answer !== null) contexts.push(answer);
  } catch (error) {
    process.stderr.write(`LitGrok start-work answer: ${error instanceof Error ? error.message : 'ANSWER_FAILED'}\n`);
  }
  if (contexts.length > 0) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: capContext(contexts.join('\n\n')) } })}\n`);
}
