import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKFLOW_PATH = join(PRODUCT_ROOT, '.github', 'workflows', 'ci.yml');
const PUBLISH_PATH = join(PRODUCT_ROOT, '.github', 'workflows', 'publish.yml');

// Terms are split so this guard cannot match itself.
const RELEASE_TERMS = [
  'npm publi' + 'sh',
  'NPM_' + 'TOKEN',
  'NODE_AUTH_' + 'TOKEN',
  'git pu' + 'sh',
  'git ta' + 'g',
  '--access publi' + 'c',
];

test('the CI workflow exists', () => {
  assert.ok(existsSync(WORKFLOW_PATH), 'missing .github/workflows/ci.yml');
});

test('CI runs the test suite that carries the payload gates', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(source, /run: npm test 2>&1 \| tee "\$RUNNER_TEMP\/test-report\.log"$/mu, 'CI must run `npm test`');
  assert.match(source, /on:\n\s+push:/u, 'CI must trigger on push');
  assert.match(source, /pull_request:/u, 'CI must trigger on pull_request');
});

test('CI checks package version lockstep', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(source, /run: npm run check:version$/mu, 'CI must run the version lockstep guard');
});

test('CI carries no release, publish, tag, or token step', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  const found = RELEASE_TERMS.filter((term) => source.includes(term));
  assert.deepEqual(found, [], `release-command term present in CI workflow: ${found.join(', ')}`);
});

test('CI grants no write permission', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(source, /permissions:\n\s+contents: read/u, 'CI must pin contents: read');
});

test('CI bounds validation, disables persisted credentials, and retains failure evidence', () => {
  const source = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(source, /timeout-minutes: 20/u);
  assert.match(source, /cancel-in-progress: true/u);
  assert.match(source, /persist-credentials: false/u);
  assert.match(source, /node --check bin\/litgrok\.mjs/u);
  assert.match(source, /node --check test\/skills-and-rules\.test\.mjs/u);
  assert.match(source, /node \.grok\/skills\/frontend-ui-ux\/scripts\/verify-canonical-corpus\.mjs/u);
  assert.match(source, /if: always\(\)/u);
  assert.match(source, /shell: bash --noprofile --norc -e -o pipefail \{0\}/u);
  assert.match(source, /uses: actions\/upload-artifact@v4/u);
  assert.match(source, /retention-days: 7/u);
  assert.doesNotMatch(source, /\b(?:contents|packages|actions|id-token|pull-requests): write/u);
});

test('the publish workflow trusts only a green ci.yml run and carries no token or push', () => {
  const source = readFileSync(PUBLISH_PATH, 'utf8');
  assert.match(source, /on:\n\s+workflow_dispatch:/u, 'publish must start by hand only');
  assert.doesNotMatch(source, /^\s+(?:push|pull_request|schedule|release):/mu, 'publish must have no automatic trigger');
  assert.match(source, /if: github\.ref == 'refs\/heads\/main'/u);
  assert.match(source, /LITGROK_PUBLISH_FROM_CI: "1"/u, 'publish must switch the gate to the ci.yml check');
  assert.match(source, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/u);
  assert.match(source, /permissions:\n\s+contents: read\n\s+actions: read\n\s+id-token: write/u);
  assert.match(source, /timeout-minutes: 10/u);
  assert.match(source, /persist-credentials: false/u);
  assert.match(source, /run: npm run check:version$/mu);
  assert.match(source, /run: node scripts\/prepublish-test-gate\.mjs$/mu, 'a dry run must still check ci.yml');
  assert.match(source, /run: npm stage publish$/mu, 'publish must stage, never upload a live version');
  assert.doesNotMatch(source, /run: npm test/u, 'the suite belongs to ci.yml');
  assert.doesNotMatch(source, /\b(?:contents|packages|actions|pull-requests): write/u);
  const found = RELEASE_TERMS.filter((term) => source.includes(term));
  assert.deepEqual(found, [], `release-command term present in the publish workflow: ${found.join(', ')}`);
});
