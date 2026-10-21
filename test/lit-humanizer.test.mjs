import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parseRules, scanText } from '../.grok/skills/lit-humanizer/scripts/core.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL = join(ROOT, '.grok', 'skills', 'lit-humanizer');

test('lit-humanizer is enrolled in the native plugin and always-on route', () => {
  const plugin = JSON.parse(readFileSync(join(ROOT, '.grok-plugin', 'plugin.json'), 'utf8'));
  assert.ok(plugin.skills.includes('./.grok/skills/lit-humanizer'));
  assert.ok(existsSync(join(SKILL, 'SKILL.md')));
  assert.ok(existsSync(join(SKILL, 'scripts', 'detect.mjs')));
  const rule = readFileSync(join(ROOT, '.grok', 'rules', '00-litgrok.md'), 'utf8');
  assert.match(rule, /lit-humanizer/);
  assert.match(rule, /text-naturalization[^\n]*lit-humanizer/);
  assert.match(rule, /lit-korean[^\n]*lit-humanizer/);
});

test('LitGrok detector mirrors every canonical block and warning fixture', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  const fixtures = JSON.parse(readFileSync(join(SKILL, 'fixtures', 'rule-cases.json'), 'utf8'));
  assert.equal(rules.length, 55);
  for (const rule of rules) {
    const positive = fixtures.positive[rule.id];
    const negative = fixtures.negative[rule.id];
    assert.equal(typeof positive, 'string', `${rule.id} positive fixture`);
    assert.equal(typeof negative, 'string', `${rule.id} negative fixture`);
    assert.ok(scanText(positive, [rule], `${rule.id}-positive.md`).some((hit) => hit.severity === rule.severity), `${rule.id} positive`);
    assert.equal(scanText(negative, [rule], `${rule.id}-negative.md`).length, 0, `${rule.id} negative`);
  }
});

test('LitGrok detector retains caption, quote, code, internal-path, and mixed-language boundaries', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  const sourceRules = rules.filter((rule) => ['ko-plain-meta-label', 'en-plain-meta-label'].includes(rule.id));
  assert.equal(scanText('Figure 3. Results\nSource: city dataset\n', sourceRules, 'caption.md').length, 0);
  assert.equal(scanText('> Source: quoted user text\n', sourceRules, 'quoted.md').length, 0);
  assert.equal(scanText('```text\nSource: fenced sample\n```\n', sourceRules, 'code.md').length, 0);
  assert.equal(scanText('Source: internal\n', sourceRules, 'plans/decision.md').length, 0);
  assert.equal(scanText('I hope this helps — 한국어 설명도 있습니다.', rules, 'mixed.md').length > 0, true);
});

test('LitGrok Korean metrics retain canonical golden results', async () => {
  const { analyzeKoText } = await import('../.grok/skills/lit-humanizer/scripts/ko-metrics.mjs');
  const golden = JSON.parse(readFileSync(join(SKILL, 'fixtures', 'ko-metrics-golden.json'), 'utf8'));
  for (const item of golden.cases) {
    const result = analyzeKoText(item.text);
    if (item.warning) assert.ok(result.warnings.includes(item.warning), item.id);
    if (item.absent) assert.ok(!result.warnings.includes(item.absent), item.id);
    for (const [key, minimum] of Object.entries(item.minimum ?? {})) {
      if (Array.isArray(minimum)) assert.deepEqual(result.metrics[key], minimum, `${item.id}: ${key}`);
      else assert.ok(result.metrics[key] >= minimum, `${item.id}: ${key}`);
    }
  }
});

test('standard-library extraction reads DOCX and PPTX text in document order', async () => {
  const { extractTextForFile } = await import('../.grok/skills/lit-humanizer/scripts/extract.mjs');
  const office = join(SKILL, 'fixtures', 'office');
  assert.match(extractTextForFile(join(office, 'minimal.docx')), /I hope this helps\./);
  assert.match(extractTextForFile(join(office, 'minimal.pptx')), /Source: report table 4\./);
});

test('five existing Korean agents select lit-humanizer and retain their review sequence', () => {
  const agents = ['litgrok-korean-style-analyzer.md', 'litgrok-korean-prose-editor.md', 'litgrok-meaning-preservation-auditor.md', 'litgrok-native-flow-reviewer.md', 'litgrok-polish-orchestrator.md'];
  for (const file of agents) assert.match(readFileSync(join(ROOT, '.grok', 'agents', file), 'utf8'), /lit-humanizer/);
  assert.match(readFileSync(join(ROOT, '.grok', 'agents', 'litgrok-polish-orchestrator.md'), 'utf8'), /style[ -]analyzer[\s\S]*prose-editor[\s\S]*meaning-preservation-auditor[\s\S]*native-flow-reviewer/i);
});

test('frontend motion guidance is wired from the skill read map', () => {
  const frontend = join(ROOT, '.grok', 'skills', 'frontend-ui-ux');
  assert.ok(existsSync(join(frontend, 'references', 'motion-guide.md')));
  const skill = readFileSync(join(frontend, 'SKILL.md'), 'utf8');
  assert.match(skill, /motion-guide\.md/);
});

test('frontend reference guides no longer pad to the 4 KB activation-size boundary', () => {
  const references = join(ROOT, '.grok', 'skills', 'frontend-ui-ux', 'references');
  const guides = [
    'adaptive-layout.md', 'brand-and-imagery.md', 'composition.md', 'creative-directions.md',
    'implementation-platforms.md', 'inclusive-interface.md', 'interaction-motion.md',
    'performance-delivery.md', 'product-direction.md', 'redesign-playbook.md',
    'system-foundations.md', 'visual-language.md', 'visual-reconstruction.md',
  ];
  for (const file of guides) {
    assert.ok(existsSync(join(references, file)), `${file} exists`);
    assert.ok(readFileSync(join(references, file)).byteLength < 4096, `${file} should be edited for substance, not a size cap`);
  }
});

test('comprehension template uses citations and keeps ledgers outside the deliverable', () => {
  const template = readFileSync(join(ROOT, '.grok', 'skills', 'lit-comprehend', 'references', 'artifact-template.md'), 'utf8');
  assert.match(template, /footnote or reference entry/i);
  assert.doesNotMatch(template, /^### 6\. 확인 안 된 것$/m);
  assert.doesNotMatch(template, /확인 안 된 것|신뢰도|confidence/i);
  assert.doesNotMatch(template, /data-src=/);
  assert.doesNotMatch(template, /honesty ledger|evidence table/i);
});

const PLEDGE_RULES = ['ko-negative-pledge', 'ko-negative-pledge-repeat', 'en-negative-pledge'];
const SEVERITY_RANK = { warn: 1, block: 2 };
const GUARD_TIMEOUT_MS = JSON.parse(readFileSync(join(ROOT, '.grok', 'hooks', 'deliverable-hedge-guard.json'), 'utf8')).hooks.PreToolUse[0].hooks[0].timeout * 1000;

function loadPledgeCases() {
  return JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'lit-humanizer', 'pledge-cases.json'), 'utf8'));
}

function guardVerdict(event, cwd) {
  const run = spawnSync(process.execPath, [join(ROOT, '.grok', 'hooks', 'deliverable-hedge-guard.mjs')], {
    cwd,
    encoding: 'utf8',
    input: `${JSON.stringify({ hookEventName: 'PreToolUse', sessionId: 'pledge-suite', cwd, workspaceRoot: cwd, ...event })}\n`,
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr, reply: run.stdout.trim() ? JSON.parse(run.stdout) : null };
}

test('every negative pledge hits its expected rule at its expected severity', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  const { pledges } = loadPledgeCases();
  assert.equal(pledges.length, 15);
  for (const pledge of pledges) {
    const hits = scanText(pledge.text, rules, 'pledge.md');
    if (pledge.severity === 'none') {
      assert.deepEqual(hits, [], `pledge ${pledge.n} must stay clean`);
      continue;
    }
    const top = hits.reduce((best, hit) => Math.max(best, SEVERITY_RANK[hit.severity]), 0);
    assert.equal(top, SEVERITY_RANK[pledge.severity], `pledge ${pledge.n} top severity`);
    assert.ok(hits.some((hit) => hit.rule === pledge.rule && hit.severity === pledge.severity), `pledge ${pledge.n} needs ${pledge.rule}`);
  }
});

test('operating rules, method lines and notices stay clear of the pledge rules', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  const cases = loadPledgeCases();
  assert.ok(cases.near_misses.length >= 27);
  assert.ok(cases.near_misses_review.length >= 215);
  for (const near of [...cases.near_misses, ...cases.near_misses_review]) {
    const stray = scanText(near.text, rules, 'near-miss.md').filter((hit) => PLEDGE_RULES.includes(hit.rule));
    assert.deepEqual(stray, [], `near-miss must not hit a pledge rule: ${near.text}`);
  }
});

test('whole-document cases block or stay clean on the rule they name', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  const { document_cases: documents } = loadPledgeCases();
  assert.equal(documents.length, 13);
  for (const doc of documents) {
    const blocked = scanText(doc.text, rules, 'document.md').some((hit) => hit.rule === doc.rule && hit.severity === 'block');
    assert.equal(blocked, doc.expect === 'block', `${doc.rule} ${doc.expect}: ${JSON.stringify(doc.text)}`);
  }
});

test('the guard denies a pledge written to a reader-facing file and passes the near-misses', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-pledge-'));
  try {
    const write = (content, toolName = 'Write') => guardVerdict({ toolName, toolInput: { path: join(workspace, 'report.md'), content } }, workspace);
    const denied = write('동일 조건의 독립 성능 비교로 쓰지 않음.');
    assert.equal(denied.status, 2, denied.stderr);
    assert.equal(denied.reply.decision, 'deny');
    assert.match(denied.reply.reason, /ko-negative-pledge/);
    const english = write('# Notes\n\nThese figures do not constitute an independent performance comparison.\n');
    assert.equal(english.status, 2, english.stderr);
    assert.match(english.reply.reason, /en-negative-pledge/);
    for (const clean of ['이 장비는 방폭 구역에서 사용하지 않습니다. 냉각수로 쓰지 않음. 한 번에 0.1 이상 바꾸지 않음.', '법률 자문을 대체하지 않습니다.', 'The comparison does not imply causation.']) {
      const allowed = write(clean);
      assert.equal(allowed.status, 0, `${clean}: ${allowed.stderr}`);
      assert.deepEqual(allowed.reply, { decision: 'allow' });
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('pledges real models wrote in host runs all block on their expected rule', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  const { pledges_observed: observed } = loadPledgeCases();
  assert.equal(observed.length, 33);
  for (const pledge of observed) {
    const hits = scanText(pledge.text, rules, 'observed.md');
    assert.ok(hits.some((hit) => hit.rule === pledge.rule && hit.severity === 'block'), `observed pledge needs ${pledge.rule}: ${pledge.text}`);
  }
});

test('the guard refuses widened pledges and bold-label callouts but not plain quotes or method sentences', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-pledge-callout-'));
  try {
    const write = (content) => guardVerdict({ toolName: 'Write', toolInput: { path: join(workspace, 'report.md'), content } }, workspace);
    const refused = [
      ['This table is not a ranking.\n', /en-negative-pledge/],
      ['이 문서는 제품을 비교하려는 것이 아닙니다.\n', /ko-negative-pledge/],
      ['> **주의:** 이 표는 순위가 아닙니다.\n', /ko-negative-pledge/],
      ['> **Note:** This table is not a ranking.\n', /en-negative-pledge/],
    ];
    for (const [content, rule] of refused) {
      const denied = write(content);
      assert.equal(denied.status, 2, `${content}${denied.stderr}`);
      assert.equal(denied.reply.decision, 'deny');
      assert.match(denied.reply.reason, rule);
    }
    for (const clean of ['> 이 표는 순위가 아닙니다.\n', '> This table is not a ranking.\n', '숫자와 문자열은 서로 비교할 수 없습니다.\n', 'Do not compare these values directly; convert to SI first.\n']) {
      const allowed = write(clean);
      assert.equal(allowed.status, 0, `${clean}${allowed.stderr}`);
      assert.deepEqual(allowed.reply, { decision: 'allow' });
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('only a quote line that opens with a bold label is read, and only by rules that name blockquote_callout', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  const callouts = rules.filter((rule) => rule.context.includes('blockquote_callout')).map((rule) => rule.id).sort();
  assert.deepEqual(callouts, ['en-negative-pledge', 'ko-negative-pledge', 'ko-negative-pledge-repeat']);
  assert.ok(scanText('> **주의:** 이 표는 순위가 아닙니다.\n', rules, 'callout.md').some((hit) => hit.rule === 'ko-negative-pledge' && hit.line === 1));
  assert.ok(scanText('> __Note__ This table is not a ranking.\n', rules, 'callout.md').some((hit) => hit.rule === 'en-negative-pledge'));
  assert.deepEqual(scanText('> 이 표는 순위가 아닙니다.\n', rules, 'quote.md'), []);
  assert.deepEqual(scanText('> *주의* 이 표는 순위가 아닙니다.\n', rules, 'quote.md'), []);
  assert.equal(scanText('> **주의:** 이 문서는 비교가 아닙니다.\n', rules.filter((rule) => rule.id === 'ko-status-negation'), 'callout.md').length, 0);
  // a callout is its own segment: it neither joins the previous nor the next sentence
  assert.deepEqual(scanText('이 표는\n> **주의:** 순위가 아닙니다.\n', rules, 'split.md'), []);
});

test('the guard denies a repeated pledge pair within the hook timeout', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-pledge-repeat-'));
  try {
    const started = Date.now();
    const denied = guardVerdict({
      toolName: 'Write',
      toolInput: { path: join(workspace, 'report.md'), content: '해석하지 않음. 수율은 82%였다. 대표하지 않음.' },
    }, workspace);
    assert.equal(denied.status, 2, denied.stderr);
    assert.match(denied.reply.reason, /ko-negative-pledge-repeat/);
    assert.ok(Date.now() - started < GUARD_TIMEOUT_MS);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('a pledge padded with a long whitespace run is still denied inside the hook timeout', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-pledge-pad-'));
  try {
    const pledge = '동일 조건의 독립 성능 비교로 쓰지 않음.';
    for (const padding of [`검증된${' '.repeat(4096)}x`, `해석하지${' '.repeat(65536)}x`]) {
      const started = Date.now();
      const denied = guardVerdict({
        toolName: 'Write',
        toolInput: { path: join(workspace, 'report.md'), content: `${pledge}\n${padding}\n` },
      }, workspace);
      const elapsed = Date.now() - started;
      assert.equal(denied.status, 2, `${denied.stderr} after ${elapsed} ms`);
      assert.equal(denied.reply.decision, 'deny');
      assert.match(denied.reply.reason, /ko-negative-pledge/);
      assert.ok(elapsed < GUARD_TIMEOUT_MS, `guard took ${elapsed} ms against a ${GUARD_TIMEOUT_MS} ms hook timeout`);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('the guard scans only the changed text of an Edit', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-pledge-edit-'));
  try {
    const edit = (oldString, newString) => guardVerdict({
      toolName: 'Edit',
      toolInput: { path: join(workspace, 'report.md'), old_string: oldString, new_string: newString },
    }, workspace);
    const added = edit('수율은 82%였다.', '수율은 82%였다.\n이 표는 순위를 매기기 위한 것이 아닙니다.');
    assert.equal(added.status, 2, added.stderr);
    assert.match(added.reply.reason, /ko-negative-pledge/);
    const untouched = edit('이 그래프는 인과관계를 주장하지 않음.\n수율은 82%였다.', '이 그래프는 인과관계를 주장하지 않음.\n수율은 83%였다.');
    assert.equal(untouched.status, 0, untouched.stderr);
    assert.deepEqual(untouched.reply, { decision: 'allow' });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

function loadNegationCases() {
  return JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'lit-humanizer', 'negation-cases.json'), 'utf8'));
}

test('negation-cluster gives every stacked-negation fixture its expected tier', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  const { positive } = loadNegationCases();
  assert.equal(positive.length, 16);
  for (const item of positive) {
    const hits = scanText(item.text, rules, 'report.md').filter((hit) => hit.rule === 'negation-cluster');
    const tier = hits.some((hit) => hit.severity === 'block') ? 'block' : hits.length ? 'warn' : 'none';
    assert.equal(tier, item.expect, `${item.id} should be ${item.expect}`);
  }
});

test('negation-cluster stays quiet on single caveats, limitation lines, code, quotes and status tables', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  const { positive, negative } = loadNegationCases();
  assert.equal(negative.length, 18);
  for (const item of negative) {
    assert.ok(!scanText(item.text, rules, 'report.md').some((hit) => hit.rule === 'negation-cluster'), `${item.id} must stay clean`);
  }
  assert.deepEqual(scanText(positive[0].text, rules, 'plans/notes.md'), [], 'internal paths stay exempt');
});

test('the guard refuses a negation cluster, reworded or plain, with the rewrite advice', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-negation-'));
  try {
    const { positive, negative } = loadNegationCases();
    const write = (text) => guardVerdict({ toolName: 'Write', toolInput: { path: join(workspace, 'report.md'), content: `${text}\n` } }, workspace);
    for (const id of ['p01-hermes-visits', 'p11-reword-read-as']) {
      const denied = write(positive.find((item) => item.id === id).text);
      assert.equal(denied.status, 2, `${id}: ${denied.stderr}`);
      assert.equal(denied.reply.decision, 'deny');
      assert.match(denied.reply.reason, /block-tier negation-cluster in .*report\.md/);
      assert.match(denied.reply.reason, /Say what the thing is first/);
      assert.match(denied.reply.reason, /18,420/);
    }
    for (const id of ['n01-one-caveat', 'n11-limitation']) {
      const allowed = write(negative.find((item) => item.id === id).text);
      assert.equal(allowed.status, 0, `${id}: ${allowed.stderr}`);
      assert.deepEqual(allowed.reply, { decision: 'allow' });
      assert.doesNotMatch(allowed.stderr, /negation-cluster/);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('negation-cluster measures table cells in characters, so an emoji does not lengthen a status cell', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  // Each status cell is 10 characters but 14 UTF-16 units.
  const table = '| 항목 | 상태 |\n| --- | --- |\n| 첫째 | 해당 아님 😀😀😀😀 |\n| 둘째 | 해당 아님 😀😀😀😀 |\n';
  assert.ok(!scanText(table, rules, 'report.md').some((hit) => hit.rule === 'negation-cluster'));
});

test('the guard lets a two-negation warning through with the advice, even when another warning comes first', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-negation-order-'));
  try {
    const { positive } = loadNegationCases();
    const warned = positive.find((item) => item.id === 'p09-en-rather').text;
    const write = (content) => guardVerdict({ toolName: 'Write', toolInput: { path: join(workspace, 'report.md'), content } }, workspace);
    const alone = write(`${warned}\n`);
    assert.equal(alone.status, 0, alone.stderr);
    assert.deepEqual(alone.reply, { decision: 'allow' });
    assert.match(alone.stderr, /advisory negation-cluster in .*report\.md; review wording/);
    assert.match(alone.stderr, /Say what the thing is first/);
    const behind = write(`가격 변화가 수요에 영향을 미치다.\n\n${warned}\n`);
    assert.equal(behind.status, 0, behind.stderr);
    assert.deepEqual(behind.reply, { decision: 'allow' });
    assert.match(behind.stderr, /advisory ko-light-verb in /);
    assert.match(behind.stderr, /Say what the thing is first/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('an Edit keeps its fence, quote, inline-code and paragraph context', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-negation-edit-'));
  try {
    const file = join(workspace, 'report.md');
    const edit = (oldString, newString) => guardVerdict({ toolName: 'Edit', toolInput: { path: file, old_string: oldString, new_string: newString } }, workspace);
    const fenced = (oldString, newString) => {
      for (const onDisk of [false, true]) {
        if (onDisk) writeFileSync(file, `소개 문단입니다.\n\n${oldString}\n\n맺음 문단입니다.\n`);
        else rmSync(file, { force: true });
        const allowed = edit(oldString, newString);
        assert.equal(allowed.status, 0, `${JSON.stringify(newString)} on disk=${onDisk}: ${allowed.stdout}`);
        assert.deepEqual(allowed.reply, { decision: 'allow' });
      }
    };
    fenced('```\nold\n```', '```\n# 아님 아닙니다\n```');
    fenced('> 주민 수 아님.', '> 주민 수가 아닙니다. 전망치가 아닙니다.');
    fenced('`x` 설명', '`아님 아닙니다` 설명');
    fenced('방문 횟수입니다.\n\n탑승 건수입니다.', '방문 횟수는 주민 수가 아닙니다.\n\n탑승 건수는 승객 수가 아닙니다.');
    // Only the code body changes; the unchanged fence lines live in the file.
    writeFileSync(file, '소개 문단입니다.\n\n```python\nassert x\nif y: pass\n```\n');
    const body = edit('assert x\nif y: pass', 'assert x is not None  # 아님 아닙니다\nif y is not a: pass');
    assert.equal(body.status, 0, body.stdout);
    assert.deepEqual(body.reply, { decision: 'allow' });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('an Edit that turns a plain paragraph into a negation cluster is still refused', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-negation-edit-block-'));
  try {
    const file = join(workspace, 'report.md');
    const { positive } = loadNegationCases();
    const p01 = positive.find((item) => item.id === 'p01-hermes-visits').text;
    writeFileSync(file, '소개 문단입니다.\n\n방문 횟수입니다.\n\n맺음 문단입니다.\n');
    const denied = guardVerdict({ toolName: 'Edit', toolInput: { path: file, old_string: '방문 횟수입니다.', new_string: p01 } }, workspace);
    assert.equal(denied.status, 2, denied.stderr);
    assert.match(denied.reply.reason, /block-tier negation-cluster in .*report\.md/);
    assert.match(denied.stderr, /block-tier negation-cluster in .*report\.md.*Say what the thing is first/, 'the deny reason also reaches stderr');
    // One new negation joins one already in the same paragraph: the paragraph is what changed.
    writeFileSync(file, '소개 문단입니다.\n\n주민 수가 아닙니다.\n방문 횟수입니다.\n');
    const joined = guardVerdict({ toolName: 'Edit', toolInput: { path: file, old_string: '방문 횟수입니다.', new_string: '이용자 수도 아닙니다.' } }, workspace);
    assert.equal(joined.status, 2, joined.stderr);
    assert.match(joined.reply.reason, /negation-cluster/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('a patch keeps its hunk context: fences and blank lines survive', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-negation-patch-'));
  try {
    const patch = (text) => guardVerdict({ toolName: 'Edit', toolInput: { path: 'README.md', patch: text } }, workspace);
    for (const text of [
      '*** Update File: README.md\n@@\n ```\n+x = 1  // 아님 아닙니다\n ```',
      '*** Update File: README.md\n@@\n+방문 횟수는 주민 수가 아닙니다.\n \n+탑승 건수는 승객 수가 아닙니다.',
      '*** Update File: README.md\n@@\n+방문 횟수는 주민 수가 아닙니다.\n@@\n+탑승 건수는 승객 수가 아닙니다.',
    ]) {
      const allowed = patch(text);
      assert.equal(allowed.status, 0, `${JSON.stringify(text)}: ${allowed.stdout}`);
      assert.deepEqual(allowed.reply, { decision: 'allow' });
    }
    const denied = patch('*** Update File: README.md\n@@\n 소개 문단입니다.\n \n+방문 횟수입니다. 18,420명이 이용했다는 뜻이 아닙니다. 이용자 수가 아닙니다.');
    assert.equal(denied.status, 2, denied.stderr);
    assert.match(denied.reply.reason, /negation-cluster/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('the deny reason carries the negation advice only when a negation cluster is what blocks', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-negation-advice-'));
  try {
    const { positive } = loadNegationCases();
    const warned = positive.find((item) => item.id === 'p09-en-rather').text;
    const denied = guardVerdict({ toolName: 'Write', toolInput: { path: join(workspace, 'report.md'), content: `Source: internal logs\n\n${warned}\n` } }, workspace);
    assert.equal(denied.status, 2, denied.stderr);
    assert.doesNotMatch(denied.reply.reason, /negation-cluster/);
    assert.doesNotMatch(denied.reply.reason, /Say what the thing is first/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('the lit-humanizer skill text raises no negation-cluster finding of its own', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  for (const name of ['SKILL.md', join('assets', 'always-on-rule.md')]) {
    const hits = scanText(readFileSync(join(SKILL, name), 'utf8'), rules, name).filter((hit) => hit.rule === 'negation-cluster');
    assert.deepEqual(hits, [], name);
  }
});

test('negation-cluster needs a Unicode word boundary, so English glued to Hangul is not counted', () => {
  const rules = parseRules(readFileSync(join(SKILL, 'rules.json'), 'utf8'));
  assert.deepEqual(scanText("값은is not final, 수치는is not a count, 비율은isn't fixed.", rules, 'report.md'), []);
});

test('a Write over a readable file is judged on the lines it changes; a new file is judged whole', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-negation-write-diff-'));
  try {
    const file = join(workspace, 'report.md');
    const { positive } = loadNegationCases();
    const p01 = positive.find((item) => item.id === 'p01-hermes-visits').text;
    const write = (content) => guardVerdict({ toolName: 'Write', toolInput: { path: file, content } }, workspace);
    writeFileSync(file, `${p01}\n\n일반 문장입니다.\n`);
    const untouched = write(`${p01}\n\n다른 일반 문장입니다.\n`);
    assert.equal(untouched.status, 0, untouched.stderr);
    assert.deepEqual(untouched.reply, { decision: 'allow' });
    const long = [p01, ...Array.from({ length: 149 }, (_, index) => `문단 ${index + 1}입니다.`)];
    writeFileSync(file, `${long.join('\n\n')}\n`);
    long[120] = '고친 문단입니다.';
    const far = write(`${long.join('\n\n')}\n`);
    assert.equal(far.status, 0, far.stderr);
    writeFileSync(file, '소개 문단입니다.\n\n일반 문장입니다.\n');
    const added = write(`소개 문단입니다.\n\n${p01}\n`);
    assert.equal(added.status, 2, added.stderr);
    assert.match(added.reply.reason, /negation-cluster/);
    rmSync(file);
    const fresh = write(`${p01}\n\n일반 문장입니다.\n`);
    assert.equal(fresh.status, 2, fresh.stderr);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('a repeated-pledge finding is kept when any of its pledges changes, not when a line between them does', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-pledge-repeat-edit-'));
  try {
    const file = join(workspace, 'report.md');
    const edit = (oldString, newString) => guardVerdict({ toolName: 'Edit', toolInput: { path: file, old_string: oldString, new_string: newString } }, workspace);
    writeFileSync(file, '이 표는 일반화가 아닙니다.\n\n본문.\n');
    const added = edit('본문.', '결론이 아닙니다.\n\n순위가 아닙니다.');
    assert.equal(added.status, 2, added.stderr);
    assert.match(added.reply.reason, /ko-negative-pledge-repeat/);
    writeFileSync(file, '결론이 아닙니다.\n\n중간 문단입니다.\n\n순위가 아닙니다.\n');
    const between = edit('중간 문단입니다.', '고친 중간 문단입니다.');
    assert.equal(between.status, 0, between.stderr);
    assert.deepEqual(between.reply, { decision: 'allow' });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('a deliverable above the reported cwd is still judged; an internal path stays exempt wherever cwd is', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'litgrok-negation-cwd-'));
  try {
    const sub = join(workspace, 'sources');
    mkdirSync(sub);
    const { positive } = loadNegationCases();
    const p01 = positive.find((item) => item.id === 'p01-hermes-visits').text;
    const write = (path) => guardVerdict({ toolName: 'Write', toolInput: { path, content: `${p01}\n` } }, sub);
    for (const path of ['../report.md', join(workspace, 'report.md')]) {
      const denied = write(path);
      assert.equal(denied.status, 2, `${path}: ${denied.stdout}`);
      assert.match(denied.reply.reason, /negation-cluster/);
    }
    for (const path of ['../plans/notes.md', join(workspace, 'plans', 'notes.md'), join(workspace, 'HANDOFF.md')]) {
      const allowed = write(path);
      assert.equal(allowed.status, 0, `${path}: ${allowed.stderr}`);
      assert.deepEqual(allowed.reply, { decision: 'allow' });
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
