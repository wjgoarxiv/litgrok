import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';

// A request for `report.md` and `slides.md` wants files a person reads as they are. In a
// real Grok run the rule sent that request to lit-docx and lit-pptx, the model wrote their
// renderer source (YAML front matter, `::: cover`, `::: callout`) into report.md, then spent
// the whole time budget compiling, gating and page-fitting Office files nobody asked for.
// The Brief tonality also asked for 개조식 noun endings, and a sentence-variance lint was
// answered by chopping Korean sentences into fragments. These checks pin the text that
// stops all three.

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (path) => readFileSync(join(root, path), 'utf8');
const section = (text, heading) => {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.ok(start >= 0, `missing section ${heading}`);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end < 0 ? undefined : end);
};

test('the rule writes a Markdown or plain-text deliverable directly and keeps renderer source out of it', () => {
  const office = section(read('.grok/rules/00-litgrok.md'), 'Office output selection');
  assert.match(office, /`report\.md`/);
  assert.match(office, /Markdown or plain text/);
  assert.match(office, /load neither skill/);
  assert.match(office, /write plain Markdown for its reader, without front matter or `:::` blocks/);
  assert.doesNotMatch(office, /use both skills and keep Markdown source next to both files\./);
});

// In the same comparison the LitGrok report.md carried every figure in running prose, while a reader
// scanning for the numbers, their units and periods, and the decisions asked for found them faster in
// a table and a numbered list.
test('the rule puts a Markdown report\'s figures in a table and its decisions in a numbered list', () => {
  const office = section(read('.grok/rules/00-litgrok.md'), 'Office output selection');
  assert.match(office, /Put figures with units or periods in a table and asked-for decisions in a numbered list\./);
});

test('the rule asks Korean deliverables for full sentences and keeps noun endings to tables and labels', () => {
  const prose = section(read('.grok/rules/00-litgrok.md'), 'Prose review');
  assert.match(prose, /Korean report and slide prose uses full, natural sentences/);
  assert.match(prose, /-음, -함, -임 endings/);
  assert.match(prose, /table cells and short list labels/);
});

for (const [skill, file] of [['lit-docx', '.docx or PDF'], ['lit-pptx', '.pptx']]) {
  test(`${skill} names the Markdown deliverable case before its source format`, () => {
    const body = read(`.grok/skills/${skill}/SKILL.md`);
    const plain = section(body, 'Markdown or plain-text deliverables');
    assert.match(plain, /`report\.md`|`slides\.md`/);
    assert.match(plain, /no YAML front matter/);
    assert.match(plain, /no `:::` blocks/);
    assert.match(plain, /no `tonality`, `density` or `variance` keys/);
    assert.match(plain, new RegExp(`only when this skill renders the ${file.replace(/\./g, '\\.')}`));
    assert.match(plain, /run no converter, gate or render/);
    assert.match(plain, /full, natural sentences/);
    assert.ok(body.indexOf('## Markdown or plain-text deliverables') < body.indexOf('## Direction step'), 'the exemption must come before the direction step');
  });
}

test('lit-docx forbids meeting the sentence-variance lint with fragment sentences', () => {
  const body = read('.grok/skills/lit-docx/SKILL.md');
  assert.match(body, /rule-05-sentence-variance/);
  assert.match(body, /never by splitting sentences into fragments/);
});

test('the Brief tonality keeps 개조식 endings to a requested 개조식 and to tables and labels', () => {
  const brief = read('.grok/skills/lit-docx/references/tonalities/brief.md');
  assert.doesNotMatch(brief, /Write them as dash lists in 개조식, noun or `~함`\/`~임` endings, one fact per item\./);
  assert.match(brief, /items are full sentences/);
  assert.match(brief, /`~함`\/`~임` endings only when the user asks for 개조식/);
});

test('an installed project carries the Markdown deliverable and Korean sentence rules', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'litgrok-md-deliverable-'));
  try {
    const sink = { isTTY: true, write() { return true; } };
    const env = { ...process.env, HOME: join(scratch, 'home') };
    delete env.CI;
    delete env.NO_COLOR;
    assert.equal(await run(['install'], { stdin: { isTTY: true }, stdout: sink, stderr: sink, cwd: scratch, env }), 0);
    const rule = readFileSync(join(scratch, '.grok', 'rules', '00-litgrok.md'), 'utf8');
    assert.match(rule, /load neither skill/);
    assert.match(rule, /full, natural sentences/);
    for (const skill of ['lit-docx', 'lit-pptx']) {
      const body = readFileSync(join(scratch, '.grok', 'skills', skill, 'SKILL.md'), 'utf8');
      assert.match(body, /## Markdown or plain-text deliverables/);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
