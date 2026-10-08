import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const banned = new Set([
  '79f6d8f5b427252fa3b1c11ecdbdb6bf610b944f7530b4de78f770f38741cfaa',
  '2d03c07a51c1793be8774664ff6594dcb6ecd3791cf718cd214c296c073fbb39',
  '5da81aba1bfbfd522b52db3156d68d483676ec6d3020a9f5fed684ba8af13335',
  '09868e9f1786765421ecf3f0f49c77006738efda82a76df43ed87f7a9bfe2467',
  '6fe762f45aff8c63fd95b9fcb1337b28921d6fa454e18a0e8158d4c8708d6d00',
  '0bd17f76a1a4c388aba42c6d1d39015fa84e405c3e0692397fe12762bd632b58',
  '1ec252de8b14b07d16966c48906ccb1c45c68bcd23557ad31d8c50a27f5f8c0f',
  'adead8fe6270e520c397cec9fbee4d606ab10bb80f749e018b42ec894c60d2e5',
  'c21fd950b6ada7bd2f029885d3e56bc66b7ff061cc8404c492eb301664aa9e5d',
  '8a590747551be847a904e3296fb2f35aa4e7feeb4970a61596c2375306462820',
  'c04ac37916f398ba621b2d9e1e4c1a69225eaad6d7fb0ad116c237ddeb1b2b68',
]);

test('packed office skills have complete routes and omit excluded source files', () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const files = JSON.parse(result.stdout)[0].files.map((entry) => entry.path);
  for (const skill of ['lit-docx', 'lit-pptx']) {
    assert.ok(files.includes(`.grok/skills/${skill}/SKILL.md`));
    assert.ok(files.includes(`.grok/skills/${skill}/requirements.lock`));
  }
  for (const relative of files) {
    const sha = createHash('sha256').update(readFileSync(join(root, relative))).digest('hex');
    assert.ok(!banned.has(sha), `excluded source file in package: ${relative}`);
  }
  assert.ok(files.includes('.grok/skills/lit-pptx/scripts/inventory.py'));
  assert.ok(files.includes('.grok/skills/lit-pptx/scripts/ooxml_integrity.py'));
  assert.ok(files.includes('.grok/skills/lit-pptx/package-lock.json'));
  assert.ok(!files.some((file) => file.startsWith('.grok/skills/lit-pptx/assets/media/')), 'unused template media is packed');
  assert.ok(!files.some((file) => file.includes('TEMPLATE-EXAMPLE-1')), 'branded template is packed');
});

test('bare lit report and slides guidance is general and enrolled', () => {
  const rule = readFileSync(join(root, '.grok/rules/00-litgrok.md'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(root, '.grok-plugin/plugin.json'), 'utf8'));
  for (const [skill, words] of [
    ['lit-docx', ['기획서', 'report', 'Word']],
    ['lit-pptx', ['발표자료', 'presentation', 'deck']],
  ]) {
    assert.ok(manifest.skills.includes(`./.grok/skills/${skill}`));
    const body = readFileSync(join(root, '.grok/skills', skill, 'SKILL.md'), 'utf8');
    for (const word of words) {
      assert.ok(rule.includes(word), `${word} absent from bare lit guidance`);
      assert.ok(body.includes(word), `${word} absent from skill description`);
    }
  }
  assert.match(rule, /If both groups occur, use both skills/);
  assert.match(rule, /stray quoted words or file contents/);
  assert.match(rule, /mark every invented name and figure as sample or assumption/);
  for (const skill of ['lit-docx', 'lit-pptx']) {
    const body = readFileSync(join(root, '.grok/skills', skill, 'SKILL.md'), 'utf8');
    assert.match(body, /bare `lit` request/);
    assert.match(body, /sample\/assumption/);
  }
});

test('pinned Office dependency tree excludes the audited vulnerable versions', () => {
  const lock = JSON.parse(readFileSync(join(root, '.grok/skills/lit-pptx/package-lock.json'), 'utf8'));
  assert.equal(lock.packages['node_modules/sharp'].version, '0.35.4');
  assert.equal(lock.packages['node_modules/image-size'].version, '2.0.4');
  const { supportsSlideNode } = require(join(root, '.grok/skills/lit-pptx/scripts/deps.cjs'));
  assert.equal(supportsSlideNode('18.20.0'), false);
  assert.equal(supportsSlideNode('20.8.0'), false);
  assert.equal(supportsSlideNode('20.9.0'), true);
  assert.equal(supportsSlideNode('22.0.0'), true);
});

// The document engine and gate. These convert real documents through the packaged launcher and read
// them back, so they run with the office cache and never skip.
const docRun = join(root, '.grok/skills/lit-docx/scripts/run.mjs');
const docEnv = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
delete docEnv.TYPESAFE_API_KEY;
const docScratch = mkdtempSync(join(tmpdir(), 'litgrok-docx-engine-'));
test.after(() => rmSync(docScratch, { recursive: true, force: true }));
function launch(...args) { return spawnSync(process.execPath, [docRun, ...args], { cwd: docScratch, env: docEnv, encoding: 'utf8' }); }
function convert(name, source, ...flags) {
  const md = join(docScratch, `${name}.md`), docx = join(docScratch, `${name}.docx`);
  writeFileSync(md, source);
  const r = launch('convert_md_to_docx.py', md, docx, ...flags);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return { md, docx };
}
function gate(docx, ...flags) {
  const r = launch('docx_gate.py', docx, ...flags);
  assert.ok(r.stdout.trim().startsWith('{'), r.stderr || r.stdout);
  return { status: r.status, report: JSON.parse(r.stdout) };
}
const memo = `---
title: 물류 거점 통합 검토
tonality: report
notice: "예시 데이터: 실제 수치로 바꿔 주세요"
---

# 검토 배경

다섯 거점 가운데 적재율이 낮은 두 곳을 통합하면 연간 임차료와 운송비를 함께 줄일 수 있다. 이 문서는 통합 대상과 일정, 남은 위험을 정리한다.

# 거점별 적재율과 비용

| 거점 | 적재율 | 연간 비용(억 원) |
|---|---|---|
| 대전 | 48% | 7.2 |
| 광주 | 52% | 6.4 |
| 대구 | 81% | 9.8 |

> 표 1. 거점별 적재율과 비용 (예시)

대전과 광주는 적재율이 절반 수준이고 두 거점의 비용 합계는 13.6억 원이다. 통합하면 연 6억 원가량을 줄일 수 있다.

# 일정과 담당

- 9월: 대전 재고 이전, 담당 물류기획팀
- 10월: 광주 시범 운영과 오배송률 점검
- 11월: 결과 보고와 남은 거점 검토
`;

test('a document converts under a tonality and passes the gate', () => {
  const { md, docx } = convert('memo-report', memo);
  const { status, report } = gate(docx, '--source', md);
  assert.equal(status, 0, JSON.stringify(report.failure_reasons));
  assert.equal(report.package.pass, true);
});

test('the document gate fails a leaked frontmatter, an unfilled blank and a missing heading', () => {
  const md = join(docScratch, 'flat.md'), docx = join(docScratch, 'flat.docx');
  writeFileSync(md, '# 검토 배경\n\n본문 한 줄.\n\n# 일정과 담당\n\n내용.\n');
  const build = spawnSync(require('../.grok/skills/lit-pptx/scripts/deps.cjs').python(), ['-c', "import sys\nfrom docx import Document\nd=Document();d.add_paragraph('title: 물류 거점 통합 검토');d.add_heading('검토 배경',1);d.add_paragraph('비용은 [금액]이다.');d.save(sys.argv[1])", docx], { env: docEnv, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const { status, report } = gate(docx, '--source', md);
  assert.equal(status, 1);
  assert.deepEqual(report.content.missing_headings, ['일정과 담당']);
  assert.ok(report.content.blanks.includes('[금액]'));
  assert.equal(report.content.frontmatter_leak.length, 1);
});

test('two tonalities of one source differ in structure, not only colour', () => {
  const a = convert('struct-report', memo);
  const b = convert('struct-brief', memo.replace('tonality: report', 'tonality: brief'));
  const { report } = gate(a.docx, '--source', a.md, '--compare', b.docx);
  assert.ok(report.output.structure.differ.length >= 3, JSON.stringify(report.output.structure));
});

test('Hangul font pairing may come from the styles a run inherits', () => {
  const python = require('../.grok/skills/lit-pptx/scripts/deps.cjs').python();
  const code = `import sys,json,tempfile\nsys.path.insert(0,${JSON.stringify(join(root, '.grok/skills/lit-docx/scripts'))})\nfrom docx import Document\nfrom docx.oxml.ns import qn\nfrom slop_lint import audit_docx_cjk\nout=[]\nfor paired in (True, False):\n d=Document()\n if paired:\n  fonts=d.styles.element.find(qn('w:docDefaults')).find(qn('w:rPrDefault')).find(qn('w:rPr')).find(qn('w:rFonts'))\n  fonts.set(qn('w:eastAsia'),'Pretendard')\n d.add_paragraph('거점별 적재율과 비용')\n f=tempfile.NamedTemporaryFile(suffix='.docx');d.save(f.name);out.append(len(audit_docx_cjk(f.name)))\nprint(json.dumps(out))`;
  const r = spawnSync(python, ['-c', code], { env: docEnv, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [0, 1]);
});

test('prose lint reads dashes, reference lists, subsections and title case the way documents use them', () => {
  const python = require('../.grok/skills/lit-pptx/scripts/deps.cjs').python();
  const dir = join(root, '.grok/skills/lit-docx/scripts');
  const sample = (body) => JSON.stringify(body);
  const code = `import sys,json\nsys.path.insert(0,${JSON.stringify(dir)})\nfrom pathlib import Path\nimport slop_lint\nskill=Path(${JSON.stringify(dir)}).parent\npub=slop_lint.load_publisher(skill/'templates'/'registry.yaml','elsevier')\nrules=slop_lint.load_phrase_rules(skill/'references'/'slop_phrase_list.yaml')\ndef ids(md,genre='manuscript'):\n return sorted({f.rule_id for f in slop_lint.lint_text(md,pub,rules,'en',genre)[0]})\nout={}\nout['list']=ids(${sample('# Key figures\n\n- 41% share\n  - basis: 600 households\n  - period: June\n\n| Item | Value |\n|---|---|\n| North | - |\n')},'general')\nout['dash']=ids(${sample('# Notes\n\nThe pilot ran for six weeks - longer than planned - and stopped.\n')},'general')\nrefs='# References\\n\\n'+'\\n'.join(f'[{i}] Author A, Author B. Title of work number {i}. Journal {i}, 2024.' for i in range(1,7))+'\\n'\nout['refs']=[r for r in ids(refs,'general') if r=='rule-05-sentence-variance']\nout['case']=[r for r in ids('# Results and Discussion\\n\\nThe catalyst converts most of the feed at moderate temperature.\\n') if r=='rule-11-heading-case']\nwords=' '.join(f'term{i}' for i in range(60))\nlong='# Results\\n\\n'+''.join(f'## Part {c}\\n\\nThe {words}.\\n\\n' for c in 'ABC')\nout['ttr']=[r for r in ids(long,'general') if r=='rule-10-lexical-diversity']\nprint(json.dumps(out))`;
  const r = spawnSync(python, ['-c', code], { env: docEnv, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.ttr, []);
  assert.ok(!out.list.includes('rule-02-em-dash-cluster'), JSON.stringify(out.list));
  assert.ok(out.dash.includes('rule-02-em-dash-cluster'), JSON.stringify(out.dash));
  assert.deepEqual(out.refs, []);
  assert.deepEqual(out.case, []);
});

test('every worked document converts and passes the gate with page checks, across all six tonalities', { skip: spawnSync('which', ['soffice']).status === 0 ? false : 'soffice not installed' }, () => {
  const examples = join(root, '.grok/skills/lit-docx/examples');
  const names = readdirSync(examples).filter((name) => name.endsWith('.md'));
  assert.ok(names.length >= 9, `${names.length} examples`);
  const used = new Set(), failures = [];
  for (const name of names) {
    const source = readFileSync(join(examples, name), 'utf8');
    used.add((/^tonality:\s*(\S+)/m.exec(source)?.[1] || '').toLowerCase());
    const { md, docx } = convert(name.replace(/\.md$/, ''), source);
    const { status, report } = gate(docx, '--source', md, '--layout');
    if (status !== 0 || !report.output.rendered) failures.push(`${name}: ${report.failure_reasons.join('; ') || report.output.render}`);
  }
  assert.deepEqual(failures, []);
  for (const id of ['report', 'brief', 'manual', 'proposal', 'memo', 'journal']) assert.ok(used.has(id), id);
});

test('a publisher run keeps the attribute quotes of its ::: components intact', () => {
  const source = `---\ntitle: 물류 거점 통합 검토\n---\n\n::: callout kind=key title="결정 요청"\n대전과 광주 거점 통합안을 11월 회의에서 결정해 주십시오.\n:::\n\n# 검토 배경\n\n다섯 거점 가운데 적재율이 낮은 두 곳을 통합하는 안을 "우선 검토" 대상으로 정리했다.\n`;
  const { docx } = convert('publisher-callout', source, '--publisher', 'korean-generic');
  const text = spawnSync(require('../.grok/skills/lit-pptx/scripts/deps.cjs').python(), ['-c', 'import sys\nfrom docx import Document\nd=Document(sys.argv[1])\nprint("\\n".join([p.text for p in d.paragraphs]+[c.text for t in d.tables for r in t.rows for c in r.cells]))', docx], { env: docEnv, encoding: 'utf8' });
  assert.match(text.stdout, /결정 요청/);
  assert.match(text.stdout, /“우선 검토”/);
});

// Fix round 2: a memo stays on one page when its content allows, a component title kept as text and the
// paragraph after a list stand clear, and publisher text never touches a table or a caption.
function paragraphSpacing(docx, starts) {
  const code = `import sys,json,zipfile,re\nxml=zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode()\nout={}\nfor start in json.loads(sys.argv[2]):\n  i=re.search(r'<w:t[^>]*>[^<]*'+re.escape(start),xml).start()\n  p=max(m.start() for m in re.finditer(r'<w:p[ >]',xml[:i]))\n  sp=re.search(r'<w:spacing [^>]*>',xml[p:i])\n  tag=sp.group(0) if sp else ''\n  num=lambda k:int((re.search(k+r'="(\\d+)"',tag) or [0,0])[1])\n  out[start]={'before':num('w:before'),'after':num('w:after')}\nprint(json.dumps(out))`;
  const r = spawnSync(require('../.grok/skills/lit-pptx/scripts/deps.cjs').python(), ['-c', code, docx, JSON.stringify(starts)], { env: docEnv, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
const shortMemo = `---
title: Change to meeting room booking from 3 November
author: Workplace team (example)
organization: Example Company
date: 2026-10-05
short_title: Room booking change
notice: "Example memo: names, dates and numbers are placeholders"
tonality: Memo
---

::: cover kicker="Internal memo"
To: All staff in the south building (example) · From: Workplace team · Subject: meeting room booking
:::

# What changes

From Monday 3 November, a meeting room booked through the calendar is released if nobody checks in at the door panel within 10 minutes of the start. Rooms released this way go back on the calendar at once, so colleagues can take them for the rest of the slot.

We are making this change because about a third of booked room hours stand empty. In September, 412 of 1,260 booked hours had nobody in the room, while 96 requests for a room on the same days were turned away.

::: callout kind=warning title="Recurring bookings"
Recurring meetings booked before 3 November keep their rooms, but each instance needs a check-in from that date. A series with three missed check-ins in a row is cancelled.
:::

# What you need to do

1. Check in on the door panel when you arrive, or with the room link in the calendar invitation.
2. If your meeting moves or ends early, release the room in the calendar so others can use it.
3. Book the large rooms (12 seats or more) only for meetings of eight people or more.

Interview rooms on the ground floor keep their current rules. Nothing changes for them.

# Numbers behind the decision

Table 1. Room use in September (example data)

| Measure (example) | Small rooms | Large rooms |
| --- | ---: | ---: |
| Booked hours | 840 | 420 |
| Hours with nobody in the room | 251 | 161 |
| Requests turned away | 58 | 38 |

# Questions

Ask the workplace desk on extension 2207 (example) or reply to this memo. We will review the release rule at the end of January.
`;

test('a memo that fits one page stays on one page, with its run-in head and the paragraph after a list set clear', { skip: spawnSync('which', ['soffice']).status === 0 ? false : 'soffice not installed' }, () => {
  const { md, docx } = convert('memo-one-page', shortMemo);
  const space = paragraphSpacing(docx, ['Recurring bookings', 'Interview rooms on the ground floor']);
  assert.ok(space['Recurring bookings'].before >= 240, `space above the run-in head: ${JSON.stringify(space)}`);
  assert.ok(space['Interview rooms on the ground floor'].before >= 120, `a paragraph after a list stands clear of it: ${JSON.stringify(space)}`);
  const one = gate(docx, '--source', md, '--layout');
  assert.equal(one.status, 0, JSON.stringify(one.report.failure_reasons));
  assert.equal(one.report.output.pages, 1, 'the memo fits one page');
  // A memo that spills a few lines onto page 2 is reported.
  const longer = shortMemo + '\nThe same rule applies to the two project rooms on floor 4; their door panels are fitted in the last week of October.\n\nWe will post the new signs beside every door panel in the week before 3 November and remove the old paper booking sheets on the same day.\n\nFacilities will check the door panels on every floor in the last week of October and replace any panel that fails to read a badge, so that no meeting loses its room to a fault.\n';
  const spill = convert('memo-spill', longer);
  const two = gate(spill.docx, '--source', spill.md, '--layout');
  assert.ok(two.report.output.findings.some((f) => f.check === 'memo.fit'), JSON.stringify(two.report.output.findings));
});

test('under a publisher profile the paragraph after a table, a table caption and a figure caption stand 8 pt clear of the text', () => {
  const drawn = spawnSync(require('../.grok/skills/lit-pptx/scripts/deps.cjs').python(), ['-c', 'import sys\nfrom PIL import Image\nImage.new("RGB",(120,60),(120,130,140)).save(sys.argv[1])', join(docScratch, 'curve.png')], { env: docEnv, encoding: 'utf8' });
  assert.equal(drawn.status, 0, drawn.stderr);
  const source = '---\ntitle: Drying rate of a coated granule\nauthor: Example Author B\n---\n\n# Results\n\nThe coated granule dries faster than the uncoated one at every air temperature.\n\nTable 1. Moisture after 30 min (example values)\n\n| Air (°C) | Uncoated | Coated |\n| ---: | ---: | ---: |\n| 60 | 8.4 | 6.1 |\n| 80 | 5.9 | 3.8 |\n\nAcross both temperatures the coated granule holds less moisture by 30 min.\n\n![Figure 1. Moisture over time (synthetic)](curve.png)\n\nThe two curves also differ in where they level off.\n';
  for (const publisher of ['elsevier', 'acs']) {
    const { docx } = convert(`publisher-spacing-${publisher}`, source, '--publisher', publisher);
    const space = paragraphSpacing(docx, ['Across both temperatures', 'Moisture after', 'Moisture over time (synthetic)']);
    assert.ok(space['Across both temperatures'].before >= 160, `${publisher}: the paragraph after the table: ${JSON.stringify(space)}`);
    assert.ok(space['Moisture after'].before >= 160, `${publisher}: the table caption after text: ${JSON.stringify(space)}`);
    assert.ok(space['Moisture over time (synthetic)'].after >= 160, `${publisher}: the figure caption keeps 8 pt under it: ${JSON.stringify(space)}`);
  }
});

// Fix round 3: a short list and a heading with the table it opens keep together, a page of text stays on one page
// under one rule, a wrapping column takes room from columns that have it, negatives read with the minus sign, a
// sentence above a table stands clear of it, and the example-data notice takes a colon.
function paragraphProps(docx, starts) {
  const code = `import sys,json,zipfile,re\nxml=zipfile.ZipFile(sys.argv[1]).read('word/document.xml').decode()\nout={}\nfor start in json.loads(sys.argv[2]):\n  i=re.search(r'<w:t[^>]*>[^<]*'+re.escape(start),xml).start()\n  p=max(m.start() for m in re.finditer(r'<w:p[ >]',xml[:i]))\n  m=re.search(r'<w:pPr>.*?</w:pPr>',xml[p:i])\n  out[start]=m.group(0) if m else ''\nprint(json.dumps(out))`;
  const r = spawnSync(require('../.grok/skills/lit-pptx/scripts/deps.cjs').python(), ['-c', code, docx, JSON.stringify(starts)], { env: docEnv, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}
const documentXml = (docx) => spawnSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8' }).stdout;
const keeps = (ppr) => /<w:keepNext\/>/u.test(ppr);
const checksOf = (report) => [...report.output.findings, ...(report.output.advisories || [])].map((f) => `${f.severity}:${f.check}`);

test('a list of up to six items keeps together with its lead-in, and a heading keeps its lead sentence with the table they open', () => {
  const { docx } = convert('keep-lists', '---\ntitle: 자동 분류 설비 운영 결과\nnotice: "예시 데이터: 수치는 가정입니다"\n---\n\n# 결론과 다음 단계\n\n자동 분류 설비는 처리량과 정확도에서 기대한 효과를 냈다.\n\n다음 단계는 아래와 같다.\n\n1. 2026년 11월: 투입부 개조 예산 승인\n2. 2027년 1월: 주말 두 차례에 걸쳐 개조 공사\n3. 2027년 2월: 야간 정비 인력 1명 추가 배치\n4. 2027년 3월: 개조 효과 확인 뒤 상세 설계 착수\n\n이 보고서의 모든 수치는 예시다.\n\n# 시나리오 비교\n\n세 시나리오의 투자비와 회수 기간을 비교했다.\n\n표 1. 확대 시나리오 비교 (예시)\n\n| 시나리오 | 투자비 (억 원) | 회수 기간 (년) |\n| --- | ---: | ---: |\n| A. 현재 설비 | 11.8 | 6.2 |\n| B. 전용 투입구 | 12.9 | 5.0 |\n\n자료: 예시 추정\n', '--tonality', 'Report');
  const props = paragraphProps(docx, ['다음 단계는 아래와 같다.', '2026년 11월', '2027년 1월', '2027년 2월', '2027년 3월', '세 시나리오의 투자비와']);
  assert.ok(keeps(props['다음 단계는 아래와 같다.']), 'the lead-in keeps with its list');
  for (const item of ['2026년 11월', '2027년 1월', '2027년 2월']) assert.ok(keeps(props[item]), `${item} keeps with the next item`);
  assert.ok(!keeps(props['2027년 3월']), 'the last item ends the chain');
  assert.ok(keeps(props['세 시나리오의 투자비와']), "the heading's lead sentence keeps with the table it opens");
});

test('the page checks find a split short list, a heading apart from its table, a near-empty second page and a lone last paragraph', () => {
  const probe = join(docScratch, 'pages.py');
  writeFileSync(probe, `import sys, json
sys.path.insert(0, sys.argv[1])
import docx_layout as L
frame = {"page_h": 841.9, "top": 70.0, "bottom": 70.0}
def page(lines, bottom):
    ink = [(y0, y1) for y0, y1, _ in lines] + [(70.0, bottom)]
    return {"h": 841.9, "lines": lines, "ink": ink, "images": 0, "boxes": [(72.0, y0, 300.0, y1, t) for y0, y1, t in lines], "filled": 0.0}
blocks = [{"t": "h", "level": 1, "text": "결론", "raw": "결론"}, {"t": "p", "text": "다음단계는아래와같다", "list": False},
          {"t": "p", "text": "첫째항목입니다", "list": True}, {"t": "p", "text": "둘째항목입니다", "list": True}, {"t": "p", "text": "셋째항목입니다", "list": True},
          {"t": "h", "level": 1, "text": "비교", "raw": "비교"}, {"t": "p", "text": "세시나리오를비교했다", "list": False},
          {"t": "tbl", "rows": ["시나리오투자비", "A현재설비"], "component": None, "cells": []}]
info = {"blocks": blocks, "components": {k: 0 for k in L.KINDS}, "cover": False, "memo": False, "frame": frame}
p1 = page([(80, 92, "결론"), (100, 112, "다음단계는아래와같다"), (700, 712, "첫째항목입니다")], 712)
p2 = page([(80, 92, "둘째항목입니다"), (100, 112, "셋째항목입니다"), (740, 752, "비교"), (760, 770, "세시나리오를비교했다")], 770)
p3 = page([(80, 90, "시나리오투자비"), (95, 105, "A현재설비")], 105)
found, _ = L.paged(info, [p1, p2, p3], True, {})
print(json.dumps(sorted({f["check"] for f in found})))
lone = page([(80, 92, "끝")], 92)
found, _ = L.paged({**info, "blocks": blocks[:1]}, [p1, p1, lone], True, {})
print(json.dumps(sorted({f["check"] for f in found})))
# A heading between the lead and the table opens its own section: the table is that heading's.
budget = blocks[:2] + [{"t": "h", "level": 1, "text": "예산", "raw": "예산"}] + blocks[6:]
long = page([(80, 92, "결론"), (100, 112, "다음단계는아래와같다")] + [(130 + 20 * i, 142 + 20 * i, f"문단{i}") for i in range(30)], 742)
after = page([(80, 92, "예산"), (100, 112, "세시나리오를비교했다"), (130, 140, "시나리오투자비"), (145, 155, "A현재설비")], 155)
found, _ = L.paged({**info, "blocks": budget}, [long, after], True, {})
print(json.dumps(sorted({f["check"] for f in found})))
`);
  const r = spawnSync(require('../.grok/skills/lit-pptx/scripts/deps.cjs').python(), ['-B', probe, join(root, '.grok/skills/lit-docx/scripts')], { env: docEnv, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [first, second, third] = r.stdout.trim().split('\n').map((l) => JSON.parse(l));
  for (const check of ['list.split', 'heading.apart', 'page.spill']) assert.ok(first.includes(check), `${check}: ${JSON.stringify(first)}`);
  assert.ok(second.includes('page.spill'), JSON.stringify(second));
  assert.ok(!third.includes('heading.apart'), `the table belongs to the heading right above it: ${JSON.stringify(third)}`);
});

test('a source of about a page is set tight in any tonality and stays on one page, and a section after a ruled box draws no second rule', { skip: spawnSync('which', ['soffice']).status === 0 ? false : 'soffice not installed' }, () => {
  const md = join(docScratch, 'brief-one-page.md'), docx = join(docScratch, 'brief-one-page.docx');
  writeFileSync(md, shortMemo);
  const c = launch('convert_md_to_docx.py', md, docx, '--tonality', 'Brief');
  assert.equal(c.status, 0, c.stderr || c.stdout);
  assert.match(c.stdout, /tight spacing/u);
  const props = paragraphProps(docx, ['What you need to do']);
  assert.match(props['What you need to do'], /<w:top w:val="nil"\/>/u, 'no hairline over the section right under the callout box');
  const g = gate(docx, '--source', md, '--layout', '--tonality', 'Brief');
  assert.equal(g.status, 0, JSON.stringify(g.report.failure_reasons));
  assert.equal(g.report.output.pages, 1, 'the brief fits one page');
});

test('a wrapping text column takes room from columns that have it, negatives read with the minus sign, and an uncaptioned table stands clear of the sentence above it', () => {
  const { docx } = convert('balance', '---\ntitle: 지점별 주간 방문\nnotice: "예시 데이터: 수치는 가정입니다"\n---\n\n# 지점별 방문\n\n지점마다 방문과 변화를 적었다.\n\n| Branch | Visits | Change | Share |\n| --- | ---: | ---: | ---: |\n| Harbour Road | 1,240 | -3 | 21% |\n| North Gate Library | 980 | -12 | 17% |\n| Old Mill | 2,105 | 8 | 36% |\n\n자료: 예시 집계\n', '--tonality', 'Report');
  const xml = documentXml(docx);
  const grid = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/gu)].map((m) => Number(m[1]) / 20);
  assert.ok(grid[0] >= 95, `the branch column holds "North Gate Library" or most of it: ${JSON.stringify(grid)}`);
  assert.match(xml, /−3</u, 'a negative takes U+2212');
  assert.match(xml, /−12</u);
  assert.doesNotMatch(xml, />-3</u);
  assert.ok(paragraphSpacing(docx, ['지점마다 방문과 변화를 적었다.'])['지점마다 방문과 변화를 적었다.'].after >= 120, 'the sentence above an uncaptioned table keeps 6 pt under it');
});

test('under a publisher profile a paragraph after a list stands 6 pt clear, the paragraph after a table three quarters of a line, and a short list keeps together', () => {
  const source = '---\ntitle: A five-line reporting template\nauthor: Example Author A\n---\n\n# Results\n\nWe propose that every short benchmark report states five lines.\n\n1. Conversion at the end of the run.\n2. Half-conversion time.\n3. Peak heat release.\n\nLines 3 and 4 together let a reader compute the margin.\n\nTable 1. Margin (example)\n\n| Inlet (°C) | Margin (kW) |\n| ---: | ---: |\n| 180 | 0.88 |\n| 220 | -0.07 |\n\nThe negative margin at 220 °C does not make the catalyst unusable.\n';
  for (const publisher of ['elsevier', 'acs']) {
    const { docx } = convert(`publisher-lists-${publisher}`, source, '--publisher', publisher);
    const space = paragraphSpacing(docx, ['Lines 3 and 4', 'The negative margin']);
    assert.ok(space['Lines 3 and 4'].before >= 120, `${publisher}: after the list ${JSON.stringify(space)}`);
    assert.ok(space['The negative margin'].before >= 180, `${publisher}: after the table ${JSON.stringify(space)}`);
    const props = paragraphProps(docx, ['Conversion at the end', 'Half-conversion time']);
    assert.ok(keeps(props['Conversion at the end']) && keeps(props['Half-conversion time']), `${publisher}: a short list keeps together`);
  }
});

test('the gate fails a notice that joins its label and line with a spaced dash', () => {
  const dashed = convert('notice-dash', '---\ntitle: 운영 메모\ntonality: memo\nnotice: 예시 안내문 — 일정은 가정입니다\n---\n\n# 일정\n\n다음 주 월요일부터 바뀐다.\n');
  const bad = gate(dashed.docx, '--source', dashed.md);
  assert.ok(checksOf(bad.report).includes('FAIL:notice.dash'), JSON.stringify(checksOf(bad.report)));
  const colon = convert('notice-colon', '---\ntitle: 운영 메모\ntonality: memo\nnotice: "예시 안내문: 일정은 가정입니다"\n---\n\n# 일정\n\n다음 주 월요일부터 바뀐다.\n');
  assert.ok(!checksOf(gate(colon.docx, '--source', colon.md).report).includes('FAIL:notice.dash'));
});

// Fix round 4: a two-column Journal keeps a heading with its first lines and balances its last page; a short
// closing section travels whole to the last page.
test('in a two-column body a page-wide table spans with its source line, a five-item list may break once between its first and last two items, and the column body closes with a continuous break', () => {
  const { docx } = convert('journal-columns', '---\ntitle: Drying rate of a coated granule\nauthor: Example Author B\nnotice: "Synthetic example: data are placeholders"\n---\n\n# Methods\n\nEach condition ran three times.\n\nTable 1. Runs by air temperature (example values)\n\n| Air (°C) | Granule | Moisture (%) | Time (min) |\n| ---: | --- | ---: | ---: |\n| 60 | Uncoated | 8.4 | 30 |\n| 80 | Coated | 3.8 | 30 |\n\nSource: synthetic data, three repeats\n\n## Run protocol\n\nEach run starts from a dry, purged chamber.\n\nEvery short drying report states five lines:\n\n1. Moisture at the end of the run.\n2. Half-drying time.\n3. Peak outlet humidity.\n4. Air flow through the bed.\n5. Number of repeats.\n\nLines 3 and 4 together give the margin.\n', '--tonality', 'Journal');
  const xml = documentXml(docx);
  const table = xml.indexOf('Runs by air temperature');
  const resume = xml.indexOf('w:num="1"', table);
  assert.ok(table > 0 && resume > 0 && xml.indexOf('>Source: synthetic data') < resume, 'the source line stands under the page-wide table, before the columns resume');
  const props = paragraphProps(docx, ['Every short drying report', 'Moisture at the end', 'Half-drying time', 'Peak outlet humidity', 'Air flow through the bed']);
  for (const start of ['Every short drying report', 'Moisture at the end', 'Air flow through the bed']) assert.ok(keeps(props[start]), `${start} keeps with the next paragraph`);
  for (const start of ['Half-drying time', 'Peak outlet humidity']) assert.ok(!keeps(props[start]), `the column list may break after ${start}`);
  const sects = [...xml.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/gu)];
  assert.doesNotMatch(sects.at(-1)[0], /w:num="2"/u, 'the document closes on a one-column section');
  assert.match(sects.at(-2)[0], /w:num="2"/u);
  assert.ok(sects.at(-2).index > xml.indexOf('Lines 3 and 4 together'), 'the column section holds the last paragraph');
  assert.match(paragraphProps(docx, ['Lines 3 and 4 together'])['Lines 3 and 4 together'], /<w:widowControl w:val="0"\/>/u, 'the last paragraph may break across the balanced columns');
});

test('a closing section of a few lines and a short list keeps whole; a closing section with a table does not', () => {
  const head = '---\ntitle: 자동 분류 설비 운영 결과\nnotice: "예시 데이터: 수치는 가정입니다"\n---\n\n# 배경\n\n자동 분류 설비를 제2물류센터에서 1년 운영했고, 처리량과 정확도, 비용 회수를 분기마다 기록해 계획과 비교했다.\n\n';
  const tail = '# 결론과 다음 단계\n\n자동 분류 설비는 처리량과 정확도에서 기대한 효과를 냈다. 비용 회수가 늦어진 원인은 설비 자체가 아니라 투입부 설계와 야간 운영에 있었고, 두 가지 모두 고칠 수 있다.\n\n다음 단계는 아래와 같다.\n\n1. 2026년 11월: 투입부 개조 예산 승인\n2. 2027년 1월: 개조 공사\n3. 2027년 2월: 야간 정비 인력 추가 배치\n\n이 보고서의 모든 수치는 예시다.\n';
  const whole = paragraphProps(convert('closing-whole', head + tail, '--tonality', 'Report').docx, ['자동 분류 설비는 처리량과', '자동 분류 설비를 제2물류센터에서']);
  assert.ok(keeps(whole['자동 분류 설비는 처리량과']), 'the closing paragraph keeps with the list after it');
  assert.ok(!keeps(whole['자동 분류 설비를 제2물류센터에서']), 'an earlier section is untouched');
  const tabled = paragraphProps(convert('closing-table', `${head + tail}\n| 단계 | 시기 |\n| --- | --- |\n| 승인 | 11월 |\n`, '--tonality', 'Report').docx, ['자동 분류 설비는 처리량과']);
  assert.ok(!keeps(tabled['자동 분류 설비는 처리량과']), 'a closing section with a table moves no paragraph');
});

test('the page checks find a heading at the foot of a column and columns that do not balance', () => {
  const probe = join(docScratch, 'columns.py');
  writeFileSync(probe, `import sys, json
sys.path.insert(0, sys.argv[1])
import docx_layout as L
frame = {"page_h": 841.9, "top": 70.0, "bottom": 70.0}
def page(lines):
    return {"h": 841.9, "w": 595.3, "lines": sorted((y0, y1, t) for _, y0, y1, t in lines), "ink": [(y0, y1) for _, y0, y1, _ in lines],
            "images": 0, "boxes": [(x0, y0, x0 + 230.0, y1, t) for x0, y0, y1, t in lines], "filled": 0.0}
def col(x, y0, y1, tag):
    return [(x, y, y + 11, f"{tag}{k}행") for k, y in enumerate(range(int(y0), int(y1), 14))]
def blocks(*items):
    return [dict({"t": t, "text": x, "list": lst, "cols": 2}, **({"level": 1, "raw": x} if t == "h" else {})) for t, x, lst in items]
info = lambda b: {"blocks": b, "components": {k: 0 for k in L.KINDS}, "cover": False, "memo": False, "frame": frame}
checks = lambda found: sorted({f["check"] for f in found})
heads = blocks(("h", "배경", False), ("p", "왼쪽0행", False), ("h", "방법", False), ("p", "다음0행", False))
first = page([(70, 80, 92, "배경")] + col(70, 100, 760, "왼쪽") + col(310, 80, 740, "오른쪽") + [(310, 750, 762, "방법")])
print(json.dumps(checks(L.paged(info(heads), [first, page(col(70, 80, 420, "다음") + col(310, 80, 410, "끝"))], True, {})[0])))
print(json.dumps(checks(L.paged(info(heads[:2]), [first, page(col(70, 80, 500, "다음"))], True, {})[0])))
listed = blocks(("h", "배경", False), ("p", "왼쪽0행", False), *[("p", f"{n}항목", True) for n in "가나다라마"])
p1 = page([(70, 80, 92, "배경")] + col(70, 100, 730, "왼쪽") + [(70, 740, 751, "가항목"), (70, 754, 765, "나항목")] + col(310, 80, 765, "오른쪽"))
p2 = page([(70, 80, 91, "다항목"), (70, 94, 105, "라항목"), (70, 108, 119, "마항목")] + col(70, 124, 420, "다음") + col(310, 80, 420, "끝"))
print(json.dumps(checks(L.paged(info(listed), [p1, p2], True, {})[0])))
short = page([(70, 80, 92, "배경")] + col(70, 100, 520, "왼쪽") + col(310, 80, 765, "오른쪽"))
print(json.dumps(checks(L.paged(info(listed[:2]), [short, p2], True, {})[0])))
`);
  const r = spawnSync(require('../.grok/skills/lit-pptx/scripts/deps.cjs').python(), ['-B', probe, join(root, '.grok/skills/lit-docx/scripts')], { env: docEnv, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const [foot, lone, even, hole] = r.stdout.trim().split('\n').map((l) => JSON.parse(l));
  assert.ok(foot.includes('heading.column'), JSON.stringify(foot));
  assert.ok(lone.includes('columns.balance'), JSON.stringify(lone));
  for (const check of ['columns.balance', 'list.split', 'heading.column']) assert.ok(!even.includes(check), `${check}: ${JSON.stringify(even)}`);
  assert.ok(hole.includes('columns.balance'), JSON.stringify(hole));
});
