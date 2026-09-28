import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { resolveChrome, stageArgs, STAGE_FLAGS, KEYCHAIN_FLAGS, SWIFTSHADER_RUNG } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';
import { captureChecked, determinismSamples, rasterInfo, scanStage, stageFonts } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage.mjs';
import { openStage, resolveStagePath } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage-session.mjs';
import { geometryFor, PORTRAIT } from '../.grok/skills/lit-typographic-motion/scripts/lib/flash.mjs';
import { measureFrame } from '../.grok/skills/lit-typographic-motion/scripts/lib/frame-pool.mjs';
import { encodePng } from '../.grok/skills/lit-typographic-motion/scripts/lib/png.mjs';

// A Chrome helper can flush its profile for a moment after the browser exits; teardown retries and
// never masks the test's own assertion.
const cleanup = (dir) => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 }); } catch { /* reported by the leak check */ } };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const motion = join(root, '.grok/skills/lit-typographic-motion/scripts/motion.mjs');
const fixtures = join(root, 'test/fixtures/motion/stage');
const CHROME = resolveChrome(process.env);
const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
const NO_CHROME = CHROME ? false : 'Chrome/Chromium not found; set CHROME_PATH to run the stage checks';
const NO_TOOLS = CHROME && FFMPEG ? false : 'Chrome and ffmpeg are needed for full stage renders';
const CACHE = mkdtempSync(join(tmpdir(), 'lgm-stage-cache-'));

function stageTreatment({ format = '16:9', fps = 30, duration = 4, lines = ['시계만 움직인다'], sound = { mode: 'none', plan: 'silent by request' } } = {}) {
  const request = sound.mode === 'none' ? '작은 도형이 움직이는 영상 만들어줘, 소리 없이 lit' : '작은 도형이 움직이는 영상 만들어줘 lit';
  return {
    request, genre: 'other', path: 'stage', pathReason: 'The film draws shapes that move, not only words.',
    idea: 'A few plain shapes keep time with each other until they settle.', audience: 'Test viewers', channel: 'Local playback',
    format, formatReason: 'Local playback fits this frame.', durationSec: duration, fps,
    beats: [[0, 1.3], [1.3, 2.6], [2.6, duration]].map(([t0, t1], i) => ({ t0, t1, purpose: ['open', 'develop', 'land'][i], onScreen: 'the moving shapes', motion: 'steady motion', sound: 'pad' })),
    subject: { name: '도형', source: 'user', specifics: [] },
    visualDevices: [{ kind: 'shape', role: 'subject', beats: [0, 1, 2] }, { kind: 'path', role: 'support', beats: [1] }],
    typePlan: { faces: ['Archivo', 'Pretendard'], hierarchy: 'one line', maxWordsOnScreen: 4 },
    palette: [{ hex: '#101418', role: 'ground' }, { hex: '#F4F1EA', role: 'type' }, { hex: '#2BB3A3', role: 'shape' }],
    sound, copy: { source: 'invented', lines }, inventions: ['every copy line'], ambition: 'Plain, exact motion that repeats identically on every render.',
  };
}

function prepare(fixture, treatment = stageTreatment()) {
  const work = mkdtempSync(join(tmpdir(), `lgm-stage-${fixture}-`));
  const out = join(work, 'out');
  mkdirSync(out, { recursive: true });
  cpSync(join(fixtures, fixture), join(out, 'stage'), { recursive: true });
  writeFileSync(join(out, 'treatment.json'), JSON.stringify(treatment));
  return { work, out };
}

function stage(out, extra = []) {
  return spawnSync(process.execPath, [motion, 'stage', '--out', out, ...extra], { encoding: 'utf8', env: { ...process.env, LITGROK_MOTION_CACHE: CACHE }, timeout: 600000 });
}

test('the stage launch uses the software rung, every section 6d flag and the keychain flags', () => {
  const args = stageArgs({ profileDir: '/p', width: 1080, height: 1920 });
  for (const flag of [...SWIFTSHADER_RUNG, ...KEYCHAIN_FLAGS, ...STAGE_FLAGS, '--window-size=1080,1920', '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE lit.stage', '--headless=new', '--remote-debugging-pipe']) assert.ok(args.includes(flag), flag);
  for (const flag of ['--run-all-compositor-stages-before-draw', '--disable-checker-imaging', '--disable-new-content-rendering-timeout', '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-image-animation-resync', '--disable-lcd-text', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings', '--metrics-recording-only']) assert.ok(args.includes(flag), flag);
  assert.ok(!args.some((arg) => /--deterministic-mode|--use-angle=metal|--enable-gpu-rasterization/.test(arg)), 'no GPU rung and no headless-shell flags on the stage path');
});

test('serving refuses traversal, escaping symlinks and unknown types, and serves stage files', () => {
  const work = mkdtempSync(join(tmpdir(), 'lgm-serve-'));
  try {
    mkdirSync(join(work, 'stage'));
    writeFileSync(join(work, 'stage', 'index.html'), '<!doctype html>');
    writeFileSync(join(work, 'secret.txt'), 'outside');
    writeFileSync(join(work, 'stage', 'notes.txt'), 'not served');
    symlinkSync(join(work, 'secret.txt'), join(work, 'stage', 'link.html'));
    assert.ok(resolveStagePath(join(work, 'stage'), '/index.html').file);
    assert.match(resolveStagePath(join(work, 'stage'), '/..%2fsecret.txt').refused, /path traversal/);
    assert.match(resolveStagePath(join(work, 'stage'), '/link.html').refused, /symlink escapes/);
    assert.match(resolveStagePath(join(work, 'stage'), '/notes.txt').refused, /not served/);
    assert.ok(resolveStagePath(join(work, 'stage'), '/missing.png').missing);
  } finally { cleanup(work); }
});

test('the static scan catches forbidden elements, network URLs, flipbooks and animated rasters', () => {
  const work = mkdtempSync(join(tmpdir(), 'lgm-scan-'));
  const dir = join(work, 'stage');
  try {
    mkdirSync(dir);
    writeFileSync(join(dir, 'index.html'), '<svg xmlns="http://www.w3.org/2000/svg"></svg><script>document.createElementNS("http://www.w3.org/2000/svg", "g")</script>');
    assert.deepEqual(scanStage(dir).network, [], 'namespace URIs are not network requests');
    writeFileSync(join(dir, 'index.html'), '<link rel="preconnect" href="/x"><img src="//cdn.example.org/a.png">');
    const net = scanStage(dir).network;
    assert.ok(net.some((line) => /cdn\.example\.org/.test(line)) && net.some((line) => /preconnect/.test(line)), net.join('; '));
    writeFileSync(join(dir, 'index.html'), '<video src="a.mp4"></video>');
    assert.match(scanStage(dir).contract[0], /<video>/);
    writeFileSync(join(dir, 'index.html'), '<p>ok</p>');
    const tiny = encodePng(Buffer.alloc(4 * 4 * 4, 200), 4, 4);
    for (let i = 0; i < 10; i += 1) writeFileSync(join(dir, `f${i}.png`), tiny);
    assert.match(scanStage(dir).contract.join('; '), /flipbook/);
    for (let i = 0; i < 10; i += 1) rmSync(join(dir, `f${i}.png`));
    const idat = tiny.indexOf(Buffer.from('IDAT')) - 4;
    const actl = Buffer.concat([Buffer.from([0, 0, 0, 8]), Buffer.from('acTL'), Buffer.alloc(8), Buffer.alloc(4)]);
    writeFileSync(join(dir, 'moving.png'), Buffer.concat([tiny.subarray(0, idat), actl, tiny.subarray(idat)]));
    assert.equal(rasterInfo(readFileSync(join(dir, 'moving.png')), '.png').animated, true);
    assert.match(scanStage(dir).contract.join('; '), /animated raster/);
  } finally { cleanup(work); }
});

test('determinism samples: 8 to 16 frames, frame 0, the last frame and each beat start', () => {
  const beats = stageTreatment().beats;
  const samples = determinismSamples(beats, 30, 120);
  assert.ok(samples.length >= 8 && samples.length <= 16, samples.join(','));
  for (const f of [0, 119, 39, 78]) assert.ok(samples.includes(f), `${f} sampled`);
  const many = Array.from({ length: 30 }, (_, i) => ({ t0: i * 2, t1: i * 2 + 2 }));
  assert.equal(determinismSamples(many, 60, 3600).length, 16);
});

test('a capture of the wrong size is a stage contract error (exit 17)', async () => {
  const png = encodePng(Buffer.alloc(8 * 8 * 4, 9), 8, 8);
  await assert.rejects(captureChecked({ capture: async () => png }, 1920, 1080), (error) => error.code === 17 && /decoded to 8x8, not 1920x1080/.test(error.message));
});

describe('stage exits before rendering', { concurrency: 4 }, () => {
  const cases = [
    ['external-url', 19, /STAGE_NETWORK_REQUEST[^\n]*fonts\.example\.org/],
    ['runtime-fetch', 19, /STAGE_NETWORK_REQUEST[^\n]*example\.org/],
    ['websocket', 19, /STAGE_NETWORK_REQUEST[^\n]*WebSocket/],
    ['forbidden-element', 17, /STAGE_CONTRACT_ERROR[^\n]*<video>/],
    ['forbidden-api', 17, /STAGE_CONTRACT_ERROR[^\n]*AudioContext/],
    ['traversal', 17, /STAGE_CONTRACT_ERROR[^\n]*path traversal/],
  ];
  for (const [fixture, code, message] of cases) {
    test(`${fixture} exits ${code}`, { skip: fixture === 'external-url' ? false : NO_CHROME }, () => {
      const { work, out } = prepare(fixture);
      try {
        const result = stage(out, ['--stills-only']);
        assert.equal(result.status, code, result.stdout + result.stderr);
        assert.match(result.stderr, message);
        assert.equal(JSON.parse(readFileSync(join(out, '.run', 'run.json'), 'utf8')).exitCode, code);
      } finally { cleanup(work); }
    });
  }
  test('a missing treatment exits 16 and a missing page exits 17', () => {
    const { work, out } = prepare('clock');
    try {
      rmSync(join(out, 'treatment.json'));
      assert.equal(stage(out).status, 16);
      writeFileSync(join(out, 'treatment.json'), JSON.stringify(stageTreatment()));
      rmSync(join(out, 'stage', 'index.html'));
      const missing = stage(out, ['--stills-only']);
      assert.equal(missing.status, 17, missing.stderr);
      assert.match(missing.stderr, /stage\/index\.html is missing/);
    } finally { cleanup(work); }
  });
  test('no Chrome exits 10', () => {
    const { work, out } = prepare('clock');
    try {
      const result = spawnSync(process.execPath, [motion, 'stage', '--out', out, '--stills-only'], { encoding: 'utf8', env: { ...process.env, LITGROK_MOTION_CACHE: CACHE, CHROME_PATH: join(work, 'no-chrome') } });
      assert.equal(result.status, 10, result.stderr);
    } finally { cleanup(work); }
  });
});

// Frame-level clock checks drive a stage session directly: step sequentially, capture chosen frames.
async function framesAt(fixture, frames, { width = 1920, height = 1080, fps = 60 } = {}) {
  const { work, out } = prepare(fixture);
  const session = await openStage({ executable: CHROME, outDir: out, stageDir: join(out, 'stage'), width, height, fps, seed: 7, fonts: stageFonts([], { ...process.env, LITGROK_MOTION_CACHE: CACHE }) });
  try {
    await session.load();
    const shots = {};
    for (let f = 0; f <= Math.max(...frames); f += 1) {
      await session.step(f, fps);
      if (frames.includes(f)) shots[f] = measureFrame(await session.capture(), { flash: false });
    }
    return shots;
  } finally { await session.close(); cleanup(work); }
}
const pixel = (shot, x, y) => Array.from(shot.rgba.subarray((y * shot.width + x) * 4, (y * shot.width + x) * 4 + 3));

test('a CSS transition started at 2 s reads its expected colour at 2.1 s', { skip: NO_CHROME }, async () => {
  const shots = await framesAt('transition', [119, 126, 150]);
  assert.deepEqual(pixel(shots[119], 200, 200), [0, 0, 0], 'still black before the class change');
  const [r] = pixel(shots[126], 200, 200);
  assert.ok(Math.abs(r - 25.5) <= 3, `10 % into a 1 s linear transition, got ${r}`);
  const [r2] = pixel(shots[150], 200, 200);
  assert.ok(Math.abs(r2 - 127.5) <= 3, `50 % at 2.5 s, got ${r2}`);
});

test('a WAAPI finished.then chain visibly continues on the virtual clock', { skip: NO_CHROME }, async () => {
  const shots = await framesAt('waapi', [20, 29, 60, 90]);
  const fade = pixel(shots[20], 100, 100)[0];
  assert.ok(fade > 0 && fade < 255, `the first animation is mid-fade at 0.33 s (${fade})`);
  assert.equal(pixel(shots[29], 700, 500)[0], 255, 'the second box is at rest before 0.5 s');
  assert.equal(pixel(shots[60], 700, 500)[0], 0, 'at 1.0 s the chained animation has moved the box');
  assert.equal(pixel(shots[60], 1100, 500)[0], 255, 'halfway along its 800 px path');
  assert.equal(pixel(shots[90], 1500, 500)[0], 255, 'at 1.5 s the chain has finished at 800 px');
  assert.equal(pixel(shots[90], 1100, 500)[0], 0);
});

describe('full stage renders', { concurrency: 3 }, () => {
  for (const fixture of ['clock', 'effects', 'layer']) {
    test(`GREEN: the ${fixture} page renders and replays identically`, { skip: NO_TOOLS }, () => {
      const { work, out } = prepare(fixture, stageTreatment({ lines: { clock: ['시계만 움직인다'], effects: [], layer: ['그림자'] }[fixture] }));
      try {
        const result = stage(out, ['--round', '2']);
        const report = existsSync(join(out, 'gate-report.txt')) ? readFileSync(join(out, 'gate-report.txt'), 'utf8') : '';
        assert.match(report, /MO-C-09:\s+PASS/, result.stderr + report);
        assert.ok(existsSync(join(out, 'film.mp4')));
      } finally { cleanup(work); }
    });
  }
  for (const fixture of ['wallclock', 'random']) {
    test(`RED: the ${fixture} page is nondeterministic (exit 18 names the frame)`, { skip: NO_TOOLS }, () => {
      const { work, out } = prepare(fixture, stageTreatment({ lines: [] }));
      try {
        const result = stage(out, ['--round', '2']);
        assert.equal(result.status, 18, result.stdout + result.stderr);
        assert.match(result.stderr, /STAGE_NONDETERMINISTIC: frame \d+ differs on replay in x \d+-\d+, y \d+-\d+/);
      } finally { cleanup(work); }
    });
  }
  test('a 1080x1920 kit film: portrait size, portrait flash grid, a muxed generated bed', { skip: NO_TOOLS }, () => {
    const { work, out } = prepare('portrait', stageTreatment({ format: '9:16', lines: ['세로로 서는 모양'], sound: { mode: 'generated', plan: 'a soft pulse under the morph', palette: 'glass' } }));
    try {
      const result = stage(out, ['--round', '2']);
      assert.ok([0, 13].includes(result.status), result.stdout + result.stderr);
      const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-of', 'json', join(out, 'film.mp4')], { encoding: 'utf8' }).stdout);
      const video = probe.streams.find((s) => s.codec_type === 'video');
      assert.deepEqual([video.width, video.height], [1080, 1920]);
      assert.ok(probe.streams.some((s) => s.codec_type === 'audio'), 'the generated bed is muxed');
      assert.deepEqual(geometryFor(1080, 1920), PORTRAIT);
      assert.deepEqual([PORTRAIT.gridW, PORTRAIT.gridH, PORTRAIT.windowW, PORTRAIT.windowH], [180, 320, 60, 107]);
      const index = JSON.parse(readFileSync(join(out, 'stills', 'index.json'), 'utf8'));
      assert.equal(index.format, '1080x1920');
      assert.ok(index.stills.some((s) => s.kind === 'poster'));
      assert.match(readFileSync(join(out, 'gate-report.txt'), 'utf8'), /SOUND:\s+PASS/);
    } finally { cleanup(work); }
  });
});

test.after(() => rmSync(CACHE, { recursive: true, force: true }));
