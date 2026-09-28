import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import { STAGE } from '../.grok/skills/lit-typographic-motion/scripts/lib/constants.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const kitPath = join(root, '.grok/skills/lit-typographic-motion/scripts/stage/stage-kit.js');

// Load the kit into a fresh vm context whose `window` is a plain object.
function loadKit(extra = {}) {
  assert.ok(existsSync(kitPath), 'scripts/stage/stage-kit.js exists');
  const window = { ...extra };
  const context = vm.createContext({ window, Intl, Math, Number, String, Array, Object, Error, TypeError, JSON, isFinite, parseInt, parseFloat });
  vm.runInContext(readFileSync(kitPath, 'utf8'), context, { filename: 'stage-kit.js' });
  assert.ok(window.LitStage, 'the kit defines window.LitStage');
  return { LitStage: window.LitStage, window };
}

const near = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message ?? ''} ${a} vs ${b}`);

// A tiny element stand-in: attributes, style and children.
function fakeElement(textContent = '') {
  const el = {
    nodeType: 1, attrs: {}, style: {}, children: [], textContent,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; },
    hasAttribute(name) { return name in this.attrs; },
    appendChild(child) { this.children.push(child); return child; },
    getTotalLength() { return 200; },
    getBoundingClientRect() { return { width: 300, height: 100 }; },
    ownerDocument: null,
  };
  el.ownerDocument = {
    createElement: (tag) => ({ ...fakeElement(), tagName: tag.toUpperCase() }),
    createTextNode: (text) => ({ nodeType: 3, textContent: text }),
  };
  return el;
}

test('the kit is one dependency-free classic script under the byte cap', () => {
  const source = readFileSync(kitPath, 'utf8');
  assert.ok(statSync(kitPath).size <= STAGE.kitMaxBytes, `kit is ${statSync(kitPath).size} bytes`);
  assert.doesNotMatch(source, /^\s*import\s|\brequire\(|https?:\/\//m);
  assert.doesNotMatch(source, /Math\.random|Date\.now|new Date|setTimeout|setInterval|fetch\(/);
});

test('named eases hit their endpoints; monotonic eases never go backwards', () => {
  const { LitStage } = loadKit();
  const names = ['linear', 'inQuad', 'outQuad', 'inOutQuad', 'inCubic', 'outCubic', 'inOutCubic', 'inQuart', 'outQuart', 'inOutQuart', 'inExpo', 'outExpo', 'inOutExpo', 'inBack', 'outBack', 'inOutBack', 'inSine', 'outSine', 'inOutSine'];
  for (const name of names) {
    const ease = LitStage.ease[name];
    assert.equal(typeof ease, 'function', name);
    assert.equal(ease(0), 0, `${name}(0)`);
    assert.equal(ease(1), 1, `${name}(1)`);
    assert.equal(ease(-1), 0, `${name} clamps below`);
    assert.equal(ease(2), 1, `${name} clamps above`);
    if (!/Back/.test(name)) {
      let previous = -Infinity;
      for (let i = 0; i <= 100; i += 1) { const v = ease(i / 100); assert.ok(v >= previous - 1e-12, `${name} monotonic`); previous = v; }
    }
  }
  assert.ok(LitStage.ease.outBack(0.8) > 1, 'outBack overshoots');
});

test('bezier follows CSS cubic-bezier semantics (ease = 0.25, 0.1, 0.25, 1)', () => {
  const { LitStage } = loadKit();
  const ease = LitStage.bezier(0.25, 0.1, 0.25, 1);
  near(ease(0.25), 0.4094, 1e-3, 'ease(0.25)');
  near(ease(0.5), 0.8024, 1e-3, 'ease(0.5)');
  near(ease(0.75), 0.9604, 1e-3, 'ease(0.75)');
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  const linear = LitStage.bezier(0, 0, 1, 1);
  near(linear(0.37), 0.37, 1e-6);
});

test('spring converges to its target; the under-damped case overshoots', () => {
  const { LitStage } = loadKit();
  const under = LitStage.spring({ from: 0, to: 1, stiffness: 180, damping: 8 });
  near(under(0), 0, 1e-9);
  let peak = 0;
  for (let t = 0; t < 3; t += 0.005) peak = Math.max(peak, under(t));
  assert.ok(peak > 1.05, `under-damped overshoot ${peak}`);
  near(under(10), 1, 1e-3, 'settles');
  const critical = LitStage.spring({ from: 2, to: 5, stiffness: 100, damping: 20 });
  near(critical(0), 2, 1e-9);
  near(critical(5), 5, 1e-3);
  let criticalPeak = 0;
  for (let t = 0; t < 3; t += 0.01) criticalPeak = Math.max(criticalPeak, critical(t));
  assert.ok(criticalPeak <= 5 + 1e-9, 'critical damping never overshoots');
  const over = LitStage.spring({ stiffness: 50, damping: 40 });
  near(over(20), 1, 1e-3);
});

test('kf interpolates numbers and arrays, shaped by the ease on the arriving key', () => {
  const { LitStage } = loadKit();
  const keys = [[0, 0], [1, 100, 'inQuad'], [2, 50]];
  assert.equal(LitStage.kf(-1, keys), 0);
  assert.equal(LitStage.kf(3, keys), 50);
  near(LitStage.kf(0.5, keys), 25, 1e-9, 'inQuad at half');
  near(LitStage.kf(1.5, keys), 75, 1e-9, 'linear segment');
  const arrays = [[0, [0, 10]], [1, [10, 20]]];
  const mid = LitStage.kf(0.5, arrays);
  near(mid[0], 5, 1e-9); near(mid[1], 15, 1e-9);
  near(LitStage.kf(0.5, [[0, 0], [1, 1, (p) => p * p * p]]), 0.125, 1e-9, 'function ease');
});

test('stagger, seq and at do the arithmetic', () => {
  const { LitStage } = loadKit();
  near(LitStage.stagger(3, { each: 0.1 }), 0.3, 1e-9);
  near(LitStage.stagger(0, { each: 0.1, from: 'end', count: 5 }), 0.4, 1e-9);
  near(LitStage.stagger(2, { each: 0.1, from: 'center', count: 5 }), 0, 1e-9);
  near(LitStage.stagger(0, { each: 0.1, from: 'center', count: 5 }), 0.2, 1e-9);
  const s = LitStage.seq([['in', 0.8], ['hold', 2], ['out', 0.6]]);
  near(s.hold.start, 0.8, 1e-9); near(s.hold.end, 2.8, 1e-9); near(s.out.dur, 0.6, 1e-9); near(s.total, 3.4, 1e-9);
  const t = LitStage.seq([{ name: 'a', dur: 1 }, { name: 'b', dur: 1 }]);
  near(t.b.start, 1, 1e-9);
  assert.equal(LitStage.at(0.4, s.in), 0.5);
  assert.equal(LitStage.at(-1, s.in), 0);
  assert.equal(LitStage.at(9, s.in), 1);
  assert.equal(LitStage.at(1.5, [1, 2]), 0.5);
});

test('rand is deterministic per seed and differs between seeds', () => {
  const { LitStage } = loadKit();
  const a = LitStage.rand(42), b = LitStage.rand(42), c = LitStage.rand(43);
  const seqA = Array.from({ length: 8 }, () => a());
  const seqB = Array.from({ length: 8 }, () => b());
  const seqC = Array.from({ length: 8 }, () => c());
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, seqC);
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
  const r = LitStage.rand(7);
  for (let i = 0; i < 50; i += 1) { const v = r.int(2, 5); assert.ok(Number.isInteger(v) && v >= 2 && v <= 5); const w = r.range(-1, 1); assert.ok(w >= -1 && w < 1); }
});

test('splitText segments strings by grapheme, word and 어절', () => {
  const { LitStage } = loadKit();
  assert.deepEqual(Array.from(LitStage.splitText('작은 불빛이 모여', { by: 'eojeol' })), ['작은', '불빛이', '모여']);
  const graphemes = LitStage.splitText('é가👍🏽', { by: 'grapheme' });
  assert.deepEqual(Array.from(graphemes), ['é', '가', '👍🏽']);
  const words = Array.from(LitStage.splitText('hold the quiet', { by: 'word' })).filter((w) => w.trim());
  assert.deepEqual(words, ['hold', 'the', 'quiet']);
});

test('splitText on an element writes one span per segment and marks it copy', () => {
  const { LitStage } = loadKit();
  const el = fakeElement('작은 불빛');
  const spans = LitStage.splitText(el, { by: 'eojeol' });
  assert.equal(spans.length, 2);
  assert.equal(spans[0].textContent, '작은');
  assert.equal(spans[0].style.display, 'inline-block');
  assert.equal(el.attrs['data-lit-text'], 'copy');
  assert.ok(el.children.some((child) => child.nodeType === 3 && child.textContent === ' '), 'whitespace stays a text node');
  const decor = fakeElement('ab');
  decor.setAttribute('data-lit-text', 'decor');
  LitStage.splitText(decor, { by: 'grapheme' });
  assert.equal(decor.attrs['data-lit-text'], 'decor', 'an existing mark is kept');
});

function sampleD(d) {
  const numbers = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi).map(Number);
  const points = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
  return points;
}
function bounds(points) {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

test('morph starts at shape A, ends at shape B, and handles unequal point counts', () => {
  const { LitStage } = loadKit();
  const square = 'M0 0 L100 0 L100 100 L0 100 Z';
  const triangle = 'M200 200 L300 200 L250 300 Z';
  const shape = LitStage.morph(square, triangle, { samples: 32 });
  const start = sampleD(shape(0)), end = sampleD(shape(1));
  bounds(start).forEach((v, i) => near(v, [0, 0, 100, 100][i], 1e-6, 'start bounds'));
  bounds(end).forEach((v, i) => near(v, [200, 200, 300, 300][i], 1e-6, 'end bounds'));
  assert.match(shape(0.5), /^M[^M]*Z$/, 'one closed subpath');
  const mid = bounds(sampleD(shape(0.5)));
  assert.ok(mid[0] >= 100 - 1e-6 && mid[2] <= 200 + 1e-6, `halfway points lie between the shapes: ${mid}`);
  const curve = LitStage.morph('M0 0 C 30 -40 70 -40 100 0 Q 50 60 0 0 Z', 'M0 0 H 50 V 50 h -50 z');
  assert.equal(typeof curve(0.3), 'string');
  const open = LitStage.morph('M0 0 L100 0', 'M0 50 Q 50 0 100 50');
  const o0 = sampleD(open(0));
  near(o0[0][0], 0, 1e-6); near(o0.at(-1)[0], 100, 1e-6);
});

test('morph refuses a path with more than one subpath', () => {
  const { LitStage } = loadKit();
  assert.throws(() => LitStage.morph('M0 0 L10 0 Z M20 20 L30 20 Z', 'M0 0 L10 10 Z'), /LitStage\.morph: multi-subpath paths are not supported; split them into separate paths/);
});

test('mix blends hex colours', () => {
  const { LitStage } = loadKit();
  assert.equal(LitStage.mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(LitStage.mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(LitStage.mix('#000', '#fff', 0.5), '#808080');
  assert.equal(LitStage.mix('#0b1f33', '#7fd1ff', 2), '#7fd1ff', 'p clamps');
});

test('drawPath, clip and circle write the draw-on and reveal styles', () => {
  const { LitStage } = loadKit();
  const path = fakeElement();
  LitStage.drawPath(path, 0.25);
  assert.equal(Number(path.style.strokeDasharray), 200);
  assert.equal(Number(path.style.strokeDashoffset), 150);
  const el = fakeElement();
  LitStage.clip(el, 0.25, { from: 'left' });
  assert.equal(el.style.clipPath, 'inset(0% 75% 0% 0%)');
  LitStage.clip(el, 1, { from: 'center' });
  assert.equal(el.style.clipPath, 'inset(0% 0% 0% 0%)');
  LitStage.clip(el, 0, { from: 'top' });
  assert.equal(el.style.clipPath, 'inset(0% 0% 100% 0%)');
  LitStage.circle(el, 0, { x: '20%', y: '30%' });
  assert.match(el.style.clipPath, /^circle\(0(px|%)? at 20% 30%\)$/);
  LitStage.circle(el, 1);
  assert.match(el.style.clipPath, /^circle\([\d.]+px at 50% 50%\)$/);
});

test('text marks elements and registers canvas text with the renderer host', () => {
  const calls = [];
  const { LitStage, window } = loadKit({ __litHost: { text: (entry) => calls.push(entry), define: (spec) => calls.push({ defined: spec }) } });
  const el = fakeElement('label');
  assert.equal(LitStage.text(el), el);
  assert.equal(el.attrs['data-lit-text'], 'copy');
  LitStage.text(el, { decor: true });
  assert.equal(el.attrs['data-lit-text'], 'decor');
  const entry = LitStage.text({ content: 'a line', x: 10, y: 20, w: 300, h: 40 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].content, 'a line');
  assert.equal(entry.content, 'a line');
  assert.throws(() => LitStage.text({ content: '', x: 0, y: 0, w: 1, h: 1 }), /content/);
  assert.throws(() => LitStage.text({ content: 'x', x: 'a', y: 0, w: 1, h: 1 }), /x/);
  const spec = { width: 1920, height: 1080, fps: 60, duration: 12, render() {} };
  assert.equal(LitStage.define(spec), spec);
  assert.equal(calls[1].defined, spec);
  assert.equal(window.litStage, spec);
});

test('without a host, text registrations queue on window and define still sets litStage', () => {
  const { LitStage, window } = loadKit();
  LitStage.text({ content: 'queued', x: 1, y: 2, w: 3, h: 4 });
  assert.equal(window.__litStageTexts.length, 1);
  const spec = { width: 1080, height: 1920, fps: 30, duration: 8 };
  LitStage.define(spec);
  assert.equal(window.litStage, spec);
});
