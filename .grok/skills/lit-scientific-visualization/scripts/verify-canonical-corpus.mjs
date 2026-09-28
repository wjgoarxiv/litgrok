#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../vendor/scientific-visualization');
const MANIFEST_RELATIVE = 'references/_canonical-corpus/manifest.json';
const EXPECTED = Object.freeze({
  schemaVersion: 'litgrok.scientific-visualization-corpus/v1',
  license: 'MIT',
  author: 'Woojin',
  upstreamCommit: '235ed3af614a7becaee6ef1d1a18e5c4b13994f4',
  omittedFile: Object.freeze({
    path: 'SKILL.md',
    sha256: 'd6084a7e3adf283157820ea20dbe1b46fa22fa1be17b138ab1203be550f4ef68',
    reason: 'deliberately replaced by the Grok-native adapter',
  }),
  fileCount: 15,
  byteCount: 114577,
  aggregateSha256: 'bf4719645e2c784f788993bb1d9f17d99dfb26301b1df474b1d26e9fcb9b4962',
  files: Object.freeze({
    'assets/color_palettes.py': 'ffea28da930406ecb11bbeaebfc530dfac40b772827a7653f449cb3b0bb35309',
    'assets/nature.mplstyle': '6a7343788bf772b7e1bc813d094f7bafa97c1e5544586e7b76002ad8547229b6',
    'assets/presentation.mplstyle': 'e3ee23f0470d7fb07a0be75cd1210e231becfc2f5267aa404e4186aa077a3339',
    'assets/publication.mplstyle': '18447af3bc47310d23fc27255413c23d8bbe3ff441463cc54fcecdfacd205bea',
    'evals/evals.json': '366dc61b6e042f08f28bf33f2534feea80219d771b84497ec7094b30263e935b',
    'references/color_palettes.md': '0298691c8de8379570488a7b7768663971bc20af1fb05d464c5438d43a21dcfa',
    'references/journal_requirements.md': '56fdde590a9d778547dbcb609b77d86f1f31865e803bcecca5d8c4c72b91b3c7',
    'references/matplotlib_examples.md': 'c99cd4f83e2452773e9580e2fa0984e61433c7a9b57ca0d2562dc400dfe4f83d',
    'references/mdanalysis_martini_visualization.md': 'abcb3c61f1c3984ba9014d9ae197b726d23c1df844dc90988ecc4d8f0e349bfe',
    'references/publication_guidelines.md': 'd9f5d0f115872c4c190a11d83432d44635e38ef9f1740db471fcc70f4c91dd2c',
    'references/seaborn_for_publications.md': '2da2147ae8974b4b5d16096c1484b982d5d1e5f91113808ebfd12111a0a6597a',
    'scripts/figure_export.py': 'b22c7708afaf2a1cfa4f821eb9230d4262f1d52948af7f0815855aa9d0960403',
    'scripts/style_presets.py': 'e9d450bd4ab6b11303b02d5029177c8d49466cc597648d12de0ecdb7620f64c4',
    'tests/test_figure_export.py': 'b18414369e6721ad93d417914114d71af006248675eb20bb1f4989c48ec9a58e',
    'tests/test_style_presets.py': 'ff0e190196480848f1fea2398220038771f386ee7967a0ef122b0dfbca3aed46',
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
  throw new Error('usage: verify-canonical-corpus.mjs [--root <corpus-directory>]');
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

  const expectedManifestKeys = [
    'aggregate_sha256',
    'author',
    'byte_count',
    'file_count',
    'files',
    'license',
    'omitted_files',
    'schema_version',
    'source',
    'upstream_commit',
  ];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(expectedManifestKeys.sort())) {
    failures.push('manifest keys mismatch');
  }
  if (manifest.schema_version !== EXPECTED.schemaVersion) failures.push('schema_version mismatch');
  if (manifest.license !== EXPECTED.license) failures.push('license mismatch');
  if (manifest.author !== EXPECTED.author) failures.push('author mismatch');
  if (manifest.upstream_commit !== EXPECTED.upstreamCommit) failures.push('upstream_commit mismatch');
  if (JSON.stringify(manifest.omitted_files) !== JSON.stringify([EXPECTED.omittedFile])) failures.push('omitted_files mismatch');
  if (manifest.file_count !== EXPECTED.fileCount) failures.push(`file_count expected ${EXPECTED.fileCount}, got ${manifest.file_count}`);
  if (manifest.byte_count !== EXPECTED.byteCount) failures.push(`byte_count expected ${EXPECTED.byteCount}, got ${manifest.byte_count}`);
  if (manifest.aggregate_sha256 !== EXPECTED.aggregateSha256) failures.push('aggregate_sha256 mismatch');
  if (!Array.isArray(manifest.files) || manifest.files.length !== EXPECTED.fileCount) {
    failures.push(`manifest.files expected ${EXPECTED.fileCount} entries`);
  }

  const expectedPaths = Object.keys(EXPECTED.files).sort();
  const manifestPaths = Array.isArray(manifest.files)
    ? manifest.files.map((entry) => entry?.path).sort()
    : [];
  if (JSON.stringify(manifestPaths) !== JSON.stringify(expectedPaths)) failures.push('manifest file set mismatch');

  const actualPaths = [];
  for (const root of ['assets', 'evals', 'references', 'tests']) {
    const rootPath = join(skillRoot, root);
    if (!existsSync(rootPath)) {
      failures.push(`missing corpus directory: ${root}`);
      continue;
    }
    actualPaths.push(...listFiles(rootPath).map((file) => `${root}/${file}`));
  }
  const scriptRoot = join(skillRoot, 'scripts');
  if (existsSync(scriptRoot)) {
    actualPaths.push(...listFiles(scriptRoot)
      .filter((file) => file !== 'verify-canonical-corpus.mjs')
      .map((file) => `scripts/${file}`));
  } else {
    failures.push('missing corpus directory: scripts');
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
    console.log(`PASS canonical-scientific-corpus files=${EXPECTED.fileCount} bytes=${EXPECTED.byteCount} sha256=${EXPECTED.aggregateSha256}`);
  }
} catch (error) {
  console.error(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
