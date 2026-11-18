import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { answerGoalPrompt } from '../.grok/hooks/lit-goal.mjs';
import { planProgress } from '../.grok/hooks/plan-progress.mjs';
import { planPathFromPrompt } from '../.grok/hooks/workflow-stage.mjs';
import { proposeGoal } from '../.grok/skills/lit-plan/scripts/goal-propose.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'litgrok-start-plan-')));
after(() => rmSync(temp, { recursive: true, force: true }));

const DONE = '# A\n\n## Todos\n- [x] 1. Scope\n- [x] 2. Build\n';
const OPEN = '# B\n\n## Todos\n- [ ] 1. Draft\n- [ ] 2. Ship\n\n## Done when\n- check: `npm test`\n';
let counter = 0;
// Plan A is finished; plan B is open and newer, so a newest-plan guess would pick B.
const project = () => {
  const cwd = join(temp, `p${counter++}`);
  mkdirSync(join(cwd, 'plans'), { recursive: true });
  writeFileSync(join(cwd, 'plans', 'a.md'), DONE);
  writeFileSync(join(cwd, 'plans', 'b.md'), OPEN);
  const old = new Date(Date.now() - 3_600_000);
  utimesSync(join(cwd, 'plans', 'a.md'), old, old);
  return cwd;
};

describe('a start-work run records its exact plan', () => {
  it('reads the plan a start-work prompt names', () => {
    assert.equal(planPathFromPrompt('/start-work plans/a.md'), 'plans/a.md');
    assert.equal(planPathFromPrompt('lit start ./plans/a.md please'), 'plans/a.md');
    assert.equal(planPathFromPrompt('/start-work `plans/a.md`'), 'plans/a.md');
    assert.equal(planPathFromPrompt('/start-work'), null, 'an old-style start names none');
    assert.equal(planPathFromPrompt('look at plans/a.md'), null, 'not a start');
    assert.equal(planPathFromPrompt('/start-work ../plans/a.md'), null);
  });

  it('a finished plan reads finished even while a newer plan is open', () => {
    const cwd = project();
    assert.equal(planProgress(cwd).next, '1. Draft', 'the guess for old records picks the newest plan');
    assert.deepEqual(planProgress(cwd, 'plans/a.md'), { done: 2, total: 2 });
  });

  it('the hooks keep the named plan: /start-work plans/a.md stays on A at turn end', () => {
    const cwd = project();
    const hook = (name, event) => spawnSync(process.execPath, [join(root, '.grok', 'hooks', name)], {
      cwd,
      encoding: 'utf8',
      input: JSON.stringify({ sessionId: 'run-s', cwd, workspaceRoot: cwd, ...event }),
      env: { PATH: process.env.PATH, HOME: join(temp, 'home'), TMPDIR: join(temp, 'tmp'), GROK_HOOK_EVENT: event.hookEventName, GROK_HOOK_NAME: name.replace(/\.mjs$/u, ''), GROK_SESSION_ID: 'run-s', GROK_WORKSPACE_ROOT: cwd },
    });
    mkdirSync(join(temp, 'tmp'), { recursive: true });
    assert.equal(hook('user-prompt-submit.mjs', { hookEventName: 'UserPromptSubmit', prompt: '/start-work plans/a.md' }).status, 0);
    assert.equal(hook('stop.mjs', { hookEventName: 'Stop' }).status, 0);
    const ledger = join(cwd, '.grok', 'litgrok', 'session-ledger');
    const state = JSON.parse(readFileSync(join(ledger, readdirSync(ledger).find((name) => name.endsWith('.workflow.json'))), 'utf8'));
    assert.equal(state.planPath, 'plans/a.md');
    assert.deepEqual(state.plan, { done: 2, total: 2 }, 'finished, with no next row from plan B');
  });

  it('a yes records the plan it started, and another session\'s finished run never blocks a new start', () => {
    const cwd = project();
    const ledger = join(cwd, '.grok', 'litgrok', 'session-ledger');
    mkdirSync(ledger, { recursive: true });
    writeFileSync(join(ledger, 'other.workflow.json'), JSON.stringify({ sessionId: 'other-session', stage: 'work', ended: false, planPath: 'plans/a.md', updatedAt: new Date().toISOString() }));
    proposeGoal({ cwd, planArg: 'plans/b.md', run: () => ({ status: 1 }) });
    const ledgerFile = join(ledger, 'mine.jsonl');
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 'mine', prompt: 'yes', ledgerFile }).did, 'started-armed');
    assert.equal(JSON.parse(readFileSync(join(ledger, 'mine.workflow.json'), 'utf8')).planPath, 'plans/b.md');
  });
});
