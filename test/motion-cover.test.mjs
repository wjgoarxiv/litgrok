import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { COVER, EXIT } from '../.grok/skills/lit-typographic-motion/scripts/lib/constants.mjs';
import { resolveChrome } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';
import { validateCoverTreatment } from '../.grok/skills/lit-typographic-motion/scripts/lib/cover-treatment.mjs';
import { validateTreatment } from '../.grok/skills/lit-typographic-motion/scripts/lib/treatment.mjs';
import { coverGate, coverReportText, gifTiming, glyphHeights, motionMetrics, resample } from '../.grok/skills/lit-typographic-motion/scripts/lib/cover-gate.mjs';
import { decodeWebp, findDwebp, findImg2webp, parseWebp } from '../.grok/skills/lit-typographic-motion/scripts/lib/cover-webp.mjs';
import { encodeCover, frameAt, img2webpArgs, loopTimes, maxLevelDiff, seekOrder } from '../.grok/skills/lit-typographic-motion/scripts/lib/cover.mjs';
import { lanczosResize, lumaGrid } from '../.grok/skills/lit-typographic-motion/scripts/lib/cover-image.mjs';
import { artCheck } from '../.grok/skills/lit-typographic-motion/scripts/lib/cover-assets.mjs';
import { capturePass, openCover } from '../.grok/skills/lit-typographic-motion/scripts/lib/cover-capture.mjs';
import { CoverPool } from '../.grok/skills/lit-typographic-motion/scripts/lib/cover-pool.mjs';
import { doneState, recordLook } from '../.grok/skills/lit-typographic-motion/scripts/lib/look.mjs';
import { stageFonts } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage.mjs';
import { decodePng, encodePng } from '../.grok/skills/lit-typographic-motion/scripts/lib/png.mjs';

// A Chrome helper can flush its profile for a moment after the browser exits; teardown retries and
// never masks the test's own assertion.
const cleanup = (dir) => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 }); } catch { /* reported by the leak check */ } };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = join(root, '.grok/skills/lit-typographic-motion');
const motion = join(skill, 'scripts/motion.mjs');
const fixtures = join(root, 'test/fixtures/motion/cover');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const LIBWEBP = Boolean(findImg2webp() && findDwebp());
const NO_LIBWEBP = LIBWEBP ? false : 'libwebp tools (img2webp, dwebp) are needed to encode and decode a cover';
const NO_RENDER = resolveChrome(process.env) && LIBWEBP ? false : 'Chrome and libwebp (img2webp, dwebp) are needed for cover renders';

const temps = [];
const temp = (prefix) => { const dir = mkdtempSync(join(tmpdir(), prefix)); temps.push(dir); return dir; };
test.after(() => { for (const dir of temps) cleanup(dir); });

const coverTreatment = (over = {}) => ({
  mode: 'cover',
  request: 'An animated cover for the top of the GROKLOOP readme.',
  idea: 'Stripes slide one period per loop while a dot laps a ring beside a still word.',
  recipe: 'own',
  recipeReason: 'A test pattern with the three speed layers and nothing more.',
  brandWord: 'GROKLOOP',
  aspect: '2:1',
  loopSec: 6,
  fps: 16,
  layers: { slow: 'Stripes slide one period per loop.', mid: 'A dot laps its ring twice per loop.', beat: 'The dot swells as it passes the top.' },
  system: { rule: 'One stripe rule.', copies: 'Fifteen stripes.', offset: "Each stripe's x position." },
  title: { box: [0.05, 0.37, 0.62, 0.27], kind: 'live' },
  ambition: 'Every frame moves and the seam disappears in the decoded file.',
  ...over,
});

const cli = (args, env = {}) => spawnSync(process.execPath, [motion, ...args], { encoding: 'utf8', env: { ...process.env, LITGROK_MOTION_CACHE: temp('lgm-cover-cache-'), ...env }, timeout: 900000 });

function coverRun(fixture, over = {}) {
  const out = join(temp(`lgm-cover-${fixture}-`), 'out');
  mkdirSync(out, { recursive: true });
  cpSync(join(fixtures, fixture), join(out, 'cover'), { recursive: true });
  writeFileSync(join(out, 'treatment.json'), `${JSON.stringify(coverTreatment(over), null, 2)}\n`);
  return out;
}

// A finished cover run without Chrome (treatment, stills, report, manifest) for the look and done checks.
function fakeCoverRun({ verdict = 'PASS+TARGET', treatment = coverTreatment(), round = 1 } = {}) {
  const out = temp('lgm-cover-done-');
  writeFileSync(join(out, 'treatment.json'), `${JSON.stringify(treatment, null, 2)}\n`);
  mkdirSync(join(out, 'stills'), { recursive: true });
  const stills = [];
  for (const [name, kind] of [['frame-00.png', 'frame'], ['poster.png', 'poster'], ['seam.png', 'seam'], ['sheet.png', 'sheet']]) {
    const bytes = encodePng(Buffer.alloc(8 * 4 * 3, stills.length * 9), 8, 4, { channels: 3 });
    writeFileSync(join(out, 'stills', name), bytes);
    stills.push({ file: `stills/${name}`, sha256: sha(bytes), kind });
  }
  return finishFake(out, { verdict, round, stills });
}
function finishFake(out, { verdict, round, stills }) {
  const text = `${JSON.stringify({ schema: 1, path: 'cover', round, mode: 'cover', format: '1000x500', width: 1000, height: 500, durationSec: 6.048, stills }, null, 2)}\n`;
  writeFileSync(join(out, 'stills', 'index.json'), text);
  writeFileSync(join(out, 'gate-report.txt'), `COVER gate --strict: ${verdict}\n`);
  writeFileSync(join(out, 'manifest.json'), JSON.stringify({ path: 'cover', mode: 'cover', treatmentSha256: sha(readFileSync(join(out, 'treatment.json'))), stillsIndexSha256: sha(Buffer.from(text)) }));
  return out;
}
const nextRound = (out, round) => {
  const index = JSON.parse(readFileSync(join(out, 'stills', 'index.json'), 'utf8'));
  finishFake(out, { verdict: 'PASS+TARGET', round, stills: index.stills });
};
function coverAnswers(out, over = {}) {
  const body = {
    viewed: ['stills/sheet.png', 'stills/poster.png', 'stills/seam.png'],
    change: 'Sharpen the light edge from 60 px to 24 px so the encoder keeps it.',
    answers: [1, 2, 3, 4, 5, 6, 7, 8].map((q) => ({
      q, verdict: q === 8 ? 'none' : [6, 7].includes(q) ? 'no' : 'yes', frame: q === 2 ? 'stills/seam.png' : 'stills/sheet.png',
      observed: `Question ${q}: the orange dot sits at a different angle in every tile of row ${q} on the sheet.`,
    })),
    ...over,
  };
  const file = join(out, `answers-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(body));
  return file;
}
const defect = (over = {}) => ({
  t: 1.2, region: [340, 10, 330, 50], frame: 'stills/sheet.png',
  observed: 'The glint turns the Y of the painted title into a solid red block on the second tile.',
  cause: 'A colour-dodge blend saturates the coloured letters.', fix: 'Run the glint in overlay blend instead.', ...over,
});

// ---- treatment -------------------------------------------------------------------------------

test('a cover treatment derives the page, the cover size and the frame count', () => {
  const t = validateCoverTreatment(coverTreatment()).treatment;
  assert.deepEqual(t.page, [1200, 600]);
  assert.deepEqual(t.out, [1000, 500]);
  assert.equal(t.frames, 96);
  assert.equal(t.encode.q, COVER.encode.q);
  assert.equal(t.seed, COVER.defaultSeed);
  assert.deepEqual(validateCoverTreatment(coverTreatment({ aspect: '3:2' })).treatment.out, [960, 640]);
});

test('a cover treatment refuses film fields, sound, invented taglines and out-of-range loops, naming the field', () => {
  const cases = [
    [{ beats: [] }, 'beats'], [{ copy: { source: 'invented', lines: ['x'] } }, 'copy'], [{ sound: { mode: 'generated' } }, 'sound'],
    [{ loopSec: 5 }, 'loopSec'], [{ loopSec: 13 }, 'loopSec'], [{ fps: 60 }, 'fps'], [{ aspect: '16:9' }, 'aspect'],
    [{ motto: { text: 'Ship it before lunch', source: 'user' } }, 'motto.text'], [{ motto: { text: 'Ship it', source: 'project' } }, 'motto.from'],
    [{ idea: 'An animated cover for the top of the GROKLOOP readme.' }, 'idea'], [{ recipe: 'slides' }, 'recipe'],
    [{ title: { box: [0.5, 0.5, 0.6, 0.2], kind: 'live' } }, 'title.box'], [{ title: { box: [0.1, 0.1, 0.2, 0.2], kind: 'drawn' } }, 'title.kind'],
    [{ layers: { slow: 'Stripes slide.', mid: 'A dot laps.' } }, 'layers.beat'], [{ brandWord: 'ONE TWO THREE FOUR' }, 'brandWord'],
  ];
  for (const [over, field] of cases) assert.equal(validateCoverTreatment(coverTreatment(over)).field, field, JSON.stringify(over));
  assert.equal(validateCoverTreatment(coverTreatment({ motto: { text: 'Keep it lit', source: 'project', from: 'README.md' } })).ok, true);
});

test('a film render refuses a cover treatment and names the cover command', () => {
  const result = validateTreatment(coverTreatment());
  assert.equal(result.field, 'mode');
  assert.match(result.message, /cover --out <dir>/);
});

// ---- loop kit and init script ------------------------------------------------------------------

test('every loop-kit helper closes the loop and is seeded or pure', () => {
  const sandbox = {};
  vm.runInNewContext(readFileSync(join(skill, 'scripts/stage/loop-kit.js'), 'utf8'), sandbox);
  const L = sandbox.LitLoop;
  const noise = L.makeNoise(5);
  for (const offset of [0, 1.7, 9.3]) assert.ok(Math.abs(L.loopNoise(noise, 0, offset) - L.loopNoise(noise, 1, offset)) < 1e-9);
  assert.ok(Math.abs(L.swell(0) - L.swell(1)) < 1e-12);
  assert.equal(L.cdist(0.98, 0.02).toFixed(6), '0.040000');
  assert.equal(L.window(0.05, 0.9, 0.2).toFixed(6), '0.750000');
  assert.equal(L.window(0.5, 0.9, 0.2), -1);
  assert.equal(L.steps(0.5, 2), 0.5);
  const a = L.rng(42), b = L.rng(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.equal(L.cubicPulse(0, 0.1, 0.2), 0);
  assert.equal(L.cubicPulse(0.3, 0.1, 0.3), 1);
  assert.doesNotMatch(readFileSync(join(skill, 'scripts/stage/loop-kit.js'), 'utf8').replace(/^\s*\/\/.*$/gmu, ''), /Math\.random\(|Date\.now\(|performance\.now\(|requestAnimationFrame\(/u);
});

test('the cover init script makes every clock and entropy source throw and records each call', () => {
  const freshCtx = () => {
    // Each context models another browser, with its own Performance class: cover-init
    // replaces Performance.prototype.now, so sharing one class would let the second
    // context steal the first context's recorder.
    class Performance { now() { return 1; } }
    const ctx = { Math: Object.create(Math), Date, Performance, performance: new Performance(), requestAnimationFrame: (cb) => cb(), crypto: { getRandomValues: () => 1 }, document: { documentElement: null, addEventListener() {} } };
    ctx.window = ctx;
    return ctx;
  };
  const ctx = freshCtx();
  vm.runInNewContext(readFileSync(join(skill, 'scripts/stage/cover-init.js'), 'utf8'), ctx);
  // Building the scene may draw ids from Math.random: a fixed-seed sequence, the same in every browser.
  const other = freshCtx();
  vm.runInNewContext(readFileSync(join(skill, 'scripts/stage/cover-init.js'), 'utf8'), other);
  assert.deepEqual([ctx.Math.random(), ctx.Math.random()], [other.Math.random(), other.Math.random()]);
  // Once the page is ready, frames are drawn in any order, so a call then is misuse.
  ctx.window.ready = true;
  assert.throws(() => ctx.Math.random(), /Math\.random is not available/u);
  assert.throws(() => ctx.window.Date.now(), /Date\.now is not available/u);
  assert.throws(() => new ctx.window.Date(), /Date is not available/u);
  assert.equal(new ctx.window.Date(0).getTime(), 0, 'a fixed date is still allowed');
  assert.throws(() => ctx.performance.now(), /performance\.now is not available/u);
  assert.throws(() => ctx.window.requestAnimationFrame(() => {}), /requestAnimationFrame is not available/u);
  assert.throws(() => ctx.crypto.getRandomValues(), /getRandomValues is not available/u);
  assert.deepEqual(Array.from(ctx.__litCoverMisuse()), ['Math.random', 'Date.now', 'Date', 'performance.now', 'requestAnimationFrame', 'crypto.getRandomValues']);
});

// ---- gate metrics ------------------------------------------------------------------------------

const flat = (v, n = 16) => Float32Array.from({ length: n }, (_, i) => v + (i % 2));

test('the gate reads a fixed time grid and treats the loop as a ring', () => {
  const still = motionMetrics({ lumas: Array.from({ length: 96 }, () => flat(10)), delays: Array(96).fill(63) });
  assert.equal(still.movingFrac, 0);
  assert.ok(Math.abs(still.longestStillSec - 96 * 0.063) < 1e-9);
  const wave = Array.from({ length: 96 }, (_, i) => Float32Array.from({ length: 16 }, (_, k) => 100 + 60 * Math.sin(2 * Math.PI * (i / 96 + k / 16))));
  const drift = motionMetrics({ lumas: wave, delays: Array(96).fill(63) });
  assert.equal(drift.movingFrac, 1);
  assert.ok(drift.seamLocal > 0.5 && drift.seamLocal < 1.5, String(drift.seamLocal));
  assert.ok(Math.abs(drift.longestStillSec - 0.063) < 1e-9, 'a loop with no still step holds each sample one step');
  const sweep = motionMetrics({ lumas: Array.from({ length: 96 }, (_, i) => flat(i)), delays: Array(96).fill(63) });
  assert.ok(sweep.seamLocal > 50, `a reset is a seam spike (${sweep.seamLocal})`);
  assert.deepEqual(resample(['a', 'b', 'c'], [100, 300, 100], 50), ['a', 'a', 'b', 'b', 'b', 'b', 'b', 'b', 'c', 'c']);
  const merged = motionMetrics({ lumas: [flat(0), flat(80), flat(160)], delays: [1000, 3000, 1000] });
  assert.ok(merged.longestStillSec >= 2.9, 'an encoder-merged long frame reads as a hold');
});

test('the GIF fallback reads per-frame delays and the loop count from the container', () => {
  const head = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([4, 0, 4, 0, 0, 0, 0])]);
  const loop = Buffer.concat([Buffer.from([0x21, 0xff, 0x0b]), Buffer.from('NETSCAPE2.0', 'latin1'), Buffer.from([3, 1, 0, 0, 0])]);
  const frame = (cs) => Buffer.from([0x21, 0xf9, 4, 0, cs & 255, cs >> 8, 0, 0, 0x2c, 0, 0, 0, 0, 4, 0, 4, 0, 0x80, 0, 0, 0, 255, 255, 255, 2, 2, 0x4c, 0x01, 0]);
  assert.deepEqual(gifTiming(Buffer.concat([head, loop, frame(6), frame(7), Buffer.from([0x3b])])), { delays: [60, 70], loop: 0, width: 4, height: 4 });
});

test('the report names every gate and the strict verdict, and INFO for an exempt gate', () => {
  const text = coverReportText({ pass: true, target: false, width: 1000, height: 500, format: 'webp', sourceFrames: 128, sourceDurationSec: 8.064, bytes: 2_400_000, loop: 0, stepMs: 63, gates: { G1: { pass: true, target: false, bytes: 2_400_000 }, G2: { pass: true, target: true, medianD: 0.002 }, G6: { pass: null, capPx: 11 } } }, { strict: true });
  assert.match(text, /^COVER gate --strict: PASS\(floor\)$/mu);
  assert.match(text, /G1 pass\(floor\) bytes=2400000/u);
  assert.match(text, /G6 INFO capPx=11/u);
});

test('img2webp gets frame 0 and the last edge frames at the edge quality, 63 ms per frame at 16 fps, no keyframe flags', () => {
  const args = img2webpArgs({ files: ['a', 'b', 'c', 'd'], fps: 16, encode: { q: 80, edgeQ: 97, edgeFrames: 1, method: 4 }, out: 'o.webp' });
  assert.deepEqual(args.slice(0, 7), ['-loop', '0', '-lossy', '-q', '80', '-m', '4']);
  const perFrame = [];
  for (let i = 7; i < args.length - 2; i += 5) perFrame.push(args.slice(i, i + 5).join(' '));
  assert.deepEqual(perFrame, ['-d 63 -q 97 a', '-d 63 -q 80 b', '-d 63 -q 80 c', '-d 63 -q 97 d']);
  assert.doesNotMatch(args.join(' '), /-kmin|-kmax|mp4/u);
  assert.deepEqual(loopTimes(4), [[0, 0], [1, 0.25], [2, 0.5], [3, 0.75]]);
  assert.equal(frameAt([63, 126, 63], 100), 1);
});

test('a 2x capture is shrunk with Lanczos and the luma grid is about 300 px wide', () => {
  const out = lanczosResize(Buffer.alloc(40 * 20 * 4, 255), 40, 20, 20, 10);
  assert.equal(out.length, 20 * 10 * 4);
  assert.ok(out.every((v) => v === 255));
  const grid = lumaGrid(Buffer.alloc(1000 * 500 * 4), 1000, 500);
  assert.deepEqual([grid.w, grid.h], [333, 166]);
});

test('the decoder reads every frame, its duration and the loop count, composited as a browser shows it', { skip: NO_LIBWEBP }, () => {
  const dir = temp('lgm-cover-webp-');
  const W = 64, H = 32;
  const files = [];
  for (let i = 0; i < 6; i += 1) {
    const rgb = Buffer.alloc(W * H * 3, 20);
    for (let y = 8; y < 24; y += 1) for (let x = i * 8; x < i * 8 + 12; x += 1) rgb.fill(230, (y * W + x) * 3, (y * W + x) * 3 + 3);
    const file = join(dir, `f${i}.png`);
    writeFileSync(file, encodePng(rgb, W, H, { channels: 3 }));
    files.push(file);
  }
  const out = join(dir, 'c.webp');
  const run = spawnSync(findImg2webp(), img2webpArgs({ files, fps: 16, encode: { q: 90, edgeQ: 97, edgeFrames: 2, method: 4 }, out }), { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const parsed = parseWebp(readFileSync(out));
  assert.equal(parsed.loop, 0);
  assert.deepEqual([parsed.width, parsed.height], [W, H]);
  const edges = [];
  const info = decodeWebp(out, { onFrame: (i, rgba) => { const row = 16 * W * 4; let left = -1; for (let x = 0; x < W; x += 1) if (rgba[row + x * 4] > 128) { left = x; break; } edges.push(left); } });
  assert.equal(info.frames, 6);
  assert.deepEqual(info.durations, Array(6).fill(63));
  assert.deepEqual(edges, [0, 8, 16, 24, 32, 40]);
});

test('the strict gate fails a cover over 2 MiB: G1 passes the floor and misses TARGET', { skip: NO_LIBWEBP }, () => {
  const dir = temp('lgm-cover-heavy-');
  const W = 320, H = 160;
  let seed = 7;
  const next = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed >>> 24; };
  const files = [];
  for (let i = 0; i < 96; i += 1) {
    const rgb = Buffer.alloc(W * H * 3);
    for (let p = 0; p < rgb.length; p += 3) rgb[p] = rgb[p + 1] = rgb[p + 2] = next();
    const file = join(dir, `f${String(i).padStart(3, '0')}.png`);
    writeFileSync(file, encodePng(rgb, W, H, { channels: 3, level: 1 }));
    files.push(file);
  }
  let picked = null;
  for (const q of [30, 40, 50, 60, 70]) {
    const out = join(dir, `q${q}.webp`);
    spawnSync(findImg2webp(), img2webpArgs({ files, fps: 16, encode: { q, edgeQ: q, edgeFrames: 0, method: 0 }, out }));
    const bytes = readFileSync(out).length;
    if (bytes > COVER.targetBytes && bytes <= COVER.maxBytes) { picked = out; break; }
  }
  assert.ok(picked, 'a noise cover lands between 2 and 3 MiB at one of the qualities');
  const r = coverGate(picked);
  assert.equal(r.gates.G1.pass, true);
  assert.equal(r.gates.G1.target, false);
  assert.equal(r.pass, true, 'every other gate passes the floor');
  assert.equal(r.target, false);
  const strict = cli(['cover-gate', picked, '--strict']);
  assert.equal(strict.status, EXIT.GATE_FAIL_QA, strict.stdout);
  assert.match(strict.stdout, /G1 pass\(floor\)/u);
  assert.equal(cli(['cover-gate', picked]).status, 0, 'without --strict the floor alone decides');
});

// ---- look rounds, defects and done ---------------------------------------------------------------

test('a cover round answers the eight cover questions, needs no stills-only round 1 and no weakest beat', () => {
  const out = fakeCoverRun();
  const record = recordLook(out, { round: 1, answersFile: coverAnswers(out) });
  assert.deepEqual(record.openItems, []);
  assert.equal(record.stamp.mode, 'cover');
  const nine = JSON.parse(readFileSync(coverAnswers(out), 'utf8'));
  nine.answers.push({ q: 9, verdict: 'yes', frame: 'stills/sheet.png', observed: 'A ninth answer about the sheet that a cover does not ask for.' });
  const file = join(out, 'nine.json');
  writeFileSync(file, JSON.stringify(nine));
  const fresh = fakeCoverRun();
  assert.throws(() => recordLook(fresh, { round: 1, answersFile: file }), /q must be 1-8/u);
});

test('damage, a slide read or a named designer change asks for another round', () => {
  const out = fakeCoverRun();
  const doc = JSON.parse(readFileSync(coverAnswers(out), 'utf8'));
  doc.answers[6].verdict = 'yes';
  doc.answers[7].verdict = 'add a second slower drift layer behind the word';
  doc.answers[1].verdict = 'no';
  const file = join(out, 'damaged.json');
  writeFileSync(file, JSON.stringify(doc));
  assert.deepEqual(recordLook(out, { round: 1, answersFile: file }).openItems, ['Q2: no', 'Q7: yes', 'Q8: add a second slower drift layer behind the word']);
});

test('C001: a cover round keeps up to three defects with a time, a region and a frame from the current stills', () => {
  const out = fakeCoverRun();
  const record = recordLook(out, { round: 1, answersFile: coverAnswers(out, { defects: [defect()] }) });
  assert.equal(record.defects.length, 1);
  assert.deepEqual(record.defects[0].region, [340, 10, 330, 50]);
  assert.equal(record.defects[0].t, 1.2);
  const refusals = [
    [{ t: undefined }, /defect 1: t must be the loop time in seconds/u],
    [{ t: 9 }, /defect 1: t must be the loop time in seconds \(0 to 6\.048\)/u],
    [{ frame: 'stills/beat-01-mid.png' }, /defect 1: stills\/beat-01-mid\.png is not in the latest stills set/u],
    [{ region: [900, 400, 300, 200] }, /defect 1: region must be \[x, y, w, h\] inside the 1000x500 cover/u],
    [{ observed: 'red' }, /defect 1: observed must be at least one sentence/u],
    [{ fix: '' }, /defect 1: cause and fix/u],
  ];
  for (const [over, message] of refusals) {
    const run = fakeCoverRun();
    assert.throws(() => recordLook(run, { round: 1, answersFile: coverAnswers(run, { defects: [defect(over)] }) }), message, JSON.stringify(over));
  }
  const four = fakeCoverRun();
  assert.throws(() => recordLook(four, { round: 1, answersFile: coverAnswers(four, { defects: [defect(), defect({ t: 2 }), defect({ t: 3 }), defect({ t: 4 })] }) }), /at most 3 defects per round/u);
});

test('a film round may not carry cover defects', () => {
  const out = fakeCoverRun();
  const index = JSON.parse(readFileSync(join(out, 'stills', 'index.json'), 'utf8'));
  writeFileSync(join(out, 'stills', 'index.json'), JSON.stringify({ ...index, mode: 'stills-only', path: 'stage' }));
  assert.throws(() => recordLook(out, { round: 1, answersFile: coverAnswers(out, { defects: [defect()], weakestBeat: 0 }) }), /defects are a cover-mode record/u);
});

test('done needs TARGET on the last render and two rounds that viewed the sheet, the poster and the seam pair', () => {
  const out = fakeCoverRun();
  assert.equal(doneState(out).status, 'NOT DONE');
  recordLook(out, { round: 1, answersFile: coverAnswers(out) });
  assert.match(doneState(out).reason, /1 look round\(s\) recorded/u);
  nextRound(out, 2);
  recordLook(out, { round: 2, answersFile: coverAnswers(out) });
  const done = doneState(out);
  assert.equal(done.status, 'DONE', done.reason);
  assert.equal(done.mode, 'cover');
  writeFileSync(join(out, 'gate-report.txt'), 'COVER gate --strict: PASS(floor)\n');
  assert.match(doneState(out).reason, /did not reach every TARGET gate/u);
  const verify = cli(['verify', '--out', out]);
  assert.equal(verify.status, 1);
  assert.match(verify.stdout, /^NOT DONE: the decoded cover did not reach every TARGET gate/mu);
});

test('a last round that skipped the seam pair is not done', () => {
  const out = fakeCoverRun();
  recordLook(out, { round: 1, answersFile: coverAnswers(out) });
  nextRound(out, 2);
  recordLook(out, { round: 2, answersFile: coverAnswers(out, { viewed: ['stills/sheet.png', 'stills/poster.png'], answers: [1, 2, 3, 4, 5, 6, 7, 8].map((q) => ({ q, verdict: q === 8 ? 'none' : [6, 7].includes(q) ? 'no' : 'yes', frame: 'stills/sheet.png', observed: `Question ${q}: the dot sits at a new angle in tile ${q} of the sheet.` })) }) });
  assert.match(doneState(out).reason, /did not view stills\/seam\.png/u);
});

test('C009: a generated base art is a label the finished cover has to carry', () => {
  const out = fakeCoverRun();
  writeFileSync(join(out, 'assets.json'), JSON.stringify({ assets: [{ path: 'cover/assets/base.png', role: 'base-art', source: 'generated', sha256: 'a'.repeat(64), box: [0.125, 0, 0.75, 1] }] }));
  recordLook(out, { round: 1, answersFile: coverAnswers(out) });
  nextRound(out, 2);
  recordLook(out, { round: 2, answersFile: coverAnswers(out) });
  assert.deepEqual(doneState(out).labels, ['the base art cover/assets/base.png is generated, not supplied: label it as generated in the reply']);
  const verify = cli(['verify', '--out', out]);
  assert.equal(verify.status, 0, verify.stdout + verify.stderr);
  assert.match(verify.stdout, /^the base art cover\/assets\/base\.png is generated, not supplied: label it as generated in the reply$/mu);
});

// ---- assets, art, glyph height, seek order -------------------------------------------------------

const art = () => {
  const W = 96, H = 64;
  const rgb = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) rgb.fill(((x * 7) ^ (y * 13)) & 255, (y * W + x) * 3, (y * W + x) * 3 + 3);
  return { W, H, png: encodePng(rgb, W, H, { channels: 3 }) };
};

function paintedRun({ assets, writeArt = true, extra = null }) {
  const out = coverRun('good', { recipe: 'painted-light', recipeReason: 'The painting carries the picture; the page relights it.', title: { box: [0.35, 0.03, 0.31, 0.09], kind: 'painted' } });
  mkdirSync(join(out, 'cover', 'assets'), { recursive: true });
  const a = art();
  if (writeArt) writeFileSync(join(out, 'cover', 'assets', 'base.png'), a.png);
  if (extra) writeFileSync(join(out, 'cover', 'assets', extra), a.png);
  if (assets) writeFileSync(join(out, 'assets.json'), JSON.stringify(assets(sha(a.png))));
  return out;
}
const listed = (hash) => ({ assets: [{ path: 'cover/assets/base.png', role: 'base-art', source: 'user', sha256: hash, box: [0.125, 0, 0.75, 1] }] });

test('C007: a listed asset that is missing is BLOCKED_ASSET_MISSING (exit 22) and no frame is written', () => {
  const out = paintedRun({ assets: listed, writeArt: false });
  const r = cli(['cover', '--out', out, '--round', '1']);
  assert.equal(r.status, EXIT.ASSET_MISSING, r.stdout + r.stderr);
  assert.match(r.stderr, /BLOCKED_ASSET_MISSING: cover\/assets\/base\.png is listed in assets\.json and missing; supply it or generate it, never draw a stand-in/u);
  assert.equal(existsSync(join(out, '.run', 'cover', 'frames')), false);
  assert.equal(existsSync(join(out, 'cover.webp')), false);
});

test('the painted recipe without listed base art stops; an unlisted raster or a changed file is a contract error', () => {
  const none = cli(['cover', '--out', paintedRun({ assets: null }), '--round', '1']);
  assert.equal(none.status, EXIT.ASSET_MISSING, none.stderr);
  assert.match(none.stderr, /the painted-light recipe needs its base art listed in assets\.json/u);
  const unlisted = cli(['cover', '--out', paintedRun({ assets: listed, extra: 'logo.png' }), '--round', '1']);
  assert.equal(unlisted.status, EXIT.STAGE_CONTRACT, unlisted.stderr);
  assert.match(unlisted.stderr, /cover\/assets\/logo\.png is a raster the page can load and assets\.json does not list it/u);
  const changed = cli(['cover', '--out', paintedRun({ assets: () => listed('0'.repeat(64)) }), '--round', '1']);
  assert.equal(changed.status, EXIT.STAGE_CONTRACT, changed.stderr);
  assert.match(changed.stderr, /cover\/assets\/base\.png does not match its sha256 in assets\.json/u);
});

test('C008: frame 0 must show the base art: SSIM of its check box against the source scaled into it', () => {
  const a = art();
  const W = 200, H = 100, box = [50, 10, 96, 64];
  const frame = Buffer.alloc(W * H * 4, 255);
  const src = Buffer.alloc(a.W * a.H * 4, 255);
  for (let y = 0; y < a.H; y += 1) for (let x = 0; x < a.W; x += 1) {
    const v = ((x * 7) ^ (y * 13)) & 255;
    src.fill(v, (y * a.W + x) * 4, (y * a.W + x) * 4 + 3);
    frame.fill(v, ((box[1] + y) * W + box[0] + x) * 4, ((box[1] + y) * W + box[0] + x) * 4 + 3);
  }
  const fractions = [box[0] / W, box[1] / H, box[2] / W, box[3] / H];
  const ok = artCheck({ frame0: frame, width: W, height: H, art: { rgba: src, width: a.W, height: a.H }, box: fractions });
  assert.ok(ok.pass && ok.ssim > 0.99, JSON.stringify(ok));
  const bad = artCheck({ frame0: Buffer.alloc(W * H * 4, 40), width: W, height: H, art: { rgba: src, width: a.W, height: a.H }, box: fractions });
  assert.equal(bad.pass, false);
  assert.ok(bad.ssim < COVER.artSsim, String(bad.ssim));
});

function masks(dir, { glyphPx, count = 4, width = 1000, height = 500 }) {
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i += 1) {
    const rgb = Buffer.alloc(width * height * 3);
    for (let g = 0; g < 6; g += 1) {
      const x0 = 120 + g * (glyphPx + 8);
      for (let y = 100; y < 100 + glyphPx; y += 1) for (let x = x0; x < x0 + Math.max(3, Math.round(glyphPx * 0.6)); x += 1) rgb.fill(255, (y * width + x) * 3, (y * width + x) * 3 + 3);
    }
    writeFileSync(join(dir, `m${String(i).padStart(4, '0')}.png`), encodePng(rgb, width, height, { channels: 3 }));
  }
  return dir;
}

test('C010: G6 fails letters 13 px tall on a 1000 px cover (10.8 px in an 830 px README) and passes 60 px letters', () => {
  const box = [0.1, 0.15, 0.8, 0.3];
  const small = glyphHeights({ masksDir: masks(join(temp('lgm-g6-'), 'm'), { glyphPx: 13 }), box, displayWidth: 830 });
  assert.ok(Math.abs(small.capPx - 13 * 0.83) < 0.6, JSON.stringify(small));
  assert.equal(small.pass, false);
  const big = glyphHeights({ masksDir: masks(join(temp('lgm-g6-'), 'm'), { glyphPx: 60 }), box, displayWidth: 830 });
  assert.equal(big.pass, true);
  assert.ok(big.capPx >= COVER.minGlyphPx);
  const exempt = glyphHeights({ masksDir: masks(join(temp('lgm-g6-'), 'm'), { glyphPx: 13 }), box, displayWidth: 830, exempt: 'painted into the base art cover/assets/base.png' });
  assert.equal(exempt.pass, null, 'a declared painted title is measured and reported, never silently passed');
  assert.match(exempt.reason, /painted into the base art/u);
});

test('the seek-order tolerance is one level, nothing more, and the shuffle is seeded', () => {
  const dir = temp('lgm-seek-');
  const frame = (v) => { const file = join(dir, `f${v}.png`); writeFileSync(file, encodePng(Buffer.alloc(16 * 8 * 3, v), 16, 8, { channels: 3 })); return file; };
  assert.equal(COVER.seekLevels, 1);
  assert.equal(maxLevelDiff(frame(100), frame(101)), 1);
  assert.equal(maxLevelDiff(frame(100), frame(102)), 2);
  const order = seekOrder(96, 20261020);
  assert.equal(new Set(order).size, 16);
  assert.deepEqual(order, seekOrder(96, 20261020));
  assert.notDeepEqual(order, [...order].sort((a, b) => a - b), 'the order is not sequential');
});

// ---- recipes and negatives ----------------------------------------------------------------------

const RECIPES = ['painted-light', 'weight-tide', 'orbit-loop'];
const NEGATIVES = ['title-slam', 'card-scenes', 'still-glow', 'reset-sweep'];

test('every recipe ships its page and the decoded gate row it reached, inside TARGET and under 2 MiB', () => {
  for (const name of RECIPES) {
    const row = JSON.parse(readFileSync(join(skill, 'recipes', name, 'expected.json'), 'utf8'));
    for (const key of ['medianD', 'movingFrac', 'longestStillSec', 'spike', 'seamLocal', 'bytes']) assert.equal(typeof row.row[key], 'number', `${name}.${key}`);
    assert.ok(row.row.bytes <= COVER.targetBytes, name);
    assert.ok(row.row.medianD >= COVER.target.medianD && row.row.movingFrac >= COVER.target.movingFrac, name);
    assert.ok(row.row.seamLocal <= COVER.target.seamLocal && row.row.seamLocal >= COVER.target.seamLo, name);
    assert.ok(row.row.longestStillSec <= COVER.target.stillSec && row.row.spike <= COVER.target.spike, name);
    assert.equal(validateCoverTreatment(row.treatment).ok, true, name);
    assert.equal(row.treatment.recipe, name);
    assert.ok(existsSync(join(skill, 'recipes', name, 'index.html')), name);
  }
  for (const name of NEGATIVES) {
    const expected = JSON.parse(readFileSync(join(skill, 'recipes', 'negatives', name, 'expected.json'), 'utf8'));
    assert.ok(expected.mustFail.length && expected.mustFail.every((id) => /^G[0-6]\.(floor|target)$/u.test(id)), name);
    assert.ok(existsSync(join(skill, 'recipes', 'negatives', name, 'index.html')), name);
  }
  assert.equal(readdirSync(join(skill, 'recipes'), { recursive: true }).some((f) => /\.(webp|gif|mp4|png|jpe?g)$/u.test(String(f))), false, 'no encoded cover or raster ships in recipes/');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['qa:cover-recipes'], 'node scripts/qa-cover-recipes.mjs');
  assert.ok(existsSync(join(root, 'scripts/qa-cover-recipes.mjs')));
});

// painted-light's PAINTING bays and gate row are measured on the five-bay LitFamily painting. The
// README illustration moved to seven machines, so the recipe QA keeps its own copy of the old one.
test('the painted-light recipe QA renders on its own five-bay base, not the README illustration', () => {
  const base = join(root, 'test/fixtures/cover-recipes/painted-light-base.png');
  const bytes = readFileSync(base);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '955ccd875bd0da509ba850b76a83ac7aa76f2ecc5c019bcb2d04043e8d46179e');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [1536, 1024], 'the size PAINTING is measured in');
  const page = readFileSync(join(skill, 'recipes', 'painted-light', 'index.html'), 'utf8');
  assert.match(page, /bays: \[\[13, 303\], \[320, 607\], \[623, 906\], \[921, 1208\], \[1224, 1526\]\]/u, 'five bays, unchanged');
  const script = readFileSync(qaScript, 'utf8');
  assert.match(script, /test\/fixtures\/cover-recipes\/painted-light-base\.png/u);
  assert.doesNotMatch(script, /docs\/assets\/litfamily-machines\.png/u);
  const expected = JSON.parse(readFileSync(join(skill, 'recipes', 'painted-light', 'expected.json'), 'utf8'));
  assert.match(expected.base, /^test\/fixtures\/cover-recipes\/painted-light-base\.png /u);
});

// The recipe QA proves a negative only by the gates it declares: a crash or a failure on another
// gate is a QA failure, never a caught defect.
const qaScript = join(root, 'scripts/qa-cover-recipes.mjs');
const qa = (args) => spawnSync(process.execPath, [qaScript, '--out', temp('lgm-cover-qa-'), ...args], {
  encoding: 'utf8', timeout: 120000, env: { ...process.env, CHROME_PATH: join(tmpdir(), 'lgm-no-chrome'), LITGROK_MOTION_CACHE: temp('lgm-cover-cache-') },
});

test('a render that crashes never counts as a caught regression or negative', () => {
  const feather = qa(['--feather', '150']);
  assert.equal(feather.status, 1, feather.stdout + feather.stderr);
  assert.match(feather.stdout, /^FAIL +regression painted-light feather-150 +not proven: the render did not complete and gate the decoded file \(exit 10\)/mu);
  const negatives = qa(['--negatives', '--only', 'painted-light']);
  assert.equal(negatives.status, 1, negatives.stdout + negatives.stderr);
  for (const name of NEGATIVES) assert.match(negatives.stdout, new RegExp(`^FAIL +negative ${name} +not proven: the render did not complete`, 'mu'));
  assert.match(negatives.stdout, /^FAIL +regression painted-light feather-150 +not proven/mu);
});

test('a regression nobody declared is a QA failure, not a caught defect', () => {
  const r = qa(['--feather', '200']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^FAIL +regression painted-light feather-200 +not proven: painted-light\/expected\.json declares no regression feather-200/mu);
});

test('a recipe whose expected row is missing fails the QA instead of passing it', () => {
  const r = qa(['--only', 'negatives']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^FAIL +negatives +no expected row/mu);
});

test('the verdict needs a gated render and every declared gate failing; an undeclared FLOOR failure is not enough', async () => {
  const { judgeCase } = await import(qaScript);
  const gates = (over) => ({ G1: { pass: true, target: true }, G2: { pass: true, target: true }, G3: { pass: true, target: true }, G4: { pass: true, target: true }, ...over });
  const run = (status, g) => ({ status, manifest: g ? { gate: { gates: g } } : null });
  assert.equal(judgeCase(['G1.target'], run(14, null)).ok, false);
  assert.match(judgeCase(['G1.target'], run(14, null)).why, /did not complete/u);
  assert.equal(judgeCase(['G1.target'], run(1, gates({ G1: { pass: true, target: false } }))).ok, false, 'a crash exit with a stale manifest');
  assert.match(judgeCase(['G1.target'], run(13, gates({ G4: { pass: true, target: false } }))).why, /G1\.target did not fail/u);
  assert.equal(judgeCase(['G1.target'], run(13, gates({ G1: { pass: true, target: false }, G4: { pass: true, target: false } }))).ok, true);
  assert.match(judgeCase(['G1.target'], run(13, gates({ G1: { pass: true, target: false }, G3: { pass: false, target: false } }))).why, /G3\.floor, which it does not declare/u);
  assert.equal(judgeCase(['G2.floor', 'G3.floor'], run(13, gates({ G2: { pass: false, target: false } }))).ok, false);
  assert.equal(judgeCase(['G2.floor', 'G3.floor'], run(13, gates({ G2: { pass: false, target: false }, G3: { pass: false, target: false } }))).ok, true);
  assert.match(judgeCase(['G5.floor'], run(13, gates({}))).why, /G5 was not measured/u);
  assert.match(judgeCase([], run(13, gates({}))).why, /declares no gate/u);
  assert.match(judgeCase(undefined, run(13, gates({}))).why, /declares no gate/u);
});

test('the painted recipe declares the feather-150 regression, G1.target only, and names look review', () => {
  const reg = JSON.parse(readFileSync(join(skill, 'recipes', 'painted-light', 'expected.json'), 'utf8')).regressions['feather-150'];
  assert.deepEqual(reg.mustFail, ['G1.target']);
  assert.deepEqual(reg.patch, { find: 'feather: 24,', replace: 'feather: 150,' });
  assert.match(reg.defect, /look review/u);
  assert.ok(readFileSync(join(skill, 'recipes', 'painted-light', 'index.html'), 'utf8').includes(reg.patch.find));
});

// The master pass only, encoded and gated on the decoded file (the negatives and recipe rows).
async function quickGate(dir, treatment) {
  const t = validateCoverTreatment(treatment).treatment;
  const work = temp('lgm-quick-');
  const frames = join(work, 'frames');
  mkdirSync(frames, { recursive: true });
  const pool = new CoverPool();
  try {
    // A 3D hero is captured where it renders: the GPU rung, software when the GPU has no WebGL.
    const page = await openCover({ dir, fonts: stageFonts(['JetBrains Mono']), width: t.page[0], height: t.page[1], scale: COVER.captureScale, profileRoot: work, rung: t.recipe === 'hero-3d' ? 'gpu' : 'software' });
    try { await capturePass({ page, pool, times: loopTimes(t.frames), dir: frames, width: t.out[0], height: t.out[1] }); } finally { await page.close(); }
  } finally { await pool.close(); }
  const files = readdirSync(frames).sort().map((f) => join(frames, f));
  return coverGate(encodeCover({ files, fps: t.fps, encode: t.encode, out: work }).file);
}

for (const name of NEGATIVES) {
  test(`C016: the shipped negative ${name} fails exactly its named gates`, { skip: NO_RENDER }, async () => {
    const expected = JSON.parse(readFileSync(join(skill, 'recipes', 'negatives', name, 'expected.json'), 'utf8'));
    const r = await quickGate(join(skill, 'recipes', 'negatives', name), coverTreatment(expected.treatment));
    const failed = Object.entries(r.gates).filter(([, g]) => g.pass === false).map(([k]) => k).sort();
    assert.deepEqual(failed, expected.mustFail.map((id) => id.replace(/\.floor$/u, '')), JSON.stringify(Object.fromEntries(Object.entries(r.gates).map(([k, g]) => [k, g.pass]))));
  });
}

for (const name of ['hero-3d', 'weight-tide', 'orbit-loop']) {
  test(`C017: the ${name} recipe still reaches TARGET on its decoded file`, { skip: NO_RENDER }, async () => {
    const expected = JSON.parse(readFileSync(join(skill, 'recipes', name, 'expected.json'), 'utf8'));
    const r = await quickGate(join(skill, 'recipes', name), expected.treatment);
    assert.equal(r.target, true, JSON.stringify({ medianD: r.medianD, movingFrac: r.movingFrac, seamLocal: r.seamLocal, spike: r.spike, bytes: r.bytes }));
  });
}

// ---- real renders ---------------------------------------------------------------------------------

test('C012: a loop with three speed layers reaches every TARGET gate on the decoded file, the seek-order check included', { skip: NO_RENDER }, () => {
  const out = coverRun('good');
  const r = cli(['cover', '--out', out, '--round', '1']);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /^COVER gate --strict: PASS\+TARGET$/mu);
  for (const file of ['cover.webp', 'poster.png', 'manifest.json', 'gate-report.txt', 'stills/sheet.png', 'stills/seam.png', 'stills/poster.png', 'stills/frame-11.png', 'stills/index.json']) assert.ok(existsSync(join(out, file)), file);
  const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.equal(manifest.mode, 'cover');
  assert.equal(manifest.gate.gates.G0.identical, 96);
  assert.ok(manifest.gate.gates.G5.min >= 4.5);
  assert.equal(manifest.gate.gates.G6.pass, true);
  assert.equal(manifest.gate.gates.FLASH.pass, true);
  assert.equal(parseWebp(readFileSync(join(out, 'cover.webp'))).loop, 0);
  assert.match(readFileSync(join(out, 'gate-report.txt'), 'utf8'), /^ {2}SEEK pass sampled=16 /mu);
  assert.equal(cli(['cover-gate', join(out, 'cover.webp'), '--strict']).status, 0);
  const gate = cli(['gate', '--out', out]);
  assert.equal(gate.status, EXIT.USAGE);
  assert.match(gate.stderr, /run cover-gate .*cover\.webp --strict/u);
});

test('C002: a window render sheets only frames inside [t0 - 0.5, t1 + 0.5] and never touches the delivered stills', { skip: NO_RENDER }, () => {
  const out = coverRun('good');
  const r = cli(['cover', '--out', out, '--round', '1', '--window', '2.0,2.5']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = join(out, 'windows', 'round-1', '2.000-2.500');
  const doc = JSON.parse(readFileSync(join(dir, 'window.json'), 'utf8'));
  assert.ok(doc.frames.length >= 8);
  for (const frame of doc.frames) assert.ok(frame.t >= 1.5 - 1e-9 && frame.t <= 3.0 + 1e-9, String(frame.t));
  assert.ok(existsSync(join(dir, 'sheet.png')));
  assert.equal(existsSync(join(out, 'stills')), false);
  assert.equal(existsSync(join(out, 'gate-report.txt')), false);
  assert.match(r.stdout, /a window render never counts as done/u);
});

test('C013: a page that keeps state between frames fails the seek-order check, naming the frame time (exit 18)', { skip: NO_RENDER }, () => {
  const r = cli(['cover', '--out', coverRun('trails'), '--round', '1']);
  assert.equal(r.status, EXIT.STAGE_NONDETERMINISTIC, r.stdout + r.stderr);
  assert.match(r.stderr, /STAGE_NONDETERMINISTIC: frame \d+ \(t = \d\.\d{3} s\) differs by up to \d+ levels when sought out of order/u);
});

test('a page that reads Math.random is exit 18 naming the call; a page without renderFrame is exit 17; a film treatment is exit 16', { skip: NO_RENDER }, () => {
  const random = cli(['cover', '--out', coverRun('random'), '--round', '1']);
  assert.equal(random.status, EXIT.STAGE_NONDETERMINISTIC, random.stdout + random.stderr);
  assert.match(random.stderr, /STAGE_NONDETERMINISTIC: the cover page called Math\.random/u);
  const none = cli(['cover', '--out', coverRun('no-render'), '--round', '1']);
  assert.equal(none.status, EXIT.STAGE_CONTRACT, none.stdout + none.stderr);
  assert.match(none.stderr, /defines no window\.renderFrame/u);
  const out = coverRun('good');
  writeFileSync(join(out, 'treatment.json'), JSON.stringify({ ...coverTreatment(), mode: undefined }));
  const film = cli(['cover', '--out', out]);
  assert.equal(film.status, EXIT.TREATMENT_INVALID, film.stdout + film.stderr);
  assert.match(film.stderr, /field=mode: this treatment is a film/u);
});

test('without libwebp or gifski on PATH a cover render stops with exit 21 before any frame', () => {
  const out = coverRun('good');
  const r = cli(['cover', '--out', out], { PATH: temp('lgm-no-path-') });
  assert.equal(r.status, EXIT.NO_COVER_ENCODER, r.stdout + r.stderr);
  assert.match(r.stderr, /BLOCKED_NO_COVER_ENCODER: install libwebp \(img2webp and dwebp\) or gifski; a cover is never an MP4/u);
  assert.equal(existsSync(join(out, '.run', 'cover')), false);
});

// ---- any machine can be the hero of the painted recipe -----------------------------------------------

// A seven-bay painting as a flat grey plate: every lit pixel reads 128, every dimmed one less.
const SEVEN = [[13, 217], [231, 435], [449, 653], [667, 872], [886, 1090], [1104, 1308], [1322, 1526]];
const LENSES = {
  0: [[68, 385, 16], [97, 373, 16], [61, 689, 16]],
  3: [[720, 350, 16], [712, 436, 14], [694, 680, 16]],
};
const PAINT_SCALE = 0.5859375;
function heroStage(hero, lenses) {
  const dir = temp('lgm-hero-');
  const html = readFileSync(join(skill, 'recipes', 'painted-light', 'index.html'), 'utf8');
  const painting = { src: 'assets/base.png', width: 1536, height: 1024, bays: SEVEN, top: 148, bottom: 945, hero, title: { box: [455, 32, 635, 88], level: 60 }, lenses, accent: { cx: 902, cy: 987, rx: 60, ry: 22 } };
  const page = html.replace(/^const PAINTING = \{[\s\S]*?^\};$/mu, `const PAINTING = ${JSON.stringify(painting)};`);
  assert.notEqual(page, html, 'the recipe keeps one `const PAINTING = { ... };` block');
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), page);
  // Opaque: an RGBA buffer filled with 128 would be half transparent and read about 66.
  writeFileSync(join(dir, 'assets', 'base.png'), encodePng(Buffer.alloc(1536 * 1024 * 3, 128), 1536, 1024, { channels: 3 }));
  return dir;
}
async function heroFrame0(hero, lenses) {
  const work = temp('lgm-hero-chrome-');
  const page = await openCover({ dir: heroStage(hero, lenses), fonts: stageFonts(['JetBrains Mono']), width: 1200, height: 600, scale: COVER.captureScale, profileRoot: work });
  try {
    await page.frame(0);
    return decodePng(await page.capture());
  } finally { await page.close(); }
}
// Mean luminance of a painting-pixel box in a device-scale capture of the 1200 x 600 page.
function boxLuma({ width, channels, pixels }, [x0, y0, x1, y1]) {
  const s = width / 1200;
  const X0 = Math.round((150 + x0 * PAINT_SCALE) * s), X1 = Math.round((150 + x1 * PAINT_SCALE) * s);
  const Y0 = Math.round(y0 * PAINT_SCALE * s), Y1 = Math.round(y1 * PAINT_SCALE * s);
  let sum = 0;
  for (let y = Y0; y < Y1; y += 1) for (let x = X0; x < X1; x += 1) { const o = (y * width + x) * channels; sum += 0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]; }
  return sum / ((X1 - X0) * (Y1 - Y0));
}
const bayLuma = (shot, [x0, x1]) => boxLuma(shot, [x0 + 40, 148 + 40, x1 - 40, 945 - 40]);
const lensLuma = (shot, [cx, cy]) => boxLuma(shot, [cx - 8, cy - 8, cx + 8, cy + 8]);

test('a middle hero (bay 3 of 7) stays as bright as the source at frame 0 while a sleeping bay is dimmed', { skip: NO_RENDER }, async () => {
  const shot = await heroFrame0(3, LENSES);
  const hero = bayLuma(shot, SEVEN[3]);
  const sleeper = bayLuma(shot, SEVEN[5]);
  assert.ok(hero >= 0.95 * 128, `hero bay luminance ${hero.toFixed(1)} against source 128`);
  assert.ok(sleeper < 0.6 * 128, `sleeping bay luminance ${sleeper.toFixed(1)} should sit under the dim pool`);
});

test('the lenses glow on the hero\'s own anchors, never on another machine', { skip: NO_RENDER }, async () => {
  const none = { 0: [], 3: [] };
  for (const hero of [0, 3]) {
    const lit = await heroFrame0(hero, LENSES);
    const dark = await heroFrame0(hero, none);
    const gain = (bay) => lensLuma(lit, LENSES[bay][0]) - lensLuma(dark, LENSES[bay][0]);
    assert.ok(gain(hero) > 15, `hero ${hero}: its own first lens adds ${gain(hero).toFixed(1)} levels`);
    assert.ok(Math.abs(gain(hero === 0 ? 3 : 0)) < 2, `hero ${hero}: the other machine's anchors must stay dark (${gain(hero === 0 ? 3 : 0).toFixed(1)})`);
  }
});

test('a hero declared with no lenses (an empty list) runs without beat lights', { skip: NO_RENDER }, async () => {
  const work = temp('lgm-hero-chrome-');
  const page = await openCover({ dir: heroStage(5, { ...LENSES, 5: [] }), fonts: stageFonts(['JetBrains Mono']), width: 1200, height: 600, scale: COVER.captureScale, profileRoot: work });
  try { await page.frame(0.25); } finally { await page.close(); }
});

test('a hero with no lens entry stops the page with a message naming the bay, instead of borrowing another machine\'s lenses', { skip: NO_RENDER }, async () => {
  const started = Date.now();
  await assert.rejects(
    openCover({ dir: heroStage(5, LENSES), fonts: stageFonts(['JetBrains Mono']), width: 1200, height: 600, scale: COVER.captureScale, profileRoot: temp('lgm-hero-chrome-') }),
    /STAGE_CONTRACT_ERROR: .*first page error: Error: PAINTING\.lenses has no entry for the hero bay 5/u,
  );
  assert.ok(Date.now() - started < 20000, `the contract error took ${Date.now() - started} ms; it must not wait out the 60 s ready deadline`);
});
