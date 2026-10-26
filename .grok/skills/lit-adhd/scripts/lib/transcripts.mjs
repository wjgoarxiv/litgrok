// Grok Build session records for the lit-adhd collector. Grok keeps one directory per session
// under `<store>/sessions/<url-encoded cwd>/<session-uuid>/` with `summary.json` (title, times),
// `chat_history.jsonl` (`{type, content}` records), `events.jsonl` (`{ts, type}` tool events) and
// `prompt_context.json`. The format is private and may move, so every field is read defensively and
// anything missing reads as unknown. Session files are read head and tail only, under a budget
// shared by the whole run, through descriptors opened without following links. Only the session's
// own project folder is ever listed: the store is never scanned blindly.

import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const HEAD_BYTES = 64 * 1024;
export const TAIL_BYTES = 256 * 1024;
export const TOTAL_BUDGET_BYTES = 8 * 1024 * 1024;
const ACTIVE_MS = 15 * 60 * 1000;

/** A byte budget shared by every read of one collector run. */
export const makeBudget = (limit = TOTAL_BUDGET_BYTES) => ({ limit, used: 0, exhausted: false });

const readSlice = (fd, position, length, budget) => {
  const allowed = Math.min(length, budget.limit - budget.used);
  if (allowed <= 0) {
    budget.exhausted = true;
    return "";
  }
  const buffer = Buffer.alloc(allowed);
  const read = readSync(fd, buffer, 0, allowed, position);
  budget.used += read;
  if (allowed < length) budget.exhausted = true;
  return buffer.subarray(0, read).toString("utf8");
};

/** The parsed lines of a JSONL file's head and tail; a link or a non-file reads as null. */
export const readJsonlHeadTail = (path, budget, { head = HEAD_BYTES, tail = TAIL_BYTES } = {}) => {
  let fd;
  try {
    if (!lstatSync(path).isFile()) return null;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const { size } = fstatSync(fd);
    const chunks = size <= head + tail
      ? [readSlice(fd, 0, size, budget)]
      : [readSlice(fd, 0, head, budget), readSlice(fd, size - tail, tail, budget)];
    const lines = [];
    for (const chunk of chunks) {
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === "object") lines.push(parsed);
        } catch {
          // A line cut at a slice edge, or a malformed one, is skipped.
        }
      }
    }
    return lines;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

const readJsonFile = (path, budget) => {
  let fd;
  try {
    if (!lstatSync(path).isFile()) return null;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const { size } = fstatSync(fd);
    const text = readSlice(fd, 0, Math.min(size, 65536), budget);
    return JSON.parse(text);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

const newestFirst = (paths) => paths
  .map((path) => {
    try {
      return { path, mtimeMs: lstatSync(path).mtimeMs };
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => b.mtimeMs - a.mtimeMs);

// The store encodes the cwd with encodeURIComponent; decoding recovers it for comparison. A name
// that does not decode is never matched, so an unrelated folder cannot leak in.
const decodeStoreName = (name) => {
  try {
    return decodeURIComponent(name);
  } catch {
    return null;
  }
};

/**
 * The session directories of every given worktree path, newest first, and whether the store was
 * there at all. Each worktree path matches the decoded store folder name exactly.
 */
export const findSessions = (storeDir, paths) => {
  let folders;
  try {
    if (!lstatSync(storeDir).isDirectory()) return { status: "unknown", dirs: [] };
    folders = readdirSync(storeDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  } catch {
    return { status: "unknown", dirs: [] };
  }
  // The store encodes the cwd as the host gave it, which may run through a symlink (/tmp on
  // macOS is /private/tmp): canonicalize both sides with realpath before comparing.
  const canonical = (path) => {
    try {
      return realpathSync(path).normalize("NFC");
    } catch {
      return resolve(path).normalize("NFC");
    }
  };
  const wanted = new Set(paths.map(canonical));
  const dirs = new Set();
  for (const folder of folders) {
    const decoded = decodeStoreName(folder.name);
    if (decoded === null) continue;
    // A name that does not decode is never matched, so an unrelated folder cannot leak in.
    if (!wanted.has(canonical(decoded))) continue;
    let sessions;
    try {
      sessions = readdirSync(join(storeDir, folder.name), { withFileTypes: true }).filter((entry) => entry.isDirectory());
    } catch {
      continue;
    }
    for (const session of sessions) dirs.add(join(storeDir, folder.name, session.name));
  }
  return { status: "ok", dirs: newestFirst([...dirs]).map(({ path }) => path) };
};

const textOf = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
};
const clip = (text, max) => {
  const flat = String(text).replace(/\s+/gu, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const WAITING_TEXT = /[?？]\s*$|`?lit approve`?|`?lit deny`?|승인해\s*주|확인해\s*주|괜찮을까요|할까요|어떻게 할까요/iu;

/**
 * One session's record from its store files: what it was asked, what it did, what it said last,
 * and where it stands. `redact` runs over every text field it returns.
 */
export const sessionRecord = (dir, { redact = (text) => text, now = Date.now(), budget = makeBudget() } = {}) => {
  const summary = readJsonFile(join(dir, "summary.json"), budget);
  const history = readJsonlHeadTail(join(dir, "chat_history.jsonl"), budget) ?? [];
  const events = readJsonlHeadTail(join(dir, "events.jsonl"), budget) ?? [];
  const sessionId = typeof summary?.info?.id === "string" ? summary.info.id : dir.split("/").at(-1) ?? null;
  if (!sessionId) return null;
  const cwd = typeof summary?.info?.cwd === "string" ? summary.info.cwd : "unknown";
  const branch = typeof summary?.info?.git_branch === "string" && summary.info.git_branch ? summary.info.git_branch : "unknown";
  const started = Date.parse(summary?.info?.created_at) || Date.parse(summary?.created_at);
  const lastSummary = Date.parse(summary?.info?.updated_at) || Date.parse(summary?.updated_at);
  let last = Number.isFinite(lastSummary) ? lastSummary : null;
  let lastEntry = null;
  const prompts = [];
  const tools = {};
  const files = [];
  let result = null;
  let lastAction = null;
  for (const line of history) {
    if (typeof line.ts === "string" || typeof line.timestamp === "string") {
      const at = Date.parse(line.ts ?? line.timestamp);
      if (Number.isFinite(at)) last = last === null ? at : Math.max(last, at);
    }
    if (line.type === "user" && typeof line.content === "string" && line.content.trim()) {
      const text = line.content.trim();
      if (!text.startsWith("<") || !/^<(?:system-reminder|command-|local-command)/u.test(text)) {
        prompts.push(text);
        lastEntry = { role: "user", text };
      }
    } else if (line.type === "user" && line.content !== undefined) {
      const text = textOf(line.content).trim();
      if (text) {
        prompts.push(text);
        lastEntry = { role: "user", text };
      }
    }
    if (line.type === "assistant" && typeof line.content === "string" && line.content.trim()) {
      result = line.content.trim();
      lastEntry = { role: "assistant", text: result };
    } else if (line.type === "assistant" && line.content !== undefined) {
      const text = textOf(line.content).trim();
      if (text) {
        result = text;
        lastEntry = { role: "assistant", text };
      }
    }
  }
  for (const event of events) {
    const at = Date.parse(event.ts);
    if (Number.isFinite(at)) last = last === null ? at : Math.max(last, at);
    const name = typeof event.tool === "string" ? event.tool : typeof event.type === "string" && event.type.startsWith("tool:") ? event.type.slice(5) : null;
    if (name) {
      tools[name] = (tools[name] ?? 0) + 1;
      const target = typeof event.target === "string" ? event.target : typeof event.file === "string" ? event.file.split("/").at(-1) : null;
      lastAction = { tool: name, ...(target ? { target } : {}) };
      if (lastEntry?.role !== "assistant" || !result) lastEntry = { role: "tool" };
    }
  }
  const title = summary?.session_summary ?? summary?.info?.title ?? prompts[0] ?? "unknown";
  const changed = [...new Set(files.reverse())].slice(0, 5).map((path) => redact(path));
  const asked = [...new Set([prompts[0], prompts.at(-1)].filter(Boolean))].slice(0, 2).map((text) => clip(redact(text), 160));
  const waiting = lastEntry?.role === "assistant" && WAITING_TEXT.test(lastEntry.text.slice(-400));
  const status = last === null ? "unknown" : waiting ? "waiting-on-user" : now - last < ACTIVE_MS ? "active" : "ended";
  return {
    sessionId,
    id8: sessionId.slice(0, 8),
    worktree: cwd !== "unknown" ? redact(cwd) : "unknown",
    cwd,
    branch: redact(branch),
    started: Number.isFinite(started) ? new Date(started).toISOString() : "unknown",
    last: last === null ? "unknown" : new Date(last).toISOString(),
    lastMs: last,
    title: clip(redact(title ?? "unknown"), 80),
    asked: asked.length ? asked : ["unknown"],
    done: { tools, files: changed, commits: [] },
    lastAction: lastAction ? { tool: lastAction.tool, ...(lastAction.target ? { target: clip(redact(lastAction.target), 60) } : {}) } : null,
    result: result ? clip(redact(result), 240) : "unknown",
    status,
    ...(waiting ? { waitingReason: "asked the user" } : {}),
  };
};
