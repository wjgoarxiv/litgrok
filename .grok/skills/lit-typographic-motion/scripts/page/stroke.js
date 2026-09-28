// Single-stroke plotter type (the five OFL EMS SVG fonts, MO-FT-08) drawn progressively by a moving
// pen. Adapted from pdoom-video app/src/engine/stroke.ts (MIT, see NOTICE): SVG glyph parsing,
// polyline arc lengths and a writtenLength() that follows the timeline's own timing. Kerning here
// is a light optical pass for overhanging Latin pairs; connected scripts are never kerned.
const Stroke = {
  fonts: new Map(),

  register(key, svgText, meta) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const face = doc.querySelector('font-face');
    const fontEl = doc.querySelector('font');
    const defaultAdvance = parseFloat(fontEl.getAttribute('horiz-adv-x') ?? '500');
    const glyphs = new Map();
    doc.querySelectorAll('glyph').forEach((glyph) => {
      const unicode = glyph.getAttribute('unicode');
      if (unicode === null) return;
      glyphs.set(unicode, { advance: parseFloat(glyph.getAttribute('horiz-adv-x') ?? String(defaultAdvance)), strokes: parseStrokePath(glyph.getAttribute('d') ?? '') });
    });
    const capGlyph = glyphs.get('H');
    let capTop = 700;
    if (capGlyph) capTop = Math.max(...capGlyph.strokes.flat().map((p) => p.y));
    this.fonts.set(key, { upm: parseFloat(face?.getAttribute('units-per-em') ?? '1000'), glyphs, defaultAdvance, capTop, connected: Boolean(meta.connected), meta });
  },

  covers(key, ch) { return this.fonts.get(key).glyphs.has(ch) || ch === ' '; },

  layout(text, key, size, trackingPx = 0) {
    const font = this.fonts.get(key);
    const s = size / font.upm;
    const strokes = [];
    const charOf = [];
    let x = 0;
    const chars = Array.from(text);
    chars.forEach((ch, index) => {
      const glyph = font.glyphs.get(ch);
      for (const stroke of glyph?.strokes ?? []) {
        strokes.push(stroke.map((p) => ({ x: x + p.x * s, y: -p.y * s })));
        charOf.push(index);
      }
      x += (glyph?.advance ?? font.defaultAdvance) * s + trackingPx;
      if (!font.connected && index + 1 < chars.length) x += opticalKern(font, ch, chars[index + 1]) * s;
    });
    const lengths = strokes.map(polylineLengths);
    const startLen = [];
    let total = 0;
    for (const L of lengths) { startLen.push(total); total += L[L.length - 1] ?? 0; }
    const charRange = chars.map(() => [Infinity, -Infinity]);
    strokes.forEach((_, i) => {
      const range = charRange[charOf[i]];
      range[0] = Math.min(range[0], startLen[i]);
      range[1] = Math.max(range[1], startLen[i] + (lengths[i][lengths[i].length - 1] ?? 0));
    });
    let last = 0;
    for (const range of charRange) {
      if (range[0] === Infinity) { range[0] = last; range[1] = last; }
      last = range[1];
    }
    return { strokes, charOf, startLen, lengths, total, width: x - trackingPx, charRange, size, capHeight: font.capTop * s };
  },

  // Map time to written length so each character is written inside its own time slot.
  writtenLength(layout, charTimes, t) {
    let length = 0;
    for (let i = 0; i < layout.charRange.length; i += 1) {
      const [a, b] = layout.charRange[i];
      const [t0, t1] = charTimes[i] ?? [Infinity, Infinity];
      if (t >= t1) length = b;
      else if (t > t0) { length = a + (b - a) * ((t - t0) / Math.max(1e-3, t1 - t0)); break; }
      else break;
    }
    return length;
  },

  // Draw the first `length` px of the layout at baseline (x, y); returns the ink bbox or null.
  draw(layer, layout, x, y, length, { stroke, width = 3, opacity = 1 }) {
    const c = layer.ctx;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (px, py) => { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); };
    c.save();
    c.globalAlpha = opacity;
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i < layout.strokes.length; i += 1) {
      const s0 = layout.startLen[i];
      if (s0 >= length) break;
      const pts = layout.strokes[i], L = layout.lengths[i];
      const remain = length - s0;
      c.moveTo(x + pts[0].x, y + pts[0].y);
      grow(x + pts[0].x, y + pts[0].y);
      let j = 1;
      for (; j < pts.length && L[j] <= remain; j += 1) { c.lineTo(x + pts[j].x, y + pts[j].y); grow(x + pts[j].x, y + pts[j].y); }
      if (j < pts.length) {
        const a = pts[j - 1], b = pts[j];
        const u = (remain - L[j - 1]) / Math.max(1e-6, L[j] - L[j - 1]);
        const px = x + a.x + (b.x - a.x) * u, py = y + a.y + (b.y - a.y) * u;
        c.lineTo(px, py);
        grow(px, py);
      }
    }
    c.stroke();
    c.restore();
    layer.drawn = true;
    if (x1 < x0) return null;
    const pad = width / 2;
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  },
};

function parseStrokePath(d) {
  const out = [];
  const tokens = d.match(/[MLml]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
  let current = null;
  let command = 'M';
  for (let i = 0; i < tokens.length;) {
    const token = tokens[i];
    if (/[MLml]/.test(token)) { command = token.toUpperCase(); i += 1; continue; }
    const x = parseFloat(tokens[i]), y = parseFloat(tokens[i + 1]);
    i += 2;
    if (command === 'M') { current = [{ x, y }]; out.push(current); command = 'L'; }
    else current?.push({ x, y });
  }
  return out;
}

function polylineLengths(points) {
  const L = new Float32Array(points.length);
  for (let i = 1; i < points.length; i += 1) L[i] = L[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return L;
}

// Tighten only pairs where one side overhangs (T, V, W, Y, A, L, r, f and similar): measured from
// ink extents at the shared height band, capped at 12% of the em. Plain pairs keep the sidebearings.
const OVERHANG_RIGHT = new Set('AFLPTVWYKXfrvwyk7'.split(''));
const OVERHANG_LEFT = new Set('AJTVWYXvwyj.,'.split(''));
function opticalKern(font, a, b) {
  if (!(OVERHANG_RIGHT.has(a) || OVERHANG_LEFT.has(b))) return 0;
  const ga = font.glyphs.get(a), gb = font.glyphs.get(b);
  if (!ga || !gb || !ga.strokes.length || !gb.strokes.length) return 0;
  const bands = 12;
  const top = font.capTop;
  let closest = Infinity;
  for (let band = 0; band < bands; band += 1) {
    const lo = (band / bands) * top, hi = ((band + 1) / bands) * top;
    const right = Math.max(-Infinity, ...ga.strokes.flat().filter((p) => p.y >= lo && p.y <= hi).map((p) => p.x));
    const left = Math.min(Infinity, ...gb.strokes.flat().filter((p) => p.y >= lo && p.y <= hi).map((p) => p.x));
    if (Number.isFinite(right) && Number.isFinite(left)) closest = Math.min(closest, ga.advance + left - right);
  }
  if (!Number.isFinite(closest)) return 0;
  const target = 0.12 * font.upm;
  return Math.max(-0.12 * font.upm, Math.min(0, 0.6 * (target - closest)));
}
