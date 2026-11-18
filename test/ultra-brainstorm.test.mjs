import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { MAX_AGENTS, RUN_CAP, costLine, estimate, launchAnswer } from '../.grok/skills/ultra-brainstorm/scripts/estimate.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillDir = join(root, '.grok', 'skills', 'ultra-brainstorm');
const read = (...parts) => readFileSync(join(...parts), 'utf8');

test('the launch question cost line counts one reducer per 30 idea agents and fits one workflow run', () => {
  // Measured on Grok Build 1.0.13 (2026-11-18): 100 idea agents used 2.48M tokens (median 21k each, with the
  // host's own first-turn prompt and a few retried calls), 4 reducers 36k-64k each, the judge 46k: 2.75M in all.
  assert.deepEqual(estimate(100), { agents: 100, reducers: 4, judges: 1, agentBudget: 105, low: 2_185_000, high: 2_910_000 });
  const measured = 2_750_540;
  assert.ok(estimate(100).low <= measured && measured <= estimate(100).high, 'the measured run sits inside the range');
  assert.match(costLine(100), /≈ 2\.2-2\.9M tokens/u);
  assert.equal(estimate(300).reducers, 10);
  assert.ok(estimate(MAX_AGENTS).agentBudget <= RUN_CAP, 'the largest run fits the host cap');
  for (const bad of [0, -1, 1.5, Number.NaN, MAX_AGENTS + 1]) assert.throws(() => estimate(bad), String(bad));
  const cli = spawnSync(process.execPath, [join(skillDir, 'scripts', 'estimate.mjs'), '300'], { encoding: 'utf8' });
  assert.equal(cli.stdout.trim(), costLine(300));
  assert.equal(spawnSync(process.execPath, [join(skillDir, 'scripts', 'estimate.mjs'), 'lots'], { encoding: 'utf8' }).status, 64);
  assert.ok(statSync(join(skillDir, 'scripts', 'estimate.mjs')).mode & 0o111, 'executable');
});

test('the launch answer is read by code, including the full option label the question dialog hands back', () => {
  // Grok Build's ask dialog returns the picked option's label, e.g. `100 (recommended minimum)`.
  for (const [reply, agents] of [['100', 100], ['100 (recommended minimum)', 100], ['(Recommended) 100 (recommended minimum)', 100],
    ['300', 300], ['300명 (Recommended)', 300], ['1,000? no, 250 agents', null], ['  42 ', 42]]) {
    const read = launchAnswer(reply);
    if (agents === null) assert.equal(read.kind, 'ask', reply);
    else assert.deepEqual(read, { kind: 'run', agents }, reply);
  }
  assert.equal(launchAnswer('100 or 300?').kind, 'ask', 'two counts are ambiguous');
  assert.equal(launchAnswer('sounds good').kind, 'ask');
  assert.equal(launchAnswer('').kind, 'stop', 'silence is no');
  for (const no of ['no', 'No.', 'cancel', 'stop', '아니', '아니요', '취소']) assert.equal(launchAnswer(no).kind, 'stop', no);
  assert.deepEqual(launchAnswer('2000'), { kind: 'split', agents: 2000 });
  const cli = spawnSync(process.execPath, [join(skillDir, 'scripts', 'estimate.mjs'), '--answer'], { input: '(Recommended) 100 (recommended minimum)', encoding: 'utf8' });
  assert.deepEqual(JSON.parse(cli.stdout), { kind: 'run', agents: 100 });
});

test('the reply reaches the parser as data through a quoted heredoc, never as a shell argument', () => {
  const skill = read(skillDir, 'SKILL.md');
  assert.match(skill, /estimate\.mjs --answer <<'LIT_REPLY_END_9Q7'\n<the reply>\nLIT_REPLY_END_9Q7\n/u, 'stdin from a quoted heredoc');
  assert.doesNotMatch(skill, /<<'REPLY'/u, 'no guessable delimiter');
  assert.match(skill, /If any line of the reply is exactly `LIT_REPLY_END_9Q7`, do not run the command: treat the reply as `ask`\./u, 'a reply holding the delimiter line never reaches the shell');
  assert.doesNotMatch(skill, /--answer ["'<]?[^<\n]*<the reply>/u, 'never on the command line');
  const cwd = mkdtempSync(join(tmpdir(), 'litgrok-ub-reply-'));
  try {
    const script = `node '${join(skillDir, 'scripts', 'estimate.mjs')}' --answer <<'LIT_REPLY_END_9Q7'\n100 $(touch x) \`touch y\`\nLIT_REPLY_END_9Q7\n`;
    const run = spawnSync('/bin/sh', ['-c', script], { cwd, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(run.stdout), { kind: 'run', agents: 100 });
    assert.equal(existsSync(join(cwd, 'x')) || existsSync(join(cwd, 'y')), false, 'nothing in the reply ran');
    for (const extra of [['100'], ['100 (recommended minimum)'], ['--json']]) {
      const refused = spawnSync(process.execPath, [join(skillDir, 'scripts', 'estimate.mjs'), '--answer', ...extra], { input: '300', encoding: 'utf8' });
      assert.equal(refused.status, 64, `the argument form is refused: ${extra}`);
      assert.equal(refused.stdout, '', 'and nothing is parsed from it');
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('the skill asks one question with the estimator line and never launches on silence', () => {
  const skill = read(skillDir, 'SKILL.md');
  assert.ok(skill.includes(costLine(100)), 'the quoted line is the estimator output');
  assert.match(skill, /ask exactly ONE question: how many idea agents to run/u);
  assert.match(skill, /\*\*100 \(recommended minimum\)\*\*, \*\*300\*\*, or a number the user types/u);
  assert.match(skill, /Silence is no\./u);
  assert.match(skill, /A plain `no` [^\n]*ends the skill at once: reply `ultra-brainstorm cancelled; nothing ran\.` and ask nothing more\./u, 'a plain no is never asked again');
  assert.match(skill, /^goal: never$/mu);
  assert.match(skill, /BLOCKED: workflow tool unavailable/u);
  assert.match(skill, /\.grok\/litgrok\/brainstorm\/<slug>\//u);
});

test('the workflow script runs cheap tool-free idea agents, reducers and one judge', () => {
  const script = read(skillDir, 'scripts', 'ultra-brainstorm.rhai');
  assert.match(script, /^let meta = #\{\n {4}name: "ultra-brainstorm",/u, 'a pure-literal meta map comes first');
  assert.match(script, /model: idea_model,\n {8}effort: "low",/u);
  assert.match(script, /Use no tools/u);
  assert.match(script, /let brief = json_encode\(topic\);/u, 'the topic reaches prompts only as quoted data');
  assert.match(script, /const PER_REDUCER = 30;/u);
  assert.match(script, /lenses\[i % lenses\.len\(\)\]/u);
  assert.match(script, /"maxItems": 5/u);
  assert.match(script, /complete\(/u);
  assert.doesNotMatch(script, /timestamp\(\)|sleep\(|exit\(/u, 'the workflow runtime refuses these');
  for (const word of ['shared', 'sync', 'async', 'await', 'spawn', 'go', 'thread', 'new', 'match', 'case', 'default', 'void', 'null', 'nil', 'static', 'var']) {
    assert.doesNotMatch(script, new RegExp(`\\blet ${word}\\b`, 'u'), `reserved word ${word}`);
  }
});

test('ships at least 30 lenses', () => {
  const lenses = read(skillDir, 'references', 'lenses.md').match(/^\d+\. /gmu);
  assert.ok(lenses.length >= 30, `${lenses.length} lenses`);
});

test('is enrolled in the manifest, the rule, the docs and the host-note list', () => {
  assert.ok(JSON.parse(read(root, '.grok-plugin', 'plugin.json')).skills.includes('./.grok/skills/ultra-brainstorm'));
  assert.match(read(root, '.grok', 'rules', '00-litgrok.md'), /`ultra-brainstorm …` or `lit ultra-brainstorm …` opens `ultra-brainstorm`/u);
  for (const doc of ['docs/skills.md', 'docs/skills_ko-KR.md', 'README.md', 'README_ko-KR.md', 'CHANGELOG.md']) assert.match(read(root, doc), /ultra-brainstorm/u, doc);
  assert.match(read(root, 'test', 'cursor-plugin.test.mjs'), /'ultra-brainstorm'/u);
});
