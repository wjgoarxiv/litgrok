import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BIN = join(ROOT, 'bin', 'litgrok.mjs');
const PILL = ' LIT ';
// The flags every run of the guide already carries, or that a question's default stands for.
const NOT_ASKED = ['--agent', '--dry-run', '--no-color', '--project', '--round', '--yes'];

function inEmptyHome(t) {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-agent-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}

function runBin(home, args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd: home, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, ...env } });
}

test('the guide is the same text in every shell, and prints nothing else', (t) => {
  const home = inEmptyHome(t);
  const first = runBin(home, ['install', '--agent']);
  assert.equal(first.status, 0);
  assert.equal(first.stderr, '');
  for (const [args, env] of [
    [['--agent'], {}],
    [['install', '--agent', '--yes', '--user', '--status-line'], { CI: '1' }],
    [['--agent', '--dry-run'], { NO_COLOR: '1', TERM: 'dumb' }],
    [['install', '--round', '--agent'], { FORCE_COLOR: '3', COLORTERM: 'truecolor' }],
    [['install', '--glyphs', 'nonsense', '--agent'], {}],
  ]) {
    const again = runBin(home, args, env);
    assert.equal(again.status, 0, args.join(' '));
    assert.equal(again.stdout, first.stdout, args.join(' '));
    assert.equal(again.stderr, '', args.join(' '));
  }
  assert.doesNotMatch(first.stdout, /\u001b/u);
  assert.deepEqual(readdirSync(home), []);
  assert.equal(runBin(home, ['uninstall', '--agent']).status, 1);
});

test('the guide opens as a guide, asks before it installs and leaves the rest to the user', (t) => {
  const { stdout } = runBin(inEmptyHome(t), ['install', '--agent']);
  assert.equal(stdout.split('\n')[0], 'LitGrok install guide for coding agents');
  assert.match(stdout, /^If you are a coding agent and your user asked you to install LitGrok, follow these steps\. They are written for your user to read too\.$/mu);
  const order = ['1. Preview', '2. Ask your user', '3. Wait for your user\'s yes. Use only this package; add no other source, and do not approve hooks, trust or sign-in for your user.', '4. Install', '5. Update', '6. Check', '7. Rounded ends', '8. Only your user can'];
  const places = order.map((step) => stdout.indexOf(step));
  assert.ok(places.every((place, index) => place > (places[index - 1] ?? -1)), JSON.stringify(places));
  assert.ok(stdout.includes(PILL));
  assert.match(stdout, /Terminal\.app has no fallback setting, so it needs a full Nerd Font/u);
  assert.match(stdout, /ROUND_ENDS:/u);
  assert.match(stdout, /\/hooks-trust/u);
  assert.doesNotMatch(stdout, /\bstar\b|\bsponsor|do not ask|bypass|--always-approve/iu);
});

test('the guide, the parser, the questions and both README prompts name the same flags and commands', async () => {
  const { AGENT_COMMAND, QUESTIONS, STEPS, agentGuide } = await import('../bin/agent-guide.mjs');
  const { INSTALL_FLAGS } = await import('../bin/litgrok.mjs');
  const asked = new Set(QUESTIONS.flatMap(({ flags }) => flags));
  assert.deepEqual([...asked, ...NOT_ASKED].sort(), [...INSTALL_FLAGS].sort());
  const guide = agentGuide();
  // The one question the installer itself asks is in the guide too.
  const titles = [...readFileSync(join(ROOT, 'bin', 'ground-rule.mjs'), 'utf8').matchAll(/title: '([^']+)'/gu)].map(([, title]) => title.toLowerCase());
  assert.deepEqual(titles, ['ground rules']);
  for (const title of titles) assert.ok(QUESTIONS.some(({ ask }) => ask.toLowerCase().includes(title)), title);

  for (const [name, text] of [['guide', guide], ...['README.md', 'README_ko-KR.md'].map((file) => {
    const block = readFileSync(join(ROOT, file), 'utf8').split('```text\n').slice(1).map((part) => part.split('\n```')[0]).find((part) => part.includes('@litfamily/litgrok'));
    return [file, block ?? ''];
  })]) {
    for (const step of Object.values(STEPS)) assert.ok(text.includes(`\n   ${step}\n`), `${name}: ${step}`);
    for (const flag of asked) assert.ok(text.includes(flag), `${name}: ${flag}`);
    for (const needed of ['SymbolsNerdFontMono-Regular.ttf', '~/Library/Fonts', '${XDG_DATA_HOME:-~/.local/share}/fonts', '~/.grok/config.toml', '--glyphs round', '--glyphs auto', '--glyphs square', 'ROUND_ENDS:', PILL, 'Terminal.app', '/hooks-trust', 'git init']) {
      assert.ok(text.includes(needed), `${name}: ${needed}`);
    }
    assert.doesNotMatch(text, /-u NO_COLOR/u, name);
    // An install can name a failure that a later doctor run no longer knows.
    assert.doesNotMatch(text, /same ROUND_ENDS|같은 ROUND_ENDS/u, name);
    for (const [flag] of text.matchAll(/--[a-z][a-z-]+/gu)) {
      assert.ok([...INSTALL_FLAGS, '--package', '--json', '--trust'].includes(flag), `${name}: ${flag}`);
    }
  }
  assert.ok(AGENT_COMMAND.endsWith(' install --agent'));
  // PowerShell and cmd have no env command: the preview does without, and the install has a line of its own there.
  assert.ok(STEPS.preview.startsWith('npm exec '));
  assert.ok(STEPS.windows.startsWith('cmd /c "set CI=&& npm exec ') && STEPS.windows.endsWith(' install --yes --round"'));
});

test('--help and a run without a person name the guide', (t) => {
  const home = inEmptyHome(t);
  const help = runBin(home, ['--help']);
  assert.match(help.stdout, /^Are you an agent\? .*litgrok install --agent/mu);
  const preview = runBin(home, ['install']);
  assert.match(preview.stdout.split('\n')[1], /^ {2}Agent\? See npm exec --yes --package @litfamily\/litgrok@latest -- litgrok install --agent\.$/u);
  assert.match(preview.stdout, /\nLIT · grok build\n {2}litgrok v/u);
  assert.match(preview.stdout.trimEnd().split('\n').at(-1), /^Nothing was installed/u);
});
