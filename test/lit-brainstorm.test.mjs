import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readHudRecordForCwd } from '../.grok/hooks/litgrok-hud-state.mjs';
import { entryFromPrompt, readWorkflowState, stageFromPrompt, workflowStatePath } from '../.grok/hooks/workflow-stage.mjs';
import { run } from '../bin/litgrok.mjs';

// lit-brainstorm is the open "what could we do" skill. Grok Build discards the stdout of an allowing
// UserPromptSubmit hook, so the hook cannot route a prompt: it records the discipline for the status line
// and leaves the workflow row alone, while the always-loaded rule and the skill text steer the model.

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = join(PRODUCT_ROOT, '.grok', 'skills');
const HOOK = join(PRODUCT_ROOT, '.grok', 'hooks', 'user-prompt-submit.mjs');
const SESSION = 'brainstorm-session';
const read = (...parts) => readFileSync(join(PRODUCT_ROOT, ...parts), 'utf8');
const skill = (name) => read('.grok', 'skills', name, 'SKILL.md');
const BRAINSTORM_WORDS = ['brainstorm', 'brainstorming', 'ideation', 'ideate', 'idea', 'ideas'];

function sandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-brainstorm-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  mkdirSync(workspace);
  return { root, workspace, hud: { HOME: join(root, 'home'), LITGROK_HUD_STATE_ROOT: join(root, 'state') } };
}

function ledgerFile(workspace) {
  return join(workspace, '.grok', 'litgrok', 'session-ledger', `${createHash('sha256').update(SESSION).digest('hex').slice(0, 32)}.jsonl`);
}

// One prompt through the real hook script; returns what the status line and the ledger would read afterwards.
function prompt(box, text) {
  const event = { hookEventName: 'UserPromptSubmit', sessionId: SESSION, promptId: `p-${Math.random()}`, cwd: box.workspace, workspaceRoot: box.workspace, prompt: text };
  const env = { ...process.env, ...box.hud, GROK_HOOK_EVENT: 'UserPromptSubmit', GROK_HOOK_NAME: 'user-prompt-submit', GROK_SESSION_ID: SESSION, GROK_WORKSPACE_ROOT: box.workspace };
  for (const key of ['NO_COLOR', 'CI']) delete env[key];
  const result = spawnSync(HOOK, [], { cwd: PRODUCT_ROOT, encoding: 'utf8', env, input: `${JSON.stringify(event)}\n` });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(Buffer.byteLength(result.stdout), 0, 'the prompt hook adds 0 bytes of context');
  const records = readFileSync(ledgerFile(box.workspace), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  return {
    workflow: readWorkflowState(workflowStatePath(ledgerFile(box.workspace)), SESSION),
    discipline: readHudRecordForCwd(box.workspace, { ...process.env, ...box.hud })?.discipline ?? null,
    record: records.at(-1),
  };
}

test('lit brainstorm, ideation and idea open lit-brainstorm: the status row names it and the workflow row stays put', (t) => {
  const prompts = [
    'lit brainstorm a name for my app',
    'lit ideation for the onboarding flow',
    'lit idea',
    'lit ideate on pricing',
    'lit ideas for a team offsite',
    'lit brainstorming: how to cut the release time',
    '/lit brainstorm a name',
    'Lit Brainstorm: names',
    '/lit-brainstorm a name for my app',
    'lit brainstorm plan the sprint and interview the users',
  ];
  for (const text of prompts) {
    const fresh = sandbox(t);
    const after = prompt(fresh, text);
    assert.equal(after.discipline, 'lit-brainstorm', `${text}: the status row shows lit-brainstorm`);
    assert.equal(after.workflow?.stage ?? null, null, `${text}: a fresh session shows no workflow stage`);
    assert.equal('stage' in after.record, false, `${text}: the ledger names no stage`);
    assert.equal('discipline' in after.record, false, `${text}: the plan gate is not armed`);

    const running = sandbox(t);
    assert.equal(prompt(running, 'review-work').workflow.stage, 'review');
    const during = prompt(running, text);
    assert.equal(during.workflow.stage, 'review', `${text}: a running stage is not replaced`);
    assert.deepEqual(during.workflow.visited, ['review']);
  }
});

test('the route words reach only lit-brainstorm, and the neighbouring routes keep their meaning', (t) => {
  for (const word of BRAINSTORM_WORDS) {
    assert.equal(entryFromPrompt(`lit ${word} a name`)?.discipline, 'lit-brainstorm', word);
    assert.equal(stageFromPrompt(`lit ${word} a name`), null, `${word} sets no stage`);
  }
  assert.equal(stageFromPrompt('/lit-brainstorm plan it with start-work'), null, 'a later skill name in the text is not the route');
  // Unchanged routes.
  assert.equal(stageFromPrompt('lit plan the cache rewrite'), 'plan');
  assert.equal(entryFromPrompt('lit plan the cache rewrite').discipline, 'lit-plan');
  assert.equal(stageFromPrompt('deep-interview the parser idea'), 'interview');
  assert.equal(stageFromPrompt('lit interview the parser'), 'work', 'lit interview was never a route of its own');
  assert.equal(stageFromPrompt('lit fix the parser idea'), 'work');
  // Words that only start with a route word, and mentions inside text, are no route.
  for (const text of ['lit ideal gas law fix', 'lit idea-board fix', 'lit brainstormer fix', 'please lit brainstorm this', 'the lit idea was late', '```\nlit brainstorm X\n```\nwhat is this?']) {
    assert.notEqual(entryFromPrompt(text)?.discipline, 'lit-brainstorm', `${text} is no brainstorm route`);
  }
  const box = sandbox(t);
  assert.equal(prompt(box, 'lit plan the cache rewrite').discipline, 'lit-plan');
  assert.equal(prompt(box, 'lit brainstorm a name').discipline, 'lit-brainstorm');
  assert.equal(prompt(box, 'lit continue').discipline, 'lit-brainstorm', 'a bare lit continues the last explicitly selected discipline');
});

test('review routes select the review-work discipline so the lanes look switches on', (t) => {
  // BRIEF-mod-looks item 1 changed this contract on purpose: every route that runs review-work
  // must select its look, like the lit-adhd route fix before it.
  for (const text of ['lit review plan plans/shout.md', 'lit review work', 'lit review', '/lit review the diff']) {
    assert.deepEqual(entryFromPrompt(text), { stage: 'review', entry: 'switch', discipline: 'review-work' }, text);
    const box = sandbox(t);
    const after = prompt(box, text);
    assert.equal(after.workflow.stage, 'review', text);
    assert.equal(after.discipline, 'review-work', `${text}: the lanes look`);
  }
  for (const text of ['review-work plans/shout.md', '/review-work']) {
    assert.equal(stageFromPrompt(text), 'review', text);
    const box = sandbox(t);
    assert.equal(prompt(box, text).discipline, 'review-work', `${text}: the lanes look`);
  }
  assert.equal(stageFromPrompt('lit reviewing the notes'), 'work', 'a longer word is no route');
});

test('the always-loaded rule teaches the brainstorm route in a few bytes and keeps the others', () => {
  const rule = read('.grok', 'rules', '00-litgrok.md');
  const line = rule.split('\n').find((text) => text.includes('lit-brainstorm'));
  assert.ok(line, 'the rule names lit-brainstorm');
  for (const word of BRAINSTORM_WORDS) assert.match(line, new RegExp(`\\b${word}\\b`), `the rule line names ${word}`);
  assert.match(line, /deep-interview/u);
  assert.match(line, /lit-plan/u);
  assert.match(line, /Office and film routes/u, 'the brainstorm words win over the Office and film selections that come later in the rule');
  assert.ok(Buffer.byteLength(line) <= 220, 'the rule line stays short; the depth lives in the skill');
  assert.match(rule, /`review-work`, `lit review plan\|work`\) switches/u);
  assert.match(rule, /A named discipline \(`lit plan`/u);
});

test('lit-brainstorm is a divergent-then-convergent skill that hands off and never implements', () => {
  const text = skill('lit-brainstorm');
  assert.match(text, /^name: lit-brainstorm$/mu);
  assert.ok(Buffer.byteLength(text) >= 9000, 'a dense skill, not a stub');
  for (const word of BRAINSTORM_WORDS) assert.match(text, new RegExp(`\`${word}\``), `route word ${word}`);
  assert.match(text, /\/lit-brainstorm <topic>/u);
  assert.match(text, /lit brainstorm a name for my app/u);
  for (const heading of ['Frame', 'Diverge', 'Cluster and dedupe', 'Score', 'Converge', 'Pick', 'Hand off']) {
    assert.match(text, new RegExp(`^### \\d\\. ${heading}$`, 'mu'), `phase ${heading}`);
  }
  for (const target of ['deep-interview', 'lit-plan', 'lit-crucible', 'litresearch']) assert.match(text, new RegExp(`\`${target}\``, 'u'), `compares with ${target}`);
  assert.match(text, /explore/u);
  assert.match(text, /never implements/u);
  assert.match(text, /\.grok\/litgrok\/brainstorm\/<slug>\.md/u);
  assert.match(text, /status line shows `lit-brainstorm`/u);
  assert.match(text, /never say a hook routed the prompt/u);
  assert.match(text, /^Outside Grok Build \(Grok Bot, Cursor\):[^\n]*`litgrok` skill/mu);
});

test('deep-interview, lit-plan and lit-crucible send open brainstorming to lit-brainstorm', () => {
  assert.match(skill('deep-interview'), /open brainstorming[^\n]*`lit-brainstorm`/u);
  assert.match(skill('lit-plan'), /open "what could we do"[^\n]*`lit-brainstorm`/u);
});

test('litgoal sets and keeps the finish line and its route name equals its skill name', () => {
  const text = skill('litgoal');
  assert.match(text, /litgoal sets and keeps the finish line; litwork and start-work run toward it\./u);
  assert.match(text, /^name: litgoal$/mu);
  assert.match(text, /\/litgoal/u);
  assert.match(read('docs', 'skills.md'), /<code>litgoal<\/code><br \/><sub><code>\/litgoal /u);
  assert.match(text, /LitGrok stores no goal record/u, 'the real mechanics stay honest: no ledger, no runtime');
  assert.match(text, /\/goal <objective>/u);
});

test('review-work names plan review and work review, auto-picks from what exists, and can be forced', () => {
  const text = skill('review-work');
  assert.match(text, /^### Plan review$/mu);
  assert.match(text, /^### Work review$/mu);
  assert.match(text, /^### Picking the mode$/mu);
  assert.match(text, /after `lit-plan` and before `start-work`/u);
  assert.match(text, /after `litwork` or `start-work`/u);
  for (const forced of ['/review-work plan', '/review-work work', 'lit review plan', 'lit review work']) assert.ok(text.includes(forced), `forced form ${forced}`);
  assert.match(text, /named PR, diff, commit range or branch[^\n]*work review/u);
  assert.match(text, /ticked rows[^\n]*work review/u);
  assert.match(text, /no ticked rows and no diff[^\n]*plan review/u);
  assert.match(text, /neither[^\n]*ask one question/iu);
  assert.match(text, /first line of the report[^\n]*`Mode: plan review` or `Mode: work review`/u);
  assert.match(read('docs', 'skills.md'), /<code>review-work<\/code>/u);
});

test('install copies lit-brainstorm with its references into a temporary project and no other place', async (t) => {
  const box = sandbox(t);
  const sink = { isTTY: true, write() { return true; } };
  const env = { ...process.env, HOME: join(box.root, 'home') };
  delete env.CI;
  delete env.NO_COLOR;
  assert.equal(await run(['install'], { stdin: { isTTY: true }, stdout: sink, stderr: sink, cwd: box.workspace, env }), 0);
  const installed = join(box.workspace, '.grok', 'skills', 'lit-brainstorm');
  for (const file of ['SKILL.md', 'references/idea-lenses.md', 'references/converge-and-score.md', 'references/handoff-and-notes.md', 'references/idea-lane-packet.md']) {
    assert.equal(readFileSync(join(installed, file), 'utf8'), readFileSync(join(SKILLS, 'lit-brainstorm', file), 'utf8'), file);
  }
  assert.equal(existsSync(join(box.root, 'home', '.grok')), false, 'a project install writes nothing under the user home');
});

test('the manifests, the gallery and the guides list lit-brainstorm in both languages', () => {
  const catalog = JSON.parse(read('.grok-plugin', 'plugin.json')).skills;
  assert.ok(catalog.includes('./.grok/skills/lit-brainstorm'));
  const count = catalog.length;
  for (const page of ['docs/skills.md', 'docs/skills_ko-KR.md']) {
    const text = read(...page.split('/'));
    assert.match(text, /<code>lit-brainstorm<\/code><br \/><sub><code>\/lit-brainstorm &lt;topic&gt;<\/code><\/sub>/u, page);
    assert.ok(text.includes(`${count}`), `${page} states the skill count`);
  }
  for (const page of ['README.md', 'README_ko-KR.md', 'docs/guide.md', 'docs/guide_ko-KR.md']) assert.match(read(...page.split('/')), /\/lit-brainstorm/u, `${page} lists the route`);
  assert.ok(existsSync(join(PRODUCT_ROOT, 'docs', 'assets', 'skills', 'lit-brainstorm.webp')), 'one gallery snapshot');
});
