// The six original starter scenes. A scene is created once per shot (layout computed from real
// font metrics) and render(f, api) is a pure function of f.t: it paints type, rules and graphics
// through `api` and returns post overrides (MO-A-05). Beats anchor to f.p / f.lt, never to literal
// frame numbers (MO-A-06). Motion uses the preset's named tokens only (MO-A-08, MO-B-01..03).
const MARGIN = 144; // inside the 96 px title-safe margin with room for entrance motion
const CONTENT_W = 1920 - 2 * MARGIN;
const TYPE_IN_CPS = 22; // terminalcore `type-in` (MO-SH-11 u_logLineRateCharsPerSec default)

function wrapLines(text, pair, size, maxWidth, maxLines, options) {
  const words = text.split(/\s+/u).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || Type.layoutLine(candidate, pair, size, options).width <= maxWidth) current = candidate;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length <= maxLines ? lines : null;
}

// Largest size (<= maxSize) at which the text fits in maxWidth on at most maxLines lines, never
// breaking inside a 어절 (lines break only at spaces).
function fitBlock(text, pair, maxWidth, maxSize, minSize, maxLines, options = {}) {
  if (options.preferOneLineAbove) {
    for (let size = maxSize; size >= options.preferOneLineAbove; size -= 2) {
      if (Type.layoutLine(text, pair, size, options).width <= maxWidth) return { size, lines: [text] };
    }
  }
  for (let size = maxSize; size >= minSize; size -= 2) {
    const lines = wrapLines(text, pair, size, maxWidth, maxLines, options);
    if (lines && lines.every((line) => Type.layoutLine(line, pair, size, options).width <= maxWidth)) return { size, lines };
  }
  const size = minSize;
  return { size, lines: wrapLines(text, pair, size, maxWidth, 99, options) ?? [text] };
}

const typeInCount = (lt, chars) => Math.min(chars, Math.floor(Math.max(0, lt) * TYPE_IN_CPS));

// MO-C-26: a block showing 2+ lines at once uses 1.5 (Latin) or 1.6 (Hangul/mixed); a single
// display line keeps its tight 1.1 leading because no second line exists.
const scriptOfText = (text) => { const runs = scriptRuns(text); return runs.every((r) => r.script === 'latin') ? 'latin' : runs.every((r) => r.script === 'hangul') ? 'hangul' : 'mixed'; };
const blockLeading = (lines, script) => (lines > 1 ? (script === 'latin' ? 1.5 : 1.6) : 1.1);

function drawAnnotation(api, shot, palette) {
  if (!shot.annotation) return;
  const pair = { latin: 'meslo', hangul: 'hangul-400' };
  const line = Type.layoutLine(shot.annotation, pair, 22);
  api.text('annotation', line, 1920 - MARGIN - line.width, 128, { fill: palette.dim, voice: 'machine' });
}

function drawAccent(api, f, shot, palette, x, y) {
  if (!f.accentOn || !palette.accent) return;
  api.rect('accent-mark', x, y, 28, 28, { hex: palette.accent, accent: true });
}

// Terminal window chrome (the terminal-ui layer, MO-SH-11): 1.5 px frame, title bar, status bar
// with two meters. Cosmetic jitter only comes from the shot seed, never content or timing.
function drawTerminalChrome(api, f, shot, palette, label) {
  const x = 120, y = 96, w = 1680, h = 888;
  api.rect('window', x, y, w, h, { hex: palette.panel, fill: true, chrome: true });
  api.rect('title-bar', x, y, w, 44, { hex: palette.bar, fill: true, chrome: true });
  const barY = y + h - 52;
  api.rect('status-bar', x, barY, w, 52, { hex: palette.bar, fill: true, chrome: true });
  api.rect('window-frame', x, y, w, h, { hex: palette.signal, stroke: 1.5, chrome: true, alpha: 0.85 });
  api.text('title-label', Type.layoutLine(label, { latin: 'silkscreen-400', hangul: 'hangul-400' }, 22), x + 20, y + 30, { fill: palette.label, voice: 'chrome' });
  const jitter = hash01(shot.seed, Math.floor(f.t * 4));
  for (let i = 0; i < 2; i += 1) {
    const mx = x + 640 + i * 300;
    const level = 0.35 + 0.4 * hash01(shot.seed, i) + 0.08 * jitter;
    api.rect(`meter-${i}`, mx, barY + 21, 220, 10, { hex: palette.dim, stroke: 1, chrome: true });
    api.rect(`meter-fill-${i}`, mx, barY + 21, 220 * Math.min(1, level), 10, { hex: palette.signal, fill: true, chrome: true, alpha: 0.9 });
  }
  const clock = `T+${f.t.toFixed(2).padStart(6, '0')}s`;
  api.text('status', Type.layoutLine(clock, { latin: 'meslo', hangul: 'hangul-400' }, 24), x + 24, barY + 34, { fill: palette.label, voice: 'machine' });
}

function caret(api, palette, x, baseline, size, f) {
  const on = Math.floor(f.lt * 2 * 1.2) % 2 === 0; // u_caretBlinkHz 1.2
  if (on) api.rect('caret', x + size * 0.08, baseline - size * 0.72, size * 0.5, size * 0.78, { hex: palette.signal, fill: true, alpha: 0.9 });
}

const SceneKinds = {
  'title-slam': {
    create(shot, preset) {
      const pair = shot.fonts;
      if (preset.id === 'terminalcore') {
        const minSize = pair.latin === 'galmuri9' || pair.hangul === 'galmuri9' ? 45 : 40;
        const block = fitBlock(shot.text, pair, 1680 - 160, 150, minSize, 2);
        return { block, lines: block.lines.map((line) => Type.layoutLine(line, pair, block.size)) };
      }
      const options = { hangulScale: 0.94, preferOneLineAbove: 150 };
      const block = fitBlock(shot.text, pair, CONTENT_W, 210, 64, 2, options);
      const widths = {};
      const pairs = {};
      for (const width of [75, 100, 125]) {
        pairs[width] = { latin: pair.latin.replace(/archivo-\d+-/, `archivo-${width}-`), hangul: pair.hangul };
        widths[width] = block.lines.map((line) => Type.layoutLine(line, pairs[width], block.size, options));
      }
      const finalWidth = preset.id === 'tidal' ? 100 : widths[125].every((line) => line.width <= CONTENT_W) ? 125 : 100;
      return { block, widths, pairs, finalWidth };
    },
    render(f, api, shot, state, preset) {
      const palette = preset.palette;
      const { block } = state;
      const leading = blockLeading(block.lines.length, shot.script);
      const lineHeight = block.size * leading;
      if (preset.id === 'terminalcore') {
        drawTerminalChrome(api, f, shot, palette, `LIT/MOTION ${shot.index + 1}`);
        let remaining = typeInCount(f.lt, state.lines.reduce((sum, line) => sum + Array.from(line.text).length, 0));
        let baseline = 540 - ((block.lines.length - 1) * lineHeight) / 2 + block.size * 0.35;
        let lastX = 200, lastBase = baseline;
        for (const [i, line] of state.lines.entries()) {
          const count = Math.min(Array.from(line.text).length, remaining);
          remaining -= count;
          api.text(`title-${i}`, line, 200, baseline, { fill: palette.fg, voice: 'display', reveal: count });
          if (count > 0) { lastX = 200 + Type.glyphX(line, count); lastBase = baseline; }
          baseline += lineHeight;
        }
        if (block.lines.length > 1) api.block('title', block.lines.length, leading, shot.script);
        caret(api, palette, lastX, lastBase, block.size, f);
        return {};
      }
      const tidal = preset.id === 'tidal';
      const enter = tidal ? prog(f.lt, 0, 0.9, ease.drift) : prog(f.lt, 0, 0.18, ease.slam);
      const width = tidal ? 100 : f.lt < 0.06 ? 75 : f.lt < 0.12 ? 100 : state.finalWidth;
      const lines = state.widths[width];
      const scale = tidal ? 1 : 0.95 + 0.05 * enter;
      const tracking = tidal ? 0 : -0.02 * (1 - enter);
      const lift = tidal ? 18 * (1 - enter) : 0;
      let baseline = (tidal ? 560 : 610) - ((lines.length - 1) * lineHeight) / 2 + lift;
      const top = baseline - block.size;
      for (const [i, line0] of lines.entries()) {
        const line = tracking ? Type.layoutLine(line0.text, state.pairs[width], block.size, { trackingEm: tracking, hangulScale: 0.94 }) : line0;
        api.text(`title-${i}`, line, MARGIN, baseline, { fill: palette.fg, voice: 'display', opacity: enter, scale, origin: [MARGIN, baseline] });
        baseline += lineHeight;
      }
      if (lines.length > 1) api.block('title', lines.length, leading, shot.script);
      if (!tidal) {
        api.rule(MARGIN, 168, 1920 - MARGIN, 168, { hex: palette.graphite, width: 1 });
        api.rule(MARGIN, baseline - lineHeight + block.size * 0.32, MARGIN + 260 * enter, baseline - lineHeight + block.size * 0.32, { hex: palette.signal, width: 3 });
      } else {
        api.rule(MARGIN, 932, MARGIN + 180, 932, { hex: palette.dim, width: 1 });
      }
      drawAnnotation(api, shot, palette);
      drawAccent(api, f, shot, palette, MARGIN, top - 80);
      return {};
    },
  },

  'karaoke-line': {
    create(shot, preset) {
      const pair = shot.fonts;
      const terminal = preset.id === 'terminalcore';
      const minSize = terminal && (pair.latin === 'galmuri9' || pair.hangul === 'galmuri9') ? 45 : 40;
      const block = fitBlock(shot.text, pair, terminal ? 1680 - 160 : CONTENT_W, terminal ? 96 : 104, minSize, 3);
      const lines = block.lines.map((line) => Type.layoutLine(line, pair, block.size));
      // Word index -> (line, first glyph, glyph count) so each 어절 lights up as one unit.
      const words = [];
      lines.forEach((line, lineIndex) => {
        let glyph = 0;
        for (const word of line.text.split(' ')) {
          words.push({ lineIndex, first: glyph, count: Array.from(word).length });
          glyph += Array.from(word).length + 1;
        }
      });
      return { block, lines, words };
    },
    render(f, api, shot, state, preset) {
      const palette = preset.palette;
      const terminal = preset.id === 'terminalcore';
      const tidal = preset.id === 'tidal';
      const { block, lines, words } = state;
      const lineHeight = block.size * 1.6;
      const baseline0 = (terminal ? 540 : tidal ? 540 : 600) - ((lines.length - 1) * lineHeight) / 2;
      const x = terminal ? 200 : MARGIN;
      if (terminal) drawTerminalChrome(api, f, shot, palette, `LIT/MOTION ${shot.index + 1}`);
      let revealed = 0;
      for (const step of shot.steps) if (f.t >= step.startFrame / f.fps - 1e-9) revealed += 1;
      let caretX = x, caretBase = baseline0;
      lines.forEach((line, lineIndex) => {
        const baseline = baseline0 + lineIndex * lineHeight;
        const lineWords = words.map((word, index) => ({ ...word, index })).filter((word) => word.lineIndex === lineIndex);
        if (terminal) {
          let visibleGlyphs = 0;
          for (const word of lineWords) {
            if (word.index >= revealed) break;
            const step = shot.steps[word.index];
            const since = f.t - step.startFrame / f.fps;
            const typed = word.index < revealed - 1 ? word.count : typeInCount(since, word.count);
            visibleGlyphs = word.first + typed;
          }
          if (visibleGlyphs > 0) {
            api.text(`line-${lineIndex}`, line, x, baseline, { fill: palette.fg, voice: 'body', reveal: visibleGlyphs });
            caretX = x + Type.glyphX(line, visibleGlyphs); caretBase = baseline;
          }
          return;
        }
        // Pending 어절 sit in the dim tone (still >= 4.5:1); a revealed 어절 steps to the full ink.
        api.text(`line-${lineIndex}-dim`, line, x, baseline + (tidal ? 10 * (1 - prog(f.lt, 0, 1.2, ease.drift)) : 0), { fill: palette.dim, voice: 'body', opacity: tidal ? prog(f.lt, 0, 0.6, ease.drift) : 1 });
        const lastRevealed = lineWords.filter((word) => word.index < revealed).at(-1);
        if (lastRevealed) {
          const glyphs = lastRevealed.first + lastRevealed.count;
          const step = shot.steps[lastRevealed.index];
          const since = f.t - step.startFrame / f.fps;
          const pop = tidal ? prog(since, 0, 0.4, ease.drift) : prog(since, 0, 0.18, ease.slam);
          if (lastRevealed.first > 0) api.text(`line-${lineIndex}-lit`, line, x, baseline, { fill: palette.fg, voice: 'body', reveal: lastRevealed.first });
          const word = Type.layoutLine(line.text.split(' ')[lineWords.indexOf(lastRevealed)], shot.fonts, block.size);
          api.text(`line-${lineIndex}-word`, word, x + Type.glyphX(line, lastRevealed.first), baseline, { fill: palette.fg, voice: 'body', opacity: 0.35 + 0.65 * pop, reveal: glyphs - lastRevealed.first });
        }
      });
      api.block('line', lines.length, 1.6, shot.script);
      if (terminal) caret(api, palette, caretX, caretBase, block.size, f);
      else {
        api.rule(MARGIN, 168, 1920 - MARGIN, 168, { hex: palette.graphite ?? palette.dim, width: 1 });
        drawAnnotation(api, shot, palette);
        drawAccent(api, f, shot, palette, MARGIN, baseline0 - block.size - 90);
      }
      return {};
    },
  },

  'kinetic-list': {
    create(shot, preset) {
      const size = Math.min(84, Math.max(44, Math.floor(560 / (shot.items.length * 1.6))));
      const lines = shot.items.map((item) => {
        const fitted = fitBlock(item, shot.fonts, preset.id === 'terminalcore' ? 1360 : CONTENT_W - 120, size, 36, 1);
        return Type.layoutLine(fitted.lines[0], shot.fonts, fitted.size);
      });
      return { size, lines };
    },
    render(f, api, shot, state, preset) {
      const palette = preset.palette;
      const terminal = preset.id === 'terminalcore';
      const tidal = preset.id === 'tidal';
      const lineHeight = state.size * 1.6;
      const top = 540 - ((state.lines.length - 1) * lineHeight) / 2 + state.size * 0.35;
      if (terminal) drawTerminalChrome(api, f, shot, palette, `LIT/MOTION ${shot.index + 1}`);
      let shown = 0;
      state.lines.forEach((line, index) => {
        const step = shot.steps[index];
        const since = f.t - step.startFrame / f.fps;
        if (since < 0) return;
        shown += 1;
        const baseline = top + index * lineHeight;
        const x = terminal ? 240 : MARGIN + 120;
        if (terminal) {
          api.text(`item-${index}`, line, x, baseline, { fill: palette.fg, voice: 'body', reveal: typeInCount(since, Array.from(line.text).length) });
          api.text(`item-${index}-bullet`, Type.layoutLine('>', { latin: 'meslo', hangul: 'hangul-400' }, state.size * 0.6), x - 48, baseline, { fill: palette.signal, voice: 'machine' });
          return;
        }
        const enter = tidal ? prog(since, 0, 0.8, ease.drift) : prog(since, 0, 0.18, ease.slam);
        api.text(`item-${index}`, line, x - 24 * (1 - enter), baseline, { fill: palette.fg, voice: 'body', opacity: enter });
        api.rule(MARGIN, baseline - state.size * 0.32, MARGIN + 72 * enter, baseline - state.size * 0.32, { hex: tidal ? palette.dim : palette.signal, width: 3 });
      });
      if (shown > 1) api.block('list', shown, 1.6, shot.script);
      if (!terminal) { drawAnnotation(api, shot, palette); drawAccent(api, f, shot, palette, 1920 - MARGIN - 28, top - state.size - 60); }
      return {};
    },
  },

  'number-counter': {
    create(shot) {
      const digits = String(Math.abs(shot.value)).length + (shot.value < 0 ? 1 : 0);
      const size = Math.min(140, Math.floor(1400 / Math.max(4, digits)));
      const label = shot.label ? fitBlock(shot.label, shot.fonts.label, CONTENT_W, 56, 32, 1) : null;
      return { size, label: label ? Type.layoutLine(label.lines[0], shot.fonts.label, label.size) : null };
    },
    render(f, api, shot, state, preset) {
      const palette = preset.palette;
      const terminal = preset.id === 'terminalcore';
      const tidal = preset.id === 'tidal';
      if (terminal) drawTerminalChrome(api, f, shot, palette, `LIT/MOTION ${shot.index + 1}`);
      // The count steps at 15 Hz so digits never change every frame; it settles by 55% of the hold.
      const tq = Math.floor(f.lt * 15) / 15;
      const p = prog(tq, 0, f.dur * 0.55, terminal ? ease.linear : ease.outCubic);
      const value = Math.round(shot.value * p);
      const text = String(value).padStart(String(Math.abs(shot.value)).length, '0');
      const line = Type.layoutLine(text, shot.fonts.number, state.size);
      const x = terminal ? 240 : MARGIN;
      const baseline = 520;
      api.text('counter', line, x, baseline, { fill: palette.fg, voice: 'machine', opacity: tidal ? prog(f.lt, 0, 0.6, ease.drift) : 1 });
      if (state.label) api.text('counter-label', state.label, x, baseline + state.size * 0.9, { fill: palette.dim, voice: 'body', opacity: prog(f.lt, 0.2, 0.6, tidal ? ease.drift : ease.slam) });
      if (!terminal) {
        api.rule(MARGIN, 168, 1920 - MARGIN, 168, { hex: palette.graphite ?? palette.dim, width: 1 });
        drawAnnotation(api, shot, palette);
        drawAccent(api, f, shot, palette, x + line.width + 32, baseline - state.size * 0.7);
      }
      return {};
    },
  },

  'stroke-signature': {
    create(shot) {
      const key = shot.fonts.latin;
      let size = 130;
      let layout = Stroke.layout(shot.text, key, size);
      if (layout.width > CONTENT_W) { size = Math.floor((size * CONTENT_W) / layout.width); layout = Stroke.layout(shot.text, key, size); }
      const chars = Array.from(shot.text);
      const total = layout.total || 1;
      const writeSec = shot.revealSec;
      let acc = 0;
      const charTimes = layout.charRange.map(([a, b]) => { const t0 = (a / total) * writeSec; acc = (b / total) * writeSec; return [t0, Math.max(t0 + 1e-3, acc)]; });
      return { layout, size, charTimes, chars };
    },
    render(f, api, shot, state, preset) {
      const palette = preset.palette;
      if (preset.id === 'terminalcore') drawTerminalChrome(api, f, shot, palette, `LIT/MOTION ${shot.index + 1}`);
      const length = Stroke.writtenLength(state.layout, state.charTimes, f.lt);
      const x = preset.id === 'terminalcore' ? 200 : MARGIN;
      api.strokeText('signature', state.layout, x, 600, length, { hex: palette.fg, width: Math.max(2.5, state.size / 40), fontKey: shot.fonts.latin, text: shot.text });
      if (preset.id !== 'terminalcore') {
        api.rule(MARGIN, 668, MARGIN + (state.layout.width) * prog(f.lt, 0, shot.revealSec, ease.linear), 668, { hex: palette.graphite ?? palette.dim, width: 1 });
        drawAnnotation(api, shot, palette);
        drawAccent(api, f, shot, palette, MARGIN, 380);
      }
      return {};
    },
  },

  'end-card': {
    create(shot, preset) {
      const terminal = preset.id === 'terminalcore';
      const title = fitBlock(shot.title, shot.fonts.title, terminal ? 1360 : CONTENT_W, terminal ? 120 : 150, terminal ? 45 : 56, 2, { preferOneLineAbove: terminal ? 72 : 96 });
      const note = shot.note ? fitBlock(shot.note, shot.fonts.note, CONTENT_W, 30, 24, 1) : null;
      return {
        title, titleLines: title.lines.map((line) => Type.layoutLine(line, shot.fonts.title, title.size)),
        note: note ? Type.layoutLine(note.lines[0], shot.fonts.note, note.size) : null,
      };
    },
    render(f, api, shot, state, preset) {
      const palette = preset.palette;
      const terminal = preset.id === 'terminalcore';
      const tidal = preset.id === 'tidal';
      const leading = blockLeading(state.titleLines.length, scriptOfText(shot.title));
      const lineHeight = state.title.size * leading;
      const x = terminal ? 200 : MARGIN;
      let baseline = 520 - ((state.titleLines.length - 1) * lineHeight) / 2;
      if (terminal) drawTerminalChrome(api, f, shot, palette, `LIT/MOTION ${shot.index + 1}`);
      const enter = terminal ? 1 : tidal ? prog(f.lt, 0, 1.0, ease.drift) : prog(f.lt, 0, 0.18, ease.slam);
      let typed = terminal ? typeInCount(f.lt, 999) : Infinity;
      for (const [i, line] of state.titleLines.entries()) {
        const count = terminal ? Math.min(Array.from(line.text).length, typed) : null;
        if (terminal) typed -= count;
        api.text(`end-${i}`, line, x, baseline + (tidal ? 14 * (1 - enter) : 0), { fill: palette.fg, voice: 'display', opacity: enter, reveal: count });
        baseline += lineHeight;
      }
      if (state.titleLines.length > 1) api.block('end-title', state.titleLines.length, leading, scriptOfText(shot.title));
      if (state.note) api.text('end-note', state.note, x, baseline + 36, { fill: palette.dim, voice: 'machine', opacity: prog(f.lt, 0.3, 0.8, tidal ? ease.drift : ease.slam) });
      if (!terminal) {
        api.rule(MARGIN, 168, 1920 - MARGIN, 168, { hex: palette.graphite ?? palette.dim, width: 1 });
        api.rule(MARGIN, 912, 1920 - MARGIN, 912, { hex: palette.graphite ?? palette.dim, width: 1 });
        drawAnnotation(api, shot, palette);
        drawAccent(api, f, shot, palette, 1920 - MARGIN - 28, 880);
      }
      return {};
    },
  },
};
