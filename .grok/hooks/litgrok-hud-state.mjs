import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_RECORD_BYTES = 8192;
const HOOK_PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function hudError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function inside(path, parent) {
  const part = relative(parent, path);
  return part === '' || (part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}

function canonicalFuturePath(path) {
  let cursor = resolve(path);
  const missing = [];
  for (;;) {
    try {
      const status = lstatSync(cursor);
      if (status.isSymbolicLink()) return resolve(realpathSync(cursor), ...missing);
      if (!status.isDirectory()) throw hudError('HUD_STATE_ROOT_UNSAFE');
      return resolve(realpathSync(cursor), ...missing);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = dirname(cursor);
      if (parent === cursor) throw hudError('HUD_STATE_ROOT_UNSAFE');
      missing.unshift(basename(cursor));
      cursor = parent;
    }
  }
}

function stateRootPath(env, protectedPaths, create) {
  const requested = env.LITGROK_HUD_STATE_ROOT || join(env.TMPDIR || tmpdir(), 'litgrok-hud');
  const path = resolve(requested);
  const protectedRoots = [env.HOME || env.USERPROFILE || homedir(), HOOK_PACKAGE_ROOT, ...protectedPaths]
    .filter((item) => typeof item === 'string' && item.length > 0)
    .map((item) => canonicalFuturePath(item));
  const planned = canonicalFuturePath(path);
  if (protectedRoots.some((protectedRoot) => inside(planned, protectedRoot))) throw hudError('HUD_STATE_ROOT_UNSAFE');

  if (create) mkdirSync(path, { recursive: true, mode: 0o700 });
  let status;
  try {
    status = lstatSync(path);
  } catch (error) {
    if (!create && error?.code === 'ENOENT') return null;
    throw error;
  }
  if (!status.isDirectory() || status.isSymbolicLink() || (status.mode & 0o077) !== 0) {
    throw hudError('HUD_STATE_ROOT_UNSAFE');
  }
  const canonical = realpathSync(path);
  if (protectedRoots.some((protectedRoot) => inside(canonical, protectedRoot))) throw hudError('HUD_STATE_ROOT_UNSAFE');
  return canonical;
}

function keyFor(kind, value) {
  return `${kind}-${createHash('sha256').update(value).digest('hex').slice(0, 32)}.json`;
}

function writeRecord(root, key, record) {
  const target = join(root, key);
  try {
    const existing = lstatSync(target);
    if (!existing.isFile() || existing.isSymbolicLink()) throw hudError('HUD_RECORD_UNSAFE');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const content = `${JSON.stringify(record)}\n`;
  if (Buffer.byteLength(content) > MAX_RECORD_BYTES) throw hudError('HUD_RECORD_TOO_LARGE');
  const temporary = join(root, `.litgrok-hud-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, content, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, target);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function validRecord(record, cwd) {
  return record !== null && typeof record === 'object' && !Array.isArray(record)
    && record.cwd === cwd
    && (record.sessionId === null || (typeof record.sessionId === 'string' && record.sessionId.length <= 512))
    && (record.discipline === null || (typeof record.discipline === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/iu.test(record.discipline)))
    && typeof record.at === 'string' && Number.isFinite(Date.parse(record.at));
}

export function writeHudRecords({ env = process.env, sessionId, cwd, workspaceRoot, discipline }) {
  if (!isAbsolute(cwd) || typeof workspaceRoot !== 'string' || !isAbsolute(workspaceRoot)) throw hudError('HUD_RECORD_PATH_INVALID');
  const record = { sessionId: sessionId ?? null, cwd, discipline: discipline ?? null, at: new Date().toISOString() };
  if (record.sessionId !== null && (typeof record.sessionId !== 'string' || record.sessionId.length > 512)) throw hudError('HUD_SESSION_ID_INVALID');
  if (record.discipline !== null && (typeof record.discipline !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/iu.test(record.discipline))) throw hudError('HUD_DISCIPLINE_INVALID');
  const root = stateRootPath(env, [workspaceRoot, cwd], true);

  const primaryKind = record.sessionId === null ? 'workspace' : 'session';
  const primaryValue = record.sessionId ?? workspaceRoot;
  writeRecord(root, keyFor(primaryKind, primaryValue), record);
  writeRecord(root, keyFor('cwd', cwd), record);
}

export function readHudRecordForCwd(cwd, env = process.env) {
  if (typeof cwd !== 'string' || !isAbsolute(cwd) || cwd.includes('\0')) return null;
  const root = stateRootPath(env, [cwd], false);
  if (!root) return null;
  const path = join(root, keyFor('cwd', cwd));
  try {
    const status = lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size > MAX_RECORD_BYTES) return null;
    const record = JSON.parse(readFileSync(path, 'utf8'));
    return validRecord(record, cwd) ? record : null;
  } catch {
    return null;
  }
}

const CONTEXT_FRESH_MS = 10 * 60 * 1000;
const CONTEXT_NEWEST_MS = 24 * 60 * 60 * 1000;

function validContextRecord(record) {
  return record !== null && typeof record === 'object' && !Array.isArray(record)
    && typeof record.sessionId === 'string' && record.sessionId.length > 0 && record.sessionId.length <= 512
    && typeof record.usedPercentage === 'number' && record.usedPercentage >= 0 && record.usedPercentage <= 100
    && (record.autoCompactThresholdPercent === null
      || (typeof record.autoCompactThresholdPercent === 'number' && record.autoCompactThresholdPercent >= 1 && record.autoCompactThresholdPercent <= 100))
    && typeof record.at === 'string' && Number.isFinite(Date.parse(record.at));
}

function readContextFile(path) {
  try {
    const status = lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size > MAX_RECORD_BYTES) return null;
    const record = JSON.parse(readFileSync(path, 'utf8'));
    return validContextRecord(record) ? record : null;
  } catch {
    return null;
  }
}

// The status line is the only place Grok reports how full the context is. It keeps the latest figure
// here, keyed by session id, because that id is the one thing the status line and the hooks both receive.
export function writeContextRecord({ env = process.env, sessionId, cwd, usedPercentage, autoCompactThresholdPercent = null, now = new Date() }) {
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 512) throw hudError('HUD_SESSION_ID_INVALID');
  if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw hudError('HUD_RECORD_PATH_INVALID');
  const threshold = typeof autoCompactThresholdPercent === 'number' && autoCompactThresholdPercent >= 1 && autoCompactThresholdPercent <= 100
    ? autoCompactThresholdPercent
    : null;
  const record = { sessionId, usedPercentage, autoCompactThresholdPercent: threshold, at: now.toISOString() };
  if (!validContextRecord(record)) throw hudError('HUD_CONTEXT_INVALID');
  writeRecord(stateRootPath(env, [cwd], true), keyFor('context', sessionId), record);
}

// Returns this session's record, or null when it is missing, belongs to another session or is older than ten minutes.
export function readContextRecord(sessionId, env = process.env, now = new Date()) {
  if (typeof sessionId !== 'string' || sessionId.length === 0 || sessionId.length > 512) return null;
  try {
    const root = stateRootPath(env, [], false);
    if (!root) return null;
    const record = readContextFile(join(root, keyFor('context', sessionId)));
    if (!record || record.sessionId !== sessionId) return null;
    const age = now.getTime() - Date.parse(record.at);
    return age <= CONTEXT_FRESH_MS ? record : null;
  } catch {
    return null;
  }
}

// Returns the most recent record of any session from the last day, used only to show Grok's own compaction point.
export function readNewestContextRecord(env = process.env, now = new Date()) {
  try {
    const root = stateRootPath(env, [], false);
    if (!root) return null;
    let newest = null;
    for (const name of readdirSync(root)) {
      if (!/^context-[0-9a-f]{32}\.json$/u.test(name)) continue;
      const record = readContextFile(join(root, name));
      if (!record || now.getTime() - Date.parse(record.at) > CONTEXT_NEWEST_MS) continue;
      if (newest === null || Date.parse(record.at) > Date.parse(newest.at)) newest = record;
    }
    return newest;
  } catch {
    return null;
  }
}
