// Liveness: one small record per session under `.grok/litgrok/liveness/<key>.json`, so the status line
// and lit-adhd can tell a session that is working (`alive`, from PostToolUse and its failure hook)
// from one waiting at a turn end (`idle`, from Stop) and one that is gone (`ended`, from SessionEnd).
// A session that dies without SessionEnd leaves its last record behind; a reader treats a record older
// than fifteen minutes as ended. The herdr pane id is kept only when it is a plain short token.

import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const LIVENESS_REPEAT_MS = 30 * 1000;
export const LIVENESS_STALE_MS = 15 * 60 * 1000;
const LIVENESS_STATES = new Set(['alive', 'idle', 'ended']);
const MAX_RECORD_BYTES = 4096;
const PANE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

function livenessError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

// `.grok/litgrok/session-ledger/<key>.jsonl` -> `.grok/litgrok/liveness/<key>.json`.
export function livenessPath(ledgerFile) {
  return join(dirname(dirname(ledgerFile)), 'liveness', basename(ledgerFile).replace(/\.jsonl$/u, '.json'));
}

function ensureLivenessDirectory(path) {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const status = lstatSync(path);
  if (!status.isDirectory() || status.isSymbolicLink()) throw livenessError('LIVENESS_DIRECTORY_UNSAFE');
}

export function paneIdFrom(env) {
  const value = env?.HERDR_PANE_ID;
  return typeof value === 'string' && PANE_ID.test(value) ? value : null;
}

function validRecord(record) {
  return record !== null && typeof record === 'object' && !Array.isArray(record)
    && typeof record.sessionId === 'string' && record.sessionId.length > 0 && record.sessionId.length <= 512
    && typeof record.cwd === 'string'
    && LIVENESS_STATES.has(record.state)
    && (record.pane === null || (typeof record.pane === 'string' && PANE_ID.test(record.pane)))
    && typeof record.at === 'string' && Number.isFinite(Date.parse(record.at));
}

function readRaw(path) {
  try {
    const status = lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size > MAX_RECORD_BYTES) return null;
    const record = JSON.parse(readFileSync(path, 'utf8'));
    return validRecord(record) ? record : null;
  } catch {
    return null;
  }
}

/** The record at `path`, with `state: 'ended'` once it is older than fifteen minutes, or null. */
export function readLiveness(path, now = Date.now()) {
  const record = readRaw(path);
  if (record === null) return null;
  return now - Date.parse(record.at) > LIVENESS_STALE_MS ? { ...record, state: 'ended' } : record;
}

/**
 * Writes this session's state. Returns `'unchanged'` when the same state and pane were written less
 * than thirty seconds ago, `'written'` otherwise. Refuses a target that is not a regular file.
 */
export function writeLiveness({ ledgerFile, sessionId, cwd, state, env = process.env, now = Date.now() }) {
  if (!LIVENESS_STATES.has(state)) throw livenessError('LIVENESS_STATE_INVALID');
  const target = livenessPath(ledgerFile);
  ensureLivenessDirectory(dirname(target));
  try {
    const existing = lstatSync(target);
    if (!existing.isFile() || existing.isSymbolicLink()) throw livenessError('LIVENESS_RECORD_UNSAFE');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const record = { sessionId, cwd, state, pane: paneIdFrom(env), at: new Date(now).toISOString() };
  if (!validRecord(record)) throw livenessError('LIVENESS_RECORD_INVALID');
  const previous = readRaw(target);
  if (previous && previous.state === state && previous.pane === record.pane && now - Date.parse(previous.at) < LIVENESS_REPEAT_MS) {
    return 'unchanged';
  }
  const temporary = join(dirname(target), `.liveness-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, target);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return 'written';
}
