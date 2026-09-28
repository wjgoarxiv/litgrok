import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { resolveChrome } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';
import { evaluateQa, qaPlan, safeBox } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage-qa.mjs';

// A Chrome helper can flush its profile for a moment after the browser exits; teardown retries and
// never masks the test's own assertion.
const cleanup = (dir) => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 }); } catch { /* reported by the leak check */ } };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const motion = join(root, '.grok/skills/lit-typographic-motion/scripts/motion.mjs');
const fixtures = join(root, 'test/fixtures/motion/stage');
const NO_TOOLS = resolveChrome(process.env) && spawnSync('ffmpeg', ['-version']).status === 0 ? false : 'Chrome and ffmpeg are needed for the text QA replay';
const CACHE = mkdtempSync(join(tmpdir(), 'lgm-qa-cache-'));

function treatment(lines, duration = 6) {
  return {
    request: '작은 도형이 움직이는 영상 만들어줘, 소리 없이 lit', genre: 'other', path: 'stage', pathReason: 'The film draws shapes, not only words.',
    idea: 'A plain shape keeps its place while a few words come and go.', audience: 'Test viewers', channel: 'Local playback',
    format: '16:9', formatReason: 'Local playback is landscape.', durationSec: duration, fps: 30,
    beats: [[0, 2], [2, 4], [4, duration]].map(([t0, t1], i) => ({ t0, t1, purpose: ['open', 'develop', 'land'][i], onScreen: 'the shape and a line', motion: 'steady', sound: 'none' })),
    subject: { name: '도형', source: 'user', specifics: [] },
    visualDevices: [{ kind: 'shape', role: 'subject', beats: [0, 1, 2] }, { kind: 'path', role: 'support', beats: [1] }],
    typePlan: { faces: ['Archivo', 'Pretendard'], hierarchy: 'one line', maxWordsOnScreen: 5 },
    palette: [{ hex: '#101820', role: 'ground' }, { hex: '#F4F1EA', role: 'type' }, { hex: '#E4572E', role: 'shape' }],
    sound: { mode: 'none', plan: 'silent by request' }, copy: { source: 'invented', lines }, inventions: ['every copy line'], ambition: 'Clear words over one steady shape.',
  };
}

function render(fixture, lines) {
  const work = mkdtempSync(join(tmpdir(), `lgm-qa-${fixture}-`));
  const out = join(work, 'out');
  mkdirSync(out);
  cpSync(join(fixtures, fixture), join(out, 'stage'), { recursive: true });
  writeFileSync(join(out, 'treatment.json'), JSON.stringify(treatment(lines)));
  const result = spawnSync(process.execPath, [motion, 'stage', '--out', out, '--round', '2'], { encoding: 'utf8', env: { ...process.env, LITGROK_MOTION_CACHE: CACHE }, timeout: 600000 });
  const report = existsSync(join(out, 'gate-report.txt')) ? readFileSync(join(out, 'gate-report.txt'), 'utf8') : '';
  return { work, out, result, report, line: (id) => report.split('\n').find((l) => l.trim().startsWith(`${id}:`)) ?? '' };
}

describe('text QA on real stage renders', { concurrency: 3 }, () => {
  test('FAIL cases: low-contrast copy, off-safe copy, too-short copy; WARN: a meta label and unregistered canvas text', { skip: NO_TOOLS }, () => {
    const r = render('qa-bad', ['어두운 글씨 한 줄', '가장자리에 붙은 줄', '잠깐 보이는 줄']);
    try {
      assert.equal(r.result.status, 13, r.result.stderr + r.report);
      assert.match(r.line('MO-C-06'), /FAIL\s+\("어두운 글씨 한 줄"/);
      assert.match(r.line('MO-C-04'), /FAIL\s+\("가장자리에 붙은 줄"/);
      assert.match(r.line('MO-C-07/08'), /FAIL\s+\("잠깐 보이는 줄" is readable for 0\.\d s/);
      assert.match(r.line('QA-META'), /WARN[^\n]*beat 02 treatment/);
      assert.match(r.line('QA-CANVAS'), /WARN[^\n]*canvas text not measured/);
      assert.match(r.line('QA-COPY'), /PASS/);
    } finally { cleanup(r.work); }
  });
  test('decor exemptions hold: decor is exempt from title-safe and the reading floor, contrast only WARNs', { skip: NO_TOOLS }, () => {
    const r = render('qa-decor', ['작은 병 하나']);
    try {
      assert.match(r.line('MO-C-04'), /PASS/, r.report);
      assert.match(r.line('MO-C-07/08'), /PASS/, r.report);
      assert.match(r.line('MO-C-06'), /WARN[^\n]*decor "honey 1924"/, r.report);
      assert.match(r.line('QA-DECOR'), /PASS/, r.report);
    } finally { cleanup(r.work); }
  });
  test('a decor run carrying a copy line fails', { skip: NO_TOOLS }, () => {
    const r = render('qa-decor-copy', ['작은 병 하나']);
    try {
      assert.match(r.line('QA-DECOR'), /FAIL[^\n]*carries a copy line/, r.report);
    } finally { cleanup(r.work); }
  });
  test('a copy line that never appears on screen exits 17 quoting it', { skip: NO_TOOLS }, () => {
    const r = render('qa-good', ['둥근 해가 천천히 뜬다', '다시 저녁이 온다', '여기에 없는 줄']);
    try {
      assert.equal(r.result.status, 17, r.result.stderr);
      assert.match(r.result.stderr, /STAGE_CONTRACT_ERROR: copy line not on screen: "여기에 없는 줄"/);
      assert.match(r.line('QA-COPY'), /FAIL/);
    } finally { cleanup(r.work); }
  });
  test('a clean page passes every text check', { skip: NO_TOOLS }, () => {
    const r = render('qa-good', ['둥근 해가 천천히 뜬다', '다시 저녁이 온다']);
    try {
      assert.equal(r.result.status, 0, r.result.stderr + r.report);
      for (const id of ['MO-C-04', 'MO-C-06', 'MO-C-07/08', 'QA-COPY', 'QA-DECOR', 'QA-META', 'QA-FONTS', 'QA-CANVAS', 'QA-PRESENCE']) assert.match(r.line(id), /PASS/, `${id}: ${r.line(id)}`);
      const qa = JSON.parse(readFileSync(join(r.out, 'stage-report.json'), 'utf8')).qa;
      assert.ok(qa.settledSamples >= 3, `settled samples ${qa.settledSamples}`);
    } finally { cleanup(r.work); }
  });
});

// Pure cases over recorded facts.
const W = 1920, H = 1080;
const run = (over) => ({ id: '1', key: 'k@11', text: 'copy line', norm: 'copyline', decor: false, rects: [[400, 400, 900, 480]], opacity: 1, fontSizePx: 60, scale: 1, ink: 400, contrast: 10, ...over });

function facts({ runs = [run()], moved = 0, fonts = [], texts = [], canvasTextCalls = 0 } = {}) {
  const t = treatment(['copy line']);
  const plan = qaPlan(t.beats, 30, 180);
  const grid = [];
  for (let f = 0; f < 180; f += plan.step) grid.push({ frame: f, runs, texts });
  const samples = [...plan.samples].map(([frame, s]) => ({ frame, beat: s.beat, kind: s.kind, runs, texts, moved, nonTextStd: 0.2, fonts }));
  return { grid, samples, plan, treatment: t, width: W, height: H, fps: 30, canvasTextCalls, allowedFonts: new Set(['Archivo']) };
}
const pick = (qa, id) => qa.results.find((r) => r.id === id);

test('pure QA: a state-moved sample is a WARN and is discarded', () => {
  const qa = evaluateQa(facts({ moved: 30 }));
  assert.equal(pick(qa, 'QA-STATE').status, 'WARN');
  assert.equal(qa.settledSamples, 0);
});

test('pure QA: decor over 25 % of the text area fails; a copy run in a foreign font fails, decor only warns', () => {
  const big = run({ id: '2', key: 'd@11', text: 'decor', norm: 'decor', decor: true, rects: [[0, 0, 1000, 900]] });
  assert.equal(pick(evaluateQa(facts({ runs: [run(), big] })), 'QA-DECOR').status, 'FAIL');
  const foreign = [{ id: '1', fonts: [{ familyName: 'Helvetica', postScriptName: 'Helvetica', glyphCount: 8 }] }];
  assert.equal(pick(evaluateQa(facts({ fonts: foreign })), 'QA-FONTS').status, 'FAIL');
  const decorForeign = [{ id: '2', fonts: [{ familyName: 'Helvetica', postScriptName: 'Helvetica', glyphCount: 5 }] }];
  const small = run({ id: '2', key: 'd@00', text: 'decor', norm: 'decor', decor: true, rects: [[100, 100, 150, 120]] });
  assert.equal(pick(evaluateQa(facts({ runs: [run(), small], fonts: decorForeign })), 'QA-FONTS').status, 'WARN');
});

test('pure QA: registered canvas text counts as copy found; unregistered canvas text warns', () => {
  const texts = [{ content: 'copy line', norm: 'copyline', x: 400, y: 400, w: 500, h: 80, decor: false, rects: [[400, 400, 900, 480]] }];
  assert.equal(pick(evaluateQa(facts({ runs: [], texts })), 'QA-COPY').status, 'PASS');
  assert.equal(pick(evaluateQa(facts({ runs: [], canvasTextCalls: 4 })), 'QA-CANVAS').status, 'WARN');
  assert.equal(pick(evaluateQa(facts({ runs: [], canvasTextCalls: 4 })), 'QA-COPY').status, 'FAIL');
});

test('pure QA: the safe box and the large-type threshold follow the actual frame', () => {
  assert.deepEqual(safeBox(1080, 1920), [54, 96, 1026, 1824]);
  assert.deepEqual(safeBox(1920, 1080), [96, 54, 1824, 1026]);
  const low = run({ contrast: 3.5, fontSizePx: 30 });
  assert.equal(pick(evaluateQa(facts({ runs: [low] })), 'MO-C-06').status, 'FAIL', '30 px is body text at 1080 (large starts at 32.4 px)');
  assert.equal(pick(evaluateQa(facts({ runs: [run({ contrast: 3.5, fontSizePx: 40 })] })), 'MO-C-06').status, 'PASS');
});

test.after(() => cleanup(CACHE));
