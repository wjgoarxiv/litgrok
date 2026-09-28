import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
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

test('the office script children write no Python bytecode into the packaged skill folders', () => {
  assert.deepEqual(bytecodeWrittenSince(startedAt - 1000), []);
});
