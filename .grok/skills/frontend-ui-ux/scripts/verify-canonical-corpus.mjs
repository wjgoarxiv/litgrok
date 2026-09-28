#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORPUS_ROOTS = Object.freeze(['design', 'designpowers', 'perfection', 'ui-ux-db']);
const MANIFEST_RELATIVE = '_canonical-corpus/manifest.json';
const EXPECTED = Object.freeze({
  schemaVersion: ['lit', 'claude'].join('') + '.canonical-frontend-corpus/v1',
  source: Object.freeze({
    commit: '8ec16c5129df7b9778959e8367657d0e79c2c3bb',
    reference_tree: '9188410be0af35f2421ba300d91a0d7a7341caf0',
    reference_subtree: 'frontend/references',
  }),
  fileCount: 167,
  byteCount: 2_596_349,
  aggregateSha256: 'f6959eeae02685102df9fbedafb2c437be4d51df8e102f9fcf32298f7674e7d7',
  legalTreeSha256: '2b7174f0662a5e41259b922fd1d94c24670df66894c7b9f81c9595ebd35fbc52',
  datasetBytes: 1_023_482,
  datasetSha256: 'a89011236a6ff14e12ec55fccbfab1bbd40ae34614cea5710c022121aa841bb8',
});

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function expectedKeys(value, keys, label, failures) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failures.push(`${label} is not an object`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    failures.push(`${label} keys mismatch`);
    return false;
  }
  return true;
}

function safeRelativePath(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.startsWith('/')
    && !value.includes('\\')
    && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = prefix ? `${prefix}/${entry.name}` : entry.name;
    const childPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(childPath, child));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`non-regular entry: ${child}`);
  }
  return files;
}

function readBytes(referencesRoot, relativePath) {
  return readFileSync(join(referencesRoot, ...relativePath.split('/')));
}

function parseRoot(argv) {
  if (argv.length === 0) return SKILL_ROOT;
  if (argv.length === 2 && argv[0] === '--root' && argv[1] && !argv[1].startsWith('-')) return resolve(argv[1]);
  throw new Error('usage: verify-canonical-corpus.mjs [--root <skill-directory>]');
}

function verify(skillRoot) {
  const failures = [];
  const referencesRoot = join(skillRoot, 'references');
  const manifestPath = join(referencesRoot, ...MANIFEST_RELATIVE.split('/'));
  if (!existsSync(manifestPath)) return ['missing _canonical-corpus/manifest.json'];

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return [`manifest unreadable: ${error instanceof Error ? error.message : String(error)}`];
  }

  if (expectedKeys(manifest, [
    'aggregate_sha256',
    'byte_count',
    'file_count',
    'files',
    'independent_normalized_dataset',
    'legal',
    'schema_version',
    'source',
  ], 'manifest', failures)) {
    if (manifest.schema_version !== EXPECTED.schemaVersion) failures.push('schema_version mismatch');
    if (JSON.stringify(manifest.source) !== JSON.stringify(EXPECTED.source)) failures.push('source metadata mismatch');
    if (manifest.file_count !== EXPECTED.fileCount) failures.push(`file_count expected ${EXPECTED.fileCount}, got ${manifest.file_count}`);
    if (manifest.byte_count !== EXPECTED.byteCount) failures.push(`byte_count expected ${EXPECTED.byteCount}, got ${manifest.byte_count}`);
    if (manifest.aggregate_sha256 !== EXPECTED.aggregateSha256) failures.push('aggregate_sha256 metadata mismatch');
  }
  const filesAreValid = Array.isArray(manifest.files);
  const legalIsValid = Array.isArray(manifest.legal);
  if (!filesAreValid) failures.push('manifest.files is not an array');
  if (!legalIsValid) failures.push('manifest.legal is not an array');
  if (filesAreValid && manifest.files.length !== EXPECTED.fileCount) failures.push(`manifest.files length expected ${EXPECTED.fileCount}, got ${manifest.files.length}`);
  if (legalIsValid && manifest.legal.length !== 3) failures.push(`manifest.legal length expected 3, got ${manifest.legal.length}`);

  if (expectedKeys(manifest.independent_normalized_dataset, ['record_count', 'sha256', 'source_count'], 'dataset metadata', failures)) {
    if (manifest.independent_normalized_dataset.source_count !== 34) failures.push('dataset source_count mismatch');
    if (manifest.independent_normalized_dataset.record_count !== 2277) failures.push('dataset record_count mismatch');
    if (manifest.independent_normalized_dataset.sha256 !== EXPECTED.datasetSha256) failures.push('dataset sha256 metadata mismatch');
  }

  const entries = [];
  const paths = new Set();
  for (const [index, entry] of (filesAreValid ? manifest.files : []).entries()) {
    if (!expectedKeys(entry, ['path', 'sha256', 'size'], `files[${index}]`, failures)) continue;
    if (!safeRelativePath(entry.path) || !CORPUS_ROOTS.some((root) => entry.path.startsWith(`${root}/`))) {
      failures.push(`files[${index}] path is outside the canonical roots: ${entry.path}`);
      continue;
    }
    if (paths.has(entry.path)) failures.push(`duplicate manifest path: ${entry.path}`);
    paths.add(entry.path);
    entries.push({ kind: 'corpus', ...entry });
  }
  for (const [index, entry] of (legalIsValid ? manifest.legal : []).entries()) {
    if (!expectedKeys(entry, ['path', 'sha256', 'size', 'source_path'], `legal[${index}]`, failures)) continue;
    if (!safeRelativePath(entry.path) || !entry.path.startsWith('_canonical-corpus/legal/')) {
      failures.push(`legal[${index}] path is outside the legal root: ${entry.path}`);
      continue;
    }
    if (!safeRelativePath(entry.source_path)) failures.push(`legal[${index}] source_path is unsafe: ${entry.source_path}`);
    if (paths.has(entry.path)) failures.push(`duplicate manifest path: ${entry.path}`);
    paths.add(entry.path);
    entries.push({ kind: 'legal', ...entry });
  }

  const expectedCorpusPaths = entries.filter(({ kind }) => kind === 'corpus').map(({ path }) => path).sort();
  const expectedLegalPaths = [MANIFEST_RELATIVE, ...entries.filter(({ kind }) => kind === 'legal').map(({ path }) => path)].sort();
  try {
    const actualCorpusPaths = CORPUS_ROOTS.flatMap((root) => listFiles(join(referencesRoot, root), '')
      .map((path) => `${root}/${path}`)).sort();
    if (JSON.stringify(actualCorpusPaths) !== JSON.stringify(expectedCorpusPaths)) failures.push('corpus file set mismatch');
  } catch (error) {
    failures.push(`corpus inventory failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const actualLegalPaths = listFiles(join(referencesRoot, '_canonical-corpus'), '_canonical-corpus').sort();
    if (JSON.stringify(actualLegalPaths) !== JSON.stringify(expectedLegalPaths)) failures.push('legal file set mismatch');
  } catch (error) {
    failures.push(`legal inventory failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const actualHashes = new Map();
  let corpusBytes = 0;
  for (const entry of entries) {
    let bytes;
    try {
      bytes = readBytes(referencesRoot, entry.path);
    } catch (error) {
      failures.push(`missing ${entry.path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const actualHash = digest(bytes);
    actualHashes.set(entry.path, actualHash);
    if (bytes.byteLength !== entry.size) failures.push(`size mismatch: ${entry.path}`);
    if (actualHash !== entry.sha256) failures.push(`sha256 mismatch: ${entry.path}`);
    if (entry.kind === 'corpus') corpusBytes += bytes.byteLength;
  }
  if (corpusBytes !== EXPECTED.byteCount) failures.push(`corpus byte count expected ${EXPECTED.byteCount}, got ${corpusBytes}`);
  const aggregate = entries.filter(({ kind }) => kind === 'corpus').every(({ path }) => actualHashes.has(path))
    ? digest(entries.filter(({ kind }) => kind === 'corpus').map(({ path }) => `${actualHashes.get(path)}  ${path}\n`).join(''))
    : null;
  if (aggregate !== EXPECTED.aggregateSha256) failures.push(`aggregate sha256 expected ${EXPECTED.aggregateSha256}, got ${aggregate}`);

  if (legalIsValid) {
    const legalRows = manifest.legal
      .map(({ path, source_path: sourcePath, size, sha256: sha }) => ({ path, sourcePath, size, sha256: sha }))
      .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
      .map(({ path, sourcePath, size, sha256: sha }) => `${JSON.stringify([path, sourcePath, size, sha])}\n`)
      .join('');
    const legalTree = digest(legalRows);
    if (legalTree !== EXPECTED.legalTreeSha256) failures.push(`legal tree sha256 expected ${EXPECTED.legalTreeSha256}, got ${legalTree}`);
  }

  const datasetPath = join(skillRoot, 'data', 'design-intelligence.json');
  try {
    const dataset = readFileSync(datasetPath);
    if (dataset.byteLength !== EXPECTED.datasetBytes) failures.push(`dataset byte count expected ${EXPECTED.datasetBytes}, got ${dataset.byteLength}`);
    if (digest(dataset) !== EXPECTED.datasetSha256) failures.push('dataset sha256 mismatch');
  } catch (error) {
    failures.push(`dataset unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }

  return failures;
}

let skillRoot;
try {
  skillRoot = parseRoot(process.argv.slice(2));
  if (!existsSync(skillRoot) || !lstatSync(skillRoot).isDirectory()) throw new Error(`skill root is not a directory: ${skillRoot}`);
  const failures = verify(skillRoot);
  if (failures.length > 0) {
    console.error(`FAIL ${failures.join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS canonical-frontend-corpus files=${EXPECTED.fileCount} bytes=${EXPECTED.byteCount} sha256=${EXPECTED.aggregateSha256}`);
  }
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
