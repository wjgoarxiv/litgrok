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

// Carbon-style window cards of LitGrok's own installer, SessionStart hook, prompt hook and status-line command.
// The card is the same on both page themes, so each -dark/-light pair holds the same picture.
const screens = {
  'install-done-dark.webp': 'd0dc21f99b47b1a627e49336cb5143addf65ed4ce2f95181602f63780897b3df',
  'install-done-light.webp': 'd0dc21f99b47b1a627e49336cb5143addf65ed4ce2f95181602f63780897b3df',
  'install-dry-run-dark.webp': '3653616b34a95511ca06896e1b99058135b0d6c5a96a6d684e66475c471d5f41',
  'install-dry-run-light.webp': '3653616b34a95511ca06896e1b99058135b0d6c5a96a6d684e66475c471d5f41',
  'install-plan-dark.webp': 'ad9afa5cf46559229db9ddc0dcba50391be1175253c087a829021d3bd0f9fb72',
  'session-start-dark.webp': 'd07774527e10333ef01cd6833d87466351e7d58f9323504878d7e4a0fc73877f',
  'session-start-light.webp': 'd07774527e10333ef01cd6833d87466351e7d58f9323504878d7e4a0fc73877f',
  'status-row-dark.webp': '5cc43af2e7623e6f6ba0375f4821bcdd6d2022df3bedef7401b90e016ea2f0c8',
  'status-row-light.webp': '5cc43af2e7623e6f6ba0375f4821bcdd6d2022df3bedef7401b90e016ea2f0c8',
};
const MAX_SCREEN_BYTES = 245_760;

// What each picture must quote in its alt text, in the language of the page.
const quotes = {
  'install-plan': ['INSTALL', '02 · Payload 380 files · byte-identical copies only', 'Model selection: host-owned'],
  'install-dry-run': ['DRY RUN — no files written', '02 · Payload 380 files', 'would install ~/demo/.grok/agents/litgrok-executor.md'],
  'install-done': ['INSTALL STEPS', 'PAYLOAD · 380 files discovered', 'WRITE · 380 written', 'INSTALL RECEIPT', 'Status: Ready', 'Next: restart Grok Build'],
  'session-start': ['LitGrok payload present: skills, project rules, hooks, and the npx installer.'],
  'status-row': ['| Grok 4.5 [high] │ ctx [█▎░] 42%/2m │ $0.43 │ git main', '· litwork', '3 tools · 1 agent ● 1m42s', 'plan ✓ ━━━━', 'work 3/7', 'review · ──── done ·', 'task 3/7', 'next ▸ 4. Document the flag', 'tests ✓ 3', 'Bash 0:12'],
};
// The install plan was always a single picture; the other four keep their themed pair.
const themedNames = ['install-done', 'session-start', 'install-dry-run', 'status-row'];
const singleNames = ['install-plan'];

test('screen captures are the approved small lossless WebP files', () => {
  assert.deepEqual(readdirSync(SCREENS).sort(), Object.keys(screens).sort());
  for (const [name, expected] of Object.entries(screens)) {
    const path = join(SCREENS, name);
    assert.ok(lstatSync(path).isFile(), `${name} must be a regular file`);
    const bytes = readFileSync(path);
    assert.ok(bytes.length <= MAX_SCREEN_BYTES, `${name} must stay under 240 KiB`);
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
    for (const quote of ['--shout', '[LIT v1.0.16] LIT IGNITED · litwork', 'Read 2 skills', 'pre_tool_use', 'Re-run tests and check the shout CLI', 'HELLO, ADA!', 'litwork complete · 35s · 2 tools']) assert.ok(alt.includes(quote), `${file}: the film alt quotes "${quote}"`);
    assert.ok(alt.length <= 800, `${file}: the demo slot keeps its alt to the seven steps`);
    assert.doesNotMatch(content, /<sub>[^<]*(?:recorded|replayed|녹화|재생)/u, `${file}: no method caption under the demo`);
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
  assert.ok(discovered > 200, 'the dry run lists the payload');
  for (const file of ['README.md', 'README_ko-KR.md', 'docs/guide.md', 'docs/guide_ko-KR.md']) {
    // Picture alt text quotes the capture run, which the section labels as such; only prose is checked here.
    const prose = read(file).replace(/<p align="center">[\s\S]*?<\/p>/gu, '');
    for (const [phrase, count] of prose.matchAll(/(\d[\d,]{2,})\s*(?:lines|files|줄|개 파일)/gu)) {
      assert.equal(Number(count.replaceAll(',', '')), discovered, `${file}: "${phrase}" must match the ${discovered} files the installer discovers`);
    }
  }
});

// Captures of the `litgrok auto-handoff` command and of the status line around a Stop-hook handoff request.
const autoHandoff = {
  'auto-handoff-env-dark.webp': '2144ee9406b5450bd0da125aea4a041e51a5b9a4d1c5ff67249db2a268b5c83a',
  'auto-handoff-env-light.webp': '2144ee9406b5450bd0da125aea4a041e51a5b9a4d1c5ff67249db2a268b5c83a',
  'auto-handoff-off-dark.webp': '8b54ebdf7243f8f10918579d034b2e62e05c457d8b65659b8d21f76af124524c',
  'auto-handoff-off-light.webp': '8b54ebdf7243f8f10918579d034b2e62e05c457d8b65659b8d21f76af124524c',
  'auto-handoff-on-dark.webp': '0e1f9283255410a2ba842793df65e2748b4f32af98d3082e5415f57a48b277a4',
  'auto-handoff-on-light.webp': '0e1f9283255410a2ba842793df65e2748b4f32af98d3082e5415f57a48b277a4',
  'auto-handoff-session-dark.webp': '21b676828675e98114a166b922b07e18f11fff8c556a7750cdcf5f8b4c968a40',
  'auto-handoff-session-light.webp': '21b676828675e98114a166b922b07e18f11fff8c556a7750cdcf5f8b4c968a40',
};
const autoHandoffQuotes = {
  'auto-handoff-on': ['litgrok auto-handoff on 60', 'Automatic handoff is ON at 60 percent for this project.', 'litgrok auto-handoff status', 'Automatic handoff: ON at 60 percent', 'It needs the LitGrok status line (litgrok install --user --status-line)'],
  'auto-handoff-session': ['ctx 54% → handoff at 60%', 'ctx 61% ≥ handoff at 60%', 'handoff requested'],
  'auto-handoff-off': ['litgrok auto-handoff off', 'Automatic handoff is OFF for this project.', '60 percent is remembered for the next &quot;on&quot;.'],
  'auto-handoff-env': ['export LITGROK_AUTO_HANDOFF=1 LITGROK_AUTO_HANDOFF_PERCENT=50', 'Automatic handoff: ON at 50 percent', 'Percent: 50, from LITGROK_AUTO_HANDOFF_PERCENT', 'LITGROK_AUTO_HANDOFF in this environment overrides .grok/litgrok/auto-handoff.json.'],
};

test('both GitHub pages show every automatic-handoff capture in its section, themed and quoted', () => {
  const folder = join(ROOT, 'docs/assets/auto-handoff');
  assert.deepEqual(readdirSync(folder).sort(), Object.keys(autoHandoff).sort());
  for (const [name, expected] of Object.entries(autoHandoff)) {
    const bytes = readFileSync(join(folder, name));
    assert.ok(bytes.length <= MAX_SCREEN_BYTES, `${name} must stay under 240 KiB`);
    assert.equal(bytes.subarray(8, 16).toString(), 'WEBPVP8L', `${name} is a lossless WebP`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, name);
  }
  for (const [file, heading] of [['README.md', '## Automatic handoff'], ['README_ko-KR.md', '## 자동 핸드오프']]) {
    const content = read(file);
    const start = content.indexOf(`\n${heading}\n`);
    assert.ok(start > 0, `${file} has the section`);
    const section = content.slice(start, content.indexOf('\n## ', start + 4));
    const pictures = [...section.matchAll(/<p align="center">(<picture>[\s\S]*?<\/picture>)<\/p>/gu)].map((match) => match[1]);
    assert.deepEqual(pictures.map((html) => /auto-handoff\/([\w-]+)-light\.webp/u.exec(html)?.[1]), Object.keys(autoHandoffQuotes), `${file} shows the four captures in order`);
    for (const html of pictures) {
      const name = /auto-handoff\/([\w-]+)-light\.webp/u.exec(html)[1];
      assert.ok(html.includes(`srcset="./docs/assets/auto-handoff/${name}-dark.webp"`), `${file}: dark source for ${name}`);
      const alt = /alt="([^"]+)"/u.exec(html)?.[1] ?? '';
      for (const quote of autoHandoffQuotes[name]) assert.ok(alt.includes(quote), `${file}: alt of ${name} must quote "${quote}"`);
    }
  }
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.files.some((entry) => !entry.startsWith('!') && /docs\/assets\/auto-handoff|docs\/assets$|^docs$/u.test(entry)), false, 'the captures stay out of the package');
  for (const card of ['docs/npm/README.md', 'docs/npm/README_ko-KR.md']) assert.doesNotMatch(read(card), /assets\/auto-handoff/u);
});

test('the guide names no removed command and quotes no stale payload count, in prose or in a picture', () => {
  for (const file of ['docs/guide.md', 'docs/guide_ko-KR.md']) {
    const content = read(file);
    for (const removed of [/motion-runtime/u, /pre-warm/u, /video tools/u, /영상 도구/u]) assert.doesNotMatch(content, removed, `${file}: ${removed}`);
    // The pictures were recaptured after the diet; no alt may fall back to the old file count.
    for (const [, alt] of content.matchAll(/alt="([^"]+)"/gu)) assert.doesNotMatch(alt, /\b1315\b/u, `${file}: an alt still quotes the 1315-file payload`);
  }
});
