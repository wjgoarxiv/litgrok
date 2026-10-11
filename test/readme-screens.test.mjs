import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { run } from '../bin/litgrok.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCREENS = join(ROOT, 'docs/assets/screens');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// Captures of LitGrok's own installer, SessionStart hook, prompt hook and status-line command.
const screens = {
  'install-done-dark.webp': '2dad1f0c008fe8d415d16d4d8e01fb6887314d7576ea191dc9bcc339342662cf',
  'install-done-light.webp': '84002f78f42dd5f4cc1bc6efc64d6904410d1e84ff6528fd224cfe68b7167c80',
  'install-dry-run-dark.webp': '74c116c806a2f3d1444823c63cd1141a32dae6406ec02d12c301722c9f386a9b',
  'install-dry-run-light.webp': '8a0058c1e8d5e9f9814cffe6129b3d39894ade9455f8b86b31525fdbaf70961d',
  'install-plan-dark.webp': '1d4efafaa704e0952b76223e8376e195c93031b5c73f0e788e654899fce4a8cf',
  'session-start-dark.webp': '6e0d6a44b3de29bb75050b453501f16dda7d78983c8a0df694b2407df0fde578',
  'session-start-light.webp': 'a8d8bfc4438bbdf6fd262738ec5de1e6826b09ba49ae57c03f3ff0edc7c93016',
  'status-row-dark.webp': '133b1dce1c8bbb348024227212685659245d5041daf6595ea8a9897d77017e18',
  'status-row-light.webp': '3bd33559fc4560158b1c68ae0bb0ad3fecfb374153dd042eb21ac24d6cbdc3bf',
};
const MAX_SCREEN_BYTES = 61_440;

// What each picture must quote in its alt text, in the language of the page.
const quotes = {
  'install-plan': ['INSTALL', '02 · Payload 1154 files · byte-identical copies only', 'Model selection: host-owned'],
  'install-dry-run': ['DRY RUN — no files written', '02 · Payload 1154 files', 'would install ~/demo/.grok/agents/litgrok-executor.md'],
  'install-done': ['INSTALL STEPS', 'PAYLOAD · 1154 files discovered', 'WRITE · 1154 written', 'INSTALL RECEIPT', 'Status: Ready', 'Motion runtime: install stays copy-only; pre-warm lit-typographic-motion with npm exec --yes --package @litfamily/litgrok@', '-- litgrok motion-runtime install', 'Next: restart Grok Build'],
  'session-start': ['LitGrok payload present: skills, project rules, hooks, and the npx installer.'],
  'status-row': ['| Grok 4.5 [high] │ ctx [█▎░] 42%/2m', 'LIT IGNITED · litwork', '● litwork', '1m42s · 3 tools · 1 agent'],
};
// The install plan stays a single dark picture: the cream cells of the mark fade on a white window.
const themedNames = ['install-done', 'session-start', 'install-dry-run', 'status-row'];
const singleNames = ['install-plan'];

test('screen captures are the approved small lossless WebP files', () => {
  assert.deepEqual(readdirSync(SCREENS).sort(), Object.keys(screens).sort());
  for (const [name, expected] of Object.entries(screens)) {
    const path = join(SCREENS, name);
    assert.ok(lstatSync(path).isFile(), `${name} must be a regular file`);
    const bytes = readFileSync(path);
    assert.ok(bytes.length <= MAX_SCREEN_BYTES, `${name} must stay under 60 KiB`);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    assert.ok(!bytes.includes(Buffer.from('ANIM')), `${name} is a still picture`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, name);
  }
});

test('both guide pages show every capture with alt text that quotes what it shows', () => {
  for (const [file, heading, label, follows] of [
    ['docs/guide.md', '## What you will see on screen', 'Captured from', '## Watch it in motion'],
    ['docs/guide_ko-KR.md', '## 화면에 나오는 모습', '에서 캡처', '## 움직임으로 보기'],
  ]) {
    const content = read(file);
    assert.equal(content.split('\n').filter((line) => line === heading).length, 1, `${file} has one screens section`);
    const start = content.indexOf(heading);
    const section = content.slice(start, content.indexOf('\n## ', start + 4));
    const shown = new Set([...section.matchAll(/assets\/screens\/([\w.-]+\.webp)/gu)].map((match) => match[1]));
    assert.deepEqual([...shown].sort(), Object.keys(screens).sort(), `${file} must use exactly the shipped captures`);
    const pictures = [...section.matchAll(/<p align="center">(<picture>[\s\S]*?<\/picture>|<img [^>]*>)<\/p>/gu)].map((match) => match[1]);
    assert.equal(pictures.length, themedNames.length + singleNames.length, `${file} shows five pictures`);
    for (const html of pictures) assertCapture(file, html, './assets/screens/');
    assert.equal(section.split(label).length - 1, pictures.length, `${file}: every picture is labelled as a capture`);
    assert.ok(content.indexOf(heading) < content.indexOf(`\n${follows}\n`), `${file}: the captures come before the film`);
    for (const [, target] of section.matchAll(/(?:src|srcset)="(\.\/[^"]+)"/gu)) {
      const path = join(ROOT, 'docs', target);
      assert.ok(existsSync(path) && lstatSync(path).isFile(), `screen target must exist: ${target}`);
    }
  }
});

test('both GitHub pages show the session film in the demo slot near the top, and the captures live in the guide', () => {
  const opening = { 'README.md': 'A short film of a real Grok Build session in a small Node project', 'README_ko-KR.md': '작은 Node 프로젝트에서 실제로 진행한 Grok Build 세션을 짧은 영상으로 만들었고' };
  for (const file of ['README.md', 'README_ko-KR.md']) {
    const content = read(file);
    const slots = content.split('\n').filter((line) => line.startsWith('<!-- demo-gif -->'));
    assert.equal(slots.length, 1, `${file} has one demo slot`);
    assert.ok(content.indexOf(slots[0]) < content.indexOf('\n## '), `${file}: the demo slot sits above the first section`);
    const alt = /^<!-- demo-gif --><p align="center"><img src="\.\/docs\/assets\/demo\.webp" width="960" alt="([^"]+)" \/><\/p>$/u.exec(slots[0])?.[1] ?? '';
    assert.ok(alt.startsWith(opening[file]), `${file}: the demo slot shows the session film with an honest alt`);
    for (const quote of ['--shout', 'LIT IGNITED · litwork', 'HELLO, ADA!']) assert.ok(alt.includes(quote), `${file}: the film alt quotes "${quote}"`);
    assert.ok(alt.length <= 300, `${file}: the demo slot keeps a short alt`);
    assert.equal([...content.matchAll(/assets\/screens\//gu)].length, 0, `${file}: the captures live in the guide`);
  }
});

test('the README demo film is an animated WebP that stays out of the package and off the npm cards', () => {
  const film = readFileSync(join(ROOT, 'docs/assets/demo.webp'));
  assert.equal(film.subarray(0, 4).toString('latin1'), 'RIFF', 'demo.webp is a RIFF container');
  assert.equal(film.subarray(8, 12).toString('latin1'), 'WEBP', 'demo.webp is a WebP');
  assert.ok(film.length <= 8 * 1024 * 1024, `demo.webp stays within 8 MiB (${film.length} bytes)`);
  const files = JSON.parse(read('package.json')).files;
  assert.ok(!files.some((entry) => !entry.startsWith('!') && ('docs/assets/demo.webp' === entry || 'docs/assets/demo.webp'.startsWith(`${entry.replace(/\/$/u, '')}/`))), 'package.json files never ships demo.webp');
  for (const card of ['docs/npm/README.md', 'docs/npm/README_ko-KR.md']) assert.doesNotMatch(read(card), /demo\.(?:gif|webp)/u, `${card} does not embed the demo film`);
});

function assertCapture(file, html, base, quoteSet = quotes) {
  const alt = /alt="([^"]+)"/u.exec(html)?.[1] ?? '';
  const name = /assets\/screens\/([\w-]+?)(?:-dark|-light)?\.webp/u.exec(html)?.[1];
  assert.ok(quoteSet[name], `${file}: unknown picture ${html.slice(0, 80)}`);
  assert.ok(alt.length > 60, `${file}: ${name} needs descriptive alt text`);
  for (const quote of quoteSet[name]) assert.ok(alt.includes(quote), `${file}: alt of ${name} must quote "${quote}"`);
  assert.match(html, /width="\d{3,4}"/u, `${file}: ${name} keeps its natural width`);
  if (themedNames.includes(name)) {
    assert.ok(html.includes('<picture>'), `${file}: ${name} follows the page theme`);
    assert.ok(html.includes(`srcset="${base}${name}-dark.webp"`), `${file}: dark source for ${name}`);
    assert.ok(html.includes(`src="${base}${name}-light.webp"`), `${file}: light fallback for ${name}`);
  } else {
    assert.ok(html.includes(`src="${base}${name}-dark.webp"`), `${file}: ${name} is a single dark picture`);
  }
}

test('screen captures stay out of the npm tarball and off the npm cards', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.files.some((entry) => !entry.startsWith('!') && /docs\/assets\/screens|docs\/assets$|^docs$/u.test(entry)), false);
  for (const card of ['docs/npm/README.md', 'docs/npm/README_ko-KR.md']) assert.doesNotMatch(read(card), /assets\/screens/u);
});

test('README prose never states a payload count that differs from what the installer discovers', async (t) => {
  const project = mkdtempSync(join(tmpdir(), 'litgrok-readme-count-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  let stdout = '';
  const env = { ...process.env, HOME: project };
  delete env.CI;
  const code = await run(['install', '--dry-run', '--no-color'], {
    cwd: project,
    env,
    stdin: { isTTY: false },
    stdout: { isTTY: false, write(value) { stdout += String(value); return true; } },
    stderr: { isTTY: false, write() { return true; } },
  });
  assert.equal(code, 0);
  const discovered = stdout.split('\n').filter((line) => line.startsWith('would install ')).length;
  assert.ok(discovered > 1000, 'the dry run lists the payload');
  for (const file of ['README.md', 'README_ko-KR.md', 'docs/guide.md', 'docs/guide_ko-KR.md']) {
    // Picture alt text quotes the capture run, which the section labels as such; only prose is checked here.
    const prose = read(file).replace(/<p align="center">[\s\S]*?<\/p>/gu, '');
    for (const [phrase, count] of prose.matchAll(/(\d[\d,]{2,})\s*(?:lines|files|줄|개 파일)/gu)) {
      assert.equal(Number(count.replaceAll(',', '')), discovered, `${file}: "${phrase}" must match the ${discovered} files the installer discovers`);
    }
  }
});
