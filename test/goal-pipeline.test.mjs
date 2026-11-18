import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { answerGoalPrompt, goalTurnEnd, readGoalOwner, sweepGoal } from '../.grok/hooks/lit-goal.mjs';
import { GOAL_MAX_CHARS, GOAL_STATUS, compileCondition, conditionHash, consentAnswer, falsify, lintCondition, parseDoneWhen } from '../.grok/skills/lit-plan/scripts/goal-condition.mjs';
import { proposeGoal } from '../.grok/skills/lit-plan/scripts/goal-propose.mjs';
import { buildPlanSkeleton } from '../.grok/skills/lit-plan/scripts/scaffold-plan.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skills = join(root, '.grok', 'skills');
const temp = realpathSync(mkdtempSync(join(tmpdir(), 'litgrok-goal-')));
after(() => rmSync(temp, { recursive: true, force: true }));

const PLAN = '# Cache\n\n## Todos\n- [x] 1. Scope\n- [ ] 2. Build\n\n## Done when\n- check: `npm test`\n';
let counter = 0;
const project = (plan = PLAN) => {
  const cwd = join(temp, `p${counter++}`);
  mkdirSync(join(cwd, 'plans'), { recursive: true });
  writeFileSync(join(cwd, 'plans', 'cache.md'), plan);
  return cwd;
};
const failing = () => ({ status: 1 });
const passing = () => ({ status: 0 });

describe('Done when compiler and lint', () => {
  it('compiles one condition bound to the plan and the check', () => {
    const done = parseDoneWhen(PLAN);
    assert.deepEqual(done, { ok: true, check: 'npm test' });
    const built = compileCondition({ plan: 'plans/cache.md', check: done.check });
    assert.match(built.condition, /^Every row in plans\/cache\.md is ticked and `npm test` exits 0 \[lit:[0-9a-f]{8}\]$/u);
    assert.equal(compileCondition({ plan: 'plans/cache.md', check: 'npm test' }).condition, built.condition, 'deterministic');
  });

  it('rejects a missing block, a placeholder, judgment words, outward-only success and an over-long condition', () => {
    assert.equal(parseDoneWhen('# x\n').ok, false);
    assert.match(parseDoneWhen(buildPlanSkeleton('demo')).reason, /placeholder/u, 'the scaffold ships a placeholder');
    assert.match(lintCondition('c', 'npm test works').reasons.join(), /judgment words/u);
    assert.match(lintCondition('c', 'node check.mjs 잘 동작').reasons.join(), /judgment words/u);
    assert.match(lintCondition('c', 'git push origin main').reasons.join(), /push, publish or release/u);
    assert.match(lintCondition('c', 'curl https://example.com').reasons.join(), /not an allowlisted/u);
    assert.match(lintCondition('x'.repeat(GOAL_MAX_CHARS + 1), 'npm test').reasons.join(), /over 500/u);
    assert.equal(compileCondition({ plan: `plans/${'a'.repeat(480)}.md`, check: 'npm test' }).ok, false);
    assert.deepEqual(lintCondition('c', 'npm run check:version').reasons, []);
  });

  it('the falsifier needs the condition to be false now and the check to run', () => {
    const args = { cwd: temp, plan: 'plans/cache.md', check: 'npm test' };
    assert.equal(falsify({ ...args, planText: PLAN, run: passing }).ok, true, 'an unticked row keeps it false');
    assert.match(falsify({ ...args, planText: PLAN.replace('- [ ] 2.', '- [x] 2.'), run: passing }).reason, /already true/u);
    assert.match(falsify({ ...args, planText: PLAN, run: () => ({ error: { code: 'ETIMEDOUT' } }) }).reason, /did not finish/u);
    assert.match(falsify({ ...args, planText: PLAN, run: () => ({ error: { code: 'ENOENT' } }) }).reason, /cannot run here/u);
  });
});

describe('goal-propose and consent', () => {
  it('prints the consent question and records its hash', () => {
    const cwd = project();
    const { line, consent } = proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing });
    assert.equal(line, GOAL_STATUS.asked(consent.condition));
    assert.match(line, /^Approve plan, start work and set goal: \/goal Every row in plans\/cache\.md is ticked and `npm test` exits 0 \[lit:[0-9a-f]{8}\]\? \(yes \/ edit \/ no\)$/u);
    const saved = JSON.parse(readFileSync(join(cwd, '.grok', 'litgrok', 'goal', 'consent.json'), 'utf8'));
    assert.equal(saved.hash, conditionHash(saved.condition));
    assert.equal(readFileSync(join(cwd, '.grok', 'litgrok', '.gitignore'), 'utf8'), '*\n');
  });

  it('without a settable goal it still asks to approve and start, with the one reason line', () => {
    const cwd = project('# Cache\n\n## Todos\n- [ ] 1. Build\n');
    const { line, consent } = proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing });
    assert.equal(line, 'Approve plan and start work? (yes / no)\nNo goal set: the plan has no `## Done when` block');
    assert.equal(consent.condition, null);
    assert.equal(consent.hash, conditionHash('start plans/cache.md'));
    const already = project(PLAN.replace('- [ ] 2.', '- [x] 2.'));
    assert.match(proposeGoal({ cwd: already, planArg: 'plans/cache.md', run: () => ({ status: 0 }) }).line, /^Approve plan and start work\? \(yes \/ no\)\nNo goal set: /u, 'a refused falsifier still offers the start');
  });

  it('says why no goal is set, and a goal: never plan never gets one', () => {
    const never = project(`goal: never\n${PLAN}`);
    assert.match(proposeGoal({ cwd: never, planArg: 'plans/cache.md', run: failing }).line, /^No goal set: this plan is marked goal: never$/u);
    assert.equal(existsSync(join(never, '.grok', 'litgrok', 'goal', 'consent.json')), false, 'a read-only plan is never offered a start');
    assert.equal(answerGoalPrompt({ workspaceRoot: never, sessionId: 's1', prompt: 'yes' }).did, 'none');
    assert.match(proposeGoal({ cwd: project(), planArg: '../x.md', run: failing }).line, /^No goal set: /u);
    const cwd = project();
    mkdirSync(join(cwd, '.grok', 'litgrok'), { recursive: true });
    symlinkSync(temp, join(cwd, '.grok', 'litgrok', 'goal'));
    assert.match(proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing }).line, /not a plain directory/u);
  });

  it('only an exact yes to a live question arms; edit keeps it; no and stale answers set nothing', () => {
    assert.equal(consentAnswer(' Yes '), 'yes');
    assert.equal(consentAnswer('yes please'), null);
    assert.equal(consentAnswer('ㅇㅇ'), null);
    const now = Date.now();
    const cwd = project();
    proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing, now });
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'sure', now }).did, 'none');
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'edit', now }).did, 'edit');
    assert.equal(readGoalOwner(cwd), null);
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', now: now + 31 * 60_000 }).did, 'none', 'a stale question');
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', now }).did, 'started-armed');
    assert.equal(readGoalOwner(cwd).sessionId, 's1');
    assert.equal(existsSync(join(cwd, '.grok', 'litgrok', 'goal', 'consent.json')), false, 'a question is answered once');
    const declined = project();
    proposeGoal({ cwd: declined, planArg: 'plans/cache.md', run: failing, now });
    assert.equal(answerGoalPrompt({ workspaceRoot: declined, sessionId: 's1', prompt: 'no', now }).did, 'declined');
    assert.equal(readGoalOwner(declined), null);
  });

  it('a tampered consent record is not live', () => {
    const now = Date.now();
    const cwd = project();
    proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing, now });
    const path = join(cwd, '.grok', 'litgrok', 'goal', 'consent.json');
    const consent = JSON.parse(readFileSync(path, 'utf8'));
    writeFileSync(path, JSON.stringify({ ...consent, condition: `${consent.condition} or anything` }));
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', now }).did, 'none');
  });
});

describe('yes starts start-work and arms the goal in one step', () => {
  const ledgerOf = (cwd, id) => {
    mkdirSync(join(cwd, '.grok', 'litgrok', 'session-ledger'), { recursive: true });
    return join(cwd, '.grok', 'litgrok', 'session-ledger', `${id}.jsonl`);
  };
  const answerLine = (cwd) => JSON.parse(readFileSync(join(cwd, '.grok', 'litgrok', 'goal', 'answer.json'), 'utf8')).line;

  it('an exact yes moves the row to work, arms the goal, and the Stop of that turn hands over start-work', () => {
    const now = Date.now();
    const cwd = project();
    const { consent } = proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing, now });
    const ledgerFile = ledgerOf(cwd, 's1');
    const result = answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', ledgerFile, now });
    assert.equal(result.did, 'started-armed');
    assert.equal(answerLine(cwd), GOAL_STATUS.started('plans/cache.md', consent.id, consent.condition));
    assert.equal(JSON.parse(readFileSync(ledgerFile.replace(/\.jsonl$/u, '.workflow.json'), 'utf8')).stage, 'work', 'the same row change /start-work makes');
    const owner = readGoalOwner(cwd);
    assert.equal(owner.condition, consent.condition);
    assert.ok(owner.start.at);
    const handOff = goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' });
    assert.equal(handOff.block, true);
    assert.equal(handOff.start, true);
    assert.match(handOff.reason, /^LitGrok start-work \[lit:[0-9a-f]{8}\]: the user approved plans\/cache\.md with yes\. Load the start-work skill and run that plan now/u);
    assert.equal(goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' }).block, false, 'handed over once; an open row keeps working');
  });

  it('a yes without a goal starts the work only and never holds for a goal', () => {
    const cwd = project('# Cache\n\n## Todos\n- [ ] 1. Build\n');
    proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing });
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes' }).did, 'started');
    assert.match(answerLine(cwd), /^Plan approved; start-work is running plans\/cache\.md\. No goal set: /u);
    assert.equal(goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' }).start, true);
    writeFileSync(join(cwd, 'plans', 'cache.md'), '# Cache\n\n## Todos\n- [x] 1. Build\n');
    assert.equal(goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' }).block, false, 'no goal, no goal check');
  });

  it('edit asks again, no and silence start nothing', () => {
    const cwd = project();
    proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing });
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'edit' }).did, 'edit');
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'make it faster' }).did, 'none', 'any other prompt is silence');
    assert.equal(readGoalOwner(cwd), null);
    assert.equal(existsSync(join(cwd, '.grok', 'litgrok', 'goal', 'consent.json')), true, 'the question still waits');
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'no' }).did, 'declined');
    assert.equal(readGoalOwner(cwd), null);
    assert.equal(existsSync(join(cwd, '.grok', 'litgrok', 'goal', 'answer.json')), false);
  });

  it('a refused start arms no goal and says why in one line', () => {
    const gone = project();
    proposeGoal({ cwd: gone, planArg: 'plans/cache.md', run: failing });
    rmSync(join(gone, 'plans', 'cache.md'));
    const missing = answerGoalPrompt({ workspaceRoot: gone, sessionId: 's1', prompt: 'yes' });
    assert.equal(missing.did, 'refused');
    assert.equal(missing.status, 'Not started, no goal set: plans/cache.md was not found');
    assert.equal(readGoalOwner(gone), null);
    assert.equal(answerLine(gone), missing.status);

    const busy = project();
    proposeGoal({ cwd: busy, planArg: 'plans/cache.md', run: failing });
    const other = ledgerOf(busy, 'other-session');
    writeFileSync(other.replace(/\.jsonl$/u, '.workflow.json'), JSON.stringify({ sessionId: 'other-session', stage: 'work', ended: false, updatedAt: new Date().toISOString() }));
    const refused = answerGoalPrompt({ workspaceRoot: busy, sessionId: 's1', prompt: 'yes', ledgerFile: ledgerOf(busy, 's1') });
    assert.equal(refused.did, 'refused');
    assert.match(refused.status, /^Not started, no goal set: another session's start-work is running \(session other-se\)$/u);
    assert.equal(readGoalOwner(busy), null);
    assert.equal(existsSync(join(busy, '.grok', 'litgrok', 'session-ledger', 's1.workflow.json')), false, 'the row did not move');
  });
});

describe('turn-end check, cancel and sweep', () => {
  const armed = () => {
    const now = Date.now();
    const cwd = project();
    proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing, now });
    answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', now });
    goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' });
    return cwd;
  };

  it('holds the turn once when every row is ticked, then closes the record', () => {
    const cwd = armed();
    assert.equal(goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' }).block, false, 'an open row keeps working');
    writeFileSync(join(cwd, 'plans', 'cache.md'), PLAN.replace('- [ ] 2.', '- [x] 2.'));
    assert.equal(goalTurnEnd({ workspaceRoot: cwd, sessionId: 'other' }).block, false, 'another session is never held');
    const first = goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' });
    assert.equal(first.block, true);
    assert.match(first.reason, /Run `npm test` once now/u);
    assert.match(first.reason, /Goal met and cleared \[lit:[0-9a-f]{8}\]/u);
    const second = goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' });
    assert.equal(second.block, false);
    assert.ok(readGoalOwner(cwd).closed, 'closed after the one hold');
  });

  it('lit cancel closes only this session\'s own record', () => {
    const cwd = armed();
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 'other', prompt: 'lit cancel' }).did, 'none');
    const cancelled = answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'lit cancel' });
    assert.equal(cancelled.did, 'cleared');
    assert.match(cancelled.status, /^LitGrok goal cleared \(lit cancel\) \[lit:[0-9a-f]{8}\]$/u);
  });

  it('a new session closes a record a crashed session left armed', () => {
    const cwd = armed();
    assert.equal(sweepGoal({ workspaceRoot: cwd, sessionId: 's1' }).did, 'none', 'its own session keeps it');
    assert.equal(sweepGoal({ workspaceRoot: cwd, sessionId: 's2' }).did, 'swept');
    assert.match(readGoalOwner(cwd).closed.why, /session ended/u);
  });

  it('the installed hooks arm on yes and hold the turn through the real Stop command', () => {
    const cwd = project();
    proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing });
    const hook = (name, event) => spawnSync(process.execPath, [join(root, '.grok', 'hooks', name)], {
      cwd,
      encoding: 'utf8',
      input: JSON.stringify({ sessionId: 'hook-s', cwd, workspaceRoot: cwd, ...event }),
      env: { PATH: process.env.PATH, HOME: join(temp, 'home'), TMPDIR: join(temp, 'tmp'), GROK_HOOK_EVENT: event.hookEventName, GROK_HOOK_NAME: name.replace(/\.mjs$/u, ''), GROK_SESSION_ID: 'hook-s', GROK_WORKSPACE_ROOT: cwd },
    });
    mkdirSync(join(temp, 'tmp'), { recursive: true });
    const prompt = hook('user-prompt-submit.mjs', { hookEventName: 'UserPromptSubmit', prompt: 'yes' });
    assert.equal(prompt.status, 0, prompt.stderr);
    assert.equal(prompt.stdout, '', 'the prompt hook prints nothing');
    assert.equal(readGoalOwner(cwd)?.sessionId, 'hook-s');
    const last = (run) => JSON.parse(run.stdout.trim().split('\n').at(-1));
    const handOff = hook('stop.mjs', { hookEventName: 'Stop' });
    assert.equal(handOff.status, 0, handOff.stderr);
    assert.equal(last(handOff).decision, 'block');
    assert.match(last(handOff).reason, /^LitGrok start-work \[lit:[0-9a-f]{8}\]/u, 'the yes turn ends with the start-work hand-off');
    writeFileSync(join(cwd, 'plans', 'cache.md'), PLAN.replace('- [ ] 2.', '- [x] 2.'));
    const stop = hook('stop.mjs', { hookEventName: 'Stop' });
    assert.equal(stop.status, 0, stop.stderr);
    const decision = last(stop);
    assert.equal(decision.decision, 'block');
    assert.match(decision.reason, /LitGrok goal \[lit:[0-9a-f]{8}\]/u);
  });
});

describe('goal wording across the payload', () => {
  const readOnly = ['lit-adhd', 'lit-brainstorm', 'ultra-brainstorm', 'lit-comprehend', 'lit-handoff', 'review-work', 'litresearch', 'lit-crucible'];

  it('read-only skills carry goal: never in their frontmatter', () => {
    for (const id of readOnly) {
      const head = /^---\n([\s\S]*?)\n---/u.exec(readFileSync(join(skills, id, 'SKILL.md'), 'utf8'))[1];
      assert.match(head, /^goal: never$/mu, id);
    }
  });

  it('lit-plan asks once at approval with the fixed lines', () => {
    const plan = readFileSync(join(skills, 'lit-plan', 'SKILL.md'), 'utf8');
    for (const line of ['Approve plan, start work and set goal: /goal <condition>? (yes / edit / no)', 'Approve plan and start work? (yes / no)', 'No goal set: <reason>', '.grok/litgrok/goal/answer.json', 'Not started: the approval was not recorded. Type /start-work <plan> to run it.', 'Your own goal is active; LitGrok left it alone.', 'Goal met and cleared [lit:<id>]', 'LitGrok goal cleared (lit cancel) [lit:<id>]']) {
      assert.ok(plan.includes(line), line);
    }
  });

  it('no skill says to call a goal tool "if available"', () => {
    const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(join(dir, entry.name)) : entry.name.endsWith('.md') ? [join(dir, entry.name)] : []));
    for (const file of [...walk(skills), join(root, '.grok', 'rules', '00-litgrok.md')]) {
      const text = readFileSync(file, 'utf8');
      assert.doesNotMatch(text, /(?:get|create|update)_goal[^\n]*if (?:it is )?available|may offer native \/goal/iu, file);
    }
  });
});
