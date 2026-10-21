#!/usr/bin/env node
// Cover recipe regression QA for lit-typographic-motion (needs Chrome, img2webp and dwebp; not part
// of `npm test`). Every shipped recipe is rendered through the real cover command
// (`motion.mjs cover`, every gate on the decoded file) and fails when it leaves the row it shipped
// with in recipes/<name>/expected.json: no row at all, median d or the moving share outside +-15 %,
// seamLocal outside the cover TARGET, more than 2 MiB, or a non-zero exit.
// `--negatives` also renders the four slide-like negatives and every regression a recipe declares
// (`regressions` in its expected.json). Each of those declares `mustFail` ("G2.floor", "G1.target"):
// it passes only when the render completed and gated the decoded file, every declared gate failed,
// and no undeclared FLOOR gate among G1-G4 failed. A crash, a missing declaration or a failure on
// the wrong gate is a QA failure, never a caught defect. `--feather N` runs only the painted
// recipe's declared `feather-N` regression. `--record` writes a measured row back into
// expected.json, and only for a render that reached every TARGET.
//
//   node scripts/qa-cover-recipes.mjs [--out <dir>] [--only painted-light,weight-tide] [--negatives] [--feather N] [--record]
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = join(root, '.grok/skills/lit-typographic-motion');
const motion = join(skill, 'scripts/motion.mjs');
const { COVER, EXIT } = await import(join(skill, 'scripts/lib/constants.mjs'));
const FLOOR_GATES = ['G1', 'G2', 'G3', 'G4'];

// The verdict of one negative or regression case: { ok, why }. It is proven only when the render
// completed and gated the decoded file (exit 0 or 13 with a manifest), every declared gate failed at
// its tier, and no undeclared FLOOR gate among G1-G4 failed.
export function judgeCase(mustFail, { status, manifest }) {
  if (!Array.isArray(mustFail) || !mustFail.length) return { ok: false, why: 'it declares no gate it must fail (mustFail)' };
  const gates = manifest?.gate?.gates;
  if (!gates || ![EXIT.OK, EXIT.GATE_FAIL_QA].includes(status)) return { ok: false, why: `the render did not complete and gate the decoded file (exit ${status})` };
  for (const id of mustFail) {
    const [gate, tier] = id.split('.');
    if (!gates[gate]) return { ok: false, why: `${gate} was not measured` };
    if ((tier === 'target' ? gates[gate].target : gates[gate].pass) !== false) return { ok: false, why: `${id} did not fail` };
  }
  const extra = FLOOR_GATES.filter((g) => gates[g]?.pass === false && !mustFail.includes(`${g}.floor`));
  if (extra.length) return { ok: false, why: `it also fails ${extra.map((g) => `${g}.floor`).join(', ')}, which it does not declare` };
  return { ok: true, why: `fails ${mustFail.join(', ')} as declared` };
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const short = (x) => (typeof x === 'number' ? Number(x.toPrecision(4)) : x);
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const lastLine = (r) => (r.stderr || r.stdout || '').trim().split('\n').at(-1);
const within = (value, expected, share) => Math.abs(value - expected) <= share * expected;

function render(outRoot, name, pageDir, treatment, { assets = null, patch = null } = {}) {
  const out = join(outRoot, name);
  mkdirSync(join(out, 'cover'), { recursive: true });
  const page = readFileSync(join(pageDir, 'index.html'), 'utf8');
  writeFileSync(join(out, 'cover', 'index.html'), patch ? patch(page) : page);
  if (assets) {
    mkdirSync(join(out, 'cover', 'assets'), { recursive: true });
    cpSync(join(root, 'test/fixtures/cover-recipes/painted-light-base.png'), join(out, 'cover/assets/base.png'));
    writeFileSync(join(out, 'assets.json'), JSON.stringify({ assets: assets.map((a) => ({ ...a, sha256: sha(readFileSync(join(out, a.path))) })) }, null, 2));
  }
  writeFileSync(join(out, 'treatment.json'), JSON.stringify(treatment, null, 2));
  const run = spawnSync(process.execPath, [motion, 'cover', '--out', out, '--round', '1'], { encoding: 'utf8', env: process.env, timeout: 1_200_000 });
  return { out, status: run.status, stderr: run.stderr, stdout: run.stdout, manifest: readJson(join(out, 'manifest.json')) };
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => { const i = args.indexOf(`--${name}`); return i < 0 ? null : args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true; };
  const outRoot = resolve(option('out') ?? mkdtempSync(join(tmpdir(), 'litgrok-cover-qa-')));
  const feather = option('feather');
  const only = feather ? [] : option('only') ? String(option('only')).split(',') : ['painted-light', 'weight-tide', 'orbit-loop'];
  const record = args.includes('--record');
  const rows = [];
  let failed = 0;

  for (const name of only) {
    const dir = join(skill, 'recipes', name);
    const file = join(dir, 'expected.json');
    const expected = readJson(file);
    if (!expected?.row) { failed += 1; rows.push(['FAIL', name, `no expected row in recipes/${name}/expected.json`]); continue; }
    const r = render(outRoot, name, dir, expected.treatment, { assets: expected.assets ?? null });
    if (!r.manifest) { failed += 1; rows.push(['NO RENDER', name, `exit ${r.status}: ${lastLine(r)}`]); continue; }
    const g = r.manifest.gate;
    const measured = { medianD: g.medianD, movingFrac: g.movingFrac, longestStillSec: g.longestStillSec, spike: g.spike, seamLocal: g.seamLocal, bytes: r.manifest.bytes };
    const checks = [
      ['medianD', within(g.medianD, expected.row.medianD, 0.15)],
      ['moving', within(g.movingFrac, expected.row.movingFrac, 0.15)],
      ['seamLocal', g.seamLocal >= COVER.target.seamLo && g.seamLocal <= COVER.target.seamLocal],
      ['bytes', r.manifest.bytes <= COVER.targetBytes],
      ['exit', r.status === 0],
    ];
    const bad = checks.filter(([, ok]) => !ok).map(([k]) => k);
    if (bad.length) failed += 1;
    if (record && !bad.length) writeFileSync(file, `${JSON.stringify({ ...expected, row: Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(6)) : v])) }, null, 2)}\n`);
    rows.push([bad.length ? `FAIL ${bad.join(',')}` : 'PASS', name, `median d ${short(g.medianD)} (row ${expected.row.medianD}) | moving ${short(g.movingFrac)} | still ${short(g.longestStillSec)} s | spike ${short(g.spike)} | seamLocal ${short(g.seamLocal)} | ${r.manifest.bytes} B | exit ${r.status}`]);
  }

  const cases = [];
  if (args.includes('--negatives')) {
    for (const name of ['title-slam', 'card-scenes', 'still-glow', 'reset-sweep']) cases.push({ kind: 'negative', name });
    for (const recipe of ['painted-light', 'weight-tide', 'orbit-loop']) {
      for (const id of Object.keys(readJson(join(skill, 'recipes', recipe, 'expected.json'))?.regressions ?? {})) cases.push({ kind: 'regression', recipe, id });
    }
  }
  if (feather && !cases.some((c) => c.id === `feather-${feather}`)) cases.push({ kind: 'regression', recipe: 'painted-light', id: `feather-${feather}` });

  for (const c of cases) {
    const label = c.kind === 'negative' ? `negative ${c.name}` : `regression ${c.recipe} ${c.id}`;
    const fail = (why) => { failed += 1; rows.push(['FAIL', label, `not proven: ${why}`]); };
    let mustFail;
    let r;
    if (c.kind === 'negative') {
      const dir = join(skill, 'recipes/negatives', c.name);
      const expected = readJson(join(dir, 'expected.json'));
      if (!expected) { fail(`recipes/negatives/${c.name}/expected.json is missing`); continue; }
      mustFail = expected.mustFail;
      const treatment = {
        mode: 'cover', request: 'A shipped negative rendered by the cover recipe QA.', idea: 'A slide-like page that the decoded-file gate has to fail.',
        recipe: 'own', recipeReason: 'A regression negative, never a recipe.', brandWord: 'LITGROK', aspect: '2:1',
        layers: { slow: 'None by design.', mid: 'None by design.', beat: 'Card or text changes.' },
        system: { rule: 'Text states on a timeline.', copies: 'One per card.', offset: 'None.' },
        title: { box: [0.05, 0.3, 0.9, 0.3], kind: 'live' }, ambition: 'It must keep failing its named gates.',
        ...expected.treatment,
      };
      r = render(outRoot, `negative-${c.name}`, dir, treatment);
    } else {
      const dir = join(skill, 'recipes', c.recipe);
      const expected = readJson(join(dir, 'expected.json'));
      const reg = expected?.regressions?.[c.id];
      if (!reg) { fail(`${c.recipe}/expected.json declares no regression ${c.id}`); continue; }
      if (!readFileSync(join(dir, 'index.html'), 'utf8').includes(reg.patch.find)) { fail(`the page no longer contains "${reg.patch.find}"`); continue; }
      mustFail = reg.mustFail;
      r = render(outRoot, `${c.recipe}-${c.id}`, dir, expected.treatment, { assets: expected.assets ?? null, patch: (page) => page.replace(reg.patch.find, reg.patch.replace) });
    }
    const verdict = judgeCase(mustFail, r);
    if (!verdict.ok) failed += 1;
    const gates = r.manifest?.gate?.gates ?? {};
    const failing = Object.entries(gates).flatMap(([k, x]) => (x.pass === false ? [`${k}.floor`] : x.target === false ? [`${k}.target`] : []));
    const detail = r.manifest ? `; failing ${failing.join(',') || 'none'}; ${r.manifest.bytes} B; exit ${r.status}` : `: ${lastLine(r)}`;
    rows.push([verdict.ok ? 'PASS (fails as declared)' : 'FAIL', label, `${verdict.ok ? '' : 'not proven: '}${verdict.why} (declared ${(mustFail ?? []).join(',') || 'none'})${detail}`]);
  }

  for (const [verdict, name, detail] of rows) process.stdout.write(`${verdict.padEnd(24)} ${name.padEnd(36)} ${detail}\n`);
  process.stdout.write(`cover recipe QA: ${failed ? `${failed} FAIL` : 'all PASS'}; renders in ${outRoot}\n`);
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
