// Stage text QA (brief section 6g). It runs in its own replay Chrome, never in the master capture:
// the clock is stepped sequentially, every run is read at 10 fps, and at each QA sample (every beat
// midpoint plus two settled frames per beat) the frame is captured with the text shown (A) and with
// every glyph made transparent (B). The ink mask is where A and B differ inside the run's rects.
// evaluateQa() is pure over those recorded facts.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_ROOT } from './fonts.mjs';
import { measureContrast } from './gate.mjs';
import { measureFrame } from './frame-pool.mjs';
import { openStage } from './stage-session.mjs';
import { readingFloor } from './text.mjs';
import { normalize } from './treatment.mjs';

export const INTERNAL_TERMS = Object.freeze(['path', 'preset', 'gate', 'beat', 'treatment']);
const QA_SCRIPT = join(SKILL_ROOT, 'scripts', 'stage', 'qa.js');
const LUT = Float64Array.from({ length: 256 }, (_, v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
const pass = (id, detail = '') => ({ id, status: 'PASS', detail });
const fail = (id, detail) => ({ id, status: 'FAIL', detail });
const warn = (id, detail) => ({ id, status: 'WARN', detail });

// Title-safe and action-safe are 5 % and 2.5 % insets of the actual frame (portrait included).
export const safeBox = (width, height, inset = 0.05) => [width * inset, height * inset, width * (1 - inset), height * (1 - inset)];

export function qaPlan(beats, fps, totalFrames) {
  const step = Math.max(1, Math.round(fps / 10));
  const snap = (f) => Math.max(0, Math.min(Math.floor((totalFrames - 1) / step) * step, Math.round(f / step) * step));
  const samples = new Map();
  [...beats].sort((a, b) => a.t0 - b.t0).forEach((beat, i) => {
    const at = (p) => snap((beat.t0 + (beat.t1 - beat.t0) * p) * fps);
    samples.set(at(0.5), { beat: i, kind: 'mid' });
    for (const p of [0.3, 0.75]) if (!samples.has(at(p))) samples.set(at(p), { beat: i, kind: 'settle' });
  });
  return { step, samples };
}

const bboxOf = (rects) => (rects.length ? [Math.min(...rects.map((r) => r[0])), Math.min(...rects.map((r) => r[1])), Math.max(...rects.map((r) => r[2])), Math.max(...rects.map((r) => r[3]))] : null);
const area = (rects) => rects.reduce((sum, r) => sum + Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]), 0);

function keyOf(run, width, height) {
  const box = bboxOf(run.rects);
  const cx = box ? (box[0] + box[2]) / 2 : 0, cy = box ? (box[1] + box[3]) / 2 : 0;
  return `${normalize(run.text)}@${Math.min(2, Math.floor((cx / width) * 3))}${Math.min(2, Math.floor((cy / height) * 3))}`;
}

// sfnt name table: every family, subfamily, full and PostScript name the face reports.
export function fontNames(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names = new Set();
  const tables = view.getUint16(4);
  for (let i = 0; i < tables; i += 1) {
    const record = 12 + i * 16;
    if (String.fromCharCode(...bytes.subarray(record, record + 4)) !== 'name') continue;
    const base = view.getUint32(record + 8);
    const count = view.getUint16(base + 2), strings = base + view.getUint16(base + 4);
    for (let j = 0; j < count; j += 1) {
      const r = base + 6 + j * 12;
      const platform = view.getUint16(r), nameId = view.getUint16(r + 6), length = view.getUint16(r + 8), offset = view.getUint16(r + 10);
      if (![1, 4, 6, 16].includes(nameId)) continue;
      const raw = bytes.subarray(strings + offset, strings + offset + length);
      let text = '';
      if (platform === 3 || platform === 0) for (let k = 0; k + 1 < raw.length; k += 2) text += String.fromCharCode((raw[k] << 8) | raw[k + 1]);
      else text = String.fromCharCode(...raw);
      if (text.trim()) names.add(text.trim());
    }
  }
  return names;
}

function inkStats(a, b, width, height, runs) {
  const masks = new Map();
  const grown = runs.flatMap((run) => run.rects.map((r) => [Math.floor(r[0]) - 4, Math.floor(r[1]) - 4, Math.ceil(r[2]) + 4, Math.ceil(r[3]) + 4]));
  const insideAny = (x, y) => grown.some((r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3]);
  let moved = 0;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const o = (y * width + x) * 4;
      const inside = insideAny(x, y);
      if (!inside) {
        if (Math.abs(a[o] - b[o]) > 2 || Math.abs(a[o + 1] - b[o + 1]) > 2 || Math.abs(a[o + 2] - b[o + 2]) > 2) moved += 1;
        const l = 0.2126 * LUT[b[o]] + 0.7152 * LUT[b[o + 1]] + 0.0722 * LUT[b[o + 2]];
        sum += l; sumSq += l * l; n += 1;
      }
    }
  }
  const std = n ? Math.sqrt(Math.max(0, sumSq / n - (sum / n) ** 2)) : 0;
  for (const run of runs) {
    const mask = new Uint8Array(width * height);
    let ink = 0;
    for (const [x0, y0, x1, y1] of run.rects.map((r) => r.map(Math.round))) {
      for (let y = Math.max(0, y0); y < Math.min(height, y1); y += 1) {
        for (let x = Math.max(0, x0); x < Math.min(width, x1); x += 1) {
          const o = (y * width + x) * 4;
          if (Math.abs(a[o] - b[o]) > 2 || Math.abs(a[o + 1] - b[o + 1]) > 2 || Math.abs(a[o + 2] - b[o + 2]) > 2) { if (!mask[y * width + x]) { mask[y * width + x] = 255; ink += 1; } }
        }
      }
    }
    masks.set(run.id, { mask, ink });
  }
  return { masks, moved, nonTextStd: std };
}

function rgb3(rgba) {
  const out = Buffer.alloc((rgba.length / 4) * 3);
  for (let i = 0, o = 0; i < rgba.length; i += 4, o += 3) { out[o] = rgba[i]; out[o + 1] = rgba[i + 1]; out[o + 2] = rgba[i + 2]; }
  return out;
}

export async function runStageQa({ executable, out, stageDir, width, height, fps, seed, fonts, treatment, totalFrames, log = () => {}, stepOrThrow, captureChecked, stop = { aborted: false } }) {
  const plan = qaPlan(treatment.beats, fps, totalFrames);
  const allowedFonts = new Set();
  for (const route of fonts.routes.values()) for (const name of fontNames(new Uint8Array(readFileSync(route.path)))) allowedFonts.add(name);
  const session = await openStage({ executable, outDir: out, stageDir, width, height, fps, seed, fonts, label: 'q', log });
  const grid = [];
  const samples = [];
  let canvasTextCalls = 0;
  try {
    await session.load();
    await session.evaluate(readFileSync(QA_SCRIPT, 'utf8'));
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    for (let f = 0; f < totalFrames; f += 1) {
      if (stop.aborted) throw new Error('QA replay stopped: the master render failed');
      const sample = plan.samples.get(f);
      await stepOrThrow(session, f, fps, Boolean(sample));
      if (f % plan.step !== 0 && !sample) continue;
      const runs = (await session.evaluate('window.__litQa.runs()')).map((run) => ({ ...run, key: keyOf(run, width, height), norm: normalize(run.text) }));
      const report = await session.report();
      canvasTextCalls = report.canvasTextCalls;
      const texts = report.texts.map((t) => ({ ...t, norm: normalize(t.content), rects: [[t.x, t.y, t.x + t.w, t.y + t.h]] }));
      grid.push({ frame: f, runs, texts });
      if (!sample) continue;
      const a = measureFrame(await captureChecked(session, width, height), { flash: false });
      await session.evaluate('window.__litQa.snapshot(); window.__litQa.hide(); window.__litQa.cancelNew()');
      await session.evaluate('window.__litHost.settle()');
      const b = measureFrame(await captureChecked(session, width, height), { flash: false });
      await session.evaluate('window.__litQa.show(); window.__litQa.cancelNew()');
      const stats = inkStats(a.rgba, b.rgba, width, height, runs);
      const rgb = rgb3(a.rgba);
      const measured = runs.map((run) => {
        const { mask, ink } = stats.masks.get(run.id);
        const bbox = bboxOf(run.rects);
        const fontPx = run.fontSizePx * run.scale;
        const contrast = bbox && ink >= 12 ? measureContrast({ bbox, capHeightPx: fontPx, fill: run.gradient ? 'gradient' : 'solid' }, rgb, mask, width, height) : null;
        return { ...run, ink, contrast };
      });
      let fontsUsed = [];
      if (sample.kind === 'mid') {
        const { root } = await session.send('DOM.getDocument', { depth: 0 });
        for (const run of runs.filter((r) => r.opacity >= 0.6 && r.rects.length)) {
          try {
            const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-lit-qa="${run.id}"]` });
            if (!nodeId) continue;
            const { fonts: used } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
            fontsUsed.push({ id: run.id, key: run.key, fonts: used });
          } catch { /* the node left the document between reads */ }
        }
      }
      samples.push({ frame: f, beat: sample.beat, kind: sample.kind, runs: measured, texts, moved: stats.moved, nonTextStd: stats.nonTextStd, fonts: fontsUsed });
    }
  } finally { await session.close().catch(() => {}); }
  const fileNames = ['index.html', 'treatment.json', 'stage-kit.js', 'fonts.css', 'gate-report.txt'];
  return evaluateQa({ grid, samples, plan, treatment, width, height, fps, canvasTextCalls, allowedFonts, fileNames });
}

function wordHit(text, term) { return new RegExp(`(?<![\\p{L}\\p{N}])${term}(?![\\p{L}\\p{N}])`, 'iu').test(text); }

export function evaluateQa({ grid, samples, plan, treatment, width, height, fps, canvasTextCalls = 0, allowedFonts = new Set(), fileNames = [] }) {
  const copy = treatment.copy.lines.map(normalize).filter(Boolean);
  const isCopyText = (norm) => copy.some((line) => norm.includes(line) || line.includes(norm));
  const judgedAsCopy = (run) => !run.decor;
  const visible = (run) => run.opacity >= 0.6 && run.rects.length > 0;
  const results = [];
  const safe = safeBox(width, height);
  const largePx = 0.03 * Math.min(width, height);
  const minFloor = (text) => readingFloor(text, 'line');
  const details = { runsSeen: new Set(), settledSamples: 0, discarded: [] };

  // Copy found: every copy line appears, normalized, in some visible run or registered canvas text.
  const seenNorms = new Set();
  for (const g of grid) {
    for (const run of g.runs) if (visible(run)) seenNorms.add(run.norm);
    for (const t of g.texts) seenNorms.add(t.norm);
  }
  const missing = treatment.copy.lines.filter((line) => { const n = normalize(line); return n && ![...seenNorms].some((seen) => seen.includes(n)); });
  results.push(missing.length ? fail('QA-COPY', `copy line not on screen: "${missing[0]}"${missing.length > 1 ? ` (+${missing.length - 1} more)` : ''}`) : pass('QA-COPY', `${treatment.copy.lines.length} copy line(s) found on screen`));

  // Reading floor at 10 fps, 0.1 s tolerance, by normalized text (a line that moves stays readable).
  const stepSec = plan.step / fps;
  const spans = new Map();
  for (const g of grid) {
    const here = new Map();
    for (const run of [...g.runs.filter((r) => visible(r) && judgedAsCopy(r)), ...g.texts.filter((t) => !t.decor).map((t) => ({ ...t, text: t.content }))]) here.set(run.norm, run.text);
    for (const [norm, text] of here) {
      const span = spans.get(norm) ?? { text, current: 0, best: 0, last: null };
      span.current = span.last === g.frame - plan.step ? span.current + 1 : 1;
      span.last = g.frame;
      span.best = Math.max(span.best, span.current);
      spans.set(norm, span);
    }
  }
  const short = [...spans.values()].filter((s) => s.best * stepSec + 0.1 + 1e-9 < minFloor(s.text));
  const tightest = [...spans.values()].sort((a, b) => (a.best * stepSec - minFloor(a.text)) - (b.best * stepSec - minFloor(b.text)))[0];
  results.push(short.length ? fail('MO-C-07/08', `"${short[0].text}" is readable for ${(short[0].best * stepSec).toFixed(1)} s, under its ${minFloor(short[0].text).toFixed(1)} s floor`) : pass('MO-C-07/08', tightest ? `tightest "${tightest.text}" ${(tightest.best * stepSec).toFixed(1)} s vs floor ${minFloor(tightest.text).toFixed(1)} s` : 'no copy runs'));

  // Settled samples: the run's box moved under 2 px since both neighbouring 10 fps reads, opacity >= 0.95.
  const byFrame = new Map(grid.map((g) => [g.frame, new Map(g.runs.map((r) => [r.key, r]))]));
  const settled = (sample, run) => {
    if (run.opacity < 0.95 || !run.rects.length) return false;
    const box = bboxOf(run.rects);
    for (const neighbour of [sample.frame - plan.step, sample.frame + plan.step]) {
      const other = byFrame.get(neighbour)?.get(run.key);
      if (!other) continue;
      const ob = bboxOf(other.rects);
      if (!ob || Math.max(...box.map((v, i) => Math.abs(v - ob[i]))) >= 2) return false;
    }
    return true;
  };
  let contrastFail = null, contrastWarn = null, worst = null, safeFail = null;
  let decorCopy = null, decorShare = null, meta = null, fontIssue = null;
  let minCopyFontPx = null;
  const request = normalize(treatment.request), idea = normalize(treatment.idea);
  const files = fileNames.map(normalize).filter(Boolean);
  const presence = [];
  for (const sample of samples) {
    if (sample.moved > 0) { details.discarded.push(sample.frame); continue; }
    if (sample.kind === 'mid') presence.push(sample.nonTextStd > 8 / 255);
    const shown = sample.runs.filter((r) => visible(r) && r.ink >= 12);
    const textArea = area(shown.flatMap((r) => r.rects));
    const decorArea = area(shown.filter((r) => r.decor).flatMap((r) => r.rects));
    if (textArea > 0 && decorArea / textArea > 0.25 + 1e-9) decorShare ??= `frame ${sample.frame}: decor covers ${Math.round((decorArea / textArea) * 100)} % of the visible text area`;
    for (const run of shown) {
      details.runsSeen.add(run.key);
      if (run.decor && copy.some((line) => run.norm.includes(line))) decorCopy ??= `decor run "${run.text}" at frame ${sample.frame} carries a copy line`;
      if ((request.length >= 4 && run.norm.includes(request)) || (idea.length >= 4 && run.norm.includes(idea)) || files.some((file) => run.norm.includes(file)) || INTERNAL_TERMS.some((term) => wordHit(run.text, term))) meta ??= `"${run.text}" at frame ${sample.frame}`;
      const fontPx = run.fontSizePx * run.scale;
      if (judgedAsCopy(run)) minCopyFontPx = minCopyFontPx === null ? fontPx : Math.min(minCopyFontPx, fontPx);
      if (!settled(sample, run)) continue;
      details.settledSamples += 1;
      const box = bboxOf(run.rects);
      if (judgedAsCopy(run) && (box[0] < safe[0] - 0.5 || box[1] < safe[1] - 0.5 || box[2] > safe[2] + 0.5 || box[3] > safe[3] + 0.5)) safeFail ??= `"${run.text}" at frame ${sample.frame} reaches ${box.map(Math.round).join(',')} outside ${safe.map(Math.round).join(',')}`;
      if (run.contrast === null || run.contrast === undefined) continue;
      const floor = fontPx >= largePx ? 3.0 : 4.5;
      if (!worst || run.contrast / floor < worst.ratio / worst.floor) worst = { ratio: run.contrast, floor, frame: sample.frame, text: run.text };
      if (run.contrast < floor - 1e-9) {
        if (judgedAsCopy(run)) contrastFail ??= `"${run.text}" at frame ${sample.frame}: ${run.contrast.toFixed(2)}:1 < ${floor}:1`;
        else contrastWarn ??= `decor "${run.text}" at frame ${sample.frame}: ${run.contrast.toFixed(2)}:1 < ${floor}:1`;
      }
    }
    for (const entry of sample.fonts ?? []) {
      const run = sample.runs.find((r) => r.id === entry.id);
      const foreign = entry.fonts.filter((f) => f.glyphCount > 0 && !allowedFonts.has(f.familyName) && !allowedFonts.has(f.postScriptName));
      if (run && foreign.length) {
        const issue = { copy: judgedAsCopy(run), text: `"${run.text}" at frame ${sample.frame} uses ${foreign.map((f) => f.familyName).join(', ')}` };
        if (!fontIssue || (issue.copy && !fontIssue.copy)) fontIssue = issue;
      }
    }
  }
  results.push(contrastFail ? fail('MO-C-06', `${contrastFail}${worst ? `; worst ${worst.ratio.toFixed(2)}:1` : ''}`) : contrastWarn ? warn('MO-C-06', contrastWarn) : pass('MO-C-06', worst ? `min ${worst.ratio.toFixed(2)}:1 at frame ${worst.frame} ("${worst.text}", floor ${worst.floor}:1)` : 'no settled text sample to measure'));
  results.push(safeFail ? fail('MO-C-04', safeFail) : pass('MO-C-04', `copy inside the central 90 % (${safe.map(Math.round).join(',')})`));
  results.push(decorCopy || decorShare ? fail('QA-DECOR', decorCopy ?? decorShare) : pass('QA-DECOR', 'decor text carries no copy and stays under 25 % of the text area'));
  results.push(meta ? warn('QA-META', `a meta label may be on screen: ${meta}; the look must answer it`) : pass('QA-META', 'no request text, idea, file name or internal term on screen'));
  results.push(fontIssue ? (fontIssue.copy ? fail('QA-FONTS', `${fontIssue.text}; set copy in a product face`) : warn('QA-FONTS', fontIssue.text)) : pass('QA-FONTS', 'only product faces at beat midpoints'));
  const registered = grid.some((g) => g.texts.length);
  results.push(canvasTextCalls > 0 && !registered ? warn('QA-CANVAS', 'canvas text not measured: the page draws text on a canvas without LitStage.text registrations; the look must answer it') : pass('QA-CANVAS', registered ? 'canvas text registered' : 'no canvas text'));
  const drawn = presence.filter(Boolean).length;
  results.push(presence.length && drawn * 2 < presence.length ? warn('QA-PRESENCE', `only ${drawn} of ${presence.length} beat midpoints show anything beyond text; the look must answer it`) : pass('QA-PRESENCE', `${drawn} of ${presence.length} beat midpoints show a drawn picture beyond the text`));
  if (details.discarded.length) results.push(warn('QA-STATE', `state moved during the ink capture at frame(s) ${details.discarded.join(', ')}; those samples were discarded`));
  return { results, missingCopy: missing, minCopyFontPx, settledSamples: details.settledSamples, runs: details.runsSeen.size, discarded: details.discarded, measured: true };
}
