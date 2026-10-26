// The offline Blender rung. A 3D film with `render3d: "blender"` writes its world as a Blender Python
// scene (<out>/stage/scene.py); `motion.mjs blender` renders it headless with Cycles on the GPU through
// the bundled runner: first preview stills at the beat midpoints (half size, few samples) to look at,
// then with --final the full plate sequence in <out>/stage/plate/ with plate.json, the receipt the
// stage trusts. The stage page shows the plate through LitStage.plate() and draws its type and labels
// over it, so the page itself stays on the software rung. Without Blender the command renders nothing
// and names the fallback: the three.js world on the GPU rung.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlockedError, EXIT } from './constants.mjs';
import { findBlender } from './scaffold.mjs';
import { loadTreatment } from './treatment.mjs';

export const BLENDER = Object.freeze({
  macApp: '/Applications/Blender.app/Contents/MacOS/Blender',
  runner: fileURLToPath(new URL('../blender/runner.py', import.meta.url)),
  plateFps: 30,
  device: 'METAL',
  preview: Object.freeze({ percent: 50, samples: 40 }),
  final: Object.freeze({ percent: 100, samples: 160 }),
});

// A hung scene script must fail, never block the agent's tool call: each expected frame gets
// this budget, with a floor so a one-still preview still has room to start Blender.
export const BLENDER_TIMEOUT = Object.freeze({ perFrameMs: 180_000, minMs: 600_000 });

// Film sizes by format: the plate matches the stage frame exactly.
const FORMATS = Object.freeze({ '16:9': [1920, 1080], '9:16': [1080, 1920] });

const plateFrames = (treatment) => Math.round(treatment.durationSec * BLENDER.plateFps);

// The headless command line: factory settings, the runner, and the runner's own arguments after `--`.
export function blenderArgs({ treatment, scene, out, quality }) {
  const q = BLENDER[quality];
  if (!q) throw new Error(`blenderArgs: quality is preview or final (got ${quality})`);
  const [width, height] = FORMATS[treatment.format] ?? FORMATS['16:9'];
  const args = ['-b', '--factory-startup', '-P', BLENDER.runner, '--',
    '--scene', scene, '--out', out, '--width', String(width), '--height', String(height),
    '--percent', String(q.percent), '--samples', String(q.samples), '--device', BLENDER.device,
    '--fps', String(BLENDER.plateFps), '--seed', String((Number(treatment.seed) || 0) % 2147483648)];
  if (quality === 'preview') args.push('--stills', treatment.beats.map((b) => +((b.t0 + b.t1) / 2).toFixed(3)).join(','));
  else args.push('--frames', `1-${plateFrames(treatment)}`);
  return args;
}

const FALLBACK = (out) => [
  'FALLBACK: no Blender found (LITGROK_BLENDER, /Applications/Blender.app, blender on PATH), so nothing was rendered.',
  `Set render3d to "three" in ${join(out, 'treatment.json')} and build the world in three.js on the GPU rung (references/depth.md),`,
  'and say in the reply that the film used the GPU rung because Blender is not installed.',
].join('\n');

const listPngs = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.png')).sort() : []);

export function runBlender({ bin, args, dir, expected, progress, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    let timedOut = false;
    const keep = (chunk) => {
      tail = (tail + chunk).slice(-4000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = progress ? setInterval(() => progress(listPngs(dir).length, expected), 2000) : null;
    const killer = typeof timeoutMs === 'number' && timeoutMs > 0
      ? setTimeout(() => {
        timedOut = true;
        tail = `${tail}\nTIMEOUT after ${timeoutMs} ms: the scene script was killed`.slice(-4000);
        child.kill('SIGKILL');
      }, timeoutMs)
      : null;
    const done = (result) => {
      if (timer) clearInterval(timer);
      if (killer) clearTimeout(killer);
      resolve(result);
    };
    child.on('close', (code) => done({ code: timedOut ? -1 : code, tail, timedOut }));
    child.on('error', (error) => done({ code: -1, tail: `${tail}\n${error.message}`.slice(-4000), timedOut }));
  });
}

// `motion.mjs blender --out <dir> [--final]`. Preview: stills in stage/plate-preview/. Final: the plate
// sequence in stage/plate/ and plate.json listing every frame by name and size, with the device,
// samples and Blender version from the runner's receipt.
export async function blenderCommand({ out, final = false, env = process.env, log = () => {}, progress = null }) {
  const treatment = loadTreatment(out);
  if (treatment.render3d !== 'blender') throw new BlockedError(EXIT.USAGE, `blender renders a treatment with render3d "blender" (this one is ${treatment.render3d ?? 'three'})`);
  const stageDir = join(out, 'stage');
  const scene = join(stageDir, 'scene.py');
  if (!existsSync(scene)) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${scene} is missing; write the Blender scene first (references/depth.md, the Blender rung)`);
  const found = findBlender({ env });
  if (!found) return { code: EXIT.OK, message: FALLBACK(out) };
  const quality = final ? 'final' : 'preview';
  const dir = join(stageDir, final ? 'plate' : 'plate-preview');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const args = blenderArgs({ treatment, scene, out: dir, quality });
  const expected = final ? plateFrames(treatment) : treatment.beats.length;
  log(`blender ${quality}: ${found.path} (${found.source}), ${expected} ${final ? 'frames' : 'stills'}`);
  const timeoutMs = Math.max(BLENDER_TIMEOUT.minMs, expected * BLENDER_TIMEOUT.perFrameMs);
  const run = await runBlender({ bin: found.path, args, dir, expected, progress, timeoutMs });
  const receiptFile = join(dir, 'receipt.json');
  if (run.code !== 0 || !existsSync(receiptFile)) {
    throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: Blender ${quality} failed (exit ${run.code}); fix stage/scene.py and run it again. Last output: ${run.tail.trim().split('\n').slice(-8).join(' | ')}`);
  }
  const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
  const frames = receipt.files.map((name) => ({ name, bytes: statSync(join(dir, name)).size }));
  if (frames.length !== expected) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: Blender wrote ${frames.length} of ${expected} ${final ? 'frames' : 'stills'}`);
  const plate = { kind: quality, blender: receipt.blender, engine: receipt.engine, device: receipt.device, samples: receipt.samples, percent: receipt.percent, fps: BLENDER.plateFps, frames };
  writeFileSync(join(dir, 'plate.json'), `${JSON.stringify(plate, null, 1)}\n`);
  const label = `Blender ${receipt.blender}, ${receipt.engine} ${receipt.device}, ${receipt.samples} spp at ${receipt.percent} %`;
  if (!final) {
    return { code: EXIT.OK, message: `BLENDER preview: ${frames.length} stills at the beat midpoints in ${dir} (${label}). Open them, compare them with any reference frames the user gave, fix scene.py, then render the plate: blender --out ${out} --final` };
  }
  return { code: EXIT.OK, message: `BLENDER plate: ${frames.length} frames at ${BLENDER.plateFps} fps in ${dir} (${label}). Show it with LitStage.plate() under the type, then render the stage: stage --out ${out} --round N` };
}

// The plate a stage dir carries: { dir, frames, device, ... } when plate.json lists frames that are all there as listed, else null.
export function readPlate(stageDir, sub = 'plate') {
  const file = join(stageDir, sub, 'plate.json');
  if (!existsSync(file)) return null;
  let plate;
  try {
    plate = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
  if (!Array.isArray(plate.frames)) return null;
  const ok = plate.frames.every((f) => {
    const p = join(stageDir, sub, String(f.name));
    return basename(String(f.name)) === f.name && existsSync(p) && statSync(p).size === f.bytes;
  });
  return ok ? { ...plate, dir: sub } : null;
}
