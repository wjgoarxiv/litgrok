import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SAMPLE_RATE, TIMBRES, audioGate, bedPlan, decodeWav, encodeWav, integratedLoudness, prepareTrack, renderBed, writeBed } from '../.grok/skills/lit-typographic-motion/scripts/lib/sound.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixture = (name) => JSON.parse(readFileSync(join(root, 'test/fixtures/motion', name), 'utf8'));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const scratch = () => mkdtempSync(join(tmpdir(), 'lgm-snd-'));

function findTool(name) {
  for (const dir of String(process.env.PATH ?? '').split(':')) if (dir && existsSync(join(dir, name))) return join(dir, name);
  return null;
}
const FFMPEG = findTool('ffmpeg');
const FFPROBE = findTool('ffprobe');
const NO_FFMPEG = FFMPEG && FFPROBE ? false : 'ffmpeg/ffprobe not on PATH';

const cutsOf = (t) => t.beats.slice(1).map((beat) => beat.t0);
const bedFor = (t, fps = 60) => renderBed(t, { frameCount: Math.round(t.durationSec * fps), fps, cutTimes: cutsOf(t) });
const wavOf = (bed) => encodeWav(bed.channels, SAMPLE_RATE);
const peakDb = (channels) => 20 * Math.log10(Math.max(...channels.map((c) => c.reduce((m, v) => Math.max(m, Math.abs(v)), 0))));

function sine(seconds, freq, amplitude, { silentHead = 0 } = {}) {
  const n = Math.round(seconds * SAMPLE_RATE);
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i += 1) ch[i] = i / SAMPLE_RATE < silentHead ? 0 : amplitude * Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE);
  return [ch, Float32Array.from(ch)];
}

function ebur128(wavPath) {
  const result = spawnSync(FFMPEG, ['-nostats', '-hide_banner', '-i', wavPath, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const matches = [...result.stderr.matchAll(/I:\s+(-?\d+(?:\.\d+)?) LUFS/g)];
  return Number(matches.at(-1)[1]);
}

function mux(dir, name, seconds, wav = null) {
  const out = join(dir, name);
  const args = ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=64x64:r=30'];
  if (wav) args.push('-i', wav);
  args.push('-t', String(seconds), '-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (wav) args.push('-c:a', 'aac', '-b:a', '256k');
  args.push(out);
  const result = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return out;
}

test('the generated bed is deterministic, exact in length, under the peak ceiling and at -16 LUFS', () => {
  for (const [name, fps] of [['treatment-stage.json', 60], ['treatment-type.json', 30]]) {
    const t = fixture(name);
    const a = bedFor(t, fps);
    const b = bedFor(t, fps);
    assert.equal(sha(wavOf(a)), sha(wavOf(b)), `${name}: two renders give one hash`);
    assert.equal(a.sampleCount, Math.round(Math.round(t.durationSec * fps) * SAMPLE_RATE / fps));
    assert.equal(a.channels.length, 2);
    for (const ch of a.channels) assert.equal(ch.length, a.sampleCount);
    assert.ok(a.peakDbfs <= -2, `${name}: peak ${a.peakDbfs}`);
    assert.ok(peakDb(a.channels) <= -2 + 1e-6);
    assert.ok(Math.abs(a.lufs - -16) <= 2, `${name}: ${a.lufs} LUFS`);
    assert.equal(a.method, 'bs1770');
    const head = a.channels[0].subarray(0, SAMPLE_RATE / 4);
    assert.ok(head.some((v) => Math.abs(v) > 0.01), `${name}: audible within the first 0.25 s`);
  }
});

test('each timbre and each treatment gives a different bed; key and tempo follow the palette', () => {
  const t = fixture('treatment-type.json');
  assert.deepEqual([...TIMBRES], ['glass', 'felt', 'pulse']);
  const hashes = TIMBRES.map((timbre) => sha(wavOf(bedFor({ ...t, sound: { ...t.sound, palette: timbre } }, 30))));
  assert.equal(new Set(hashes).size, 3, 'three timbres, three beds');
  const other = fixture('treatment-stage.json');
  assert.notEqual(sha(wavOf(bedFor({ ...other, sound: { ...other.sound, palette: 'felt' } }, 30))), hashes[1], 'two films, two beds');
  const plan = bedPlan({ ...t, sound: { ...t.sound, palette: { timbre: 'pulse', key: 'F# minor', tempo: 96 } } }, { durationSec: t.durationSec, cutTimes: cutsOf(t) });
  assert.equal(plan.timbre, 'pulse');
  assert.equal(plan.key, 'F# minor');
  assert.equal(plan.tempo, 96);
  const derived = bedPlan(t, { durationSec: t.durationSec, cutTimes: cutsOf(t) });
  assert.match(derived.key, /^[A-G][#b]? (major|minor)$/);
  assert.ok(derived.tempo >= 50 && derived.tempo <= 180);
});

test('accents appear only where a beat asks, each on its target within one sample', () => {
  const expected = (sound) => ['hit', 'rise', 'cadence'].filter((kind) => ({
    hit: /hit|cut|impact|accent|stab|히트|타격|컷/i, rise: /rise|swell|build|lift|riser|상승|고조|떠오/i, cadence: /cadence|close|resolve|ending|land|마무리|종지|끝/i,
  })[kind].test(sound));
  for (const name of ['treatment-stage.json', 'treatment-type.json']) {
    const t = fixture(name);
    const { cues } = bedPlan(t, { durationSec: t.durationSec, cutTimes: cutsOf(t) });
    const want = t.beats.flatMap((beat, i) => expected(beat.sound).map((kind) => `${i}:${kind}`)).sort();
    assert.deepEqual(cues.map((cue) => `${cue.beat}:${cue.kind}`).sort(), want, name);
    for (const cue of cues) {
      assert.ok(Math.abs(cue.delta) <= 1 / SAMPLE_RATE + 1e-12, `${name} ${cue.kind} delta ${cue.delta}`);
      assert.ok(Math.abs(cue.t - cue.target - cue.delta) < 1e-12);
    }
  }
  const quiet = fixture('treatment-type.json');
  quiet.beats = quiet.beats.map((beat) => ({ ...beat, sound: 'steady pulse' }));
  assert.deepEqual(bedPlan(quiet, { durationSec: quiet.durationSec, cutTimes: cutsOf(quiet) }).cues, [], 'no beat asks, no accent');
});

test('BS.1770 integrated loudness: a 997 Hz sine at -6.02 dBFS on both channels reads about -6 LUFS', () => {
  const lufs = integratedLoudness(sine(5, 997, 0.5), SAMPLE_RATE);
  assert.ok(Math.abs(lufs - -6.02) <= 0.2, `${lufs}`);
  const quieter = integratedLoudness(sine(5, 997, 0.05), SAMPLE_RATE);
  assert.ok(Math.abs(quieter - lufs + 20) <= 0.05, 'a 20 dB drop reads 20 LU lower');
});

test('BS.1770 matches ffmpeg ebur128 within 0.5 LU on both fixture beds', { skip: NO_FFMPEG }, () => {
  const dir = scratch();
  try {
    for (const name of ['treatment-stage.json', 'treatment-type.json']) {
      const t = fixture(name);
      const written = writeBed(dir, t, { frameCount: Math.round(t.durationSec * 60), fps: 60, cutTimes: cutsOf(t) });
      const reference = ebur128(written.wavPath);
      const ours = integratedLoudness(decodeWav(readFileSync(written.wavPath)).channels, SAMPLE_RATE);
      assert.ok(Math.abs(ours - reference) <= 0.5, `${name}: ours ${ours.toFixed(2)} vs ffmpeg ${reference}`);
      const cues = JSON.parse(readFileSync(written.cuesPath, 'utf8'));
      for (const key of ['timbre', 'key', 'tempo', 'sampleRate', 'sampleCount', 'lufs', 'peakDbfs', 'method', 'cues']) assert.ok(key in cues, key);
      assert.equal(written.sha256, sha(readFileSync(written.wavPath)));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('WAV round trip keeps 16-bit samples', () => {
  const [l, r] = sine(0.1, 440, 0.4);
  const decoded = decodeWav(encodeWav([l, r], SAMPLE_RATE));
  assert.equal(decoded.rate, SAMPLE_RATE);
  assert.equal(decoded.channels.length, 2);
  assert.equal(decoded.channels[0].length, l.length);
  for (let i = 0; i < l.length; i += 97) assert.ok(Math.abs(decoded.channels[0][i] - l[i]) < 1e-4);
});

test('prepareTrack pads a short track and trims a long one to the exact sample count', { skip: NO_FFMPEG }, () => {
  const dir = scratch();
  try {
    writeFileSync(join(dir, 'short.wav'), encodeWav(sine(1, 330, 0.3), SAMPLE_RATE));
    writeFileSync(join(dir, 'long.wav'), encodeWav(sine(3, 330, 0.3), SAMPLE_RATE));
    const padded = prepareTrack({ file: join(dir, 'short.wav'), durationSec: 2.5, ffmpeg: FFMPEG, outPath: join(dir, 'p.wav') });
    assert.equal(padded.padded, true);
    assert.equal(padded.trimmed, false);
    const p = decodeWav(readFileSync(padded.path));
    assert.equal(p.channels[0].length, Math.round(2.5 * SAMPLE_RATE));
    assert.equal(p.channels[0][Math.round(2 * SAMPLE_RATE)], 0, 'the pad is silence');
    assert.ok(Math.abs(p.channels[0][SAMPLE_RATE - 1]) < 0.01, 'a fade reaches the pad');
    const trimmed = prepareTrack({ file: join(dir, 'long.wav'), durationSec: 1, ffmpeg: FFMPEG, outPath: join(dir, 't.wav') });
    assert.equal(trimmed.trimmed, true);
    assert.equal(decodeWav(readFileSync(trimmed.path)).channels[1].length, SAMPLE_RATE);
    assert.ok(Math.abs(trimmed.sourceSec - 3) < 0.01);
    assert.throws(() => prepareTrack({ file: join(dir, 'missing.wav'), durationSec: 1, ffmpeg: FFMPEG, outPath: join(dir, 'm.wav') }), /^Error: SOUND_INVALID:/);
    writeFileSync(join(dir, 'junk.wav'), 'not audio');
    assert.throws(() => prepareTrack({ file: join(dir, 'junk.wav'), durationSec: 1, ffmpeg: FFMPEG, outPath: join(dir, 'j.wav') }), /SOUND_INVALID:/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the audio gate: a missing stream and a silent generated opening exit 20; supplied only warns; a bed passes', { skip: NO_FFMPEG }, () => {
  const dir = scratch();
  const gate = (mp4, mode, seconds) => audioGate({ mp4, videoDurationSec: seconds, mode, ffmpeg: FFMPEG, ffprobe: FFPROBE });
  try {
    const silentVideo = mux(dir, 'none.mp4', 3);
    const missing = gate(silentVideo, 'generated', 3);
    assert.equal(missing.results[0].status, 'FAIL');
    assert.equal(missing.exit20, true);
    assert.equal(gate(silentVideo, 'none', 3).results[0].status, 'PASS');

    writeFileSync(join(dir, 'late.wav'), encodeWav(sine(3, 220, 0.2, { silentHead: 2 }), SAMPLE_RATE));
    const late = mux(dir, 'late.mp4', 3, join(dir, 'late.wav'));
    const generated = gate(late, 'generated', 3);
    assert.equal(generated.results[0].status, 'FAIL', generated.results[0].detail);
    assert.equal(generated.exit20, true);
    const supplied = gate(late, 'supplied', 3);
    assert.equal(supplied.results[0].status, 'WARN', supplied.results[0].detail);
    assert.equal(supplied.exit20, false);
    assert.equal(gate(late, 'none', 3).results[0].status, 'WARN', 'a stream where none was planned');

    const t = fixture('treatment-type.json');
    const bed = writeBed(dir, t, { frameCount: t.durationSec * 30, fps: 30, cutTimes: cutsOf(t) });
    const good = mux(dir, 'bed.mp4', t.durationSec, bed.wavPath);
    const passed = gate(good, 'generated', t.durationSec);
    assert.equal(passed.results[0].status, 'PASS', passed.results[0].detail);
    assert.equal(passed.exit20, false);
    assert.ok(Math.abs(passed.stats.durationSec - t.durationSec) <= 0.1);
    assert.equal(gate(good, 'generated', t.durationSec + 1).results[0].status, 'FAIL', 'a track 1 s short of the video fails');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
