// Cover assets: every raster a cover page can load (base art, logo, wordmark, texture) is listed in
// <out>/assets.json with its path, role, source (user or generated) and SHA-256, and the list is
// checked before the first capture. A listed file that is missing is BLOCKED_ASSET_MISSING (exit
// 22): the art is supplied or generated, never replaced by a drawn stand-in. The painted-light
// recipe needs its base art listed. After the render, frame 0 has to show that art: the SSIM of its
// check box in decoded frame 0 against the source scaled into the art's box.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlockedError, COVER, EXIT } from './constants.mjs';
import { crop, lanczosResize, ssim } from './cover-image.mjs';

export const ASSETS_FILE = 'assets.json';
export const ASSET_ROLES = Object.freeze(['base-art', 'logo', 'wordmark', 'texture']);

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const invalid = (field, message) => new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=assets.json ${field}: ${message}`);
const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number' && v >= 0 && v <= 1) && b[2] > 0 && b[3] > 0 && b[0] + b[2] <= 1 + 1e-9 && b[1] + b[3] <= 1 + 1e-9;

function entry(raw, i, coverDir) {
  const f = `assets[${i}]`;
  if (!raw || typeof raw !== 'object') throw invalid(f, 'must be an object');
  if (typeof raw.path !== 'string' || !raw.path.startsWith(`${coverDir}/`) || raw.path.split('/').includes('..')) throw invalid(`${f}.path`, `a path inside ${coverDir}/, relative to the output directory`);
  if (!ASSET_ROLES.includes(raw.role)) throw invalid(`${f}.role`, `one of ${ASSET_ROLES.join(', ')}`);
  if (!['user', 'generated'].includes(raw.source)) throw invalid(`${f}.source`, 'user (supplied) or generated (made for this cover)');
  if (!/^[0-9a-f]{64}$/u.test(raw.sha256 ?? '')) throw invalid(`${f}.sha256`, "the file's SHA-256, 64 lowercase hex");
  if ('box' in raw && !isBox(raw.box)) throw invalid(`${f}.box`, '[x, y, w, h] as fractions of the cover, inside it');
  if (raw.role === 'base-art' && !raw.box) throw invalid(`${f}.box`, 'base art names the box it fills on the cover');
  if ('checkBox' in raw) {
    if (!isBox(raw.checkBox)) throw invalid(`${f}.checkBox`, '[x, y, w, h] as fractions of the cover, inside it');
    if (!raw.box) throw invalid(`${f}.checkBox`, "needs the art's box");
    const [bx, by, bw, bh] = raw.box;
    const [cx, cy, cw, ch] = raw.checkBox;
    if (cx < bx - 1e-9 || cy < by - 1e-9 || cx + cw > bx + bw + 1e-9 || cy + ch > by + bh + 1e-9) throw invalid(`${f}.checkBox`, "lies inside the art's box");
    if (cw * ch < COVER.artMinShare * bw * bh) throw invalid(`${f}.checkBox`, `covers at least ${COVER.artMinShare * 100} % of the art's box`);
  }
  return { path: raw.path, role: raw.role, source: raw.source, sha256: raw.sha256, box: raw.box ?? null, checkBox: raw.checkBox ?? null, title: raw.title === true };
}

// Before capture. `rasters` are the static scan's rasters (paths relative to the cover folder).
// Exit 22: a listed file is missing, or the painted recipe lists no base art. Exit 17: a raster the
// list does not name, or a listed file whose bytes changed. Exit 16: a malformed entry.
export function checkAssets({ out, treatment, rasters, coverDir = 'cover' }) {
  const file = join(out, ASSETS_FILE);
  let assets = [];
  if (existsSync(file)) {
    let doc;
    try { doc = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw invalid('', `not valid JSON (${error.message})`); }
    if (!doc || !Array.isArray(doc.assets)) throw invalid('assets', 'an array of { path, role, source, sha256 }');
    assets = doc.assets.map((raw, i) => entry(raw, i, coverDir));
    for (const asset of assets) {
      const real = join(out, asset.path);
      if (!existsSync(real)) throw new BlockedError(EXIT.ASSET_MISSING, `BLOCKED_ASSET_MISSING: ${asset.path} is listed in assets.json and missing; supply it or generate it, never draw a stand-in`);
      if (sha(readFileSync(real)) !== asset.sha256) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${asset.path} does not match its sha256 in assets.json; list it again after changing it`);
    }
  }
  if (treatment.recipe === 'painted-light' && !assets.some((a) => a.role === 'base-art')) {
    throw new BlockedError(EXIT.ASSET_MISSING, 'BLOCKED_ASSET_MISSING: the painted-light recipe needs its base art listed in assets.json ({ path, role: base-art, source: user or generated, sha256, box }); supply or generate the painting, never draw a stand-in');
  }
  const listed = new Set(assets.map((a) => a.path));
  for (const raster of rasters) {
    const rel = `${coverDir}/${raster.rel}`;
    if (!listed.has(rel)) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${rel} is a raster the page can load and assets.json does not list it; list it with its role, source and sha256`);
  }
  return { assets };
}

const px = (box, W, H) => box.map((v, k) => Math.round(v * (k % 2 ? H : W)));

// Frame 0 shows the base art: the check box (default: the whole art box) cut from decoded frame 0
// against the same region of the source scaled into the art box. Boxes are fractions of the cover.
export function artCheck({ frame0, width, height, art, box, checkBox = null }) {
  const [bx, by, bw, bh] = px(box, width, height);
  const scaled = lanczosResize(art.rgba, art.width, art.height, bw, bh);
  const [cx, cy, cw, ch] = px(checkBox ?? box, width, height);
  const value = ssim(crop(frame0, width, [cx, cy, cw, ch]), crop(scaled, bw, [cx - bx, cy - by, cw, ch]), cw, ch);
  return { ssim: value, pass: value >= COVER.artSsim, box: [bx, by, bw, bh], checked: [cx, cy, cw, ch] };
}

// The lines a finished cover's reply has to carry for every generated asset.
export function generatedLabels(out) {
  const file = join(out, ASSETS_FILE);
  if (!existsSync(file)) return [];
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    return (doc.assets ?? []).filter((a) => a?.source === 'generated' && typeof a.path === 'string').map((a) => `the ${String(a.role ?? 'asset').replace('-', ' ')} ${a.path} is generated, not supplied: label it as generated in the reply`);
  } catch { return []; }
}
