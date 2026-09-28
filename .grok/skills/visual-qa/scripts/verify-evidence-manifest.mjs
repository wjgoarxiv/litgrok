#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const [manifestPath, ...extraArguments] = process.argv.slice(2);

function fail(code, detail) {
  process.stderr.write(`FAIL ${code}: ${detail}\n`);
  process.exit(1);
}

function nonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function requireString(record, field, context) {
  if (!nonemptyString(record?.[field])) fail('FIELD_MISSING', `${context} ${field}`);
}

function requireArray(record, field, context) {
  if (!Array.isArray(record?.[field])) fail('FIELD_INVALID', `${context} ${field} must be an array`);
}

if (!manifestPath || extraArguments.length > 0) {
  fail('USAGE', 'verify-evidence-manifest.mjs <manifest.json>');
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
} catch (error) {
  fail('MANIFEST_READ', error.message);
}
if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
  fail('MANIFEST_INVALID', 'top level must be an object');
}

requireString(manifest.artifact, 'id', 'artifact');
requireString(manifest.artifact, 'revision', 'artifact');
requireString(manifest, 'methodology', 'manifest');
requireArray(manifest, 'evidence', 'manifest');
requireArray(manifest, 'findings', 'manifest');
if (manifest.evidence.length === 0) fail('EVIDENCE_EMPTY', 'at least one evidence record is required');

const manifestDirectory = realpathSync(dirname(resolve(manifestPath)));
const evidenceIds = new Set();
const evidenceFields = [
  'id', 'target', 'dimensions', 'state', 'fixture', 'capture_method',
  'captured_at', 'path', 'criterion', 'observation',
];

for (const record of manifest.evidence) {
  const id = nonemptyString(record?.id) ? record.id.trim() : '<unknown>';
  for (const field of evidenceFields) requireString(record, field, `evidence ${id}`);
  requireArray(record, 'automated_checks', `evidence ${id}`);
  requireArray(record, 'visual_judgments', `evidence ${id}`);
  if (evidenceIds.has(id)) fail('EVIDENCE_ID_DUPLICATE', id);
  evidenceIds.add(id);

  if (Number.isNaN(Date.parse(record.captured_at))) fail('CAPTURE_TIME_INVALID', `${id} ${record.captured_at}`);
  if (isAbsolute(record.path)) fail('EVIDENCE_PATH_UNSAFE', `${id} ${record.path}`);
  const evidencePath = resolve(manifestDirectory, record.path);
  const lexicalRelative = relative(manifestDirectory, evidencePath);
  if (lexicalRelative === '..' || lexicalRelative.startsWith(`..${sep}`)) {
    fail('EVIDENCE_PATH_UNSAFE', `${id} ${record.path}`);
  }
  if (!existsSync(evidencePath) || !statSync(evidencePath).isFile()) {
    fail('EVIDENCE_FILE_MISSING', `${id} ${record.path}`);
  }
  const canonicalEvidencePath = realpathSync(evidencePath);
  const canonicalRelative = relative(manifestDirectory, canonicalEvidencePath);
  if (canonicalRelative === '..' || canonicalRelative.startsWith(`..${sep}`)) {
    fail('EVIDENCE_PATH_UNSAFE', `${id} ${record.path}`);
  }
}

const findingFields = ['id', 'severity', 'state', 'evidence_id', 'observation', 'criterion', 'impact', 'remedy', 'retest'];
const findingIds = new Set();
for (const finding of manifest.findings) {
  const id = nonemptyString(finding?.id) ? finding.id.trim() : '<unknown>';
  for (const field of findingFields) requireString(finding, field, `finding ${id}`);
  if (findingIds.has(id)) fail('FINDING_ID_DUPLICATE', id);
  findingIds.add(id);
  if (!evidenceIds.has(finding.evidence_id)) fail('FINDING_EVIDENCE_UNKNOWN', `${id} ${finding.evidence_id}`);
}

const verdicts = new Set(['pass', 'conditional pass', 'fail', 'blocked']);
if (!verdicts.has(manifest.verdict)) fail('VERDICT_INVALID', String(manifest.verdict));

process.stdout.write(`PASS evidence=${manifest.evidence.length} findings=${manifest.findings.length} verdict=${manifest.verdict}\n`);
