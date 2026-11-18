import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { EXTENSION_IDS, EXTENSIONS_USAGE } from '../bin/extensions.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rule = readFileSync(join(root, '.grok', 'rules', '00-litgrok.md'), 'utf8');
const section = () => {
  const match = /## Skill plans\n([\s\S]*?)\n## /u.exec(rule);
  assert.ok(match, 'the rule has a Skill plans section');
  return match[1];
};

// Grok Build drops an allowing prompt hook's output, so the plan rides on the always-loaded rule.
test('the skill plan collects every matching route, keeps the first as primary and caps at three', () => {
  const text = section();
  assert.match(text, /Collect every section below whose trigger matches, in this file's order/u);
  assert.match(text, /keep at most three/u);
  assert.match(text, /The first match is the primary; the others are companions to confirm or drop/u);
  assert.match(text, /a plain prompt keeps one skill and no plan line/u);
  assert.match(text, /Quoted or fenced text adds nothing/u);
  assert.match(text, /`Skill plan: 1 <primary> \(primary\) → 2 <id> → 3 <id>`/u);
  assert.ok(rule.indexOf('## Skill plans') < rule.indexOf('## New film selection'), 'the plan comes before the sections it collects');
});

test('lit-crucible joins large or risky design asks in English and Korean, never as primary', () => {
  const text = section();
  assert.match(text, /`lit-crucible` joins as first companion, never primary/u);
  for (const cue of ['redesign', 'architecture', 'migration', '설계', '재설계', 'three or more deliverables']) assert.ok(text.includes(cue), cue);
});

test('read-only primaries take only read-only companions, and those skills never set a goal', () => {
  const text = section();
  const list = /Read-only primaries \(([^)]+)\)/u.exec(text)[1].split(/,\s*/u);
  assert.deepEqual(list, ['lit-adhd', 'review-work', 'litresearch', 'lit-brainstorm', 'ultra-brainstorm']);
  for (const id of list) assert.match(readFileSync(join(root, '.grok', 'skills', id, 'SKILL.md'), 'utf8'), /^goal: never$/mu, id);
});

test('an extension skill is offered only when listed, otherwise with its real install line', () => {
  const text = section();
  assert.match(text, /Name a moved skill `<id>:<id>` only when this session lists it/u);
  assert.match(text, /`<id> \(not installed: litgrok extensions install <id> --yes\)` once/u);
  assert.match(String(EXTENSIONS_USAGE), /litgrok extensions install <id\.\.\.>[^\n]*\[--yes\]/u, 'the install line matches the real command');
});

test('the lit +alias escape hatch names real skills only', () => {
  const text = section();
  assert.match(text, /`lit \+<alias> … <task>` fixes the plan: exactly those skills in that order/u);
  const aliases = /Aliases: ([^\n]+)\./u.exec(text)[1].split('; ');
  const ids = new Set();
  for (const pair of aliases) {
    const words = pair.split(/,?\s+/u);
    const id = words.at(-1);
    ids.add(id);
    assert.ok(existsSync(join(root, '.grok', 'skills', id, 'SKILL.md')), `${pair}: ${id} is a shipped skill`);
  }
  for (const id of EXTENSION_IDS) assert.ok(ids.has(id), `${id} has an alias`);
  assert.ok(ids.has('ultra-brainstorm') && ids.has('lit-crucible'));
});

test('the plan is labelled advisory, never a hook route', () => {
  assert.match(section(), /This plan is advisory: Grok Build drops the prompt hook's output, so no hook builds or checks it\./u);
});
