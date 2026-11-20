import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { answerGoalPrompt, goalTurnEnd, loopGoalNotice, offerLoopGoal, readGoalOwner, sweepGoal } from '../.grok/hooks/lit-goal.mjs';
import { entryFromPrompt } from '../.grok/hooks/workflow-stage.mjs';
import { GOAL_MAX_CHARS, GOAL_STATUS, compileCondition, conditionHash, consentAnswer, falsify, lintCondition, parseDoneWhen } from '../.grok/skills/lit-plan/scripts/goal-condition.mjs';
import { LOOP_STATUS, compileLoopCondition, detectCheck, falsifyLoop, normalizeGoalObjective, proposeLoopGoal } from '../.grok/hooks/lit-loop-goal.mjs';
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
    assert.match(lintCondition('c', 'git pu' + 'sh origin main').reasons.join(), /push, publish or release/u);
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

describe('lit run: one yes arms a goal without a plan', () => {
  const GOAL = (cwd) => join(cwd, '.grok', 'litgrok', 'goal');
  const goalFiles = (cwd) => (existsSync(GOAL(cwd)) ? readdirSync(GOAL(cwd)).filter((name) => !name.endsWith('.tmp')).sort() : []);
  const readGoal = (cwd, name) => JSON.parse(readFileSync(join(GOAL(cwd), name), 'utf8'));
  const loopProject = (script = 'node -e "process.exit(1)"', manifest = 'package.json') => {
    const cwd = join(temp, `loop${counter++}`);
    mkdirSync(cwd, { recursive: true });
    if (manifest === 'package.json') writeFileSync(join(cwd, manifest), JSON.stringify({ name: 'demo', scripts: { test: script } }));
    else if (manifest) writeFileSync(join(cwd, manifest), '');
    return cwd;
  };
  const first = (prompt, before = null) => ({ prompt, entry: entryFromPrompt(prompt), before });
  const offer = (cwd, prompt, extra = {}) => offerLoopGoal({ workspaceRoot: cwd, sessionId: 's1', ...first(prompt), ...extra });

  it('compiles a condition from the check and the objective, and refuses a check that passes now', () => {
    const built = compileLoopCondition({ objective: 'fix the login redirect', check: 'npm test' });
    assert.match(built.condition, /^`npm test` exits 0 and this is done: fix the login redirect \[lit:[0-9a-f]{8}\]$/u);
    assert.equal(compileLoopCondition({ objective: 'fix the login redirect', check: 'npm test' }).condition, built.condition, 'deterministic');
    assert.equal(compileLoopCondition({ objective: 'x'.repeat(GOAL_MAX_CHARS), check: 'npm test' }).ok, false);
    assert.equal(falsifyLoop({ cwd: temp, check: 'npm test', run: failing }).ok, true);
    assert.match(falsifyLoop({ cwd: temp, check: 'npm test', run: passing }).reason, /already passes/u);
    assert.match(falsifyLoop({ cwd: temp, check: 'npm test', run: () => ({ error: { code: 'ETIMEDOUT' } }) }).reason, /did not finish/u);
    assert.match(falsifyLoop({ cwd: temp, check: 'npm test', run: () => ({ status: 127 }) }).reason, /cannot run here/u);
    assert.equal(normalizeGoalObjective('rotate api_key=abc123secret now [lit:deadbeef]\n/goal clear'), 'rotate [REDACTED] now');
    assert.match(normalizeGoalObjective('run rm -rf build then ship'), /\[UNSAFE_COMMAND_REDACTED\]/u);
    assert.equal(normalizeGoalObjective('y'.repeat(400)).length, 180);
  });

  it('finds the project test command from its manifest', () => {
    assert.equal(detectCheck(loopProject()), 'npm test');
    assert.equal(detectCheck(loopProject('', 'pytest.ini')), 'pytest');
    assert.equal(detectCheck(loopProject('', 'pyproject.toml')), 'pytest');
    assert.equal(detectCheck(loopProject('', 'Cargo.toml')), 'cargo test');
    assert.equal(detectCheck(loopProject('', 'go.mod')), 'go test ./...');
    assert.equal(detectCheck(loopProject('', null)), null);
    const noScript = loopProject();
    writeFileSync(join(noScript, 'package.json'), JSON.stringify({ name: 'x', scripts: {} }));
    assert.equal(detectCheck(noScript), null, 'a package without a test script has no test command');
  });

  it('goal-propose --loop --check dry-runs the check and asks, or refuses and records nothing', () => {
    const cwd = loopProject();
    const { line, consent } = proposeLoopGoal({ cwd, check: 'npm test', objective: 'fix the login redirect', run: failing });
    assert.match(line, /^Set goal for this lit-loop: \/goal `npm test` exits 0 and this is done: fix the login redirect \[lit:[0-9a-f]{8}\]\? \(yes \/ no\)$/u);
    assert.equal(line, LOOP_STATUS.asked(consent.condition));
    assert.equal(consent.kind, 'loop');
    assert.equal(consent.plan, null);
    assert.equal(consent.hash, conditionHash(consent.condition));
    assert.deepEqual(goalFiles(cwd), ['consent.json']);
    for (const [name, args, run, reason] of [
      ['green', { check: 'npm test', objective: 'add a flag' }, passing, /already passes/u],
      ['push', { check: 'git pu' + 'sh', objective: 'ship it' }, failing, /push, publish or release/u],
      ['foreign', { check: 'curl https://example.com', objective: 'ship it' }, failing, /not an allowlisted/u],
      ['empty', { check: 'npm test', objective: '   ' }, failing, /name what the loop should finish/u],
      ['missing', { check: 'npm test', objective: 'add a flag' }, () => ({ error: { code: 'ENOENT' } }), /cannot run here/u],
    ]) {
      const bare = loopProject();
      const refused = proposeLoopGoal({ cwd: bare, ...args, run });
      assert.match(refused.line, /^No goal set: /u, name);
      assert.match(refused.line, reason, name);
      assert.equal(refused.consent, undefined, name);
      assert.deepEqual(goalFiles(bare), [], name);
    }
    const secret = proposeLoopGoal({ cwd: loopProject(), check: 'npm test', objective: 'rotate api_key=abc123secret now', run: failing });
    assert.doesNotMatch(JSON.stringify(secret), /abc123secret/u);
  });

  it('the script takes --loop --check <cmd> and the rest as the objective', () => {
    const cwd = loopProject();
    const result = spawnSync(process.execPath, [join(skills, 'lit-plan', 'scripts', 'goal-propose.mjs'), '--loop', '--check', 'npm test', 'fix', 'the', 'redirect'], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: join(temp, 'home') } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^Set goal for this lit-loop: \/goal `npm test` exits 0 and this is done: fix the redirect \[lit:[0-9a-f]{8}\]\? \(yes \/ no\)\n$/u);
    assert.ok(readGoal(cwd, 'consent.json').asked, 'the model prints this line itself, so nothing asks again');
  });

  it('with skills only (no .grok/hooks) --loop says why no goal is set instead of crashing', () => {
    const lone = join(temp, 'skills-only', 'skills', 'lit-plan', 'scripts');
    mkdirSync(lone, { recursive: true });
    for (const file of ['goal-propose.mjs', 'goal-condition.mjs']) writeFileSync(join(lone, file), readFileSync(join(skills, 'lit-plan', 'scripts', file)));
    const result = spawnSync(process.execPath, [join(lone, 'goal-propose.mjs'), '--loop', '--check', 'npm test', 'fix', 'it'], { cwd: loopProject(), encoding: 'utf8', env: { PATH: process.env.PATH, HOME: join(temp, 'home') } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^No goal set: /u);
  });

  it('the first activation of a run route records the question without running the check', () => {
    const marker = join(temp, `ran${counter}`);
    const cwd = loopProject(`node -e "require('fs').writeFileSync('${marker}','1');process.exit(1)"`);
    const result = offer(cwd, 'lit fix the login redirect');
    assert.equal(result.did, 'asked');
    assert.equal(result.line, LOOP_STATUS.asked(result.condition));
    assert.match(result.condition, /^`npm test` exits 0 and this is done: fix the login redirect \[lit:[0-9a-f]{8}\]$/u);
    const consent = readGoal(cwd, 'consent.json');
    assert.equal(consent.kind, 'loop');
    assert.equal(consent.plan, null);
    assert.equal(consent.sessionId, 's1');
    assert.equal(consent.condition, result.condition);
    assert.equal(consent.asked, undefined, 'the hook cannot show it; the next tool call or the Stop does');
    assert.equal(existsSync(marker), false, 'no test run in the hook');
    assert.match(offer(loopProject(), 'litwork add a flag').condition, /this is done: add a flag \[lit:/u);
    assert.match(offer(loopProject(), 'lit loop add a flag').condition, /this is done: add a flag \[lit:/u);
    assert.match(offer(loopProject(), 'lit new add a flag', { before: { stage: 'work' } }).condition, /this is done: add a flag \[lit:/u, 'a restart is a fresh first activation');
    assert.match(offer(loopProject(), 'lit add a flag', { before: { stage: 'done' } }).condition, /this is done: add a flag \[lit:/u);
  });

  it('asks nothing for a repeat, a named discipline, no test command, no objective, or an owned or pending goal', () => {
    const none = (cwd, prompt, extra) => assert.equal(offer(cwd, prompt, extra).did, 'none', prompt);
    none(loopProject(), 'lit also the lexer', { before: { stage: 'work' } });
    none(loopProject(), 'lit also the lexer', { before: { stage: 'plan' } });
    for (const prompt of ['lit plan a cache', 'lit-plan a cache', 'lit review work', 'lit cancel', 'lit start plans/x.md', 'lit adhd', 'lit team ship it', 'lit goal ship it', 'lit brainstorm names', 'lit', 'lit   ', 'start-work plans/x.md', 'please lit fix it', 'yes']) none(loopProject(), prompt);
    none(loopProject('', null), 'lit fix the login redirect');
    none(loopProject('', 'Cargo.toml'), 'lit fix the login redirect', { sessionId: '' });
    none(loopProject('', 'Cargo.toml'), 'litwork fix', { entry: null });
    const owned = loopProject();
    mkdirSync(GOAL(owned), { recursive: true });
    writeFileSync(join(GOAL(owned), 'owner.json'), JSON.stringify({ condition: 'c', plan: 'plans/x.md', hash: conditionHash('c'), id: 'a', sessionId: 's9' }));
    none(owned, 'lit fix the login redirect');
    const pending = loopProject();
    proposeGoal({ cwd: pending, planArg: 'plans/none.md' });
    assert.equal(offer(pending, 'lit fix the login redirect').did, 'asked', 'a plan that never existed leaves no question behind');
    const twice = loopProject();
    assert.equal(offer(twice, 'lit fix the login redirect').did, 'asked');
    none(twice, 'lit fix the login redirect again', { before: { stage: 'work' } });
    const fenced = loopProject();
    none(fenced, '```\nlit fix the login redirect\n```');
  });

  it('only an exact yes arms it; no, edit and any other prompt drop the question; nothing starts', () => {
    const now = Date.now();
    const cwd = loopProject();
    const { condition } = offer(cwd, 'lit fix the login redirect', { now });
    const ledgerFile = join(cwd, '.grok', 'litgrok', 'session-ledger', 's1.jsonl');
    mkdirSync(join(cwd, '.grok', 'litgrok', 'session-ledger'), { recursive: true });
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 'other', prompt: 'yes', ledgerFile, now }).did, 'none', 'another session cannot answer it');
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', ledgerFile, now: now + 31 * 60_000 }).did, 'none', 'a stale question');
    assert.equal(readGoalOwner(cwd), null);
    offer(cwd, 'lit fix the login redirect', { now });
    const yes = answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: ' YES ', ledgerFile, now });
    assert.equal(yes.did, 'loop-armed');
    assert.equal(yes.status, LOOP_STATUS.armed(yes.id, condition));
    assert.match(yes.status, /^LitGrok goal armed \[lit:[0-9a-f]{8}\]\. Grok Build takes \/goal only from you; paste: \/goal `npm test` exits 0 and this is done: fix the login redirect/u);
    assert.equal(readGoal(cwd, 'answer.json').line, yes.status);
    const owner = readGoalOwner(cwd);
    assert.equal(owner.condition, condition);
    assert.equal(owner.plan, null);
    assert.equal(owner.start, undefined, 'a lit run starts no start-work');
    assert.equal(existsSync(ledgerFile.replace(/\.jsonl$/u, '.workflow.json')), false, 'the workflow row did not move');
    assert.deepEqual(goalFiles(cwd), ['answer.json', 'owner.json'], 'the question is answered once');
    assert.equal(goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' }).start, undefined);

    for (const [prompt, did] of [['no', 'declined'], ['edit', 'none'], ['make it faster', 'none'], ['yes please', 'none']]) {
      const fresh = loopProject();
      offer(fresh, 'lit fix the login redirect', { now });
      assert.equal(answerGoalPrompt({ workspaceRoot: fresh, sessionId: 's1', prompt, now }).did, did, prompt);
      assert.equal(readGoalOwner(fresh), null, prompt);
      assert.equal(existsSync(join(GOAL(fresh), 'consent.json')), false, `${prompt} drops the question`);
    }
    const tampered = loopProject();
    offer(tampered, 'lit fix the login redirect', { now });
    const consent = readGoal(tampered, 'consent.json');
    writeFileSync(join(GOAL(tampered), 'consent.json'), JSON.stringify({ ...consent, condition: `${consent.condition} or anything` }));
    assert.equal(answerGoalPrompt({ workspaceRoot: tampered, sessionId: 's1', prompt: 'yes', now }).did, 'none');
  });

  it('a plan question is untouched by the loop rules', () => {
    const cwd = project();
    proposeGoal({ cwd, planArg: 'plans/cache.md', run: failing });
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'make it faster' }).did, 'none');
    assert.equal(existsSync(join(GOAL(cwd), 'consent.json')), true, 'silence still leaves the plan question waiting');
  });

  it('the question reaches the model once through the notice, and the yes answer once more', () => {
    const now = Date.now();
    const cwd = loopProject();
    assert.equal(loopGoalNotice({ workspaceRoot: cwd, sessionId: 's1', now }), null, 'nothing asked, nothing to say');
    const { condition } = offer(cwd, 'lit fix the login redirect', { now });
    assert.equal(loopGoalNotice({ workspaceRoot: cwd, sessionId: 'other', now }), null);
    const ask = loopGoalNotice({ workspaceRoot: cwd, sessionId: 's1', now });
    assert.equal(ask.kind, 'ask');
    assert.ok(ask.text.includes(LOOP_STATUS.asked(condition)), ask.text);
    assert.match(ask.text, /never type or send \/goal yourself/iu);
    assert.equal(loopGoalNotice({ workspaceRoot: cwd, sessionId: 's1', now }), null, 'asked once');
    answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', now });
    const armed = loopGoalNotice({ workspaceRoot: cwd, sessionId: 's1', now });
    assert.equal(armed.kind, 'armed');
    assert.ok(armed.text.includes(LOOP_STATUS.armed(readGoalOwner(cwd).id, condition)), armed.text);
    assert.equal(loopGoalNotice({ workspaceRoot: cwd, sessionId: 's1', now }), null, 'told once');
    assert.equal(goalTurnEnd({ workspaceRoot: cwd, sessionId: 's1' }).block, false, 'a loop goal has no plan rows to hold the turn for');
  });

  it('lit cancel closes the loop record and a new session sweeps a dead one', () => {
    const now = Date.now();
    const cwd = loopProject();
    offer(cwd, 'lit fix the login redirect', { now });
    answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', now });
    assert.equal(sweepGoal({ workspaceRoot: cwd, sessionId: 's1' }).did, 'none');
    assert.equal(answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'lit cancel', now }).did, 'cleared');
    assert.equal(offer(cwd, 'lit new fix another thing', { now, before: { stage: 'work' } }).did, 'asked', 'a closed record leaves room for a new question');
    answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', now });
    assert.equal(sweepGoal({ workspaceRoot: cwd, sessionId: 's2' }).did, 'swept');
  });

  it('a finished loop goal does not block the next question; another live session\'s still does', () => {
    const now = Date.now();
    const cwd = loopProject();
    offer(cwd, 'lit fix the login redirect', { now });
    answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', now });
    assert.ok(readGoalOwner(cwd) && !readGoalOwner(cwd).closed, 'armed and open');
    assert.equal(offer(cwd, 'lit new add a flag', { now, before: { stage: 'work' } }).did, 'asked', 'the same session starting a fresh run replaces its own finished goal');
    answerGoalPrompt({ workspaceRoot: cwd, sessionId: 's1', prompt: 'yes', now });
    assert.notEqual(readGoalOwner(cwd).id, undefined);
    const other = loopProject();
    offer(other, 'lit fix the login redirect', { now, sessionId: 's9' });
    answerGoalPrompt({ workspaceRoot: other, sessionId: 's9', prompt: 'yes', now });
    assert.equal(offer(other, 'lit fix the footer', { now: now + 60_000 }).did, 'none', 'another session still owns a young goal');
    assert.equal(offer(other, 'lit fix the footer', { now: now + 25 * 3_600_000 }).did, 'asked', 'a loop goal expires after 24 h');
    const plan = loopProject();
    mkdirSync(GOAL(plan), { recursive: true });
    const owner = { condition: 'c', plan: 'plans/x.md', hash: conditionHash('c'), id: 'a', sessionId: 's1', armedAt: new Date(now - 48 * 3_600_000).toISOString() };
    writeFileSync(join(GOAL(plan), 'owner.json'), JSON.stringify(owner));
    assert.equal(offer(plan, 'lit fix the login redirect', { now }).did, 'none', 'a plan owner keeps its own clearing rules');
  });

  it('the installed hooks record the question, put it before the model at the first tool call, and arm on yes', () => {
    const cwd = loopProject();
    mkdirSync(join(temp, 'tmp'), { recursive: true });
    const hook = (name, event) => spawnSync(process.execPath, [join(root, '.grok', 'hooks', name)], {
      cwd,
      encoding: 'utf8',
      input: JSON.stringify({ sessionId: 'loop-s', cwd, workspaceRoot: cwd, ...event }),
      env: { PATH: process.env.PATH, HOME: join(temp, 'home'), TMPDIR: join(temp, 'tmp'), GROK_HOOK_EVENT: event.hookEventName, GROK_HOOK_NAME: name.replace(/\.mjs$/u, ''), GROK_SESSION_ID: 'loop-s', GROK_WORKSPACE_ROOT: cwd },
    });
    const last = (run) => JSON.parse(run.stdout.trim().split('\n').at(-1));
    const prompt = hook('user-prompt-submit.mjs', { hookEventName: 'UserPromptSubmit', prompt: 'lit fix the login redirect' });
    assert.equal(prompt.status, 0, prompt.stderr);
    assert.equal(prompt.stdout, '', 'the host drops what a prompt hook prints, so it prints nothing');
    assert.deepEqual(goalFiles(cwd), ['consent.json']);
    const before = hook('pre-tool-use.mjs', { hookEventName: 'PreToolUse', toolName: 'run_terminal_cmd', toolInput: { command: 'ls' } });
    assert.equal(before.status, 0, before.stderr);
    const context = last(before).hookSpecificOutput.additionalContext;
    assert.match(context, /Set goal for this lit-loop: \/goal `npm test` exits 0 and this is done: fix the login redirect \[lit:[0-9a-f]{8}\]\? \(yes \/ no\)/u);
    assert.equal(hook('pre-tool-use.mjs', { hookEventName: 'PreToolUse', toolName: 'run_terminal_cmd', toolInput: { command: 'ls' } }).stdout, '', 'the next tool call carries nothing');
    assert.equal(hook('stop.mjs', { hookEventName: 'Stop' }).stdout, '', 'asked already, so the Stop does not hold the turn');
    const yes = hook('user-prompt-submit.mjs', { hookEventName: 'UserPromptSubmit', prompt: 'yes' });
    assert.equal(yes.status, 0, yes.stderr);
    assert.equal(readGoalOwner(cwd)?.sessionId, 'loop-s');
    const stop = hook('stop.mjs', { hookEventName: 'Stop' });
    assert.equal(stop.status, 0, stop.stderr);
    assert.equal(last(stop).decision, 'block');
    assert.match(last(stop).reason, /LitGrok goal armed \[lit:[0-9a-f]{8}\]\. Grok Build takes \/goal only from you; paste: \/goal `npm test`/u);
    assert.doesNotMatch(last(stop).reason, /start-work/u);
    assert.equal(hook('stop.mjs', { hookEventName: 'Stop' }).stdout, '', 'told once');
  });

  it('a first turn with no tool call still gets the question from the Stop hook', () => {
    const cwd = loopProject();
    mkdirSync(join(temp, 'tmp'), { recursive: true });
    const hook = (name, event) => spawnSync(process.execPath, [join(root, '.grok', 'hooks', name)], {
      cwd,
      encoding: 'utf8',
      input: JSON.stringify({ sessionId: 'loop-t', cwd, workspaceRoot: cwd, ...event }),
      env: { PATH: process.env.PATH, HOME: join(temp, 'home'), TMPDIR: join(temp, 'tmp'), GROK_HOOK_EVENT: event.hookEventName, GROK_HOOK_NAME: name.replace(/\.mjs$/u, ''), GROK_SESSION_ID: 'loop-t', GROK_WORKSPACE_ROOT: cwd },
    });
    hook('user-prompt-submit.mjs', { hookEventName: 'UserPromptSubmit', prompt: 'lit fix the login redirect' });
    const stop = hook('stop.mjs', { hookEventName: 'Stop' });
    assert.equal(JSON.parse(stop.stdout.trim().split('\n').at(-1)).decision, 'block');
    assert.match(stop.stdout, /Set goal for this lit-loop: \/goal /u);
    hook('user-prompt-submit.mjs', { hookEventName: 'UserPromptSubmit', prompt: 'lit also handle the 404' });
    assert.deepEqual(goalFiles(cwd), [], 'a repeat asks nothing and the old question was dropped');
  });

  it('litwork says how the question arrives and keeps the script fallback', () => {
    const litwork = readFileSync(join(skills, 'litwork', 'SKILL.md'), 'utf8');
    for (const line of ['Set goal for this lit-loop: /goal <condition>? (yes / no)', 'goal-propose.mjs --loop --check "<check>" <objective>', 'No goal set: <reason>', 'LitGrok goal armed [lit:<id>]. Grok Build takes /goal only from you; paste: /goal <condition>']) {
      assert.ok(litwork.includes(line), line);
    }
    assert.match(litwork, /advisory/u);
    assert.match(litwork, /starts no start-work/u);
  });
});
