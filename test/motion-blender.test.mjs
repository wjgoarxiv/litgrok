// The offline Blender rung: headless Cycles through the bundled runner, preview stills then the
// final plate, with a named fallback when Blender is not installed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLENDER, blenderArgs, blenderCommand, readPlate, runBlender } from '../.grok/skills/lit-typographic-motion/scripts/lib/blender.mjs';
import { encodePng } from '../.grok/skills/lit-typographic-motion/scripts/lib/png.mjs';
import { scanStage } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage.mjs';
import { validateTreatment } from '../.grok/skills/lit-typographic-motion/scripts/lib/treatment.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const motion = join(root, '.grok/skills/lit-typographic-motion/scripts/motion.mjs');

// A minimal valid Blender film: depth 3d with a depth3d subject, minimal register, generated sound.
const treatment = (over = {}) => ({
  request: 'A short film where a teal block of geometry turns to face the viewer, path traced in 3D',
  idea: 'A rotating teal shape settles in a dark volume.',
  register: 'minimal',
  genre: 'other', path: 'stage', pathReason: 'The film draws a 3D world behind its words.',
  audience: 'Test viewers', channel: 'Local playback',
  format: '16:9', formatReason: 'Local playback is landscape.', durationSec: 4, fps: 30,
  beats: [
    { t0: 0, t1: 1.3, purpose: 'open', onScreen: 'the block', motion: 'turning', sound: 'quiet' },
    { t0: 1.3, t1: 2.6, purpose: 'develop', onScreen: 'the block', motion: 'turning', sound: 'a rising sweep' },
    { t0: 2.6, t1: 4, purpose: 'land', onScreen: 'the block', motion: 'settling', sound: 'a closing hit' },
  ],
  story: { expect: 'A clock face runs.', turn: 'A block turns instead.', beat: 1, payoff: 'The block settles facing front.' },
  protagonist: { name: 'block', kind: 'object', look: 'A teal block, fist-sized in frame.', acts: [{ beat: 0, action: 'Starts turned away.' }, { beat: 1, action: 'Turns to face front.' }, { beat: 2, action: 'Settles facing front.' }] },
  subject: { name: 'block', source: 'user', specifics: [] },
  visualDevices: [{ kind: 'depth3d', role: 'subject', beats: [0, 1, 2] }, { kind: 'shape', role: 'support', beats: [1] }],
  depth: '3d',
  render3d: 'blender',
  palette: [{ hex: '#101418', role: 'ground' }, { hex: '#F4F1EA', role: 'ink' }, { hex: '#2BB2A3', role: 'signal' }],
  typePlan: { faces: ['Archivo', 'Pretendard'], hierarchy: 'One line at a time.', maxWordsOnScreen: 6 },
  copy: { source: 'user', lines: ['turns to face the viewer', 'path traced in 3D'] },
  inventions: [],
  ambition: 'The block reads as one object from every angle.',
  sound: { mode: 'generated', plan: 'A glass pulse.', palette: 'glass', events: [{ t: 1.5, on: 'the block starts to turn', kind: 'tap' }, { t: 2.8, on: 'the block settles', kind: 'hit' }] },
  ...over,
});

assert.equal(validateTreatment(treatment()).ok, true);

// The headless command line: factory settings, the runner, the film's scene and size.
{
  const args = blenderArgs({ treatment: treatment(), scene: 'stage/scene.py', out: 'stage/plate', quality: 'preview' });
  assert.deepEqual(args.slice(0, 4), ['-b', '--factory-startup', '-P', BLENDER.runner]);
  assert.ok(args.includes('--scene') && args.includes('--stills'), 'preview renders stills');
  assert.equal(args[args.indexOf('--stills') + 1], '0.65,1.95,3.3');
  assert.deepEqual([args[args.indexOf('--width') + 1], args[args.indexOf('--height') + 1]], ['1920', '1080']);
  assert.deepEqual([args[args.indexOf('--percent') + 1], args[args.indexOf('--samples') + 1]], ['50', '40']);
  assert.equal(args[args.indexOf('--device') + 1], 'METAL');
  assert.equal(args[args.indexOf('--seed') + 1], '0');
  const fin = blenderArgs({ treatment: treatment(), scene: 'stage/scene.py', out: 'stage/plate', quality: 'final' });
  assert.equal(fin[fin.indexOf('--frames') + 1], '1-120');
  assert.deepEqual([fin[fin.indexOf('--percent') + 1], fin[fin.indexOf('--samples') + 1]], ['100', '160']);
  assert.throws(() => blenderArgs({ treatment: treatment(), scene: 's', out: 'o', quality: 'rush' }), /preview or final/);
}

// Without Blender the command renders nothing and names the fallback rung.
{
  const dir = mkdtempSync(join(tmpdir(), 'lgm-blender-'));
  mkdirSync(join(dir, 'stage'), { recursive: true });
  writeFileSync(join(dir, 'treatment.json'), `${JSON.stringify(treatment(), null, 2)}\n`);
  writeFileSync(join(dir, 'stage', 'scene.py'), '# the world\n');
  const noBlender = { LITGROK_BLENDER: join(dir, 'no-blender-here') };
  const result = await blenderCommand({ out: dir, env: noBlender, log: () => {} });
  assert.equal(result.code, 0);
  assert.match(result.message, /FALLBACK: no Blender found/);
  assert.match(result.message, /Set render3d to "three" in .*treatment\.json/);
  assert.match(result.message, /the film used the GPU rung because Blender is not installed/);
}

// The wrong treatment and a missing scene stop with the named exit before Blender runs.
{
  const dir = mkdtempSync(join(tmpdir(), 'lgm-blender-'));
  mkdirSync(join(dir, 'stage'), { recursive: true });
  const noBlender = { LITGROK_BLENDER: join(dir, 'no-blender-here') };
  writeFileSync(join(dir, 'treatment.json'), `${JSON.stringify(treatment({ render3d: 'three' }), null, 2)}\n`);
  await assert.rejects(blenderCommand({ out: dir, env: noBlender, log: () => {} }), /render3d "blender"/);
  writeFileSync(join(dir, 'treatment.json'), `${JSON.stringify(treatment(), null, 2)}\n`);
  await assert.rejects(blenderCommand({ out: dir, env: noBlender, log: () => {} }), /scene\.py is missing/);
}

// readPlate: the plate.json receipt counts only when every listed frame is there as listed.
{
  const dir = mkdtempSync(join(tmpdir(), 'lgm-plate-'));
  const stage = join(dir, 'stage', 'plate');
  mkdirSync(stage, { recursive: true });
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  writeFileSync(join(stage, '000001.png'), bytes);
  writeFileSync(join(stage, '000002.png'), bytes);
  writeFileSync(join(stage, 'plate.json'), JSON.stringify({ kind: 'final', blender: '4.2', engine: 'CYCLES', device: 'METAL', samples: 160, percent: 100, fps: 30, frames: [{ name: '000001.png', bytes: bytes.length }, { name: '000002.png', bytes: bytes.length }] }));
  const plate = readPlate(join(dir, 'stage'));
  assert.equal(plate.dir, 'plate');
  assert.equal(plate.device, 'METAL');
  assert.equal(plate.frames.length, 2);
  writeFileSync(join(stage, '000002.png'), Buffer.concat([bytes, bytes]));
  assert.equal(readPlate(join(dir, 'stage')), null, 'a changed frame breaks the receipt');
  assert.equal(readPlate(join(dir, 'missing')), null);
  writeFileSync(join(stage, 'plate.json'), 'not json');
  assert.equal(readPlate(join(dir, 'stage')), null);
  writeFileSync(join(stage, 'plate.json'), JSON.stringify({ frames: [{ name: '../escape.png', bytes: 4 }] }));
  assert.equal(readPlate(join(dir, 'stage')), null, 'a listed name outside the plate dir never counts');
}

// The pre-flight scan exempts the plate: twelve same-size runner frames are a plate, not a flipbook.
{
  const dir = mkdtempSync(join(tmpdir(), 'lgm-plate-scan-'));
  const stage = join(dir, 'stage');
  const plate = join(stage, 'plate');
  mkdirSync(plate, { recursive: true });
  writeFileSync(join(stage, 'index.html'), '<!doctype html><html><body></body></html>');
  const pixels = Buffer.alloc(8 * 4 * 3, 7);
  const frames = [];
  for (let i = 1; i <= 12; i += 1) {
    const name = `${String(i).padStart(6, '0')}.png`;
    writeFileSync(join(plate, name), encodePng(pixels, 8, 4, { channels: 3 }));
    frames.push({ name });
  }
  const bytes = (name) => readFileSync(join(plate, name)).length;
  writeFileSync(join(plate, 'plate.json'), JSON.stringify({ kind: 'final', frames: frames.map((f) => ({ name: f.name, bytes: bytes(f.name) })) }));
  assert.deepEqual(scanStage(stage).contract, [], 'listed plate frames are not page rasters');
  writeFileSync(join(plate, 'plate.json'), JSON.stringify({ frames: [] }));
  assert.ok(scanStage(stage).contract.some((c) => c.includes('flipbook')), 'the same frames unlisted are a flipbook');
}

// A scene script that never returns is killed on its deadline instead of hanging the command.
{
  const started = Date.now();
  const run = await runBlender({ bin: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], timeoutMs: 800 });
  assert.ok(Date.now() - started < 20000, 'the deadline fires promptly');
  assert.equal(run.timedOut, true, 'the hang is reported as a timeout');
  assert.notEqual(run.code, 0);
}

// `motion.mjs blender` without Blender falls back; the wrong treatment exits 2.
{
  const dir = mkdtempSync(join(tmpdir(), 'lgm-blender-cli-'));
  mkdirSync(join(dir, 'stage'), { recursive: true });
  writeFileSync(join(dir, 'treatment.json'), `${JSON.stringify(treatment(), null, 2)}\n`);
  writeFileSync(join(dir, 'stage', 'scene.py'), '# the world\n');
  const env = { ...process.env, LITGROK_BLENDER: join(dir, 'no-blender-here') };
  const result = spawnSync(process.execPath, [motion, 'blender', '--out', dir], { encoding: 'utf8', env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /FALLBACK: no Blender found/);
  writeFileSync(join(dir, 'treatment.json'), `${JSON.stringify(treatment({ render3d: 'three' }), null, 2)}\n`);
  const wrong = spawnSync(process.execPath, [motion, 'blender', '--out', dir], { encoding: 'utf8', env });
  assert.equal(wrong.status, 2, wrong.stderr);
  assert.match(wrong.stderr, /render3d "blender"/);
}
