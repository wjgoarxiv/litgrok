// Minimal PNG writer/reader for the engine's own stills, masks and preview frames (8-bit; Paeth on
// write, any of the five standard filters on read).
import { deflateSync, inflateSync } from 'node:zlib';

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const COLOR_TYPE = { 1: 0, 3: 2, 4: 6 };

// pixels: tightly packed rows of `channels` bytes. Channels 4 input may be written as RGB (3) to
// drop the constant alpha. Paeth filtering keeps flat and gradient frames small.
export function encodePng(pixels, width, height, { channels = 4, outChannels = channels, level = 9 } = {}) {
  const stride = width * outChannels;
  const raw = Buffer.alloc((stride + 1) * height);
  const row = Buffer.alloc(stride);
  const previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < outChannels; c += 1) row[x * outChannels + c] = pixels[(y * width + x) * channels + c];
    }
    const base = y * (stride + 1);
    raw[base] = 4;
    for (let i = 0; i < stride; i += 1) {
      const a = i >= outChannels ? row[i - outChannels] : 0;
      const b = previous[i];
      const c = i >= outChannels ? previous[i - outChannels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[base + 1 + i] = (row[i] - predictor) & 0xff;
    }
    row.copy(previous);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = COLOR_TYPE[outChannels];
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function decodePng(buffer) {
  let offset = 8;
  let width = 0, height = 0, colorType = 0;
  const data = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); colorType = body[9]; }
    if (type === 'IDAT') data.push(body);
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 6: 4 }[colorType];
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i += 1) {
      const value = raw[y * (stride + 1) + 1 + i];
      const a = i >= channels ? out[y * stride + i - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = i >= channels && y > 0 ? out[(y - 1) * stride + i - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      else if (filter === 2) predictor = b;
      else if (filter === 3) predictor = (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = (value + predictor) & 0xff;
    }
  }
  return { width, height, channels, pixels: out };
}
