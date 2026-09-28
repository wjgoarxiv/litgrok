// The MO-C-17 render report, verbatim in structure, written to <out>/gate-report.txt. After the
// MO-C-14 line come MO-C-25, MO-C-26, MO-C-27, MO-C-29, MO-D-02, MO-D-03, MO-D-04, then every other
// enforced MO-A / MO-SH / MO-FT rule in Rule-index order (Build 8). [NEW] numbers are labelled
// provisional (constants.mjs).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROVISIONAL_RULES } from './constants.mjs';
import { lookSummary } from './look.mjs';

const EXTRA_ORDER = ['MO-C-25', 'MO-C-26', 'MO-C-27', 'MO-C-29', 'MO-D-02', 'MO-D-03', 'MO-D-04'];
const RULE_INDEX_ORDER = ['MO-A-03', 'MO-A-04', 'MO-A-13', 'MO-A-15', 'MO-A-16', 'MO-A-33', 'MO-A-37-41', 'MO-A-41a', 'MO-A-51', 'MO-A-58',
  'MO-SH-00', 'MO-SH-00a', 'MO-SH-00b', 'MO-SH-01', 'MO-SH-03', 'MO-SH-04a', 'MO-SH-05', 'MO-SH-06', 'MO-SH-07', 'MO-SH-07/persistence', 'MO-SH-08', 'MO-SH-09', 'MO-SH-10', 'MO-SH-11', 'MO-FT-04', 'MO-C-15/16'];

const pad = (label) => `  ${label}`.padEnd(34);
const mark = (id) => (PROVISIONAL_RULES.some((rule) => id.includes(rule.slice(3))) ? ' [provisional]' : '');

export function reportText({ plan, preflight, manifest, gate, round, warnings = [], context = {}, checks = {}, withheld = null, outDir = '.' }) {
  const lines = ['lit-typographic-motion — render report'];
  const by = new Map((gate?.results ?? preflight?.results ?? []).map((r) => [r.id, r]));
  if (!gate) for (const r of preflight?.results ?? []) by.set(r.id, r);
  const status = (id) => by.get(id)?.status ?? 'N/A';
  const detail = (id) => by.get(id)?.detail ?? 'not measured';
  const where = withheld ? `${withheld}/` : `${outDir}/`;
  const preview = checks.preview ? `preview.${checks.preview.encoder === 'gif' ? 'gif' : 'webp'}` : 'preview (not rendered)';
  lines.push(`outputs: ${where}film.mp4 · ${where}${preview} (encoder: ${manifest?.previewEncoder ?? 'n/a'}) · ${where}poster.png · ${where}reduced-motion.png${withheld ? '  [WITHHELD: diagnostics only, not deliverables]' : ''}`);
  lines.push(`preset: ${plan.preset.preset}  (chosen because: ${plan.preset.reason})`);
  lines.push(`duration / fps / resolution: ${plan.durationSec.toFixed(2)} s @ ${plan.fps} fps, 1920x1080`);
  const ranges = manifest ? manifest.passRanges.map((r) => `${r.pass}@${r.sceneId}#${r.shotIndex}:${r.frameStart}-${r.frameEnd}`) : [];
  lines.push(`GLSL passes (manifest): ${ranges.length ? ranges.join(', ') : 'none (pre-flight stopped before render)'}`);
  lines.push(`WebGL2: ${manifest ? (manifest.softwareRenderer ? 'software' : 'hardware') : 'n/a'} — ${manifest?.renderer ?? 'n/a'}  (flags: ${manifest?.chromeFlags?.join(' ') ?? 'n/a'})${manifest?.softwareRenderer ? '  software-rendered, --samples lowered' : ''}`);
  lines.push('');
  const overall = gate ? gate.status : preflight.failed.length ? 'FAIL' : 'PASS';
  lines.push(`QA gate: ${overall}${gate ? '' : ' (pre-flight; nothing rendered)'}`);
  lines.push(`${pad('MO-C-01 GLSL presence:')}${status('MO-C-01')}`);
  lines.push(`${pad('MO-C-02 WebGL2 tier:')}${status('MO-C-02')}`);
  const flash = gate?.flash;
  const g = flash?.master ? Math.max(flash.master.general.flashes, flash.preview?.general.flashes ?? 0) : 'n/a';
  const r = flash?.master ? Math.max(flash.master.red.flashes, flash.preview?.red.flashes ?? 0) : 'n/a';
  lines.push(`${pad('MO-C-03 flash audit:')}worst window ${g} general / ${r} red  (limit 3 / 3)  ${status('MO-C-03')}; ${detail('MO-C-03')}`);
  lines.push(`${pad('MO-C-04 title-safe:')}${status('MO-C-04')}  (${detail('MO-C-04')})`);
  lines.push(`${pad('MO-C-05 action-safe:')}${status('MO-C-05')}  (${detail('MO-C-05')})${mark('MO-C-05')}`);
  lines.push(`${pad('MO-C-06 type contrast:')}${detail('MO-C-06')}  ${status('MO-C-06')}${mark('MO-C-06')}`);
  lines.push(`${pad('MO-C-07/08 reading time:')}${detail('MO-C-07/08')}  ${status('MO-C-07/08')}${mark('MO-C-07')}`);
  lines.push(`${pad('MO-C-09 determinism:')}${detail('MO-C-09')}  ${status('MO-C-09')}`);
  lines.push(`${pad('MO-C-10/11/12 duration/fps/res:')}${status('MO-C-10/11/12')}  (${detail('MO-C-10/11/12')})`);
  lines.push(`${pad('MO-C-13 file sizes:')}${detail('MO-C-13')}  ${status('MO-C-13')}${mark('MO-C-13')}`);
  lines.push(`${pad('MO-C-14 reduced-motion still:')}${detail('MO-C-14')}${mark('MO-C-14')}`);
  for (const id of EXTRA_ORDER) lines.push(`${pad(`${id}:`)}${status(id)}  (${detail(id)})${mark(id)}`);
  for (const id of RULE_INDEX_ORDER) if (by.has(id)) lines.push(`${pad(`${id}:`)}${status(id)}  (${detail(id)})`);
  if (by.has('SOUND')) lines.push(`${pad('SOUND:')}${status('SOUND')}  (${detail('SOUND')})`);
  if (manifest?.sound) lines.push(`sound: ${manifest.sound.label}${manifest.sound.timbre ? ` (${manifest.sound.timbre}, ${manifest.sound.key}, ${manifest.sound.tempo} BPM)` : ''}`);
  lines.push('');
  lines.push(`craft rounds run: ${round} / 3 max`);
  const seen = lookSummary(outDir);
  lines.push(`frames looked at: ${seen.viewed} file(s) across ${seen.rounds} look round(s) in look.json${seen.blocked ? ' (a round was blocked: no vision tool)' : ''}; a gate re-run never changes this`);
  lines.push(`frame egress: ${context.egress === 'cdp-pull' ? `per-frame CDP pull of the readback buffer (listen refused: ${context.listenError})` : context.egress === 'ws' ? 'WebSocket on 127.0.0.1:0' : 'n/a'}`);
  lines.push(`provisional numbers: ${PROVISIONAL_RULES.join(', ')} are [NEW] defaults implemented as written, pending sign-off`);
  if (withheld) lines.push('flash gate FAIL: the MP4, preview and poster are withheld pending a fix; they are diagnostics in withheld/, never deliverables');
  for (const warning of warnings) lines.push(`warning: ${warning}`);
  return `${lines.join('\n')}\n`;
}

export function writeReport(outDir, options) {
  writeFileSync(join(outDir, 'gate-report.txt'), reportText({ ...options, outDir }));
}
