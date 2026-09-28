import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { staticProbe } from '../.grok/skills/frontend-ui-ux/scripts/static-probe.mjs';
import { MATRIX, RULES } from '../.grok/skills/frontend-ui-ux/scripts/rule-data.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const script = join(root, '.grok/skills/frontend-ui-ux/scripts/probe.mjs');
const fixture = (name) => join(root, 'test/fixtures/uiux-probe', name);
const browser = spawnSync('agent-browser', ['--version'], { encoding: 'utf8', timeout: 3000 });

test('native rule documents every UI mode and rejects non-interface near misses', () => {
  const rule = readFileSync(join(root, '.grok/rules/00-litgrok.md'), 'utf8');
  const skill = readFileSync(join(root, '.grok/skills/frontend-ui-ux/SKILL.md'), 'utf8');
  const modes = rule.split('## Interface modes\n')[1].split('\n## ')[0];
  for (const [mode, en, ko] of [
    ['build', 'implement', '구현해'],
    ['polish', 'clean up the styling', '다듬어'],
    ['audit', 'read-only', '점검'],
    ['harden', 'stress-test', '튼튼하게'],
  ]) {
    const row = modes.split('\n').find((line) => line.startsWith('- `' + mode + '`'));
    assert.ok(row?.includes(en), `${mode} English cue`);
    assert.ok(row.includes(ko), `${mode} Korean cue`);
  }
  for (const miss of ['Video, 영상, 모션, and 발표 alone never activate', 'prose or document rewrite', 'Server, deployment, and pipeline 점검']) assert.ok(modes.includes(miss), miss);
  for (const reference of ['craft-floor.md', 'slop-register.md', 'probe-loop.md']) assert.ok(skill.includes(`references/${reference}`));
});

test('litwork hands interface work to the frontend probe and excludes non-interface work', () => {
  const rule = readFileSync(join(root, '.grok/rules/00-litgrok.md'), 'utf8');
  const work = readFileSync(join(root, '.grok/skills/litwork/SKILL.md'), 'utf8');
  assert.match(rule, /litwork[^\n]*user-facing web interface[^\n]*frontend-ui-ux/i);
  assert.match(work, /user-facing web interface[^\n]*frontend-ui-ux/i);
  assert.match(work, /plan[^\n]*UI part[^\n]*frontend-ui-ux/i);
  assert.match(work, /seven-view RS matrix[^\n]*probe/i);
  assert.match(work, /HIGH findings[^\n]*block[^\n]*done/i);
  assert.match(work, /CLI or backend-only[^\n]*no interface probe/i);
});

test('frontend notice credits all three clean-room research sources', () => {
  const notice = readFileSync(join(root, '.grok/skills/frontend-ui-ux/THIRD-PARTY-NOTICE.txt'), 'utf8');
  for (const anchor of ['pbakaus/impeccable', 'Paul Bakaus', 'Apache', '9d715cc', 'jakubkrehel/skills', 'Jakub Krehel', '267330e', 'ibelick/ui-skills', 'Julien Thibeaut', 'MIT']) assert.ok(notice.includes(anchor), anchor);
});

test('static fallback identifies source signals and keeps rendered checks unverified', () => {
  const sloppy = staticProbe([fixture('sloppy.html')]);
  const clean = staticProbe([fixture('clean.html')]);
  assert.ok(sloppy.findings.some((item) => item.rule === 'SLOP-058'));
  assert.ok(sloppy.findings.some((item) => item.rule === 'CF-503'));
  assert.equal(clean.findings.length, 0);
  assert.ok(sloppy.not_verified.some((item) => item.rule === 'RS-006'));
  assert.ok(sloppy.findings.every((item) => item.viewport === 'static' && /:\d+$/.test(item.selector)));
});

test('Delta 1 thresholds and severities are centralized', () => {
  assert.equal(MATRIX.length, 7);
  assert.equal(RULES['RS-006'].overflowPx, 8);
  assert.equal(RULES['RS-007'].offscreenPx, 8);
  assert.equal(RULES['CF-101'].cjkLongLineCh, 60);
  assert.equal(RULES['CF-103'].cjkMin, 1.5);
  assert.equal(RULES['CF-401'].radiusTolerancePx, 2);
  for (const id of ['SLOP-010', 'SLOP-029', 'SLOP-036', 'SLOP-037', 'SLOP-040']) assert.equal(RULES[id].severity, 'MEDIUM', id);
  assert.equal(RULES['CF-503'].declaredSeverity, 'LOW');
  assert.equal(RULES['CF-503'].runningSeverity, 'MEDIUM');
  assert.equal(RULES['SLOP-036'].phrases.length, 29);
});

test('missing browser exits BLOCKED and retains static findings', () => {
  const out = mkdtempSync(join(tmpdir(), 'litgrok-uiux-missing-'));
  try {
    const run = spawnSync(process.execPath, [script, '--url', fixture('sloppy.html'), '--out', out], { cwd: root, env: { ...process.env, PATH: '' }, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 2);
    assert.equal(run.stdout.trim(), 'BLOCKED: browser unavailable');
    const result = JSON.parse(readFileSync(join(out, 'findings.json')));
    assert.ok(result.findings.length > 0);
    assert.ok(result.manifest.not_verified.some((item) => item.rule === 'RS-006'));
    assert.equal(result.manifest.url, null);
    assert.equal(result.manifest.browser_version, null);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('missing source exits BLOCKED rather than reporting a clean page', () => {
  const out = mkdtempSync(join(tmpdir(), 'litgrok-uiux-source-'));
  try {
    const run = spawnSync(process.execPath, [script, '--url', join(out, 'absent.html'), '--out', out], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 2);
    assert.equal(run.stdout.trim(), 'BLOCKED: no entry page found');
    const result = JSON.parse(readFileSync(join(out, 'findings.json')));
    assert.ok(result.manifest.not_verified.some((item) => item.rule === 'RS-006'));
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('probe invoked through a symlinked directory keeps its exit and output', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'litgrok-uiux-link-'));
  try {
    const linkedDir = join(scratch, 'linked-scripts');
    symlinkSync(join(root, '.grok/skills/frontend-ui-ux/scripts'), linkedDir, 'dir');
    const actual = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', timeout: 10000 });
    const linked = spawnSync(process.execPath, [join(linkedDir, 'probe.mjs')], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(actual.status, 2);
    assert.equal(linked.status, actual.status);
    assert.equal(linked.stdout, actual.stdout);
    assert.equal(linked.stderr, actual.stderr);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('real browser flags sloppy fixture and clears clean fixture', { skip: browser.status === 0 ? false : 'agent-browser unavailable' }, () => {
  const out = mkdtempSync(join(tmpdir(), 'litgrok-uiux-browser-'));
  try {
    const sloppy = spawnSync(process.execPath, [script, '--url', fixture('sloppy.html'), '--out', join(out, 'sloppy')], { cwd: root, encoding: 'utf8', timeout: 120000 });
    assert.equal(sloppy.status, 1, sloppy.stderr);
    const sloppyResult = JSON.parse(readFileSync(join(out, 'sloppy/findings.json')));
    const findings = sloppyResult.findings;
    assert.ok(findings.every((item) => /^(CF|RS|SLOP)-\d{3}$/.test(item.rule) && ['measured', 'derived', 'not_verified'].includes(item.tier)));
    assert.ok(findings.filter((item) => item.rule.startsWith('SLOP-') && item.severity === 'HIGH').every((item) => ['SLOP-057', 'SLOP-058', 'SLOP-059'].includes(item.rule)));
    assert.ok(findings.filter((item) => item.rule === 'CF-503').every((item) => item.severity !== 'HIGH'));
    assert.deepEqual(sloppyResult.manifest.viewports_run, ['320', '390', '768', '1440', '390-dark', '390-reduced-motion', '1440-zoom200']);
    for (const rule of ['RS-006', 'RS-007', 'RS-004', 'CF-201', 'CF-701', 'CF-503', 'SLOP-008', 'SLOP-036', 'SLOP-040', 'SLOP-057', 'SLOP-058', 'SLOP-059']) assert.ok(findings.some((item) => item.rule === rule), rule);
    const clean = spawnSync(process.execPath, [script, '--url', fixture('clean.html'), '--out', join(out, 'clean')], { cwd: root, encoding: 'utf8', timeout: 120000 });
    assert.equal(clean.status, 0, clean.stderr);
    assert.equal(JSON.parse(readFileSync(join(out, 'clean/findings.json'))).findings.some((item) => item.severity === 'HIGH'), false);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('forbidden source hashes are absent from the packed payload', () => {
  const forbidden = new Set(JSON.parse(readFileSync(fixture('forbidden-hashes.json'))).map((item) => item.sha256));
  const pack = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', timeout: 120000 });
  assert.equal(pack.status, 0, pack.stderr);
  const listing = JSON.parse(pack.stdout)[0].files;
  for (const item of listing) {
    const hash = createHash('sha256').update(readFileSync(join(root, item.path))).digest('hex');
    assert.ok(!forbidden.has(hash), `forbidden source hash in ${item.path}`);
  }
});
