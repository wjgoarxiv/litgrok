// The film's sound on either path (brief section 7): a generated bed (the default under bare lit),
// a supplied file, or a WAV the model authored under stage/. Every planned track is muxed, whatever
// the librosa tier's state, after being padded or trimmed to the video's exact length.
import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, join, sep } from 'node:path';
import { findTool } from './render.mjs';
import { audioGate, prepareTrack, writeBed } from './sound.mjs';

export function soundFile(out, treatment) {
  const file = treatment.sound.file;
  return isAbsolute(file) ? file : join(out, file);
}

export function prepareSound({ out, treatment, fps, frameCount, cutTimes = [], ffmpeg, tempo = null }) {
  const mode = treatment.sound.mode;
  if (mode === 'none') return null;
  if (mode === 'generated') {
    const bed = writeBed(out, treatment, { frameCount, fps, cutTimes, tempo });
    return { mode, path: bed.wavPath, bed };
  }
  const file = soundFile(out, treatment);
  if (!existsSync(file)) throw new Error(`SOUND_INVALID: the ${mode} track ${treatment.sound.file} does not exist`);
  if (mode === 'authored') {
    const root = realpathSync(join(out, 'stage'));
    if (!realpathSync(file).startsWith(`${root}${sep}`)) throw new Error('SOUND_INVALID: an authored track must be a WAV inside stage/');
  }
  const prepared = prepareTrack({ file, durationSec: frameCount / fps, ffmpeg, outPath: join(out, '.run', 'track.wav') });
  return { mode, path: prepared.path, prepared };
}

export function muxGate({ mp4, durationSec, treatment, env = process.env, track }) {
  const mode = treatment.sound.mode;
  const gate = audioGate({ mp4, videoDurationSec: durationSec, mode, ffmpeg: findTool('ffmpeg', env), ffprobe: findTool('ffprobe', env) });
  const bed = track?.bed;
  const summary = { mode, label: mode === 'generated' ? 'generated sound bed' : mode === 'none' ? 'silent by request' : `${mode} track`, ...(bed ? { timbre: bed.timbre, key: bed.key, tempo: bed.tempo, lufs: bed.lufs, peakDbfs: bed.peakDbfs, method: bed.method, sha256: bed.sha256 } : {}), ...(track?.prepared ? { sourceSec: track.prepared.sourceSec, padded: track.prepared.padded, trimmed: track.prepared.trimmed } : {}) };
  return { results: gate.results, exit20: gate.exit20, stats: { ...gate.stats, ...summary }, summary };
}
