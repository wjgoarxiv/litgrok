// Read an animated WebP the way a browser plays it, with no npm package: the RIFF container is
// parsed here (canvas size, loop count, and per ANMF frame its rectangle, duration, blend and
// dispose bits), each frame's bitstream is rewrapped as a standalone still and decoded by the
// host's `dwebp` (it ships with `img2webp` in libwebp), and the stills are composited onto one
// canvas as libwebp's animation decoder does. The cover gate reads the cover through this and
// never only through the PNG frames it was encoded from: a lossy animation encoder leaves out
// small changes, and only the decoded file shows what it left out.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findTool } from './render.mjs';

export const findDwebp = (env = process.env) => findTool('dwebp', env);
export const findImg2webp = (env = process.env) => findTool('img2webp', env);

const u24 = (b, o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);

// { width, height, loop, animated, frames: [{ x, y, w, h, durationMs, blend, dispose, data }] }
export function parseWebp(bytes) {
  if (bytes.length < 16 || bytes.toString('latin1', 0, 4) !== 'RIFF' || bytes.toString('latin1', 8, 12) !== 'WEBP') throw new Error('not a WebP file');
  const info = { width: 0, height: 0, loop: null, animated: false, frames: [] };
  const end = Math.min(bytes.length, 8 + bytes.readUInt32LE(4));
  for (let o = 12; o + 8 <= end;) {
    const fourcc = bytes.toString('latin1', o, o + 4);
    const size = bytes.readUInt32LE(o + 4);
    const body = bytes.subarray(o + 8, o + 8 + size);
    if (fourcc === 'VP8X') {
      info.animated = (body[0] & 0x02) !== 0;
      info.width = 1 + u24(body, 4);
      info.height = 1 + u24(body, 7);
    } else if (fourcc === 'ANIM') {
      info.loop = body.readUInt16LE(4);
    } else if (fourcc === 'ANMF') {
      info.frames.push({
        x: 2 * u24(body, 0), y: 2 * u24(body, 3), w: 1 + u24(body, 6), h: 1 + u24(body, 9),
        durationMs: u24(body, 12), blend: (body[15] & 0x02) === 0, dispose: (body[15] & 0x01) !== 0, data: body.subarray(16),
      });
    } else if ((fourcc === 'VP8 ' || fourcc === 'VP8L') && info.frames.length === 0) {
      info.frames.push({ x: 0, y: 0, w: 0, h: 0, durationMs: 0, blend: false, dispose: false, still: true, data: bytes.subarray(o, o + 8 + size + (size & 1)) });
    }
    o += 8 + size + (size & 1);
  }
  if (!info.animated && info.frames.length === 1 && info.loop === null) info.loop = 0;
  return info;
}

// One ANMF payload (an optional ALPH chunk, then VP8 or VP8L) as a WebP file of its own.
function standalone(frame) {
  const alpha = frame.data.toString('latin1', 0, 4) === 'ALPH';
  const parts = [];
  if (alpha) {
    const vp8x = Buffer.alloc(18);
    vp8x.write('VP8X', 0, 'latin1');
    vp8x.writeUInt32LE(10, 4);
    vp8x[8] = 0x10;
    vp8x.writeUIntLE(frame.w - 1, 12, 3);
    vp8x.writeUIntLE(frame.h - 1, 15, 3);
    parts.push(vp8x);
  }
  parts.push(frame.data);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + parts.reduce((sum, part) => sum + part.length, 0), 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, ...parts]);
}

// A PAM file (P7) as dwebp writes it: { width, height, rgba }.
export function readPam(buffer) {
  const marker = buffer.indexOf('ENDHDR\n');
  if (buffer.toString('latin1', 0, 2) !== 'P7' || marker < 0) throw new Error('not a PAM file');
  const header = buffer.toString('latin1', 0, marker);
  const field = (name) => Number(new RegExp(`${name} (\\d+)`, 'u').exec(header)?.[1]);
  const width = field('WIDTH'), height = field('HEIGHT'), depth = field('DEPTH');
  const data = buffer.subarray(marker + 7);
  if (depth === 4) return { width, height, rgba: data };
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i += 1) for (let c = 0; c < 3; c += 1) rgba[i * 4 + c] = data[i * depth + c];
  return { width, height, rgba };
}

// Paint one decoded frame onto the canvas: source-over on straight alpha (libwebp's blend), or a
// plain replace when the frame does not blend.
function paint(canvas, canvasWidth, frame, rgba) {
  for (let y = 0; y < frame.h; y += 1) {
    for (let x = 0; x < frame.w; x += 1) {
      const s = (y * frame.w + x) * 4;
      const d = ((frame.y + y) * canvasWidth + frame.x + x) * 4;
      const sa = rgba[s + 3];
      if (!frame.blend || sa === 255) {
        canvas[d] = rgba[s]; canvas[d + 1] = rgba[s + 1]; canvas[d + 2] = rgba[s + 2]; canvas[d + 3] = sa;
      } else if (sa > 0) {
        const kept = (canvas[d + 3] * (255 - sa)) / 255;
        const a = sa + kept;
        for (let c = 0; c < 3; c += 1) canvas[d + c] = Math.round((rgba[s + c] * sa + canvas[d + c] * kept) / a);
        canvas[d + 3] = Math.round(a);
      }
    }
  }
}

// Decode every frame in order. onFrame(index, rgba, durationMs, width, height) sees the composited
// canvas, which is reused between calls (copy what you keep). Returns the file's facts.
export function decodeWebp(file, { env = process.env, onFrame = () => {} } = {}) {
  const dwebp = findDwebp(env);
  if (!dwebp) throw new Error('dwebp not found on PATH (it ships with img2webp in libwebp); install libwebp');
  const bytes = readFileSync(file);
  const info = parseWebp(bytes);
  if (!info.frames.length) throw new Error(`${file} holds no frame`);
  const work = mkdtempSync(join(tmpdir(), 'litgrok-webp-'));
  try {
    let width = info.width, height = info.height;
    let canvas = null;
    let previous = null;
    const durations = [];
    info.frames.forEach((frame, index) => {
      const still = join(work, 'frame.webp');
      const pam = join(work, 'frame.pam');
      writeFileSync(still, frame.still ? Buffer.concat([bytes.subarray(0, 12), frame.data]) : standalone(frame));
      const run = spawnSync(dwebp, [still, '-pam', '-quiet', '-o', pam], { encoding: 'utf8' });
      if (run.status !== 0) throw new Error(`dwebp failed on frame ${index}: ${(run.stderr || run.error?.message || '').trim().split(/\r?\n/)[0]}`);
      const decoded = readPam(readFileSync(pam));
      if (frame.still) { width = decoded.width; height = decoded.height; frame.w = width; frame.h = height; }
      canvas ??= Buffer.alloc(width * height * 4);
      if (previous?.dispose) for (let y = previous.y; y < previous.y + previous.h; y += 1) canvas.fill(0, (y * width + previous.x) * 4, (y * width + previous.x + previous.w) * 4);
      paint(canvas, width, frame, decoded.rgba);
      durations.push(frame.durationMs);
      onFrame(index, canvas, frame.durationMs, width, height);
      previous = frame;
    });
    return { width, height, loop: info.loop, durations, bytes: statSync(file).size, frames: info.frames.length };
  } finally { rmSync(work, { recursive: true, force: true }); }
}
