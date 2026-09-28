import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_ROOT = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_ROOT);
const SKILL_ROOT = join(PRODUCT_ROOT, '.grok', 'skills', 'frontend-ui-ux');
const SCRIPT_ROOT = join(SKILL_ROOT, 'scripts');
const FIXTURE_ROOT = join(TEST_ROOT, 'fixtures', 'design-contract');
const temporaryRoots = new Set();

test.after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

function runScript(script, args = []) {
  return spawnSync(process.execPath, [join(SCRIPT_ROOT, script), ...args], {
    cwd: PRODUCT_ROOT,
    encoding: 'utf8',
    timeout: 15000,
  });
}

function fixture(name) {
  const path = join(FIXTURE_ROOT, name);
  assert.equal(existsSync(path), true, `fixture is missing: ${name}`);
  return path;
}

function reportFor(name) {
  const result = runScript('validate-design-contract.mjs', [fixture(name)]);
  assert.equal(result.signal, null, `${name} validator timed out`);
  return { result, report: result.stdout ? JSON.parse(result.stdout) : null };
}

test('v1beta2 validator accepts all taste dials and marks the contract evidence-eligible', () => {
  const { result, report } = reportFor('valid-v1beta2.json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(report.issues, []);
  assert.equal(report.schema, 'litfamily.design-contract/v1beta2');
  assert.equal(report.valid, true);
  assert.equal(report.evidence_eligible, true);
});

test('validator rejects taste.variance below the documented 1 through 10 bound', () => {
  const { result, report } = reportFor('variance-0.json');
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.path === 'taste.variance'));
});

test('validator rejects a declared taste object that omits density', () => {
  const { result, report } = reportFor('missing-density.json');
  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(report.valid, false);
  assert.ok(report.issues.some((issue) => issue.path === 'taste.density'));
});

test('v1alpha1 remains parseable but is labelled legacy and not evidence-eligible', () => {
  const { result, report } = reportFor('v1alpha1.json');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(report.valid, true);
  assert.equal(report.schema, 'litfamily.design-contract/v1alpha1');
  assert.deepEqual(report.diagnostics, ['LEGACY_SCHEMA_V1ALPHA1']);
  assert.equal(report.evidence_eligible, false);
});

test('validator treats a one-byte-over-limit artifact as untrusted input', () => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-design-contract-oversize-'));
  temporaryRoots.add(root);
  const path = join(root, 'oversize.json');
  writeFileSync(path, Buffer.alloc(1024 * 1024 + 1, 0x20));

  const result = runScript('validate-design-contract.mjs', [path]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /CONTRACT|1024|oversize|byte/i);
});

test('query-design-intelligence returns no more than the documented twenty results', () => {
  const result = runScript('query-design-intelligence.mjs', [
    '--query', 'Korean public-service form 한글', '--domain', 'ux-guidelines', '--limit', '20', '--json',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schema_id, 'litfamily.design-intelligence-query/v1alpha1');
  assert.equal(report.status, 'RESULTS');
  assert.ok(Array.isArray(report.results));
  assert.ok(report.results.length <= 20);
  assert.match(report.dataset_sha256, /^[a-f0-9]{64}$/u);
});

test('import-design-intelligence check validates the packaged dataset and companions', () => {
  const result = runScript('import-design-intelligence.mjs', [
    '--check',
    '--skill-root', SKILL_ROOT,
    '--expect-records', '2277',
    '--max-bytes', String(4 * 1024 * 1024),
  ]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'PASS');
  assert.equal(report.dataset.record_count, 2277);
  assert.equal(report.dataset.byte_count, 1023482);
  assert.equal(report.dataset.sha256, 'a89011236a6ff14e12ec55fccbfab1bbd40ae34614cea5710c022121aa841bb8');
  assert.equal(report.companions.length, 4);
});

test('v1beta2 schema keeps taste optional and bounds every dial from 1 through 10', () => {
  const schema = JSON.parse(readFileSync(join(SKILL_ROOT, 'schemas', 'design-contract-v1beta2.schema.json'), 'utf8'));
  assert.equal(schema.$id, 'litfamily.design-contract/v1beta2');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.taste.$ref, '#/$defs/taste');
  assert.equal(schema.required.includes('taste'), false);
  assert.deepEqual([...schema.$defs.taste.required].sort(), ['density', 'motion', 'variance']);
  for (const dial of ['variance', 'motion', 'density']) {
    assert.equal(schema.$defs.taste.properties[dial].type, 'integer');
    assert.equal(schema.$defs.taste.properties[dial].minimum, 1);
    assert.equal(schema.$defs.taste.properties[dial].maximum, 10);
  }
});

test('frontend production retains beta2 while removing contract-only and capture prohibitions', () => {
  const entry = readFileSync(join(SKILL_ROOT, 'SKILL.md'), 'utf8');
  const depth = readFileSync(join(SKILL_ROOT, 'references/complete-contract.md'), 'utf8');
  assert.match(entry, /implement/i);
  assert.match(entry, /review.only/i);
  assert.match(entry, /production\.md/);
  assert.match(depth, /litfamily\.design-contract\/v1beta2/);
  assert.doesNotMatch(depth, /It does not capture browser|It has no capture capability|at most two contract-revision rounds/);
});
