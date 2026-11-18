import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = readFileSync(join(root, '.grok', 'skills', 'lit-team', 'SKILL.md'), 'utf8');

test('lit-team opens with the orchestrator purpose line', () => {
  assert.match(skill, /^Type `lit team <goal>`; this session becomes the orchestrator and runs the team for you\./mu);
  assert.match(skill, /^description: Type lit team <goal>; this session becomes the orchestrator and runs the team for you\./mu);
  assert.match(skill, /asks one question only when the goal itself is unclear/u);
});

test('the orchestrator picks one distribution per goal from the four host surfaces', () => {
  const table = skill.split('## How the orchestrator runs the team')[1].split('## Built-in types')[0];
  assert.match(table, /2-6 independent slices with separate files \| one subagent each \| `spawn_subagent` with `background: true`/u);
  assert.match(table, /many similar items, or a review or verification fan-out \| one background workflow \| the `workflow` tool/u);
  assert.match(table, /herdr panes \| only when `HERDR_ENV=1` and `herdr` is on `PATH`; otherwise subagents/u);
  assert.match(table, /edit the same files \| isolated git worktrees \| `spawn_subagent` with `isolation: "worktree"`/u);
  assert.match(table, /say it in one line/u);
});

test('the team packet, the watch loop and the hard rules stay', () => {
  assert.match(skill, /TASK, DELIVERABLE, SCOPE \(the files it owns, the cwd, its own scratch directory\) and VERIFY/u);
  assert.match(skill, /get_command_or_subagent_output/u);
  assert.match(skill, /resume it with `resume_from`/u);
  assert.match(skill, /no commits, pushes, tags or publishes/u);
  assert.match(skill, /the parent filters every child report/u);
  for (const reference of ['general-purpose-packet.md', 'explore-packet.md', 'plan-packet.md']) assert.ok(skill.includes(`references/${reference}`), reference);
});
