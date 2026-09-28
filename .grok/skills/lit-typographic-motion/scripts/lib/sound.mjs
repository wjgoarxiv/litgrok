// Sound for both paths (brief section 7): a deterministic generated bed written in pure code from
// the treatment (tempo + pulse + a chord-progression pad, accents only where a beat asks), ITU-R
// BS.1770-4 integrated loudness, 16-bit WAV I/O, supplied/authored track preparation and the
// audio gate on the decoded muxed stream. No network, no model weights, no wall clock.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIRECTOR } from './constants.mjs';
import { fnv1a32, mulberry32 } from './seed.mjs';

export const SAMPLE_RATE = 48000;
export const TIMBRES = DIRECTOR.timbres;

// The three documented palettes. glass: FM bell partials over a sine pad; felt: soft low-passed
// triangle/saw pad with a mellow pluck and a soft kick; pulse: pulse-width synth pad with a tight
// kick every beat and off-beat hats.
const TIMBRE_SPEC = Object.freeze({
  glass: { padCutoff: 5200, padLevel: 0.20, pulseLevel: 0.30 },
  felt: { padCutoff: 900, padLevel: 0.26, pulseLevel: 0.34 },
  pulse: { padCutoff: 1400, padLevel: 0.18, pulseLevel: 0.40 },
});

const PITCH = Object.freeze({ C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 });
const NAMES = Object.freeze(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
const SCALE = Object.freeze({ major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] });
const PROGRESSION = Object.freeze({ major: [0, 5, 3, 4], minor: [0, 5, 2, 6] });
const ACCENTS = Object.freeze({
  hit: /hit|cut|impact|accent|stab|히트|타격|컷/i,
  rise: /rise|swell|build|lift|riser|상승|고조|떠오/i,
  cadence: /cadence|close|resolve|ending|land|마무리|종지|끝/i,
});
const PEAK_CEILING = 10 ** (-2.1 / 20);
const TARGET_LUFS = -16;

function parseKey(value) {
  const match = String(value ?? '').trim().match(/^([A-Ga-g])([#b]?)\s+(major|minor)$/);
  if (!match) return null;
  const name = `${match[1].toUpperCase()}${match[2]}`;
  return PITCH[name] === undefined ? null : { root: PITCH[name], mode: match[3], name: `${name} ${match[3]}` };
}

const quantize = (t) => Math.round(t * SAMPLE_RATE) / SAMPLE_RATE;

// Timbre, key and tempo: from sound.palette when it states them, otherwise derived from the
// treatment so two films never share a bed by accident. options.tempo (a type-path brief's bpm)
// wins over the derivation but not over an explicit palette tempo.
export function bedPlan(treatment, { durationSec = treatment.durationSec, cutTimes = [], tempo: tempoOverride = null } = {}) {
  const palette = treatment.sound?.palette;
  const spec = typeof palette === 'object' && palette ? palette : { timbre: palette };
  const hash = fnv1a32(`${treatment.seed ?? ''}:${treatment.idea ?? ''}:${treatment.request ?? ''}`);
  const timbre = TIMBRES.includes(spec.timbre) ? spec.timbre : TIMBRES[hash % TIMBRES.length];
  const key = parseKey(spec.key) ?? { root: (hash >>> 3) % 12, mode: (hash >>> 7) & 1 ? 'minor' : 'major' };
  key.name ??= `${NAMES[key.root]} ${key.mode}`;
  const tempo = Number.isFinite(spec.tempo) ? spec.tempo : Number.isFinite(tempoOverride) ? tempoOverride : 72 + ((hash >>> 11) % 49);
  const cues = [];
  const beats = Array.isArray(treatment.beats) ? treatment.beats : [];
  beats.forEach((beat, index) => {
    const text = String(beat.sound ?? '');
    if (ACCENTS.hit.test(text)) {
      const near = cutTimes.reduce((best, cut) => (Math.abs(cut - beat.t0) < Math.abs(best - beat.t0) ? cut : best), beat.t0);
      const target = Math.abs(near - beat.t0) <= 0.5 ? near : beat.t0;
      cues.push({ kind: 'hit', beat: index, target });
    }
    if (ACCENTS.rise.test(text)) cues.push({ kind: 'rise', beat: index, target: Math.min(beat.t1, durationSec), from: Math.max(beat.t0, beat.t1 - 1.5) });
    if (ACCENTS.cadence.test(text)) cues.push({ kind: 'cadence', beat: index, target: Math.max(beat.t0, Math.min(beat.t1, durationSec) - 2) });
  });
  for (const cue of cues) { cue.t = quantize(cue.target); cue.delta = cue.t - cue.target; }
  return { timbre, key: key.name, tempo, root: key.root, mode: key.mode, cues: cues.map(({ t, kind, beat, target, delta, from }) => ({ t, kind, beat, target, delta, ...(from !== undefined ? { from } : {}) })) };
}

const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);
const tri = (p) => 4 * Math.abs(p - Math.floor(p + 0.5)) - 1;
const saw = (p) => 2 * (p - Math.floor(p + 0.5));

function chordNotes(plan, degree) {
  const scale = SCALE[plan.mode];
  const note = (d) => scale[d % 7] + 12 * Math.floor(d / 7);
  const base = 48 + plan.root;
  return [base + note(degree), base + note(degree + 2), base + note(degree + 4)];
}

function degreeAt(plan, t, barSec, beatSec, cadence) {
  if (cadence !== null && t >= cadence) return 0;
  if (cadence !== null && t >= cadence - 2 * beatSec) return 4;
  return PROGRESSION[plan.mode][Math.floor(t / barSec) % 4];
}

// A decaying one-shot added into both channels from `start` for `length` seconds.
function addEvent(out, start, length, pan, voice) {
  const from = Math.max(0, Math.round(start * SAMPLE_RATE));
  const to = Math.min(out[0].length, Math.round((start + length) * SAMPLE_RATE));
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  for (let i = from; i < to; i += 1) {
    const v = voice((i - from) / SAMPLE_RATE, i);
    out[0][i] += v * gl; out[1][i] += v * gr;
  }
}

function synthesize(plan, sampleCount) {
  const spec = TIMBRE_SPEC[plan.timbre];
  const out = [new Float64Array(sampleCount), new Float64Array(sampleCount)];
  const beatSec = 60 / plan.tempo, barSec = 4 * beatSec;
  const durationSec = sampleCount / SAMPLE_RATE;
  const cadenceCue = plan.cues.find((cue) => cue.kind === 'cadence');
  const cadence = cadenceCue ? cadenceCue.t : null;
  const rand = mulberry32(fnv1a32(`${plan.timbre}:${plan.key}:${plan.tempo}`));

  // Pad: four phase-continuous voices (bass + triad), each slightly detuned per channel.
  const phases = [[0, 0, 0, 0], [0.13, 0.29, 0.41, 0.07]];
  const lp = [[0, 0, 0, 0], [0, 0, 0, 0]];
  const alpha = 1 - Math.exp((-2 * Math.PI * spec.padCutoff) / SAMPLE_RATE);
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / SAMPLE_RATE;
    const [a, b, c] = chordNotes(plan, degreeAt(plan, t, barSec, beatSec, cadence));
    const notes = [a - 12, a, b, c];
    const swell = 0.85 + 0.15 * Math.sin(2 * Math.PI * t / barSec);
    for (let ch = 0; ch < 2; ch += 1) {
      let sum = 0;
      for (let v = 0; v < 4; v += 1) {
        const hz = midiHz(notes[v]) * (ch === 0 ? 1 : 1.0012) * (v === 0 ? 1 : 1 + (v - 2) * 0.0007);
        phases[ch][v] = (phases[ch][v] + hz / SAMPLE_RATE) % 1;
        const p = phases[ch][v];
        let s;
        if (plan.timbre === 'glass') s = Math.sin(2 * Math.PI * p) + 0.3 * Math.sin(4 * Math.PI * p) + 0.08 * Math.sin(2 * Math.PI * 3.01 * p);
        else if (plan.timbre === 'felt') s = tri(p) + 0.3 * saw(p);
        else s = (p % 1 < 0.5 + 0.2 * Math.sin(2 * Math.PI * 0.2 * t) ? 1 : -1) * 0.7;
        lp[ch][v] += alpha * (s - lp[ch][v]);
        sum += lp[ch][v] * (v === 0 ? 0.9 : 0.55);
      }
      out[ch][i] += sum * spec.padLevel * swell;
    }
  }

  // Pulse: one event per beat, voiced by the timbre.
  const beats = Math.ceil(durationSec / beatSec);
  for (let k = 0; k < beats; k += 1) {
    const start = k * beatSec;
    const [a, b, c] = chordNotes(plan, degreeAt(plan, start, barSec, beatSec, cadence));
    const tone = midiHz([a, b, c][k % 3] + 24);
    const accent = k % 4 === 0 ? 1 : 0.75;
    if (plan.timbre === 'glass') {
      addEvent(out, start, 0.9, (k % 2 ? 0.3 : -0.3), (tau) => spec.pulseLevel * accent * Math.exp(-tau * 5) * Math.sin(2 * Math.PI * tone * tau + 2 * Math.exp(-tau * 6) * Math.sin(2 * Math.PI * 3.5 * tone * tau)));
    } else if (plan.timbre === 'felt') {
      addEvent(out, start, 0.6, 0.15, (tau) => spec.pulseLevel * accent * Math.exp(-tau * 7) * tri(tone * 0.5 * tau));
      if (k % 2 === 0) addEvent(out, start, 0.35, 0, (tau) => 0.5 * Math.exp(-tau * 18) * Math.sin(2 * Math.PI * (50 * tau + 40 * (1 - Math.exp(-tau * 30)) / 30)));
    } else {
      addEvent(out, start, 0.35, 0, (tau) => spec.pulseLevel * 1.4 * Math.exp(-tau * 14) * Math.sin(2 * Math.PI * (45 * tau + 85 * (1 - Math.exp(-tau * 25)) / 25)));
      addEvent(out, start + beatSec / 2, 0.08, 0.35, () => 0.12 * (rand() * 2 - 1));
      addEvent(out, start, 0.12, -0.2, (tau) => spec.pulseLevel * 0.35 * Math.exp(-tau * 30) * (Math.sin(2 * Math.PI * tone * tau) > 0 ? 1 : -1));
    }
  }

  // Accents, only where a beat asked for one.
  for (const cue of plan.cues) {
    const [a, b, c] = chordNotes(plan, cue.kind === 'cadence' ? 0 : degreeAt(plan, cue.t, barSec, beatSec, cadence));
    if (cue.kind === 'hit') {
      addEvent(out, cue.t, 0.5, 0, (tau) => 0.8 * Math.exp(-tau * 9) * Math.sin(2 * Math.PI * (40 * tau + 110 * (1 - Math.exp(-tau * 20)) / 20)));
      let state = 0;
      addEvent(out, cue.t, 0.4, 0.1, (tau) => { state += 0.25 * (rand() * 2 - 1 - state); return 0.35 * Math.exp(-tau * 10) * state; });
      addEvent(out, cue.t, 0.8, -0.1, (tau) => 0.25 * Math.exp(-tau * 4) * [a, b, c].reduce((s, m) => s + Math.sin(2 * Math.PI * midiHz(m + 12) * tau), 0) / 3);
    } else if (cue.kind === 'rise') {
      const length = Math.max(0.2, cue.t - cue.from);
      let state = 0;
      addEvent(out, cue.t - length, length, 0, (tau, i) => {
        const p = tau / length;
        const cut = 1 - Math.exp((-2 * Math.PI * (200 + 5800 * p * p)) / SAMPLE_RATE);
        state += cut * ((rand() * 2 - 1) - state);
        const glide = midiHz(a + 12 * p);
        return p * p * (0.28 * state + 0.18 * Math.sin(2 * Math.PI * glide * (i / SAMPLE_RATE)));
      });
    } else {
      const length = Math.max(0.5, durationSec - cue.t);
      addEvent(out, cue.t, length, 0, (tau) => 0.3 * Math.exp(-tau * 1.2) * [a - 12, a, b, c, a + 12].reduce((s, m) => s + Math.sin(2 * Math.PI * midiHz(m) * tau), 0) / 5);
    }
  }

  // Edges: 20 ms fade in, and a fade out over the last second (or a tenth of a short bed).
  const fadeIn = Math.min(sampleCount, Math.round(0.02 * SAMPLE_RATE));
  const fadeOut = Math.min(sampleCount, Math.round(Math.min(1, durationSec * 0.1) * SAMPLE_RATE));
  for (let ch = 0; ch < 2; ch += 1) {
    for (let i = 0; i < fadeIn; i += 1) out[ch][i] *= i / fadeIn;
    for (let i = 0; i < fadeOut; i += 1) out[ch][sampleCount - 1 - i] *= i / fadeOut;
  }
  return out;
}

// ---- BS.1770-4 ---------------------------------------------------------------------------------

function biquad(x, b, a) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const SHELF = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [1, -1.69065929318241, 0.73248077421585] };
const HIGHPASS = { b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] };

export function integratedLoudness(channels, rate = SAMPLE_RATE) {
  const block = Math.round(0.4 * rate), hop = Math.round(0.1 * rate);
  const n = channels[0]?.length ?? 0;
  if (n < block) return -Infinity;
  const prefix = channels.map((ch) => {
    const y = biquad(biquad(ch, SHELF.b, SHELF.a), HIGHPASS.b, HIGHPASS.a);
    const sums = new Float64Array(n + 1);
    for (let i = 0; i < n; i += 1) sums[i + 1] = sums[i] + y[i] * y[i];
    return sums;
  });
  const powers = [];
  for (let s = 0; s + block <= n; s += hop) powers.push(prefix.reduce((sum, p) => sum + (p[s + block] - p[s]) / block, 0));
  const loud = (z) => -0.691 + 10 * Math.log10(z);
  const absolute = powers.filter((z) => loud(z) > -70);
  if (!absolute.length) return -Infinity;
  const relative = loud(absolute.reduce((a, b) => a + b, 0) / absolute.length) - 10;
  const gated = absolute.filter((z) => loud(z) > relative);
  return loud(gated.reduce((a, b) => a + b, 0) / gated.length);
}

// Gain to the target loudness, then a tanh ceiling below -2 dBFS; repeat so the ceiling's own
// loudness loss is made up. Deterministic and converges in a few passes.
function master(raw) {
  let gain = 10 ** ((TARGET_LUFS - integratedLoudness(raw)) / 20);
  let out;
  for (let pass = 0; pass < 4; pass += 1) {
    out = raw.map((ch) => Float32Array.from(ch, (v) => PEAK_CEILING * Math.tanh((v * gain) / PEAK_CEILING)));
    const lufs = integratedLoudness(out);
    if (Math.abs(lufs - TARGET_LUFS) < 0.1) break;
    gain *= 10 ** ((TARGET_LUFS - lufs) / 20);
  }
  const quantized = out.map((ch) => Float32Array.from(ch, (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767))) / 32767));
  return quantized;
}

const peakOf = (channels) => channels.reduce((m, ch) => { for (const v of ch) if (Math.abs(v) > m) m = Math.abs(v); return m; }, 0);
const dbfs = (value) => (value > 0 ? 20 * Math.log10(value) : -Infinity);

export function renderBed(treatment, { frameCount, fps, cutTimes = [], tempo = null } = {}) {
  const sampleCount = Math.round((frameCount * SAMPLE_RATE) / fps);
  const plan = bedPlan(treatment, { durationSec: sampleCount / SAMPLE_RATE, cutTimes, tempo });
  const channels = master(synthesize(plan, sampleCount));
  const round2 = (v) => Math.round(v * 100) / 100;
  return { channels, sampleCount, cues: plan.cues, timbre: plan.timbre, key: plan.key, tempo: plan.tempo, lufs: round2(integratedLoudness(channels)), peakDbfs: round2(dbfs(peakOf(channels))), method: 'bs1770' };
}

// ---- WAV ---------------------------------------------------------------------------------------

export function encodeWav(channels, rate = SAMPLE_RATE) {
  const count = channels[0].length, n = channels.length;
  const data = Buffer.alloc(count * n * 2);
  for (let i = 0; i < count; i += 1) {
    for (let c = 0; c < n; c += 1) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(channels[c][i] * 32767))), (i * n + c) * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'latin1'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8, 'latin1');
  header.write('fmt ', 12, 'latin1'); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(n, 22);
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * n * 2, 28); header.writeUInt16LE(n * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36, 'latin1'); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function decodeWav(buffer) {
  if (buffer.toString('latin1', 0, 4) !== 'RIFF' || buffer.toString('latin1', 8, 12) !== 'WAVE') throw new Error('not a RIFF/WAVE file');
  let offset = 12, format = null, data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('latin1', offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + size);
    if (id === 'fmt ') {
      let tag = body.readUInt16LE(0);
      if (tag === 0xfffe && body.length >= 26) tag = body.readUInt16LE(24);
      format = { tag, channels: body.readUInt16LE(2), rate: body.readUInt32LE(4), bits: body.readUInt16LE(14) };
    } else if (id === 'data') data = body;
    offset += 8 + size + (size % 2);
  }
  if (!format || !data) throw new Error('WAV has no fmt or data chunk');
  const bytes = format.bits / 8, frames = Math.floor(data.length / (bytes * format.channels));
  const read = format.tag === 3 && format.bits === 32 ? (o) => data.readFloatLE(o)
    : format.bits === 16 ? (o) => data.readInt16LE(o) / 32767
      : format.bits === 24 ? (o) => data.readIntLE(o, 3) / 8388607
        : format.bits === 32 ? (o) => data.readInt32LE(o) / 2147483647 : null;
  if (!read || (format.tag !== 1 && format.tag !== 3)) throw new Error(`unsupported WAV format ${format.tag}/${format.bits}-bit`);
  const channels = Array.from({ length: format.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i += 1) for (let c = 0; c < format.channels; c += 1) channels[c][i] = read((i * format.channels + c) * bytes);
  return { rate: format.rate, channels };
}

export function writeBed(outDir, treatment, options) {
  const bed = renderBed(treatment, options);
  mkdirSync(outDir, { recursive: true });
  const wav = encodeWav(bed.channels, SAMPLE_RATE);
  const wavPath = join(outDir, 'sound.wav'), cuesPath = join(outDir, 'sound-cues.json');
  writeFileSync(wavPath, wav);
  const stats = { timbre: bed.timbre, key: bed.key, tempo: bed.tempo, sampleRate: SAMPLE_RATE, sampleCount: bed.sampleCount, lufs: bed.lufs, peakDbfs: bed.peakDbfs, method: bed.method };
  writeFileSync(cuesPath, `${JSON.stringify({ ...stats, cues: bed.cues }, null, 2)}\n`);
  return { wavPath, cuesPath, sha256: createHash('sha256').update(wav).digest('hex'), ...stats, cues: bed.cues };
}

// ---- supplied and authored tracks --------------------------------------------------------------

function decodeWithFfmpeg(ffmpeg, file, format) {
  const result = spawnSync(ffmpeg, ['-v', 'error', '-i', file, '-vn', '-f', format, '-ac', '2', '-ar', String(SAMPLE_RATE), '-'], { maxBuffer: 2 ** 31 });
  return result;
}

// Pad (silence) or trim to exactly durationSec, with a 50 ms fade at the boundary.
export function prepareTrack({ file, durationSec, ffmpeg, outPath }) {
  if (!file || !existsSync(file)) throw new Error(`SOUND_INVALID: audio file not found (${file})`);
  if (!ffmpeg) throw new Error('SOUND_INVALID: ffmpeg is needed to decode the track');
  const result = decodeWithFfmpeg(ffmpeg, file, 's16le');
  if (result.status !== 0 || !result.stdout?.length) throw new Error(`SOUND_INVALID: cannot decode ${file}: ${String(result.stderr ?? '').trim().split('\n').at(-1) || 'no audio'}`);
  const source = result.stdout;
  const sourceFrames = Math.floor(source.length / 4);
  const target = Math.round(durationSec * SAMPLE_RATE);
  const fade = Math.round(0.05 * SAMPLE_RATE);
  const channels = [new Float32Array(target), new Float32Array(target)];
  const kept = Math.min(sourceFrames, target);
  for (let i = 0; i < kept; i += 1) {
    const gain = i >= kept - fade ? Math.max(0, (kept - 1 - i) / fade) : 1;
    channels[0][i] = (source.readInt16LE(i * 4) / 32768) * gain;
    channels[1][i] = (source.readInt16LE(i * 4 + 2) / 32768) * gain;
  }
  writeFileSync(outPath, encodeWav(channels, SAMPLE_RATE));
  return { path: outPath, sourceSec: sourceFrames / SAMPLE_RATE, padded: sourceFrames < target, trimmed: sourceFrames > target };
}

// ---- gate --------------------------------------------------------------------------------------

function hasAudioStream(mp4, ffprobe) {
  if (!ffprobe) return null;
  const result = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', mp4], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim().length > 0 : null;
}

export function audioGate({ mp4, videoDurationSec, mode, ffmpeg, ffprobe }) {
  const done = (status, detail, exit20, stats = {}) => ({ results: [{ id: 'SOUND', status, detail }], exit20, stats });
  if (!mp4 || !existsSync(mp4)) return done('FAIL', 'no master to check', mode !== 'none');
  let present = hasAudioStream(mp4, ffprobe);
  let decoded = null;
  if (present !== false && ffmpeg) {
    const result = spawnSync(ffmpeg, ['-v', 'error', '-i', mp4, '-map', '0:a:0', '-f', 'f32le', '-ac', '2', '-ar', String(SAMPLE_RATE), '-'], { maxBuffer: 2 ** 31 });
    if (result.status === 0 && result.stdout.length) decoded = result.stdout;
    if (present === null) present = Boolean(decoded);
  }
  if (mode === 'none') return present ? done('WARN', 'an audio stream is present although the treatment chose none', false, { present }) : done('PASS', 'no audio stream, as planned', false, { present });
  if (!present || !decoded) return done('FAIL', `planned ${mode} sound but the master has no decodable audio stream`, true, { present: Boolean(present) });
  const frames = Math.floor(decoded.length / 8);
  const durationSec = frames / SAMPLE_RATE;
  let peak = 0;
  for (let i = 0; i < frames * 2; i += 1) { const v = Math.abs(decoded.readFloatLE(i * 4)); if (v > peak) peak = v; }
  const window = Math.round(0.05 * SAMPLE_RATE);
  const head = Math.min(frames, 3 * SAMPLE_RATE);
  let run = 0, longest = 0;
  for (let s = 0; s + window <= head; s += window) {
    let sum = 0;
    for (let i = s; i < s + window; i += 1) { const l = decoded.readFloatLE(i * 8), r = decoded.readFloatLE(i * 8 + 4); sum += (l * l + r * r) / 2; }
    const quiet = dbfs(Math.sqrt(sum / window)) < -50;
    run = quiet ? run + window : 0;
    longest = Math.max(longest, run);
  }
  const quietSec = longest / SAMPLE_RATE;
  const stats = { present: true, durationSec: Math.round(durationSec * 1000) / 1000, peakDbfs: Math.round(dbfs(peak) * 100) / 100, quietOpeningSec: Math.round(quietSec * 100) / 100 };
  const problems = [];
  let exit20 = false, status = 'PASS';
  if (Math.abs(durationSec - videoDurationSec) > 0.1) { problems.push(`audio ${durationSec.toFixed(3)} s vs video ${videoDurationSec.toFixed(3)} s (±0.1 s)`); status = 'FAIL'; }
  if (dbfs(peak) > -0.5) { problems.push(`sample peak ${dbfs(peak).toFixed(2)} dBFS > -0.5`); status = 'FAIL'; }
  if (quietSec > 1.5) {
    problems.push(`${quietSec.toFixed(2)} s below -50 dBFS RMS in the first 3 s`);
    if (mode === 'generated') { status = 'FAIL'; exit20 = true; } else if (status === 'PASS') status = 'WARN';
  }
  const detail = `${mode} track ${stats.durationSec} s, peak ${stats.peakDbfs} dBFS, quiet opening ${stats.quietOpeningSec} s${problems.length ? `; ${problems.join('; ')}` : ''}`;
  return done(status, detail, exit20, stats);
}
