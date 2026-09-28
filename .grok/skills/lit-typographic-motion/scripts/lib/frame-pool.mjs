// Stage frames are decoded and measured off the main thread while the next frame steps (brief
// section 6e, performance): PNG -> RGBA, SHA-256 of the decoded RGBA (never of PNG bytes), the flash
// cell grid for the frame's orientation, and the luminance p99.5 for the near-black check.
import { createHash } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { cellGrid } from './flash.mjs';
import { decodePng } from './png.mjs';

const LUT = Float64Array.from({ length: 256 }, (_, v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });

export function toRgba(decoded) {
  const { width, height, channels, pixels } = decoded;
  if (channels === 4) return pixels;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0, o = 0; i < pixels.length; i += channels, o += 4) {
    out[o] = pixels[i]; out[o + 1] = channels === 1 ? pixels[i] : pixels[i + 1]; out[o + 2] = channels === 1 ? pixels[i] : pixels[i + 2]; out[o + 3] = 255;
  }
  return out;
}

export function luminanceP995(rgba) {
  const bins = new Uint32Array(1024);
  let total = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const l = 0.2126 * LUT[rgba[i]] + 0.7152 * LUT[rgba[i + 1]] + 0.0722 * LUT[rgba[i + 2]];
    bins[Math.min(1023, Math.floor(l * 1024))] += 1;
    total += 1;
  }
  const target = total * 0.995;
  let acc = 0;
  for (let i = 0; i < 1024; i += 1) { acc += bins[i]; if (acc >= target) return (i + 1) / 1024; }
  return 1;
}

export function measureFrame(png, { flash = true } = {}) {
  const decoded = decodePng(png);
  const rgba = toRgba(decoded);
  const sha256 = createHash('sha256').update(rgba).digest('hex');
  const grid = flash ? cellGrid(rgba, decoded.width, decoded.height, 4) : null;
  return { width: decoded.width, height: decoded.height, rgba, sha256, grid, lumP995: flash ? luminanceP995(rgba) : null };
}

if (!isMainThread && parentPort) {
  parentPort.on('message', ({ id, png, flash }) => {
    try {
      const result = measureFrame(Buffer.from(png.buffer, png.byteOffset, png.byteLength), { flash });
      const transfer = [result.rgba.buffer];
      if (result.grid) for (const key of ['lum', 'r', 'g', 'b']) transfer.push(result.grid[key].buffer);
      parentPort.postMessage({ id, result: { ...result, rgba: new Uint8Array(result.rgba.buffer, result.rgba.byteOffset, result.rgba.byteLength), grid: result.grid ? { lum: result.grid.lum, r: result.grid.r, g: result.grid.g, b: result.grid.b, geometry: { ...result.grid.geometry } } : null } }, transfer);
    } catch (error) {
      parentPort.postMessage({ id, error: error.message });
    }
  });
}

export class FramePool {
  constructor(size = Math.max(1, Math.min(6, availableParallelism() - 2))) {
    this.workers = Array.from({ length: size }, () => new Worker(new URL(import.meta.url)));
    this.pending = new Map();
    this.next = 0;
    this.id = 1;
    for (const worker of this.workers) {
      worker.on('message', ({ id, result, error }) => {
        const job = this.pending.get(id);
        this.pending.delete(id);
        if (error) job.reject(new Error(`frame decode: ${error}`));
        else job.resolve({ ...result, rgba: Buffer.from(result.rgba.buffer, result.rgba.byteOffset, result.rgba.byteLength) });
      });
      worker.on('error', (error) => { for (const job of this.pending.values()) job.reject(error); this.pending.clear(); });
    }
  }

  measure(png, { flash = true } = {}) {
    const id = this.id++;
    const worker = this.workers[this.next++ % this.workers.length];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const bytes = new Uint8Array(png.buffer, png.byteOffset, png.byteLength).slice();
      worker.postMessage({ id, png: bytes, flash }, [bytes.buffer]);
    });
  }

  async close() { await Promise.all(this.workers.map((worker) => worker.terminate())); }
}
