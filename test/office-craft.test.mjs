import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const python = require('../.grok/skills/lit-pptx/scripts/deps.cjs').python();
const scripts = join(root, '.grok/skills/lit-pptx/scripts');
const startedAt = Date.now();
const childEnv = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };
function bytecodeWrittenSince(since) {
  const written = [];
  for (const skill of ['lit-pptx', 'lit-docx']) {
    const cache = join(root, '.grok/skills', skill, 'scripts', '__pycache__');
    if (!existsSync(cache)) continue;
    for (const name of readdirSync(cache)) if (statSync(join(cache, name)).mtimeMs >= since) written.push(`${skill}/scripts/__pycache__/${name}`);
  }
  return written;
}
function run(code) { const r=spawnSync(python,['-c',code],{cwd:root,env:childEnv,encoding:'utf8'}); assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout); }

test('PPTX craft gate finds accent overload and explicit left numeric cells', () => {
  const result=run(`import sys,json\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.dml.color import RGBColor\nfrom pptx.enum.shapes import MSO_SHAPE\nfrom pptx.enum.text import PP_ALIGN\nfrom craft_extras import assess\np=Presentation();s=p.slides.add_slide(p.slide_layouts[6])\nfor n,h in enumerate(['D6336C','2F9E44','1971C2']):\n q=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,100000+n*1000000,100000,600000,600000);q.fill.solid();q.fill.fore_color.rgb=RGBColor.from_string(h)\nt=s.shapes.add_table(3,1,100000,1200000,1000000,1000000).table\nfor i,v in enumerate(['Year','120','130']):t.cell(i,0).text=v\nfor i in (1,2):t.cell(i,0).text_frame.paragraphs[0].alignment=PP_ALIGN.LEFT\nprint(json.dumps(assess(p)))`);
  assert.ok(result.findings.some((f)=>f.rule==='OF-101'&&f.severity==='HIGH'));
  assert.ok(result.findings.some((f)=>f.rule==='OF-103'&&f.severity==='HIGH'));
});

test('PPTX craft subset covers all nine OF-1xx signals and accepts a clean slide', () => {
  const generated=spawnSync(python,[join(root,'test/fixtures/office-craft/check_pptx.py'),scripts],{cwd:root,env:childEnv,encoding:'utf8'});
  assert.equal(generated.status,0,generated.stderr);
  const generatedFindings=JSON.parse(generated.stdout).findings;
  const rules=new Set(generatedFindings.map((f)=>f.rule));
  for(let number=101;number<=109;number++)assert.ok(rules.has(`OF-${number}`),`OF-${number}`);
  assert.ok(generatedFindings.some((f)=>f.rule==='OF-105'&&f.severity==='MEDIUM'));
  const clean=run(`import sys,json\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.dml.color import RGBColor\nfrom pptx.enum.shapes import MSO_SHAPE\nfrom pptx.util import Inches\nfrom craft_extras import assess\np=Presentation();s=p.slides.add_slide(p.slide_layouts[6]);q=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,Inches(1),Inches(1),Inches(2),Inches(1));q.fill.solid();q.fill.fore_color.rgb=RGBColor(30,90,180)\nprint(json.dumps(assess(p)))`);
  assert.equal(clean.pass,true);
  assert.deepEqual(clean.findings,[]);
});

test('PPTX public QA includes the craft verdict', () => {
  const result=run(`import sys,json,tempfile\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.enum.shapes import MSO_SHAPE\nfrom pptx.dml.color import RGBColor\nfrom pptx.util import Inches\nfrom qa_deck import qa\np=Presentation();s=p.slides.add_slide(p.slide_layouts[6])\nfor i,rgb in enumerate(((214,51,108),(47,158,68),(25,113,194))):\n q=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,Inches(1+i),Inches(1),Inches(.6),Inches(.6));q.fill.solid();q.fill.fore_color.rgb=RGBColor(*rgb)\nf=tempfile.NamedTemporaryFile(suffix='.pptx');p.save(f.name);r=qa(f.name)\nprint(json.dumps({'pass':r['pass'],'craft':r['office_craft']}))`);
  assert.equal(result.pass,false);
  assert.ok(result.craft.findings.some((f)=>f.rule==='OF-101'));
});

test('DOCX craft audit flags explicit left alignment in numeric columns', () => {
  const result=run(`import sys,json,tempfile\nsys.path.insert(0,${JSON.stringify(join(root,'.grok/skills/lit-docx/scripts'))})\nfrom docx import Document\nfrom docx.enum.text import WD_ALIGN_PARAGRAPH\nfrom slop_lint import audit_docx_craft\nd=Document();t=d.add_table(rows=3,cols=1)\nfor i,v in enumerate(['Year','120','130']):t.cell(i,0).text=v\nfor i in (1,2):t.cell(i,0).paragraphs[0].alignment=WD_ALIGN_PARAGRAPH.LEFT\nf=tempfile.NamedTemporaryFile(suffix='.docx');d.save(f.name)\nprint(json.dumps([x.rule_id for x in audit_docx_craft(f.name)]))`);
  assert.ok(result.includes('OF-302'));
});

test('DOCX page measure stays advisory and right-aligned numeric cells pass', () => {
  const result=run(`import sys,json,tempfile\nsys.path.insert(0,${JSON.stringify(join(root,'.grok/skills/lit-docx/scripts'))})\nfrom docx import Document\nfrom docx.enum.text import WD_ALIGN_PARAGRAPH\nfrom docx.shared import Inches\nfrom slop_lint import audit_docx_craft\nd=Document();s=d.sections[0];s.page_width=Inches(11);s.left_margin=Inches(.5);s.right_margin=Inches(.5);d.add_paragraph('Clear technical explanation for the requested sample page. ' * 4);t=d.add_table(rows=3,cols=1)\nfor i,v in enumerate(['Year','120','130']):t.cell(i,0).text=v\nfor i in (1,2):t.cell(i,0).paragraphs[0].alignment=WD_ALIGN_PARAGRAPH.RIGHT\nf=tempfile.NamedTemporaryFile(suffix='.docx');d.save(f.name)\nprint(json.dumps([{'rule':x.rule_id,'severity':x.severity} for x in audit_docx_craft(f.name)]))`);
  assert.ok(result.some((f)=>f.rule==='OF-301'&&f.severity==='MEDIUM'));
  assert.ok(!result.some((f)=>f.rule==='OF-302'));
});

test('DOCX public audit reports numeric alignment through the packaged launcher', () => {
  const scratch=mkdtempSync(join(tmpdir(),'litgrok-docx-craft-'));
  try {
    const doc=join(scratch,'sample.docx');
    const build=spawnSync(python,['-c',`from docx import Document\nfrom docx.enum.text import WD_ALIGN_PARAGRAPH\nimport sys\nd=Document();t=d.add_table(rows=3,cols=1)\nfor i,v in enumerate(['Year','120','130']):t.cell(i,0).text=v\nfor i in (1,2):t.cell(i,0).paragraphs[0].alignment=WD_ALIGN_PARAGRAPH.LEFT\nd.save(sys.argv[1])`,doc],{env:childEnv,encoding:'utf8'});
    assert.equal(build.status,0,build.stderr);
    const lint=spawnSync(process.execPath,[join(root,'.grok/skills/lit-docx/scripts/run.mjs'),'slop_lint.py','--publisher','korean-generic','--audit-output',doc,'--report',join(scratch,'lint.md')],{cwd:root,env:childEnv,encoding:'utf8'});
    assert.equal(lint.status,1,lint.stderr);
    assert.match(lint.stdout,/OF-302/);
  } finally { rmSync(scratch,{recursive:true,force:true}); }
});

// Gate matchers on pack-drawn slides. Each pair holds a false positive that the gate must stop
// raising and the true positive it must keep raising. One threshold moved: OF-102 reads text above
// 11 pt, not 10.5 pt, because the engine sets captions and table text at 11 pt on the compact ramp
// (the compiled caption test below fails at 10.5 pt).
function craft(body) {
  return run(`import sys,json\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.dml.color import RGBColor\nfrom pptx.enum.shapes import MSO_SHAPE\nfrom pptx.util import Inches, Pt\nfrom craft_extras import assess\np=Presentation();p.slide_width=Inches(13.333);p.slide_height=Inches(7.5)\np.slides.add_slide(p.slide_layouts[6])\ndef slide():\n return p.slides.add_slide(p.slide_layouts[6])\ndef box(s,x,y,w,h,text='',size=13,name=None,fill=None):\n b=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,Inches(x),Inches(y),Inches(w),Inches(h)) if fill else s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h))\n if fill: b.fill.solid();b.fill.fore_color.rgb=RGBColor.from_string(fill);b.line.fill.background()\n if name: b.name=name\n if text:\n  b.text_frame.word_wrap=True\n  for i,line in enumerate(text.split('\\\\n')):\n   para=b.text_frame.paragraphs[0] if i==0 else b.text_frame.add_paragraph();para.text=line\n   for r in para.runs: r.font.size=Pt(size)\n return b\n${body}\nprint(json.dumps(assess(p)))`);
}
const rules = (result, rule, severity) => result.findings.filter((f) => f.rule === rule && (!severity || f.severity === severity));

test('OF-101 counts accent fills, not hairline rules or the sample-data tag', () => {
  const clean = craft("s=slide();box(s,0,0,4.5,7.5,fill='1F3B33')\nfor y in (1.8,3.3,4.8): box(s,4.7,y,6.9,0.01,fill='CBD3DA')\nbox(s,0.3,6.9,2.6,0.25,fill='FCEBE0',name='lit-notice tag')");
  assert.deepEqual(rules(clean, 'OF-101'), []);
  const loud = craft("s=slide()\nfor i,h in enumerate(['D6336C','2F9E44','1971C2']): box(s,1+2*i,2,1.5,1.5,fill=h)");
  assert.equal(rules(loud, 'OF-101', 'HIGH').length, 1);
});

test('OF-102 measures each broken line with Pretendard widths', () => {
  // The section preview the engine draws: three lines it broke itself, 385 pt wide at 13 pt.
  const lines = ['즉시 대응하는 두 항목(포장재, 물류)은 11월까지 끝낸다 (표 2)', '원자재 장기 계약은 12월에 안을 확정하고 2월부터 고정가를 적용한다', '보류한 설비 교체(연 2억 원)는 1월 점검 결과를 보고 3월에 다시 검토한다'];
  const section = craft(`s=slide();box(s,0.33,1.9,10.5,0.7,text='원가 상승 이슈와 대응',size=36,name='title@section')\nbox(s,0.33,5.25,5.347,1.26,text=${JSON.stringify(lines.join('\\n'))},size=13)`);
  assert.deepEqual(rules(section, 'OF-102', 'HIGH'), []);
  // The wide preview (two lines an opened slide, 600 pt at 13 pt) keeps its own measure on a section page, and a
  // caption under a chart that spans the body is caption type, not body text.
  const preview = ['회귀는 x가 1 늘 때 y가 평균 얼마나 변하는지 묻고, 기울기는 언제나 y 단위를 x 단위로 나눈 값으로 읽는다', '결과: 공부 시간이 1시간 긴 학생의 점수가 평균 4.2점 높다 (95% 구간 2.7-5.7점, 학생 40명 예시 자료)'];
  const wide8 = craft(`s=slide();box(s,0,2.93,13.33,0.01,fill='1A1A1A',name='family@section-numeral')\nbox(s,0.33,1.75,10.5,0.7,text='회귀가 답하는 질문',size=36,name='title@section')\nbox(s,0.33,3.18,8.33,0.51,text=${JSON.stringify(preview.join('\\n'))},size=13)`);
  assert.deepEqual(rules(wide8, 'OF-102', 'HIGH'), []);
  const caption = 'Figure 1. Single-feed conversion over time at 1.0 L/min, mean of three replicates (synthetic\\nsample data)';
  const charted = craft(`s=slide();box(s,0.33,0.5,4,1.67,text='Single-feed baseline',size=26,name='title@side-rail')\nbox(s,4.67,5.33,8.33,0.4,text='${caption}',size=11)`);
  assert.deepEqual(rules(charted, 'OF-102', 'HIGH'), []);
  const ko = '즉시 대응하는 두 항목(포장재, 물류)은 십일월까지 끝내고 결과를 십이월 회의에 보고한다 ';
  const wide = craft(`s=slide();box(s,0.5,0.5,12,0.8,text='대응 일정',size=26,name='title@top-rule')\nbox(s,0.5,1.5,12,1.6,text=${JSON.stringify(ko.repeat(4))},size=18)`);
  assert.equal(rules(wide, 'OF-102', 'HIGH').length, 1);
});

test('OF-109 reads the body beside a side title and leaves display slides alone', () => {
  const rail = craft("s=slide();box(s,0.33,0.5,4,1.25,text='회귀 기울기의 뜻',size=26,name='title@side-rail')\nt=s.shapes.add_table(5,3,Inches(4.67),Inches(0.5),Inches(8.3),Inches(3.2))\nbox(s,4.67,3.8,8.3,0.2,text='표 1. 회귀 질문의 예',size=11)\nfor y in (4.6,5.2): box(s,4.67,y,8.3,0.5,text='기울기는 언제나 y 단위를 x 단위로 나눈 값으로 읽는다',size=13)\nbox(s,4.67,6.58,8.3,0.17,text='출처: 강의용 가상 자료 (예시)',size=9)");
  assert.deepEqual(rules(rail, 'OF-109'), []);
  const quote = craft("s=slide();box(s,0,0,13.33,7.5,fill='1F3B33',name='family@quote')\nbox(s,0.33,3.67,10.5,1.15,text='모든 모형은 틀렸다',size=36,name='title@statement')\nbox(s,0.33,5.15,8.3,0.25,text='— 통계학 격언',size=13)");
  assert.deepEqual(rules(quote, 'OF-109'), []);
  const chart = craft("from pptx.chart.data import CategoryChartData\ns=slide();box(s,0.33,0.5,4,1.25,text='Revenue growth by region',size=26,name='title@side-rail')\nd=CategoryChartData();d.categories=['North','West','East'];d.add_series('Q3',(410,300,12))\nfrom pptx.enum.chart import XL_CHART_TYPE\ns.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED,Inches(4.67),Inches(0.5),Inches(5.1),Inches(5.03),d)\nbox(s,10.1,0.5,2.7,0.45,text='North and West carry 71% of growth',size=13)\nbox(s,4.67,5.6,5.1,0.4,text='Figure 3. Revenue growth by region (sample)',size=11)\nbox(s,4.67,6.4,8.3,0.17,text='Source: billing export (sample)',size=9)");
  assert.deepEqual(rules(chart, 'OF-109'), []);
  const image = craft("from PIL import Image\nimport tempfile\nimg=tempfile.NamedTemporaryFile(suffix='.png');Image.new('RGB',(160,90),(120,130,140)).save(img.name)\ns=slide();s.shapes.add_picture(img.name,0,0,p.slide_width,p.slide_height)\nbox(s,0,4.5,7.9,2.67,fill='16212C')\nbox(s,0.33,4.83,7.25,1,text='4인 식탁으로 펼친 상태',size=26,name='title@overlay')\nbox(s,0.33,6,7.25,0.2,text='도 1. 펼친 모습 | 출처: 예시',size=11)");
  assert.deepEqual(rules(image, 'OF-109'), []);
  const hollow = craft("s=slide();box(s,0.33,0.5,12,0.8,text='분기별 매출 추이',size=26,name='title@top-rule')\nbox(s,0.33,1.7,12,0.5,text='매출은 지난 분기보다 늘었다',size=13)");
  assert.equal(rules(hollow, 'OF-109', 'HIGH').length, 1);
});

test('contrast reads text on the slide ground of a dark deck', () => {
  const result = run(`import sys,json,tempfile\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.dml.color import RGBColor\nfrom pptx.util import Inches, Pt\nfrom qa_deck import check_contrast\np=Presentation()\nfor ink in ('E8EDF2','2A2F36'):\n s=p.slides.add_slide(p.slide_layouts[6]);s.background.fill.solid();s.background.fill.fore_color.rgb=RGBColor.from_string('101418')\n b=s.shapes.add_textbox(Inches(1),Inches(1),Inches(6),Inches(1));b.text='Conversion by feed rate';r=b.text_frame.paragraphs[0].runs[0];r.font.size=Pt(14);r.font.color.rgb=RGBColor.from_string(ink)\nf=tempfile.NamedTemporaryFile(suffix='.pptx');p.save(f.name)\nprint(json.dumps(check_contrast(f.name)))`);
  assert.deepEqual(result.violations.map((v) => v.slide), [2]);
});

test('frame overflow counts explicit breaks and Pretendard widths', () => {
  const result = run(`import sys,json,tempfile\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.util import Inches, Pt\nfrom inventory import inspect\np=Presentation();s=p.slides.add_slide(p.slide_layouts[6])\nfor x,y,w,h,paras in ((0.3,1,5.083,0.451,('three equal inlets along the reactor, each taking one','third of the feed')),(0.3,2,5.972,0.226,('(1) The second 30 minutes add 15 points; the first 30 add 35.',)),(6.6,1,2,0.3,('a long note that cannot fit in a narrow frame of this size at all, running on for several more lines than the frame holds',))):\n b=s.shapes.add_textbox(Inches(x),Inches(y),Inches(w),Inches(h));tf=b.text_frame;tf.word_wrap=True\n for m in ('margin_left','margin_right','margin_top','margin_bottom'): setattr(tf,m,0)\n for i,text in enumerate(paras):\n  para=tf.paragraphs[0] if i==0 else tf.add_paragraph();para.text=text\n  for r in para.runs: r.font.size=Pt(13)\nf=tempfile.NamedTemporaryFile(suffix='.pptx');p.save(f.name)\nprint(json.dumps(inspect(f.name)))`);
  const flagged = Object.entries(result['1'] || {}).filter(([, issue]) => issue.overflow && issue.overflow.frame).map(([index]) => index);
  assert.deepEqual(flagged, ['3']);
});

test('visual substance leaves statement and quote slides out of the fill count', () => {
  const result = run(`import sys,json,tempfile\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.util import Inches, Pt\nfrom qa_deck import check_visual_substance\np=Presentation();p.slide_width=Inches(13.333);p.slide_height=Inches(7.5)\nfor title in ('cover','title@statement','title@top-rule'):\n s=p.slides.add_slide(p.slide_layouts[6]);b=s.shapes.add_textbox(Inches(0.33),Inches(4.6),Inches(8),Inches(0.5));b.name=title;b.text='퇴근 후에는 식탁, 주말에는 운동할 바닥'\nf=tempfile.NamedTemporaryFile(suffix='.pptx');p.save(f.name)\nprint(json.dumps(check_visual_substance(f.name)))`);
  assert.deepEqual(result.findings.map((f) => f.slide), [3]);
});

test('the deck gate fails a flat engine deck on treatments, composition, frames and sentence titles', () => {
  // Nine slides drawn as the engine names them, but every title under one top-rule frame, every
  // body the same text column, one frame nudged and one title written as a sentence.
  const result = run(`import sys,json,tempfile\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.dml.color import RGBColor\nfrom pptx.enum.shapes import MSO_SHAPE\nfrom pptx.util import Pt\nfrom qa_deck import qa\np=Presentation();p.slide_width=Pt(960);p.slide_height=Pt(540);p.core_properties.subject='lit-pptx tonality=ledger density=10 grid=compact variance=5'\ndef text(s,x,y,w,h,t,size,name=None):\n b=s.shapes.add_textbox(Pt(x),Pt(y),Pt(w),Pt(h));b.text_frame.word_wrap=True;b.text=t\n for r in b.text_frame.paragraphs[0].runs: r.font.size=Pt(size)\n if name: b.name=name\n return b\ns=p.slides.add_slide(p.slide_layouts[6]);text(s,24,200,700,60,'분기 운영 점검',44,'title@cover').name='title@cover';s.shapes[0].name='title@cover'\nfor n in range(8):\n s=p.slides.add_slide(p.slide_layouts[6])\n r=s.shapes.add_shape(MSO_SHAPE.RECTANGLE,Pt(24),Pt(102),Pt(54),Pt(4));r.name='family@text-column';r.fill.solid();r.fill.fore_color.rgb=RGBColor(14,107,90)\n label='매출은 지난 분기보다 늘었다' if n==3 else f'거점별 운영 지표 {n+1}'\n text(s,24+(5 if n==5 else 0),36,864,60,label,26,'title@top-rule')\n text(s,24,130,864,340,'본문 한 줄과 근거 한 줄을 적는다 '*12,13)\nf=tempfile.NamedTemporaryFile(suffix='.pptx');p.save(f.name);r=qa(f.name)\nprint(json.dumps({'pass':r['pass'],'reasons':r['failure_reasons'],'rules':sorted({x['rule'] for x in r.get('deck_output',{}).get('findings',[]) if x['severity']=='HIGH'})}))`);
  assert.equal(result.pass, false);
  assert.deepEqual(result.rules, ['OF-110', 'OF-111', 'OF-113', 'OF-114']);
  assert.ok(result.reasons.some((reason) => reason.startsWith('deck output')), JSON.stringify(result.reasons));
});

test('a full-bleed picture carries its caption and source on the panel laid over it', () => {
  const result = run(`import sys,json,tempfile\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.util import Inches, Pt\nfrom PIL import Image\nfrom qa_deck import check_evidence_binding\nimg=tempfile.NamedTemporaryFile(suffix='.png');Image.new('RGB',(160,90),(120,130,140)).save(img.name)\np=Presentation();p.slide_width=Inches(13.333);p.slide_height=Inches(7.5)\nfor full in (True, False):\n s=p.slides.add_slide(p.slide_layouts[6])\n pic=s.shapes.add_picture(img.name,0,0,p.slide_width,p.slide_height) if full else s.shapes.add_picture(img.name,Inches(1),Inches(1),Inches(6),Inches(3.4))\n pic._element.nvPicPr.cNvPr.set('descr','Figure 1. Boardwalk on recycled decking | Source: sample photo')\n b=s.shapes.add_textbox(Inches(0.33),Inches(6.0),Inches(7),Inches(0.3)) if full else s.shapes.add_textbox(Inches(8),Inches(1),Inches(4),Inches(0.3))\n b.text='Figure 1. Boardwalk on recycled decking | Source: sample photo'\nf=tempfile.NamedTemporaryFile(suffix='.pptx');p.save(f.name)\nprint(json.dumps(check_evidence_binding(f.name)))`);
  assert.deepEqual(result.violations.map((v) => v.slide), [2]);
});

test('OF-112 fails a deck whose median empty band passes 0.20 and passes one at the cap', () => {
  // Three content slides under a top-rule title: the body runs from 96 pt to the 486 pt floor (390 pt),
  // and each text block ends at the given depth, so 388.5 pt leaves 0.25 of it empty and 408 pt 0.20.
  const deckAt = (bottom) => run(`import sys,json\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom pptx import Presentation\nfrom pptx.util import Pt\nfrom deck_output import assess\np=Presentation();p.slide_width=Pt(960);p.slide_height=Pt(540);p.core_properties.subject='lit-pptx tonality=ledger density=5 grid=standard variance=5'\ndef text(s,x,y,w,h,t,size,name=None):\n b=s.shapes.add_textbox(Pt(x),Pt(y),Pt(w),Pt(h));b.text_frame.word_wrap=True;b.text=t\n for r in b.text_frame.paragraphs[0].runs: r.font.size=Pt(size)\n if name: b.name=name\nfor n in range(3):\n s=p.slides.add_slide(p.slide_layouts[6])\n text(s,48,100,40,4,'',13,'family@text-column')\n text(s,48,36,864,60,f'거점별 운영 지표 {n+1}',26,'title@top-rule')\n text(s,48,130,864,${bottom}-130,'본문 한 줄과 근거 한 줄을 적는다 '*12,13)\nprint(json.dumps(assess(p)))`);
  const over = deckAt(388.5);
  assert.deepEqual(rules(over, 'OF-112', 'HIGH').map((f) => [f.slide, f.value, f.threshold]), [[null, 0.25, 0.2]]);
  assert.equal(over.pass, false);
  assert.deepEqual(rules(deckAt(408), 'OF-112'), []);
});

test('OF-114 reads compound nouns and plural nouns as labels, and finite verbs as sentences', () => {
  const titles = ['Cut-over plan by site', 'Civil works schedule, 2026', 'Revenue by region, billion won', 'Paid users by month', 'Sales leads by channel', 'Revenue rose 12% in Q3', 'Margins improve with scale.'];
  const result = run(`import sys,json\nsys.path.insert(0,${JSON.stringify(scripts)})\nfrom deck_output import sentence\nprint(json.dumps([sentence(t) for t in ${JSON.stringify(titles)}]))`);
  assert.deepEqual(result, [false, false, false, false, false, true, true]);
});

// The deck engine under tonality packs: these compile real decks through the packaged compiler and
// read them back, so they run with the office cache and never skip.
const compiler = join(scripts, 'compile-deck.js');
const engineScratch = mkdtempSync(join(tmpdir(), 'litgrok-deck-engine-'));
test.after(() => rmSync(engineScratch, { recursive: true, force: true }));
function compile(...args) { return spawnSync(process.execPath, [compiler, ...args], { cwd: engineScratch, env: childEnv, encoding: 'utf8' }); }
function deck(name, source, ...flags) {
  const md = join(engineScratch, `${name}.md`), pptx = join(engineScratch, `${name}.pptx`);
  writeFileSync(md, source);
  const r = compile(md, ...flags, '--pptx', pptx);
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return { pptx, log: r.stdout };
}
function shapes(pptx, number) {
  return run(`import json\nfrom pptx import Presentation\ns=Presentation(${JSON.stringify(pptx)}).slides[${number - 1}]\nprint(json.dumps([[x.name,x.left/12700,x.top/12700,x.width/12700,x.height/12700,x.text_frame.text if x.has_text_frame else ''] for x in s.shapes]))`);
}
function deckGate(pptx, ...flags) {
  const r = spawnSync(process.execPath, [join(scripts, 'run.mjs'), 'qa_deck.py', pptx, ...flags], { cwd: engineScratch, env: childEnv, encoding: 'utf8' });
  return { status: r.status, report: JSON.parse(r.stdout) };
}
const briefing = `---
title: 물류비 절감 점검
tonality: ledger
notice: 예시 데이터 — 실제 수치로 바꿔 주세요
---

---
layout: cover-typographic

# 물류비 절감 점검
---

---
layout: section

# 거점 재배치와 운송 계약
---

---
layout: content

## 거점별 재배치 우선순위

- 다섯 거점 가운데 적재율이 낮은 두 곳(대전, 광주)을 먼저 통합하고 나머지는 상반기 실적을 보고 정한다
- 두 거점 통합의 연간 절감액은 합계 6억 원이며 임대 계약이 끝나는 10월에 맞춰 이전한다
- 운송 계약은 단가 재협상안을 11월에 확정하고 1월 출고분부터 새 단가를 적용한다
---

---
layout: content

## 재배치 일정과 담당

- 대전 거점은 9월에 재고를 옮기고 10월 첫 주에 문을 닫으며 결과를 11월 회의에 보고한다
- 광주 거점은 협력사 창고로 옮겨 10월 말까지 시범 운영하고 오배송률을 매주 점검한다
- 남은 세 거점의 통합 여부는 1월 실적 점검 뒤 2월 운영 회의에서 다시 결정한다
---
`;

test('the compiler lists the eight tonalities beside the legacy templates', () => {
  const r = compile('--list-tonalities');
  assert.equal(r.status, 0, r.stderr);
  for (const id of ['atlas', 'chalk', 'gazette', 'ledger', 'night', 'paper', 'signal', 'studio']) assert.match(r.stdout, new RegExp(`^${id}\\b`, 'm'), id);
  assert.match(r.stdout, /AZURE-PRO/);
});

test('an unknown tonality fails and names the known ones', () => {
  const md = join(engineScratch, 'unknown.md');
  writeFileSync(md, '---\ntitle: x\ntonality: marble\n---\n\n---\nlayout: content\n\n## 항목\n\n- 한 줄\n---\n');
  const r = compile(md, '--pptx', join(engineScratch, 'unknown.pptx'));
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /marble/);
  assert.match(r.stderr, /ledger/);
});

test('a tonality deck names its pack and draws titles under named treatments', () => {
  const { pptx, log } = deck('ledger', briefing);
  assert.match(log, /ledger/i);
  const titles = shapes(pptx, 4).map(([name]) => name).filter((name) => name.startsWith('title@'));
  assert.equal(titles.length, 1, JSON.stringify(shapes(pptx, 4)));
});

test('the same source under two tonalities draws different title treatments', () => {
  const a = deck('two-a', briefing.replace('tonality: ledger', 'tonality: studio'));
  const b = deck('two-b', briefing.replace('tonality: ledger', 'tonality: gazette'));
  const names = (pptx) => [2, 3, 4].flatMap((n) => shapes(pptx, n).map(([name]) => name).filter((name) => name.startsWith('title@')));
  assert.notDeepEqual(names(a.pptx), names(b.pptx));
});

test('a closing whose amounts add up keeps the next step clear of the total', () => {
  const source = `---\ntitle: 신규 거점 투자 요청\ntonality: studio\nnotice: 예시 데이터 — 실제 수치로 바꿔 주세요\n---\n\n---\nlayout: cover-typographic\n\n# 신규 거점 투자 요청\n---\n\n---\nlayout: closing-contact-split\n\n## 12개월 투자 집행 계획\n\n| 항목 | 금액 |\n|---|---|\n| 부지 임차 | 9억 원 |\n| 자동화 설비 | 12억 원 |\n| 운영 인력 | 6억 원 |\n| 시스템 연동 | 3억 원 |\n\n- 다음 단계: 12월 첫째 주 투자 심의에서 분기별 집행 일정과 점검 지표를 함께 확정, 담당 예시 경영기획팀\n---\n`;
  const { pptx } = deck('closing', source);
  const page = shapes(pptx, 2);
  const total = page.find(([, , , , , text]) => text.startsWith('합계'));
  const step = page.find(([, , , , , text]) => text.startsWith('다음 단계'));
  assert.ok(total && step, JSON.stringify(page));
  const apart = step[1] + step[3] <= total[1] || total[2] + total[4] <= step[2] || step[2] + step[4] <= total[2];
  assert.ok(apart, `step ${JSON.stringify(step.slice(1, 5))} meets total ${JSON.stringify(total.slice(1, 5))}`);
  assert.equal(deckGate(pptx).report.semantic_overlaps.violations.length, 0);
});

test('a line chart of several series shows its value axis, not point values, and horizontal bars keep level labels', () => {
  const source = `---\ntitle: 반품 처리 점검\ntonality: night\nnotice: 예시 데이터 — 실제 수치로 바꿔 주세요\n---\n\n---\nlayout: cover-typographic\n\n# 반품 처리 점검\n---\n\n---\nlayout: content\n\n## 채널별 월간 반품 처리 일수\n\n::: chart type=line unit="일"\n| 월 | 자사몰 | 오픈마켓 | 오프라인 |\n|---|---|---|---|\n| 7월 | 3.1 | 4.2 | 2.4 |\n| 8월 | 2.9 | 4.4 | 2.6 |\n| 9월 | 2.7 | 4.0 | 2.5 |\n> 채널별 반품 처리 일수 (예시 데이터)\n:::\n출처: 예시 반품 기록\n---\n\n---\nlayout: content\n\n## 반품 사유별 건수\n\n::: chart type=bar unit="건"\n| 사유 | 건수 |\n|---|---|\n| 상품 설명과 실제 색상 차이 | 42 |\n| 배송 중 포장 파손으로 인한 손상 | 31 |\n| 단순 변심 | 18 |\n| 사이즈 불일치 | 12 |\n> 반품 사유별 건수 (예시 데이터)\n:::\n출처: 예시 반품 기록\n---\n`;
  const { pptx } = deck('chart-labels', source);
  const charts = run(`import json,re,zipfile\nz=zipfile.ZipFile(${JSON.stringify(pptx)})\nprint(json.dumps([z.read(n).decode() for n in sorted(z.namelist()) if re.fullmatch(r'ppt/charts/chart\\d+\\.xml',n)]))`);
  const line = charts.find((x) => x.includes('<c:lineChart>'));
  const bar = charts.find((x) => x.includes('<c:barDir val="bar"/>'));
  assert.ok(line && bar, `${charts.length} charts`);
  // Three lines within a couple of days of each other: a value over every point prints onto the other lines' values.
  assert.doesNotMatch(line, /<c:showVal val="1"\/>/, 'point values of three lines print over each other');
  assert.match(line, /<c:valAx>[\s\S]*?<c:delete val="0"\/>/, 'the value axis carries the values instead');
  assert.doesNotMatch(bar.slice(bar.indexOf('<c:catAx>'), bar.indexOf('</c:catAx>')), /rot="-2700000"/, 'horizontal bar categories are slanted');
});

function chartsOf(name, body, tonality = 'night') {
  const { pptx } = deck(name, `---\ntitle: 반품 지표 점검\ntonality: ${tonality}\nnotice: 예시 데이터 — 실제 수치로 바꿔 주세요\n---\n\n---\n${body}\n---\n`);
  return run(`import json,re,zipfile\nz=zipfile.ZipFile(${JSON.stringify(pptx)})\nprint(json.dumps([z.read(n).decode() for n in sorted(z.namelist()) if re.fullmatch(r'ppt/charts/chart\\d+\\.xml',n)]))`);
}

test('horizontal bars with negative values set their category labels at the axis minimum', () => {
  const [chart] = chartsOf('negative-bars', 'layout: content\n\n## 채널별 반품 비용 증감\n\n::: chart type=bar unit="천만 원"\n| 채널 | 증감 (천만 원) |\n|---|---|\n| 자사몰 | 5 |\n| 오프라인 | 2 |\n| 오픈마켓 | -3 |\n| 라이브 커머스 | -7 |\n> 채널별 반품 비용 증감 (예시 데이터)\n:::\n출처: 예시 반품 정산 자료', 'ledger');
  // Beside the zero line the category labels would sit on the negative bars.
  assert.match(chart.slice(chart.indexOf('<c:catAx>'), chart.indexOf('</c:catAx>')), /<c:tickLblPos val="low"\/>/);
});

test('a missing cell leaves a gap in its line, never a point at zero', () => {
  const [chart] = chartsOf('blank-cells', 'layout: content\n\n## 채널별 월간 반품률\n\n::: chart type=line unit="%"\n| 월 | 자사몰 (%) | 오픈마켓 (%) |\n|---|---|---|\n| 6월 | 4.1 | 6.8 |\n| 7월 | 3.9 | 6.5 |\n| 8월 | 3.8 | — |\n| 9월 | 3.6 |  |\n> 채널별 반품률 (예시 데이터)\n:::\n출처: 예시 반품 기록');
  const second = chart.slice(chart.lastIndexOf('<c:ser>'));
  const points = [...second.slice(second.indexOf('<c:val>')).matchAll(/<c:pt idx="(\d)"><c:v>([^<]*)<\/c:v>/g)].map((m) => [Number(m[1]), m[2]]);
  assert.deepEqual(points.filter(([i, v]) => i >= 2 && v !== ''), [], `the open market has no August or September figure, yet points are drawn: ${JSON.stringify(points)}`);
  assert.match(chart, /<c:dispBlanksAs val="gap"\/>/);
});

test('thin clustered horizontal bars read off the axis, and a narrow horizontal bar chart keeps few axis numbers', () => {
  const [pair] = chartsOf('thin-bars', 'layout: kpi-over-chart\n\n## 3분기 반품 접수 실적\n\n| 접수 건수 | 앱 접수 비중 | 평균 환불 기간 |\n|---|---|---|\n| 3,420건 | 52% | 2.6일 |\n| 2분기 3,050건 | 2분기 45% | 2분기 3.3일 |\n\n::: chart type=bar unit="건"\n| 사유 | 2분기 | 3분기 |\n|---|---|---|\n| 색상 차이 | 920 | 840 |\n| 포장 파손 | 610 | 880 |\n| 단순 변심 | 470 | 520 |\n| 사이즈 | 330 | 300 |\n| 기타 | 120 | 90 |\n> 사유별 반품 접수 건수 (예시 데이터)\n:::\n\n- 포장 파손이 처음으로 색상 차이를 넘었다\n출처: 예시 반품 기록');
  assert.doesNotMatch(pair, /<c:showVal val="1"\/>/, 'value labels of two thin bars per row touch each other');
  assert.match(pair, /<c:valAx>[\s\S]*?<c:delete val="0"\/>/);
  const grid = chartsOf('narrow-bars', 'layout: dashboard-grid\n\n## Returns funnel, refund speed and repeat rate\n\n::: chart type=bar unit="%"\n| Step | Share of returns (%) |\n|---|---|\n| Requested | 100 |\n| Label printed | 83 |\n| Parcel received | 69 |\n| Refunded in two days | 51 |\n> Returns funnel (sample data)\n:::\n\n::: chart type=line unit="%"\n| Month | Repeat buyers (%) |\n|---|---|\n| Jul | 38.2 |\n| Aug | 38.9 |\n| Sep | 39.4 |\n> Repeat buyers after a return (sample data)\n:::\n\n::: chart type=column unit="d"\n| Month | Refund (d) |\n|---|---|\n| Jul | 3.4 |\n| Aug | 3.0 |\n| Sep | 2.6 |\n> Median refund time (sample data)\n:::\n\n- Parcel receipt loses one return in seven');
  const funnel = grid.find((x) => x.includes('<c:barDir val="bar"/>'));
  const unit = Number(funnel.match(/<c:valAx>[\s\S]*?<c:majorUnit val="([\d.]+)"\/>/)?.[1]);
  // Long step names leave the axis a narrow strip; four numbers stand level there.
  assert.ok(unit > 0 && Math.ceil(100 / unit) + 1 <= 4, `axis step ${unit} on a narrow panel`);
});

// Fix round 2: a title's regions are filled by layout (the floor under a bottom title, the rail under a
// side title, the column beside a visual), two tonalities differ in structure, a dark ground draws a
// figure's dark variant, a chart highlights one series and keeps the table's decimals, and Korean runs
// carry their language. These read the compiled decks back and the gate's findings on them.
function looks(pptx) {
  return run(`import json\nfrom pptx import Presentation\nfrom pptx.enum.shapes import MSO_SHAPE_TYPE\nout=[]\nfor s in Presentation(${JSON.stringify(pptx)}).slides:\n page=[]\n for x in s.shapes:\n  try:\n   fill=x.fill.type==1\n  except Exception:\n   fill=False\n  page.append({'name':x.name,'x':x.left/12700,'y':x.top/12700,'w':x.width/12700,'h':x.height/12700,'text':x.text_frame.text if x.has_text_frame else '','chart':bool(getattr(x,'has_chart',False) and x.has_chart),'picture':x.shape_type==MSO_SHAPE_TYPE.PICTURE,'fill':fill})\n out.append(page)\nprint(json.dumps(out))`);
}
function oneSlide(name, tonality, body) {
  const { pptx } = deck(name, `---\ntitle: 확인\ntonality: ${tonality}\nnotice: 예시 데이터 — 실제 수치로 바꿔 주세요\n---\n\n---\n${body}\n---\n`);
  return { pptx, page: looks(pptx)[0] };
}
const lines = (text) => text.split(/[\n\v]/u).map((l) => l.trim()).filter(Boolean);
const ruled = (report, rule) => report.deck_output.findings.filter((f) => f.rule === rule);
function parts(pptx, pattern) {
  return run(`import json,re,zipfile\nz=zipfile.ZipFile(${JSON.stringify(pptx)})\nnames=sorted((n for n in z.namelist() if re.fullmatch(${JSON.stringify(pattern)},n)),key=lambda n:int(re.sub(r'\\D','',n) or 0))\nprint(json.dumps([z.read(n).decode() for n in names]))`);
}
function media(pptx) {
  return run(`import json,hashlib,zipfile\nz=zipfile.ZipFile(${JSON.stringify(pptx)})\nprint(json.dumps([hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('ppt/media/image')]))`);
}
// Moves shapes of a compiled deck to plant a defect the gate must find.
function plant(pptx, out, code) {
  run(`from pptx import Presentation\nfrom pptx.util import Pt\nimport json\np=Presentation(${JSON.stringify(pptx)})\n${code}\np.save(${JSON.stringify(out)})\nprint(json.dumps(True))`);
}
// A diagram: three outlined boxes joined by lines, on the given ground.
function diagram(file, ground, ink) {
  mkdirSync(dirname(file), { recursive: true });
  run(`import json\nfrom PIL import Image, ImageDraw\nim=Image.new('RGB',(800,500),tuple(${JSON.stringify(ground)}))\nd=ImageDraw.Draw(im)\nfor x in (80,330,580): d.rectangle([x,200,x+150,300],outline=tuple(${JSON.stringify(ink)}),width=4)\nfor x in (230,480): d.line([x,250,x+100,250],fill=tuple(${JSON.stringify(ink)}),width=4)\nim.save(${JSON.stringify(file)})\nprint(json.dumps(True))`);
}
const fileSha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

test('a section preview runs up to two lines an opened slide in a column within 70 % of the page, run-in labels bold with their colon', () => {
  const { pptx } = deck('preview-ko', `---\ntitle: 추정 입문\ntonality: chalk\nnotice: 예시 데이터 — 실제 수치로 바꿔 주세요\n---\n\n---\nlayout: text-column\n\n## 5강 학습 목표\n\n- 표본 평균으로 모평균을 추정하는 방법을 익힌다\n---\n\n---\nlayout: section\n\n# 표본 평균의 분포\n---\n\n---\nlayout: text-column\n\n## 표본 평균이 흩어지는 정도\n\n- 표본 평균은 표본을 새로 뽑을 때마다 조금씩 달라진다\n- 그 흩어짐을 표준오차라고 부르고 σ/√n으로 계산한다\n- 세 번째 줄은 미리보기에 나오지 않는다\n---\n\n---\nlayout: text-column\n\n## 예제: 직장인 36명의 하루 걸음 수\n\n- **결과** 표본 평균 7,850보, 표준오차 약 410보 (95% 구간 7,050-8,650)\n- **자료:** 직장인 36명, 일주일 평균 걸음 수, 스마트폰 기록\n- **주의** 이 줄도 미리보기에 나오지 않는다\n---\n`);
  const page = looks(pptx)[1].filter((s) => s.text && !s.name.startsWith('lit-notice') && !s.name.startsWith('title@'));
  const previews = page.filter((s) => /표본 평균은|결과|그 흩어짐/u.test(s.text));
  assert.ok(previews.length >= 2, JSON.stringify(page.map((s) => s.text)));
  for (const s of previews) {
    assert.ok(s.w <= 0.7 * 960 + 0.5, `preview ${Math.round(s.w)} pt wide, over 70 % of the page`);
    assert.ok(s.w >= 0.6 * 960, `preview ${Math.round(s.w)} pt wide: the wide column keeps most of the cap`);
    assert.ok(lines(s.text).length <= 2, `more than two lines: ${JSON.stringify(s.text)}`);
  }
  assert.ok(!page.some((s) => /나오지 않는다/u.test(s.text)), 'a third line stays out of the preview');
  const runs = [...parts(pptx, 'ppt/slides/slide\\d+\\.xml')[1].matchAll(/<a:r><a:rPr([^>]*)>[\s\S]*?<a:t>([^<]*)<\/a:t><\/a:r>/gu)].map((m) => ({ text: m[2], bold: /\bb="1"/u.test(m[1]) }));
  assert.ok(runs.some((r) => r.bold && r.text === '결과:'), `a bold run-in label with its colon: ${JSON.stringify(runs)}`);
  assert.ok(runs.some((r) => r.bold && r.text === '자료:'), 'a label that brings its own colon keeps one');
  assert.ok(!runs.some((r) => r.text.includes('::')), 'never two colons');
  // An English preview stops at about 70 characters of body text.
  const en = deck('preview-en', `---\ntitle: Support review\ntonality: night\n---\n\n---\nlayout: text-column\n\n## Ticket volume\n\n- Tickets fell 14% in the quarter\n---\n\n---\nlayout: section\n\n# Data notes\n---\n\n---\nlayout: references-appendix\n\n## Sources and definitions\n\n- **Helpdesk** export from 1 July to 30 September 2026, every closed ticket (sample).\n- [2] Q3 2026 service targets, agreed in June 2026 (sample).\n- [3] First response: minutes from a ticket's arrival to the first human reply.\n---\n`);
  const latin = looks(en.pptx)[1].filter((s) => /Helpdesk|service targets/u.test(s.text));
  assert.ok(latin.length && latin.every((s) => s.w <= 70 * 13 * 0.5 + 0.5), JSON.stringify(latin.map((s) => [s.w, s.text])));
});

test('a bottom title ends on the body floor whatever its line count, and the gate fails one that floats above it', () => {
  const chart = '::: chart type=column unit="천 명"\n| 분기 | 신규 가입 (천 명) | 해지 (천 명) |\n|---|---|---|\n| 25년 3Q | 5.1 | 2.2 |\n| 25년 4Q | 6.4 | 2.5 |\n| 26년 1Q | 7.7 | 2.4 |\n| 26년 2Q | 9.0 | 2.6 |\n> 분기별 신규 가입과 해지 (예시 데이터)\n:::\n\n- 신규 가입은 네 분기 동안 5,100명에서 9,000명으로 늘었다\n- 해지는 분기마다 2,200-2,600명 사이에서 거의 그대로였다\n- 출처: 예시 대리점 가입 관리 기록';
  const { pptx } = deck('floor', `---\ntitle: 가입\ntonality: paper\nnotice: 예시 데이터 — 실제 수치로 바꿔 주세요\n---\n\n---\nlayout: chart-insight\ntitle: bottom-anchor\n\n## 분기별 신규 가입과 해지 추이\n\n${chart}\n---\n\n---\nlayout: chart-insight\ntitle: bottom-anchor\n\n## 영남권 네 지역 대리점의 분기별 신규 가입과 해지 추이, 2025년 3분기부터 2026년 2분기까지\n\n${chart}\n---\n`);
  const slides = looks(pptx);
  const titles = slides.map((s) => s.find((x) => x.name === 'title@bottom-anchor'));
  assert.ok(titles.every(Boolean), JSON.stringify(slides.map((s) => s.map((x) => x.name))));
  assert.deepEqual(titles.map((t) => lines(t.text).length), [1, 2]);
  for (const t of titles) {
    const textBottom = t.y + lines(t.text).length * 26 * 1.15;
    assert.ok(textBottom >= 486 - 12 && t.y + t.h <= 487, `title text ends at ${textBottom.toFixed(0)}, frame ${t.y.toFixed(0)}+${t.h.toFixed(0)}`);
  }
  // A chart beside its takeaways grows into the room a one-line title used to leave under itself.
  for (const s of slides) {
    const c = s.find((x) => x.chart);
    const t = s.find((x) => x.name === 'title@bottom-anchor');
    if (s.some((x) => x.text && x.x >= c.x + c.w)) assert.ok(c.y + c.h >= t.y - 60, `chart ends at ${(c.y + c.h).toFixed(0)}, title at ${t.y.toFixed(0)}`);
  }
  const report = deckGate(pptx).report;
  assert.deepEqual([...ruled(report, 'OF-115'), ...ruled(report, 'OF-113')], []);
  // The earlier geometry: the title and what stands on its line 54 pt higher, the floor under it empty.
  const up = join(engineScratch, 'floor-up.pptx');
  plant(pptx, up, "for s in p.slides[0].shapes:\n    if s.top >= Pt(380) and not s.name.startswith('lit-notice'):\n        s.top = s.top - Pt(54)");
  const raised = ruled(deckGate(up).report, 'OF-115');
  assert.ok(raised.some((f) => f.slide === 1 && f.severity === 'HIGH' && /bottom title/u.test(f.note)), JSON.stringify(raised));
});

test('a side rail carries the criteria labels, the takeaways and the source under its title, and the gate fails a rail left empty', () => {
  const cmp = oneSlide('rail-cmp', 'ledger', 'layout: comparison\ntitle: side-rail\n\n## 상반기 계획 대비 실적 비교\n\n:::: columns 1fr 1fr\n::: col\n- **계획**\n  (1) 가입자: 42만 명, 전년 상반기 36만 명보다 17% 많은 목표\n  (2) 매출: 380억 원, 전년 상반기 331억 원보다 15% 많은 목표\n  (3) 해지율: 월 1.8%, 전년 상반기 2.1%보다 낮은 수준\n  (4) 획득 비용: 1인당 2만 8천 원, 전년과 같은 수준\n:::\n::: col\n- **실적**\n  (1) 가입자: 44만 명으로 계획보다 2만 명(▲ +4.8%) 많았다\n  (2) 매출: 391억 원으로 계획보다 11억 원 많았다\n  (3) 해지율: 월 1.6%로 계획보다 0.2%p 낮았다\n  (4) 획득 비용: 1인당 2만 6천 원으로 계획보다 2천 원 적었다\n:::\n::::\n\n- 출처: 예시 기업 2026년 사업 계획(1월 확정), 상반기 내부 결산 자료\n- 주: 전년 대비는 2025년 상반기 기준');
  const title = cmp.page.find((s) => s.name === 'title@side-rail');
  assert.ok(title, JSON.stringify(cmp.page.map((s) => s.name)));
  const titleBottom = title.y + lines(title.text).length * 26 * 1.15;
  for (const label of ['가입자', '매출', '해지율', '획득 비용']) {
    const s = cmp.page.find((x) => x.text === label);
    assert.ok(s && s.x + s.w <= 336.5 && s.y >= titleBottom, `${label} in the rail under the title: ${JSON.stringify(s)}`);
  }
  const strip = cmp.page.find((s) => s.text.startsWith('출처:'));
  assert.ok(strip && strip.x + strip.w <= 336.5 && strip.y + strip.h >= 440, `the source at the rail's foot: ${JSON.stringify(strip)}`);
  assert.ok(cmp.page.filter((s) => /계획보다/u.test(s.text)).every((s) => s.x >= 335.5), 'the sides keep the body beside the rail');
  const g1 = deckGate(cmp.pptx).report;
  assert.deepEqual([...ruled(g1, 'OF-110'), ...ruled(g1, 'OF-115')], [], 'still read as a side rail, and the rail is used');
  const chart = oneSlide('rail-chart', 'ledger', 'layout: chart-insight\ntitle: side-rail\n\n## 주차별 미처리 문의, 목표 대비 실적\n\n::: chart type=column unit="건"\n| 주차 | 실적 (건) | 목표 (건) |\n|---|---|---|\n| 8월 3주 | 612 | 590 |\n| 8월 4주 | 571 | 545 |\n| 9월 1주 | 534 | 500 |\n| 9월 2주 | 492 | 455 |\n| 9월 3주 | 455 | 410 |\n| 9월 4주 | 418 | 365 |\n> 주차별 미처리 문의, 실적과 목표 (예시 데이터)\n:::\n\n- 9월 미처리 문의는 주당 평균 39건씩 줄었다 (534 → 418건)\n- 이 속도면 약 11주 뒤인 12월 셋째 주에 미처리 문의가 0이 된다\n- 목표와의 차이는 8월 3주 22건에서 9월 4주 53건으로 커졌다\n- 연말 목표(12월 첫째 주, 10주 뒤)에 맞추려면 주당 약 42건씩 줄여야 한다\n- 출처: 예시 고객센터 문의 관리 시스템 주간 집계');
  const takeaways = chart.page.filter((s) => /주당 평균|11주 뒤|차이는|연말 목표/u.test(s.text));
  assert.equal(takeaways.length, 4, JSON.stringify(chart.page.map((s) => s.text.slice(0, 16))));
  assert.ok(takeaways.every((s) => s.x + s.w <= 336.5), 'the takeaways stand in the rail');
  const plot = chart.page.find((s) => s.chart);
  assert.ok(plot.x >= 335.5 && plot.w >= 500, `the chart takes the body beside the rail: ${JSON.stringify(plot)}`);
  const g2 = deckGate(chart.pptx).report;
  assert.deepEqual([...ruled(g2, 'OF-110'), ...ruled(g2, 'OF-115')], []);
  // A side rail pinned on a slide with nothing to put in it is reported.
  const empty = oneSlide('rail-empty', 'studio', 'layout: text-column\ntitle: side-rail\n\n## 접이식 의자 하나로 바꾸는 현관\n\n- 1만 회 접기 시험 통과 (예시)\n- 펼치면 다리가 자동으로 잠긴다\n- 접으면 두께가 6cm로 줄어 문 뒤에 걸린다\n- 앉는 면이 100kg까지 버틴다');
  assert.ok(ruled(deckGate(empty.pptx).report, 'OF-115').some((f) => f.severity === 'HIGH' && /rail/u.test(f.note)));
});

test('a slide whose rail would stay empty takes another title unless the source pins the rail', () => {
  // Chalk sets definitions under a side rail by default; a method with nothing for the rail takes another title.
  const { page } = oneSlide('rail-method', 'chalk', 'layout: method\n\n## 표준오차 식과 기호의 뜻\n\nSE = σ / √n\n\n- **SE** 표본 평균의 표준오차 (예: 걸음 수 평균의 흩어짐)\n  (1) 예제: 약 410보\n- **σ** 모집단의 표준편차\n  (1) 예제: 하루 걸음 수 표준편차 약 2,460보\n- **n** 표본 크기, 뽑은 사람 수\n  (1) 예제: 직장인 36명\n- **√n** 표본이 네 배가 되면 표준오차는 절반이 된다\n  (1) 예제: 144명이면 약 205보');
  const title = page.find((s) => s.name.startsWith('title@'));
  assert.notEqual(title.name, 'title@side-rail', 'the rail would hold the title alone');
});

test('beside a chart, the source and note close the takeaway column instead of running across the body', () => {
  const { pptx, page } = oneSlide('column-strip', 'ledger', 'layout: chart-insight\ntitle: top-rule\n\n## 분기별 영업이익 실적과 계획 추이\n\n::: chart type=column unit="억 원"\n| 분기 | 영업이익 실적 (억 원) | 영업이익 계획 (억 원) | 전년 (억 원) | 목표 (억 원) |\n|---|---|---|---|---|\n| 25년 2Q | 84 | 80 | 71 | 82 |\n| 25년 3Q | 88 | 85 | 74 | 86 |\n| 25년 4Q | 93 | 90 | 79 | 92 |\n| 26년 1Q | 97 | 94 | 84 | 96 |\n| 26년 2Q | 102 | 98 | 88 | 100 |\n| 26년 3Q | 110 | 103 | 93 | 105 |\n> 분기별 영업이익 실적과 계획 (예시 데이터)\n:::\n\n- 영업이익은 다섯 분기 연속 늘었고 여섯 분기 모두 계획을 넘었다\n- 3분기 영업이익은 전년 같은 분기보다 18% 늘었다\n- 출처: 예시 기업 분기 결산 자료(2025년 2분기-2026년 3분기), 연간 사업 계획\n- 주: 계획은 각 연도 1월에 확정한 분기 목표');
  const plot = page.find((s) => s.chart);
  const strip = page.find((s) => s.text.startsWith('출처:'));
  const points = page.filter((s) => /^(영업이익은 다섯|3분기 영업이익은)/u.test(s.text));
  if (points.every((s) => s.x >= plot.x + plot.w - 0.5)) {
    assert.ok(strip.x >= plot.x + plot.w - 0.5, `the strip stands in the takeaway column: chart ${JSON.stringify(plot)}, strip ${JSON.stringify(strip)}`);
    assert.ok(plot.y + plot.h >= 440, `the chart runs down to the floor: ${plot.y + plot.h}`);
  } else {
    // Two short points cannot fill a column beside the chart: they run under it, the strip across the foot.
    assert.ok(points.every((s) => s.y >= plot.y + plot.h - 0.5) && plot.w >= 0.9 * 912, JSON.stringify({ plot, points }));
  }
  assert.ok(strip.y + strip.h >= 470, `the strip stands on the floor: ${strip.y + strip.h}`);
  assert.deepEqual(ruled(deckGate(pptx).report, 'OF-115'), []);
});

test('compact process rows reach across the body, and a closing summary keeps its source in the strip', () => {
  const proc = oneSlide('rows-lead', 'chalk', 'layout: process\ntitle: top-rule\n\n## 가설 검정 4단계 절차와 점검 항목\n\n- **1. 세우기** 귀무가설과 대립가설을 말로 먼저 적는다\n  (1) 예제 평균 걸음 수가 7,000보와 같다 · 약 5분\n  (2) 확인 단측인지 양측인지 · 예제 양측\n- **2. 계산하기** 표본 평균과 표준오차로 검정 통계량을 구한다\n  (1) 도구 스프레드시트 함수 · 약 5분\n  (2) 결과 t = 2.07 · 자유도 35\n- **3. 판단하기** p값을 유의수준과 비교해 결론을 낸다\n  (1) p값 0.046 · 유의수준 0.05\n  (2) 결론 귀무가설 기각 · 차이는 약 850보\n- **4. 점검하기** 표본이 무작위였는지와 이상값을 다시 본다\n  (1) 도구 상자 그림 · 약 10분\n  (2) 이상값 1명 · 빼고 계산해도 결론 같음\n- 출처: 예제 자료 직장인 36명, 표 3 (예시)');
  const rests = proc.page.filter((s) => /^(귀무가설과|표본 평균과|p값을|표본이)/u.test(s.text));
  assert.equal(rests.length, 4, JSON.stringify(proc.page.map((s) => s.text.slice(0, 12))));
  // At body size the 26-character measure stopped near the middle of the body, its right third empty.
  for (const r of rests) assert.ok(r.x + r.w >= 24 + 912 * 0.75, `what happens reaches across: ${(r.x + r.w).toFixed(0)}`);
  assert.deepEqual(ruled(deckGate(proc.pptx).report, 'OF-115'), []);
  const close = oneSlide('summary-strip', 'chalk', 'layout: closing-summary-list\n\n## 이번 주 정리와 과제\n\n- 표준오차는 표본이 커질수록 √n에 반비례해 줄어든다\n- p값은 결론의 크기가 아니라 우연으로 설명될 가능성이다\n- 과제: 걸음 수 자료로 95% 구간을 구하고 해석을 금요일까지 낸다\n- 출처: 예시 통계 실습 자료, 2026 (예시)');
  const source = close.page.find((s) => s.text.startsWith('출처:'));
  assert.ok(source, JSON.stringify(close.page.map((s) => s.text.slice(0, 12))));
  assert.ok(!/^\d+$/u.test(close.page[close.page.indexOf(source) - 1]?.text ?? ''), 'the source is not a numbered summary row');
  assert.ok(source.h <= 24, `the source is set as the strip: ${JSON.stringify(source)}`);
});

test('a title panel over a picture hugs its text on the page foot, and Atlas sets a quote on the whole-page field', () => {
  run(`import json,os\nfrom PIL import Image\nos.makedirs(${JSON.stringify(join(engineScratch, 'assets'))},exist_ok=True)\nImage.new('RGB',(960,540),(170,180,190)).save(${JSON.stringify(join(engineScratch, 'assets', 'panel.png'))})\nprint(json.dumps(True))`);
  const { pptx } = deck('panel', '---\ntitle: 이동식 화분 선반\ntonality: atlas\ndate: 2026-10-02\ndepartment: 예시 정원 디자인 스튜디오\npresenter: 예시 디자이너\nnotice: 예시 이미지 데이터 — 실제 자료로 바꿔 주세요\n---\n\n---\nlayout: cover-full-image\n\n# 베란다용 이동식 화분 선반\n---\n\n---\nlayout: image-full\n\n## 세 칸으로 펼친 상태\n\n![도 1. 세 칸으로 펼친 모습 | 출처: 예시 이미지](assets/panel.png)\n---\n\n---\nlayout: quote\n\n## 시범 고객 후기\n\n“겨울에는 거실로, 봄에는 볕 드는 쪽으로 밀어 두기만 하면 돼요.”\n\n— 예시 고객 인터뷰, 아파트 베란다(4m²) 사용, 사용 3개월 차\n---\n');
  const slides = looks(pptx);
  const title = slides[0].find((s) => s.name === 'title@cover');
  const panel = slides[0].find((s) => s.fill && s.y <= title.y && s.y + s.h >= title.y + title.h && s.w < 960);
  assert.ok(panel, JSON.stringify(slides[0].map((s) => [s.name, s.fill, s.x, s.y, s.w, s.h])));
  assert.ok(panel.y + panel.h >= 539.5, `the panel bleeds off the foot: ${panel.y + panel.h}`);
  assert.ok(title.y - panel.y <= 36, `the panel starts just above the title: panel ${panel.y}, title ${title.y}`);
  const fullCanvas = (s) => s.fill && Math.round(s.x) === 0 && Math.round(s.y) === 0 && Math.round(s.w) === 960 && Math.round(s.h) === 540;
  assert.ok(slides[2].some(fullCanvas), 'the quote stands on the whole-page field');
  assert.deepEqual(ruled(deckGate(pptx).report, 'OF-115'), []);
  // The earlier plate (the field under the lower half, nothing above it) is reported.
  const plate = join(engineScratch, 'panel-plate.pptx');
  plant(pptx, plate, "s = p.slides[2]\nf = next(x for x in s.shapes if x.left == 0 and x.top == 0 and x.width == p.slide_width)\nf.top = Pt(300)\nf.height = Pt(240)\nt = next(x for x in s.shapes if x.name.startswith('title@'))\nt.top = Pt(330)");
  assert.ok(ruled(deckGate(plate).report, 'OF-115').some((f) => f.slide === 3 && /open page|plate/u.test(f.note)));
});

test('two tonalities of one source never draw the same skeleton, and the gate checks a pair with --sibling', () => {
  const work = join(engineScratch, 'sibling');
  run(`import json,os\nfrom PIL import Image\nos.makedirs(${JSON.stringify(join(work, 'assets'))},exist_ok=True)\nImage.new('RGB',(1600,900),(150,160,170)).save(${JSON.stringify(join(work, 'assets', 'example-a.png'))})\nprint(json.dumps(True))`);
  const md = join(work, 'lecture.md');
  writeFileSync(md, readFileSync(join(root, '.grok/skills/lit-pptx/examples/04-lecture-chalk-ko.md'), 'utf8'));
  for (const t of ['chalk', 'paper']) {
    const r = spawnSync(process.execPath, [compiler, md, '--tonality', t, '--pptx', join(work, `${t}.pptx`)], { cwd: work, env: childEnv, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  }
  const pair = deckGate(join(work, 'paper.pptx'), '--sibling', join(work, 'chalk.pptx')).report;
  assert.deepEqual(ruled(pair, 'OF-116'), []);
  const same = deckGate(join(work, 'paper.pptx'), '--sibling', join(work, 'paper.pptx'));
  const hit = ruled(same.report, 'OF-116');
  assert.ok(hit.length === 1 && hit[0].severity === 'HIGH' && /^0 of \d+ content slides/u.test(hit[0].note), JSON.stringify(hit));
  assert.equal(same.status, 1);
});

test('a dark tonality draws a figure\'s dark variant beside it, and the gate fails a light figure card on a dark ground', () => {
  const body = 'layout: figure-academic\n\n## Three-zone cooling layout\n\n![Figure 2. Cooling zones used in every trial | Source: synthetic sample diagram](assets/zones.png)\n\n- Coolant enters the first zone and leaves the third\n- Sensors sit at the inlet of each zone\n- Source: Figure 2, layout used in all 24 trials (sample)';
  const light = join(engineScratch, 'assets', 'zones.png'), dark = join(engineScratch, 'assets', 'zones.dark.png');
  rmSync(dark, { force: true });
  diagram(light, [255, 255, 255], [40, 40, 40]);
  const card = ruled(deckGate(oneSlide('figure-light', 'night', body).pptx).report, 'OF-117');
  assert.ok(card.some((f) => f.severity === 'HIGH' && f.slide === 1), JSON.stringify(card));
  diagram(dark, [15, 20, 25], [230, 236, 242]);
  const drawn = oneSlide('figure-dark', 'night', body).pptx;
  assert.ok(media(drawn).includes(fileSha(dark)), 'the dark variant is the picture drawn');
  assert.deepEqual(ruled(deckGate(drawn).report, 'OF-117'), []);
  // A light tonality keeps the figure as written.
  assert.ok(media(oneSlide('figure-paper', 'paper', body).pptx).includes(fileSha(light)));
});

test('a chart puts the accent on its current series: the latest period, else the measured series over a plan, else the last', () => {
  const colours = (pptx) => parts(pptx, 'ppt/charts/chart\\d+\\.xml')[0].split('<c:ser>').slice(1)
    .map((ser) => (/<c:spPr>[\s\S]*?<a:srgbClr val="([0-9A-F]{6})"/u.exec(ser) || [])[1]);
  const chart = (name, tonality, head) => oneSlide(name, tonality, `layout: chart-insight\n\n## Monthly values\n\n| Month | ${head[0]} | ${head[1]} |\n|---|---|---|\n| Jun | 2,840 | 2,410 |\n| Jul | 2,960 | 2,530 |\n| Aug | 3,150 | 2,600 |\n| Sep | 3,320 | 2,770 |\n\n> Monthly values (sample data)\n\n- Every month stayed above the comparison.`).pptx;
  assert.equal(colours(chart('accent-year', 'night', ['2026', '2025']))[0], 'E3A857', '2026 is the current year');
  assert.equal(colours(chart('accent-quarter', 'night', ['Q4 visits (k)', 'Q3 visits (k)']))[0], 'E3A857', 'Q4 is the current quarter');
  assert.equal(colours(chart('accent-quarter-2', 'night', ['H1 returns (%)', 'H2 returns (%)']))[1], 'E3A857');
  assert.equal(colours(chart('accent-plan', 'ledger', ['실적 (건)', '목표 (건)']))[0], '0E6B5A', 'the measured series over its target');
  assert.equal(colours(chart('accent-last', 'paper', ['Batch mixing (%)', 'Inline mixing (%)']))[1], '8C1C2B', 'else the last series, in every pack');
});

test('chart data labels keep the decimals the table writes', () => {
  const tenth = oneSlide('decimals', 'signal', 'layout: chart-insight\n\n## 월별 가입과 해지 추이\n\n| 월 | 가입 (천 명) | 해지 (천 명) |\n|---|---|---|\n| 7월 | 12.4 | 3.1 |\n| 8월 | 15.2 | 3.5 |\n| 9월 | 18.0 | 3.4 |\n\n> 월별 가입과 해지 (예시 데이터)\n\n- 9월 가입은 1만 8천 명이다');
  assert.match(parts(tenth.pptx, 'ppt/charts/chart\\d+\\.xml')[0], /<c:dLbls>[\s\S]*?<c:numFmt formatCode="#,##0\.0"/u, 'one decimal, as written');
  const whole = oneSlide('decimals-whole', 'signal', 'layout: chart-insight\n\n## 연간 방문객\n\n| 연도 | 방문객 |\n|---|---|\n| 2024 | 2,180 |\n| 2025 | 2,460 |\n| 2026 | 2,910 |\n\n> 연간 방문객 (예시 데이터)\n\n- 2026년 방문객은 전년보다 18% 늘었다');
  assert.match(parts(whole.pptx, 'ppt/charts/chart\\d+\\.xml')[0], /<c:dLbls>[\s\S]*?<c:numFmt formatCode="#,##0"/u);
});

test('Korean text runs carry lang ko-KR in tonality and legacy decks, and Latin-only runs keep en-US', () => {
  const tagged = (xml) => [...xml.matchAll(/<a:rPr([^>]*)>[\s\S]*?<a:t>([^<]*)<\/a:t>/gu)].map((m) => ({ text: m[2], lang: (/\blang="([^"]+)"/u.exec(m[1]) || [])[1], alt: (/\baltLang="([^"]+)"/u.exec(m[1]) || [])[1] }));
  const { pptx } = oneSlide('lang', 'ledger', 'layout: chart-insight\n\n## 주 3일 배송, 3분기 반품 추이\n\n| 월 | 반품 (천 건) |\n|---|---|\n| 7월 | 4.2 |\n| 8월 | 3.9 |\n| 9월 | 3.5 |\n\n> 월별 반품 (예시)\n\n- 9월 반품은 Q3 최저치다 (예시)\n- Q3 2026');
  const runs = parts(pptx, 'ppt/slides/slide\\d+\\.xml').flatMap(tagged);
  const korean = runs.filter((r) => /[가-힣]/u.test(r.text));
  assert.ok(korean.length > 3 && korean.every((r) => r.lang === 'ko-KR' && r.alt === 'en-US'), JSON.stringify(korean.filter((r) => r.lang !== 'ko-KR')));
  assert.ok(runs.some((r) => r.text === 'Q3 2026' && r.lang === 'en-US'));
  assert.match(parts(pptx, 'ppt/charts/chart\\d+\\.xml')[0], /<c:lang val="ko-KR"\/>/u, 'a chart with Korean labels is a Korean chart');
  const legacy = deck('lang-legacy', briefing.replace('tonality: ledger', 'template: AZURE-PRO').replace('layout: cover-typographic', 'layout: cover'), '--template', 'AZURE-PRO');
  const lruns = parts(legacy.pptx, 'ppt/slides/slide\\d+\\.xml').flatMap(tagged).filter((r) => /[가-힣]/u.test(r.text));
  assert.ok(lruns.length > 3 && lruns.every((r) => r.lang === 'ko-KR'), JSON.stringify(lruns.filter((r) => r.lang !== 'ko-KR').slice(0, 3)));
});

// Fix round 3: a short column is filled by layout and the gate reads the band inside it, a next step sets at
// its box width, an agenda carries no count numeral, two tonalities differ on two slides, a series keeps its
// colour, a wide figure runs across its terms, a run-in label keeps its colon, and a timeline's single
// takeaway, a chart's unit and a contact field stay where they belong.
// The largest empty band inside a text column, from its top down to where the visual ends, as a share of the body.
function columnGap(blocks, top, reach, floor = 486) {
  let gap = 0, cursor = top;
  for (const b of [...blocks].sort((m, n) => m.y - n.y)) { gap = Math.max(gap, b.y - cursor); cursor = Math.max(cursor, b.y + b.h); }
  return Math.max(gap, reach - cursor) / (floor - top);
}
const runsOf = (pptx, index) => [...parts(pptx, 'ppt/slides/slide\\d+\\.xml')[index].matchAll(/<a:r><a:rPr([^>]*)>[\s\S]*?<a:t>([^<]*)<\/a:t><\/a:r>/gu)]
  .map((m) => ({ text: m[2], bold: /\bb="1"/u.test(m[1]) }));

test('two or three short takeaways beside a chart, figure rows or a picture fill their column by layout, and the gate reads the band inside a column', () => {
  const chart = oneSlide('short-chart', 'studio', 'layout: chart-insight\ntitle: top-plain-large\n\n## 유사 기획전의 관람객 추이\n\n::: chart type=column unit="만 명"\n| 전시 | 1주 차 (만 명) | 4주 차 (만 명) | 8주 차 (만 명) |\n|---|---|---|---|\n| 2023년 원도심 옛 지도전 | 4.1 | 9.8 | 14.2 |\n| 2024년 항구 사진전 | 5.6 | 13.1 | 21.4 |\n| 2025년 근대 생활사전 | 6.2 | 15.7 | 26.9 |\n> 유사 기획전 세 건의 누적 관람객 (예시 데이터)\n:::\n\n- 최근 전시일수록 누적 관람객이 많고, 8주 차 평균 2.08만 명\n- 이번 전시 목표는 8주 2.5만 명\n- 출처: 예시 시립미술관 관람객 집계(2023~2025년)');
  const plot = chart.page.find((s) => s.chart);
  const points = chart.page.filter((s) => /^(최근 전시일수록|이번 전시 목표)/u.test(s.text));
  const beside = points.filter((s) => s.x >= plot.x + plot.w - 1);
  if (beside.length) {
    const top = Math.min(plot.y, ...beside.map((s) => s.y));
    assert.ok(columnGap(beside, top, Math.min(486, plot.y + plot.h)) <= 0.4, `takeaway column: ${JSON.stringify(beside.map((s) => [s.text.slice(0, 8), Math.round(s.y), Math.round(s.h)]))}`);
  } else {
    // Two short points cannot fill even a narrow column: they run under the chart, side by side.
    assert.ok(points.length === 2 && points.every((s) => s.y >= plot.y + plot.h - 1) && points[0].x !== points[1].x, JSON.stringify(points));
    assert.ok(plot.w >= 0.9 * 912, `the chart takes the body's width: ${plot.w}`);
  }
  assert.deepEqual(ruled(deckGate(chart.pptx).report, 'OF-115'), []);
  const rows = oneSlide('short-rows', 'signal', 'layout: kpi-row\ntitle: bottom-anchor\n\n## 출시 6개월 주문·재주문 지표\n\n| 월 주문 | 재주문 비율 | 평균 객단가 | 월 거래액 | 활성 고객 |\n|---|---|---|---|---|\n| 1만 8천 건 | 54% | 2만 1천 원 | 3억 7,800만 원 | 7,800명 |\n| 4월 6,200건 | 4월 31% | 목표 2만 원 | 4월 1억 2,400만 원 | 4월 3,100명 |\n\n> 2026년 9월 기준, 내부 주문 기록 (예시)\n\n- 출시 6개월 만에 재주문 비율이 절반을 넘었다 (31% → 54%)\n- 재주문 고객의 월평균 주문은 2.3회로 신규 고객의 두 배다\n- 평균 객단가는 목표 2만 원보다 5% 높다\n- 출처: 내부 주문 기록, 2026년 4-9월 (예시)');
  assert.deepEqual(ruled(deckGate(rows.pptx).report, 'OF-115'), [], 'the takeaways beside the figure rows share the column');
  // A wide picture beside four takeaways takes more than half the body (it stood in half, a third of its column empty).
  diagram(join(engineScratch, 'assets', 'wide.png'), [220, 224, 230], [150, 156, 166]);
  const pic = oneSlide('short-picture', 'signal', 'layout: image-split\ntitle: bottom-anchor\n\n## 맞벌이 가구 주간 세탁 소요 시간\n\n![도 1. 주말 세탁 장면 | 출처: 예시 이미지](assets/wide.png)\n\n- 맞벌이 가구는 빨래에 주말 반나절을 쓴다: 주 4.2시간 중 68%\n- 1인 가구는 주 2.6시간, 평일 저녁 비중이 32%로 더 높다\n- 세탁소 방문은 월 3.1회, 한 번에 왕복 평균 24분이 걸린다\n- 응답 가구 41%가 월 2만 원 이하면 대행을 쓰겠다고 답했다\n- 출처: 수도권 맞벌이·1인 가구 600가구 설문, 2026년 6월 (예시)');
  const image = pic.page.find((s) => s.picture);
  assert.ok(image && image.w >= 0.55 * 912, `the picture takes more than half the body: ${JSON.stringify(image)}`);
  assert.deepEqual(ruled(deckGate(pic.pptx).report, 'OF-115'), []);
  // The gate reads the band inside the column, not its last block: points that stop high above the strip fail.
  const short = join(engineScratch, 'short-planted.pptx');
  plant(pic.pptx, short, "s = p.slides[0]\nk = 0\nfor sh in s.shapes:\n    if sh.has_text_frame and sh.text_frame.text.startswith(('맞벌이 가구는', '1인 가구는', '세탁소 방문은', '응답 가구')):\n        sh.top, sh.height = Pt(40 + 20 * k), Pt(18)\n        k += 1");
  const found = ruled(deckGate(short).report, 'OF-115');
  assert.ok(found.some((f) => /column beside a longer one/u.test(f.note)), JSON.stringify(found));
});

test("a takeaway column that closes with the chart's values fills by layout, and the gate reads the values table as part of it", () => {
  // Two one-line takeaways, the chart's values under them and the source on the floor stood 42 % empty under the table.
  const { pptx, page } = oneSlide('values-column', 'studio', 'layout: asymmetric-feature\n\n## Unit sales by glaze, Q3\n\n::: chart type=bar unit="units"\n| Glaze | Units |\n|---|---|\n| Ash white | 4,820 |\n| Iron black | 3,610 |\n| Celadon | 2,140 |\n| Speckled oat | 1,930 |\n> Units sold by glaze (example data)\n:::\n\n- **Lead** Ash white, 39% of units\n- **Plan** Celadon moves to a gift box of two\n- Source: Example studio sales ledger');
  const plot = page.find((s) => s.chart);
  const column = page.filter((s) => (/^Table/u.test(s.name) || /^(Lead|Plan|Source):/u.test(s.text)) && s.x >= plot.x + plot.w - 1);
  if (column.length) {
    const top = Math.min(plot.y, ...column.map((s) => s.y));
    assert.ok(columnGap(column, top, Math.min(486, plot.y + plot.h)) <= 0.4, `takeaway column: ${JSON.stringify(column.map((s) => [s.text.slice(0, 8), Math.round(s.y), Math.round(s.h)]))}`);
  }
  assert.deepEqual(ruled(deckGate(pptx).report, 'OF-115'), []);
  // The same column set by hand, the table straight under the two points, fails.
  const hole = join(engineScratch, 'values-hole.pptx');
  plant(pptx, hole, `s = p.slides[0]
for sh in s.shapes:
    t = sh.text_frame.text if sh.has_text_frame else ""
    if getattr(sh, "has_chart", False) and sh.has_chart:
        sh.left, sh.top, sh.width, sh.height = Pt(24), Pt(108), Pt(366), Pt(358)
    elif t.startswith("Figure 1."):
        sh.left, sh.top, sh.width, sh.height = Pt(24), Pt(472), Pt(366), Pt(14)
    elif t.startswith(("Lead:", "Plan:")):
        sh.left, sh.top, sh.width, sh.height = Pt(434), Pt(108 if t.startswith("Lead:") else 136), Pt(502), Pt(22)
    elif t.startswith("Source:"):
        sh.left, sh.top, sh.width, sh.height = Pt(414), Pt(474), Pt(522), Pt(12)
    elif getattr(sh, "has_table", False) and sh.has_table:
        sh.left, sh.top, sh.width = Pt(414), Pt(177), Pt(522)
        for row in sh.table.rows:
            row.height = Pt(140 / len(sh.table.rows))
        sh.height = Pt(140)
    elif sh.width < Pt(8) and sh.height < Pt(8):
        sh.left = Pt(414)`);
  const found = ruled(deckGate(hole).report, 'OF-115');
  assert.ok(found.some((f) => /column beside a longer one/u.test(f.note)), JSON.stringify(found));
});

test('a short sidebar note beside a long main column stands across the top and the main points run in two columns under it', () => {
  const { pptx, page } = oneSlide('sidebar-short', 'chalk', 'layout: sidebar-note\ntitle: top-rule\n\n## Four common calibration mistakes\n\n- **Reading outside the standards**\n  (1) A sample above 8 mg/L must be diluted and measured again\n  (2) The fit says nothing about linearity beyond the top standard\n- **Forcing the line through zero**\n  (1) A blank still gives a small signal, and dropping it biases low samples\n  (2) Here, forcing zero moves a 0.5 mg/L sample by about 2%\n- **Measuring standards in one rising run**\n  (1) Drift over the run then looks like a change in slope\n  (2) Randomise the order and rerun the blank at the end\n- **Skipping the residual check**\n  (1) A high r² can hide one bad standard; the practice run still had r² 0.99\n  (2) Read the residual table before you read the slope\n\n::: main-box\nReport the value, its interval and the standard range together\n:::');
  const note = page.find((s) => s.text.startsWith('Report the value'));
  const heads = page.filter((s) => /^(Reading outside|Forcing the line|Measuring standards|Skipping the residual)/u.test(s.text));
  assert.ok(note && heads.every((h) => h.y > note.y + note.h), 'the note stands above the main points');
  assert.equal(new Set(heads.map((h) => Math.round(h.x))).size, 2, `two columns: ${JSON.stringify(heads.map((h) => Math.round(h.x)))}`);
  assert.deepEqual(ruled(deckGate(pptx).report, 'OF-115'), []);
  // The note in a narrow column beside points that stop short of three quarters of the body is still read.
  const beside = join(engineScratch, 'sidebar-beside.pptx');
  plant(pptx, beside, `s = p.slides[0]
y = 120
for sh in s.shapes:
    t = sh.text_frame.text if sh.has_text_frame else ""
    if t.startswith("Report the value"):
        sh.left, sh.top, sh.width, sh.height = Pt(660), Pt(120), Pt(264), Pt(50)
    elif sh.has_text_frame and t and not sh.name.startswith(("title@", "lit-notice")):
        sh.left, sh.top, sh.width, sh.height = Pt(24), Pt(y), Pt(600), Pt(18)
        y += 22
    elif not sh.name.startswith(("family@", "lit-notice", "title@")):
        sh.left, sh.top, sh.width, sh.height = Pt(648), Pt(120), Pt(288), Pt(62)`);
  const found = ruled(deckGate(beside).report, 'OF-115');
  assert.ok(found.some((f) => /column beside a longer one/u.test(f.note)), JSON.stringify(found));
});

test('takeaways beside figure rows fill their column down to the body floor, and the gate reads that column to the floor', () => {
  // Four figures and four takeaways under a bottom title: the column stood 45 % open while the rows also stopped short.
  const { pptx, page } = oneSlide('kpi-floor', 'signal', 'layout: kpi-row\ntitle: bottom-anchor\n\n## 출시 9개월 고객사·설비 지표\n\n| 고객사 | 연결 설비 | 월 반복 매출 | 해지율 |\n|---|---|---|---|\n| 46곳 | 3,820대 | 3,440만 원 | 월 1.1% |\n| 1월 9곳 | 1월 610대 | 1월 550만 원 | 목표 2% 이하 |\n\n- 막은 정지 212건, 건당 약 800만 원씩 고객사 손실 약 17억 원 절감\n- 1월 대비 고객사 5.1배(9곳 → 46곳), 연결 설비 6.3배(610대 → 3,820대)\n- 고객사 한 곳당 설비 약 83대, 월 반복 매출 약 75만 원(설비당 약 9천 원)\n- 해지율 월 1.1%, 목표 2%의 절반 남짓\n- 출처: 내부 계약·알림 기록, 2026년 1-9월 (예시)');
  const title = page.find((s) => s.text.startsWith('출시 9개월'));
  const figure = page.find((s) => s.text === '46곳');
  const points = page.filter((s) => /^(막은 정지|1월 대비|고객사 한 곳당|해지율 월)/u.test(s.text));
  const source = page.find((s) => s.text.startsWith('출처:'));
  assert.equal(points.length, 4);
  if (points.every((s) => s.x > figure.x + 200)) {
    assert.ok(columnGap([...points, source], figure.y, title.y, title.y) <= 0.4, `takeaway column: ${JSON.stringify(points.map((s) => [s.text.slice(0, 6), Math.round(s.y), Math.round(s.h)]))}`);
  }
  assert.deepEqual(ruled(deckGate(pptx).report, 'OF-115'), []);
  // The points close under one another at the column's top, as before: the gate fails it though the rows stop short too.
  const short = join(engineScratch, 'kpi-floor-planted.pptx');
  plant(pptx, short, "s = p.slides[0]\nk = 0\nx = max(sh.left for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.startswith('출처:'))\nfor sh in s.shapes:\n    if sh.has_text_frame and sh.text_frame.text.startswith(('막은 정지', '1월 대비', '고객사 한 곳당', '해지율 월')):\n        sh.left, sh.top, sh.width, sh.height = x + Pt(20), Pt(36 + 56 * k), Pt(346), Pt(50 if k < 3 else 25)\n        k += 1\n    elif sh.width < Pt(8) and sh.height < Pt(8):\n        sh.top = Pt(4)");
  const found = ruled(deckGate(short).report, 'OF-115');
  assert.ok(found.some((f) => /column beside a longer one/u.test(f.note)), JSON.stringify(found));
});

test('summary groups of unequal length split where the two columns come out nearest even', () => {
  // Three, three and two points: split by count, the last group stood alone and left its column half empty.
  const { pptx, page } = oneSlide('summary-split', 'gazette', 'layout: summary-box-list\n\n## 검토 결과 핵심 요약과 건의 방향\n\n::: key-message\n재택근무를 주 2일로 정례화하되, 팀마다 협업일 하루를 지정해 대면 회의를 그날에 모은다\n:::\n\n- **시범 운영 결과**\n  (1) 월평균 이용률 78%, 본부 간 편차 최대 21%p\n  (2) 업무 만족도 3.4점 → 4.1점 (5점 척도, 응답 523명)\n  (3) 과제 기한 준수율 92% → 93%, 생산성 변화는 미미\n- **남은 불편**\n  (1) 불편 사항의 64%가 회의 일정 조율과 대면 협업 부족\n  (2) 주간 회의 시간 1인당 4.1시간에서 5.3시간으로 증가\n  (3) 신규 입사자 업무 적응 기간 평균 2주 증가 (6주 → 8주)\n- **건의 방향**\n  (1) 제도 자체보다 협업일 운영 방식이 성패를 가른다\n  (2) 비용은 회의실 예약 체계 개편 4천만 원뿐이다\n- 출처: 재택근무 시범 운영 기록과 직원 만족도 조사, 2025.10-2026.09 (예시)');
  const third = page.find((s) => s.text.includes('건의 방향'));
  const second = page.find((s) => s.text.includes('남은 불편'));
  assert.ok(second && third && Math.abs(second.x - third.x) < 1, `the second group stands beside the first, with the third: ${JSON.stringify([second, third])}`);
  assert.deepEqual(ruled(deckGate(pptx).report, 'OF-115'), []);
});

test('a next-step line that fits its box sets on one line across it, and a longer one keeps the measure', () => {
  const { page } = oneSlide('next-step', 'chalk', "layout: closing-ask\n\n## 5강 전까지 회귀 실습 과제\n\n| 과제 | 분량 | 배점 | 기한 | 확인할 점 |\n|---|---|---|---|---|\n| 산점도와 회귀선 그리기 | 자료 20건 이상 | 6점 | 10월 5일(월) | 이상값 표시 |\n| 기울기 해석하기 | 1문장 | 4점 | 10월 6일(화) | 단위 포함 |\n| 잔차 그림과 이상값 확인 | 그림 1장 | 6점 | 10월 7일(수) | 곡선 패턴 여부 |\n| R² 해석하기 | 2문장 이내 | 4점 | 10월 8일(목) | '정확도'로 읽지 않기 |\n\n- 과제: 5강(10월 9일) 전까지 자료 20건 이상으로 회귀를 직접 한 번 해 본다\n- 제출: 단계마다 기한까지 학습 게시판의 한 게시물에 이어서 올린다 (4강 과제, 총 20점)\n- 다음 시간: 잔차 분석과 다중회귀, 질문은 전날까지 게시판에 (예시 강사)");
  const task = page.find((s) => s.text.startsWith('과제:'));
  assert.ok(task && lines(task.text).length === 1 && task.w >= 700, `one line across the box: ${JSON.stringify(task)}`);
  // The old 34-em measure broke this line before its last word ("해 본다" alone on line two).
  for (const s of page.filter((x) => /^(과제|제출|다음 시간):/u.test(x.text))) assert.ok(s.w >= 400, JSON.stringify(s));
});

test('an agenda takes no count numeral beside its title, and the gate fails one (OF-119)', () => {
  const { pptx, page } = oneSlide('agenda-numeral', 'chalk', 'layout: agenda\n\n## 4강 학습 목표와 순서\n\n- **표본과 모집단** 전부를 볼 수 없을 때 일부로 짐작하는 이유\n- **표본 평균의 흔들림** 같은 방법으로 뽑아도 평균이 매번 다른 까닭\n- **신뢰구간 계산** 평균, 표준편차, 표본 크기로 범위를 구하는 네 단계\n- **흔한 실수** 구간을 잘못 읽는 세 가지 방식');
  const title = page.find((s) => s.name.startsWith('title@'));
  assert.notEqual(title.name, 'title@kicker-numeral');
  assert.ok(!page.some((s) => s.text === '4' && s.y < 120), 'no stray numeral beside the title');
  assert.ok(title.x <= 30, `the title starts at the margin: ${title.x}`);
  const planted = join(engineScratch, 'agenda-planted.pptx');
  plant(pptx, planted, "s = p.slides[0]\nt = [sh for sh in s.shapes if sh.name.startswith('title@')][0]\nt.left = Pt(180)\nt.name = 'title@kicker-numeral'\nb = s.shapes.add_textbox(Pt(24), Pt(36), Pt(120), Pt(72))\nb.text_frame.text = '4'\nb.text_frame.paragraphs[0].runs[0].font.size = Pt(60)");
  assert.ok(ruled(deckGate(planted).report, 'OF-119').some((f) => f.slide === 1), JSON.stringify(deckGate(planted).report.deck_output.findings.map((f) => f.rule)));
});

test('two tonalities of one source differ on at least two content slides once a deck has four, and a pack draws a comparison in its own structure', () => {
  const work = join(engineScratch, 'structure');
  run(`import json,os\nfrom PIL import Image\nos.makedirs(${JSON.stringify(join(work, 'assets'))},exist_ok=True)\nImage.new('RGB',(1600,900),(150,160,170)).save(${JSON.stringify(join(work, 'assets', 'example-a.png'))})\nprint(json.dumps(True))`);
  const md = join(work, 'lecture.md');
  writeFileSync(md, readFileSync(join(root, '.grok/skills/lit-pptx/examples/04-lecture-chalk-ko.md'), 'utf8'));
  for (const t of ['chalk', 'paper']) {
    const r = spawnSync(process.execPath, [compiler, md, '--tonality', t, '--pptx', join(work, `${t}.pptx`)], { cwd: work, env: childEnv, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  }
  assert.deepEqual(ruled(deckGate(join(work, 'chalk.pptx'), '--sibling', join(work, 'paper.pptx')).report, 'OF-116'), []);
  // One differing slide of six fails, two pass.
  const bar = run(`import sys,json\nsys.path.insert(0,${JSON.stringify(scripts)})\nimport deck_output as d\na=[('top','one')]*6\nseq=iter([a,[('side','one')]+a[1:],a,[('side','one'),('side','grid')]+a[2:]])\nd.skeleton=lambda prs: next(seq)\nprint(json.dumps([d.compare_skeletons(None,None),d.compare_skeletons(None,None)]))`);
  assert.equal(bar[0].length, 1, JSON.stringify(bar));
  assert.match(bar[0][0].note, /needs 2/u);
  assert.deepEqual(bar[1], []);
  // Chalk draws a comparison on its board rail, Paper as a ruled table under its title.
  const cmp = 'layout: comparison\n\n## 양측 검정과 단측 검정의 차이\n\n:::: columns 1fr 1fr\n::: col\n- **양측 검정**\n  (1) 질문: 두 평균이 다른가\n  (2) 기각 영역: 양쪽 꼬리에 0.025씩\n  (3) 예제 결과: p ≈ 0.043, 기각\n  (4) 쓰는 때: 방향을 미리 정할 근거가 없을 때\n:::\n::: col\n- **단측 검정**\n  (1) 질문: A반 평균이 더 큰가\n  (2) 기각 영역: 오른쪽 꼬리에 0.05\n  (3) 예제 결과: p ≈ 0.022, 기각\n  (4) 쓰는 때: 자료를 보기 전에 방향을 정했을 때\n:::\n::::\n\n- 같은 자료에서 단측 p값은 양측 p값의 절반이다\n- 그래서 방향은 자료를 보기 전에 정해 두고, 보고서에 그 근거를 적는다\n- 주: 자료를 본 뒤 단측으로 바꾸면 유의수준이 사실상 두 배가 된다';
  assert.equal(oneSlide('structure-chalk', 'chalk', cmp).page.find((s) => s.name.startsWith('title@')).name, 'title@side-rail');
  assert.equal(oneSlide('structure-paper', 'paper', cmp).page.find((s) => s.name.startsWith('title@')).name, 'title@top-rule');
});

test('a series keeps one colour across the deck: alone on a chart it takes the colour it has beside the highlighted series', () => {
  const { pptx } = deck('series-role', '---\ntonality: paper\ntitle: Staged feeding\n---\n\n---\nlayout: chart-insight\n\n## Single-feed baseline conversion\n\n::: chart type=line unit="%"\n| Time (min) | Single feed (%) |\n|---|---|\n| 0 | 0 |\n| 30 | 35 |\n| 60 | 50 |\n:::\n\n- Conversion stalls after minute 30\n---\n\n---\nlayout: chart-insight\n\n## Staged vs single feed conversion\n\n::: chart type=line unit="%"\n| Time (min) | Single feed (%) | Staged feed (%) |\n|---|---|---|\n| 0 | 0 | 0 |\n| 30 | 35 | 47 |\n| 60 | 50 | 75 |\n:::\n\n- The staged feed reaches 75% at 60 min\n---\n');
  const colours = (xml) => [...xml.matchAll(/<c:ser>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/gu)].map((m) => m[1].toUpperCase());
  const [single, pair] = parts(pptx, 'ppt/charts/chart\\d+\\.xml').map(colours);
  assert.equal(single[0], pair[0], `Single feed alone ${single[0]}, beside Staged feed ${pair[0]}`);
  assert.notEqual(pair[0], pair[1]);
});

test('a wide method figure runs across the body over its terms, and the Studio statement stands between hairlines', () => {
  const flow = join(engineScratch, 'assets', 'flow.png');
  diagram(flow, [255, 255, 255], [40, 44, 52]);
  run(`import json\nfrom PIL import Image\nim=Image.open(${JSON.stringify(flow)})\nim.crop((0,120,800,350)).save(${JSON.stringify(flow)})\nprint(json.dumps(True))`);
  const { page } = oneSlide('method-wide', 'paper', 'layout: method\n\n## Three-stage feed layout and symbols\n\n![Figure 2. Process layout used in all runs | Source: synthetic sample diagram](assets/flow.png)\n\n- **Layout:** the feed splits into three equal stages, inlets at 0, 1/3 and 2/3 of reactor length\n- **X:** conversion, the fraction of feed reacted\n  (1) Sampled at the outlet every 10 min, 0-60 min\n- **k, τ:** rate constant (1/min) and residence time (min); τ = V / F\n- **n:** number of feed stages\n  (1) n = 3 in all staged runs; n = 1 for the single-feed baseline\n- **F:** total feed rate, L/min\n  (1) Six rates tested: 0.5, 0.75, 1.0, 1.25, 1.5 and 2.0\n- Source: Figure 2, layout used in all 36 runs (sample)');
  const fig = page.find((s) => s.picture);
  const terms = page.filter((s) => /^(Layout|X|k, τ|n|F):/u.test(s.text) || /Layout:|conversion, the fraction/u.test(s.text));
  assert.ok(fig.w >= 450, `the wide figure is drawn wider than half the body: ${JSON.stringify(fig)}`);
  assert.ok(terms.length && terms.every((t) => t.y >= fig.y + fig.h), `terms under the figure: ${JSON.stringify(terms.map((t) => [t.text.slice(0, 10), Math.round(t.y)]))}`);
  const statement = oneSlide('studio-statement', 'studio', 'layout: statement\n\n## 접어 두면 6cm, 펼치면 의자 하나\n').page;
  assert.ok(!statement.some((s) => s.fill && Math.round(s.x) === 0 && Math.round(s.y) === 0 && s.h >= 400 && s.w < 400), 'no empty rail beside the studio statement');
  assert.ok(statement.filter((s) => !s.text && s.h <= 2 && s.w >= 800).length >= 2, `between two hairlines: ${JSON.stringify(statement.map((s) => [s.name, Math.round(s.w), Math.round(s.h)]))}`);
});

test('a bold run-in label takes its colon in the engine, and the gate fails one without a separator (OF-118)', () => {
  // Points with and without a label stay one list (all-labelled points would set the labels in a column of their own).
  const { pptx } = oneSlide('run-in', 'signal', 'layout: text-column\ntitle: top-rule\n\n## 서비스 흐름 요약\n\n- **요약** 앱에서 맡기면 저녁에 문 앞에서 수거하고 다음 날 저녁 9시 전에 돌려준다\n- **주문:** 오후 6-8시 사이 30분 단위로 수거 시간을 고른다\n- 배송 기사가 저녁 8시까지 문 앞에서 수거한다');
  const runs = runsOf(pptx, 0);
  assert.ok(runs.some((r) => r.bold && r.text === '요약:'), JSON.stringify(runs));
  assert.ok(runs.some((r) => r.bold && r.text === '주문:') && !runs.some((r) => r.text.includes('::')), 'a label with its own colon keeps one');
  assert.deepEqual(ruled(deckGate(pptx).report, 'OF-118'), []);
  const bare = join(engineScratch, 'run-in-bare.pptx');
  plant(pptx, bare, "s = p.slides[0]\nfor sh in s.shapes:\n    if sh.has_text_frame:\n        for para in sh.text_frame.paragraphs:\n            for r in para.runs:\n                if r.text == '요약:':\n                    r.text = '요약'");
  assert.ok(ruled(deckGate(bare).report, 'OF-118').some((f) => f.slide === 1), 'a bold label running into its sentence is reported');
});

test('a single takeaway stays with its timeline, a chart states its unit once, and a contact-split field starts where its rows end', () => {
  const tl = oneSlide('timeline-one', 'gazette', 'layout: timeline\ntitle: top-rule\n\n## 4분기 일정\n\n| 시점 | 일 | 상태 |\n|---|---|---|\n| 10월 2주 | 결제 이관 | 진행 |\n| 10월 4주 | 통합 시험 | 예정 |\n| 11월 2주 | 전체 공개 | 예정 |\n\n- 결제 이관이 끝나면 통합 시험을 바로 시작한다');
  const take = tl.page.find((s) => s.text.startsWith('결제 이관이 끝나면'));
  const labels = tl.page.filter((s) => /^(결제 이관|통합 시험|전체 공개)$/u.test(s.text));
  const lowest = Math.max(...labels.map((s) => s.y + s.h));
  assert.ok(take.y - lowest <= 60, `the takeaway follows the axis: label foot ${Math.round(lowest)}, takeaway ${Math.round(take.y)}`);
  const two = oneSlide('unit-legend', 'ledger', 'layout: chart-insight\ntitle: top-rule\n\n## 주차별 남은 작업 수\n\n::: chart type=line unit="개"\n| 주차 | 계획 (개) | 실적 (개) |\n|---|---|---|\n| 8월 4주 | 30 | 30 |\n| 9월 2주 | 21 | 22 |\n| 10월 2주 | 0 | 3 |\n:::\n\n- 남은 작업은 주당 다섯 개씩 줄어 11월 첫 주에 끝난다');
  assert.doesNotMatch(parts(two.pptx, 'ppt/charts/chart\\d+\\.xml')[0], /<c:valAx>[\s\S]*<c:title>/u, 'the legend carries the unit, so the axis carries no title');
  const one = oneSlide('unit-axis', 'ledger', 'layout: chart-insight\ntitle: top-rule\n\n## 회차별 사용성 시험 과업 성공률\n\n::: chart type=column unit="%"\n| 회차 | 과업 성공률 |\n|---|---|\n| 1차 | 68 |\n| 2차 | 77 |\n| 3차 | 84 |\n:::\n\n- 3차 시험에서 84%로 목표 85%에 다가섰다');
  const axis = /<c:valAx>[\s\S]*?<c:title>[\s\S]*?<a:bodyPr rot="(-?\d+)"/u.exec(parts(one.pptx, 'ppt/charts/chart\\d+\\.xml')[0]);
  assert.ok(axis && Number(axis[1]) % 21600000 === 0, `a level axis title: ${axis && axis[1]}`);
  const close = oneSlide('contact-field', 'studio', 'layout: closing-contact-split\n\n## 11월 본 판매 입점 조건 협의 안건\n\n| 안건 | 담당 | 일정 |\n|---|---|---|\n| 매장 전시·시연 | 예시 영업팀 | 10월 셋째 주 |\n| 초도 물량·납기 | 예시 생산팀 | 10월 말 |\n| 설치 서비스 | 예시 고객지원팀 | 10월 말 |\n\n- 요청: 조건 세 가지를 정한다');
  // The field moves left only when the rows and the step keep their sizes and line counts (it never costs type).
  const field = close.page.find((s) => s.fill && s.x > 300 && Math.round(s.x + s.w) === 960);
  assert.ok(field && field.x < 24 + 912 * 7 / 12 - 12, `the field starts where the rows end: ${JSON.stringify(field)}`);
});

test('an 11 pt chart caption the engine sets across the body is not read as body text', () => {
  // The compact ramp sets captions at 11 pt across the chart, so a long one runs past the 90-character
  // body measure on its first line. OF-102 starts above 11 pt for this reason; at 10.5 pt this fails.
  const { pptx } = deck('caption', `---
tonality: paper
title: Single-feed conversion study
notice: Sample data — replace with real figures
---

---
layout: cover-typographic

# Single-feed conversion study
---

---
layout: chart-insight

## Conversion over time at 2.0 L/min

::: chart type=line unit="%"
| Hour | Run A (%) | Run B (%) |
|---|---|---|
| 1 | 14 | 11 |
| 2 | 28 | 23 |
| 3 | 40 | 33 |
| 4 | 49 | 41 |
| 5 | 54 | 46 |
| 6 | 57 | 49 |
> Single-feed conversion over time at 2.0 L/min, mean of three replicates per run with the reactor held at 80 °C (synthetic sample data)
:::

- Run A leads Run B by eight points after six hours
- The gap opens in the first three hours and then holds
- Source: sample bench study, October 2026 (sample)
---
`);
  const captionLine = shapes(pptx, 2).map((s) => s[5]).find((text) => text.startsWith('Figure 1.')).split('\n')[0];
  assert.ok(captionLine.length > 90, captionLine);
  const { report } = deckGate(pptx);
  assert.deepEqual(report.office_craft.findings.filter((f) => f.rule === 'OF-102'), []);
});

test('a legacy template still compiles with no tonality', () => {
  const { pptx, log } = deck('legacy', briefing.replace('tonality: ledger', 'template: AZURE-PRO').replace('layout: cover-typographic', 'layout: cover'), '--template', 'AZURE-PRO');
  assert.doesNotMatch(log, /Tonality /);
  assert.ok(shapes(pptx, 3).length > 0);
});

test('the bundled faces are the official Pretendard Regular and Bold', () => {
  const dir = join(root, '.grok/skills/lit-pptx/pretendard-font/public/static');
  const sha = (name) => createHash('sha256').update(readFileSync(join(dir, name))).digest('hex');
  assert.equal(sha('Pretendard-Regular.otf'), '3ffbacde6ab8411f1d2db54bb9b1f0b3ee2a738932033722cf0388c06aed1c93');
  assert.equal(sha('Pretendard-Bold.otf'), '2e91915fab54df71cc9598ebf608b2bdb54c6fe3c066ac61dff0bc44fca71cc7');
});

test('every worked deck compiles and passes the deck gate, across all eight tonalities', () => {
  const examples = join(root, '.grok/skills/lit-pptx/examples');
  const work = join(engineScratch, 'examples');
  // Picture slides name neutral placeholders; the test draws them instead of shipping images.
  run(`import json,os\nfrom PIL import Image\nos.makedirs(${JSON.stringify(join(work, 'assets'))},exist_ok=True)\nfor i,c in enumerate('abc'): Image.new('RGB',(1600,900),(120+30*i,130,140)).save(os.path.join(${JSON.stringify(join(work, 'assets'))},f'example-{c}.png'))\nprint(json.dumps(True))`);
  const names = readdirSync(examples).filter((name) => name.endsWith('.md'));
  assert.ok(names.length >= 12, `${names.length} examples`);
  const used = new Set(), failures = [];
  for (const name of names) {
    const source = readFileSync(join(examples, name), 'utf8');
    used.add(/^tonality:\s*(\S+)/m.exec(source)?.[1]);
    const md = join(work, name), pptx = md.replace(/\.md$/, '.pptx');
    writeFileSync(md, source);
    const built = compile(md, '--pptx', pptx);
    if (built.status !== 0) { failures.push(`${name}: ${built.stderr.trim().split('\n').at(-1)}`); continue; }
    const { status, report } = deckGate(pptx);
    if (status !== 0) failures.push(`${name}: ${report.failure_reasons.join('; ')}`);
  }
  assert.deepEqual(failures, []);
  for (const id of ['atlas', 'chalk', 'gazette', 'ledger', 'night', 'paper', 'signal', 'studio']) assert.ok(used.has(id), id);
});

test('the office script children write no Python bytecode into the packaged skill folders', () => {
  assert.deepEqual(bytecodeWrittenSince(startedAt - 1000), []);
});

test('a line set by the engine never breaks inside a short parenthetical such as (▲ +3.9%)', () => {
  const G = require(join(scripts, 'lib', 'grid-resolver.js'));
  for (let w = 6; w <= 16; w += 0.5) {
    for (const set of [G.keepLines('1,184억 원으로 계획보다 44억 원(▲ +3.9%) 많았다', w, 12), G.keepLines('Revenue beat the plan by 44 (▲ +3.9 %) this quarter', w, 12), G.balanceLines('영업이익 110억 원(▲ +10.0%)', 2, w)]) {
      for (const line of set.split('\n')) assert.ok(!/\([^)]*$/u.test(line), `a break inside a short parenthetical: ${JSON.stringify(set)}`);
    }
  }
});
