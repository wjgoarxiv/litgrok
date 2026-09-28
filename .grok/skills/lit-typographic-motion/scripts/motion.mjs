#!/usr/bin/env node
// lit-typographic-motion render CLI for LitGrok. Run from the installed skill root
// (.grok/skills/lit-typographic-motion/ in a project, or ~/.grok/skills/... for a user install).
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlockedError, EXIT, EXIT_NAMES, ONE_LINE_CREDIT } from './lib/constants.mjs';

export const USAGE = `lit-typographic-motion (LitGrok) — film director: treatment first, then the type or stage path
Usage: node scripts/motion.mjs <mode> --out <dir> [options]
  Every render reads <dir>/treatment.json first; exit 16 names the first invalid field.
  stage  --out <dir> [--round 1..3] [--stills-only]
           stage path (every other film; always for 9:16): captures <dir>/stage/index.html frame by
           frame on a virtual clock, then encode, stills, determinism replay, text QA and gate
  sound  --out <dir>                     build the generated bed alone (sound.wav, sound-cues.json) from the
           treatment; renders rebuild it at the film's exact length and cuts
  make   --out <dir> [--brief <file>] [--round 1..3] [--stills-only] [--style <preset>] [--word-timing] [--swiftshader]
           type path (the words themselves are the film, 16:9): timeline, pre-flight, stills, sheet,
           video, preview, poster, still, gate; without --brief the words are the treatment's copy
  stills --out <dir> [--brief <file>]    one still per shot (no ffmpeg needed)
  sheet  --out <dir> [--brief <file>]    contact sheet at every cut (no ffmpeg needed)
  video  --out <dir> [--brief <file>]    same as make without the stills-only stop
  perf   --out <dir> [--brief <file>]    frame-time p95 at --samples 1
  look   --out <dir> --round N --answers <file> | --blocked no-vision-tool
           record one look round on the latest stills set (look.json); rounds share the render counter
  gate   --out <dir>                     rerun the full QA gate on an existing render (look.json untouched)
  verify --out <dir>                     the done-check: DONE, DONE_UNVIEWED or NOT DONE with the reason
Presets: swiss-signal | terminalcore | tidal. Exit codes: 0 OK, 10 no Chrome, 11 no WebGL2,
12 no ffmpeg for video, 13 gate FAIL, 14 runtime not pre-warmed, 15 font missing or tampered,
16 treatment invalid, 17 stage contract, 18 stage nondeterministic, 19 stage network request, 20 sound invalid.
--swiftshader forces the SwiftShader rung (the CI determinism setting). Pre-warm outside the session:
litgrok-ai motion-runtime install
${ONE_LINE_CREDIT}
`;

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

export async function main(args, { env = process.env, stdout = process.stdout, stderr = process.stderr, listenImpl = null } = {}) {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) { stdout.write(USAGE); return args.length === 0 ? EXIT.USAGE : EXIT.OK; }
  const mode = args[0];
  const out = option(args, '--out');
  if (!['stage', 'sound', 'look', 'make', 'stills', 'sheet', 'video', 'perf', 'gate', 'verify'].includes(mode) || !out) { stderr.write(USAGE); return EXIT.USAGE; }
  const outDir = resolve(out);
  try {
    if (mode === 'verify') {
      const { doneState } = await import('./lib/look.mjs');
      const state = doneState(outDir);
      stdout.write(`${state.status}: ${state.reason}\n`);
      for (const item of state.downgraded) stdout.write(`downgraded: ${item} (say so in the reply)\n`);
      for (const item of state.open) stdout.write(`open look item: ${item} (state it in the reply)\n`);
      return state.done ? EXIT.OK : 1;
    }
    if (mode === 'look') {
      const { recordLook, LookError } = await import('./lib/look.mjs');
      try {
        const answers = option(args, '--answers');
        const record = recordLook(outDir, { round: Number(option(args, '--round')), answersFile: answers ? resolve(answers) : null, blocked: option(args, '--blocked') });
        stdout.write(record.blocked ? `look round ${record.round}: recorded as blocked (${record.blocked}); the done-check will end DONE_UNVIEWED\n` : `look round ${record.round}: ${record.viewed.length} file(s) viewed, ${record.answers.length} answers${record.openItems.length ? `; another round is needed: ${record.openItems.join('; ')}` : '; no open item'}\n`);
        return EXIT.OK;
      } catch (error) {
        if (error instanceof LookError) { stderr.write(`${error.message}\n`); return EXIT.USAGE; }
        throw error;
      }
    }
    if (mode === 'gate') {
      const { existsSync, readFileSync } = await import('node:fs');
      const manifest = existsSync(resolve(outDir, 'manifest.json')) ? JSON.parse(readFileSync(resolve(outDir, 'manifest.json'), 'utf8')) : {};
      const { runGate } = await import('./lib/gate.mjs');
      const { regateStage } = await import('./lib/stage.mjs');
      const gate = manifest.path === 'stage' ? regateStage(outDir, JSON.parse(readFileSync(resolve(outDir, 'treatment.json'), 'utf8'))) : runGate(outDir);
      for (const result of gate.results) if (result.status !== 'PASS') stdout.write(`${result.id} ${result.status}: ${result.detail}\n`);
      stdout.write(`QA gate: ${gate.status}\n`);
      return gate.status === 'PASS' ? EXIT.OK : EXIT.GATE_FAIL_QA;
    }
    if (mode === 'sound') {
      const { loadTreatment } = await import('./lib/treatment.mjs');
      const treatment = loadTreatment(outDir);
      if (treatment.sound.mode !== 'generated') { stdout.write(`sound: the treatment's sound is ${treatment.sound.mode}; nothing to generate (renders mux it as planned)\n`); return EXIT.OK; }
      const { writeBed } = await import('./lib/sound.mjs');
      const fps = treatment.fps ?? 60;
      const cutTimes = [...treatment.beats].sort((a, b) => a.t0 - b.t0).slice(1).map((beat) => beat.t0);
      const bed = writeBed(outDir, treatment, { frameCount: Math.round(treatment.durationSec * fps), fps, cutTimes });
      stdout.write(`sound: generated bed ${bed.timbre}, ${bed.key}, ${bed.tempo} BPM, ${bed.lufs.toFixed(1)} LUFS, peak ${bed.peakDbfs.toFixed(1)} dBFS -> ${bed.wavPath}; cues in ${bed.cuesPath}\n`);
      return EXIT.OK;
    }
    const brief = option(args, '--brief');
    const round = Number(option(args, '--round') ?? 1);
    if (!Number.isInteger(round) || round < 1 || round > 3) { stderr.write('--round must be 1, 2 or 3\n'); return EXIT.USAGE; }
    const { loadTreatment, recordFirstTreatment } = await import('./lib/treatment.mjs');
    const treatment = loadTreatment(outDir);
    recordFirstTreatment(outDir, treatment);
    const wanted = mode === 'stage' ? 'stage' : 'type';
    if (treatment.path !== wanted) throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=path: the treatment's path is ${treatment.path}; run ${treatment.path === 'stage' ? 'stage' : 'make'} --out ${out}`);
    if (mode === 'stage') {
      const { renderStage } = await import('./lib/stage.mjs');
      const result = await renderStage({ out: outDir, treatment, round, stillsOnly: args.includes('--stills-only'), env, log: (line) => stderr.write(`${line}\n`) });
      if (result.stillsOnly) stdout.write(`stills-only: open every file listed in ${outDir}/stills/index.json, then record the look\n`);
      else stdout.write(`QA gate: ${result.gate.status}${result.withheld ? ' (flash FAIL: exports withheld)' : ''}; report ${outDir}/gate-report.txt\n`);
      stdout.write(`exit ${result.exitCode} ${EXIT_NAMES[result.exitCode] ?? ''}\n`);
      return result.exitCode;
    }
    const { render, perfOnly } = await import('./lib/render.mjs');
    if (mode === 'perf') return await perfOnly({ briefPath: brief ? resolve(brief) : null, out: outDir, env, treatment, softwareOnly: args.includes('--swiftshader'), log: (line) => stderr.write(`${line}\n`) });
    const result = await render({
      mode: mode === 'sheet' ? 'sheet' : mode, briefPath: brief ? resolve(brief) : null, out: outDir, round, treatment,
      stillsOnly: args.includes('--stills-only') || mode === 'stills' || mode === 'sheet',
      style: option(args, '--style'), wordTiming: args.includes('--word-timing'), softwareOnly: args.includes('--swiftshader'), env, listenImpl,
      log: (line) => stderr.write(`${line}\n`),
    });
    if (result.stillsOnly) stdout.write(`stills-only: open every file listed in ${outDir}/stills/index.json, then record the look\n`);
    else if (result.preflight && !result.gate) stdout.write(`pre-flight FAIL (${result.preflight.failed.join(', ')}); nothing rendered; see ${outDir}/gate-report.txt\n`);
    else stdout.write(`QA gate: ${result.gate.status}${result.withheld ? ' (flash FAIL: exports withheld)' : ''}; report ${outDir}/gate-report.txt\n`);
    stdout.write(`exit ${result.exitCode} ${EXIT_NAMES[result.exitCode] ?? ''}\n`);
    return result.exitCode;
  } catch (error) {
    if (error instanceof BlockedError) {
      stderr.write(`${error.message}\n`);
      stdout.write(`exit ${error.code} ${EXIT_NAMES[error.code]}\n`);
      return error.code;
    }
    stderr.write(`lit-typographic-motion: ${error.stack ?? error.message}\n`);
    return 1;
  }
}

// Realpath comparison: under macOS /var -> /private/var a plain string compare would exit silently.
const invoked = process.argv[1] ? (() => { try { return realpathSync(process.argv[1]); } catch { return null; } })() : null;
if (invoked && invoked === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await main(process.argv.slice(2));
}
