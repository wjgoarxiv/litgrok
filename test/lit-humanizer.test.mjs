import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
  assert.equal(rules.length, 51);
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
