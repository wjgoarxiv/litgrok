// The per-film score: a layered house-family track planned from the treatment, mixed with sidechain
// ducking under the kick, and mastered through the lookahead limiter to -16 LUFS BS.1770-4.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { masterTo, planCues } from '../.grok/skills/lit-typographic-motion/scripts/lib/sound.mjs';
import { buildScore, planScore, SCORE_GENRES, SCORE_STEMS, sidechainDepth, writeScore } from '../.grok/skills/lit-typographic-motion/scripts/lib/score.mjs';
import { validateTreatment } from '../.grok/skills/lit-typographic-motion/scripts/lib/treatment.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const motion = join(root, '.grok/skills/lit-typographic-motion/scripts/motion.mjs');

const treatment = (over = {}) => ({
  request: 'A short film with music where a teal block of geometry turns to face the viewer, Svensson lights',
  idea: 'A rotating teal shape settles above two quiet lines.',
  style: 'swiss-signal', register: 'rich',
  genre: 'other', path: 'stage', pathReason: 'The film draws shapes that move, not only words.',
  audience: 'Test viewers', channel: 'Local playback',
  format: '16:9', formatReason: 'Local playback is landscape.', durationSec: 4, fps: 30,
  beats: [
    { t0: 0, t1: 1.3, purpose: 'open', onScreen: 'the block', motion: 'turning', sound: 'quiet' },
    { t0: 1.3, t1: 2.6, purpose: 'develop', onScreen: 'the block', motion: 'turning', sound: 'a rising sweep' },
    { t0: 2.6, t1: 4, purpose: 'land', onScreen: 'the block', motion: 'settling', sound: 'a closing hit' },
  ],
  story: { expect: 'A clock face runs.', turn: 'A block turns instead.', beat: 1, payoff: 'The block settles facing front.' },
  protagonist: { name: 'block', kind: 'object', look: 'A teal block, fist-sized in frame.', acts: [{ beat: 0, action: 'Starts turned away.' }, { beat: 1, action: 'Turns to face front.' }, { beat: 2, action: 'Settles facing front.' }] },
  world: { layers: ['The dark ground the lines sit on.', 'The mid air the block turns in.', 'The front air the type floats in.'], labels: ['turn', 'settle', 'block', 'first line', 'second line', 'glow'], camera: [{ beat: 1, move: 'A slow push-in as the block turns.' }, { beat: 2, move: 'A gentle crane as the block settles.' }] },
  subject: { name: 'block', source: 'user', specifics: [] },
  visualDevices: [{ kind: 'shape', role: 'subject', beats: [0, 1, 2] }, { kind: 'diagram', role: 'support', beats: [1] }],
  depth: '2d',
  palette: [{ hex: '#0C0E13', role: 'ground' }, { hex: '#E9EBE4', role: 'ink' }, { hex: '#0F7A82', role: 'signal' }],
  typePlan: { faces: ['Archivo', 'Pretendard'], hierarchy: 'One line at a time.', maxWordsOnScreen: 6 },
  copy: { source: 'user', lines: ['geometry turns', 'face the viewer'] },
  inventions: [],
  ambition: 'The block reads as one object.',
  sound: {
    mode: 'score', plan: 'A house pulse under the turning block.', genre: 'house',
    events: [{ t: 1.1, on: 'the block starts to turn', kind: 'tap' }, { t: 2.7, on: 'the block settles facing front', kind: 'chime' }],
  },
  ...over,
});

const scoreOf = (t, frameCount = 120, fps = 30) => buildScore({ treatment: t, frameCount, fps, cutTimes: [1, 2.6] });

// The plan is pure and seeded: two films differ, one film always plans the same.
const plan = planScore({ treatment: treatment(), durationSec: 4 });
assert.equal(plan.genre, 'house');
assert.deepEqual(plan.sections.map((s) => s.kind), ['intro', 'drop', 'outro']);
assert.ok(plan.kicks.length > 0, `the drop has kicks: ${plan.kicks.length}`);
assert.ok(Math.abs((plan.sections[1].t0 - plan.origin) % plan.barSec) < 1e-6, 'a bar line falls exactly on the drop');

// A named genre wins over the style default; a style without a name falls back to the default style.
assert.equal(planScore({ treatment: treatment({ sound: { mode: 'score', plan: 'p', genre: 'garage', events: [] } }), durationSec: 4 }).genre, 'garage');
assert.equal(planScore({ treatment: { ...treatment(), style: undefined, sound: { mode: 'score', plan: 'p', events: [] } }, durationSec: 4 }).genre, 'house');

// The mixed score: deterministic bytes, -16 LUFS, peak under the ceiling, every stem and return kept.
const first = scoreOf(treatment());
const second = scoreOf(treatment());
assert.deepEqual([first.lufs, first.peakDbfs], [second.lufs, second.peakDbfs]);
assert.ok(Buffer.from(first.left).equals(Buffer.from(second.left)) && Buffer.from(first.right).equals(Buffer.from(second.right)), 'the same treatment builds the same bytes');
assert.ok(Math.abs(first.lufs + 16) <= 2, `integrated ${first.lufs} LUFS lands near -16`);
assert.ok(first.peakDbfs <= -2, `sample peak ${first.peakDbfs} dBFS stays under the ceiling`);
assert.deepEqual(Object.keys(first.stems), [...SCORE_STEMS]);
assert.deepEqual(Object.keys(first.returns), ['reverb', 'delay']);
assert.equal(first.loudnessMethod, 'BS.1770-4');
assert.ok(first.cues.some((c) => c.kind === 'event' && c.sound === 'tap'), 'on-screen events make their sounds');

// The sidechain: the bass dips right after a kick in the drop, against a sixth of a second later.
assert.ok(sidechainDepth(first) > 2, `the duck under the kick measures ${sidechainDepth(first)} dB`);

// writeScore: the mix, every stem and return, and the cues file a render rebuilds from.
{
  const dir = mkdtempSync(join(tmpdir(), 'lgm-score-'));
  const summary = writeScore({ treatment: treatment(), frameCount: 120, fps: 30, cutTimes: [1, 2.6], dir });
  assert.equal(summary.schema, 'litgrok.motion-sound-cues/v1');
  assert.equal(summary.mode, 'score');
  assert.equal(summary.genre, 'house');
  assert.equal(summary.tempo, plan.bpm);
  assert.ok(summary.stems.length === SCORE_STEMS.length + 2, `${summary.stems.length} stems and returns listed`);
  for (const stem of summary.stems) assert.ok(readFileSync(join(dir, stem.file)).length > 100, `${stem.name} is a WAV on disk`);
  const cues = JSON.parse(readFileSync(join(dir, 'sound-cues.json'), 'utf8'));
  assert.equal(cues.sha256, summary.sha256);
  assert.ok(cues.cues.length >= 2, 'the cues file lists the events');
}

// The lookahead limiter: a hot input ends under the ceiling at the target loudness, linked channels.
{
  const n = 48000;
  const hot = new Float64Array(n).fill(2);
  const { left, right, lufs } = masterTo(hot, hot);
  let peak = 0;
  for (let s = 0; s < n; s += 1) peak = Math.max(peak, Math.abs(left[s]), Math.abs(right[s]));
  assert.ok(20 * Math.log10(peak) <= -2, `limited peak ${20 * Math.log10(peak)} dBFS`);
  assert.ok(Number.isFinite(lufs), 'the limited track still measures a loudness');
}

// The treatment rules: genre from the list, a rich film scores, events are required and placed.
assert.equal(validateTreatment(treatment()).ok, true);
assert.equal(validateTreatment(treatment({ sound: { mode: 'score', plan: 'p', genre: 'waltz', events: treatment().sound.events } })).field, 'sound.genre');
assert.equal(validateTreatment(treatment({ sound: { mode: 'generated', plan: 'p', palette: { timbre: 'glass', key: 'A', mode: 'minor', tempo: 104 } } })).field, 'sound.mode');
assert.equal(validateTreatment(treatment({ sound: { mode: 'score', plan: 'p' } })).field, 'sound.events');
assert.equal(validateTreatment(treatment({ sound: { mode: 'score', plan: 'p', events: [{ t: 1, on: 'x', kind: 'siren' }, { t: 2, on: 'y', kind: 'tap' }] } })).field, 'sound.events[0].kind');
assert.equal(validateTreatment(treatment({ sound: { mode: 'score', plan: 'p', events: [{ t: 1.3, on: 'x', kind: 'tap' }, { t: 2.6, on: 'y', kind: 'tap' }] } })).field, 'sound.events');
assert.equal(SCORE_GENRES.length, 4);

// planCues: hits snap to a nearby cut, rises span a second, events never snap.
{
  const cues = planCues({
    beats: [{ t0: 0.9, t1: 1.5, sound: 'a hit as it lands' }, { t0: 1.5, t1: 2, sound: 'rising into the turn' }],
    durationSec: 2, cutTimes: [1.02],
    events: [{ t: 1.5, on: 'the block turns', kind: 'whoosh' }],
  });
  assert.ok(cues.some((c) => c.kind === 'hit' && c.t === 1.02), 'a hit snaps to the cut inside half a second');
  assert.ok(cues.some((c) => c.kind === 'rise' && c.t - c.start > 0), 'a rise spans into its change');
  assert.ok(cues.some((c) => c.kind === 'event' && c.t === 1.5 && c.fromCut === 0.48), 'an event keeps its own time');
}

// prepareSound builds the score for a stage render and reports it for the mux gate.
{
  const { prepareSound } = await import('../.grok/skills/lit-typographic-motion/scripts/lib/soundtrack.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'lgm-score-prep-'));
  const track = prepareSound({ out: dir, treatment: treatment(), fps: 30, frameCount: 120, cutTimes: [1.3, 2.6] });
  assert.equal(track.mode, 'score');
  assert.ok(track.path.endsWith(join('sound', 'score.wav')));
  assert.equal(track.score.genre, 'house');
  assert.ok(track.score.lufs <= -14 && track.score.lufs >= -18, `built track at ${track.score.lufs} LUFS`);
}

// `motion.mjs sound` builds the score the render would mux.
{
  const dir = mkdtempSync(join(tmpdir(), 'lgm-score-cli-'));
  writeFileSync(join(dir, 'treatment.json'), `${JSON.stringify(treatment(), null, 2)}\n`);
  const result = spawnSync(process.execPath, [motion, 'sound', '--out', dir], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /sound: score, house in .* \d+ BPM/);
  assert.match(result.stdout, /sidechain .* dB; -?\d+\.\d LUFS/);
}
