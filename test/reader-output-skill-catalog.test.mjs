import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const SKILLS_DIRECTORY = join(PRODUCT_ROOT, '.grok', 'skills');

test('every conversational skill explicitly inherits the shared reader projection', () => {
  const skillNames = readdirSync(SKILLS_DIRECTORY, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const missingProjection = [];
  const staleManifestClaims = [];

  for (const skillName of skillNames) {
    const content = readFileSync(join(SKILLS_DIRECTORY, skillName, 'SKILL.md'), 'utf8');
    if (/artifact_genre:\s*no_artifact\b/u.test(content)
      && !/reader_projection:\s*shared_rule\b/u.test(content)) {
      missingProjection.push(skillName);
    }
    if (/\bno plugin manifest\b/iu.test(content)) staleManifestClaims.push(skillName);
  }

  assert.deepEqual(missingProjection, []);
  assert.deepEqual(staleManifestClaims, []);
  const sharedRule = readFileSync(join(PRODUCT_ROOT, '.grok', 'rules', '00-litgrok.md'), 'utf8');
  assert.match(
    sharedRule,
    /reader_projection:\s*shared_rule[\s\S]{0,360}detailed output, reply, or reporting lists[\s\S]{0,360}(?:internal|audit)/iu,
  );
});
