import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL_ROOT = join(PRODUCT_ROOT, '.grok', 'skills', 'frontend-ui-ux');
const REFERENCES_ROOT = join(SKILL_ROOT, 'references');
const MANIFEST_PATH = join(REFERENCES_ROOT, '_canonical-corpus', 'manifest.json');
const CORPUS_ROOTS = ['design', 'designpowers', 'perfection', 'ui-ux-db'];
const EXPECTED_MANIFEST_KEYS = [
  'aggregate_sha256',
  'byte_count',
  'file_count',
  'files',
  'independent_normalized_dataset',
  'legal',
  'schema_version',
  'source',
];
const EXPECTED_DATASET_SHA256 = 'a89011236a6ff14e12ec55fccbfab1bbd40ae34614cea5710c022121aa841bb8';
const EXPECTED_CORPUS_SHA256 = 'f6959eeae02685102df9fbedafb2c437be4d51df8e102f9fcf32298f7674e7d7';
const EXPECTED_LEGAL_TREE_SHA256 = '2b7174f0662a5e41259b922fd1d94c24670df66894c7b9f81c9595ebd35fbc52';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function filesBelow(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(path));
    else if (entry.isFile()) files.push(path);
    else assert.fail(`non-regular corpus entry: ${path}`);
  }
  return files;
}

function canonicalLegalTreeSha256(entries) {
  const rows = [...entries]
    .map(({ path, source_path: sourcePath, size, sha256: digest }) => ({ path, sourcePath, size, sha256: digest }))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(({ path, sourcePath, size, sha256: digest }) => `${JSON.stringify([path, sourcePath, size, digest])}\n`)
    .join('');
  return sha256(rows);
}

test('canonical frontend corpus preserves the pinned manifest and every file digest', () => {
  assert.ok(existsSync(MANIFEST_PATH), `missing ${relative(PRODUCT_ROOT, MANIFEST_PATH)}`);
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

  assert.deepEqual(Object.keys(manifest).sort(), [...EXPECTED_MANIFEST_KEYS].sort());
  assert.equal(manifest.schema_version, 'litclaude.canonical-frontend-corpus/v1');
  assert.deepEqual(manifest.source, {
    commit: '8ec16c5129df7b9778959e8367657d0e79c2c3bb',
    reference_tree: '9188410be0af35f2421ba300d91a0d7a7341caf0',
    reference_subtree: 'frontend/references',
  });
  assert.equal(manifest.file_count, 167);
  assert.equal(manifest.byte_count, 2_596_349);
  assert.equal(manifest.aggregate_sha256, EXPECTED_CORPUS_SHA256);
  assert.equal(manifest.files.length, manifest.file_count);
  assert.equal(manifest.legal.length, 3);
  assert.equal(manifest.independent_normalized_dataset.sha256, EXPECTED_DATASET_SHA256);

  const actualHashes = new Map();
  for (const entry of [...manifest.files, ...manifest.legal]) {
    assert.equal(typeof entry.path, 'string');
    assert.equal(entry.path.includes('\\'), false, `non-POSIX path: ${entry.path}`);
    assert.equal(entry.path.startsWith('/'), false, `absolute path: ${entry.path}`);
    const filePath = join(REFERENCES_ROOT, ...entry.path.split('/'));
    assert.ok(existsSync(filePath), `missing manifest file: ${entry.path}`);
    const bytes = readFileSync(filePath);
    assert.equal(bytes.byteLength, entry.size, `size mismatch: ${entry.path}`);
    const digest = sha256(bytes);
    assert.equal(digest, entry.sha256, `sha256 mismatch: ${entry.path}`);
    actualHashes.set(entry.path, digest);
  }

  const actualCorpusPaths = CORPUS_ROOTS.flatMap((root) =>
    filesBelow(join(REFERENCES_ROOT, root)).map((filePath) => relative(REFERENCES_ROOT, filePath).split('\\').join('/')),
  ).sort();
  assert.deepEqual(actualCorpusPaths, manifest.files.map(({ path }) => path).sort());
  assert.equal(
    manifest.files.reduce((total, { path }) => total + readFileSync(join(REFERENCES_ROOT, ...path.split('/'))).byteLength, 0),
    manifest.byte_count,
  );
  const aggregate = sha256(manifest.files.map(({ path }) => `${actualHashes.get(path)}  ${path}\n`).join(''));
  assert.equal(aggregate, EXPECTED_CORPUS_SHA256);

  const actualLegalPaths = filesBelow(join(REFERENCES_ROOT, '_canonical-corpus'))
    .map((filePath) => relative(REFERENCES_ROOT, filePath).split('\\').join('/'))
    .sort();
  const expectedLegalPaths = ['_canonical-corpus/manifest.json', ...manifest.legal.map(({ path }) => path)].sort();
  assert.deepEqual(actualLegalPaths, expectedLegalPaths);
  assert.equal(canonicalLegalTreeSha256(manifest.legal), EXPECTED_LEGAL_TREE_SHA256);

  const datasetPath = join(SKILL_ROOT, 'data', 'design-intelligence.json');
  assert.equal(statSync(datasetPath).size, 1_023_482);
  assert.equal(sha256(readFileSync(datasetPath)), EXPECTED_DATASET_SHA256);

  for (const supportFile of ['PROVENANCE.json', 'SOURCE-MANIFEST.json', 'LICENSE', 'THIRD-PARTY-NOTICE.txt']) {
    assert.ok(existsSync(join(SKILL_ROOT, supportFile)), `missing support file: ${supportFile}`);
  }
});
