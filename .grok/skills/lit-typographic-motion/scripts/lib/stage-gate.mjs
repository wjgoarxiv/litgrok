// The stage-path gate (brief section 6h). N/A there: MO-C-01, MO-C-02 (the stage path is always the
// software rung), the glyph-mask method of MO-C-14, MO-D-02. Replaced by the text QA: MO-C-04,
// MO-C-06, MO-C-07/08. Applied: MO-C-03 (grid and window transposed for 9:16), MO-C-10..13, MO-D-03,
// MO-C-09 as a sequential replay, and the sound gate. evaluateStage() is pure over recorded facts.
import { existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { OUTPUT, STAGE } from './constants.mjs';
import { checkDarkRuns, checkFlash, checkSizes } from './gate.mjs';
import { lookSummary } from './look.mjs';

const pass = (id, detail = '') => ({ id, status: 'PASS', detail });
const fail = (id, detail) => ({ id, status: 'FAIL', detail });
const warn = (id, detail) => ({ id, status: 'WARN', detail });

function exportInfo(path) {
  return existsSync(path) ? { present: true, bytes: statSync(path).size, path, name: path.split('/').pop() } : { present: false };
}

export function probeMaster(path) {
  const result = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt,color_space,color_range,color_transfer,color_primaries,r_frame_rate:format=duration', '-of', 'json', path], { encoding: 'utf8' });
  if (result.error || result.status !== 0) return { error: result.error?.message ?? result.stderr.trim() };
  const data = JSON.parse(result.stdout);
  const s = data.streams?.[0] ?? {};
  const [num, den] = String(s.r_frame_rate ?? '0/1').split('/').map(Number);
  return { width: s.width, height: s.height, pixFmt: s.pix_fmt, colorSpace: s.color_space, colorRange: s.color_range, colorTransfer: s.color_transfer, colorPrimaries: s.color_primaries, fps: den ? num / den : 0, durationSec: Number(data.format?.duration) };
}

export function checkStageEncode(manifest, probe) {
  if (!probe || probe.error) return [fail('MO-C-10/11/12', `ffprobe unavailable: ${probe?.error ?? 'no master'}`), fail('MO-A-03', 'encode tags not verifiable')];
  const [w, h] = manifest.resolution;
  const size = probe.width === w && probe.height === h;
  const fps = probe.fps >= OUTPUT.minFps - 1e-6 && Math.abs(probe.fps - manifest.fps) < 0.01;
  const target = manifest.targetDurationSec;
  const off = Math.abs(probe.durationSec - target) / target;
  const tags = probe.pixFmt === 'yuv420p' && probe.colorSpace === 'bt709' && probe.colorRange === 'tv';
  const detail = `${probe.durationSec?.toFixed(2)} s (target ${target} s, ${(off * 100).toFixed(1)} % off) @ ${probe.fps?.toFixed(2)} fps, ${probe.width}x${probe.height} (${manifest.format}); ffprobe ${probe.pixFmt}/${probe.colorSpace}/${probe.colorRange}`;
  const results = [];
  if (!size || !fps || !tags) results.push(fail('MO-C-10/11/12', detail));
  else if (off > STAGE.durationTolerance + 1e-9) results.push(fail('MO-C-10/11/12', `${detail}; the render must land within ±10 % of the treatment's duration`));
  else results.push(pass('MO-C-10/11/12', detail));
  const allTags = tags && probe.colorTransfer === 'bt709' && probe.colorPrimaries === 'bt709';
  results.push(allTags ? pass('MO-A-03', 'BT.709 matrix, transfer, primaries; tv range; yuv420p') : fail('MO-A-03', `tags ${probe.colorSpace}/${probe.colorTransfer}/${probe.colorPrimaries}/${probe.colorRange}/${probe.pixFmt}`));
  return results;
}

export function checkStageDeterminism(determinism) {
  if (!determinism) return fail('MO-C-09', 'no replay recorded');
  const frames = determinism.frames.join(', ');
  if (determinism.verdict === 'PASS') return pass('MO-C-09', `decoded RGBA SHA-256 equal on a sequential replay in a fresh Chrome (frames ${frames})`);
  const m = determinism.mismatched[0];
  const region = m.region ? `; first differing region x ${m.region.x0}-${m.region.x1}, y ${m.region.y0}-${m.region.y1} (${m.region.pixels} px)` : '';
  return fail('MO-C-09', `frame ${m.frame} differs on replay${region} (${determinism.mismatched.length} of ${determinism.frames.length} samples)`);
}

export function evaluateStage({ manifest, frames, previewRecords, determinism, preview, sound, qa, stillFrame, exportsDir }) {
  const results = [];
  const flash = checkFlash({ fps: manifest.fps, previewEncoder: manifest.previewEncoder }, frames, previewRecords);
  results.push(flash.result);
  results.push(checkStageDeterminism(determinism));
  const mp4 = exportInfo(join(exportsDir, 'film.mp4'));
  results.push(...checkStageEncode(manifest, mp4.present ? probeMaster(mp4.path) : null));
  const previewName = existsSync(join(exportsDir, 'preview.webp')) ? 'preview.webp' : 'preview.gif';
  const exports = { mp4, preview: exportInfo(join(exportsDir, previewName)), poster: exportInfo(join(exportsDir, 'poster.png')) };
  results.push(checkSizes(manifest, exports, preview));
  const still = exportInfo(join(exportsDir, 'reduced-motion.png'));
  results.push(still.present ? pass('MO-C-14', `present Y: the final beat's midpoint frame ${stillFrame}`) : fail('MO-C-14', 'present N: reduced-motion still missing'));
  results.push(checkDarkRuns({ fps: manifest.fps, bpm: manifest.sound?.tempo ?? 100, timeline: [] }, frames));
  results.push(...(sound?.results ?? [fail('SOUND', 'sound gate not run')]));
  results.push(...(qa?.results ?? []));
  results.push(manifest.round >= 1 && manifest.round <= 3 ? pass('MO-C-15/16', `round ${manifest.round} of 3`) : fail('MO-C-15/16', `round ${manifest.round} outside 1..3`));
  const failed = results.filter((r) => r.status === 'FAIL');
  return { status: failed.length ? 'FAIL' : 'PASS', results, flash };
}

export function stageReportText({ manifest, gate, withheld, perf, outDir, treatment }) {
  const lines = ['lit-typographic-motion — stage render report'];
  const where = withheld ? `${withheld}/` : `${outDir}/`;
  lines.push(`outputs: ${where}film.mp4 · ${where}preview (${manifest.previewEncoder}) · ${where}poster.png · ${where}reduced-motion.png${withheld ? '  [WITHHELD: diagnostics only, not deliverables]' : ''}`);
  lines.push(`path: stage · format ${manifest.format} (${manifest.resolution.join('x')}) · ${manifest.durationSec.toFixed(2)} s of ${treatment.durationSec} s target @ ${manifest.fps} fps`);
  lines.push(`sound: ${manifest.sound?.label ?? 'n/a'}${manifest.sound?.timbre ? ` (${manifest.sound.timbre}, ${manifest.sound.key}, ${manifest.sound.tempo} BPM, ${manifest.sound.lufs?.toFixed?.(1)} LUFS)` : ''}`);
  lines.push(`renderer: ${manifest.renderer}`);
  lines.push('');
  lines.push(`QA gate: ${gate.status}`);
  for (const r of gate.results) lines.push(`  ${`${r.id}:`.padEnd(30)}${r.status}  (${r.detail})`);
  lines.push('');
  lines.push(`craft rounds run: ${manifest.round} / 3 max`);
  const seen = lookSummary(outDir);
  lines.push(`frames looked at: ${seen.viewed} file(s) across ${seen.rounds} look round(s) in look.json${seen.blocked ? ' (a round was blocked: no vision tool)' : ''}; a gate re-run never changes this`);
  if (perf) lines.push(`capture: ${perf.frames} frames, p50 ${perf.p50Ms} ms, p95 ${perf.p95Ms} ms per frame, ${perf.totalSec} s total`);
  if (withheld) lines.push('flash gate FAIL: the MP4, preview and poster are withheld pending a fix; they are diagnostics in withheld/, never deliverables');
  for (const warning of manifest.warnings ?? []) lines.push(`warning: ${warning}`);
  return `${lines.join('\n')}\n`;
}
