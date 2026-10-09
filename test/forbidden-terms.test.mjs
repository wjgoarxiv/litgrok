import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// validate_pptx.py reads the deck's forbidden and soft terms from FORBIDDEN_TERMS.json beside
// SKILL.md and quietly checks nothing when the file is absent, so the list has to ship.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const skill = join(root, '.grok/skills/lit-pptx');
const list = join(skill, 'FORBIDDEN_TERMS.json');
const childEnv = { ...process.env, PYTHONDONTWRITEBYTECODE: '1' };

test('the lit-pptx term list ships with forbidden and soft terms', () => {
  assert.ok(existsSync(list), 'FORBIDDEN_TERMS.json is missing');
  const data = JSON.parse(readFileSync(list, 'utf8'));
  for (const key of ['terms', 'soft_terms']) {
    assert.ok(Array.isArray(data[key]) && data[key].length > 0, `${key} is empty`);
    assert.ok(data[key].every((term) => typeof term === 'string' && term.trim()), `${key} holds a blank term`);
  }
  assert.ok(data.terms.includes('lorem ipsum') && data.terms.includes('placeholder'));
});

const scratch = mkdtempSync(join(tmpdir(), 'litgrok-forbidden-terms-'));
test.after(() => rmSync(scratch, { recursive: true, force: true }));
// One titled slide with the given line and a source line, linted through the packaged launcher.
function build(name, body) {
  const python = require(join(skill, 'scripts/deps.cjs')).python();
  const file = join(scratch, `${name}.pptx`);
  const r = spawnSync(python, ['-c', `import sys\nfrom pptx import Presentation\nfrom pptx.util import Inches\np=Presentation();s=p.slides.add_slide(p.slide_layouts[5]);s.shapes.title.text='Quarterly review'\ns.shapes.add_textbox(Inches(1),Inches(2),Inches(8),Inches(1)).text=sys.argv[2]\ns.shapes.add_textbox(Inches(1),Inches(4),Inches(8),Inches(1)).text='Source: sample data'\np.save(sys.argv[1])`, file, body], { env: childEnv, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return file;
}
function lint(file) {
  const r = spawnSync(process.execPath, [join(skill, 'scripts/run.mjs'), 'validate_pptx.py', file], { cwd: scratch, env: childEnv, encoding: 'utf8' });
  return { status: r.status, check: JSON.parse(r.stdout).checks.forbidden_terms };
}

test('the deck lint fails a placeholder term and only warns on a soft term', () => {
  {
    const placeholder = lint(build('placeholder', 'Lorem ipsum dolor sit amet for the revenue line'));
    assert.equal(placeholder.status, 1);
    assert.equal(placeholder.check.pass, false);
    assert.equal(placeholder.check.hard_hits.length, 1);
    const soft = lint(build('soft', 'A seamless hand-over between the two plants'));
    assert.equal(soft.check.pass, true);
    assert.equal(soft.check.soft_warnings.length, 1);
  }
});

test('a one-word forbidden term is matched as a word or its plural, never inside a longer one', () => {
  const words = ['Mastodon instances host the archive', 'Each photodocument carries its survey date'];
  words.forEach((body, i) => assert.equal(lint(build(`inside-${i}`, body)).check.pass, true, body));
  const marked = ['TODO: x', 'Margins improve, todo.', 'Launch date (TBD)', 'Lorem ipsum dolor sit amet', 'Two TODOs remain', 'The placeholders stay', 'FIXMEs in the appendix'];
  marked.forEach((body, i) => assert.equal(lint(build(`marked-${i}`, body)).check.pass, false, body));
  // Soft terms keep the list's own matching: one inside a longer word still warns.
  assert.equal(lint(build('soft-inside', 'The plan unlocks a second plant')).check.soft_warnings.length, 1);
});

test('a project install copies the term list beside the lit-pptx skill', async () => {
  const project = mkdtempSync(join(tmpdir(), 'litgrok-forbidden-terms-project-'));
  const home = mkdtempSync(join(tmpdir(), 'litgrok-forbidden-terms-home-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  let stderr = '';
  const io = { stdin: { isTTY: true }, stdout: { isTTY: true, write: () => true }, stderr: { isTTY: true, write: (chunk) => { stderr += String(chunk); return true; } } };
  try {
    const { run } = await import('../bin/litgrok.mjs');
    assert.equal(await run(['install', '--project', '--yes'], { ...io, cwd: project, env }), 0, stderr);
    const installed = join(project, '.grok/skills/lit-pptx/FORBIDDEN_TERMS.json');
    assert.ok(existsSync(installed), 'the install left the term list out');
    assert.equal(readFileSync(installed).compare(readFileSync(list)), 0);
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
