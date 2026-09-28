import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ASSETS = 'docs/assets/readme';
const COVER = 'https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.9/docs/assets/cover-motion.webp';
const COVER_FALLBACK = COVER;
const MOTION_STILL = 'https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.9/docs/assets/cover-motion-still.webp';
const STATIC_COVER = 'https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.9/docs/assets/cover.webp';
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const sha = (path) => createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex');
const displayRows = [...JSON.parse(read('test/fixtures/lit-mark/ignition-b.json')).banner.map((row) => row.text.trimEnd()), '', 'grok'];

test('README resources follow the motion-cover decoration and retain exact copyable rows and native links', () => {
  for (const [name, reference, install] of [
    ['README.md', 'docs/reference.md', '#install-in-30-seconds'],
    ['README_ko-KR.md', 'docs/reference_ko-KR.md', '#30초-설치'],
  ]) {
    const text = read(name);
    assert.ok(text.includes(`<source media="(prefers-reduced-motion: reduce)" srcset="${MOTION_STILL}" />`));
    assert.ok(text.includes(`<source media="(prefers-reduced-motion: no-preference)" srcset="${COVER}" />`));
    assert.ok(text.includes(`<img src="${COVER_FALLBACK}" width="100%"`), `${name}: npm-safe img fallback keeps the motion cover`);
    assert.ok(text.indexOf(COVER) < text.indexOf("<h1 align=\"center\">LitGrok"), `${name}: cover leads the README`);
    assert.ok(!text.includes(STATIC_COVER), `${name}: the motion robot cover replaces the static robot cover`);
    assert.equal([...text.matchAll(/width="100%"/gu)].length, 1, `${name}: the motion cover is the only full-width image`);
    assert.doesNotMatch(text, /View the static (?:family )?cover|정지 (?:패밀리 )?표지 보기/u, `${name}: no hidden static-cover link remains`);
    assert.match(text, /<p align="center"><img src="https:\/\/cdn\.jsdelivr\.net\/npm\/@litfamily\/litgrok@1\.0\.9\/docs\/assets\/readme\/ascii-readme\.svg" width="480" alt="[^"]+" \/><\/p>/u);
    const blocks = [...text.matchAll(/<details>\n<summary>[^\n]+<\/summary>\n\n```text\n([\s\S]*?)\n```\n\n<\/details>/gu)];
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0][1], displayRows.join('\n'));
    assert.doesNotMatch(text, /unpublished local candidate|아직 공개되지 않은 로컬 후보/u);
    assert.match(text, /npm exec --yes --package @litfamily\/litgrok@latest -- litgrok install/u);
    const packageVersion = JSON.parse(read('package.json')).version;
    const packageUrl = `https://cdn.jsdelivr.net/npm/@litfamily/litgrok@${packageVersion}/`;
    assert.ok(text.includes(`href="${packageUrl}${reference}"`));
    assert.ok(text.includes(`href="${install}"`));
    assert.ok(text.includes(`href="${packageUrl}LICENSE"`));
    assert.doesNotMatch(text, /(?:src|srcset|href)="\.{1,2}\/|\]\(\.{1,2}\//u, `${name}: npm-rendered README must not contain relative file URLs`);
    assert.doesNotMatch(text, /ignition-film\.mp4|ignition-poster\.png|ignition-readme\.gif/u);
    assert.doesNotMatch(text, /README visual draft|<video\b|https?:\/\/img\.shields\.io/u);
    for (const icon of ['book-open', 'play', 'shield-check']) {
      assert.ok(text.includes(`src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.9/docs/assets/readme/lucide-${icon}.svg"`));
    }
  }
});

test('npm README media and local file links use current-version URLs shipped in the package', () => {
  const packageJson = JSON.parse(read('package.json'));
  const packageUrl = `https://cdn.jsdelivr.net/npm/@litfamily/litgrok@${packageJson.version}/`;
  for (const name of ['README.md', 'README_ko-KR.md']) {
    const text = read(name);
    const mediaUrls = [...text.matchAll(/(?:src|srcset)="([^"]+)"/gu)].map((match) => match[1]);
    for (const match of text.matchAll(/!\[[^\]]*\]\(([^)]+)\)/gu)) mediaUrls.push(match[1]);
    assert.ok(mediaUrls.length > 0, `${name}: expected README media`);
    for (const url of mediaUrls) assert.ok(url.startsWith(packageUrl), `${name}: media must use the current package CDN URL: ${url}`);

    const localPackageUrls = [...text.matchAll(/(?:src|srcset|href)="(https:\/\/cdn\.jsdelivr\.net\/npm\/@litfamily\/litgrok@[^"]+)"|\]\((https:\/\/cdn\.jsdelivr\.net\/npm\/@litfamily\/litgrok@[^)]+)\)/gu)]
      .map((match) => match[1] ?? match[2]);
    assert.ok(localPackageUrls.length > 0, `${name}: expected package URLs`);
    for (const url of localPackageUrls) {
      assert.ok(url.startsWith(packageUrl), `${name}: package URL must be pinned to ${packageJson.version}`);
      const pathname = decodeURIComponent(new URL(url).pathname.slice(new URL(packageUrl).pathname.length));
      assert.ok(existsSync(join(ROOT, pathname)), `${name}: ${pathname} must exist in the package source`);
      assert.ok(packageJson.files.some((entry) => pathname === entry || pathname.startsWith(`${entry.replace(/\/$/u, '')}/`)), `${name}: ${pathname} must be covered by package files[]`);
    }
  }
});

test('README artwork retains approved bytes, notices and static release metadata in the package allowlist', () => {
  const approved = {
    'ascii-readme.svg': '045cf463570953c300e6c34ea89c674e0d0a47d8cf2a3b643fc887d9cc517f22',
        'ignition-poster.png': '0fac2d0fc78d311710d1658968a45f8d9ff07ff73c6ca6f3ebc60bcb698d318f',
    'ignition-film.mp4': 'b1579c89a677ab453765f77ae6361bd9730fabc4291a85071de7f373fc5ebfad',
    'ignition-readme.gif': '0be7badaee33df26a5a200c4f664273a21e9f2513fc066571f579f235220ca81',
    'lucide-book-open.svg': '3ae327cc4bbff19933a3ed535978ff558985b1bcca950e5484f61aa78764ebd2',
    'lucide-play.svg': 'ab6e5f5c9e61ec2d8ddd6b93b5476b976c8a0086f5529142a7981284d85f8b83',
    'lucide-shield-check.svg': 'aefbe606a9d7cf919208bbd64dfd453b83364f020585be43f32ba162fda4115c',
    'Lucide-LICENSE.txt': 'b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57',
    'JetBrainsMono-OFL.txt': 'a76abf002c49097d146e86740a3105a5d00450b1592e820a1109a8c5680cd697',
  };
  assert.equal(sha('docs/assets/cover.webp'), '0725bed298d34bd5221955fb856b10b4f996b595effc838c9e053954ac49eddd');
  const motionCover = readFileSync(join(ROOT, 'docs/assets/cover-motion.webp'));
  assert.ok(motionCover.length <= 2_621_440, 'motion cover must stay under 2.5 MiB');
  assert.equal(createHash('sha256').update(motionCover).digest('hex'), 'e4ff0b0bb4d77d9f7dadcb7110334ec623be6bc04f74753b6f571981a09cd3cd');
  assert.equal(sha('docs/assets/cover-motion-still.webp'), '29edb07d1584fc9f84b2f243a7f4eb33d1f05ff5a235a46f1b4391824e96a539');
  for (const [name, hash] of Object.entries(approved)) assert.equal(sha(`${ASSETS}/${name}`), hash, name);
  assert.deepEqual(readdirSync(join(ROOT, ASSETS)).filter((name) => name.startsWith('lucide-')).sort(), ['lucide-book-open.svg', 'lucide-play.svg', 'lucide-shield-check.svg']);
  const svg = read(`${ASSETS}/ascii-readme.svg`);
  assert.deepEqual([...svg.matchAll(/<g aria-label="([^"]*)">/gu)].map((match) => match[1]), displayRows);
  assert.match(svg, /<path\b/u);
  assert.doesNotMatch(svg, /<(?:image|text|script|foreignObject)\b|\b(?:href|on[a-z]+)\s*=|url\s*\(|@import|<!DOCTYPE|<!ENTITY/iu);
  const packageJson = JSON.parse(read('package.json'));
  const badge = read(`${ASSETS}/badge-version.svg`);
  assert.ok(badge.includes(`aria-label="local: ${packageJson.version}"`));
  assert.ok(badge.includes(`<title>local: ${packageJson.version}</title>`));
  assert.ok(badge.includes(`>${packageJson.version}</text>`));
  assert.doesNotMatch(badge, /\bcandidate\b/iu);
  assert.match(read(`${ASSETS}/badge-license.svg`), /aria-label="license: MIT"/u);
  const landing = [
    'docs/assets/cover.webp',
    'docs/assets/cover-motion.webp',
    'docs/assets/cover-motion-still.webp',
    'docs/assets/litgrok-wordmark.svg',
    'docs/assets/litgrok-clay-icon.png',
    'docs/assets/litgrok-ignition-1600.webp',
    'docs/assets/litgrok-continuity-1600.webp',
    'docs/assets/readme/badge-version.svg',
    'docs/assets/readme/badge-license.svg',
    'docs/assets/readme/ascii-readme.svg',
    'docs/assets/readme/lucide-book-open.svg',
    'docs/assets/readme/lucide-play.svg',
    'docs/assets/readme/lucide-shield-check.svg',
    'docs/assets/readme/Lucide-LICENSE.txt',
    'docs/assets/skills',
  ];
  for (const path of landing) assert.equal(packageJson.files.includes(path), true, `${path} must ship for npmjs artwork`);
  assert.ok(!packageJson.files.includes('docs/assets/cover.svg'), 'vector fallback stays outside the package allowlist');
  assert.ok(!packageJson.files.some((path) => path === 'docs' || path === 'docs/assets' || /[*?]/u.test(path)), 'broad docs globs stay out of the package allowlist');
});

test('README skill tables give every packaged skill one shipped 240 px snapshot in both languages', () => {
  const packageJson = JSON.parse(read('package.json'));
  const base = `https://cdn.jsdelivr.net/npm/@litfamily/litgrok@${packageJson.version}/docs/assets/skills/`;
  const skills = readdirSync(join(ROOT, '.grok/skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.ok(packageJson.files.includes('docs/assets/skills'), 'skill snapshots ship so npmjs can render them');
  assert.deepEqual(readdirSync(join(ROOT, 'docs/assets/skills')).sort(), skills.map((id) => `${id}.webp`).sort(), 'one snapshot per packaged skill and nothing else');
  for (const id of skills) {
    const bytes = readFileSync(join(ROOT, 'docs/assets/skills', `${id}.webp`));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', id);
    assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', id);
    assert.ok(bytes.length <= 81_920, `${id} snapshot exceeds 80 KiB`);
  }
  for (const [name, heading, anchor, next, intro, motion] of [
    ['README.md', '## Skills at a glance', '#skills-at-a-glance', '## Command and hook table', `All ${skills.length} skills, one row each.`, 'The cover is brand motion made with the LitFamily motion skill'],
    ['README_ko-KR.md', '## 스킬 한눈에 보기', '#스킬-한눈에-보기', '## 명령과 hook 표', `skill ${skills.length}개를 한 줄씩 정리했습니다.`, '커버의 모션은 LitFamily 모션 skill로 만든 브랜드 연출'],
  ]) {
    const text = read(name);
    assert.equal(text.split('\n').filter((line) => line === heading).length, 1, `${name}: one skills section`);
    const navLink = text.indexOf(`](${anchor})`);
    assert.ok(navLink > 0 && navLink < text.indexOf('\n## '), `${name}: the top nav links the skills section`);
    assert.ok(text.includes(motion), `${name}: the cover note names the motion skill`);
    const start = text.indexOf(`\n${heading}\n`);
    const end = text.indexOf(`\n${next}\n`);
    assert.ok(start > 0 && end > start, `${name}: the skills section precedes ${next}`);
    const section = text.slice(start, end);
    assert.ok(section.includes(intro), `${name}: the intro states the packaged skill count`);
    const rows = [...section.matchAll(/<tr>\n<td><img src="([^"]+)" width="240" alt="[^"]+" \/><\/td>\n<td><code>([^<]+)<\/code><br \/><sub>/gu)];
    assert.deepEqual(rows.map((match) => match[2]).sort(), skills, `${name}: one row per packaged skill`);
    for (const [, src, id] of rows) assert.equal(src, `${base}${id}.webp`, `${name}: ${id} snapshot URL`);
    assert.equal([...text.matchAll(/docs\/assets\/skills\//gu)].length, skills.length, `${name}: snapshots appear only in the skills table`);
  }
});

function withGenerator(t) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-readme-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['tools/generate-lit-mark.mjs', 'test/fixtures/lit-mark/ignition-b.json', '.grok/hooks/lit-mark.mjs', 'README.md', 'README_ko-KR.md', `${ASSETS}/ascii-readme.svg`]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    copyFileSync(join(ROOT, path), join(root, path));
  }
  return { root, run: (...args) => spawnSync(process.execPath, ['tools/generate-lit-mark.mjs', ...args], { cwd: root, encoding: 'utf8', timeout: 10_000 }) };
}

test('README generator repairs only the copyable mark and preserves runtime bytes and unrelated text blocks', (t) => {
  const { root, run } = withGenerator(t);
  const path = join(root, 'README.md');
  const prefix = '```text\nAn unrelated text example.\n```\n\n';
  writeFileSync(path, prefix + read('README.md').replace(displayRows[0], 'changed row'));
  const stale = run('--check');
  assert.notEqual(stale.status, 0);
  assert.match(stale.stderr, /LIT_MARK_STALE: README\.md/u);
  const generated = run();
  assert.equal(generated.status, 0, generated.stderr);
  assert.equal(readFileSync(path, 'utf8'), prefix + read('README.md'));
  assert.equal(readFileSync(join(root, '.grok/hooks/lit-mark.mjs'), 'utf8'), read('.grok/hooks/lit-mark.mjs'));
  assert.equal(run('--check').status, 0);
});

test('README generator rejects a missing copyable details block instead of rewriting a user example', (t) => {
  const { root, run } = withGenerator(t);
  const original = read('README.md').replace('<details>', '<section>');
  writeFileSync(join(root, 'README.md'), original);
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LIT_MARK_HERO_MISSING: README\.md/u);
  assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), original);
});

test('README generator rejects altered outline bytes before changing generated outputs', (t) => {
  const { root, run } = withGenerator(t);
  writeFileSync(join(root, ASSETS, 'ascii-readme.svg'), read(`${ASSETS}/ascii-readme.svg`).replace('M0 -300V360H600V-300Z', 'M0 0'));
  const result = run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /LIT_MARK_README_VECTOR_CHANGED/u);
  assert.equal(readFileSync(join(root, '.grok/hooks/lit-mark.mjs'), 'utf8'), read('.grok/hooks/lit-mark.mjs'));
  assert.equal(readFileSync(join(root, 'README.md'), 'utf8'), read('README.md'));
});
