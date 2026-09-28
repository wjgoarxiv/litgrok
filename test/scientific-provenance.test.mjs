import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CORPUS_ROOT = join(PRODUCT_ROOT, '.grok', 'vendor', 'scientific-visualization');
const MANIFEST_PATH = join(CORPUS_ROOT, 'references', '_canonical-corpus', 'manifest.json');
const PROVENANCE_PATH = join(PRODUCT_ROOT, '.grok', 'vendor', 'provenance', '045_scientific-visualization.md');
const UPSTREAM_COMMIT = '235ed3af614a7becaee6ef1d1a18e5c4b13994f4';
const OMITTED_FILE = Object.freeze({
  path: 'SKILL.md',
  sha256: 'd6084a7e3adf283157820ea20dbe1b46fa22fa1be17b138ab1203be550f4ef68',
  reason: 'deliberately replaced by the Grok-native adapter',
});

function provenanceRows() {
  const provenance = readFileSync(PROVENANCE_PATH, 'utf8');
  const tableStart = provenance.indexOf('| Relative path | SHA-256 |');
  assert.notEqual(tableStart, -1, 'PROVENANCE.md must contain the retained-file hash table');
  return [...provenance.slice(tableStart).matchAll(/^\| `([^`]+)` \| `([a-f0-9]{64})` \|$/gmu)]
    .map(([, path, sha256]) => ({ path, sha256 }));
}

test('scientific provenance binds every retained hash and the one omitted upstream adapter', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const rows = provenanceRows();

  assert.equal(manifest.license, 'MIT');
  assert.equal(manifest.author, 'Woojin');
  assert.equal(manifest.upstream_commit, UPSTREAM_COMMIT);
  assert.equal(rows.length, manifest.file_count, 'provenance table must cover every retained file');
  assert.equal(manifest.files.length, rows.length, 'manifest must cover every retained provenance row');
  assert.deepEqual(rows.map(({ path }) => path), manifest.files.map(({ path }) => path));

  const manifestByPath = new Map(manifest.files.map((entry) => [entry.path, entry]));
  for (const row of rows) {
    assert.equal(manifestByPath.get(row.path)?.sha256, row.sha256, `manifest hash mismatch: ${row.path}`);
  }

  assert.deepEqual(manifest.omitted_files, [OMITTED_FILE]);
  assert.equal(manifest.files.some(({ path }) => path === OMITTED_FILE.path), false, 'omitted file must not be retained');
  assert.equal(manifest.file_count + manifest.omitted_files.length, 16, 'retained plus omitted files must equal the 16-file upstream corpus');
});
