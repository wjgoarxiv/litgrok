import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, test } from 'node:test';
import { resolveChrome } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';
import { CLIP_LIMITS } from '../.grok/skills/lit-typographic-motion/scripts/lib/constants.mjs';
import { clipsScript, scanClips } from '../.grok/skills/lit-typographic-motion/scripts/lib/clips.mjs';
import { measureFrame } from '../.grok/skills/lit-typographic-motion/scripts/lib/frame-pool.mjs';
import { encodePng } from '../.grok/skills/lit-typographic-motion/scripts/lib/png.mjs';
import { scanStage, stageFonts } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage.mjs';
import { openStage } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage-session.mjs';

// Declared keyed overlay clips on the stage path (references/stage.md, Clips): frames inside a
// declared clip folder leave the flipbook and count rule, every other raster keeps its limits.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = join(root, '.grok/skills/lit-typographic-motion');
const motion = join(skill, 'scripts/motion.mjs');
const fixtures = join(root, 'test/fixtures/motion/stage');
const CHROME = resolveChrome(process.env);
const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;
const NO_CHROME = CHROME ? false : 'Chrome/Chromium not found; set CHROME_PATH to run the stage checks';
const NO_TOOLS = CHROME && FFMPEG ? false : 'Chrome and ffmpeg are needed for full stage renders';
const CACHE = mkdtempSync(join(tmpdir(), 'lgm-clips-cache-'));
const temps = [CACHE];
const temp = (prefix) => { const d = mkdtempSync(join(tmpdir(), prefix)); temps.push(d); return d; };
test.after(() => { for (const d of temps) { try { rmSync(d, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 }); } catch { /* reported by the leak check */ } } });

const PAGE = '<!doctype html><title>clips</title>';
const frameName = (i) => `frame_${String(i).padStart(4, '0')}.png`;
/** An RGBA frame whose first pixel is transparent (a keyed clip); `opaque` makes it solid. */
const rgba = (w, h, { opaque = false, shade = 90 } = {}) => {
  const px = Buffer.alloc(w * h * 4, shade);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  if (!opaque) px[3] = 0;
  return encodePng(px, w, h, { channels: 4 });
};

/** A stage dir: index.html, clips/<dir>/frame_NNNN.png per clip, and clips/clips.json. */
function stageWith(clips, { declare = clips, extra = () => {} } = {}) {
  const stage = join(temp('lgm-clips-'), 'stage');
  mkdirSync(join(stage, 'clips'), { recursive: true });
  writeFileSync(join(stage, 'index.html'), PAGE);
  for (const c of clips) {
    mkdirSync(join(stage, 'clips', c.dir), { recursive: true });
    const png = c.png ?? rgba(c.w ?? 8, c.h ?? 6);
    for (let i = 1; i <= (c.files ?? c.count); i += 1) writeFileSync(join(stage, 'clips', c.dir, frameName(i)), png);
  }
  writeFileSync(join(stage, 'clips', 'clips.json'), JSON.stringify({ clips: declare.map(({ id, dir, count, fps }) => ({ id, dir, count, fps })) }));
  extra(stage);
  return stage;
}
const A = { id: 'boom', dir: '01-boom', count: 12, fps: 30 };
const B = { id: 'cat', dir: '10-cat', count: 30, fps: 30 };

describe('declared clips in the static scan', () => {
  test('a declared clip set leaves the flipbook and count rule and is listed in the scan', () => {
    const scan = scanStage(stageWith([A, B]));
    assert.deepEqual(scan.contract, []);
    assert.equal(scan.rasters.length, 0, 'clip frames are not page rasters');
    assert.deepEqual(scan.clips.map((c) => [c.id, c.count, c.fps, c.width, c.height]), [['boom', 12, 30, 8, 6], ['cat', 30, 30, 8, 6]]);
    assert.ok(scan.clips.every((c) => c.bytes > 0));
  });

  test('an undeclared frame sequence is still a flipbook, also beside a declared clip', () => {
    const stage = stageWith([A], { extra: (dir) => {
      mkdirSync(join(dir, 'flip'));
      for (let i = 1; i <= 12; i += 1) writeFileSync(join(dir, 'flip', frameName(i)), rgba(8, 6));
    } });
    assert.match(scanStage(stage).contract.join('; '), /flipbook/);
  });

  test('a clip folder missing from clips.json is a flipbook, and no clips.json keeps the old limits', () => {
    assert.match(scanStage(stageWith([A], { declare: [] })).contract.join('; '), /flipbook/);
    const stage = stageWith([A]);
    rmSync(join(stage, 'clips', 'clips.json'));
    assert.match(scanStage(stage).contract.join('; '), /flipbook/);
  });

  test('cover mode takes no clips', () => {
    assert.match(scanStage(stageWith([A]), { clips: false }).contract.join('; '), /flipbook/);
  });

  const refused = [
    ['more frames than a clip may have', { ...A, count: 361 }, /clip "boom".*361 frames/],
    ['a frame missing from the run', { ...A, files: 11 }, /frame_0012\.png/],
    ['a stray frame beyond the declared count', { ...A, files: 13 }, /frame_0013\.png/],
    ['opaque RGB frames (not keyed)', { ...A, png: encodePng(Buffer.alloc(8 * 6 * 3, 90), 8, 6, { channels: 3 }) }, /RGBA/],
    ['RGBA frames with no transparent pixel', { ...A, png: rgba(8, 6, { opaque: true }) }, /transparent/],
    ['a frame larger than the overlay cap', { ...A, w: 721, h: 20 }, /clip "boom".*721/],
    ['frames of mixed sizes', { ...A, mixed: true }, /one size per clip/],
    ['a frame rate above 30', { ...A, fps: 60 }, /fps/],
    ['an id that is not a plain token', { ...A, id: 'a b' }, /id/],
  ];
  for (const [name, clip, message] of refused) {
    test(`refuses ${name}, named in the first contract line`, () => {
      const stage = stageWith([clip], { extra: (dir) => { if (clip.mixed) writeFileSync(join(dir, 'clips', clip.dir, frameName(5)), rgba(9, 6)); } });
      const scan = scanStage(stage);
      assert.ok(scan.contract.length > 0, 'the scan must refuse it');
      assert.match(scan.contract[0], message);
    });
  }

  test('refuses a folder name that climbs out, a duplicate id, malformed clips.json and more than 12 clips', () => {
    const climb = stageWith([{ ...A, dir: 'x' }]);
    writeFileSync(join(climb, 'clips', 'clips.json'), JSON.stringify({ clips: [{ id: 'boom', dir: '..', count: 12, fps: 30 }] }));
    assert.match(scanStage(climb).contract[0], /dir/);
    assert.match(scanStage(stageWith([A, { ...B, dir: 'other', id: 'boom' }])).contract[0], /duplicate.*boom/);
    const bad = stageWith([A]);
    writeFileSync(join(bad, 'clips', 'clips.json'), '{ not json');
    assert.match(scanStage(bad).contract[0], /clips\.json/);
    const many = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, dir: `d${i}`, count: 2, fps: 30 }));
    assert.match(scanStage(stageWith(many)).contract[0], /at most 12 clips/);
  });

  test('holds per-clip and total bytes and frames to the exported caps', () => {
    assert.deepEqual(Object.keys(CLIP_LIMITS).sort(), ['bytesPerClip', 'bytesTotal', 'clips', 'fps', 'framesPerClip', 'framesTotal', 'side']);
    assert.deepEqual([CLIP_LIMITS.clips, CLIP_LIMITS.framesPerClip, CLIP_LIMITS.framesTotal, CLIP_LIMITS.side, CLIP_LIMITS.fps], [12, 360, 1500, 720, 30]);
    assert.deepEqual([CLIP_LIMITS.bytesPerClip, CLIP_LIMITS.bytesTotal], [40 * 1024 * 1024, 128 * 1024 * 1024]);
    const stage = stageWith([A, B]);
    const problem = (limits) => { try { scanClips(stage, { limits: { ...CLIP_LIMITS, ...limits } }); return null; } catch (error) { return error.message; } };
    assert.equal(problem({}), null);
    assert.match(problem({ bytesPerClip: 100 }), /per clip/);
    assert.match(problem({ bytesTotal: 100 }), /in all/);
    assert.match(problem({ framesTotal: 41 }), /in all/);
  });

  test('the stage command exits 17 with the clip named, before any browser starts', () => {
    const out = join(temp('lgm-clips-cli-'), 'out');
    mkdirSync(out, { recursive: true });
    cpSync(stageWith([{ ...A, png: rgba(8, 6, { opaque: true }) }]), join(out, 'stage'), { recursive: true });
    cpSync(join(root, 'test/fixtures/motion/treatment-stage.json'), join(out, 'treatment.json'));
    const run = spawnSync(process.execPath, [motion, 'stage', '--out', out, '--stills-only'], { encoding: 'utf8', env: { ...process.env, LITGROK_MOTION_CACHE: CACHE } });
    assert.equal(run.status, 17, run.stdout + run.stderr);
    assert.match(run.stderr, /STAGE_CONTRACT_ERROR: .*clip "boom"/);
  });
});

describe('serving the declaration', () => {
  test('clipsScript writes window.LitClips from clips.json and the first frame header, and is null without clips', () => {
    const sandbox = { window: {} };
    vm.runInNewContext(clipsScript(stageWith([A])), sandbox);
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.window.LitClips)), { boom: { src: 'clips/01-boom', count: 12, fps: 30, width: 8, height: 6 } });
    assert.equal(clipsScript(join(temp('lgm-noclips-'), 'stage')), null);
  });
});

describe('LitStage.overlay picks the frame from film time alone', () => {
  const source = readFileSync(join(skill, 'scripts/stage/stage-kit.js'), 'utf8');
  /** The kit over a bare window with a tiny DOM: elements remember their children and style. */
  const setup = (clips) => {
    const element = (tag) => ({ tag, style: {}, children: [], attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, append(c) { this.children.push(c); c.parent = this; }, replaceWith(n) { this.parent.children[this.parent.children.indexOf(this)] = n; n.parent = this.parent; } });
    const document = { createElement: element };
    const window = { LitClips: clips, document };
    vm.runInNewContext(source, { window, Intl, Math, Number, String, Array, Object, Error, TypeError, JSON, isFinite, parseInt, parseFloat });
    const parent = element('div');
    parent.ownerDocument = document;
    return { LitStage: window.LitStage, parent };
  };
  const data = { boom: { src: 'clips/01-boom', count: 12, fps: 30, width: 520, height: 511 } };
  const box = { x: 10, y: 20, w: 300, h: 300 };
  const shown = (parent) => parent.children[0].children[0]?.src;

  test('maps film time to a 1-based frame: floor((t - start) * fps) + 1', () => {
    const { LitStage, parent } = setup(data);
    const show = LitStage.overlay({ parent, id: 'boom', box });
    assert.equal(show(1.0, { start: 1.0 }), parent.children[0]);
    assert.match(shown(parent), /clips\/01-boom\/frame_0001\.png$/);
    show(1.0 + 4 / 30, { start: 1.0 });
    assert.match(shown(parent), /frame_0005\.png$/);
    show(1.0 + 11 / 30, { start: 1.0 });
    assert.match(shown(parent), /frame_0012\.png$/);
  });

  test('is hidden before its cue and after its last frame unless it loops or holds', () => {
    const { LitStage, parent } = setup(data);
    const show = LitStage.overlay({ parent, id: 'boom', box });
    assert.equal(show(0.5, { start: 1.0 }), null, 'before the cue');
    assert.equal(parent.children[0].style.display, 'none');
    assert.equal(show(1.0 + 12 / 30, { start: 1.0 }), null, 'past the last frame');
    show(1.0 + 13 / 30, { start: 1.0, hold: true });
    assert.match(shown(parent), /frame_0012\.png$/, 'hold keeps the last frame');
    show(1.0 + 13 / 30, { start: 1.0, loop: true });
    assert.match(shown(parent), /frame_0002\.png$/, 'loop wraps by frame index');
  });

  test('plays a frame range and gives the same frame for the same t in any order', () => {
    const { LitStage, parent } = setup(data);
    const show = LitStage.overlay({ parent, id: 'boom', box });
    const opts = { start: 0, from: 4, to: 6 };
    show(2 / 30, opts);
    assert.match(shown(parent), /frame_0006\.png$/);
    assert.equal(show(3 / 30, opts), null, 'past the range');
    show(0, opts);
    assert.match(shown(parent), /frame_0004\.png$/);
    show(2 / 30, opts);
    assert.match(shown(parent), /frame_0006\.png$/, 'same t, same frame');
  });

  test('keeps one wrapper at the box, and refuses an unknown clip, a bad range or a missing script', () => {
    const { LitStage, parent } = setup(data);
    const show = LitStage.overlay({ parent, id: 'boom', box });
    show(0, { start: 0 });
    show(0.1, { start: 0 });
    assert.equal(parent.children.length, 1, 'one wrapper, never one per frame');
    const style = parent.children[0].style;
    assert.deepEqual([style.left, style.top, style.width, style.height], ['10px', '20px', '300px', '300px']);
    assert.throws(() => show(0, { start: 0, from: 0 }), /from\.\.to/);
    assert.throws(() => LitStage.overlay({ parent, id: 'nope', box }), /nope/);
    assert.throws(() => setup(undefined).LitStage.overlay({ parent, id: 'boom', box }), /clips\.js/);
  });

  test('the kit keeps its inset-reveal LitStage.clip untouched', () => {
    const { LitStage } = setup(data);
    assert.equal(typeof LitStage.clip, 'function');
    assert.equal(typeof LitStage.circle, 'function');
  });
});

describe('a declared clip on the real stage', () => {
  const swatchRun = () => {
    const out = join(temp('lgm-clip-render-'), 'out');
    mkdirSync(join(out, 'stage', 'clips', 'swatch'), { recursive: true });
    cpSync(join(fixtures, 'clip-overlay', 'index.html'), join(out, 'stage', 'index.html'));
    for (let k = 1; k <= 8; k += 1) {
      const px = Buffer.alloc(8 * 6 * 4);
      for (let i = 0; i < px.length; i += 4) px.set([20 * k, 0, 0, 255], i);
      px[3] = 0;
      writeFileSync(join(out, 'stage', 'clips', 'swatch', frameName(k)), encodePng(px, 8, 6, { channels: 4 }));
    }
    writeFileSync(join(out, 'stage', 'clips', 'clips.json'), JSON.stringify({ clips: [{ id: 'swatch', dir: 'swatch', count: 8, fps: 30 }] }));
    return out;
  };
  const capture = async (frames) => {
    const out = swatchRun();
    const session = await openStage({ executable: CHROME, outDir: out, stageDir: join(out, 'stage'), width: 1920, height: 1080, fps: 60, seed: 7, fonts: stageFonts([], { ...process.env, LITGROK_MOTION_CACHE: CACHE }) });
    try {
      await session.load();
      const shots = {};
      for (let f = 0; f <= Math.max(...frames); f += 1) {
        await session.step(f, 60);
        if (frames.includes(f)) shots[f] = measureFrame(await session.capture(), { flash: false });
      }
      assert.deepEqual([...session.network, ...session.refused], [], 'the page needs nothing outside its own files');
      return shots;
    } finally { await session.close(); }
  };
  const centre = (shot) => Array.from(shot.rgba.subarray((450 * shot.width + 800) * 4, (450 * shot.width + 800) * 4 + 3));
  const near = (got, want) => got.every((v, i) => Math.abs(v - want[i]) <= 3);

  test('shows the frame film time picks, hidden before the cue, held after the last frame, the same on a second capture', { skip: NO_CHROME }, async () => {
    const frames = [54, 60, 70, 85, 100];
    const first = await capture(frames);
    const second = await capture(frames);
    assert.ok(near(centre(first[54]), [0, 0, 0]), `t = 0.9 s is before the cue: ${centre(first[54])}`);
    assert.ok(near(centre(first[60]), [20, 0, 0]), `t = 1.0 s is clip frame 1: ${centre(first[60])}`);
    assert.ok(near(centre(first[70]), [120, 0, 0]), `t = 1 + 5/30 s is clip frame 6: ${centre(first[70])}`);
    assert.ok(near(centre(first[85]), [160, 0, 0]), `t = 1.417 s holds frame 8, the last one: ${centre(first[85])}`);
    assert.ok(near(centre(first[100]), [0, 0, 0]), `t = 1.667 s: the page faded the held clip out: ${centre(first[100])}`);
    for (const f of frames) assert.deepEqual(centre(first[f]), centre(second[f]), `frame ${f} is identical in a fresh browser`);
  });

  test('a clip does not slip past the flash audit: a full-frame white/black clip fails MO-C-03 and withholds the film', { skip: NO_TOOLS }, () => {
    const out = join(temp('lgm-clip-strobe-'), 'out');
    mkdirSync(join(out, 'stage', 'clips', 'strobe'), { recursive: true });
    cpSync(join(fixtures, 'clip-strobe', 'index.html'), join(out, 'stage', 'index.html'));
    for (let k = 1; k <= 6; k += 1) {
      const px = Buffer.alloc(16 * 9 * 4, k % 2 ? 255 : 0);
      px[3] = 0;
      for (let i = 7; i < px.length; i += 4) px[i] = 255;
      writeFileSync(join(out, 'stage', 'clips', 'strobe', frameName(k)), encodePng(px, 16, 9, { channels: 4 }));
    }
    writeFileSync(join(out, 'stage', 'clips', 'clips.json'), JSON.stringify({ clips: [{ id: 'strobe', dir: 'strobe', count: 6, fps: 30 }] }));
    const treatment = JSON.parse(readFileSync(join(root, 'test/fixtures/motion/treatment-stage.json'), 'utf8'));
    treatment.copy = { ...treatment.copy, lines: [] };
    writeFileSync(join(out, 'treatment.json'), JSON.stringify(treatment));
    const run = spawnSync(process.execPath, [motion, 'stage', '--out', out, '--round', '2'], { encoding: 'utf8', timeout: 600000, env: { ...process.env, LITGROK_MOTION_CACHE: CACHE } });
    assert.equal(run.status, 13, run.stdout + run.stderr);
    assert.match(readFileSync(join(out, 'gate-report.txt'), 'utf8'), /MO-C-03:\s+FAIL/);
    assert.equal(existsSync(join(out, 'film.mp4')), false, 'a flash-audit FAIL withholds the film');
  });
});

describe('the skill documents clips', () => {
  const stageDoc = readFileSync(join(skill, 'references/stage.md'), 'utf8');
  test('references/stage.md explains the declaration, the page API, the cue rule and the limits', () => {
    for (const needle of ['## Clips', 'clips/clips.json', '/lit/clips.js', 'LitStage.overlay', '(t - start) * fps', '12 clips', '360 frames', '1500', '40 MB', '128 MB', '720 px', 'Cover mode takes no clips', 'exit 17']) assert.ok(stageDoc.includes(needle), needle);
  });
});
