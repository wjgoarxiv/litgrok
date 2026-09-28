// Look rounds and Done (brief section 9). `look` is the only writer of look.json: it refuses frames
// outside the latest stills set and bare yes/no answers, and stamps each round with the SHA-256 of
// the stills index and of every listed frame. `verify` is the done-check: gate, a valid treatment,
// a round-1 stills look with a change, a last look on the final full render's exact stills (poster,
// contact sheet, every beat midpoint and transition strip), and the downgrade comparison.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { silenceAsked, validateTreatment } from './treatment.mjs';
import { completionState } from './completion.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
export const LOOK_QUESTIONS = 9;
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
  const known = (file) => files.has(file) || (file === 'sound-cues.json' && existsSync(cues));
  const unknown = [...viewed, ...answers.map((a) => a.frame)].find((file) => !known(String(file)));
  if (unknown !== undefined) throw new LookError(`LOOK_REFUSED: ${unknown} is not in the latest stills set (stills/index.json)`);
  for (let q = 1; q <= LOOK_QUESTIONS; q += 1) if (!answers.some((a) => a.q === q)) throw new LookError(`LOOK_REFUSED: question ${q} has no answer`);
  for (const a of answers) {
    if (!Number.isInteger(a.q) || a.q < 1 || a.q > LOOK_QUESTIONS) throw new LookError(`LOOK_REFUSED: q must be 1-${LOOK_QUESTIONS}`);
    if (typeof a.verdict !== 'string' || !a.verdict.trim()) throw new LookError(`LOOK_REFUSED: question ${a.q} has no verdict`);
    const observed = typeof a.observed === 'string' ? a.observed.trim() : '';
    if (!observed || BARE.test(observed) || /<[^<>]{1,80}>/u.test(observed) || observed.split(/\s+/u).length < 3 || observed.length < 15) {
      throw new LookError(`LOOK_REFUSED: question ${a.q}: "observed" must name a concrete visible detail in ${a.frame} in at least one sentence; a bare yes or no is not an observation`);
    }
    if (a.frame !== 'sound-cues.json' && !viewed.includes(a.frame)) throw new LookError(`LOOK_REFUSED: question ${a.q} cites ${a.frame}, which is not listed in "viewed"`);
  }
  if (!answers.some((a) => a.q === 6 && (a.frame === 'sound-cues.json' || !existsSync(cues)))) {
    if (existsSync(cues)) throw new LookError('LOOK_REFUSED: answer question 6 from sound-cues.json (frame: "sound-cues.json")');
  }
  if (round === 1) {
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
    openItems: openItems(answers),
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
