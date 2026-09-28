import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync, readdirSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const root = fileURLToPath(new URL('../', import.meta.url));
const skill = join(root, '.grok/skills/readme-studio');
const read = path => readFileSync(path, 'utf8');
const workspace = () => realpathSync(mkdtempSync(join(tmpdir(), 'litgrok-production-')));
function run(argv, cwd) {
  const env = {PATH: process.env.PATH, HOME: cwd, TMPDIR: tmpdir()};
  return spawnSync(process.execPath, argv, {cwd, env, encoding:'utf8', timeout:30000});
}
function walk(dir, prefix='') {
  return readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(join(dir,e.name),prefix+e.name+'/') : [prefix+e.name]);
}
test('native catalog and actual installer enroll complete README Studio resources', () => {
  const catalog = JSON.parse(read(join(root,'.grok-plugin/plugin.json')));
  assert.ok(catalog.skills.includes('./.grok/skills/readme-studio'), 'native catalog must enroll readme-studio');
  const cwd = workspace();
  const installed = run([join(root,'bin/litgrok.mjs'),'install','--yes'],cwd);
  assert.equal(installed.status,0,installed.stderr);
  assert.doesNotMatch(installed.stdout,/DRY RUN/);
  const expected = ['SKILL.md','references/complete-contract.md','references/production.md','references/facts.md','references/typography.md','references/motion.md','references/decoration-patterns.md','scripts/validate-facts.mjs','templates/typography/outline.mjs','templates/typography/package-lock.json','templates/remotion/package-lock.json','templates/remotion/src/index.jsx','templates/hyperframes/index.html','templates/hyperframes/index.motion.json','templates/hyperframes/package-lock.json'];
  for (const file of expected) assert.ok(existsSync(join(skill,file)), file);
  for (const file of walk(skill)) assert.equal(read(join(cwd,'.grok/skills/readme-studio',file)),read(join(skill,file)), file);
  const target = join(cwd,'.grok/skills/readme-studio/references/facts.md');
  writeFileSync(target,'foreign modification\n');
  const refused = run([join(root,'bin/litgrok.mjs'),'install','--yes'],cwd);
  assert.notEqual(refused.status,0); assert.equal(read(target),'foreign modification\n');
});
test('decoration reference records observed patterns and the facts boundary', () => {
  const reference=read(join(skill,'references/decoration-patterns.md'));
  for (const name of ['Best-README-Template','guodongxiaren/README','assimp/assimp','mermaid-js/mermaid']) assert.ok(reference.includes(name),name);
  assert.match(reference,/2026-09-21/);
  assert.match(reference,/transient/i);
  for (const pattern of [/emoji section headers/i,/centered hero/i,/badge.{0,20}logo row/i,/section iconography/i,/<details>/i,/contributors/i,/star-history/i,/showcase/i,/feature grid/i,/footer navigation/i,/plain[- ]Markdown fallback/i]) assert.match(reference,pattern);
  assert.match(reference,/verified endpoint/i);
  assert.match(reference,/repository-backed facts/i);
});
test('README cover scaffold is decorated and keeps HTML-optional facts readable', () => {
  const template=read(join(skill,'templates/picture.md'));
  for (const pattern of [/align="center"/i,/verified badge/i,/✨|🧭|📦/,/\|[^\n]*\|/i,/<details>/i,/contributors/i,/star[- ]history/i,/showcase/i,/footer/i,/plain Markdown/i]) assert.match(template,pattern);
  assert.match(template,/omit.{0,50}unverified badge/i);
});
test('both cover recipes stage depth and retain a second static light layer', () => {
  const remotion=read(join(skill,'templates/remotion/src/index.jsx'));
  const hyperframes=read(join(skill,'templates/hyperframes/index.html'));
  const source=JSON.parse(read(join(skill,'templates/cover-source.json')));
  assert.match(remotion,/midBlur/); assert.match(remotion,/data-depth=["']foreground["']/); assert.match(remotion,/rimLight/); assert.match(remotion,/linear-gradient\(/);
  assert.match(hyperframes,/#background-far/); assert.match(hyperframes,/#background-mid/); assert.match(hyperframes,/#foreground-plane/); assert.match(hyperframes,/#rim-light/);
  assert.equal(source.effects.midBlur,5); assert.ok(source.effects.rimLight>0);
});
test('authored frontend profile defaults to a crisp task-specific pixel anchor', () => {
  const profile=read(join(root,'.grok/skills/frontend-ui-ux/references/production.md'));
  assert.match(profile,/default primary visual anchor/i);
  assert.match(profile,/task-specific pixel[- ]art/i);
  assert.match(profile,/8(?:\s|&nbsp;)*CSS pixels?/i);
  assert.match(profile,/nearest[- ]neighbor|image-rendering:\s*pixelated/i);
  assert.match(profile,/no smoothing|non[- ]smoothed/i);
});
test('design and README skills route a bounded interview across retained answer rounds', () => {
  const catalog=JSON.parse(read(join(root,'.grok-plugin/plugin.json')));
  const frontend=read(join(root,'.grok/skills/frontend-ui-ux/SKILL.md'));
  const production=read(join(root,'.grok/skills/frontend-ui-ux/references/production.md'));
  const readme=read(join(root,'.grok/skills/readme-studio/SKILL.md'));
  const readmeProduction=read(join(root,'.grok/skills/readme-studio/references/production.md'));
  const files=JSON.parse(read(join(root,'package.json'))).files;
  assert.ok(catalog.skills.includes('./.grok/skills/frontend-ui-ux'));
  assert.ok(catalog.skills.includes('./.grok/skills/readme-studio'));
  assert.ok(files.includes('.grok/skills'), 'the package must ship selected skills and references');
  assert.match(frontend,/Read references\/production\.md/i, 'frontend skill must route to its production guidance');
  for (const rule of [
    /one high-impact question at a time/i,
    /as many (?:rounds )?as materially necessary/i,
    /retain (?:(?:the|prior|earlier) )?answers? .{0,50}across rounds/i,
    /do not re-ask|never ask again/i,
    /when the brief is already bounded.{0,100}default.{0,100}continue/is,
    /review-only.{0,100}plan-only.{0,100}read-only/is,
  ]) assert.match(production,rule);
  assert.match(readme,/Read references\/production\.md before deciding whether to ask or build/i);
  for (const rule of [
    /one high-impact question per turn/i,
    /as many rounds as materially necessary/i,
    /retain each answer|record each answer/i,
    /never re-ask a settled answer/i,
    /if the brief already bounds the work.{0,100}default.{0,100}continue/is,
    /review-only and plan-only.{0,100}read-only/is,
  ]) assert.match(readmeProduction,rule);
  const cwd=workspace();
  const installed=run([join(root,'bin/litgrok.mjs'),'install','--yes'],cwd);
  assert.equal(installed.status,0,installed.stderr);
  assert.equal(
    read(join(cwd,'.grok/skills/frontend-ui-ux/references/production.md')),
    production,
    'the routed frontend production reference must ship in the installed skill payload',
  );
  assert.equal(
    read(join(cwd,'.grok/skills/readme-studio/references/production.md')),
    readmeProduction,
    'the routed README production reference must ship in the installed skill payload',
  );
});
test('a competing visual direction the brief leaves open gets its own round instead of an announced default', () => {
  const rules=[
    /competing options.{0,60}stays open/is,
    /acceptable.{0,60}not.{0,80}(?:pick|choos|chosen)/is,
    /own (?:question|round)/i,
    /do not (?:announce|state).{0,120}before the (?:user )?answers?(?: arrives)?/is,
    /visual direction.{0,80}still.{0,80}default.{0,60}without (?:a question|asking)/is,
  ];
  for (const rel of ['.grok/skills/frontend-ui-ux/references/production.md','.grok/skills/readme-studio/references/production.md']) {
    const body=read(join(root,rel));
    for (const rule of rules) assert.match(body,rule,`${rel} must satisfy ${rule}`);
  }
});
test('facts validator labels structure only, rejects missing evidence and unsafe sources', () => {
  const cwd=workspace(); writeFileSync(join(cwd,'package.json'),'{"name":"fixture"}');
  const input={schema:'litgrok.readme-facts/v1',claims:[{id:'name',text:'intentionally wrong; not fact-checked',sources:['package.json']}],badges:[]};
  const facts=join(cwd,'facts.json');
  const check=() => {writeFileSync(facts,JSON.stringify(input)); return run([join(skill,'scripts/validate-facts.mjs'),'--root',cwd,'--facts',facts],cwd);};
  let result=check(); assert.equal(result.status,0,result.stderr);
  const report=JSON.parse(result.stdout); assert.equal(report.validation_scope,'structure-only'); assert.equal(report.factual_accuracy,'not-checked'); assert.equal(report.badge_truth_checked,false);
  for (const source of ['missing.md','../outside.md','/etc/hosts']) {input.claims[0].sources=[source]; assert.notEqual(check().status,0,source);}
  symlinkSync(join(cwd,'package.json'),join(cwd,'linked.json')); input.claims[0].sources=['linked.json']; assert.notEqual(check().status,0);
  input.claims[0].sources=['package.json']; input.badges=[{url:'https://user:secret@example.org/status',sources:['package.json']}]; assert.notEqual(check().status,0);
  input.badges=[]; input.claims.push({...input.claims[0]}); assert.notEqual(check().status,0,'duplicate claim');
});
test('outline output guard rejects escape, symlink and overwrite without external writes', async () => {
  const {writeFresh,shape}=await import('../.grok/skills/readme-studio/templates/typography/outline.mjs');
  const cwd=workspace(); mkdirSync(join(cwd,'safe')); symlinkSync(join(cwd,'safe'),join(cwd,'link'));
  assert.throws(()=>writeFresh(cwd,'../escape.svg','x'));
  assert.throws(()=>writeFresh(cwd,'link/type.svg','x'));
  mkdirSync(join(cwd,'safe/nested'));
  assert.throws(()=>writeFresh(join(cwd,'link/nested'),'type.svg','x'), 'root parent symlink must be refused');
  writeFresh(cwd,'safe/type.svg','first'); assert.throws(()=>writeFresh(cwd,'safe/type.svg','second'));
  assert.equal(read(join(cwd,'safe/type.svg')),'first');
  const glyph={id:1,bbox:{minX:-50,maxX:650,minY:-220,maxY:900},path:{toSVG:()=> 'M-50 -220L650 900Z'}};
  const font={unitsPerEm:1000,familyName:'Fixture',hasGlyphForCodePoint:()=>true,layout:()=>({glyphs:[glyph,{id:2,path:{toSVG:()=>''}}],positions:[{xAdvance:600,yAdvance:0,xOffset:20,yOffset:30},{xAdvance:200,yAdvance:0,xOffset:0,yOffset:0}]})};
  const svg=shape(font,'A '); assert.match(svg,/<path/); assert.doesNotMatch(svg,/<text[\s>]/); assert.doesNotMatch(svg,/NaN|Infinity/);
  assert.throws(()=>shape({...font,hasGlyphForCodePoint:()=>false},'한'));
  assert.throws(()=>shape({...font,layout:()=>({glyphs:[{...glyph,id:0}],positions:[{xAdvance:1,yAdvance:0,xOffset:0,yOffset:0}]})},'A'));
});
