#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_RELATIVE = 'references/_canonical-corpus/manifest.json';
const VERIFIER_RELATIVE = 'scripts/verify-canonical-corpus.mjs';
const EXPECTED = Object.freeze({
  "schemaVersion": "litgrok.autoresearch-corpus/v1",
  "fileCount": 27,
  "byteCount": 38805,
  "aggregateSha256": "0296ca6e52fb7cb68a37f3e17f148248146955ad9624e37e449e60b56eeeb1d3",
  "files": {
    "assets/report_template.md": "b6b7607488736f24d3bacea8f3ec8563da40ff782cc1d85c064ab53b2488a4f9",
    "assets/research_template.md": "726d175cd2db92dfe58a738117d9c6cc88211e519d3be8fb7cb05b66ba34c050",
    "assets/results_template.tsv": "bcbdc938723f2cd8a4160000621d003a9b04c8e0aa6f67be8a64a572af7f58cc",
    "references/core-principles.md": "122f32b1235b0f52a984db8f73de7fdc93ecb0735af383ef8b158a082de5c580",
    "references/family-contract.md": "3bc544c2eb7bfb2fc5a514d8cb1083e427a99095076c282bace9ea9de4cffc53",
    "references/modes/core.md": "d9593023a7bca50d459d5de7d6950f0d2585420e3d350d2a9f519bd3bfa44c49",
    "references/modes/core/evaluator-contract.md": "c012322fc40114d2b77b885725f5c314a695f55f0376bba67eed77eceb4b1112",
    "references/modes/core/stuck-detection.md": "9e38964cadf2c65facf1dc7a2c1fab42e32b0813a882b47afc9551f72743f6a1",
    "references/modes/debug.md": "2eef3e7ad9810753191e708a0addfe870ed686e9aa28017da29f4c68da526c8f",
    "references/modes/debug/investigation-techniques.md": "6c2b5369ba1718b3d9f8e394d4fef18943d270748623723f3e5b7b157408f980",
    "references/modes/fix.md": "0c5d68629a040bab2ea71e9f14fd31fa5bec78578579f5aae7a0c47f082ec5bd",
    "references/modes/learn.md": "b318a849c48b2aed18a1b2aa19a1ff28a17862c762504a86caea0ba2fef5b5d5",
    "references/modes/plan.md": "081d722a75577390e946a48d70bcf8df33b7fcda109d3cbde848c466e0ea6ff0",
    "references/modes/predict.md": "67f0e4cb00273056108fa0c90a9a0d165cbb3436c52923e403cc57106d1a2b4b",
    "references/modes/predict/persona-templates.md": "65d6403334aef81b4b313b2979ab8040c7733163d61666aafb76780e624619a9",
    "references/modes/reason.md": "4f4ad8b5746b2101ed76a6c412bfdc8da3bc13f3fce864b5271956078ea07984",
    "references/modes/scenario.md": "0dfb67fda9e4b91d28994d907104ae28ca7709f2f9407c25ea6363a910e24b6b",
    "references/modes/scenario/dimensions.md": "e3b9d17be5a1a6876d1af99278ad7822a9a242ca7746eafd70bf88619935044e",
    "references/modes/security.md": "bd7a1e60b36bcdbcc1236018cc82e55727b7f95589e0a5f2a5eb6f2cfc453121",
    "references/modes/security/owasp-checklist.md": "8fddf3bb4b7d35dc3f1c65db73791519d853da369d2c403d6d7c40e468d01031",
    "references/modes/security/stride-model.md": "cd34176f3bfabe40b2cbe52d9b4ff7433a73473374a30cb5eb798a23bed2bc28",
    "references/modes/ship.md": "6baa5d3812e71b46ec78c1e96891c54d4ced0b76cba127a4b0c2254aba31ba81",
    "references/modes/ship/type-checklists.md": "6bea500594cad1e23bdeee2df34f6dd079d02b279773b20f914d313cabd630b3",
    "references/results-logging.md": "4671c19df6d389b42091f2f117fd90726cb32f3082b44dbc9a895dc3625b9832",
    "references/visualization-guide.md": "2ca249d74b30b41e7660c8b7ba91a59b0c33a1e74fc18b2ec2f867441a6e4b27",
    "scripts/init_research.py": "b675ea22abf0794e32dbbf59b95248f20878bbf3d071fa10d37b5a004a7f880c",
    "scripts/style_presets.py": "b1c7d495016b0737b622684f4381f87990dfaae77934b3acae44e19742ebdfd5"
  }
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

function referencedResources(skillRoot) {
  const entry = readFileSync(join(skillRoot, 'SKILL.md'), 'utf8');
  const paths = new Set();
  for (const match of entry.matchAll(/`((?:assets|references|scripts|templates)\/[^\`]+)`/g)) {
    const token = match[1].trim().split(/\s+/u)[0];
    if (safeRelativePath(token)) paths.add(token);
  }
  return paths;
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

  for (const required of ['SKILL.md', 'LICENSE', 'PROVENANCE.md']) {
    const requiredPath = join(skillRoot, required);
    if (!existsSync(requiredPath) || !lstatSync(requiredPath).isFile()) failures.push(`missing regular file: ${required}`);
  }

  const referenced = referencedResources(skillRoot);
  for (const file of expectedPaths) {
    if (!referenced.has(file)) failures.push(`SKILL_RESOURCE_UNDECLARED: ${file}`);
  }
  for (const file of referenced) {
    if (file === VERIFIER_RELATIVE) continue;
    if (!expectedPaths.includes(file)) failures.push(`SKILL_RESOURCE_UNMANIFESTED: ${file}`);
  }

  const actualPaths = [];
  for (const root of ['assets', 'references', 'scripts', 'templates']) {
    const rootPath = join(skillRoot, root);
    if (!existsSync(rootPath)) continue;
    actualPaths.push(...listFiles(rootPath).map((file) => `${root}/${file}`));
  }
  const filteredActualPaths = actualPaths
    .filter((file) => file !== MANIFEST_RELATIVE && file !== VERIFIER_RELATIVE)
    .sort();
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
    console.log(`PASS canonical-autoresearch-corpus files=${EXPECTED.fileCount} bytes=${EXPECTED.byteCount} sha256=${EXPECTED.aggregateSha256}`);
  }
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
