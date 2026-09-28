import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = 'scripts/readme-for-npm.mjs';
const PAIRS = [['README.md', 'docs/npm/README.md'], ['README_ko-KR.md', 'docs/npm/README_ko-KR.md']];
const PACKAGE = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const CDN = `https://cdn.jsdelivr.net/npm/${PACKAGE.name}@${PACKAGE.version}/`;
const read = (root, path) => readFileSync(join(root, path));

function fixture(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'litgrok-readme-npm-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const paths = new Set(['package.json', SCRIPT, 'docs/assets/cover.svg', ...PAIRS.flat()]);
  for (const [, source] of PAIRS) {
    for (const match of readFileSync(join(ROOT, source), 'utf8').matchAll(/https:\/\/cdn\.jsdelivr\.net\/npm\/@litfamily\/litgrok@[^/]+\/([^")#\s]+)/gu)) {
      paths.add(decodeURIComponent(match[1]));
    }
  }
  for (const path of paths) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(root, path));
  }
  return { root, run: (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8', timeout: 20_000 }) };
}

test('the committed npm READMEs pass the swap check', () => {
  const result = spawnSync(process.execPath, [SCRIPT, 'check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /readme-for-npm check OK/u);
});

test('packing swaps the npm READMEs in and back out; the sources and backup never ship', () => {
  assert.equal(PACKAGE.scripts.prepack, `node ${SCRIPT} apply`);
  assert.equal(PACKAGE.scripts.postpack, `node ${SCRIPT} restore`);
  assert.equal(PACKAGE.scripts['check:npm-readme'], `node ${SCRIPT} check`);
  assert.ok(PACKAGE.files.includes('README.md') && PACKAGE.files.includes('README_ko-KR.md'));
  assert.ok(!PACKAGE.files.some((entry) => entry === 'docs' || entry.startsWith('docs/npm') || entry.startsWith('scripts')), 'npm page sources and the swap script stay out of files[]');
  assert.match(readFileSync(join(ROOT, '.gitignore'), 'utf8'), /^\.readme-for-npm\/$/mu, 'the README backup is never tracked');
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const paths = JSON.parse(result.stdout)[0].files.map((file) => file.path);
  assert.deepEqual(paths.filter((path) => path.startsWith('docs/npm/') || path.startsWith('.readme-for-npm/') || path.startsWith('scripts/')), []);
});

test('apply swaps in the npm pages, is idempotent, and restore brings back the GitHub pages byte for byte', (t) => {
  const { root, run } = fixture(t);
  const originals = PAIRS.map(([target]) => read(root, target));
  const applied = run('apply');
  assert.equal(applied.status, 0, applied.stderr);
  for (const [target, source] of PAIRS) assert.deepEqual(read(root, target), read(root, source), `${target} is the npm page`);
  PAIRS.forEach(([target], index) => assert.deepEqual(read(root, join('.readme-for-npm', target)), originals[index]));
  const again = run('apply');
  assert.equal(again.status, 0, again.stderr);
  assert.match(again.stderr, /already applied/u);
  const restored = run('restore');
  assert.equal(restored.status, 0, restored.stderr);
  PAIRS.forEach(([target], index) => assert.deepEqual(read(root, target), originals[index], `${target} is restored`));
  assert.equal(existsSync(join(root, '.readme-for-npm')), false, 'restore removes the backup');
  const nothing = run('restore');
  assert.equal(nothing.status, 0, nothing.stderr);
  assert.match(nothing.stderr, /nothing to restore/u);
});

test('apply refuses a stale backup and leaves the working tree alone', (t) => {
  const { root, run } = fixture(t);
  mkdirSync(join(root, '.readme-for-npm'));
  writeFileSync(join(root, '.readme-for-npm', 'README.md'), 'stale\n');
  const before = read(root, 'README.md');
  const result = run('apply');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /run restore first/u);
  assert.deepEqual(read(root, 'README.md'), before);
});

test('check rejects relative targets, stale pins, unshipped files, dead anchors and a missing GitHub guide link', (t) => {
  const { root, run } = fixture(t);
  const source = join(root, 'docs/npm/README.md');
  const clean = readFileSync(source, 'utf8');
  const cases = [
    [clean.replace(`${CDN}docs/assets/cover-motion-still.webp`, './docs/assets/cover-motion-still.webp'), /relative target \.\/docs\/assets\/cover-motion-still\.webp/u],
    [clean.replace(`${CDN}LICENSE`, CDN.replace(PACKAGE.version, '0.0.1') + 'LICENSE'), /not pinned|stale pin/u],
    [`${clean}\n![vector](${CDN}docs/assets/cover.svg)\n`, /docs\/assets\/cover\.svg is not in package files\[\]/u],
    [`${clean}\n[gone](#no-such-heading)\n`, /no heading for #no-such-heading/u],
    [clean.replaceAll('https://github.com/wjgoarxiv/litgrok#readme', 'https://example.invalid/'), /missing the full-guide link/u],
  ];
  for (const [text, message] of cases) {
    writeFileSync(source, text);
    const checked = run('check');
    assert.equal(checked.status, 1, `expected failure for ${message}`);
    assert.match(checked.stderr, message);
    const before = read(root, 'README.md');
    assert.equal(run('apply').status, 1, 'apply refuses an npm page that fails the check');
    assert.deepEqual(read(root, 'README.md'), before);
    assert.equal(existsSync(join(root, '.readme-for-npm')), false);
  }
  writeFileSync(source, clean);
  assert.equal(run('check').status, 0);
});

test('a real npm pack runs the swap: the tarball carries the npm page and the tree is restored', (t) => {
  const { root } = fixture(t);
  const originals = PAIRS.map(([target]) => read(root, target));
  const destination = join(root, '..', `${root.split('/').pop()}-pack`);
  mkdirSync(destination);
  t.after(() => rmSync(destination, { recursive: true, force: true }));
  const env = { ...process.env, npm_config_cache: join(destination, 'cache') };
  delete env.npm_config_dry_run;
  const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', destination], { cwd: root, encoding: 'utf8', env, timeout: 120_000 });
  assert.equal(packed.status, 0, packed.stderr);
  const [info] = JSON.parse(packed.stdout);
  assert.ok(info.files.some((file) => file.path === 'README.md'));
  assert.ok(!info.files.some((file) => file.path.startsWith('docs/npm/') || file.path.startsWith('.readme-for-npm/')));
  for (const [target, source] of PAIRS) {
    const inside = spawnSync('tar', ['-xzOf', join(destination, info.filename), `package/${target}`], { encoding: 'buffer' });
    assert.equal(inside.status, 0, String(inside.stderr));
    assert.deepEqual(inside.stdout, read(root, source), `the packed ${target} is the npm page`);
  }
  PAIRS.forEach(([target], index) => assert.deepEqual(read(root, target), originals[index], `${target} is byte-identical after packing`));
  assert.equal(existsSync(join(root, '.readme-for-npm')), false);
});
