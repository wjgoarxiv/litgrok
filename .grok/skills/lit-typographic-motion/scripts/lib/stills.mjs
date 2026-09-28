// The stills set every render writes (brief section 9): one frame at every beat midpoint, a
// transition strip per cut (-6 / 0 / +6 frames), a 12-frame contact sheet and, after a full
// render, the poster. stills/index.json lists every file with its SHA-256; `look` stamps rounds
// with the hash of that index and `verify` compares it with the final full render's.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodePng } from './png.mjs';

export const SHEET_FRAMES = 12;
export const STRIP_OFFSETS = Object.freeze([-6, 0, 6]);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pad2 = (n) => String(n).padStart(2, '0');

// Beat midpoints and cuts come from the treatment's beats; `cuts` may be overridden (the type path
// cuts on its shot boundaries).
export function stillsPlan({ beats, fps, totalFrames, cuts = null }) {
  const clamp = (f) => Math.max(0, Math.min(totalFrames - 1, f));
  const sorted = [...beats].sort((a, b) => a.t0 - b.t0);
  const mids = sorted.map((beat, i) => ({ beat: i, frame: clamp(Math.round(((beat.t0 + beat.t1) / 2) * fps)) }));
  const cutFrames = (cuts ?? sorted.slice(1).map((beat) => Math.round(beat.t0 * fps))).map(clamp).filter((f, i, all) => f > 0 && all.indexOf(f) === i);
  const strips = cutFrames.map((frame, i) => ({ cut: i, frame, frames: STRIP_OFFSETS.map((d) => clamp(frame + d)) }));
  const sheet = Array.from({ length: SHEET_FRAMES }, (_, i) => clamp(Math.floor(((i + 0.5) * totalFrames) / SHEET_FRAMES)));
  const all = new Set([...mids.map((m) => m.frame), ...strips.flatMap((s) => s.frames), ...sheet]);
  return { mids, strips, sheet, frames: [...all].sort((a, b) => a - b) };
}

// Box-filter downscale of RGBA by an integer factor.
export function downscale(rgba, width, height, factor) {
  const w = Math.floor(width / factor), h = Math.floor(height / factor);
  const out = Buffer.alloc(w * h * 4);
  const n = factor * factor;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0, g = 0, b = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        let o = ((y * factor + dy) * width + x * factor) * 4;
        for (let dx = 0; dx < factor; dx += 1, o += 4) { r += rgba[o]; g += rgba[o + 1]; b += rgba[o + 2]; }
      }
      const p = (y * w + x) * 4;
      out[p] = Math.round(r / n); out[p + 1] = Math.round(g / n); out[p + 2] = Math.round(b / n); out[p + 3] = 255;
    }
  }
  return { rgba: out, width: w, height: h };
}

function compose(tiles, columns, gutter = 8, ground = [16, 16, 18]) {
  const tw = tiles[0].width, th = tiles[0].height;
  const rows = Math.ceil(tiles.length / columns);
  const width = columns * tw + (columns + 1) * gutter, height = rows * th + (rows + 1) * gutter;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = ground[0]; out[i + 1] = ground[1]; out[i + 2] = ground[2]; out[i + 3] = 255; }
  tiles.forEach((tile, index) => {
    const ox = gutter + (index % columns) * (tw + gutter), oy = gutter + Math.floor(index / columns) * (th + gutter);
    for (let y = 0; y < th; y += 1) tile.rgba.copy(out, ((oy + y) * width + ox) * 4, y * tw * 4, (y + 1) * tw * 4);
  });
  return { rgba: out, width, height };
}

const png = (image) => encodePng(image.rgba, image.width, image.height, { channels: 4, outChannels: 3, level: 6 });

// frames: Map(frame -> { rgba, png? }) holding every frame the plan lists. Writes the set and
// returns the index object (also written to stills/index.json).
export function writeStills(out, { plan, frames, width, height, path, round, mode, poster = null, treatmentSha256, clear = true }) {
  const dir = join(out, 'stills');
  if (clear) rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const entries = [];
  const put = (name, bytes, entry) => { writeFileSync(join(dir, name), bytes); entries.push({ file: `stills/${name}`, sha256: sha(bytes), ...entry }); };
  for (const mid of plan.mids) {
    const frame = frames.get(mid.frame);
    put(`beat-${pad2(mid.beat + 1)}-mid.png`, frame.png ?? png({ rgba: frame.rgba, width, height }), { kind: 'beat-mid', beat: mid.beat, frames: [mid.frame] });
  }
  const stripFactor = 3, sheetFactor = 4;
  for (const strip of plan.strips) {
    const tiles = strip.frames.map((f) => downscale(frames.get(f).rgba, width, height, stripFactor));
    put(`cut-${pad2(strip.cut + 1)}-strip.png`, png(compose(tiles, tiles.length)), { kind: 'transition', cut: strip.cut, frames: strip.frames });
  }
  const sheetTiles = plan.sheet.map((f) => downscale(frames.get(f).rgba, width, height, sheetFactor));
  put('contact-sheet.png', png(compose(sheetTiles, 4)), { kind: 'contact-sheet', frames: plan.sheet });
  if (poster) put('poster.png', poster.bytes, { kind: 'poster', frames: [poster.frame] });
  const index = { schema: 1, path, round, mode, format: `${width}x${height}`, treatmentSha256, stills: entries };
  const text = `${JSON.stringify(index, null, 2)}\n`;
  writeFileSync(join(dir, 'index.json'), text);
  return { index, sha256: sha(Buffer.from(text)) };
}

export function stillsIndexSha(out) {
  try { return sha(readFileSync(join(out, 'stills', 'index.json'))); } catch { return null; }
}
