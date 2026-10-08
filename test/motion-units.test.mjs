import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { fnv1a32, mulberry32, passSeed, subSampleTime } from '../.grok/skills/lit-typographic-motion/scripts/lib/seed.mjs';
import { autoPickPreset, countUnits, eojeol, plain, readingFloor, scriptRuns, smart } from '../.grok/skills/lit-typographic-motion/scripts/lib/text.mjs';
import { buildTimeline, normalizeBrief } from '../.grok/skills/lit-typographic-motion/scripts/lib/timeline.mjs';
import { admitEvents, planPasses } from '../.grok/skills/lit-typographic-motion/scripts/lib/presets.mjs';
import { checkInvert } from '../.grok/skills/lit-typographic-motion/scripts/lib/gate.mjs';
import { cmapCoverage, strokeCoverage } from '../.grok/skills/lit-typographic-motion/scripts/lib/fonts.mjs';
import { flagLadder, isSoftwareRenderer } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = join(root, '.grok/skills/lit-typographic-motion');

test('fnv1a32 and the pass seed match the pinned FNV-1a vectors', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('a'), 0xe40c292c);
  assert.equal(fnv1a32('foobar'), 0xbf9cf968);
  assert.equal(fnv1a32('가'), fnv1a32(Buffer.from('가', 'utf8').toString('utf8')));
  assert.equal(passSeed(20260926, 'title-slam', 0, 'dither'), fnv1a32('20260926:title-slam:0:dither'));
  assert.notEqual(passSeed(1, 'title-slam', 0, 'dither'), passSeed(1, 'title-slam', 0, 'glitch'));
});

test('mulberry32 is unsigned 32-bit and reproducible', () => {
  const a = mulberry32(1), b = mulberry32(1);
  const first = [a(), a(), a()];
  assert.deepEqual(first, [b(), b(), b()]);
  assert.equal(first[0], 0.6270739405881613, 'canonical mulberry32(1) first value');
  // Independent reference (the published one-line form) must agree for many seeds and draws.
  const reference = (a) => () => { let t = (a += 0x6d2b79f5); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (const seed of [0, 1, 42, 0xffffffff, 3693088578]) {
    const ours = mulberry32(seed), theirs = reference(seed | 0);
    for (let i = 0; i < 64; i += 1) assert.equal(ours(), theirs(), `seed ${seed} draw ${i}`);
  }
  for (const value of first) assert.ok(value >= 0 && value < 1);
});

test('sub-sample times are pinned inside the shutter and clamped at 0 (MO-A-28)', () => {
  assert.equal(subSampleTime(60, 0, 1, 60, 0.5), 1);
  const times = [0, 1, 2, 3].map((i) => subSampleTime(60, i, 4, 60, 0.5));
  const step = 0.5 / 60 / 4;
  for (let i = 0; i < 4; i += 1) assert.ok(Math.abs(times[i] - (1 + (0.5 / 60) * ((i + 0.5) / 4 - 0.5))) < 1e-12);
  assert.ok(Math.abs(times[1] - times[0] - step) < 1e-12);
  assert.equal(subSampleTime(0, 0, 4, 60, 0.5), 0);
});

test('one reading-floor function for English, Korean and mixed units (MO-C-07/08)', () => {
  assert.equal(readingFloor('움직이는 글자들이 화면을 채운다', 'line').toFixed(3), '2.800', '4 어절, 14 syllables -> 2.8 s');
  assert.equal(countUnits('움직이는 글자들이 화면을 채운다').hangul, 14);
  assert.equal(readingFloor('Go', 'line'), 0.9);
  assert.equal(readingFloor('봄', 'line'), 1.0);
  assert.equal(readingFloor('Type', 'word'), 0.5);
  assert.ok(Math.abs(readingFloor('one two three four five six seven', 'line') - 7 / 3.3) < 1e-9);
  assert.ok(Math.abs(readingFloor('LIT 스튜디오 2026년', 'line') - (0.2 * 5 + 2 / 3.3)) < 1e-9, 'mixed: 5 syllables + LIT and 2026');
  assert.equal(readingFloor('아주 긴 한 단어처럼 보이는 말', 'reveal'), 0.35);
});

test('어절 breaking never splits a word', () => {
  assert.deepEqual(eojeol('  오늘의  문장이\t시작된다 '), ['오늘의', '문장이', '시작된다']);
  assert.deepEqual(eojeol('LIT 스튜디오'), ['LIT', '스튜디오']);
});

test('script runs split at the script boundary and digits attach to the adjacent run (MO-FT-04)', () => {
  assert.deepEqual(scriptRuns('2026년').map((r) => [r.script, r.text]), [['hangul', '2026년']]);
  assert.deepEqual(scriptRuns('LIT팀').map((r) => [r.script, r.text]), [['latin', 'LIT'], ['hangul', '팀']]);
  assert.deepEqual(scriptRuns('LIT 스튜디오').map((r) => [r.script, r.text]), [['latin', 'LIT '], ['hangul', '스튜디오']]);
  assert.deepEqual(scriptRuns('2026').map((r) => r.script), ['latin']);
});

test('smart() and plain() round-trip typographic punctuation (MO-A-34)', () => {
  assert.equal(smart('"Hello" it\'s... \'cause'), '“Hello” it’s… ’cause');
  assert.equal(plain('“Hello” it’s…'), '"Hello" it\'s...');
});

test('MO-A-58 override ranges and invert-on-cut are enforced by the gate', () => {
  const manifest = { fps: 60, bpm: 100, timeline: [{ id: 'a', sceneId: 'a', shotIndex: 0, kind: 'line', start: 0, end: 2.4 }, { id: 'b', sceneId: 'b', shotIndex: 0, kind: 'line', start: 2.4, end: 4.8 }] };
  const frames = (post) => Array.from({ length: 288 }, (_, frame) => ({ frame, post: post(frame) }));
  assert.equal(checkInvert(manifest, frames(() => ({ flash: 0, fade: 1, zoom: 1, invert: false }))).status, 'PASS');
  assert.equal(checkInvert(manifest, frames((f) => ({ invert: f >= 144 }))).status, 'PASS', 'a change on the cut holds');
  assert.equal(checkInvert(manifest, frames((f) => ({ invert: f >= 100 }))).status, 'FAIL', 'a change off a cut');
  assert.equal(checkInvert(manifest, frames(() => ({ flash: 1.4 }))).status, 'FAIL', 'flash outside 0..1');
  assert.equal(checkInvert(manifest, frames(() => ({ fade: -0.1 }))).status, 'FAIL', 'fade outside 0..1');
  assert.equal(checkInvert(manifest, frames(() => ({ zoom: 0 }))).status, 'FAIL', 'zoom must be > 0');
  const shortHold = { ...manifest, timeline: [...manifest.timeline, { id: 'c', sceneId: 'c', shotIndex: 0, kind: 'line', start: 3.0, end: 4.8 }] };
  assert.equal(checkInvert(shortHold, frames((f) => ({ invert: f >= 144 && f < 180 }))).status, 'FAIL', 'invert held under 2 beats');
});

test('MO-B-00 auto-pick: whole words, first row wins, explicit style wins', () => {
  assert.equal(autoPickPreset('터미널처럼 보이는 인트로').preset, 'terminalcore');
  assert.equal(autoPickPreset('버스터미널 안내 영상').preset, 'swiss-signal', 'a keyword that only ends a compound does not count');
  assert.equal(autoPickPreset('a calm terminal boot').preset, 'terminalcore', 'first matching row wins');
  assert.equal(autoPickPreset('waves crashing').preset, 'swiss-signal', 'plural is not the whole word');
  assert.equal(autoPickPreset('waves of calm').preset, 'tidal', 'calm is a whole word');
  assert.equal(autoPickPreset('a gradient title').preset, 'tidal');
  assert.equal(autoPickPreset('design system status workflow').preset, 'swiss-signal');
  assert.equal(autoPickPreset('terminal', 'tidal').preset, 'tidal');
  assert.equal(autoPickPreset('terminal', 'tidal').reason, 'agent default', 'a style the agent chose is never labelled user-specified');
  assert.equal(autoPickPreset('terminal', 'tidal', '잔잔한 물결 느낌으로 영상 만들어줘').reason, 'user-specified', 'the request names the style');
  assert.equal(autoPickPreset('terminal', 'tidal', 'use the tidal look lit').reason, 'user-specified');
  assert.throws(() => autoPickPreset('x', 'neon'), /unknown style/);
});

test('Tier 1 timeline paces at 1.25x the floor, snaps cuts forward to beats and holds 2 beats', () => {
  const brief = normalizeBrief({ title: 'Hi', lines: ['움직이는 글자들이 화면을 채운다'], bpm: 100 });
  const plan = buildTimeline(brief, { preset: 'swiss-signal' });
  const beat = 0.6;
  for (const entry of plan.timeline.filter((e) => e.kind === 'line')) {
    assert.ok(Math.abs(entry.start / beat - Math.round(entry.start / beat)) < 1e-9, `${entry.id} starts on a beat`);
    assert.ok(entry.holdSec >= 2 * beat - 1e-9);
    assert.ok(entry.holdSec >= 1.25 * readingFloor(entry.text, 'line') - 1e-9);
  }
  const reveals = plan.timeline.filter((e) => e.kind === 'reveal').map((e) => e.text);
  assert.deepEqual(reveals, ['움직이는', '글자들이', '화면을', '채운다']);
  const grid = buildTimeline(normalizeBrief({ title: 'Beat', lines: ['one two'] }), { preset: 'tidal', beats: [0, 0.5, 1.1, 1.6, 2.2, 2.7, 3.3, 3.8, 4.4, 4.9, 5.5, 6.0, 6.6, 7.1, 7.7] });
  assert.equal(grid.audioTier, 'librosa-beat-grid');
  const late = buildTimeline(normalizeBrief({ title: 'Beat', lines: ['one two'] }), { preset: 'tidal', beats: [1.02, 1.53, 2.02, 2.53, 3.02, 3.53, 4.02, 4.53, 5.02, 5.53, 6.02, 6.53, 7.02, 7.53] });
  const [first, ...cuts] = late.timeline.filter((e) => e.kind === 'line');
  assert.equal(first.start, 0, 'the film starts at 0 even when the first beat is late');
  for (const entry of cuts) assert.ok(late.beatGrid.some((b) => Math.abs(b - entry.beatSec) < 1e-9), `${entry.id} cuts on a detected beat`);
  for (const entry of grid.timeline.filter((e) => e.kind === 'line').slice(1)) assert.ok(grid.beatGrid.some((b) => Math.abs(b - entry.beatSec) < 1e-9));
});

test('pass planning caps glitch and surge events at two per second per shot (MO-SH-03)', () => {
  assert.deepEqual(admitEvents([{ t: 0 }, { t: 0.2 }, { t: 0.4 }, { t: 1.3 }]).map((e) => e.t), [0, 0.2, 1.3]);
  for (const preset of ['swiss-signal', 'terminalcore', 'tidal']) {
    const plan = buildTimeline(normalizeBrief({ title: 'Signals and noise', lines: ['one line that runs a while longer than most'], seed: 9 }), { preset });
    planPasses(plan, preset, { runSeed: 9, software: false, fps: 60 });
    for (const shot of plan.shots) {
      const times = shot.events.map((e) => e.t);
      for (const t of times) assert.ok(times.filter((u) => u >= t && u < t + 1).length <= 2, `${preset} ${shot.id} over the ceiling`);
      const glitch = shot.passes.find((p) => p.pass === 'glitch');
      if (glitch) {
        assert.ok(glitch.params.hitRatePerSecRealized <= 2.0);
        for (const hit of glitch.schedule) assert.ok(hit.areaPct <= 20);
      }
      for (const pass of shot.passes) if (pass.pass !== 'swiss-grid') assert.equal(pass.seed, passSeed(9, shot.sceneId, shot.shotIndex, pass.pass));
    }
  }
});

test('software GL downgrade: samples 1, octaves halved to at least 3, persistence off (MO-SH-09)', () => {
  const plan = buildTimeline(normalizeBrief({ title: 'Wave', lines: ['calm'] }), { preset: 'tidal' });
  planPasses(plan, 'tidal', { runSeed: 1, software: true, fps: 60 });
  const tidal = plan.shots[0].passes.find((p) => p.pass === 'tidal-gradient');
  assert.equal(tidal.params.octaves, 3);
  assert.equal(tidal.downgraded, true);
  const term = buildTimeline(normalizeBrief({ title: 'BOOT' }), { preset: 'terminalcore' });
  planPasses(term, 'terminalcore', { runSeed: 1, software: true, fps: 60 });
  const crt = term.shots[0].passes.find((p) => p.pass === 'crt');
  assert.equal(crt.params.persistenceEnabled, false);
  assert.equal(crt.downgraded, true);
  assert.equal(isSoftwareRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0)), SwiftShader driver)'), true);
  assert.equal(isSoftwareRenderer('Mesa Intel(R) UHD Graphics 630'), false, 'bare mesa is a real GPU');
  assert.equal(isSoftwareRenderer('llvmpipe (LLVM 15.0.7, 256 bits)'), true);
  assert.deepEqual(flagLadder({ platform: 'darwin' })[0].slice(0, 1), ['--use-angle=metal']);
  assert.deepEqual(flagLadder({ platform: 'darwin' }).at(-1).slice(0, 2), ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']);
  assert.ok(flagLadder({ platform: 'win32' }).every((rung) => !rung.includes('--use-angle=d3d9')));
});

test('cmap coverage reads the shipped fonts and stroke SVGs (MO-D-04)', () => {
  const archivo = cmapCoverage(new Uint8Array(readFileSync(join(skill, 'fonts/Archivo-w100-wt700.ttf'))));
  assert.equal(archivo('A'.codePointAt(0)), true);
  assert.equal(archivo('가'.codePointAt(0)), false);
  const pretendard = cmapCoverage(new Uint8Array(readFileSync(join(root, '.grok/skills/lit-pptx/pretendard-font/public/static/Pretendard-Regular.otf'))));
  assert.equal(pretendard('가'.codePointAt(0)), true);
  const stroke = strokeCoverage(readFileSync(join(skill, 'fonts/stroke/EMSReadability.svg'), 'utf8'));
  assert.equal(stroke('A'.codePointAt(0)), true);
  assert.equal(stroke('가'.codePointAt(0)), false);
});

test('no wall clock or unseeded randomness in any visual page path (MO-A-23)', () => {
  const pageDir = join(skill, 'scripts/page');
  for (const name of readdirSync(pageDir)) {
    const source = readFileSync(join(pageDir, name), 'utf8');
    assert.doesNotMatch(source, /Math\.random|Date\.now/, `${name} uses a random or wall-clock source`);
    const perfUses = source.split('\n').filter((line) => line.includes('performance.now'));
    if (name === 'engine.js') {
      const perfBody = source.slice(source.indexOf('async perf(frames)'), source.indexOf('async sheet('));
      assert.equal(perfUses.length, perfBody.split('\n').filter((line) => line.includes('performance.now')).length, 'performance.now only inside the perf timer');
    } else assert.equal(perfUses.length, 0, `${name} reads performance.now`);
  }
});
