#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REQUIRED_LANES = ['behavior', 'test', 'safety', 'integration', 'documentation', 'regression'];
const [packetPath, ...extraArguments] = process.argv.slice(2);

function fail(code, detail) {
  process.stderr.write(`FAIL ${code}: ${detail}\n`);
  process.exit(1);
}

function nonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

if (!packetPath || extraArguments.length > 0) fail('USAGE', 'check-lanes.mjs <review.json>');

let packet;
try {
  packet = JSON.parse(readFileSync(resolve(packetPath), 'utf8'));
} catch (error) {
  fail('PACKET_READ', error.message);
}
if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
  fail('PACKET_INVALID', 'top level must be an object');
}

if (!nonemptyString(packet.objective)) fail('FIELD_MISSING', 'objective');
if (!Array.isArray(packet.scope) || packet.scope.length === 0 || !packet.scope.every(nonemptyString)) {
  fail('FIELD_INVALID', 'scope must be a nonempty string array');
}
if (!packet.lanes || typeof packet.lanes !== 'object' || Array.isArray(packet.lanes)) {
  fail('FIELD_INVALID', 'lanes must be an object');
}

for (const lane of REQUIRED_LANES) {
  if (!Object.hasOwn(packet.lanes, lane)) fail('LANE_MISSING', lane);
}
for (const lane of Object.keys(packet.lanes)) {
  if (!REQUIRED_LANES.includes(lane)) fail('LANE_UNKNOWN', lane);
}

const verdicts = new Set(['PASS', 'FAIL', 'INCONCLUSIVE']);
const confidences = new Set(['HIGH', 'MEDIUM', 'LOW']);
let findingCount = 0;

for (const lane of REQUIRED_LANES) {
  const record = packet.lanes[lane];
  if (!record || typeof record !== 'object' || Array.isArray(record)) fail('LANE_INVALID', lane);
  if (!verdicts.has(record.verdict)) fail('LANE_VERDICT_INVALID', `${lane} ${String(record.verdict)}`);
  if (!confidences.has(record.confidence)) fail('LANE_CONFIDENCE_INVALID', `${lane} ${String(record.confidence)}`);
  if (!nonemptyString(record.summary)) fail('LANE_SUMMARY_MISSING', lane);
  if (!Array.isArray(record.evidence) || record.evidence.length === 0 || !record.evidence.every(nonemptyString)) {
    fail('LANE_EVIDENCE_MISSING', lane);
  }
  if (!Array.isArray(record.findings)) fail('LANE_FINDINGS_INVALID', lane);
  if (!Array.isArray(record.limitations)) fail('LANE_LIMITATIONS_INVALID', lane);
  findingCount += record.findings.length;
}

process.stdout.write(`PASS lanes=${REQUIRED_LANES.length} findings=${findingCount}\n`);
