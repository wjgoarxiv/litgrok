// Pixel helpers for cover mode, all on tightly packed RGBA8 buffers: a separable Lanczos-3 resize
// (each 2x capture is shrunk to the cover size with it), the gate's luma grid (Rec. 709 weights
// on the stored values, box-averaged to about COVER.lumaWidth px wide so every gate number is read
// at thumbnail scale), a rectangle crop, and a tiled SSIM on luma that compares the base art in
// decoded frame 0 with its source.
import { COVER } from './constants.mjs';

const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lanczos3 = (x) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0);

// For each destination index: the first source index it reads and its normalized weights. When
// shrinking, the kernel is stretched by the scale so every source pixel contributes.
function taps(srcLen, dstLen) {
  const scale = srcLen / dstLen;
  const stretch = Math.max(1, scale);
  const reach = 3 * stretch;
  const out = [];
  for (let i = 0; i < dstLen; i += 1) {
    const centre = (i + 0.5) * scale - 0.5;
    const first = Math.max(0, Math.ceil(centre - reach));
    const last = Math.min(srcLen - 1, Math.floor(centre + reach));
    const weights = [];
    let total = 0;
    for (let j = first; j <= last; j += 1) { const w = lanczos3((j - centre) / stretch); weights.push(w); total += w; }
    out.push({ first, weights: Float64Array.from(weights, (w) => w / total) });
  }
  return out;
}

const to8 = (v) => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));

// Resize RGBA8 with Lanczos-3, horizontal pass then vertical. Captures are opaque: alpha is 255.
export function lanczosResize(src, srcW, srcH, dstW, dstH) {
  if (srcW === dstW && srcH === dstH) return Buffer.from(src);
  const across = taps(srcW, dstW);
  const down = taps(srcH, dstH);
  const mid = new Float32Array(dstW * srcH * 3);
  for (let y = 0; y < srcH; y += 1) {
    const row = y * srcW * 4;
    for (let x = 0; x < dstW; x += 1) {
      const { first, weights } = across[x];
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < weights.length; k += 1) {
        const o = row + (first + k) * 4;
        r += src[o] * weights[k]; g += src[o + 1] * weights[k]; b += src[o + 2] * weights[k];
      }
      const m = (y * dstW + x) * 3;
      mid[m] = r; mid[m + 1] = g; mid[m + 2] = b;
    }
  }
  const out = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y += 1) {
    const { first, weights } = down[y];
    for (let x = 0; x < dstW; x += 1) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < weights.length; k += 1) {
        const m = ((first + k) * dstW + x) * 3;
        r += mid[m] * weights[k]; g += mid[m + 1] * weights[k]; b += mid[m + 2] * weights[k];
      }
      const o = (y * dstW + x) * 4;
      out[o] = to8(r); out[o + 1] = to8(g); out[o + 2] = to8(b); out[o + 3] = 255;
    }
  }
  return out;
}

// Luma (0..255) box-averaged by an integer factor to about COVER.lumaWidth px wide: { luma, w, h }.
export function lumaGrid(rgba, width, height) {
  const f = Math.max(1, Math.round(width / COVER.lumaWidth));
  const w = Math.floor(width / f), h = Math.floor(height / f);
  const luma = new Float32Array(w * h);
  for (let y = 0; y < h * f; y += 1) {
    const cellRow = Math.floor(y / f) * w;
    let o = y * width * 4;
    for (let x = 0; x < w * f; x += 1, o += 4) luma[cellRow + Math.floor(x / f)] += 0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2];
  }
  const n = f * f;
  for (let i = 0; i < luma.length; i += 1) luma[i] /= n;
  return { luma, w, h };
}

// The rectangle [x, y, w, h] of an RGBA8 frame `width` px wide, as its own buffer.
export function crop(rgba, width, [x, y, w, h]) {
  const out = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row += 1) rgba.copy(out, row * w * 4, ((y + row) * width + x) * 4, ((y + row) * width + x + w) * 4);
  return out;
}

// SSIM of two same-size RGBA8 images on luma: the mean of the SSIM term over 8 x 8 tiles.
export function ssim(a, b, width, height) {
  const lum = (img, i) => 0.2126 * img[i * 4] + 0.7152 * img[i * 4 + 1] + 0.0722 * img[i * 4 + 2];
  const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, T = 8, n = T * T;
  let sum = 0, tiles = 0;
  for (let ty = 0; ty + T <= height; ty += T) {
    for (let tx = 0; tx + T <= width; tx += T) {
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let y = ty; y < ty + T; y += 1) {
        for (let x = tx; x < tx + T; x += 1) {
          const p = y * width + x;
          const la = lum(a, p), lb = lum(b, p);
          sa += la; sb += lb; saa += la * la; sbb += lb * lb; sab += la * lb;
        }
      }
      const ma = sa / n, mb = sb / n;
      const va = (saa - n * ma * ma) / (n - 1), vb = (sbb - n * mb * mb) / (n - 1), cov = (sab - n * ma * mb) / (n - 1);
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      tiles += 1;
    }
  }
  return tiles ? sum / tiles : 0;
}
