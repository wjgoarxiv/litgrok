#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const APPROVAL_STATES = new Set(['draft', 'approved', 'superseded', 'blocked']);

function fail(code, message) {
  process.stderr.write(`FAIL ${code}: ${message}\n`);
  process.exit(1);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonemptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function stringArray(value, allowEmpty = true) {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(nonemptyString);
}

function requireValue(condition, field) {
  if (!condition) fail('FIELD_INVALID', field);
}

const input = process.argv[2];
if (!input || process.argv.length !== 3) fail('USAGE', 'validate-plan.mjs <plan.json>');
const path = resolve(input);
if (!existsSync(path) || !statSync(path).isFile()) fail('PLAN_NOT_FOUND', path);

let plan;
try {
  plan = JSON.parse(readFileSync(path, 'utf8'));
} catch (error) {
  fail('JSON_INVALID', error.message);
}

requireValue(object(plan), 'plan must be an object');
requireValue(nonemptyString(plan.objective), 'objective');
requireValue(object(plan.scope), 'scope');
requireValue(stringArray(plan.scope.included, false), 'scope.included');
requireValue(stringArray(plan.scope.excluded), 'scope.excluded');
requireValue(stringArray(plan.constraints), 'constraints');
requireValue(object(plan.evidence), 'evidence');
requireValue(stringArray(plan.evidence.baseline, false), 'evidence.baseline');
requireValue(stringArray(plan.evidence.unknowns), 'evidence.unknowns');
requireValue(Array.isArray(plan.steps) && plan.steps.length > 0, 'steps');
requireValue(object(plan.verification), 'verification');
requireValue(stringArray(plan.verification.focused, false), 'verification.focused');
requireValue(stringArray(plan.verification.full, false), 'verification.full');
requireValue(stringArray(plan.verification.real_surface), 'verification.real_surface');
requireValue(APPROVAL_STATES.has(plan.approval_state), 'approval_state');

const steps = new Map();
for (const [index, step] of plan.steps.entries()) {
  requireValue(object(step), `steps[${index}]`);
  for (const field of ['id', 'outcome', 'method', 'rollback']) {
    requireValue(nonemptyString(step[field]), `steps[${index}].${field}`);
  }
  requireValue(stringArray(step.paths, false), `steps[${index}].paths`);
  requireValue(stringArray(step.dependencies), `steps[${index}].dependencies`);
  requireValue(stringArray(step.verification, false), `steps[${index}].verification`);
  if (steps.has(step.id)) fail('STEP_ID_DUPLICATE', step.id);
  steps.set(step.id, step);
}

for (const step of steps.values()) {
  for (const dependency of step.dependencies) {
    if (!steps.has(dependency)) fail('DEPENDENCY_UNKNOWN', `${step.id} -> ${dependency}`);
  }
}

const complete = new Set();
const active = [];
function visit(id) {
  if (complete.has(id)) return;
  const cycleStart = active.indexOf(id);
  if (cycleStart !== -1) fail('DEPENDENCY_CYCLE', [...active.slice(cycleStart), id].join(' -> '));
  active.push(id);
  for (const dependency of steps.get(id).dependencies) visit(dependency);
  active.pop();
  complete.add(id);
}
for (const id of steps.keys()) visit(id);

process.stdout.write(`PASS plan steps=${steps.size} approval_state=${plan.approval_state}\n`);
