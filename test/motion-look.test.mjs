import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveChrome } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';
import { downgrades, openItems } from '../.grok/skills/lit-typographic-motion/scripts/lib/look.mjs';

// A Chrome helper can flush its profile for a moment after the browser exits; teardown retries and
// never masks the test's own assertion.
const cleanup = (dir) => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 }); } catch { /* reported by the leak check */ } };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const motion = join(root, '.grok/skills/lit-typographic-motion/scripts/motion.mjs');
const fixture = (name) => JSON.parse(readFileSync(join(root, 'test/fixtures/motion', name), 'utf8'));
const NO_TOOLS = resolveChrome(process.env) && spawnSync('ffmpeg', ['-version']).status === 0 ? false : 'Chrome and ffmpeg are needed for the look flow';

function stageTreatment() {
  return {
    request: '둥근 도형이 떠오르는 영상 만들어줘, 소리 없이 lit', genre: 'other', path: 'stage', pathReason: 'The film draws a shape, not only words.',
    idea: 'A red disc bobs gently while two short lines take turns.', audience: 'Test viewers', channel: 'Local playback',
    format: '16:9', formatReason: 'Local playback is landscape.', durationSec: 6, fps: 30,
    beats: [[0, 2], [2, 4], [4, 6]].map(([t0, t1], i) => ({ t0, t1, purpose: ['open', 'develop', 'land'][i], onScreen: 'the disc and a line', motion: 'bobbing', sound: 'none' })),
    subject: { name: '둥근 도형', source: 'user', specifics: [] },
    visualDevices: [{ kind: 'shape', role: 'subject', beats: [0, 1, 2] }, { kind: 'path', role: 'support', beats: [1] }],
    typePlan: { faces: ['Archivo', 'Pretendard'], hierarchy: 'one line at a time', maxWordsOnScreen: 5 },
    palette: [{ hex: '#0F1720', role: 'ground' }, { hex: '#F4F1EA', role: 'type' }, { hex: '#E4572E', role: 'disc' }],
    sound: { mode: 'none', plan: 'silent by request' },
    copy: { source: 'invented', lines: ['둥근 해가 천천히 뜬다', '다시 저녁이 온다'] }, inventions: ['both copy lines'],
    ambition: 'A calm, exact loop where the words never fight the disc.',
  };
}

const cli = (args, env = {}) => spawnSync(process.execPath, [motion, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 600000 });

function answers(out, { round, change = null, weakestBeat = null, verdicts = {}, drop = [], observed = null }) {
  const index = JSON.parse(readFileSync(join(out, 'stills', 'index.json'), 'utf8'));
  const viewed = index.stills.map((s) => s.file).filter((file) => !drop.includes(file));
  const sheet = 'stills/contact-sheet.png';
  const body = {
    viewed,
    ...(change ? { change, weakestBeat } : {}),
    answers: Array.from({ length: 9 }, (_, i) => ({
      q: i + 1,
      verdict: verdicts[i + 1] ?? ({ 1: 'yes', 4: 'no', 7: 'none', 8: 'no', 9: 'no' }[i + 1] ?? 'yes'),
      frame: sheet,
      observed: observed ?? `In the contact sheet the red disc sits right of the headline in tile ${i + 1}.`,
    })),
  };
  const path = join(out, `answers-${round}.json`);
  writeFileSync(path, JSON.stringify(body));
  return path;
}

test('look flow: refusals, not-done states, a full receipt, downgrade, DONE_UNVIEWED and a gate re-run', { skip: NO_TOOLS }, () => {
  const work = mkdtempSync(join(tmpdir(), 'lgm-look-'));
  const cache = mkdtempSync(join(tmpdir(), 'lgm-look-cache-'));
  const env = { LITGROK_MOTION_CACHE: cache };
  try {
    const out = join(work, 'out');
    mkdirSync(out);
    cpSync(join(root, 'test/fixtures/motion/stage/qa-good'), join(out, 'stage'), { recursive: true });
    writeFileSync(join(out, 'treatment.json'), JSON.stringify(stageTreatment()));

    assert.equal(cli(['stage', '--out', out, '--stills-only'], env).status, 0);
    const refuse = (args, pattern) => { const r = cli(['look', '--out', out, ...args], env); assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stderr, pattern); };
    const bogus = join(out, 'bogus.json');
    writeFileSync(bogus, JSON.stringify({ viewed: ['stills/not-a-frame.png'], answers: [] }));
    refuse(['--round', '1', '--answers', bogus], /not-a-frame\.png is not in the latest stills set/);
    refuse(['--round', '1', '--answers', answers(out, { round: 1, change: 'moved the second line lower', weakestBeat: 1, observed: 'yes' })], /bare yes or no is not an observation/);
    refuse(['--round', '1', '--answers', answers(out, { round: 1 })], /round 1 names the weakest beat/);
    refuse(['--round', '2', '--answers', answers(out, { round: 2 })], /latest stills set belongs to round 1/);
    assert.equal(cli(['look', '--out', out, '--round', '1', '--answers', answers(out, { round: 1, change: 'slowed the disc and held each line longer', weakestBeat: 1 })], env).status, 0);
    assert.match(cli(['verify', '--out', out], env).stdout, /NOT DONE: a --stills-only run is a look step, not a film/);

    const full = cli(['stage', '--out', out, '--round', '2'], env);
    assert.equal(full.status, 0, full.stderr);
    const gateOnly = cli(['verify', '--out', out], env);
    assert.equal(gateOnly.status, 1);
    assert.match(gateOnly.stdout, /NOT DONE: 1 look round\(s\) recorded; done needs the round-1 stills look and a last look on the final render/, 'gate PASS with only the stills look is not done');

    const unviewed = join(work, 'unviewed');
    cpSync(out, unviewed, { recursive: true });
    assert.equal(cli(['look', '--out', unviewed, '--round', '2', '--blocked', 'no-vision-tool'], env).status, 0);
    const blind = cli(['verify', '--out', unviewed], env);
    assert.equal(blind.status, 0);
    assert.match(blind.stdout, /^DONE_UNVIEWED: [^\n]*nobody viewed the frames/);

    const partial = join(work, 'partial');
    cpSync(out, partial, { recursive: true });
    assert.equal(cli(['look', '--out', partial, '--round', '2', '--answers', answers(partial, { round: 2, drop: ['stills/poster.png'] })], env).status, 0);
    assert.match(cli(['verify', '--out', partial], env).stdout, /NOT DONE: the last look did not view stills\/poster\.png/);

    assert.equal(cli(['look', '--out', out, '--round', '2', '--answers', answers(out, { round: 2 })], env).status, 0);
    const done = cli(['verify', '--out', out], env);
    assert.equal(done.status, 0, done.stdout);
    assert.match(done.stdout, /^DONE: gate PASS[^\n]*2 look rounds/);

    const lookBefore = readFileSync(join(out, 'look.json'), 'utf8');
    assert.equal(cli(['gate', '--out', out], env).status, 0);
    const reportBefore = readFileSync(join(out, 'gate-report.txt'), 'utf8').match(/frames looked at: .*/)[0];
    assert.match(reportBefore, /frames looked at: [1-9]\d* file\(s\) across 2 look round\(s\)/);
    assert.equal(cli(['gate', '--out', out], env).status, 0);
    assert.equal(readFileSync(join(out, 'look.json'), 'utf8'), lookBefore, 'a gate re-run never touches look.json');
    assert.equal(readFileSync(join(out, 'gate-report.txt'), 'utf8').match(/frames looked at: .*/)[0], reportBefore, 'the viewed count survives a gate re-run');
    assert.match(cli(['verify', '--out', out], env).stdout, /^DONE/);

    const first = JSON.parse(readFileSync(join(out, '.run', 'treatment-first.json'), 'utf8'));
    writeFileSync(join(out, '.run', 'treatment-first.json'), JSON.stringify({ ...first, durationSec: 12 }));
    assert.match(cli(['verify', '--out', out], env).stdout, /downgraded: the film was shortened from 12 s to 6 s/);

    const again = cli(['stage', '--out', out, '--round', '3'], env);
    assert.equal(again.status, 0, again.stderr);
    assert.match(cli(['verify', '--out', out], env).stdout, /NOT DONE: the last look was not on the final full render/, 'a last round on an old stills hash is not done');
  } finally { cleanup(work); cleanup(cache); }
});

test('open items: which answers ask for another round', () => {
  const base = Array.from({ length: 9 }, (_, i) => ({ q: i + 1, verdict: { 4: 'no', 7: 'none', 8: 'no', 9: 'no' }[i + 1] ?? 'yes' }));
  assert.deepEqual(openItems(base), []);
  assert.deepEqual(openItems(base.map((a) => (a.q === 3 ? { ...a, verdict: 'no' } : a))), ['Q3: no']);
  assert.deepEqual(openItems(base.map((a) => (a.q === 9 ? { ...a, verdict: 'yes' } : a))), ['Q9: yes']);
  assert.deepEqual(openItems(base.map((a) => (a.q === 7 ? { ...a, verdict: 'a sunrise over the disc' } : a))), ['Q7: a sunrise over the disc']);
});

test('downgrades: shorter film, fewer subject beats, silence without a request, stage to type', () => {
  const first = fixture('treatment-stage.json');
  assert.deepEqual(downgrades(first, first), []);
  const shorter = { ...first, durationSec: 12 };
  assert.match(downgrades(first, shorter)[0], /shortened from 24 s to 12 s/);
  const fewer = { ...first, visualDevices: [{ kind: 'illustration', role: 'subject', beats: [0, 1] }, { kind: 'diagram', role: 'support', beats: [2] }] };
  assert.match(downgrades(first, fewer)[0], /covers 2 beats instead of 5/);
  const silent = { ...first, sound: { mode: 'none', plan: 'none' } };
  assert.match(downgrades(first, silent)[0], /switched off without a request/);
  const typed = { ...first, path: 'type' };
  assert.match(downgrades(first, typed)[0], /stage path to the type path/);
});
