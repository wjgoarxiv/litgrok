// Append-only record of the notices this package printed itself, one JSON line per text: `{ schema, hash, at }`.
// The text is never stored, only a short hash of its normalised form. A caller asks whether a text was already shown
// and records it when it shows it, so a sentence the user has read once is not printed again in a later session.
//
// Any trouble degrades to printing, as before the record existed: a missing, damaged, oversized, symlinked or
// unwritable file reads as "not shown yet", and a damaged line is skipped without hiding the lines around it.

import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { ignoreStateDirectory } from './record-passive-event.mjs';

export const NOTICE_SCHEMA = 'litgrok.notice/v1';
export const NOTICE_FILE = 'notices.jsonl';
const MAX_RECORD_BYTES = 64 * 1024;
const HASH_PATTERN = /^[0-9a-f]{16}$/u;
const noFollow = constants.O_NOFOLLOW ?? 0;

export function noticeHash(text) {
  return createHash('sha256').update(text.replace(/\s+/gu, ' ').trim().toLowerCase()).digest('hex').slice(0, 16);
}

function realDirectory(path, { create = false } = {}) {
  let status = lstatSync(path, { throwIfNoEntry: false });
  if (status === undefined && create) {
    mkdirSync(path, { mode: 0o700 });
    status = lstatSync(path);
  }
  return status !== undefined && status.isDirectory() && !status.isSymbolicLink();
}

// Returns the hashes already recorded, or null when the file cannot be trusted at all.
function readHashes(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | noFollow);
  } catch (error) {
    return error?.code === 'ENOENT' ? { hashes: new Set(), endsInNewline: true } : null;
  }
  try {
    const status = fstatSync(descriptor);
    if (!status.isFile() || status.size > MAX_RECORD_BYTES) return null;
    const buffer = Buffer.alloc(status.size);
    const text = buffer.subarray(0, readSync(descriptor, buffer, 0, status.size, 0)).toString('utf8');
    const hashes = new Set();
    for (const line of text.split(/\r?\n/u)) {
      try {
        const record = JSON.parse(line);
        if (record?.schema === NOTICE_SCHEMA && HASH_PATTERN.test(record.hash)) hashes.add(record.hash);
      } catch {
        // A damaged or blank line is skipped.
      }
    }
    return { hashes, endsInNewline: text.length === 0 || text.endsWith('\n') };
  } catch {
    return null;
  } finally {
    closeSync(descriptor);
  }
}

function recordFile(stateRoot) {
  const grok = join(stateRoot, '.grok');
  const product = join(grok, 'litgrok');
  if (!realDirectory(grok, { create: true }) || !realDirectory(product, { create: true })) return null;
  ignoreStateDirectory(product);
  return join(product, NOTICE_FILE);
}

/**
 * True when `text` was already recorded as shown for this project. A false answer also covers every failure.
 * Reading never creates anything.
 */
export function noticeShown(stateRoot, text) {
  try {
    const product = join(stateRoot, '.grok', 'litgrok');
    if (!realDirectory(join(stateRoot, '.grok')) || !realDirectory(product)) return false;
    return readHashes(join(product, NOTICE_FILE))?.hashes.has(noticeHash(text)) ?? false;
  } catch {
    return false;
  }
}

/** Appends one record for `text`. Returns false when the record could not be written; the caller prints anyway. */
export function recordNotice(stateRoot, text, now = new Date()) {
  try {
    const path = recordFile(stateRoot);
    if (path === null) return false;
    const existing = readHashes(path);
    if (existing === null) return false;
    const line = `${JSON.stringify({ schema: NOTICE_SCHEMA, hash: noticeHash(text), at: now.toISOString() })}\n`;
    const descriptor = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | noFollow, 0o600);
    try {
      writeSync(descriptor, `${existing.endsInNewline ? '' : '\n'}${line}`);
    } finally {
      closeSync(descriptor);
    }
    return true;
  } catch {
    return false;
  }
}
