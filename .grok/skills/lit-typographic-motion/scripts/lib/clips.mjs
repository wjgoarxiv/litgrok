// Declared keyed overlay clips on the stage path: stage/clips/clips.json names RGBA frame folders,
// scanClips checks every declared frame against its bytes, and clipsScript writes the table the page
// reads as window.LitClips (served at /lit/clips.js). See references/stage.md, Clips.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIP_LIMITS } from './constants.mjs';
import { decodePng } from './png.mjs';

export const CLIPS_DIR = 'clips';
export const clipFrame = (i) => `frame_${String(i).padStart(4, '0')}.png`;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;
const DIR = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MB = 1024 * 1024;

/** Header facts of a PNG: size, bit depth, colour type (6 = RGBA) and whether it is an APNG. */
function pngHeader(bytes) {
  if (bytes.length < 33 || bytes.toString('latin1', 1, 4) !== 'PNG') return null;
  let animated = false;
  for (let o = 8; o + 8 <= bytes.length;) {
    const type = bytes.toString('latin1', o + 4, o + 8);
    if (type === 'acTL') animated = true;
    if (type === 'IDAT' || type === 'IEND') break;
    o += 12 + bytes.readUInt32BE(o);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colorType: bytes[25], animated };
}

/** The clips stage/clips/clips.json declares ([] without the file), checked for shape only. Throws Error. */
export function declaredClips(stageDir, limits = CLIP_LIMITS) {
  const file = join(stageDir, CLIPS_DIR, 'clips.json');
  if (!existsSync(file)) return [];
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw new Error(`${CLIPS_DIR}/clips.json is not valid JSON (${error.message})`); }
  if (!doc || !Array.isArray(doc.clips)) throw new Error(`${CLIPS_DIR}/clips.json needs { "clips": [ { "id", "dir", "count", "fps" } ] }`);
  if (doc.clips.length > limits.clips) throw new Error(`${doc.clips.length} clips declared (at most ${limits.clips} clips)`);
  const ids = new Set();
  const dirs = new Set();
  return doc.clips.map((c, n) => {
    const at = `${CLIPS_DIR}/clips.json clip #${n + 1}`;
    if (!c || typeof c !== 'object') throw new Error(`${at} is not an object`);
    if (typeof c.id !== 'string' || !ID.test(c.id)) throw new Error(`${at}: id must be a plain token of letters, digits, - and _ (got ${JSON.stringify(c.id)})`);
    if (ids.has(c.id)) throw new Error(`${at}: duplicate id ${c.id}`);
    ids.add(c.id);
    if (typeof c.dir !== 'string' || !DIR.test(c.dir) || c.dir.includes('..')) throw new Error(`clip "${c.id}": dir must be a folder name directly under ${CLIPS_DIR}/ (got ${JSON.stringify(c.dir)})`);
    if (dirs.has(c.dir)) throw new Error(`clip "${c.id}": dir ${c.dir} is already declared by another clip`);
    dirs.add(c.dir);
    if (!Number.isInteger(c.count) || c.count < 1) throw new Error(`clip "${c.id}": count must be a whole number of frames (got ${JSON.stringify(c.count)})`);
    if (!Number.isInteger(c.fps) || c.fps < 1 || c.fps > limits.fps) throw new Error(`clip "${c.id}": fps must be a whole number from 1 to ${limits.fps} (got ${JSON.stringify(c.fps)})`);
    return { id: c.id, dir: c.dir, count: c.count, fps: c.fps };
  });
}

/**
 * Check every declared clip against its bytes. Each clip needs exactly frame_0001.png..frame_<count>.png in clips/<dir>/, every one an
 * 8-bit still RGBA PNG of one size within the overlay cap, a transparent pixel in the first, middle and
 * last frame, and the per-clip and total caps. Throws Error naming the clip; returns
 * [{ id, dir, count, fps, width, height, bytes, frames }] where `frames` are stage-relative paths.
 */
export function scanClips(stageDir, { limits = CLIP_LIMITS } = {}) {
  const decls = declaredClips(stageDir, limits);
  let totalFrames = 0;
  let totalBytes = 0;
  const clips = decls.map((d) => {
    if (d.count > limits.framesPerClip) throw new Error(`clip "${d.id}": ${d.count} frames (at most ${limits.framesPerClip} per clip)`);
    const prefix = `${CLIPS_DIR}/${d.dir}/`;
    const folder = join(stageDir, CLIPS_DIR, d.dir);
    const have = new Set(existsSync(folder) ? readdirSync(folder, { withFileTypes: true }).filter((e) => e.isFile() && /\.(png|jpe?g|webp|gif)$/i.test(e.name)).map((e) => e.name) : []);
    const frames = [];
    for (let i = 1; i <= d.count; i += 1) {
      if (!have.has(clipFrame(i))) throw new Error(`clip "${d.id}": ${prefix}${clipFrame(i)} is missing (declared ${d.count} frames, named frame_0001.png onward)`);
      frames.push(`${prefix}${clipFrame(i)}`);
    }
    const stray = [...have].find((name) => !frames.includes(`${prefix}${name}`));
    if (stray) throw new Error(`clip "${d.id}": ${prefix}${stray} is not one of the ${d.count} declared frames; raise count or remove it`);
    let size = null;
    let bytes = 0;
    const read = (rel) => readFileSync(join(stageDir, ...rel.split('/')));
    const headers = frames.map((rel) => {
      const buffer = read(rel);
      bytes += buffer.length;
      const info = pngHeader(buffer);
      if (!info) throw new Error(`clip "${d.id}": ${rel} is not a readable PNG`);
      if (info.animated) throw new Error(`clip "${d.id}": ${rel} is an animated image; a clip is a folder of still frames`);
      if (info.colorType !== 6 || info.bitDepth !== 8) throw new Error(`clip "${d.id}": ${rel} must be an 8-bit RGBA PNG with an alpha channel (a keyed frame), not an opaque image`);
      if (Math.max(info.width, info.height) > limits.side) throw new Error(`clip "${d.id}": ${rel} is ${info.width}x${info.height}; a clip is an overlay of at most ${limits.side} px on the long side`);
      if (size && (size.width !== info.width || size.height !== info.height)) throw new Error(`clip "${d.id}": ${rel} is ${info.width}x${info.height} but frame_0001.png is ${size.width}x${size.height}; one size per clip`);
      size = { width: info.width, height: info.height };
      return buffer;
    });
    if (bytes > limits.bytesPerClip) throw new Error(`clip "${d.id}": ${(bytes / MB).toFixed(1)} MB (at most ${(limits.bytesPerClip / MB).toFixed(0)} MB per clip)`);
    for (const at of [0, Math.floor((frames.length - 1) / 2), frames.length - 1]) {
      let pixels;
      try { ({ pixels } = decodePng(headers[at])); } catch (error) { throw new Error(`clip "${d.id}": ${frames[at]} cannot be decoded (${error.message}); use a non-interlaced 8-bit RGBA PNG`); }
      let keyed = false;
      for (let i = 3; i < pixels.length && !keyed; i += 4) keyed = pixels[i] < 255;
      if (!keyed) throw new Error(`clip "${d.id}": ${frames[at]} has no transparent pixel; a clip is keyed, not a full-frame video`);
    }
    totalFrames += d.count;
    totalBytes += bytes;
    return { ...d, ...size, bytes, frames };
  });
  if (totalFrames > limits.framesTotal) throw new Error(`${totalFrames} clip frames in all (at most ${limits.framesTotal})`);
  if (totalBytes > limits.bytesTotal) throw new Error(`${(totalBytes / MB).toFixed(1)} MB of clip frames in all (at most ${(limits.bytesTotal / MB).toFixed(0)} MB)`);
  return clips;
}

/**
 * The script served at /lit/clips.js: window.LitClips = { id: { src, count, fps, width, height } }, from
 * clips.json and each first frame's header. null when the stage declares no clips, or one the scan refuses.
 */
export function clipsScript(stageDir) {
  try {
    const table = Object.fromEntries(declaredClips(stageDir).map((c) => {
      const info = pngHeader(readFileSync(join(stageDir, CLIPS_DIR, c.dir, clipFrame(1))));
      return [c.id, { src: `${CLIPS_DIR}/${c.dir}`, count: c.count, fps: c.fps, width: info.width, height: info.height }];
    }));
    return Object.keys(table).length ? `window.LitClips = ${JSON.stringify(table)};\n` : null;
  } catch { return null; }
}
