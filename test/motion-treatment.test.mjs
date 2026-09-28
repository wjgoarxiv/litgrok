import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { shippedExamples, typeLedCue, validateTreatment } from '../.grok/skills/lit-typographic-motion/scripts/lib/treatment.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillRoot = join(root, '.grok/skills/lit-typographic-motion');
const fixture = (name) => JSON.parse(readFileSync(join(root, 'test/fixtures/motion', name), 'utf8'));
const stage = () => fixture('treatment-stage.json');
const type = () => fixture('treatment-type.json');

function expectField(treatment, field, why) {
  const result = validateTreatment(treatment);
  assert.equal(result.ok, false, `${why}: expected exit 16 on ${field}`);
  assert.equal(result.field, field, `${why}: ${result.message}`);
}

test('the two fixture treatments are valid', () => {
  for (const t of [stage(), type()]) {
    const result = validateTreatment(t);
    assert.equal(result.ok, true, result.message);
  }
});

test('each missing top-level field exits 16 with its name', () => {
  const fields = ['request', 'genre', 'path', 'pathReason', 'idea', 'audience', 'channel', 'format', 'formatReason', 'durationSec', 'beats', 'subject', 'visualDevices', 'typePlan', 'palette', 'sound', 'copy', 'inventions', 'ambition'];
  for (const field of fields) {
    const t = stage();
    delete t[field];
    expectField(t, field, `missing ${field}`);
  }
});

test('placeholder values from an example never validate', () => {
  const t = stage();
  t.idea = '<one sentence>';
  expectField(t, 'idea', 'placeholder idea');
  const u = stage();
  u.beats[2].onScreen = '<what is on screen>';
  expectField(u, 'beats[2].onScreen', 'placeholder beat field');
  for (const example of shippedExamples()) assert.equal(validateTreatment(example).ok, false, 'a shipped example must never validate as-is');
});

test('a treatment copied from a shipped example exits copiedExample', () => {
  const [example] = shippedExamples();
  assert.ok(example, 'references/treatment.md ships a placeholder example');
  const unbracket = (value) => (typeof value === 'string' ? value.replace(/[<>]/g, '') : value);
  const t = stage();
  t.idea = unbracket(example.idea);
  t.audience = unbracket(example.audience);
  t.channel = unbracket(example.channel);
  t.ambition = unbracket(example.ambition);
  t.beats = t.beats.map((beat, i) => {
    const source = example.beats[i % example.beats.length];
    return { ...beat, purpose: unbracket(source.purpose), onScreen: unbracket(source.onScreen), motion: unbracket(source.motion), sound: unbracket(source.sound) };
  });
  t.palette = t.palette.map((entry, i) => ({ ...entry, role: unbracket(example.palette[i % example.palette.length].role) }));
  expectField(t, 'copiedExample', 'half the free text equals the example');
});

test('an idea or invented copy that restates the request exits 16', () => {
  const t = stage();
  t.idea = '비가 어떻게 만들어지는지 보여주는 영상이다.';
  expectField(t, 'idea', 'idea restates the request');
  const u = stage();
  u.copy.lines[0] = '비가 어떻게 만들어지는지 보여주는 영상';
  expectField(u, 'copy.lines', 'invented copy restates the request');
});

test('a user copy line must come from the request, quoted spans included', () => {
  const t = type();
  t.copy.lines = ['오늘의 걸음이', '모레의 길이 된다'];
  expectField(t, 'copy.lines', 'user line not in the request');
});

test('the stage path needs a drawn subject device and two counting kinds', () => {
  const t = stage();
  t.visualDevices = t.visualDevices.map((device) => (device.role === 'subject' ? { ...device, role: 'support' } : device));
  expectField(t, 'visualDevices', 'no subject device');
  const u = stage();
  u.visualDevices = [{ kind: 'gradient', role: 'texture', beats: [0, 1, 2, 3, 4] }, { kind: 'particles', role: 'texture', beats: [0, 1] }];
  expectField(u, 'visualDevices', 'only texture kinds');
  const v = stage();
  v.visualDevices = [{ kind: 'illustration', role: 'subject', beats: [0] }, { kind: 'diagram', role: 'support', beats: [1] }];
  expectField(v, 'visualDevices', 'subject covers under half the film');
});

test('the type path needs user copy or a type-led cue, and 16:9', () => {
  const t = stage();
  t.path = 'type';
  expectField(t, 'path', 'type path with invented copy and no cue');
  const u = type();
  u.format = '9:16';
  expectField(u, 'path', 'type path at 9:16');
});

test('beats follow the genre arc and the 1.2 s floor', () => {
  const t = stage();
  t.beats = t.beats.slice(0, 3);
  t.beats[2].t1 = 24;
  t.visualDevices = [{ kind: 'illustration', role: 'subject', beats: [0, 1, 2] }, { kind: 'diagram', role: 'support', beats: [1] }];
  expectField(t, 'beats', 'explainer needs four beats');
  const u = stage();
  u.beats[1] = { ...u.beats[1], t0: 4, t1: 5 };
  u.beats[2] = { ...u.beats[2], t0: 5 };
  expectField(u, 'beats', 'a beat of 1.0 s');
  const v = stage();
  v.beats[3].t0 = 16;
  expectField(v, 'beats', 'a gap over 0.25 s');
});

test('inventions must list the invented subject name', () => {
  const t = stage();
  t.inventions = ['all five copy lines'];
  expectField(t, 'inventions', 'subject name missing');
  const u = stage();
  u.inventions = [];
  expectField(u, 'inventions', 'empty inventions with invented copy');
});

test('genre floors, silent sound and unknown faces are refused', () => {
  const t = stage();
  t.durationSec = 8;
  t.beats = [0, 2, 4, 6].map((t0) => ({ ...stage().beats[0], t0, t1: t0 + 2 }));
  t.visualDevices = [{ kind: 'illustration', role: 'subject', beats: [0, 1, 2, 3] }, { kind: 'diagram', role: 'support', beats: [1] }];
  expectField(t, 'durationSec', 'an explainer under 10 s with no asked length');
  const u = stage();
  u.sound = { mode: 'none', plan: 'silence', palette: 'glass' };
  expectField(u, 'sound.mode', 'none without a silence request');
  const v = stage();
  v.typePlan.faces = ['Helvetica'];
  expectField(v, 'typePlan.faces', 'a face outside the verified set');
});

test('type-led cue detection: compounds and quoted spans of two or more words', () => {
  assert.equal(typeLedCue('"오늘의 걸음이 내일의 길이 된다" 이 문장으로 영상 만들어줘 lit'), '"오늘의 걸음이 내일의 길이 된다"');
  assert.ok(typeLedCue('가사 영상 하나 만들어줘 lit'));
  assert.ok(typeLedCue('make a lyric video for this chorus lit'));
  assert.ok(typeLedCue('「작은 불빛들」로 타이틀 시퀀스 만들어줘 lit'));
  assert.equal(typeLedCue('"단어" 하나로 영상 만들어줘 lit'), null, 'a one-word quote is not a cue');
  assert.equal(typeLedCue('비가 어떻게 만들어지는지 보여주는 영상 만들어줘 lit'), null);
  assert.equal(typeLedCue("it's the teacher's day video lit"), null, 'apostrophes are not quotes');
});

test('the CLI refuses a type render with no treatment and names the field (exit 16)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lgm-t-'));
  try {
    writeFileSync(join(dir, 'brief.json'), JSON.stringify({ lines: ['오늘의 걸음이'] }));
    const result = spawnSync(process.execPath, [join(skillRoot, 'scripts/motion.mjs'), 'make', '--brief', join(dir, 'brief.json'), '--out', join(dir, 'out'), '--stills-only'], { encoding: 'utf8', env: { ...process.env, CHROME_PATH: '' } });
    assert.equal(result.status, 16, result.stdout + result.stderr);
    assert.match(result.stdout, /BLOCKED_TREATMENT_INVALID/);
    assert.match(result.stderr, /treatment\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
