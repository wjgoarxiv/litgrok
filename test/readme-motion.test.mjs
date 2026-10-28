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
const COVER = 'https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.29/docs/assets/cover-motion.webp';
const COVER_FALLBACK = COVER;
const MOTION_STILL = 'https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.29/docs/assets/cover-motion-still.webp';
const STATIC_COVER = 'https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.29/docs/assets/cover.webp';
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const sha = (path) => createHash('sha256').update(readFileSync(join(ROOT, path))).digest('hex');
const displayRows = [...JSON.parse(read('test/fixtures/lit-mark/ignition-b.json')).banner.map((row) => row.text.trimEnd()), '', 'grok'];

const GITHUB_PAGES = [
  ['README.md', 'docs/reference.md', '#install-in-30-seconds'],
  ['README_ko-KR.md', 'docs/reference_ko-KR.md', '#30초-설치'],
];
const NPM_PAGES = [
  ['docs/npm/README.md', 'docs/reference.md', '#install-in-30-seconds', 'https://github.com/wjgoarxiv/litgrok#readme'],
  ['docs/npm/README_ko-KR.md', 'docs/reference_ko-KR.md', '#30초-설치', 'https://github.com/wjgoarxiv/litgrok/blob/main/README_ko-KR.md'],
];
const slug = (heading) => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/gu, '-');

function assertMotionCover(name, text, cover, still, { liveBadges = false } = {}) {
  assert.ok(text.includes(`<source media="(prefers-reduced-motion: reduce)" srcset="${still}" />`), `${name}: reduced-motion still`);
  assert.ok(text.includes(`<source media="(prefers-reduced-motion: no-preference)" srcset="${cover}" />`), `${name}: motion source`);
  assert.ok(text.includes(`<img src="${cover}" width="100%"`), `${name}: img fallback keeps the motion cover`);
  assert.ok(text.indexOf(cover) < text.indexOf("<h1 align=\"center\">LitGrok"), `${name}: cover leads the README`);
  assert.ok(!text.includes('docs/assets/cover.webp"'), `${name}: the motion robot cover replaces the static robot cover`);
  assert.equal([...text.matchAll(/width="100%"/gu)].length, 1, `${name}: the motion cover is the only full-width image`);
  assert.doesNotMatch(text, /View the static (?:family )?cover|정지 (?:패밀리 )?표지 보기/u, `${name}: no hidden static-cover link remains`);
  assert.doesNotMatch(text, /unpublished local candidate|아직 공개되지 않은 로컬 후보/u);
  assert.match(text, /npm exec --yes --package @litfamily\/litgrok@latest -- litgrok install/u);
  assert.doesNotMatch(text, /ignition-film\.mp4|ignition-poster\.png|ignition-readme\.gif/u);
  assert.doesNotMatch(text, /README visual draft|<video\b/u);
  const badges = [...text.matchAll(/<img src="(https:\/\/img\.shields\.io\/[^"]+)"/gu)].map((match) => match[1]);
  if (!liveBadges) {
    assert.deepEqual(badges, [], `${name}: the npm card shows only artwork shipped in the package`);
    return;
  }
  // The GitHub landing carries exactly four live badges, between the title and the first section.
  assert.deepEqual(badges.map((url) => new URL(url).pathname), [
    '/npm/v/@litfamily/litgrok',
    '/npm/dm/@litfamily/litgrok',
    '/badge/license-MIT-blue',
    '/github/stars/wjgoarxiv/litgrok',
  ], `${name}: npm version, npm downloads, license and GitHub stars`);
  for (const url of badges) {
    const at = text.indexOf(url);
    assert.ok(at > text.indexOf('<h1 align="center">LitGrok') && at < text.indexOf('\n## '), `${name}: badges sit under the title`);
  }
}

test('GitHub READMEs lead with the motion cover from repository-relative assets and keep the exact copyable rows', () => {
  for (const [name, reference, install] of GITHUB_PAGES) {
    const text = read(name);
    assertMotionCover(name, text, './docs/assets/cover-motion.webp', './docs/assets/cover-motion-still.webp', { liveBadges: true });
    assert.match(text, /<p align="center"><img src="\.\/docs\/assets\/readme\/ascii-readme\.svg" width="480" alt="[^"]+" \/><\/p>/u);
    const blocks = [...text.matchAll(/<details>\n<summary>[^\n]+<\/summary>\n\n```text\n([\s\S]*?)\n```\n\n<\/details>/gu)];
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0][1], displayRows.join('\n'));
    assert.ok(text.includes(`href="./${reference}"`));
    assert.ok(text.includes(`href="${install}"`));
    assert.ok(text.includes('href="./LICENSE"'));
    assert.doesNotMatch(text, /cdn\.jsdelivr\.net/u, `${name}: GitHub renders repository files directly, before any release exists`);
    for (const icon of ['book-open', 'play', 'shield-check']) {
      assert.ok(text.includes(`src="./docs/assets/readme/lucide-${icon}.svg"`));
    }
  }
});

test('the GitHub and npm pages count the LitFamily as its seven members', () => {
  for (const name of ['README.md', 'README_ko-KR.md', 'docs/npm/README.md', 'docs/npm/README_ko-KR.md', 'docs/assets/readme/README.md']) {
    const text = read(name);
    assert.doesNotMatch(text, /\bfive (?:armored )?robot|\bfive LitFamily|로봇 다섯|다섯 로봇|다섯 제품/u, `${name}: no five-member family count is left`);
  }
  for (const name of ['README.md', 'README_ko-KR.md']) {
    const text = read(name);
    const section = text.slice(text.indexOf('\n## LITFAMILY\n'));
    assert.match(section, name === 'README.md' ? /seven armored robots on the cover stand for the seven LitFamily products/u : /장갑 로봇 일곱은 LitFamily의 일곱 제품/u, `${name}: the family section names seven`);
  }
});

const DOC_PAGES = ['docs/guide.md', 'docs/guide_ko-KR.md', 'docs/skills.md', 'docs/skills_ko-KR.md'];

test('GitHub README relative links and in-page anchors resolve inside the repository', () => {
  for (const name of [...GITHUB_PAGES.map(([page]) => page), ...DOC_PAGES]) {
    const text = read(name);
    const base = dirname(name);
    const anchors = new Set([...text.matchAll(/^#{1,6} (.+)$/gmu)].map((match) => slug(match[1])));
    const targets = [
      ...[...text.matchAll(/(?:src|srcset|href)="([^"]+)"/gu)].map((match) => match[1]),
      ...[...text.matchAll(/\]\(([^)\s]+)\)/gu)].map((match) => match[1]),
    ];
    assert.ok(targets.some((target) => target.startsWith('./')), `${name}: expected repository-relative targets`);
    for (const target of targets) {
      if (/^https?:\/\//u.test(target)) continue;
      if (target.startsWith('#')) {
        assert.ok(anchors.has(decodeURIComponent(target.slice(1))), `${name}: no heading for ${target}`);
        continue;
      }
      assert.ok(target.startsWith('./') || (base !== '.' && target.startsWith('../')), `${name}: relative target must start with ./ (or ../ from docs/): ${target}`);
      const [relative, fragment] = decodeURIComponent(target).split('#');
      const path = join(base, relative);
      assert.ok(existsSync(join(ROOT, path)), `${name}: ${path} must exist in the repository`);
      if (fragment && path.endsWith('.md')) {
        const headings = new Set([...read(path).matchAll(/^#{1,6} (.+)$/gmu)].map((match) => slug(match[1])));
        assert.ok(headings.has(fragment), `${name}: ${path} has no heading for #${fragment}`);
      }
    }
  }
});

test('npm READMEs lead with the pinned motion cover and send readers to the full GitHub guide', () => {
  const packageVersion = JSON.parse(read('package.json')).version;
  const packageUrl = `https://cdn.jsdelivr.net/npm/@litfamily/litgrok@${packageVersion}/`;
  for (const [name, reference, install, guide] of NPM_PAGES) {
    const text = read(name);
    assertMotionCover(name, text, COVER_FALLBACK, MOTION_STILL);
    assert.ok(!text.includes(STATIC_COVER), `${name}: the motion robot cover replaces the static robot cover`);
    assert.ok(text.includes(`href="${packageUrl}${reference}"`));
    assert.ok(text.includes(`href="${install}"`));
    assert.ok(text.includes(`href="${packageUrl}LICENSE"`));
    assert.ok(text.includes(`](${guide})`), `${name}: links the full guide on GitHub`);
    assert.doesNotMatch(text, /(?:src|srcset|href)="\.{0,2}\/|\]\(\.{0,2}\//u, `${name}: npm-rendered README must not contain relative file URLs`);
    assert.doesNotMatch(text, /<details>\n<summary>[^\n]+<\/summary>\n\n```text\n/u, `${name}: the copyable ASCII block lives only on the GitHub pages the generator maintains`);
    for (const icon of ['book-open', 'play', 'shield-check']) {
      assert.ok(text.includes(`src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.29/docs/assets/readme/lucide-${icon}.svg"`));
    }
  }
});

test('npm README media and local file links use current-version URLs shipped in the package', () => {
  const packageJson = JSON.parse(read('package.json'));
  const packageUrl = `https://cdn.jsdelivr.net/npm/@litfamily/litgrok@${packageJson.version}/`;
  for (const [name] of NPM_PAGES) {
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
  assert.equal(sha('docs/assets/cover.webp'), '7a1eaf59b2292f1b879ab82d53bd645e5c2cafc83189ced49a84f946d83d58c0');
  const motionCover = readFileSync(join(ROOT, 'docs/assets/cover-motion.webp'));
  assert.ok(motionCover.length <= 2_621_440, 'motion cover must stay under 2.5 MiB');
  assert.equal(createHash('sha256').update(motionCover).digest('hex'), 'c1829ddcfddc1a725d3db5e72833feecde1ba1e0efeaa515da94bfbaa1c194fa');
  assert.equal(sha('docs/assets/cover-motion-still.webp'), '562001cc45a52062d57c8db0a2f5491e33eba6efe753da1cb3f56df874aa63d5');
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
  assert.ok(!packageJson.files.some((path) => !path.startsWith('!') && (path === 'docs' || path === 'docs/assets' || /[*?]/u.test(path))), 'broad docs globs stay out of the package allowlist');
});

test('the skills pages give every packaged skill one shipped 240 px snapshot in both languages', () => {
  const packageJson = JSON.parse(read('package.json'));
  const base = './assets/skills/';
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
  for (const [name, page, heading, intro, motion] of [
    ['README.md', 'docs/skills.md', '# LitGrok skills at a glance', `All ${skills.length} skills, one row each.`, 'The cover is brand motion made with the LitFamily motion skill'],
    ['README_ko-KR.md', 'docs/skills_ko-KR.md', '# LitGrok 스킬 한눈에 보기', `스킬 ${skills.length}개를 한 줄씩 정리했습니다.`, '커버의 모션은 LitFamily 모션 스킬로 만든 브랜드 연출'],
  ]) {
    const text = read(name);
    const navLink = text.indexOf(`href="./${page}"`);
    assert.ok(navLink > 0 && navLink < text.indexOf('\n## '), `${name}: the top nav links the skills page`);
    assert.ok(text.includes(motion), `${name}: the cover note names the motion skill`);
    assert.equal([...text.matchAll(/assets\/skills\//gu)].length, 0, `${name}: the gallery lives on its own page`);
    const section = read(page);
    assert.equal(section.split('\n')[0], heading, `${page}: titled as the skills page`);
    assert.ok(section.includes(intro), `${page}: the intro states the packaged skill count`);
    const rows = [...section.matchAll(/<tr>\n<td><img src="([^"]+)" width="240" alt="[^"]+" \/><\/td>\n<td><code>([^<]+)<\/code><br \/><sub>/gu)];
    assert.deepEqual(rows.map((match) => match[2]).sort(), skills, `${page}: one row per packaged skill`);
    for (const [, src, id] of rows) assert.equal(src, `${base}${id}.webp`, `${page}: ${id} snapshot URL`);
    assert.equal([...section.matchAll(/assets\/skills\//gu)].length, skills.length, `${page}: snapshots appear only in the skills table`);
  }
  for (const [name, gallery, motion] of [
    ['docs/npm/README.md', 'https://github.com/wjgoarxiv/litgrok/blob/main/docs/skills.md', 'The cover is brand motion made with the LitFamily motion skill'],
    ['docs/npm/README_ko-KR.md', 'https://github.com/wjgoarxiv/litgrok/blob/main/docs/skills_ko-KR.md', '커버의 모션은 LitFamily 모션 스킬로 만든 브랜드 연출'],
  ]) {
    const text = read(name);
    assert.ok(text.includes(`](${gallery})`), `${name}: the npm card links the gallery on GitHub`);
    assert.equal([...text.matchAll(/docs\/assets\/skills\//gu)].length, 0, `${name}: the gallery stays on GitHub`);
    assert.ok(text.includes(motion), `${name}: the cover note names the motion skill`);
  }
});

const PROMO = 'docs/assets/promo';
const screensHeading = (name) => (name === 'docs/guide.md' ? '## What you will see on screen' : '## 화면에 나오는 모습');
// The film is set in Pretendard; these are the approved bytes of the English and Korean versions.
const PROMO_FILES = {
  'promo.mp4': '1e44809c1d15ae395b20ec96b38158383a0f7d0363be35b4a52950bb8233b428',
  'promo-preview.webp': '44f140b19808085765ccfb5be24ace4216198027b3a9f99f0da97ca8771c7a6e',
  'promo-still.webp': 'c58bb9247d870d85e2468991e75f496060a058c7a02ebbc1bc95fb128814f77a',
  'promo-poster.webp': 'c58bb9247d870d85e2468991e75f496060a058c7a02ebbc1bc95fb128814f77a',
  'promo-ko.mp4': '3b878f85e554dfd7a25ffbef49898a2e92c011a90da31e2663565b9e6373a2f5',
  'promo-ko-preview.webp': '09aac8f2c66afda06c8c2b6aaa2c586663563dcee0188a749309ee91dc1d6c74',
  'promo-ko-still.webp': '58e98432f368884bf0cb89ad4b6c24a547b41180c38e827176711d2a46ecc377',
  'promo-ko-poster.webp': '58e98432f368884bf0cb89ad4b6c24a547b41180c38e827176711d2a46ecc377',
};
const PRETENDARD_OFL = 'b04538c9abec39a3db75108cf0af0fd9c77032fe8aa2cf38345b4d250e98e38e';

test('the motion promo assets stay inside their size caps and out of the npm package', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.deepEqual(readdirSync(join(ROOT, PROMO)).filter((name) => name !== 'source').sort(), Object.keys(PROMO_FILES).sort(), 'the English and Korean film files and nothing else');
  for (const [name, hash] of Object.entries(PROMO_FILES)) assert.equal(sha(`${PROMO}/${name}`), hash, name);
  for (const prefix of ['promo', 'promo-ko']) {
    const preview = readFileSync(join(ROOT, PROMO, `${prefix}-preview.webp`));
    assert.ok(preview.length <= 2_621_440, `${prefix} preview must stay under 2.5 MiB`);
    for (const name of [`${prefix}-preview.webp`, `${prefix}-still.webp`, `${prefix}-poster.webp`]) {
      const bytes = readFileSync(join(ROOT, PROMO, name));
      assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF', name);
      assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WEBP', name);
    }
    for (const name of [`${prefix}-still.webp`, `${prefix}-poster.webp`]) {
      assert.ok(readFileSync(join(ROOT, PROMO, name)).length <= 512 * 1024, `${name} must stay under 512 KiB`);
    }
    const film = readFileSync(join(ROOT, PROMO, `${prefix}.mp4`));
    assert.ok(film.length <= 8 * 1024 * 1024, `${prefix}.mp4 must stay under 8 MiB`);
    assert.equal(film.subarray(4, 8).toString('ascii'), 'ftyp', `${prefix}.mp4 is an MP4 container`);
  }
  const source = readdirSync(join(ROOT, PROMO, 'source'), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  assert.deepEqual(source.map((entry) => entry.name).sort(), ['Pretendard-OFL.txt', 'index.html', 'mark.js', 'treatment-ko.json', 'treatment.json']);
  const sourceBytes = source.reduce((total, entry) => total + readFileSync(join(entry.parentPath ?? entry.path, entry.name)).length, 0);
  assert.ok(sourceBytes <= 64 * 1024, 'the editable film source stays small');
  assert.equal(sha(`${PROMO}/source/Pretendard-OFL.txt`), PRETENDARD_OFL, 'the Pretendard licence notice is the official text');
  assert.ok(!packageJson.files.some((entry) => !entry.startsWith('!') && (entry === PROMO || entry.startsWith(`${PROMO}/`))), 'the promo lives on GitHub and stays out of the package');
});

// Full-canvas frames in an animated WebP: a decoder rebuilds the picture from them, so a preview without
// regular ones keeps traces of earlier frames on screen (ghosting) once the sub-frame updates pile up.
function webpKeyframes(bytes) {
  const canvasW = 1 + bytes.readUIntLE(24, 3);
  const canvasH = 1 + bytes.readUIntLE(27, 3);
  let frames = 0;
  let keyframes = 0;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(at + 4);
    if (bytes.subarray(at, at + 4).toString('ascii') === 'ANMF') {
      frames += 1;
      if (1 + bytes.readUIntLE(at + 14, 3) === canvasW && 1 + bytes.readUIntLE(at + 17, 3) === canvasH) keyframes += 1;
    }
    at += 8 + size + (size % 2);
  }
  return { frames, keyframes };
}

test('the animated previews carry regular full-canvas keyframes so a browser decodes them without ghosting', () => {
  for (const prefix of ['promo', 'promo-ko']) {
    const { frames, keyframes } = webpKeyframes(readFileSync(join(ROOT, PROMO, `${prefix}-preview.webp`)));
    assert.ok(frames > 500, `${prefix} preview keeps its frames`);
    assert.ok(keyframes >= 20, `${prefix} preview has ${keyframes} full-canvas frames for ${frames} frames`);
  }
});

test('the film source sets its copy in Pretendard and keeps the Korean film on the same page', () => {
  const page = read(`${PROMO}/source/index.html`);
  assert.match(page, /font:700 [\d.]+px\/[\d.]+ "Pretendard"/u);
  assert.doesNotMatch(page, /Archivo/u, 'no Latin display face other than Pretendard');
  assert.doesNotMatch(page, /font-weight:\s*(?!400|700)\d+|font:\s*(?!400|700)\d{3} /u, 'only the 400 and 700 weights are requested');
  for (const name of ['treatment.json', 'treatment-ko.json']) {
    const treatment = JSON.parse(read(`${PROMO}/source/${name}`));
    assert.deepEqual(treatment.typePlan.faces, ['Pretendard', 'MesloLGS NF'], `${name}: faces`);
    assert.equal(treatment.durationSec, 22);
  }
  assert.match(page, /const LANG = "en";/u);
});

test('the guide pages place the promo after the screen captures with a reduced-motion still first and the MP4 linked, and the npm cards leave it out', () => {
  for (const [name, readme, heading, after, prefix] of [
    ['docs/guide.md', 'README.md', '## Watch it in motion', '## Install options', 'promo'],
    ['docs/guide_ko-KR.md', 'README_ko-KR.md', '## 움직임으로 보기', '## 설치 옵션', 'promo-ko'],
  ]) {
    const text = read(name);
    const start = text.indexOf(`\n${heading}\n`);
    assert.ok(text.indexOf(screensHeading(name)) > 0 && text.indexOf(screensHeading(name)) < start, `${name}: the promo follows the screen captures`);
    assert.ok(start > 0 && start < text.indexOf(`\n${after}\n`), `${name}: the promo precedes ${after}`);
    const section = text.slice(start, text.indexOf(`\n${after}\n`));
    assert.ok(section.indexOf('prefers-reduced-motion: reduce') < section.indexOf('prefers-reduced-motion: no-preference'), `${name}: reduced-motion still comes first`);
    assert.ok(section.includes(`<source media="(prefers-reduced-motion: reduce)" srcset="./assets/promo/${prefix}-still.webp" />`), `${name}: still source`);
    assert.ok(section.includes(`<source media="(prefers-reduced-motion: no-preference)" srcset="./assets/promo/${prefix}-preview.webp" />`), `${name}: preview source`);
    assert.match(section, new RegExp(`<img src="\\./assets/promo/${prefix}-preview\\.webp" width="880" alt="[^"]{60,}" />`, 'u'), `${name}: img fallback with a descriptive alt`);
    assert.ok(section.includes(`<a href="./assets/promo/${prefix}.mp4">`) && section.includes(`](./assets/promo/${prefix}.mp4)`), `${name}: the MP4 is linked twice`);
    const screens = text.slice(text.indexOf(screensHeading(name)), start);
    assert.equal([...text.matchAll(/<picture>/gu)].length - [...screens.matchAll(/<picture>/gu)].length, 1, `${name}: the promo is the only picture outside the screen captures`);
    const landing = read(readme);
    assert.doesNotMatch(landing, /assets\/promo\//u, `${readme}: the film lives in the guide`);
    assert.ok(landing.includes(`href="./${name}#${slug(heading.slice(3))}"`), `${readme}: the top nav links the film`);
    const handoffPictures = [...landing.matchAll(/<picture><source media="\(prefers-color-scheme: dark\)" srcset="\.\/docs\/assets\/auto-handoff\//gu)].length;
    assert.equal([...landing.matchAll(/<picture>/gu)].length - handoffPictures, 2, `${readme}: besides the automatic-handoff captures, the pictures are the cover and the mascot under it; the demo slot plays the session film`);
    const mascot = landing.indexOf('<picture><source media="(prefers-reduced-motion: reduce)" srcset="./docs/assets/readme/mascot-still.webp" />');
    assert.ok(mascot > landing.indexOf('cover-motion.webp') && mascot < landing.indexOf('<h1 '), `${readme}: the mascot loop sits directly under the cover, still first`);
    const card = landing.lastIndexOf('<table>', mascot);
    assert.ok(card > landing.indexOf('cover-motion.webp') && landing.indexOf('</table>', card) > mascot, `${readme}: the mascot sits in a table card under the cover`);
    assert.match(landing.slice(card, mascot), /<th colspan="2">LitGrok Bot · (the )?Grok Bot (cover|커버)<\/th>/u, `${readme}: the card names the mascot as the Grok Bot cover`);
    assert.match(landing.slice(mascot, landing.indexOf('</picture>', mascot)), /<img src="\.\/docs\/assets\/readme\/mascot\.webp" width="(\d{3})" alt="[^"]{60,}" \/>/u, `${readme}: mascot img with a fixed width and a descriptive alt`);
    assert.equal([...landing.matchAll(/width="100%"/gu)].length, 1, `${readme}: the cover stays the only full-width image`);
  }
  for (const [name] of NPM_PAGES) assert.doesNotMatch(read(name), /docs\/assets\/promo|promo(?:-ko)?\.mp4/u, `${name}: the npm card does not embed the promo`);
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
