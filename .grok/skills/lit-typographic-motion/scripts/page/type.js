// Type kit: real outline fonts through opentype.js, kerning-table layout, per-glyph positioning,
// and the type geometry every frame line reports (MO-A-32, §A8). Adapted from pdoom-video
// app/src/engine/type.ts (MIT, see NOTICE): positions here come from the font's own advance and
// kerning tables instead of Canvas2D measureText, so glyph ink bounds are exact outline geometry.
const Type = {
  fonts: new Map(),
  meta: new Map(),

  register(key, base64, meta) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const font = opentype.parse(bytes.buffer);
    this.fonts.set(key, font);
    const os2 = font.tables.os2;
    const upm = font.unitsPerEm;
    const capUnits = os2 && os2.sCapHeight ? os2.sCapHeight : (font.charToGlyph('H').getBoundingBox().y2 || upm * 0.7);
    this.meta.set(key, { ...meta, upm, cap: capUnits / upm, ascender: font.ascender / upm, descender: font.descender / upm });
  },

  font(key) {
    const font = this.fonts.get(key);
    if (!font) throw new Error(`font not loaded: ${key}`);
    return font;
  },

  // Split a string into script runs with their fonts (MO-FT-04). Hangul runs never take tracking.
  runs(text, pair) {
    const out = [];
    for (const run of Engine.scriptRuns(text)) {
      const key = run.script === 'hangul' ? (pair.hangul ?? pair.latin) : (pair.latin ?? pair.hangul);
      const last = out.at(-1);
      if (last && last.key === key && last.script === run.script) last.text += run.text;
      else out.push({ text: run.text, script: run.script, key });
    }
    return out;
  },

  // Kerned per-glyph layout of one run: x of glyph i includes the kern between i-1 and i, so a word
  // drawn in pieces lands exactly where the whole run would (glyphX, MO-A-32).
  layoutRun(text, key, size, trackingPx) {
    const font = this.font(key);
    const scale = size / font.unitsPerEm;
    const glyphs = [];
    let x = 0;
    let previous = null;
    for (const ch of Array.from(text)) {
      const glyph = font.charToGlyph(ch);
      if (previous) x += font.getKerningValue(previous, glyph) * scale + trackingPx;
      glyphs.push({ ch, glyph, x, advance: glyph.advanceWidth * scale });
      x += glyph.advanceWidth * scale;
      previous = glyph;
    }
    return { glyphs, width: x, size, key };
  },

  // Layout a mixed-script line: runs placed side by side. trackingEm applies to Latin runs only.
  layoutLine(text, pair, size, { trackingEm = 0, hangulScale = 1 } = {}) {
    const runs = this.runs(text, pair);
    let x = 0;
    const placed = runs.map((run) => {
      const runSize = run.script === 'hangul' ? size * hangulScale : size;
      const tracking = run.script === 'hangul' ? 0 : trackingEm * runSize;
      const layout = this.layoutRun(run.text, run.key, runSize, tracking);
      const item = { ...run, layout, x, size: runSize, trackingEm: run.script === 'hangul' ? 0 : trackingEm };
      x += layout.width + (run.script === 'hangul' ? 0 : tracking);
      return item;
    });
    return { text, runs: placed, width: x, size };
  },

  glyphX(line, index) {
    let count = 0;
    for (const run of line.runs) {
      for (const glyph of run.layout.glyphs) {
        if (count === index) return run.x + glyph.x;
        count += 1;
      }
    }
    return line.width;
  },

  fit(text, pair, maxWidth, maxSize, options = {}) {
    const probe = this.layoutLine(text, pair, 100, options);
    return Math.min(maxSize, (100 * maxWidth) / Math.max(1, probe.width));
  },

  // Draw a laid-out line on a Canvas2D layer at baseline (x, y) with an optional uniform scale about
  // an origin, and report one textBoxes entry per script run (bbox from glyph outline bounds, after
  // the element transform). The post chain's shake/zoom is applied to these boxes by the engine.
  draw(layer, line, x, y, { fill, opacity = 1, scale = 1, origin = null, elementId, voice, reveal = null, weight }) {
    const c = layer.ctx;
    const ox = origin ? origin[0] : x, oy = origin ? origin[1] : y;
    const map = (px, py) => [ox + (px - ox) * scale, oy + (py - oy) * scale];
    const boxes = [];
    if (opacity <= 0) return boxes;
    c.save();
    c.globalAlpha = opacity;
    c.fillStyle = fill;
    let glyphIndex = 0;
    for (const run of line.runs) {
      const font = this.font(run.key);
      const unit = run.size / font.unitsPerEm;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      let visibleText = '';
      c.beginPath();
      for (const g of run.layout.glyphs) {
        const visible = reveal === null || glyphIndex < reveal;
        glyphIndex += 1;
        if (!visible) continue;
        visibleText += g.ch;
        const gx = x + run.x + g.x;
        const bounds = g.glyph.getBoundingBox();
        if (bounds.x2 > bounds.x1 || bounds.y2 > bounds.y1) {
          const a = map(gx + bounds.x1 * unit, y - bounds.y2 * unit);
          const b = map(gx + bounds.x2 * unit, y - bounds.y1 * unit);
          x0 = Math.min(x0, a[0]); y0 = Math.min(y0, a[1]); x1 = Math.max(x1, b[0]); y1 = Math.max(y1, b[1]);
        }
        for (const cmd of g.glyph.path.commands) {
          const p = cmd.x === undefined ? null : map(gx + cmd.x * unit, y - cmd.y * unit);
          if (cmd.type === 'M') c.moveTo(p[0], p[1]);
          else if (cmd.type === 'L') c.lineTo(p[0], p[1]);
          else if (cmd.type === 'Q') { const q = map(gx + cmd.x1 * unit, y - cmd.y1 * unit); c.quadraticCurveTo(q[0], q[1], p[0], p[1]); }
          else if (cmd.type === 'C') { const q1 = map(gx + cmd.x1 * unit, y - cmd.y1 * unit); const q2 = map(gx + cmd.x2 * unit, y - cmd.y2 * unit); c.bezierCurveTo(q1[0], q1[1], q2[0], q2[1], p[0], p[1]); }
          else if (cmd.type === 'Z') c.closePath();
        }
      }
      c.fill();
      if (x1 > x0) {
        const meta = this.meta.get(run.key);
        boxes.push({
          elementId, text: visibleText, voice, fontFile: meta.file, fontSizePx: round2(run.size * scale), capHeightPx: round2(meta.cap * run.size * scale),
          weight: weight ?? meta.weight, fill: fill === 'gradient' ? 'gradient' : fill, bbox: [round2(x0), round2(y0), round2(x1), round2(y1)],
          script: run.script, trackingEm: run.trackingEm, opacity: round2(opacity), fontKey: run.key,
        });
      }
    }
    c.restore();
    layer.drawn = true;
    return boxes;
  },
};

const round2 = (v) => Math.round(v * 100) / 100;
