// The SessionStart nudge toward lit-adhd: when this project has other recent Grok Build sessions,
// suggest `lit adhd` once a day, naming the one to answer, resume or check on. It stats file times,
// never reads contents, so it stays cheap on every session start. A marker under
// `.grok/litgrok/adhd/` keeps it to one nudge per calendar day per project. The marker path is
// walked with lstat and refuses symlinks, and the marker itself is opened with O_NOFOLLOW, so a
// planted link can neither redirect the write nor leak another file's contents into the read.
import { closeSync, constants, lstatSync, mkdirSync, openSync, readSync, readdirSync, writeSync } from "node:fs";
import { join } from "node:path";
import { ensureStateDirIgnored } from "./project-state-root.mjs";

export const RECENT_MS = 3 * 24 * 60 * 60 * 1000;
const SCAN_LIMIT = 400;

const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

const storeDirs = (storeDir) => {
  try {
    return readdirSync(storeDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).slice(0, SCAN_LIMIT);
  } catch {
    return [];
  }
};

// Session folders of this project: the store folder whose decoded name is the project root.
export const recentOtherSessions = (storeDir, projectRoot, sessionId, now = Date.now()) => {
  const wanted = projectRoot.normalize("NFC");
  let count = 0;
  for (const folder of storeDirs(storeDir)) {
    let decoded;
    try {
      decoded = decodeURIComponent(folder.name).normalize("NFC");
    } catch {
      continue;
    }
    if (decoded !== wanted) continue;
    let sessions;
    try {
      sessions = readdirSync(join(storeDir, folder.name), { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      continue;
    }
    for (const session of sessions.slice(0, SCAN_LIMIT)) {
      if (session.name === sessionId) continue;
      try {
        const at = lstatSync(join(storeDir, folder.name, session.name));
        if (at.isDirectory() && now - at.mtimeMs < RECENT_MS) count += 1;
      } catch {
        // A session that vanished mid-scan is not recent.
      }
    }
  }
  return count;
};

/**
 * The one-line suggestion, or null when there is nothing to suggest or it was already made today.
 * Making it records today's date in `.grok/litgrok/adhd/suggested.json`.
 */
// Every part of the marker directory must already be a real directory: a symlink anywhere on
// the path refuses the write, and the marker itself is never followed, read or written.
const markerDir = (stateRoot) => {
  const parts = [stateRoot, ".grok", "litgrok", "adhd"];
  let cursor = parts[0];
  for (const part of parts.slice(1)) {
    cursor = join(cursor, part);
    let status;
    try {
      status = lstatSync(cursor);
    } catch (error) {
      if (error?.code !== "ENOENT") return null;
      try {
        mkdirSync(cursor);
      } catch {
        return null;
      }
      continue;
    }
    if (!status.isDirectory() || status.isSymbolicLink()) return null;
  }
  // State stays uncommitted, but the ignore marker lives beside the state, never beside the
  // committed skills, rules and hooks one level up.
  ensureStateDirIgnored(cursor);
  return cursor;
};

const noFollow = constants.O_NOFOLLOW ?? 0;

const readMarker = (marker) => {
  let descriptor;
  try {
    descriptor = openSync(marker, constants.O_RDONLY | noFollow);
  } catch {
    return null;
  }
  try {
    const status = lstatSync(marker);
    if (!status.isFile() || status.isSymbolicLink() || status.size > 1024) return null;
    const buffer = Buffer.alloc(status.size);
    const read = readSync(descriptor, buffer, 0, status.size, 0);
    return JSON.parse(buffer.subarray(0, read).toString("utf8"));
  } catch {
    return null;
  } finally {
    closeSync(descriptor);
  }
};

const writeMarker = (marker, day) => {
  let descriptor;
  try {
    descriptor = openSync(marker, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow, 0o600);
  } catch {
    return false;
  }
  try {
    writeSync(descriptor, `${JSON.stringify({ day })}\n`);
    return true;
  } catch {
    return false;
  } finally {
    closeSync(descriptor);
  }
};

export const adhdSuggestion = ({ storeDir, projectRoot, sessionId, stateRoot, now = Date.now() }) => {
  const count = recentOtherSessions(storeDir, projectRoot, sessionId, now);
  if (count === 0) return null;
  const directory = markerDir(stateRoot);
  if (directory === null) return null;
  const marker = join(directory, "suggested.json");
  try {
    if (readMarker(marker)?.day === dayOf(now)) return null;
  } catch {
    // An unreadable marker suggests once, then the write below records it.
  }
  if (!writeMarker(marker, dayOf(now))) return null;
  return count === 1
    ? "One other recent session is on record: type `lit adhd` for the brief before you resume it."
    : `${count} other recent sessions are on record: type ` + "`lit adhd`" + " for the one-screen brief before you resume any.";
};
