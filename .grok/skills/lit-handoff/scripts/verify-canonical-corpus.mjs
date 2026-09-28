#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_RELATIVE = 'references/_canonical-corpus/manifest.json';
const EXPECTED = Object.freeze({
  schemaVersion: 'litgrok.lit-handoff-corpus/v1',
  fileCount: 4,
  byteCount: 23331,
  aggregateSha256: 'ed7db6f48d68dbc9a41ad69a282e384c7aaba00db578dcd75a06336e896663cb',
  files: Object.freeze({
    'evals/evals.json': '0a70f0d149e59641100c7dcf8b9f2f1c0ceae57b98518e165f08088f2c2484da',
    'examples/HANDOFF-example-generic-auth-refactor.md': '43c767e573ac8c8900832d2b7a92ee1e83fd2d3d794fe2c82ecef87e5737f2a3',
    'references/source-pointer.md': '63f34756fa299ef07c6ea25a78883fc1d1feb576f722f5271a770bf3259448d6',
    'templates/HANDOFF.md': '2a795a06e7bb81a57e6675ae70ed26db0dbfdb792c01f0a60f96f02cbef49fbd',
  }),
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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

function parseRoot(argv) {
  if (argv.length === 0) return SKILL_ROOT;
  if (argv.length === 2 && argv[0] === '--root' && argv[1] && !argv[1].startsWith('-')) return resolve(argv[1]);
  throw new Error('usage: verify-canonical-corpus.mjs [--root <skill-directory>]');
}

function verify(skillRoot) {
  const failures = [];
  const manifestPath = join(skillRoot, ...MANIFEST_RELATIVE.split('/'));
  if (!existsSync(manifestPath)) return [`missing ${MANIFEST_RELATIVE}`];

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    return [`manifest unreadable: ${error instanceof Error ? error.message : String(error)}`];
  }

  const expectedKeys = ['aggregate_sha256', 'byte_count', 'file_count', 'files', 'schema_version', 'source'];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedKeys.sort())) failures.push('manifest keys mismatch');
  if (manifest.schema_version !== EXPECTED.schemaVersion) failures.push('schema_version mismatch');
  if (manifest.file_count !== EXPECTED.fileCount) failures.push(`file_count expected ${EXPECTED.fileCount}, got ${manifest.file_count}`);
  if (manifest.byte_count !== EXPECTED.byteCount) failures.push(`byte_count expected ${EXPECTED.byteCount}, got ${manifest.byte_count}`);
  if (manifest.aggregate_sha256 !== EXPECTED.aggregateSha256) failures.push('aggregate_sha256 mismatch');
  if (!Array.isArray(manifest.files) || manifest.files.length !== EXPECTED.fileCount) failures.push(`manifest.files expected ${EXPECTED.fileCount} entries`);

  const expectedPaths = Object.keys(EXPECTED.files).sort();
  const manifestPaths = Array.isArray(manifest.files) ? manifest.files.map((entry) => entry?.path).sort() : [];
  if (JSON.stringify(manifestPaths) !== JSON.stringify(expectedPaths)) failures.push('manifest file set mismatch');

  const actualPaths = [];
  for (const root of ['evals', 'examples', 'references', 'templates']) {
    const rootPath = join(skillRoot, root);
    if (!existsSync(rootPath)) {
      failures.push(`missing corpus directory: ${root}`);
      continue;
    }
    actualPaths.push(...listFiles(rootPath).map((file) => `${root}/${file}`));
  }
  const scriptRoot = join(skillRoot, 'scripts');
  if (existsSync(scriptRoot)) {
    actualPaths.push(...listFiles(scriptRoot).filter((file) => file !== 'verify-canonical-corpus.mjs').map((file) => `scripts/${file}`));
  }
  const filteredActualPaths = actualPaths.filter((file) => file !== MANIFEST_RELATIVE).sort();
  if (JSON.stringify(filteredActualPaths) !== JSON.stringify(expectedPaths)) failures.push('actual corpus file set mismatch');

  const manifestByPath = new Map((Array.isArray(manifest.files) ? manifest.files : []).map((entry) => [entry.path, entry]));
  let byteCount = 0;
  const rows = [];
  for (const file of expectedPaths) {
    if (!safeRelativePath(file)) {
      failures.push(`unsafe path: ${file}`);
      continue;
    }
    const filePath = join(skillRoot, ...file.split('/'));
    const entry = manifestByPath.get(file);
    if (!entry || entry.path !== file || typeof entry.size !== 'number' || typeof entry.sha256 !== 'string') {
      failures.push(`manifest entry missing or malformed: ${file}`);
      continue;
    }
    try {
      const bytes = readFileSync(filePath);
      const digest = sha256(bytes);
      byteCount += bytes.byteLength;
      if (bytes.byteLength !== entry.size) failures.push(`size mismatch: ${file}`);
      if (digest !== entry.sha256) failures.push(`manifest hash mismatch: ${file}`);
      if (digest !== EXPECTED.files[file]) failures.push(`expected hash mismatch: ${file}`);
      rows.push(`${digest}  ${file}\n`);
    } catch (error) {
      failures.push(`missing ${file}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (byteCount !== EXPECTED.byteCount) failures.push(`byte count expected ${EXPECTED.byteCount}, got ${byteCount}`);
  if (sha256(rows.join('')) !== EXPECTED.aggregateSha256) failures.push('aggregate digest mismatch');
  return failures;
}

try {
  const skillRoot = parseRoot(process.argv.slice(2));
  if (!existsSync(skillRoot) || !lstatSync(skillRoot).isDirectory()) throw new Error(`skill root is not a directory: ${skillRoot}`);
  const failures = verify(skillRoot);
  if (failures.length > 0) {
    console.error(`FAIL ${failures.join('; ')}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS canonical-handoff-corpus files=${EXPECTED.fileCount} bytes=${EXPECTED.byteCount} sha256=${EXPECTED.aggregateSha256}`);
  }
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
