import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { renderMark } from '../.grok/hooks/lit-mark.mjs';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);

function captureIo({ interactive = true } = {}) {
  let stdout = '';
  let stderr = '';
  return {
    stdin: { isTTY: interactive },
    stdout: {
      isTTY: interactive,
      write(chunk) {
        stdout += String(chunk);
        return true;
      },
    },
    stderr: {
      isTTY: interactive,
      write(chunk) {
        stderr += String(chunk);
        return true;
      },
    },
    read() {
      return { stdout, stderr };
    },
  };
}

function rendered(output) {
  return output.replace(/\r\u001b\[2K/g, '').replace(/\u001b\[[0-9;]*m/g, '');
}

async function importInstaller(tag) {
  return import(`${pathToFileURL(join(PRODUCT_ROOT, 'bin', 'litgrok.mjs')).href}?frame=${tag}`);
}

test('install output opens with the shared LitFamily frame and host-owned model notice', async () => {
  const { run } = await importInstaller('banner');
  const home = mkdtempSync(join(tmpdir(), 'litgrok-frame-'));
  const io = captureIo();
  try {
    const code = await run(['install', '--user', '--dry-run'], { cwd: home, env: { HOME: home, LANG: 'en_US.UTF-8' }, ...io });
    assert.equal(code, 0, io.read().stderr);
    const { stdout } = io.read();
    const version = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8')).version;
    const rule = `  ${'━'.repeat(46)}`;
    const wordmark = renderMark({ size: 'banner', productName: `grok v${version}`, env: { LANG: 'en_US.UTF-8' }, isTTY: false }).map((row) => `   ${row}`).join('\n');
    assert.ok(stdout.split('\n').filter((line) => line === rule).length >= 2, 'two 46-glyph rule lines frame the banner');
    assert.ok(rendered(stdout).includes(wordmark), 'canonical banner and grok lockup must use the authoritative rows');
    assert.doesNotMatch(stdout, /\[/u, 'dry-run output is deterministic and contains no ANSI escapes');
    assert.match(rendered(stdout), /│ 02 · Payload\s+\d+ files · byte-identical copies only/u, 'banner keeps the discovered payload count');
    assert.match(stdout, /╭─ MODEL ROUTE/u);
    assert.match(stdout, /│ Model selection: host-owned/u);
    assert.match(stdout, /╰─/u);
    assert.match(stdout, /DRY RUN/, 'existing preview contract stays intact');
    assert.doesNotMatch(stdout, /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u, 'dry-run must not animate a preview');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('frame respects NO_COLOR and stays prompt-free in non-interactive runs', async () => {
  const { run } = await importInstaller('plain');
  const home = mkdtempSync(join(tmpdir(), 'litgrok-frame-plain-'));
  const io = captureIo({ interactive: false });
  try {
    const code = await run(['install', '--user'], { cwd: home, env: { HOME: home, NO_COLOR: '1' }, ...io });
    assert.equal(code, 0, io.read().stderr);
    const { stdout } = io.read();
    assert.doesNotMatch(stdout, /\[/u, 'NO_COLOR disables every ANSI sequence');
    assert.match(stdout, /│ Model selection: host-owned/u);
    assert.match(stdout, /NON-INTERACTIVE/, 'non-interactive stays a non-mutating preview');
    assert.equal(existsSync(join(home, '.grok')), false, 'the frame must not change the no-write contract');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

for (const [label, overrides, preview] of [
  ['CI=""', { CI: '' }, 'NON-INTERACTIVE'],
  ['CI="1"', { CI: '1' }, 'NON-INTERACTIVE'],
  ['NO_COLOR=""', { NO_COLOR: '' }, 'NO COLOR'],
  ['TERM=dumb', { TERM: 'dumb' }, null],
  ['LC_ALL=C', { LC_ALL: 'C' }, null],
]) {
  test(`TTY project install with ${label} emits no escapes`, async () => {
    const { run } = await importInstaller(label);
    const project = mkdtempSync(join(tmpdir(), 'litgrok-frame-ci-'));
    const io = captureIo();
    try {
      const env = { HOME: project, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', TERM: 'xterm-256color', COLORTERM: 'truecolor', ...overrides };
      const code = await run(['install', '--yes', '--project'], { cwd: project, env, ...io });
      const { stdout, stderr } = io.read();
      assert.equal(code, 0, stderr);
      assert.equal(stderr, '');
      assert.ok(!stdout.includes('\u001b'), 'terminal policy disables mark, frame, progress, and status escapes');
      if (preview) {
        assert.ok(stdout.includes(`${preview} — no files written`));
        assert.equal(existsSync(join(project, '.grok')), false, '--yes must not bypass the preview');
      } else {
        assert.match(stdout, /\n   LIT\n/u, 'unsupported terminals use the plain wordmark');
        assert.match(stdout, /INSTALL STEPS/u);
        assert.match(stdout, /INSTALL RECEIPT/u);
        assert.equal(existsSync(join(project, '.grok/.litgrok-install-manifest.json')), true);
      }
    } finally {
      rmSync(project, { recursive: true, force: true });
      assert.equal(existsSync(project), false);
    }
  });
}

test('interactive TTY install colors the frame with 24-bit brand codes', async () => {
  const { run } = await importInstaller('color');
  const home = mkdtempSync(join(tmpdir(), 'litgrok-frame-color-'));
  const io = captureIo();
  try {
    const code = await run(['install', '--user'], { cwd: home, env: { HOME: home, LANG: 'en_US.UTF-8' }, ...io });
    assert.equal(code, 0, io.read().stderr);
    assert.match(io.read().stdout, /\[38;2;255;99;55m/u, 'Ignition Orange #FF6337 colors the receipt title');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('non-TTY installs never emit spinner frames or repaint control codes', async () => {
  const { run } = await importInstaller('no-spinner');
  const home = mkdtempSync(join(tmpdir(), 'litgrok-frame-no-spinner-'));
  const io = captureIo({ interactive: false });
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  try {
    const code = await run(['install'], { cwd: home, env, ...io });
    assert.equal(code, 0, io.read().stderr);
    const { stdout } = io.read();
    assert.doesNotMatch(stdout, /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u, 'non-TTY output must stay sequential');
    assert.doesNotMatch(stdout, /\u001b\[2K/u, 'non-TTY output must not repaint a pipe');
    assert.match(stdout, /would install .*\.grok/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('already-current installs mark WRITE as SKIPPED and include the receipt', async () => {
  const { run } = await importInstaller('already-current');
  const home = mkdtempSync(join(tmpdir(), 'litgrok-frame-current-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  try {
    assert.equal(await run(['install', '--user'], { cwd: home, env, ...captureIo() }), 0);
    const io = captureIo();
    assert.equal(await run(['install', '--user'], { cwd: home, env, ...io }), 0, io.read().stderr);
    const stdout = rendered(io.read().stdout);
    assert.match(stdout, /WRITE · SKIPPED/u, 'the no-op write phase must be explicit');
    assert.match(stdout, /Written vs already-current: 0 written · \d+ already-current/u);
    assert.match(stdout, /╭─ INSTALL RECEIPT/u);
    assert.doesNotMatch(stdout, /^Already current: \d+ files$/mu, 'legacy status lines stay out of the decorated frame');
    assert.doesNotMatch(stdout, /^Project hooks require trust/mu, 'receipt owns the hook-trust line in the decorated frame');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('receipt names the active project scope and the hook-trust requirement', async () => {
  const { run } = await importInstaller('receipt-scope');
  const home = mkdtempSync(join(tmpdir(), 'litgrok-frame-receipt-home-'));
  const project = mkdtempSync(join(tmpdir(), 'litgrok-frame-receipt-project-'));
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  try {
    const io = captureIo();
    assert.equal(await run(['install'], { cwd: project, env, ...io }), 0, io.read().stderr);
    const stdout = rendered(io.read().stdout);
    assert.ok(stdout.includes(`Scope: project scope → ${join(project, '.grok')} (use --user for user scope)`));
    assert.match(stdout, /Model route: host-owned; the installer writes no model keys/u);
    assert.match(stdout, /Hooks: project hooks require trust from a Git project root/u);
    assert.match(stdout, /grok --trust inspect --json/u);
    assert.match(stdout, /Installer never runs `?git init`?/u);
    assert.match(stdout, /Next: restart Grok Build/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('usage errors stay frame-free', async () => {
  const { run } = await importInstaller('usage');
  const io = captureIo();
  const code = await run(['definitely-not-a-command'], { cwd: tmpdir(), env: {}, ...io });
  assert.equal(code, 1);
  assert.equal(io.read().stdout, '', 'usage failure prints no banner');
  assert.match(io.read().stderr, /Usage:/);
});

test('both landing pages retain linked frame and host-owned model documentation', () => {
  const version = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8')).version;
  for (const [readmeName, referencePath, prefix] of [
    ['README.md', 'docs/reference.md', './'],
    ['README_ko-KR.md', 'docs/reference_ko-KR.md', './'],
    ['docs/npm/README.md', 'docs/reference.md', `https://cdn.jsdelivr.net/npm/@litfamily/litgrok@${version}/`],
    ['docs/npm/README_ko-KR.md', 'docs/reference_ko-KR.md', `https://cdn.jsdelivr.net/npm/@litfamily/litgrok@${version}/`],
  ]) {
    const landing = readFileSync(join(PRODUCT_ROOT, readmeName), 'utf8');
    assert.ok(landing.includes(`${prefix}${referencePath}`), `${readmeName} links ${referencePath}`);
    const reference = readFileSync(join(PRODUCT_ROOT, referencePath), 'utf8');
    assert.match(reference, /Model selection: host-owned/);
    assert.match(reference, /MODEL ROUTE/);
  }
});
