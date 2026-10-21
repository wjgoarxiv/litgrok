// Cover frames are shrunk off the main thread while Chrome seeks the next one: decode the 2x
// screenshot, Lanczos-resize it to the cover size, write it as an RGB PNG (the encoder's input and
// the file G0 and the seek-order check hash) and hand back the SHA-256 of that PNG. The same file
// is the worker (it answers messages when it is not the main thread), as frame-pool.mjs does; it
// must not import frame-pool.mjs, whose own worker branch would answer the same messages.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { lanczosResize } from './cover-image.mjs';
import { decodePng, encodePng } from './png.mjs';

function rgbaOf({ width, height, channels, pixels }) {
  if (channels === 4) return pixels;
  const out = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i += 1) for (let c = 0; c < 3; c += 1) out[i * 4 + c] = pixels[i * channels + (channels === 1 ? 0 : c)];
  return out;
}

export function shrinkFrame(png, width, height, file = null) {
  const decoded = decodePng(png);
  const small = lanczosResize(rgbaOf(decoded), decoded.width, decoded.height, width, height);
  const bytes = encodePng(small, width, height, { channels: 4, outChannels: 3, level: 1 });
  if (file) writeFileSync(file, bytes);
  return { sha256: createHash('sha256').update(bytes).digest('hex'), captured: `${decoded.width}x${decoded.height}` };
}

if (!isMainThread && parentPort) {
  parentPort.on('message', ({ id, png, width, height, file }) => {
    try { parentPort.postMessage({ id, result: shrinkFrame(Buffer.from(png.buffer, png.byteOffset, png.byteLength), width, height, file) }); } catch (error) { parentPort.postMessage({ id, error: error.message }); }
  });
}

export class CoverPool {
  constructor(size = Math.max(2, Math.min(6, availableParallelism() - 2))) {
    this.workers = Array.from({ length: size }, () => new Worker(new URL(import.meta.url)));
    this.pending = new Map();
    this.next = 0;
    this.id = 1;
    for (const worker of this.workers) {
      worker.on('message', ({ id, result, error }) => {
        const job = this.pending.get(id);
        this.pending.delete(id);
        if (error) job.reject(new Error(`cover frame: ${error}`));
        else job.resolve(result);
      });
      worker.on('error', (error) => { for (const job of this.pending.values()) job.reject(error); this.pending.clear(); });
    }
  }

  shrink(png, width, height, file = null) {
    const id = this.id++;
    const worker = this.workers[this.next++ % this.workers.length];
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const bytes = new Uint8Array(png.buffer, png.byteOffset, png.byteLength).slice();
      worker.postMessage({ id, png: bytes, width, height, file }, [bytes.buffer]);
    });
  }

  async close() { await Promise.all(this.workers.map((worker) => worker.terminate())); }
}
