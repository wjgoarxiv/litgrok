// The other sessions of this workspace, for the status line's extra rows. Each comes from that
// session's liveness record and, when it has one, its workflow snapshot; this session's own files are
// skipped. A session that is working reads `running`, one waiting at a turn end `idle`, and a finished
// start-work (its work stage closed with every plan task checked, or the done stage) `done` for one
// minute, then it leaves. An ended or stale session is not shown. Nothing here writes.

import { createHash } from 'node:crypto';
import { readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { readLiveness } from './session-liveness.mjs';
import { readWorkflowState } from './workflow-stage.mjs';

export const DONE_SHOWN_MS = 60 * 1000;
const MAX_ROWS = 4;
const STATE_ORDER = { running: 0, idle: 1, done: 2 };
const RECORD_NAME = /^[0-9a-f]{32}\.json$/u;

const keyOf = (sessionId) => createHash('sha256').update(sessionId).digest('hex').slice(0, 32);

function finished(workflow) {
  return workflow.stage === 'done'
    || (workflow.ended && workflow.stage === 'work' && workflow.plan?.total > 0 && workflow.plan.done === workflow.plan.total);
}

/** Up to four `{ label, pane, state }` rows, running first, then idle, then done; newest first within each. */
export function readOtherSessions(dirs, selfSessionId, now = Date.now()) {
  const selfName = typeof selfSessionId === 'string' && selfSessionId !== '' ? `${keyOf(selfSessionId)}.json` : null;
  for (const directory of dirs) {
    if (typeof directory !== 'string' || !isAbsolute(directory)) continue;
    let root;
    let names;
    try {
      root = realpathSync(directory);
      names = readdirSync(join(root, '.grok', 'litgrok', 'liveness'));
    } catch {
      continue;
    }
    const rows = [];
    for (const name of names) {
      if (!RECORD_NAME.test(name) || name === selfName) continue;
      const live = readLiveness(join(root, '.grok', 'litgrok', 'liveness', name), now);
      if (!live || `${keyOf(live.sessionId)}.json` !== name) continue;
      const workflow = readWorkflowState(join(root, '.grok', 'litgrok', 'session-ledger', name.replace(/\.json$/u, '.workflow.json')), live.sessionId);
      let state;
      if (workflow && finished(workflow)) {
        if (now - Date.parse(workflow.updatedAt) > DONE_SHOWN_MS) continue;
        state = 'done';
      } else if (live.state === 'alive') state = 'running';
      else if (live.state === 'idle') state = 'idle';
      else continue;
      rows.push({ label: workflow?.active ?? workflow?.stage ?? 'session', pane: live.pane, state, at: Date.parse(live.at) });
    }
    rows.sort((left, right) => STATE_ORDER[left.state] - STATE_ORDER[right.state] || right.at - left.at);
    return rows.slice(0, MAX_ROWS).map(({ at: _at, ...row }) => row);
  }
  return [];
}
