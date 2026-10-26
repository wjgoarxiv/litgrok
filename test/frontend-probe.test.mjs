import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { decideExit } from '../.grok/skills/frontend-ui-ux/scripts/interface-probe.mjs';
import { EXIT, LIMITS, MATRIX, RULES } from '../.grok/skills/frontend-ui-ux/scripts/interface-probe-rules.mjs';
import { STATIC_RULES, staticProbe } from '../.grok/skills/frontend-ui-ux/scripts/interface-probe-static.mjs';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const scripts = join(root, '.grok/skills/frontend-ui-ux/scripts');
const script = join(scripts, 'interface-probe.mjs');
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

test('frontend notice credits its clean-room research sources', () => {
  const notice = readFileSync(join(root, '.grok/skills/frontend-ui-ux/THIRD-PARTY-NOTICE.txt'), 'utf8');
  for (const anchor of ['jakubkrehel/skills', 'Jakub Krehel', '267330e', 'ibelick/ui-skills', 'Julien Thibeaut', 'MIT']) assert.ok(notice.includes(anchor), anchor);
});

test('direction step asks the user to choose the house style before building', () => {
  const skill = readFileSync(join(root, '.grok/skills/frontend-ui-ux/SKILL.md'), 'utf8');
  const ask = /ask[^.\n]*choice[^.\n]*house style|numbered choice[^.\n]*house style/i;
  assert.match(skill, ask, 'SKILL.md names the ask-first house-style choice');
  assert.match(skill, /recommended first/i, 'the recommended option comes first');
  const askAt = skill.search(ask);
  const buildAt = skill.indexOf('Run scripts/design-lock.mjs');
  assert.ok(askAt !== -1 && buildAt !== -1 && askAt < buildAt, 'the choice step precedes the build authorization');
  assert.match(skill, /skip[^.\n]*(names|you choose)/i, 'skip only when the prompt names the style or says you choose');
});

test('static fallback identifies source signals and keeps rendered checks unverified', () => {
  const sloppy = staticProbe(fixture('sloppy.html'));
  const rules = new Set(sloppy.findings.map((item) => item.rule));
  for (const rule of ['SLOP-058', 'SLOP-057', 'CF-503', 'SLOP-040', 'SLOP-036']) assert.ok(rules.has(rule), `${rule} must be found statically`);
  assert.ok(sloppy.findings.every((item) => item.viewport === 'static' && item.tier === 'measured' && /:\d+$/.test(item.selector)));
  assert.ok(sloppy.notVerified.some((item) => item.rule === 'RS-006' && item.reason));
  assert.deepEqual(staticProbe(fixture('clean.html')).findings, []);
});

test('static fallback lists every rendered rule as not verified', () => {
  const { notVerified } = staticProbe(fixture('clean.html'));
  const listed = new Set(notVerified.map((item) => item.rule));
  for (const rule of Object.keys(RULES).filter((id) => !STATIC_RULES.includes(id))) assert.ok(listed.has(rule), `${rule} must be listed`);
});

test('Delta 1 thresholds and severities are centralized', () => {
  assert.deepEqual(MATRIX.map(({ id }) => id), ['320', '390', '768', '1440', '390-dark', '390-reduced-motion', '1440-zoom200']);
  assert.equal(RULES['RS-006'].threshold.tolerancePx, 8);
  assert.equal(RULES['RS-007'].threshold.offscreenPx, 8);
  assert.deepEqual([RULES['CF-101'].threshold.latinMaxCh, RULES['CF-101'].threshold.cjkMaxCh], [90, 60]);
  assert.deepEqual([RULES['CF-103'].threshold.latinMin, RULES['CF-103'].threshold.cjkMin], [1.4, 1.5]);
  assert.equal(RULES['CF-401'].threshold.tolerancePx, 2);
  assert.equal(RULES['CF-503'].severity, 'MEDIUM');
  assert.equal(RULES['CF-503'].threshold.declaredSeverity, 'LOW');
  for (const id of ['SLOP-010', 'SLOP-029', 'SLOP-036', 'SLOP-037', 'SLOP-040']) assert.equal(RULES[id].severity, 'MEDIUM', id);
  assert.deepEqual(Object.entries(RULES).filter(([id, rule]) => id.startsWith('SLOP-') && rule.severity === 'HIGH').map(([id]) => id), ['SLOP-057', 'SLOP-058', 'SLOP-059']);
  assert.equal(RULES['SLOP-036'].threshold.phrases.length, 31);
  assert.equal(LIMITS.settleMs, 1200);
});

test('exit codes follow the measured/high/blocked ladder', () => {
  const all = MATRIX.map(({ id }) => id);
  const high = (tier) => [{ rule: 'CF-201', severity: 'HIGH', tier }];
  assert.deepEqual(decideExit({ findings: [], viewportsRun: all, blockedReason: null }), { exitCode: EXIT.clean, blockedReason: null });
  assert.equal(decideExit({ findings: high('measured'), viewportsRun: all, blockedReason: null }).exitCode, EXIT.high);
  assert.equal(decideExit({ findings: high('not_verified'), viewportsRun: all, blockedReason: null }).exitCode, EXIT.clean);
  assert.equal(decideExit({ findings: high('derived'), viewportsRun: ['390'], blockedReason: null }).exitCode, EXIT.high);
  assert.equal(decideExit({ findings: high('measured'), viewportsRun: [], blockedReason: 'browser unavailable' }).exitCode, EXIT.blocked);
});

test('the in-page module stays free of imports, network calls and literal thresholds', () => {
  const source = readFileSync(join(scripts, 'interface-probe-page.mjs'), 'utf8');
  assert.doesNotMatch(source, /^\s*import\b/m);
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b/);
  assert.doesNotMatch(source, /\.(?:click|submit|requestSubmit|dispatchEvent)\(/, 'the probe activates nothing');
});

test('missing browser exits BLOCKED and retains static findings', () => {
  const out = mkdtempSync(join(tmpdir(), 'litgrok-uiux-missing-'));
  try {
    const run = spawnSync(process.execPath, [script, fixture('sloppy.html'), '--out', out], { cwd: root, env: { ...process.env, PATH: '' }, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stdout, /^BLOCKED: browser unavailable$/m);
    const result = JSON.parse(readFileSync(join(out, 'findings.json')));
    assert.ok(result.findings.length > 0);
    assert.ok(result.manifest.not_verified.some((item) => item.rule === 'CF-201'));
    assert.equal(result.manifest.exit_code, 2);
    assert.deepEqual(result.manifest.viewports_run, []);
    assert.equal(result.manifest.browser_version, null);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('a static-only run never reports a pass', () => {
  const out = mkdtempSync(join(tmpdir(), 'litgrok-uiux-static-'));
  try {
    const run = spawnSync(process.execPath, [script, fixture('clean.html'), '--out', out, '--static'], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 2);
    assert.match(run.stdout, /static run/);
    const result = JSON.parse(readFileSync(join(out, 'findings.json')));
    assert.equal(result.findings.length, 0);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('missing source exits BLOCKED rather than reporting a clean page', () => {
  const out = mkdtempSync(join(tmpdir(), 'litgrok-uiux-source-'));
  try {
    const run = spawnSync(process.execPath, [script, join(out, 'absent.html'), '--out', out], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(run.status, 2, run.stderr);
    assert.match(run.stdout, /^BLOCKED: no entry page found$/m);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test('probe invoked through a symlinked directory keeps its exit and output', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'litgrok-uiux-link-'));
  try {
    const linkedDir = join(scratch, 'linked-scripts');
    symlinkSync(scripts, linkedDir, 'dir');
    const run = (entry) => spawnSync(process.execPath, [entry, '--no-such-flag'], { cwd: root, encoding: 'utf8', timeout: 10000 });
    const actual = run(script);
    const linked = run(join(linkedDir, 'interface-probe.mjs'));
    assert.equal(actual.status, 2);
    assert.match(actual.stdout, /^BLOCKED: unknown argument --no-such-flag$/m);
    assert.equal(linked.status, actual.status);
    assert.equal(linked.stdout, actual.stdout);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('real browser flags sloppy fixture and clears clean fixture', { skip: browser.status === 0 ? false : 'agent-browser unavailable' }, () => {
  const out = mkdtempSync(join(tmpdir(), 'litgrok-uiux-browser-'));
  try {
    const run = (target, dest) => spawnSync(process.execPath, [script, fixture(target), '--out', join(out, dest)], { cwd: root, encoding: 'utf8', timeout: 120000 });
    const sloppy = run('sloppy.html', 'sloppy');
    assert.equal(sloppy.status, 1, sloppy.stderr);
    const findings = JSON.parse(readFileSync(join(out, 'sloppy/findings.json'))).findings;
    assert.ok(findings.every((item) => /^(CF|RS|SLOP|DS)-\d{3}$/.test(item.rule) && ['measured', 'derived', 'not_verified'].includes(item.tier)));
    assert.ok(findings.filter((item) => item.rule.startsWith('SLOP-') && item.severity === 'HIGH').every((item) => ['SLOP-057', 'SLOP-058', 'SLOP-059'].includes(item.rule)));
    assert.ok(findings.filter((item) => item.rule === 'CF-503').every((item) => item.severity !== 'HIGH'));
    assert.deepEqual(JSON.parse(readFileSync(join(out, 'sloppy/findings.json'))).manifest.viewports_run, ['320', '390', '768', '1440', '390-dark', '390-reduced-motion', '1440-zoom200']);
    for (const rule of ['RS-007', 'CF-201', 'SLOP-057', 'SLOP-058', 'SLOP-040', 'SLOP-008']) assert.ok(findings.some((item) => item.rule === rule), rule);
    const clean = run('clean.html', 'clean');
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
