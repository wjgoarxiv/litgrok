import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const skills = join(root, '.grok', 'skills');
const proc = require(join(skills, 'lit-pptx', 'scripts', 'proc.cjs'));
const deps = require(join(skills, 'lit-pptx', 'scripts', 'deps.cjs'));
const WIN = { platform: 'win32' };
const present = (...files) => (file) => files.includes(file);

const temps = [];
const temp = (prefix) => { const dir = mkdtempSync(join(tmpdir(), prefix)); temps.push(dir); return dir; };
test.after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });

// ---- .cmd shims -------------------------------------------------------------------------------

test('win32: npm runs as a node script when the host names npm-cli.js, with no shell', () => {
  const cli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
  const plan = proc.npmInvocation(['ci', '--prefix', 'C:\\Users\\a b\\stage'], {
    ...WIN, execPath: 'C:\\Program Files\\nodejs\\node.exe', env: { npm_execpath: cli }, exists: present(cli),
  });
  assert.equal(plan.file, 'C:\\Program Files\\nodejs\\node.exe');
  assert.deepEqual(plan.args, [cli, 'ci', '--prefix', 'C:\\Users\\a b\\stage']);
  assert.equal(plan.shell, false);
});

test('win32: a node that ships npm-cli.js beside it is used when npm_execpath names npx instead', () => {
  const bundled = 'C:\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
  const plan = proc.npmInvocation(['ci'], {
    ...WIN, execPath: 'C:\\nodejs\\node.exe', env: { npm_execpath: 'C:\\nodejs\\node_modules\\npm\\bin\\npx-cli.js' }, exists: present(bundled),
  });
  assert.deepEqual(plan.args, [bundled, 'ci']);
  assert.equal(plan.shell, false);
});

test('win32: without npm-cli.js the .cmd shim runs through a shell with every argument quoted', () => {
  const plan = proc.npmInvocation(['ci', '--prefix', 'C:\\Users\\a b\\stage'], {
    ...WIN, execPath: 'C:\\nodejs\\node.exe', env: { Path: 'C:\\Tools;C:\\nodejs', PATHEXT: '.COM;.EXE;.BAT;.CMD' }, exists: present('C:\\nodejs\\npm.CMD'),
  });
  assert.equal(plan.shell, true);
  assert.equal(plan.file, 'C:\\nodejs\\npm.CMD');
  assert.deepEqual(plan.args, ['ci', '--prefix', '"C:\\Users\\a b\\stage"']);
});

test('win32: any npm-installed CLI shim is resolved through PATHEXT and gets a shell; an .exe does not', () => {
  const env = { PATH: 'C:\\bin', PATHEXT: '.EXE;.CMD' };
  const shim = proc.invocation('agent-browser', ['--version'], { ...WIN, env, exists: present('C:\\bin\\agent-browser.CMD') });
  assert.deepEqual(shim, { file: 'C:\\bin\\agent-browser.CMD', args: ['--version'], shell: true });
  const exe = proc.invocation('ffmpeg', ['-version'], { ...WIN, env, exists: present('C:\\bin\\ffmpeg.EXE') });
  assert.deepEqual(exe, { file: 'C:\\bin\\ffmpeg.EXE', args: ['-version'], shell: false });
});

test('win32: an argument that cmd.exe would expand or split is refused, never quoted', () => {
  for (const bad of ['100%PATH%', 'say "hi"', 'line\nbreak']) assert.throws(() => proc.quoteForCmd(bad), /refusing/u, bad);
  assert.equal(proc.quoteForCmd('plain-arg_1.0'), 'plain-arg_1.0');
  assert.equal(proc.quoteForCmd('has space&amp'), '"has space&amp"');
});

test('POSIX keeps the plain npm and command invocations', () => {
  assert.deepEqual(proc.npmInvocation(['ci'], { platform: 'linux' }), { file: 'npm', args: ['ci'], shell: false });
  assert.deepEqual(proc.invocation('agent-browser', ['x'], { platform: 'darwin' }), { file: 'agent-browser', args: ['x'], shell: false });
});

// ---- which / PATHEXT / CRLF -------------------------------------------------------------------

test('win32: ffmpeg is found as ffmpeg.exe by applying PATHEXT, whichever way the variables are cased', () => {
  const env = { Path: 'C:\\a;"C:\\Program Files\\ff"', pathext: '.com;.exe;.cmd' };
  assert.equal(proc.which('ffmpeg', { ...WIN, env, exists: present('C:\\Program Files\\ff\\ffmpeg.exe') }), 'C:\\Program Files\\ff\\ffmpeg.exe');
  assert.equal(proc.which('ffmpeg.exe', { ...WIN, env, exists: present('C:\\a\\ffmpeg.exe') }), 'C:\\a\\ffmpeg.exe');
  assert.equal(proc.which('ffmpeg', { ...WIN, env, exists: () => false }), null);
});

test('POSIX which does not add extensions', () => {
  assert.equal(proc.which('ffmpeg', { platform: 'linux', env: { PATH: '/x:/y' }, exists: present('/y/ffmpeg') }), '/y/ffmpeg');
  assert.equal(proc.which('ffmpeg', { platform: 'linux', env: { PATH: '/x:/y' }, exists: present('/y/ffmpeg.exe') }), null);
});

test('child output with CRLF line ends keeps no carriage return', () => {
  assert.equal(proc.firstLine('C:\\bin\\ffmpeg.exe\r\nC:\\other\\ffmpeg.exe\r\n'), 'C:\\bin\\ffmpeg.exe');
  assert.equal(proc.lastLine('npm warn\r\nnpm error code E404\r\n\r\n'), 'npm error code E404');
  assert.equal(proc.lastLine(''), '');
});

test('the motion tool lookup applies PATHEXT on win32 and the helper keeps a POSIX lookup', async () => {
  const { findTool } = await import(join(skills, 'lit-typographic-motion', 'scripts', 'lib', 'render.mjs'));
  const env = { PATH: 'C:\\ff', PATHEXT: '.EXE;.CMD' };
  assert.equal(findTool('ffmpeg', env, { platform: 'win32', exists: present('C:\\ff\\ffmpeg.EXE') }), 'C:\\ff\\ffmpeg.EXE');
  assert.equal(findTool('definitely-not-a-tool', { PATH: '/nonexistent' }), null);
});

// ---- exit codes and causes --------------------------------------------------------------------

test('a script run through the helper returns the exit code the child chose', () => {
  const dir = temp('litgrok-win-exit-');
  const script = join(dir, 'exits-three.cjs');
  writeFileSync(script, 'process.exit(3);\n');
  assert.equal(proc.runScript(process.execPath, script), 3);
  writeFileSync(script, 'process.exit(0);\n');
  assert.equal(proc.runScript(process.execPath, script), 0);
  assert.equal(proc.runScript(join(dir, 'no-such-interpreter'), script), 1);
});

test('win32: the interpreter gets UTF-8 stdio so Korean output cannot crash a gate', () => {
  let seen;
  proc.runScript('python.exe', 'gate.py', ['--json'], { ...WIN, env: {}, spawn: (file, args, options) => { seen = { file, args, env: options.env }; return { status: 0 }; } });
  assert.deepEqual(seen.args, ['gate.py', '--json']);
  assert.equal(seen.env.PYTHONUTF8, '1');
  assert.equal(seen.env.PYTHONIOENCODING, 'utf-8');
});

test('an install step that fails reports its exit code and the cause the child wrote', () => {
  assert.throws(
    () => deps.command(process.execPath, ['-e', 'process.stderr.write("npm warn noise\\r\\nnpm error code E404 not in registry\\r\\n"); process.exit(7)']),
    (error) => /exit 7/u.test(error.message) && /E404 not in registry/u.test(error.message) && !error.message.includes('\r'),
  );
  assert.throws(() => deps.command('litgrok-no-such-command', []), /ENOENT/u);
});

test('venv interpreters and system pythons follow the platform', () => {
  assert.equal(proc.venvPython('C:\\cache\\python', 'win32'), 'C:\\cache\\python\\Scripts\\python.exe');
  assert.equal(proc.venvPython('/cache/python', 'linux'), '/cache/python/bin/python');
  assert.deepEqual(proc.findPython({ platform: 'linux' }), { command: 'python3', args: [] });
  assert.deepEqual(proc.findPython({ ...WIN, env: { PATH: 'C:\\py', PATHEXT: '.EXE' }, exists: present('C:\\py\\py.EXE') }), { command: 'C:\\py\\py.EXE', args: ['-3'] });
  assert.deepEqual(proc.findPython({ ...WIN, env: { PATH: 'C:\\py', PATHEXT: '.EXE' }, exists: present('C:\\py\\python.EXE') }), { command: 'C:\\py\\python.EXE', args: [] });
});

// Fake interpreters that only answer the version question, so the pick runs real child processes.
function fakePythons(versions) {
  const dir = temp('litgrok-python-pick-');
  for (const [name, version] of Object.entries(versions)) {
    writeFileSync(join(dir, name), `#!/bin/sh\necho ${version}\n`, { mode: 0o755 });
  }
  return dir;
}
const POSIX_ONLY = process.platform === 'win32' ? 'the fake interpreters are sh scripts' : false;

test('the supported-Python pick passes over a python3 that is too new for the pinned wheels', { skip: POSIX_ONLY }, () => {
  const mixed = fakePythons({ python3: '3.15.0', 'python3.15': '3.15.0', 'python3.13': '3.13.4' });
  assert.deepEqual(proc.pickPython([14, 13, 12], { env: { PATH: mixed } }), { command: join(mixed, 'python3.13'), args: [], version: '3.13.4' });
  const plain = fakePythons({ python3: '3.12.7' });
  assert.deepEqual(proc.pickPython([12, 13, 11], { env: { PATH: plain } }), { command: join(plain, 'python3'), args: [], version: '3.12.7' }, 'a plain python3 of a supported version is used');
  const ordered = fakePythons({ 'python3.13': '3.13.4', 'python3.12': '3.12.7' });
  assert.equal(proc.pickPython([12, 13, 11], { env: { PATH: ordered } }).version, '3.12.7', 'the first listed minor wins');
  const tooNew = fakePythons({ python3: '3.15.0' });
  const none = proc.pickPython([14, 13, 12, 11, 10], { env: { PATH: tooNew } });
  assert.equal(none.command, null);
  assert.deepEqual(none.tried, [`${join(tooNew, 'python3')}: 3.15.0`]);
});

test('win32: the supported-Python pick asks the py launcher for each listed minor', () => {
  const asked = [];
  const probe = (command, args) => { asked.push([command, ...args].join(' ')); return args[0] === '-3.13' ? '3.13.4' : null; };
  const picked = proc.pickPython([14, 13], { ...WIN, env: { PATH: 'C:\\py', PATHEXT: '.EXE' }, exists: present('C:\\py\\py.EXE'), probe });
  assert.deepEqual(picked, { command: 'C:\\py\\py.EXE', args: ['-3.13'], version: '3.13.4' });
  assert.deepEqual(asked, ['C:\\py\\py.EXE -3.14', 'C:\\py\\py.EXE -3.13']);
});

test('the office runtime builds its venv from the supported-Python pick, not whatever python3 is first', () => {
  const source = readFileSync(join(skills, 'lit-pptx', 'scripts', 'deps.cjs'), 'utf8');
  assert.match(source, /proc\.pickPython\(OFFICE_PYTHON_MINORS\)/u);
  assert.doesNotMatch(source, /proc\.findPython\(/u);
});

test('doctor of the office skills lists its tools without a which child process', () => {
  for (const skill of ['lit-pptx', 'lit-docx']) {
    const source = readFileSync(join(skills, skill, 'scripts', 'run.mjs'), 'utf8');
    assert.doesNotMatch(source, /spawnSync\('which'/u, `${skill} still shells out to which`);
    const result = spawnSync(process.execPath, [join(skills, skill, 'scripts', 'run.mjs'), 'doctor'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^pandoc: .+$/mu);
    assert.doesNotMatch(result.stdout, /\r/u);
  }
});

// ---- PDF profiles -----------------------------------------------------------------------------

const PYTHON = spawnSync('python3', ['-c', 'pass']).status === 0 ? false : 'python3 not installed';
const pythonJson = (code) => {
  const result = spawnSync('python3', ['-I', '-B', '-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(join(skills, 'lit-docx', 'scripts'))})\n${code}`], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test('the PDF font preflight names every missing font, the install hint and the profile', { skip: PYTHON }, () => {
  const out = pythonJson(`
import pdf_fonts
from types import SimpleNamespace
publisher = {"docx": {"font": {"body": {"family": "Times New Roman"}}}, "latex": {"cjk": {"main_font": "Pretendard"}}}
def fake_run(command, workdir=None):
    tex = (workdir / "fonts.tex").read_text(encoding="utf-8")
    assert "Pretendard" in tex and "Times New Roman" in tex
    return SimpleNamespace(returncode=0, stdout="LITGROK-MISSING-FONT: Pretendard\\r\\nok\\r\\n", stderr="")
print(json.dumps({
    "ko": pdf_fonts.families(publisher, "ko"), "en": pdf_fonts.families(publisher, "en"),
    "missing": pdf_fonts.missing_fonts(pdf_fonts.families(publisher, "ko"), fake_run),
    "message": pdf_fonts.blocked_message(["Pretendard"], "korean-generic"),
}))
`);
  assert.deepEqual(out.ko, ['Times New Roman', 'Pretendard']);
  assert.deepEqual(out.en, ['Times New Roman']);
  assert.deepEqual(out.missing, ['Pretendard']);
  assert.match(out.message, /^BLOCKED_MISSING_FONT: /u);
  assert.match(out.message, /Pretendard/u);
  assert.match(out.message, /korean-generic/u);
  assert.match(out.message, /github\.com\/orioncactus\/pretendard/u);
});

test('a font probe that cannot run is reported as the compiler error, not as a missing font', { skip: PYTHON }, () => {
  const out = pythonJson(`
import pdf_fonts
from types import SimpleNamespace
def broken(command, workdir=None):
    return SimpleNamespace(returncode=1, stdout="! LaTeX Error: File 'fontspec.sty' not found.\\r\\n", stderr="")
try:
    pdf_fonts.missing_fonts(["Pretendard"], broken)
    print(json.dumps({"raised": False}))
except SystemExit as exc:
    print(json.dumps({"raised": True, "text": str(exc)}))
`);
  assert.equal(out.raised, true);
  assert.match(out.text, /fontspec\.sty/u);
});

test('every LaTeX profile loads longtable before pandoc writes a table', { skip: spawnSync('pandoc', ['--version']).status === 0 ? false : 'pandoc not installed' }, () => {
  const dir = temp('litgrok-longtable-');
  const source = join(dir, 'table.md');
  writeFileSync(source, '# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  for (const profile of ['elsevier', 'acs', 'ieee', 'nature', 'korean-generic']) {
    const out = join(dir, `${profile}.tex`);
    const result = spawnSync('pandoc', [source, '--standalone', '--from', 'markdown', '--to', 'latex', '--template', join(skills, 'lit-docx', 'templates', 'latex', profile, 'template.tex'), '-V', 'documentclass=article', '-V', 'mainfont=Times New Roman', '--output', out], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const tex = readFileSync(out, 'utf8');
    const loaded = tex.search(/\\usepackage(?:\[[^\]]*\])?\{[^}]*\blongtable\b[^}]*\}/u);
    assert.ok(tex.includes('\\begin{longtable}'), `${profile}: the probe table must come out as a longtable`);
    assert.ok(loaded >= 0 && loaded < tex.indexOf('\\begin{document}'), `${profile}: longtable is not loaded in the preamble`);
  }
});

// ---- the places that start npm or a shim ------------------------------------------------------

test('no skill script, hook or tool starts npm, a .cmd or which without the shared helper', () => {
  const shipped = /^(\.grok\/(skills|hooks)|tools|scripts|bin)\/.*\.(mjs|cjs|js)$/u;
  const files = spawnSync('git', ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).stdout.split('\n').filter((file) => shipped.test(file));
  const offenders = [];
  for (const file of files) {
    if (file.includes('/node_modules/') || file.endsWith('proc.cjs') || file.endsWith('prepublish-test-gate.mjs')) continue;
    const text = readFileSync(join(root, file), 'utf8');
    if (/spawn(?:Sync)?\(\s*['"`](?:npm|npx|which|where|agent-browser|python3)['"`]/u.test(text)) offenders.push(file);
    if (/['"`]npm\.cmd['"`]/u.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

// ---- status line and hooks --------------------------------------------------------------------

test('win32: the status-line command quotes with double quotes and forward slashes, never single quotes', async () => {
  const { statusLineCommand } = await import(join(root, 'bin', 'status-line-config.mjs'));
  assert.equal(statusLineCommand('C:\\Users\\wj\\.grok', 'win32'), 'node C:/Users/wj/.grok/hooks/lit-status-line.mjs');
  assert.equal(statusLineCommand('C:\\Users\\Woo Jin\\.grok', 'win32'), 'node "C:/Users/Woo Jin/.grok/hooks/lit-status-line.mjs"');
  assert.equal(statusLineCommand('/home/wj/.grok', 'linux'), 'node /home/wj/.grok/hooks/lit-status-line.mjs');
  assert.equal(statusLineCommand("/home/o'neil/.grok", 'linux'), "node '/home/o'\\''neil/.grok/hooks/lit-status-line.mjs'");
});

test('the handoff command finds the home folder from USERPROFILE when HOME is unset', () => {
  assert.match(readFileSync(join(root, '.grok', 'hooks', 'auto-handoff.mjs'), 'utf8'), /env\.HOME \|\| env\.USERPROFILE/u);
});
