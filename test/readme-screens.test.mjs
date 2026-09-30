import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCREENS = join(ROOT, 'docs/assets/screens');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');

// Captures of LitGrok's own installer, SessionStart hook, prompt hook and status-line command.
const screens = {
  'install-done-dark.webp': 'c30aeb6694d244f3f87ee9aa4e6893472651b30cfc59e7f681032580d5bec1f2',
  'install-done-light.webp': '4bc21d18cda9a07cdd9bc8da194630b4144ed86a53158a0ae45d1983e101702b',
  'install-dry-run-dark.webp': '26a0068789abdd70815e683bf1eba5a655be5de1bd38c8b5523cacb95c57d99c',
  'install-dry-run-light.webp': '5ab945fe2634b15d8ff4447e77c7b8c53eef588bd58b1969b6a6bad5977045fe',
  'install-plan-dark.webp': '8d7caa3fc8d20ba9c3242a339d9616385f958ccb8829f08ad74d3b4ac31acae4',
  'session-start-dark.webp': '6e0d6a44b3de29bb75050b453501f16dda7d78983c8a0df694b2407df0fde578',
  'session-start-light.webp': 'a8d8bfc4438bbdf6fd262738ec5de1e6826b09ba49ae57c03f3ff0edc7c93016',
  'status-row-dark.webp': '3f27734e4aa11881029367a76c391948b075091e83c5cac361053b770801189a',
  'status-row-light.webp': 'c6f0e6fdccbb25318c9743dca45636e546d72d9a1d3ce88b6386cf4733e62dec',
};
const MAX_SCREEN_BYTES = 61_440;

// What each picture must quote in its alt text, in the language of the page.
const quotes = {
  'install-plan': ['INSTALL', '02 · Payload 1089 files · byte-identical copies only', 'Model selection: host-owned'],
  'install-dry-run': ['DRY RUN — no files written', 'would install ~/demo/.grok/agents/litgrok-executor.md'],
  'install-done': ['INSTALL STEPS', 'INSTALL RECEIPT', 'Status: Ready', 'Next: restart Grok Build'],
  'session-start': ['LitGrok payload present: skills, project rules, hooks, and the npx installer.'],
  'status-row': ['LIT · grok │ grok-4 │ ctx 42%', 'LIT IGNITED · litwork'],
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

test('both GitHub pages show every capture with alt text that quotes what it shows', () => {
  for (const [file, heading, label, follows] of [
    ['README.md', '### What you will see on screen', 'Captured from', '## Watch it in motion'],
    ['README_ko-KR.md', '### 화면에 나오는 모습', '에서 캡처', '## 움직임으로 보기'],
  ]) {
    const content = read(file);
    assert.equal(content.split('\n').filter((line) => line === heading).length, 1, `${file} has one screens subsection`);
    const start = content.indexOf(heading);
    const section = content.slice(start, content.indexOf('\n## ', start + 4));
    const shown = new Set([...section.matchAll(/docs\/assets\/screens\/([\w.-]+\.webp)/gu)].map((match) => match[1]));
    assert.deepEqual([...shown].sort(), Object.keys(screens).sort(), `${file} must use exactly the shipped captures`);
    const pictures = [...section.matchAll(/<p align="center">(<picture>[\s\S]*?<\/picture>|<img [^>]*>)<\/p>/gu)].map((match) => match[1]);
    assert.equal(pictures.length, themedNames.length + singleNames.length, `${file} shows five pictures`);
    for (const html of pictures) {
      const alt = /alt="([^"]+)"/u.exec(html)?.[1] ?? '';
      const name = /docs\/assets\/screens\/([\w-]+?)(?:-dark|-light)?\.webp/u.exec(html)?.[1];
      assert.ok(quotes[name], `${file}: unknown picture ${html.slice(0, 80)}`);
      assert.ok(alt.length > 60, `${file}: ${name} needs descriptive alt text`);
      for (const quote of quotes[name]) assert.ok(alt.includes(quote), `${file}: alt of ${name} must quote "${quote}"`);
      assert.match(html, /width="\d{3,4}"/u, `${file}: ${name} keeps its natural width`);
      if (themedNames.includes(name)) {
        assert.ok(html.includes('<picture>'), `${file}: ${name} follows the page theme`);
        assert.ok(html.includes(`srcset="./docs/assets/screens/${name}-dark.webp"`), `${file}: dark source for ${name}`);
        assert.ok(html.includes(`src="./docs/assets/screens/${name}-light.webp"`), `${file}: light fallback for ${name}`);
      } else {
        assert.ok(html.includes(`src="./docs/assets/screens/${name}-dark.webp"`), `${file}: ${name} is a single dark picture`);
      }
    }
    assert.equal(section.split(label).length - 1, pictures.length, `${file}: every picture is labelled as a capture`);
    assert.ok(content.indexOf(heading) < content.indexOf(`\n${follows}\n`), `${file}: sits at the end of the quick start`);
    for (const [, target] of section.matchAll(/(?:src|srcset)="(\.\/[^"]+)"/gu)) {
      assert.ok(existsSync(join(ROOT, target)) && lstatSync(join(ROOT, target)).isFile(), `screen target must exist: ${target}`);
    }
  }
});

test('screen captures stay out of the npm tarball and off the npm cards', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.files.some((entry) => !entry.startsWith('!') && /docs\/assets\/screens|docs\/assets$|^docs$/u.test(entry)), false);
  for (const card of ['docs/npm/README.md', 'docs/npm/README_ko-KR.md']) assert.doesNotMatch(read(card), /assets\/screens/u);
});
