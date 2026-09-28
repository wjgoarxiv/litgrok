// The render half of the done-check (look.mjs doneState adds the treatment, the look rounds and the
// downgrade comparison): a completed, verified render whose manifest and gate report are newer than
// the last brief edit, and one of: gate 0 with the four deliverables in place; round 3 exit 13
// without a flash FAIL and deliverables in place, with the failed rules named; round 3 exit 13 with
// a flash FAIL and every export only under withheld/. A gate PASS alone is never done.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DELIVERED = ['film.mp4', 'poster.png', 'reduced-motion.png'];
const hasPreview = (dir) => existsSync(join(dir, 'preview.webp')) || existsSync(join(dir, 'preview.gif'));

export function completionState(out) {
  const runPath = join(out, '.run', 'run.json');
  if (!existsSync(runPath)) return { done: false, reason: 'no render has run in this output directory' };
  const run = JSON.parse(readFileSync(runPath, 'utf8'));
  if (!run.finishedAt || run.exitCode === undefined) return { done: false, reason: 'the render started but did not finish' };
  if (run.stillsOnly || run.state === 'stills-only') return { done: false, reason: 'a --stills-only run is a look step, not a film' };
  if ([10, 11, 12, 14, 15, 16, 17, 19].includes(run.exitCode)) return { done: false, reason: `BLOCKED exit ${run.exitCode}` };
  const manifestPath = join(out, 'manifest.json');
  const reportPath = join(out, 'gate-report.txt');
  if (!existsSync(reportPath)) return { done: false, reason: 'gate-report.txt is missing' };
  if (!existsSync(manifestPath)) return { done: false, reason: 'manifest.json is missing' };
  if (run.briefPath && existsSync(run.briefPath)) {
    const edited = statSync(run.briefPath).mtimeMs;
    if (statSync(manifestPath).mtimeMs < edited || statSync(reportPath).mtimeMs < edited) return { done: false, reason: 'the brief changed after the last render; render again' };
  }
  const report = readFileSync(reportPath, 'utf8');
  const delivered = DELIVERED.every((name) => existsSync(join(out, name))) && hasPreview(out);
  const anyDeliverable = DELIVERED.some((name) => existsSync(join(out, name))) || hasPreview(out);
  const withheldDir = join(out, 'withheld');
  if (run.exitCode === 0) {
    return delivered ? { done: true, reason: 'gate PASS with all four deliverables' } : { done: false, reason: 'gate exited 0 but a deliverable is missing' };
  }
  if (run.exitCode === 13) {
    if (run.round < 3) return { done: false, reason: `gate FAIL in round ${run.round}; fix the named rule and rerun with --round ${run.round + 1}` };
    if (run.withheld) {
      const onlyWithheld = !anyDeliverable && existsSync(join(withheldDir, 'film.mp4'));
      return onlyWithheld && /withheld/i.test(report) ? { done: true, reason: 'round 3 flash FAIL: exports withheld, report says so' } : { done: false, reason: 'flash FAIL but an export sits at a deliverable name' };
    }
    return delivered && /FAIL/.test(report) ? { done: true, reason: 'round 3 gate FAIL delivered with the failed rules named' } : { done: false, reason: 'round 3 gate FAIL without deliverables or named rules' };
  }
  return { done: false, reason: `exit ${run.exitCode}` };
}
