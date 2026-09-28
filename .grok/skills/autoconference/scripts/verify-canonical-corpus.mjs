#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_RELATIVE = 'references/_canonical-corpus/manifest.json';
const VERIFIER_RELATIVE = 'scripts/verify-canonical-corpus.mjs';
const EXPECTED = Object.freeze({
  "schemaVersion": "litgrok.autoconference-corpus/v1",
  "fileCount": 25,
  "byteCount": 55733,
  "aggregateSha256": "2560ff5e352d5049abec5ab2c80c235dda8bb92213a610bd06d9042591529478",
  "files": {
    "assets/conference_template.md": "c1b0a1bbfb52080384e9bf6d725a91d2165a2105a4f055820660a607c913c7e7",
    "assets/report_template.md": "e0cc4b388e4c2bc0fd68d032d48aaeffae50395ed8c98a3a3cd6461285396366",
    "assets/synthesis_template.md": "16ffba65a6f612b0552a2ec9698951832a7cb3b141214cbbb23501c0b81d0a7c",
    "references/agent-prompts.md": "dcbff9d0f7418203cc1fd74d55088dd3447dfe7d2ca9497089920c7358ef894f",
    "references/conference-protocol.md": "52a85c9a1a713013acd05036553eabe8bb9e9837d91f117be455d7fcfc08a788",
    "references/core-principles.md": "0c862b86077f754236c9ada474704d7a4fa647ff967ad977de25a092e0836991",
    "references/family-contract.md": "cc9c1296228cb7dc49266778fe35268a5bb1f61ac68f91e22e8b2d2ffcb848d7",
    "references/modes/analyze.md": "d7c15cd2f3f4ff42fc6f4ca68cb52ce3789d00182fcfe9078cd12974013b010e",
    "references/modes/core.md": "acf7e765931e5d9972d487e979c7dcaae08e60e39c5a12353c2d5fe0fcd9e259",
    "references/modes/core/convergence-guide.md": "515c36d78029d545e3c3f427335f2a7a6615102a76198bb13ee7c098fca3c312",
    "references/modes/core/crash-recovery.md": "f067327ed13e6d2783c3b07e22b2adf9233cf00b4dfeb5995571921f854af08a",
    "references/modes/debate.md": "6a4b0e713df22db0707aa8c62dfdc75b7a78b9755926c757ee5ca656475a088c",
    "references/modes/plan.md": "772a17995add897af92803de2a10fcfa353c9d578c17b73b04fe189494a782e4",
    "references/modes/resume.md": "971fdcd30990b083b472e88deb241ca8ebf653906119271e7e4290d24a09ce24",
    "references/modes/ship.md": "74e4061f1a960c7dd7b6092acfb55178cfbaa2c429168f60dc22ef19fa38de27",
    "references/modes/survey.md": "93866084c2abe5d7a1c6ef7251e5594e03044545ddda5e80c1ca42ef450769d0",
    "references/results-logging.md": "829714f30af623aa78a4ebc9e13a0ba7135b2c876af3443e1c1274af8857fe96",
    "references/visualization-guide.md": "4f7e705735b948038193c5a9c111e2db85672f5d97bb1c570aad217843868331",
    "scripts/init_conference.py": "58aaaa91d3f31bdacfccac4c3a736efb62cb89563f7d37281be0e49f84651187",
    "templates/code-performance.md": "a90d1425477d9aec002778ba695299cfabb593ccd3dbab82ed0d76038e17a4d5",
    "templates/debate-mode.md": "9c74435dc7eb2e2d24d32b0a80381aadc62890f4674d916022ce6ef220aab966",
    "templates/prompt-optimization.md": "8d78c233529533bb742986769941347eebc460fdb2a2dac63952e65883398e10",
    "templates/quick-conference.md": "35e92ccc202ed659ce30f1820fb53e7b6081f4bb01e7f3b3a301c014b9956d03",
    "templates/research-synthesis.md": "7dd182898b572826a614a1cd0239cd1a07d95b0c6cf022c79a5e842a4246ce81",
    "templates/survey-mode.md": "5862cebaf4458b0c411df900f739b0493f2c9583217caf4eff051206e87a10e5"
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
    console.log(`PASS canonical-autoconference-corpus files=${EXPECTED.fileCount} bytes=${EXPECTED.byteCount} sha256=${EXPECTED.aggregateSha256}`);
  }
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
