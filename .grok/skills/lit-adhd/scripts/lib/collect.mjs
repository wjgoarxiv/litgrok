// The lit-adhd record collector behind `node scripts/rewind.mjs`. It reads what is on disk for
// every worktree of this repo (plan rows, handoff headings and `## Next`, Grok Build session records
// with LitGrok's liveness records, git log, and herdr when HERDR_ENV=1) and returns one redacted,
// capped JSON brief. A source that is not
// there reads `unknown`; nothing is inferred. It writes nothing: `go` re-collects the brief and
// continues the offered step. There is no litgoal ledger, workflow stack or start-work state file
// in Grok Build, so those sources stay `unknown` and the next step degrades to plans.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import { parsePlanTaskRows } from "./plan-task-rows.mjs";
import { resolveProjectStateRoot } from "./project-state-root.mjs";
import { renderBrief } from "./brief.mjs";
import { aggregateProgress, clipToWidth, displayWidth, progressOf } from "./gauge.mjs";
import { chooseNextStep } from "./next-step.mjs";
import { makeRedactor } from "./redact.mjs";
import { findSessions, makeBudget, readJsonlHeadTail, sessionRecord } from "./transcripts.mjs";

const SMALL_FILE_BYTES = 1024 * 1024;
const HERDR_TIMEOUT_MS = 2000;
const GIT_TIMEOUT_MS = 5000;
const DEFAULT_SINCE = "7d";
const DEFAULT_MAX = 12;
const NAME_MAX = 90;
const PLAN_LIMIT = 8;

/** `7d`, `12h`, `30m` in milliseconds, or null. */
export const parseSince = (text) => {
  const match = /^(\d{1,4})([dhm])$/u.exec(String(text ?? ""));
  if (!match) return null;
  return Number(match[1]) * { d: 86_400_000, h: 3_600_000, m: 60_000 }[match[2]];
};

const readSmallFile = (path, budget) => {
  let fd;
  try {
    if (!lstatSync(path).isFile()) return null;
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const { size } = fstatSync(fd);
    const length = Math.min(size, SMALL_FILE_BYTES, budget.limit - budget.used);
    if (length < size) budget.exhausted = budget.exhausted || length < Math.min(size, SMALL_FILE_BYTES);
    const buffer = Buffer.alloc(Math.max(0, length));
    const read = length > 0 ? readSync(fd, buffer, 0, length, 0) : 0;
    budget.used += read;
    return buffer.subarray(0, read).toString("utf8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};
const entries = (directory) => {
  try {
    return readdirSync(directory, { withFileTypes: true });
  } catch {
    return null;
  }
};

const defaultExec = (file, args, options) => execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...options });

const worktreesOf = (cwd, exec) => {
  try {
    const out = exec("git", ["worktree", "list", "--porcelain"], { cwd, timeout: GIT_TIMEOUT_MS });
    const paths = out.split("\n").filter((line) => line.startsWith("worktree ")).map((line) => line.slice(9).trim()).filter(Boolean);
    return paths.length ? paths : null;
  } catch {
    return null;
  }
};

// A plan scaffold nobody filled in: a row that is still a `<placeholder>`, or every row the same.
const isTemplate = (rows) => rows.some((row) => /<[^<>]{1,40}>/u.test(row.text)) || (rows.length > 1 && new Set(rows.map((row) => row.text.trim())).size === 1);
const mtimeOf = (path) => {
  try {
    return lstatSync(path).mtimeMs;
  } catch {
    return null;
  }
};

// Every plan changed inside the window, open or finished; a finished one has no current item. A plan
// outside the window is never read, and one the read budget cannot cover is not read either: both are
// counted in `skipped` so the brief can say so.
const plansIn = (root, budget, redact, local, sinceMs, now) => {
  const list = entries(join(root, "plans"));
  if (!list) return null;
  let skipped = 0;
  const plans = list.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const path = join(root, "plans", entry.name);
    const changedMs = mtimeOf(path);
    if (changedMs === null || now - changedMs > sinceMs || budget.used >= budget.limit) {
      skipped += 1;
      if (changedMs !== null && now - changedMs <= sinceMs) budget.exhausted = true;
      return [];
    }
    const text = readSmallFile(path, budget);
    if (text === null) return [];
    const rows = parsePlanTaskRows(text);
    if (!rows.length || isTemplate(rows)) return [];
    const open = rows.filter((row) => !row.checked);
    const done = rows.length - open.length;
    return [{
      worktree: redact(root),
      plan: `plans/${entry.name}`,
      local,
      changedMs,
      complete: open.length === 0,
      rows: rows.map((row) => ({ checked: row.checked, title: clipToWidth(redact(row.text), NAME_MAX) })),
      current: open.length ? clipToWidth(redact(open[0].text), NAME_MAX) : null,
      progress: progressOf(done, rows.length, open.map((row) => clipToWidth(redact(row.text), NAME_MAX))),
    }];
  });
  return { plans, skipped };
};

// The items under a `## Next` heading of a handoff, the fallback next step when no plan has one.
const nextItemsOf = (text, redact) => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^#{2,3} Next\s*$/iu.test(line.trim()));
  if (start === -1) return [];
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,3} /u.test(line)) break;
    const item = /^\s*(?:[-*]|\d+\.)\s+(.+)$/u.exec(line)?.[1]?.trim();
    if (item) items.push(clipToWidth(redact(item), NAME_MAX));
    if (items.length === 5) break;
  }
  return items;
};

// A session's liveness record, written by LitGrok's hooks under `.grok/litgrok/liveness/`.
const LIVENESS_STALE_MS = 15 * 60_000;
const livenessOf = (roots, sessionId, budget) => {
  const key = createHash("sha256").update(sessionId).digest("hex").slice(0, 32);
  for (const root of roots) {
    const text = readSmallFile(join(root, ".grok", "litgrok", "liveness", `${key}.json`), budget);
    if (text === null) continue;
    try {
      const record = JSON.parse(text);
      if (record?.sessionId === sessionId && ["alive", "idle", "ended"].includes(record.state) && Number.isFinite(Date.parse(record.at))) {
        return { state: record.state, atMs: Date.parse(record.at) };
      }
    } catch {
      // A torn or foreign record says nothing.
    }
  }
  return null;
};

// Grok Build handoff policy: `.handoff/HANDOFF.md`, else a root `HANDOFF.md` on explicit request,
// else a root `HANDOFF*.md` for compatibility.
const handoffsOf = (root, budget, redact, local) => {
  const candidates = [join(root, ".handoff", "HANDOFF.md"), join(root, "HANDOFF.md")];
  const found = [];
  for (const path of candidates) {
    const text = readSmallFile(path, budget);
    if (text !== null) found.push({ file: path.slice(root.length + 1), text });
  }
  if (!found.length) {
    for (const entry of entries(root) ?? []) {
      if (entry.isFile() && /^HANDOFF.*\.md$/u.test(entry.name)) {
        const text = readSmallFile(join(root, entry.name), budget) ?? "";
        found.push({ file: entry.name, text });
      }
    }
  }
  return found.map(({ file, text }) => {
    const headings = text.split("\n").slice(0, 40).filter((line) => /^#{1,3} /u.test(line)).map((line) => clipToWidth(redact(line), 100));
    return { worktree: redact(root), file, local, headings, next: local ? nextItemsOf(text, redact) : [] };
  });
};

const commitsOf = (root, sinceMs, now, exec, redact) => {
  try {
    const since = new Date(now - sinceMs).toISOString();
    const branch = exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, timeout: GIT_TIMEOUT_MS }).trim();
    const out = exec("git", ["log", `--since=${since}`, "--max-count=20", "--format=%H%x09%cI%x09%s"], { cwd: root, timeout: GIT_TIMEOUT_MS });
    return out.split("\n").filter(Boolean).map((line) => {
      const [hash, at, ...subject] = line.split("\t");
      return { worktree: redact(root), branch: redact(branch), hash: hash.slice(0, 7), at, atMs: Date.parse(at), subject: clipToWidth(redact(subject.join("\t")), 100) };
    });
  } catch {
    return null;
  }
};

const herdrAgent = (agent, env, redact) => ({
  status: typeof agent?.agent_status === "string" ? agent.agent_status : "unknown",
  pane: typeof agent?.pane_id === "string" ? clipToWidth(redact(agent.pane_id), 40) : "unknown",
  id8: typeof agent?.agent_session?.value === "string" ? agent.agent_session.value.slice(0, 8) : null,
  self: Boolean(env.HERDR_PANE_ID) && agent?.pane_id === env.HERDR_PANE_ID,
});

const herdrOf = (env, exec, redact) => {
  if (env.HERDR_ENV !== "1") return { status: "unknown", agents: [] };
  try {
    const out = exec("herdr", ["agent", "list"], { timeout: HERDR_TIMEOUT_MS });
    try {
      const listed = JSON.parse(out)?.result?.agents;
      if (!Array.isArray(listed)) throw new Error("not a list");
      return { status: "ok", agents: listed.slice(0, 20).map((agent) => herdrAgent(agent, env, redact)) };
    } catch {
      return { status: "ok", agents: out.split("\n").filter((line) => line.trim()).slice(0, 20).map((line) => clipToWidth(redact(line.trim()), 120)) };
    }
  } catch {
    return { status: "unknown", agents: [] };
  }
};

const known = (list) => (list === null ? "unknown" : "ok");
const statusRank = { "waiting-on-user": 0, active: 1, idle: 2, done: 3, ended: 4, unknown: 5 };

// A SessionEnd record is a stop record, so that session reads `done` at any age. A fresh record also
// says whether the session is working (`active`) or waiting at a turn end (`idle`); a question the
// session asked still wins, and an old record leaves the transcript's own reading.
const statusFrom = (status, live, now) => {
  if (!live || status === "waiting-on-user") return status;
  if (live.state === "ended") return "done";
  if (now - live.atMs > LIVENESS_STALE_MS) return status;
  return live.state === "idle" ? "idle" : "active";
};

/**
 * Collects the brief. Options: `cwd`, `here` (cwd only), `since` (`7d`), `max` (12), `sessionId`
 * (this session, for the next step and waiting state), `env`, `now`, `exec` (git/herdr runner).
 */
export const collectRewind = ({
  cwd = process.cwd(),
  here = false,
  since = DEFAULT_SINCE,
  max = DEFAULT_MAX,
  sessionId = null,
  env = process.env,
  now = Date.now(),
  exec = defaultExec,
  budgetBytes = undefined,
} = {}) => {
  const home = env.HOME || homedir();
  const redact = makeRedactor({ env, home });
  const budget = makeBudget(budgetBytes);
  const sinceMs = parseSince(since) ?? parseSince(DEFAULT_SINCE);
  const limit = Number.isInteger(max) && max > 0 ? Math.min(max, 50) : DEFAULT_MAX;
  const start = resolve(cwd);
  const stateRoot = resolveProjectStateRoot(start);
  const listed = here ? null : worktreesOf(start, exec);
  const roots = [...new Set([start, ...(here ? [] : listed ?? [stateRoot])])];
  const isLocal = (root) => resolve(root) === stateRoot || resolve(root) === start;

  const collectEach = (read) => {
    const results = roots.map(read);
    return results.every((value) => value === null) ? null : results.flatMap((value) => value ?? []);
  };
  // Plans and handoffs are small and say what is left, so they are read before any transcript can
  // spend the read budget.
  const planReads = roots.map((root) => plansIn(root, budget, redact, isLocal(root), sinceMs, now));
  const plans = planReads.every((read) => read === null) ? null : planReads.flatMap((read) => read?.plans ?? []);
  const plansSkipped = planReads.reduce((sum, read) => sum + (read?.skipped ?? 0), 0);
  const handoffs = roots.flatMap((root) => handoffsOf(root, budget, redact, isLocal(root)));

  const storeDir = join(env.GROK_CONFIG_DIR || join(home, ".grok"), "sessions");
  const found = findSessions(storeDir, roots);
  const sessions = [];
  for (const dir of found.dirs) {
    if (sessions.length >= limit || budget.exhausted) break;
    const session = sessionRecord(dir, { redact, now, budget });
    if (!session || (session.lastMs !== null && now - session.lastMs > sinceMs)) continue;
    if (here && session.cwd && resolve(session.cwd).normalize("NFC") !== start.normalize("NFC")) continue;
    session.status = statusFrom(session.status, livenessOf(roots, session.sessionId, budget), now);
    sessions.push(session);
  }

  const commits = collectEach((root) => commitsOf(root, sinceMs, now, exec, redact));
  const herdr = herdrOf(env, exec, redact);

  // A session waits on the user when it asked something.
  for (const session of sessions) {
    session.progress = progressOf(null, null);
    session.done.commits = (commits ?? [])
      .filter((commit) => session.lastMs !== null && Date.parse(session.started) <= commit.atMs && commit.atMs <= session.lastMs + 5 * 60_000
        && (session.branch === "unknown" || commit.branch === session.branch))
      .slice(0, 5)
      .map(({ hash, subject }) => ({ hash, subject }));
  }
  sessions.sort((a, b) => statusRank[a.status] - statusRank[b.status] || (b.lastMs ?? 0) - (a.lastMs ?? 0));

  // Plans touched inside the window are listed, this worktree's first, open before finished, then the
  // most recently changed, up to a short cap; plansIn already left out every plan outside the window.
  // The roadmap gauge counts this worktree only, since a sum over unrelated branches measures nothing.
  const orderedPlans = (plans ?? []).sort((a, b) => Number(b.local) - Number(a.local) || Number(a.complete) - Number(b.complete) || (b.changedMs ?? 0) - (a.changedMs ?? 0));
  const shownPlans = orderedPlans.slice(0, PLAN_LIMIT);
  const roadmapItems = orderedPlans.filter((plan) => plan.local).map((plan) => plan.progress);
  const data = {
    version: 1,
    generatedAt: new Date(now).toISOString(),
    scope: { here, since: sinceMs === parseSince(since) ? since : DEFAULT_SINCE, max: limit, worktrees: roots.map(redact) },
    sources: {
      transcripts: found.status,
      plans: known(plans),
      handoffs: handoffs.length ? "ok" : "unknown",
      git: known(commits),
      herdr: herdr.status,
    },
    budget: { bytesRead: budget.used, limit: budget.limit, exhausted: budget.exhausted },
    summary: {
      sessions: sessions.length,
      waitingOnUser: sessions.filter((session) => session.status === "waiting-on-user").length,
      active: sessions.filter((session) => session.status === "active").length,
      idle: sessions.filter((session) => session.status === "idle").length,
      done: sessions.filter((session) => session.status === "done").length,
    },
    sessions: sessions.map(({ cwd: _cwd, lastMs: _lastMs, sessionId: id, ...rest }) => ({ ...rest, self: Boolean(sessionId) && id === sessionId })),
    roadmap: {
      plans: shownPlans,
      plansOmitted: orderedPlans.length - shownPlans.length,
      plansDone: orderedPlans.filter((plan) => plan.complete).length,
      plansSkipped,
      litgoal: [],
      progress: roadmapItems.length ? aggregateProgress(roadmapItems) : progressOf(null, null),
    },
    workflows: [],
    startWork: [],
    handoffs,
    commits: (commits ?? []).slice(0, 20).map(({ atMs: _atMs, ...commit }) => commit),
    herdr,
  };
  // `go` re-collects the brief and continues this step; no record is written, because the model
  // has no documented way to learn its session id and no hook could hand the record back to it.
  data.next = chooseNextStep(data, sessionId);
  return data;
};

const line = (text, width) => clipToWidth(text, width);
const remainingLine = (names, width) => {
  if (!names.length || (names.length === 1 && names[0] === "unknown")) return null;
  let out = "  left:";
  for (const [index, name] of names.entries()) {
    const piece = ` ${name}${index < names.length - 1 ? "," : ""}`;
    if (displayWidth(out + piece) > width - 4) return `${out} …(+${names.length - index})`;
    out += piece;
  }
  return out;
};

// A gauge with its leading space, or nothing: an unknown total has no gauge to print.
const shown = (progress) => (progress?.gauge ? ` ${progress.gauge}` : "");

/** Plain-text rendering: every gauge with its remaining names under it, clipped to `width`. */
export const renderRewind = (data, width = 100) => {
  const out = [];
  const push = (text) => out.push(line(text, width));
  push(`lit-adhd: ${data.summary.sessions} session(s), ${data.summary.waitingOnUser} waiting on you, ${data.summary.active} active`);
  push(`roadmap here${shown(data.roadmap.progress)}`);
  for (const plan of data.roadmap.plans) {
    push(`  ${plan.local ? "" : `${basename(plan.worktree)}: `}${plan.plan}${shown(plan.progress)} ${plan.complete ? "done" : `now: ${plan.current}`}`);
    const left = remainingLine(plan.progress.remaining, width);
    if (left) push(`  ${left}`);
  }
  if (data.roadmap.plansOmitted) push(`  …(+${data.roadmap.plansOmitted} more open plans)`);
  for (const session of data.sessions) {
    push(`${session.id8} ${session.status}${shown(session.progress)} ${session.title}`);
    const left = remainingLine(session.progress.remaining, width);
    if (left) push(left);
  }
  push(`next: ${data.next.kind}${data.next.say ? ` (say "${data.next.say}")` : ""}`);
  const unknown = Object.entries(data.sources).filter(([, status]) => status !== "ok").map(([name]) => name);
  if (unknown.length) push(`unknown: ${unknown.join(", ")}`);
  return `${out.join("\n")}\n`;
};

/**
 * `rewind [--brief [--lang ko|en] | --json] [--here] [--since 7d] [--max 12] [--session <id>] [--width N]`.
 * `--brief` prints the Markdown brief the lit-adhd skill copies; `--json` the data under it.
 */
export const runRewindCli = (args, cwd = process.cwd(), { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) => {
  const options = { cwd, env, here: false, since: DEFAULT_SINCE, max: DEFAULT_MAX, sessionId: null };
  let json = false;
  let brief = false;
  let lang = "en";
  let width = Number(stdout.columns) || 100;
  const usage = "Usage: rewind [--brief [--lang ko|en] | --json] [--here] [--since 7d] [--max 12] [--session <id>] [--width N]";
  if (args.some((arg) => arg === "--help" || arg === "-h")) {
    stdout.write(`${usage}\n`);
    return 0;
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") json = true;
    else if (arg === "--brief") brief = true;
    else if (arg === "--lang" && ["ko", "en"].includes(args[index + 1])) lang = args[++index];
    else if (arg === "--here") options.here = true;
    else if (arg === "--since" && parseSince(args[index + 1])) options.since = args[++index];
    else if (arg === "--max" && /^\d{1,2}$/u.test(args[index + 1] ?? "")) options.max = Number(args[++index]);
    else if (arg === "--session" && /^[A-Za-z0-9._:-]{1,160}$/u.test(args[index + 1] ?? "")) options.sessionId = args[++index];
    else if (arg === "--width" && /^\d{2,3}$/u.test(args[index + 1] ?? "")) width = Number(args[++index]);
    else {
      stderr.write(`rewind: unknown argument ${JSON.stringify(basename(String(arg)))}. ${usage}\n`);
      return 64;
    }
  }
  const data = collectRewind(options);
  stdout.write(json ? `${JSON.stringify(data, null, 2)}\n` : brief ? renderBrief(data, { lang }) : renderRewind(data, width));
  return 0;
};
