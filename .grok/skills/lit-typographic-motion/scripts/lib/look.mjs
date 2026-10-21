// Look rounds and Done (brief section 9). `look` is the only writer of look.json: it refuses frames
// outside the latest stills set and bare yes/no answers, and stamps each round with the SHA-256 of
// the stills index and of every listed frame. `verify` is the done-check: gate, a valid treatment,
// a round-1 stills look with a change, a last look on the final full render's exact stills (poster,
// contact sheet, every beat midpoint and transition strip), and the downgrade comparison. A cover
// (treatment mode: cover, references/cover.md) has its own eight questions, its own defects record
// and its own done-check.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { COVER } from './constants.mjs';
import { generatedLabels } from './cover-assets.mjs';
import { validateCoverTreatment } from './cover-treatment.mjs';
import { silenceAsked, validateTreatment } from './treatment.mjs';
import { completionState } from './completion.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const LOOK_QUESTIONS = 9;
export const COVER_QUESTIONS = 8;
const YES = /^(yes|y|네|예|응)$/iu;
const NO = /^(no|n|아니오|아니요|아니)$/iu;
const NONE = /^(none|nothing|no|없음|없다|없어요)\.?$/iu;
const BARE = /^\s*(yes|no|y|n|ok|네|예|아니오|아니요|응|none)\s*[.!]?\s*$/iu;

export class LookError extends Error {}

export function stillsIndex(out) {
  const path = join(out, 'stills', 'index.json');
  if (!existsSync(path)) throw new LookError('LOOK_REFUSED: no stills set in this output directory; render (stills-only for round 1) first');
  const text = readFileSync(path);
  return { index: JSON.parse(text), sha256: sha(text) };
}

export function readLook(out) {
  const path = join(out, 'look.json');
  return existsSync(path) ? readJson(path) : { schema: 1, rounds: [] };
}

// Which answers ask for another round: a "no" on 1, 2, 3, 5 or 6, a "yes" on 4, 8 or 9, or a
// nameable answer to 7.
export function openItems(answers) {
  const items = [];
  for (const a of answers) {
    const v = String(a.verdict).trim();
    if ([1, 2, 3, 5, 6].includes(a.q) && NO.test(v)) items.push(`Q${a.q}: no`);
    if ([4, 8, 9].includes(a.q) && YES.test(v)) items.push(`Q${a.q}: yes`);
    if (a.q === 7 && !NONE.test(v)) items.push(`Q7: ${v}`);
  }
  return items;
}

// Cover rounds: a "no" on 1-5 (motion in every half second, the seam, motion after encoding, the
// brand word, the three layers), a "yes" on 6 or 7 (slide-like, damaged) or a named change on 8.
export function coverOpenItems(answers) {
  const items = [];
  for (const a of answers) {
    const v = String(a.verdict).trim();
    if (a.q <= 5 && NO.test(v)) items.push(`Q${a.q}: no`);
    if ((a.q === 6 || a.q === 7) && YES.test(v)) items.push(`Q${a.q}: yes`);
    if (a.q === 8 && !NONE.test(v)) items.push(`Q8: ${v}`);
  }
  return items;
}

// Cover defects, at most COVER.maxDefects per round, worst first: { t, region, frame, observed,
// cause, fix }. t is the loop time in seconds where it shows, region the [x, y, w, h] it covers in
// cover pixels, frame a file of the current stills set that shows it.
export function checkDefects(list, index, known) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new LookError('LOOK_REFUSED: defects must be an array');
  if (list.length > COVER.maxDefects) throw new LookError(`LOOK_REFUSED: at most ${COVER.maxDefects} defects per round; fix the worst first`);
  const concrete = (value) => typeof value === 'string' && value.trim().length >= 8 && !/<[^<>]{1,80}>/u.test(value);
  return list.map((d, i) => {
    const f = `defect ${i + 1}`;
    if (!d || typeof d !== 'object') throw new LookError(`LOOK_REFUSED: ${f} must be an object`);
    if (typeof d.t !== 'number' || !(d.t >= 0) || (index.durationSec && d.t >= index.durationSec)) throw new LookError(`LOOK_REFUSED: ${f}: t must be the loop time in seconds${index.durationSec ? ` (0 to ${index.durationSec})` : ''} where the defect shows`);
    const r = d.region;
    if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isInteger) || r[0] < 0 || r[1] < 0 || r[2] <= 0 || r[3] <= 0 || r[0] + r[2] > index.width || r[1] + r[3] > index.height) throw new LookError(`LOOK_REFUSED: ${f}: region must be [x, y, w, h] inside the ${index.width}x${index.height} cover`);
    if (!known(String(d.frame))) throw new LookError(`LOOK_REFUSED: ${f}: ${d.frame} is not in the latest stills set (stills/index.json)`);
    const observed = typeof d.observed === 'string' ? d.observed.trim() : '';
    if (BARE.test(observed) || observed.split(/\s+/u).length < 3 || observed.length < 15) throw new LookError(`LOOK_REFUSED: ${f}: observed must be at least one sentence naming what is visible there`);
    if (!concrete(d.cause) || !concrete(d.fix)) throw new LookError(`LOOK_REFUSED: ${f}: cause and fix must each say something concrete`);
    return { t: d.t, region: r, frame: d.frame, observed, cause: d.cause.trim(), fix: d.fix.trim() };
  });
}

export function recordLook(out, { round, answersFile = null, blocked = null }) {
  if (!Number.isInteger(round) || round < 1 || round > 3) throw new LookError('LOOK_REFUSED: --round must be 1, 2 or 3');
  const { index, sha256 } = stillsIndex(out);
  if (index.round !== round) throw new LookError(`LOOK_REFUSED: the latest stills set belongs to round ${index.round}; render round ${round} before recording its look`);
  const look = readLook(out);
  if (look.rounds.some((r) => r.round === round)) throw new LookError(`LOOK_REFUSED: round ${round} is already recorded; render the next round to look again`);
  if (round > 1 && !look.rounds.some((r) => r.round === round - 1)) throw new LookError(`LOOK_REFUSED: record round ${round - 1} before round ${round}`);
  const files = new Map(index.stills.map((s) => [s.file, s]));
  const stamp = { stillsIndexSha256: sha256, mode: index.mode, frames: {} };
  if (blocked) {
    if (blocked !== 'no-vision-tool') throw new LookError('LOOK_REFUSED: --blocked takes no-vision-tool');
    for (const entry of index.stills) stamp.frames[entry.file] = entry.sha256;
    look.rounds.push({ round, blocked, stamp, by: 'self' });
    writeFileSync(join(out, 'look.json'), `${JSON.stringify(look, null, 2)}\n`);
    return { round, blocked, openItems: [] };
  }
  if (!answersFile || !existsSync(answersFile)) throw new LookError('LOOK_REFUSED: --answers <file> is required (or --blocked no-vision-tool)');
  let body;
  try { body = readJson(answersFile); } catch (error) { throw new LookError(`LOOK_REFUSED: the answers file is not JSON (${error.message})`); }
  const viewed = Array.isArray(body.viewed) ? body.viewed.map(String) : [];
  const answers = Array.isArray(body.answers) ? body.answers : [];
  if (!viewed.length) throw new LookError('LOOK_REFUSED: list every PNG you opened in "viewed"');
  const cues = join(out, 'sound-cues.json');
  const cover = index.mode === 'cover';
  const questions = cover ? COVER_QUESTIONS : LOOK_QUESTIONS;
  if (!cover && body.defects !== undefined) throw new LookError('LOOK_REFUSED: defects are a cover-mode record; a film round names its weakest beat instead');
  const known = (file) => files.has(file) || (!cover && file === 'sound-cues.json' && existsSync(cues));
  const unknown = [...viewed, ...answers.map((a) => a.frame)].find((file) => !known(String(file)));
  if (unknown !== undefined) throw new LookError(`LOOK_REFUSED: ${unknown} is not in the latest stills set (stills/index.json)`);
  for (const a of answers) if (!Number.isInteger(a?.q) || a.q < 1 || a.q > questions) throw new LookError(`LOOK_REFUSED: q must be 1-${questions}${cover ? ' (a cover round answers the eight cover questions)' : ''}`);
  for (let q = 1; q <= questions; q += 1) if (!answers.some((a) => a.q === q)) throw new LookError(`LOOK_REFUSED: question ${q} has no answer`);
  for (const a of answers) {
    if (typeof a.verdict !== 'string' || !a.verdict.trim()) throw new LookError(`LOOK_REFUSED: question ${a.q} has no verdict`);
    const observed = typeof a.observed === 'string' ? a.observed.trim() : '';
    if (!observed || BARE.test(observed) || /<[^<>]{1,80}>/u.test(observed) || observed.split(/\s+/u).length < 3 || observed.length < 15) {
      throw new LookError(`LOOK_REFUSED: question ${a.q}: "observed" must name a concrete visible detail in ${a.frame} in at least one sentence; a bare yes or no is not an observation`);
    }
    if (a.frame !== 'sound-cues.json' && !viewed.includes(a.frame)) throw new LookError(`LOOK_REFUSED: question ${a.q} cites ${a.frame}, which is not listed in "viewed"`);
  }
  if (!cover && !answers.some((a) => a.q === 6 && (a.frame === 'sound-cues.json' || !existsSync(cues)))) {
    if (existsSync(cues)) throw new LookError('LOOK_REFUSED: answer question 6 from sound-cues.json (frame: "sound-cues.json")');
  }
  const defects = cover ? checkDefects(body.defects, index, known) : [];
  if (round === 1 && cover) {
    if (typeof body.change !== 'string' || body.change.trim().split(/\s+/u).length < 3) throw new LookError('LOOK_REFUSED: round 1 records the change you make before round 2 (change)');
  } else if (round === 1) {
    if (index.mode !== 'stills-only') throw new LookError('LOOK_REFUSED: round 1 is a stills round; run the render with --stills-only first');
    if (!Number.isInteger(body.weakestBeat)) throw new LookError('LOOK_REFUSED: round 1 names the weakest beat (weakestBeat: its index)');
    if (typeof body.change !== 'string' || body.change.trim().split(/\s+/u).length < 3) throw new LookError('LOOK_REFUSED: round 1 records the change you made (change)');
  }
  for (const file of viewed) stamp.frames[file] = files.get(file)?.sha256 ?? (file === 'sound-cues.json' ? sha(readFileSync(cues)) : null);
  const record = {
    round, by: 'self', stamp, viewed,
    answers: answers.map((a) => ({ q: a.q, verdict: a.verdict.trim(), frame: a.frame, observed: a.observed.trim(), by: 'self' })),
    ...(Number.isInteger(body.weakestBeat) ? { weakestBeat: body.weakestBeat } : {}),
    ...(typeof body.change === 'string' ? { change: body.change.trim() } : {}),
    ...(Array.isArray(body.aids) ? { aids: body.aids } : {}),
    ...(cover ? { defects } : {}),
    openItems: cover ? coverOpenItems(answers) : openItems(answers),
  };
  look.rounds.push(record);
  writeFileSync(join(out, 'look.json'), `${JSON.stringify(look, null, 2)}\n`);
  return record;
}

const subjectBeats = (t) => new Set(t.visualDevices.filter((d) => d.role === 'subject').flatMap((d) => d.beats)).size;

export function downgrades(first, current) {
  if (!first || !current) return [];
  const items = [];
  if (current.durationSec < first.durationSec * 0.8 - 1e-9) items.push(`the film was shortened from ${first.durationSec} s to ${current.durationSec} s`);
  if (subjectBeats(current) < subjectBeats(first)) items.push(`the drawn subject now covers ${subjectBeats(current)} beats instead of ${subjectBeats(first)}`);
  if (current.sound.mode === 'none' && first.sound.mode !== 'none' && !silenceAsked(current.request)) items.push('the sound was switched off without a request for silence');
  if (first.path === 'stage' && current.path === 'type') items.push('the film moved from the stage path to the type path');
  return items;
}

// The done-check. Returns { status: DONE | DONE_UNVIEWED | NOT DONE, reason, downgraded, open }.
export function doneState(out) {
  const notDone = (reason, extra = {}) => ({ status: 'NOT DONE', done: false, reason, downgraded: [], open: [], ...extra });
  const treatmentFile = join(out, 'treatment.json');
  if (existsSync(treatmentFile)) {
    let raw = null;
    try { raw = readJson(treatmentFile); } catch { return notDone('treatment.json is not valid JSON'); }
    if (raw?.mode === 'cover') return coverDoneState(out, raw);
  }
  const render = completionState(out);
  if (!render.done) return notDone(render.reason);
  const run = readJson(join(out, '.run', 'run.json'));
  const treatmentPath = join(out, 'treatment.json');
  if (!existsSync(treatmentPath)) return notDone('treatment.json is missing');
  const treatment = readJson(treatmentPath);
  const valid = validateTreatment(treatment);
  if (!valid.ok) return notDone(`the treatment is invalid (${valid.field})`);
  if (run.treatmentSha256 && run.treatmentSha256 !== sha(readFileSync(treatmentPath))) return notDone('the treatment changed after the last render; render again');
  const manifest = readJson(join(out, 'manifest.json'));
  const gateNote = render.reason;
  const first = existsSync(join(out, '.run', 'treatment-first.json')) ? readJson(join(out, '.run', 'treatment-first.json')) : null;
  const downgraded = downgrades(first, treatment);
  const look = readLook(out);
  const rounds = look.rounds;
  const final = rounds.at(-1);
  if (final?.blocked && manifest.stillsIndexSha256 && final.stamp.stillsIndexSha256 === manifest.stillsIndexSha256) {
    return { status: 'DONE_UNVIEWED', done: true, reason: `${gateNote}; nobody viewed the frames (no vision tool): say so in the reply`, downgraded, open: [] };
  }
  if (rounds.length < 2) return notDone(`${rounds.length} look round(s) recorded; done needs the round-1 stills look and a last look on the final render`, { downgraded });
  const one = rounds.find((r) => r.round === 1);
  if (!one || (!one.blocked && (one.stamp.mode !== 'stills-only' || !one.change))) return notDone('round 1 must be a stills look that names a change', { downgraded });
  const last = rounds.at(-1);
  if (!manifest.stillsIndexSha256 || last.stamp.stillsIndexSha256 !== manifest.stillsIndexSha256) return notDone('the last look was not on the final full render; look at its stills and record the round', { downgraded });
  const indexNow = existsSync(join(out, 'stills', 'index.json')) ? sha(readFileSync(join(out, 'stills', 'index.json'))) : null;
  if (indexNow !== manifest.stillsIndexSha256) return notDone('the stills on disk are not the final render\'s; render again', { downgraded });
  const index = readJson(join(out, 'stills', 'index.json'));
  const required = index.stills.filter((s) => ['poster', 'contact-sheet', 'beat-mid', 'transition'].includes(s.kind)).map((s) => s.file);
  const unviewed = required.filter((file) => !last.viewed.includes(file));
  if (unviewed.length) return notDone(`the last look did not view ${unviewed.join(', ')}`, { downgraded });
  const open = last.openItems ?? [];
  if (open.length && last.round < 3) return notDone(`the last look asks for another round (${open.join('; ')}); fix it and render round ${last.round + 1}`, { downgraded, open });
  return { status: 'DONE', done: true, reason: `${gateNote}; ${rounds.length} look rounds, the last on the final render`, downgraded, open };
}

export function lookSummary(out) {
  const look = readLook(out);
  const viewed = new Set(look.rounds.flatMap((r) => r.viewed ?? []));
  return { rounds: look.rounds.length, viewed: viewed.size, blocked: look.rounds.some((r) => r.blocked) };
}

// The cover done-check (references/cover.md, Rounds and done): a valid cover treatment unchanged
// since the last cover render; that render's report reading PASS+TARGET on the decoded file; at
// least two look rounds, the first naming its change; the last stamped with the final render's
// stills and viewing the sheet, the poster and the seam pair. A window render never counts.
// Generated assets become labels the reply has to carry.
export function coverDoneState(out, raw) {
  const labels = generatedLabels(out);
  const notDone = (reason, extra = {}) => ({ status: 'NOT DONE', done: false, mode: 'cover', reason, downgraded: [], open: [], labels, ...extra });
  const valid = validateCoverTreatment(raw);
  if (!valid.ok) return notDone(`the cover treatment is invalid (${valid.field})`);
  const manifestFile = join(out, 'manifest.json');
  const reportFile = join(out, 'gate-report.txt');
  if (!existsSync(manifestFile) || !existsSync(reportFile)) return notDone('no cover render has finished (manifest.json or gate-report.txt is missing)');
  let manifest;
  try { manifest = readJson(manifestFile); } catch { return notDone('manifest.json is unreadable'); }
  if (manifest.mode !== 'cover') return notDone('the last render was not a cover render; run cover --out <dir>');
  if (manifest.treatmentSha256 !== sha(readFileSync(join(out, 'treatment.json')))) return notDone('treatment.json changed after the last cover render; render again');
  if (!/^COVER gate --strict: PASS\+TARGET$/mu.test(readFileSync(reportFile, 'utf8'))) return notDone('the decoded cover did not reach every TARGET gate on the last render (gate-report.txt)');
  const indexFile = join(out, 'stills', 'index.json');
  if (!existsSync(indexFile)) return notDone('the cover stills set is missing');
  const indexSha = sha(readFileSync(indexFile));
  const index = readJson(indexFile);
  if (index.mode !== 'cover' || indexSha !== manifest.stillsIndexSha256) return notDone('the stills on disk are not the last cover render\'s; render again');
  const rounds = readLook(out).rounds;
  const last = rounds.at(-1);
  if (last?.blocked && last.stamp.stillsIndexSha256 === indexSha) return { status: 'DONE_UNVIEWED', done: true, mode: 'cover', reason: 'every gate at TARGET on the decoded cover; nobody viewed the frames (no vision tool): say so in the reply', downgraded: [], open: [], labels };
  if (rounds.length < 2) return notDone(`${rounds.length} look round(s) recorded; done needs two, the first naming its change`);
  const one = rounds.find((r) => r.round === 1);
  if (!one || (!one.blocked && !one.change)) return notDone('round 1 must name the change made after it');
  if (last.stamp.stillsIndexSha256 !== indexSha) return notDone('the last look round was recorded before the final cover render; look again and record it');
  const required = index.stills.filter((s) => ['sheet', 'poster', 'seam'].includes(s.kind)).map((s) => s.file);
  const unviewed = required.filter((file) => !(last.viewed ?? []).includes(file));
  if (unviewed.length) return notDone(`the last look round did not view ${unviewed.join(', ')}`);
  const open = last.openItems ?? [];
  if (open.length && last.round < 3) return notDone(`cover look ${open.join('; ')} asks for another round; fix it and render round ${last.round + 1}`, { open });
  return { status: 'DONE', done: true, mode: 'cover', reason: `every gate at TARGET on the decoded cover; ${rounds.length} look rounds, the last on the final render`, downgraded: [], open, labels };
}
