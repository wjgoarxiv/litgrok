import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillRoot = join(root, '.grok/skills/lit-typographic-motion');
const read = (path) => readFileSync(join(root, path), 'utf8');
const SPEC_NOTICE = `Portions of this engine are adapted from mexicat/pdoom-video
(https://github.com/mexicat/pdoom-video), commit
ca251e3dddda422b364385eb484b5a3593a0990d.

Copyright (c) 2026 Giacomo Magnanini

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
const CREDIT = 'Typographic-motion engine adapted from mexicat/pdoom-video (MIT, Giacomo Magnanini), commit `ca251e3`.';

function packFiles() {
  const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout)[0].files.map((entry) => entry.path);
}

test('motion skill is enrolled on every catalog, listing and pack surface', () => {
  const manifest = JSON.parse(read('.grok-plugin/plugin.json'));
  assert.ok(manifest.skills.includes('./.grok/skills/lit-typographic-motion'));
  const parity = JSON.parse(read('tools/payload-substance-parity.json'));
  assert.ok(parity.products.p33.skills.includes('lit-typographic-motion'));
  const count = readdirSync(join(root, '.grok/skills'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length;
  assert.equal(parity.products.p33.inventory.count, count);
  assert.match(read('.grok/skills/litgrok/SKILL.md'), new RegExp(`${count} Grok-native skill folders`));
  assert.match(read('.grok/skills/litgrok/SKILL.md'), /lit-typographic-motion[^\n]*motion-runtime install/);
  assert.match(read('AGENTS.md'), new RegExp(`${count} skills`));
  assert.match(read('README.md'), new RegExp(`It ships ${count} skills`));
  const files = packFiles();
  for (const path of ['SKILL.md', 'NOTICE', 'THIRD_PARTY_NOTICES', 'package.json', 'package-lock.json', 'requirements-audio.txt', 'fonts/pins.json', 'fonts/stroke/OFL-1.1.txt', 'fonts/stroke/CREDITS', 'scripts/motion.mjs', 'scripts/prewarm.mjs', 'scripts/beat_grid.py', 'scripts/page/engine.js', 'scripts/lib/gate.mjs',
    'references/treatment.md', 'references/stage.md', 'scripts/stage/stage-kit.js', 'scripts/stage/host.js', 'scripts/stage/qa.js', 'scripts/lib/treatment.mjs', 'scripts/lib/stage.mjs', 'scripts/lib/stage-session.mjs', 'scripts/lib/stage-qa.mjs', 'scripts/lib/stage-gate.mjs', 'scripts/lib/sound.mjs', 'scripts/lib/soundtrack.mjs', 'scripts/lib/look.mjs', 'scripts/lib/stills.mjs', 'scripts/lib/frame-pool.mjs', 'scripts/lib/encode.mjs']) {
    assert.ok(files.includes(`.grok/skills/lit-typographic-motion/${path}`), `${path} is not packed`);
  }
  assert.ok(!files.some((file) => file.startsWith('test/')), 'test data must stay out of the pack');
  const skillFiles = files.filter((file) => file.startsWith('.grok/skills/lit-typographic-motion/'));
  assert.ok(!skillFiles.some((file) => /fixtures|treatment-(stage|type)\.json/.test(file)), 'no stage or treatment fixture ships');
  assert.ok(!skillFiles.some((file) => /\.(html|wav|mp4)$/.test(file)), 'the kit ships no scene page, sound or film');
});

test('SKILL.md stays lean, loads the treatment first, routes every reference, and names the director order', () => {
  const skill = read('.grok/skills/lit-typographic-motion/SKILL.md');
  assert.ok(Buffer.byteLength(skill) <= 4096, `SKILL.md is ${Buffer.byteLength(skill)} bytes`);
  assert.doesNotMatch(skill, /## #contract\.output_channels/);
  assert.match(skill, /^# lit-typographic-motion: film director$/m);
  const order = skill.slice(skill.indexOf('## Order'), skill.indexOf('## References'));
  const first = order.split('\n').find((line) => line.startsWith('1. '));
  assert.match(first, /references\/treatment\.md first, and only it/);
  assert.equal((first.match(/references\//g) ?? []).length, 1, 'the first step loads treatment.md only');
  assert.match(order, /treatment\.json/);
  assert.match(order, /stage → references\/stage\.md; type → /, 'path references load after path is set');
  assert.doesNotMatch(order.split('\n').find((line) => line.startsWith('2. ')).split('type →')[0], /scene-contract|type-craft|style-bible/, 'the stage path never requires a type-path reference');
  for (const command of ['stage --out <dir> --stills-only', 'make --out <dir> --stills-only', 'look --out <dir> --round 1 --answers <file>', 'sound --out <dir>', 'node scripts/motion.mjs verify --out <dir>']) assert.ok(skill.includes(command), command);
  assert.match(skill, /at least 600 s/);
  assert.match(skill, /litgrok-ai motion-runtime install/);
  assert.match(skill, /ask no (?:style )?questions/i);
  assert.match(skill, /hand-encoded films[^\n]*are not the deliverable/i);
  assert.match(skill, /Exit codes:[^\n]*16 treatment invalid[^\n]*20 sound invalid/);
  const contract = read('.grok/skills/lit-typographic-motion/references/complete-contract.md');
  assert.match(contract, /## #contract\.output_channels\s*\n+```yaml\s*\nartifact_genre: client_deliverable/);
  for (const reference of readdirSync(join(skillRoot, 'references'))) {
    assert.match(skill, new RegExp(`(?:Read|Load|Open)[^\\n]*references/${reference.replace('.', '\\.')}[^\\n]*(?:when|for|before)`, 'i'), `${reference} has no load route`);
  }
});

test('references are dense and cover the required operating sections', () => {
  const required = {
    'style-bible.md': ['swiss-signal', 'terminalcore', 'tidal', 'MO-B-00', 'Anti-slop', 'Originality'],
    'scene-contract.md': ['render(f, out)', 'stateful', 'title-slam', 'karaoke-line', 'kinetic-list', 'number-counter', 'stroke-signature', 'end-card', 'brief'],
    'type-craft.md': ['어절', 'glyphX', 'tracking', 'Hangul', 'Galmuri', 'MO-FT-04'],
    'craft-loop.md': ['Phase 0', 'Phase 5', 'stills', 'contact sheet', 'MO-C-03', 'withheld', 'round'],
    'runtime.md': ['motion-runtime install', 'exit 14', 'exit 15', 'BLOCKED_NO_CHROME', '--audio', '--word-timing', 'CDP pull'],
    'complete-contract.md': ['#contract.output_channels', 'verify', 'DONE_UNVIEWED', 'no internal names'],
    'treatment.md': ['announcement:', 'brand-mood:', 'event:', 'explainer:', 'motion-graphics:', 'type-led:', 'Show the subject; do not only name it.', 'Length comes from the arc', 'inventions', '```json'],
    'stage.md': ['LitStage.define', '/lit/stage-kit.js', '/lit/fonts.css', 'COPY', 'LitStage.text', 'exit 17', 'exit 18', 'exit 19', 'morph', '600 s'],
  };
  for (const [name, needles] of Object.entries(required)) {
    const body = read(`.grok/skills/lit-typographic-motion/references/${name}`);
    const words = body.split(/\s+/u).filter(Boolean).length;
    assert.ok(words >= 450, `${name} has only ${words} words`);
    for (const needle of needles) assert.ok(body.includes(needle), `${name} lacks ${needle}`);
  }
});

test('the engine credit is shipped verbatim and stated on the help surface', () => {
  assert.equal(readFileSync(join(skillRoot, 'NOTICE'), 'utf8'), SPEC_NOTICE);
  const help = spawnSync(process.execPath, [join(root, 'bin/litgrok.mjs'), '--help', '--no-color'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.ok(help.stdout.includes(CREDIT.replaceAll('`', '')) || help.stdout.includes(CREDIT), help.stdout);
  const motionHelp = spawnSync(process.execPath, [join(skillRoot, 'scripts/motion.mjs'), '--help'], { encoding: 'utf8' });
  assert.equal(motionHelp.status, 0);
  assert.ok(motionHelp.stdout.includes(CREDIT));
  assert.ok(read('.grok/skills/litgrok/SKILL.md').includes(CREDIT), 'the skill listing states the credit');
  const files = packFiles();
  const packed = files.filter((file) => file.startsWith('.grok/skills/lit-typographic-motion/')).map((file) => read(file)).join('\n');
  assert.ok(packed.includes('ca251e3dddda422b364385eb484b5a3593a0990d'));
});

test('third-party notices name a licence file for every font the presets can draw', () => {
  const pins = JSON.parse(readFileSync(join(skillRoot, 'fonts/pins.json'), 'utf8'));
  const notices = readFileSync(join(skillRoot, 'THIRD_PARTY_NOTICES'), 'utf8');
  for (const pin of Object.values(pins.fonts)) {
    assert.ok(notices.includes(pin.family), `${pin.family} missing from THIRD_PARTY_NOTICES`);
    for (const licence of pin.licence) {
      assert.ok(notices.includes(licence.file), `${licence.file} missing from THIRD_PARTY_NOTICES`);
      if (pin.source !== 'fetched') assert.ok(existsSync(join(skillRoot, licence.file)), `${licence.file} not in the package`);
    }
  }
  const ofl = readFileSync(join(skillRoot, 'fonts/stroke/OFL-1.1.txt'), 'utf8');
  assert.match(ofl, /^This Font Software is licensed under the SIL Open Font License, Version 1\.1\./);
  assert.doesNotMatch(ofl, /Archivo/);
  const credits = readFileSync(join(skillRoot, 'fonts/stroke/CREDITS'), 'utf8');
  for (const name of ['EMS Allure', 'EMS Felix', 'EMS Osmotron', 'EMS Readability', 'EMS Tech']) assert.ok(credits.includes(name));
  assert.doesNotMatch(JSON.stringify(pins), /Hershey/);
});

test('bundled fonts stay within MO-A-46 and never include excluded or subset files', () => {
  const pins = JSON.parse(readFileSync(join(skillRoot, 'fonts/pins.json'), 'utf8'));
  let bundled = 0;
  for (const pin of Object.values(pins.fonts)) {
    if (pin.source !== 'bundled') continue;
    const size = statSync(join(skillRoot, pin.file)).size;
    assert.ok(size <= 1_000_000, `${pin.file} exceeds the 1 MB ship threshold`);
    bundled += size;
  }
  assert.ok(bundled <= 4_000_000, `bundled fonts total ${bundled}`);
  for (const pin of Object.values(pins.fonts)) {
    assert.doesNotMatch(pin.file, /Bitmap|DotGothic|Hershey/i);
    if (pin.source === 'fetched') assert.match(pin.url, /^https:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net|www\.apache\.org)\//);
  }
  assert.equal(pins.fonts.galmuri9.source, 'fetched');
  assert.equal(pins.fonts.meslo.source, 'fetched');
});

// Routing (LitGrok has no code router: the rule is advisory text the model applies itself). The
// model below uses only words the rule states, and every word must appear in the rule's motion
// section. The packed smoke is the routing proof; this corpus is phrased for this product.
const MODEL = {
  verbs: ['만들', '제작', '뽑아', '렌더', 'make', 'create', 'render', 'produce', 'build', 'turn'],
  compounds: ['모션그래픽', '타이포 모션', '키네틱 타이포', '타이포그래피 영상', '가사 영상', '리릭 비디오', '뮤직비디오', '오프닝 타이틀', '타이틀 시퀀스', 'motion graphics', 'kinetic typography', 'kinetic type', 'typographic motion', 'lyric video', 'music video', 'title sequence', 'opening titles'],
  videoNouns: ['영상', '비디오', '클립', 'video', 'clip'],
  footage: ['footage'],
  edits: ['편집', '자막', '색보정', '트리밍', '잘라', 'edit', 'caption', 'trim', 'crop', 'color-grade'],
  containers: ['페이지', '웹사이트', '랜딩', '화면', '컴포넌트', '버튼', 'page', 'website', 'landing', 'screen', 'component', 'button'],
  embeds: ['넣', '삽입', 'embed', 'insert'],
  backgrounds: ['배경 영상', 'background video'],
  officeNouns: ['발표자료', '슬라이드', 'PPT', '덱', '보고서', '문서', 'slides', 'deck', 'pptx', 'report', 'document'],
  artifacts: ['스크립트', '대본', '썸네일', '요약', '기획안', 'script', 'transcript', 'thumbnail', 'summary', 'storyboard'],
  uiMotion: ['버튼', '호버', 'button', 'hover', 'tokens', 'reduced motion'],
};

function has(sentence, words) {
  const lower = sentence.toLowerCase();
  return words.some((word) => {
    const w = word.toLowerCase();
    return /^[a-z-]+$/.test(w) ? new RegExp(`(?<![a-z])${w}`).test(lower) : lower.includes(w);
  });
}

function route(sentence) {
  const video = has(sentence, MODEL.videoNouns) || has(sentence, MODEL.compounds);
  if (has(sentence, MODEL.edits) && (video || has(sentence, MODEL.footage))) return 'excluded:existing-footage';
  if (has(sentence, MODEL.containers) && (has(sentence, MODEL.embeds) || has(sentence, MODEL.backgrounds))) return 'excluded:interface';
  if (has(sentence, MODEL.officeNouns) && has(sentence, MODEL.embeds)) return 'excluded:office-embed';
  if (has(sentence, MODEL.artifacts)) return 'excluded:artifact-about-video';
  if (/(모션|motion)/i.test(sentence) && has(sentence, MODEL.uiMotion) && !video) return 'excluded:interface-motion';
  if (has(sentence, MODEL.verbs) && video) return 'lit-typographic-motion';
  return 'not-motion';
}

const POSITIVE = [
  '이 시 구절로 키네틱 타이포 영상 하나 만들어줘 lit',
  '동네 빵집 슬로건을 모션그래픽으로 제작해줘 lit',
  '우리 밴드 노래로 가사 영상 뽑아줘 lit',
  '팟캐스트 오프닝 타이틀을 렌더해줘 lit',
  '발표 오프닝에 틀어줄 영상 만들어줘 lit',
  '타이포그래피가 살아 움직이는 영상을 만들어줘 lit',
  'render a typographic motion piece for the harbor festival lit',
  'make a short video that spells out our motto lit',
  'produce a lyric video for this chorus lit',
  'create opening titles for the conference lit',
  'turn this quote into a kinetic typography clip lit',
  'build a presentation video for the town hall lit',
];
const NEGATIVE = [
  ['다음 주 발표자료 만들어줘 lit', 'not-motion'],
  ['prepare a slide deck on churn lit', 'not-motion'],
  ['설정 화면 타이포그래피를 정리해줘 lit', 'not-motion'],
  ['랜딩 페이지 히어로에 배경 영상 넣어줘 lit', 'excluded:interface'],
  ['embed a background video in the pricing page lit', 'excluded:interface'],
  ['이 클립에 자막 입혀줘 lit', 'excluded:existing-footage'],
  ['trim the first ten seconds of this clip lit', 'excluded:existing-footage'],
  ['영상 썸네일 하나 만들어줘 lit', 'excluded:artifact-about-video'],
  ['write a transcript for our demo video lit', 'excluded:artifact-about-video'],
  ['보고서에 영상 삽입해줘 lit', 'excluded:office-embed'],
  ['insert the promo video into the slides lit', 'excluded:office-embed'],
  ['버튼 호버 모션 만들어줘 lit', 'excluded:interface-motion'],
  ['draft a motion to adjourn for the board lit', 'not-motion'],
  ['인트로 문구만 다듬어줘 lit', 'not-motion'],
  ['render the quarterly report lit', 'not-motion'],
  ['render captions onto this video lit', 'excluded:existing-footage'],
  ['design motion tokens for the checkout screen lit', 'excluded:interface-motion'],
];

function motionSection() {
  const rule = read('.grok/rules/00-litgrok.md');
  const start = rule.indexOf('## New film selection');
  assert.ok(start >= 0, 'the rule has no motion section');
  const end = rule.indexOf('\n## ', start + 5);
  return { rule, start, section: rule.slice(start, end < 0 ? undefined : end) };
}

test('rule text states every word the routing model uses, ahead of Office and Interface sections', () => {
  const { rule, start, section } = motionSection();
  assert.ok(start < rule.indexOf('## Office output selection'), 'motion section must precede Office output selection');
  assert.ok(start < rule.indexOf('## Interface modes'), 'motion section must precede Interface modes');
  for (const [list, words] of Object.entries(MODEL)) for (const word of words) assert.ok(section.includes(word), `${list} word "${word}" is not in the rule`);
  assert.match(section, /video noun wins over a bare `?발표`?/i);
  assert.match(section, /(?:모션|motion)[^\n]*(?:인트로|intro)[^\n]*(?:alone|by themselves)/i);
  assert.match(section, /exclusions? (?:are checked|apply) before/i);
  assert.match(section, /\.grok\/skills\/lit-typographic-motion\//);
  assert.match(section, /`node scripts\/motion\.mjs` with `make`, `stage`, `sound`, `look`, `gate`, `verify`/);
  assert.match(section, /never claim a hook (?:deterministically )?routed/i);
  assert.match(rule, /Video, 영상, 모션, and 발표 alone never activate frontend-ui-ux/);
  assert.match(rule.slice(rule.indexOf('## Office output selection')), /발표자료, 발표, 슬라이드/, 'office words stay; the collision is fixed by ordering');
});

test('own routing corpus: positives, negatives, collisions and added verbs', () => {
  for (const sentence of POSITIVE) assert.equal(route(sentence), 'lit-typographic-motion', sentence);
  for (const [sentence, expected] of NEGATIVE) assert.equal(route(sentence), expected, sentence);
  assert.equal(route('render a report lit'), 'not-motion', 'an added verb without a video noun never triggers');
  assert.equal(route('render a summary of this clip lit'), 'excluded:artifact-about-video', 'an added verb never overrides an exclusion');
});

// Wave 3: the film context is neutral. It names the roots, the treatment-first step, the path rule
// and the commands, and never decides the path or restricts the film to the type engine.
function filmContext() {
  const { section } = motionSection();
  const start = section.indexOf('Film context:');
  assert.ok(start >= 0, 'the rule has a film context paragraph');
  const prose = section.slice(start, section.indexOf('\n', start));
  const commands = section.slice(section.indexOf('Film commands'));
  return { prose, commands };
}

test('the film context is neutral, at most 700 bytes of prose, and names both roots, the treatment and the commands', () => {
  const { prose, commands } = filmContext();
  assert.ok(Buffer.byteLength(prose) <= 700, `film context prose is ${Buffer.byteLength(prose)} bytes`);
  assert.match(prose, /this is a film request/i);
  assert.match(prose, /`\.grok\/skills\/lit-typographic-motion\/` \(project\)/);
  assert.match(prose, /`~\/\.grok\/skills\/lit-typographic-motion\/` \(user\)/);
  assert.match(prose, /write `treatment\.json`[^.]*first/);
  assert.match(prose, /type path when the words themselves are the film/);
  assert.match(prose, /stage path for every other film/);
  assert.match(prose, /9:16 film always takes the stage path/);
  assert.match(prose, /hand-encoded films are not the deliverable/);
  for (const banned of [/only the engine/i, /kinetic-typography film/i, /HTML film is not a deliverable/i, /Only a gate result counts/i, /type-led cue found/i]) assert.doesNotMatch(prose, banned);
  for (const genre of ['announcement', 'brand-mood', 'explainer', 'lyric', 'title sequence', 'music video']) assert.doesNotMatch(prose, new RegExp(genre, 'i'), `no genre nouns in the film context (${genre})`);
  assert.match(commands, /`node scripts\/motion\.mjs` with `make`, `stage`, `sound`, `look`, `gate`, `verify`/);
  assert.equal((commands.match(/scripts\/motion\.mjs/g) ?? []).length, 1, 'the installed script is named once');
  assert.match(commands, /litgrok-ai motion-runtime install/);
});

const NO_COPY = [
  ['비가 어떻게 만들어지는지 보여주는 영상 만들어줘 lit', 'explainer'],
  ['make a moody vertical clip for a small tea shop lit', 'brand-mood'],
  ['기하학 도형이 춤추는 모션그래픽 영상 만들어줘 lit', 'motion-graphics'],
  ['우리 동네 합창단 정기 공연을 알리는 영상 만들어줘 lit', 'event'],
  ['create a video that shows how a bicycle gear works lit', 'explainer'],
  ['바다 거북이의 하루를 담은 짧은 영상 제작해줘 lit', 'other'],
  ['render a calm clip about a night train crossing snowy hills lit', 'brand-mood'],
];
const TYPE_LED = [
  '"작은 불빛이 모여 길이 된다" 이 문장으로 키네틱 타이포 영상 만들어줘 lit',
  'make a lyric video for these lines: "we keep the lanterns lit" lit',
  '「바람이 지나간 자리」로 타이틀 시퀀스 만들어줘 lit',
  'render kinetic typography for the phrase \u201chold the quiet\u201d lit',
];

test('no-copy film requests across genres route to the film skill with the neutral context and raise no type cue', async () => {
  const { typeLedCue } = await import('../.grok/skills/lit-typographic-motion/scripts/lib/treatment.mjs');
  assert.ok(new Set(NO_COPY.map(([, genre]) => genre)).size >= 4, 'at least four genres');
  for (const [sentence] of NO_COPY) {
    assert.equal(route(sentence), 'lit-typographic-motion', sentence);
    assert.equal(typeLedCue(sentence), null, `${sentence} names no words to set`);
  }
  assert.ok(filmContext().prose.length > 0);
});

test('type-led requests route to the film skill and carry a type-led cue for the treatment', async () => {
  const { typeLedCue } = await import('../.grok/skills/lit-typographic-motion/scripts/lib/treatment.mjs');
  for (const sentence of TYPE_LED) {
    assert.equal(route(sentence), 'lit-typographic-motion', sentence);
    assert.ok(typeLedCue(sentence), `${sentence} has a type-led cue`);
  }
});

// Every Wave 1 premise and mandate string is gone from every shipped surface.
const WAVE1_PREMISE = [
  /kinetic-typography film/i,
  /kinetic typography film renderer/i,
  /The engine path is the deliverable/i,
  /not this skill's output/i,
  /not this route's deliverable/i,
  /hand-built ffmpeg or Python film/i,
  /Only a gate result counts/i,
  /only the engine/i,
  /HTML film is not a deliverable/i,
  /Choose the smallest set/i,
  /three strong shots/i,
  /invent nothing factual/i,
  /the words come from the request/i,
  /costs reading time/i,
];

test('no Wave 1 premise or mandate string survives on any shipped surface', () => {
  const files = packFiles().filter((file) => /\.(md|mjs|js|json|txt)$/.test(file) && !file.includes('/fonts/'));
  for (const file of files) {
    const body = read(file);
    for (const pattern of WAVE1_PREMISE) assert.doesNotMatch(body, pattern, `${file} still carries ${pattern}`);
  }
});
