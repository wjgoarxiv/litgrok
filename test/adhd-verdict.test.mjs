import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { RECAP_MOVED_NOTE, collectRewind, langForPrompt, runRewindCli } from "../.grok/skills/lit-adhd/scripts/lib/collect.mjs";
import { LADDER, VERDICT_LADDER_VERSION, decideVerdict, fingerprint, nextCursor, renderVerdict } from "../.grok/skills/lit-adhd/scripts/lib/verdict.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");
const temp = realpathSync(mkdtempSync(join(tmpdir(), "litgrok-verdict-")));
after(() => rmSync(temp, { recursive: true, force: true }));

const NOW = Date.parse("2026-11-18T09:00:00Z");
// A collected record with every source read; each case overrides only what it is about.
const record = (over = {}) => ({
  generatedAt: new Date(NOW).toISOString(),
  sources: { transcripts: "ok", plans: "ok", handoffs: "ok", git: "ok", herdr: "unknown" },
  coverage: { found: 0, notRead: { budget: 0, limit: 0, unreadable: 0 } },
  sessions: [],
  roadmap: { plans: [], stalePlans: [] },
  worktreeState: [{ worktree: "/w/app", local: true, uncommitted: 0, unpushed: 0 }],
  commits: [],
  next: { kind: "none", target: null },
  ...over,
});
const session = (id8, status, result = "", worktree = "/w/api") => ({ id8, status, result, worktree, last: "2026-11-18T08:50:00Z", self: false });
const openPlan = (plan, current, local = true) => ({ worktree: "/w/app", plan, local, complete: false, current, progress: { done: 1, total: 3 } });
const donePlan = (plan) => ({ worktree: "/w/app", plan, local: true, complete: true, current: null, progress: { done: 3, total: 3 } });

describe("lit-adhd verdict ladder", () => {
  it("is versioned and ordered top rule first", () => {
    assert.equal(VERDICT_LADDER_VERSION, "litgrok-adhd-verdict.v1");
    assert.deepEqual(LADDER.map(([name]) => name), [
      "approve-parked-step", "answer-waiting-session", "resume-own-frame", "continue-own-run",
      "other-sessions-at-work", "start-only-open-plan", "review-uncommitted", "next-unticked-row",
    ]);
  });

  it("a waiting session outranks an open plan, and the card names its question and where", () => {
    const data = record({ sessions: [session("aaaa1111", "waiting-on-user", "Done the schema. Shall I bump it to v2?")], next: { kind: "start-plan", target: { plan: "plans/2026-11-18-cache.md" } }, roadmap: { plans: [openPlan("plans/2026-11-18-cache.md", "2. Wire the cache")], stalePlans: [] } });
    const { text, verdict } = renderVerdict(data, { lang: "en" });
    assert.equal(verdict.rule, "answer-waiting-session");
    assert.equal(verdict.code, "NEEDS_YOU");
    assert.match(text, /^Do now: in api: answer: Shall I bump it to v2\? #[0-9a-f]{6}$/mu);
    assert.match(text, /^Type: nothing — answer in api yourself$/mu);
  });

  it("a session that only claims it is done is never counted as finished", () => {
    const claim = record({ sessions: [{ ...session("bbbb2222", "ended", "All done, everything works."), done: { files: [], commits: [] } }] });
    assert.deepEqual(decideVerdict(claim, { cursor: { at: "2026-11-18T08:00:00Z", seen: [] } }).done, []);
    const proven = record({ roadmap: { plans: [donePlan("plans/a.md")], stalePlans: [] }, commits: [{ hash: "abc1234", at: "2026-11-18T08:30:00Z" }] });
    assert.equal(decideVerdict(proven, { cursor: { at: "2026-11-18T08:00:00Z", seen: [] } }).newlyDone, 2);
  });

  it("a push never becomes the action; it waits in the queue as a question", () => {
    const data = record({ worktreeState: [{ worktree: "/w/app", local: true, uncommitted: 0, unpushed: 3 }] });
    const { text, verdict } = renderVerdict(data, { lang: "ko" });
    assert.equal(verdict.action, null);
    assert.doesNotMatch(text, /^지금 할 일: .*push/mu);
    assert.match(text, /^다음 대기: 네 확인 필요: app의 커밋 3개를 push 할까\?$/mu);
  });

  it("says there is nothing to do only when every source was read", () => {
    const clear = renderVerdict(record(), { lang: "ko" });
    assert.equal(clear.verdict.code, "ALL_CLEAR");
    assert.match(clear.text, /^지금 할 일 없음 — 확인한 기록 \d+개$/mu);
    const gap = renderVerdict(record({ coverage: { found: 9, notRead: { budget: 2, limit: 0, unreadable: 0 } } }), { lang: "ko" });
    assert.equal(gap.verdict.code, "HOLD");
    assert.match(gap.text, /^판단 보류 — 못 읽은 기록이 있음$/mu);
    assert.match(gap.text, /^읽음 0\/2 세션 — 못 읽음: 읽기 예산 초과 2$/mu);
    const noStore = renderVerdict(record({ sources: { transcripts: "unknown", plans: "ok", handoffs: "ok", git: "ok" } }), { lang: "en" });
    assert.equal(noStore.verdict.code, "HOLD", "a missing session store is a gap, never all clear");
  });

  it("withdraws the last action when the records it rested on moved", () => {
    const before = record({ next: { kind: "start-plan", target: { plan: "plans/x.md" } } });
    const first = renderVerdict(before, { lang: "en" });
    const cursor = nextCursor(first.verdict, NOW);
    const after = record({ roadmap: { plans: [openPlan("plans/x.md", "3. Ship")], stalePlans: [] } });
    const second = renderVerdict(after, { lang: "en", cursor });
    assert.match(second.text, new RegExp(`withdrawn — the state moved`, "u"));
    assert.match(second.text, new RegExp(`#${first.verdict.action.fp}`, "u"));
    const same = renderVerdict(before, { lang: "en", cursor });
    assert.doesNotMatch(same.text, /withdrawn/u, "an unchanged state keeps its action");
  });

  it("keeps the decision queue at two items and counts the rest", () => {
    const data = record({
      sessions: ["c1", "c2", "c3", "c4"].map((id, index) => session(`${id}cccccc`, "waiting-on-user", "Go on?", `/w/lane-${index}`)),
    });
    const queue = renderVerdict(data, { lang: "en" }).text.split("\n").find((line) => line.startsWith("Next waiting:"));
    assert.equal(queue.split(" · ").length, 2);
    assert.match(queue, /\(\+1\)$/u);
  });

  it("every action carries a six-hex fingerprint and a precondition", () => {
    const cases = [
      record({ next: { kind: "approve-boundary", target: { plan: "plans/p.md" } } }),
      record({ sessions: [session("dddd4444", "waiting-on-user", "Which one?")] }),
      record({ next: { kind: "resume-frame", target: { skill: "lit-plan" } } }),
      record({ next: { kind: "continue-work", target: { plan: "plans/p.md" } } }),
      record({ next: { kind: "none", wait: { lanes: 2 } } }),
      record({ next: { kind: "start-plan", target: { plan: "plans/p.md" } } }),
      record({ worktreeState: [{ worktree: "/w/app", local: true, uncommitted: 4, unpushed: 0 }] }),
      record({ roadmap: { plans: [openPlan("plans/p.md", "2. Next row")], stalePlans: [] } }),
    ];
    const rules = cases.map((data) => decideVerdict(data));
    assert.deepEqual(rules.map((verdict) => verdict.rule), LADDER.map(([name]) => name), "each case lands on its own rule");
    for (const verdict of rules) {
      assert.match(verdict.action.fp, /^[0-9a-f]{6}$/u);
      assert.ok(verdict.action.pre.length > 0);
    }
    assert.equal(fingerprint(["x"]), fingerprint(["x"]), "fingerprints are deterministic");
  });
});

// Hand-labelled snapshots: what a person reading the records would do first. The ladder must agree
// with at least eight of every ten.
const LABELLED = [
  ["question in another window beats a fresh plan", record({ sessions: [session("e1eeeeee", "waiting-on-user", "Merge now?")], next: { kind: "start-plan", target: { plan: "plans/a.md" } } }), "answer"],
  ["a parked approval beats a question", record({ sessions: [session("e2eeeeee", "waiting-on-user", "OK?")], next: { kind: "approve-boundary", target: { plan: "plans/a.md" } } }), "approve"],
  ["other lanes working: wait", record({ next: { kind: "none", wait: { lanes: 1 } }, roadmap: { plans: [openPlan("plans/a.md", "1. Row")], stalePlans: [] } }), "wait"],
  ["one open plan, nothing running: start it", record({ next: { kind: "start-plan", target: { plan: "plans/a.md" } } }), "start"],
  ["only uncommitted changes left", record({ worktreeState: [{ worktree: "/w/app", local: true, uncommitted: 2, unpushed: 0 }] }), "dirty"],
  ["several open plans, none fresh: next row", record({ roadmap: { plans: [openPlan("plans/a.md", "3. Row"), openPlan("plans/b.md", "1. Row")], stalePlans: [] } }), "row"],
  ["everything done and read: nothing", record({ roadmap: { plans: [donePlan("plans/a.md")], stalePlans: [] } }), null],
  ["unpushed commits only: nothing to do, a question waits", record({ worktreeState: [{ worktree: "/w/app", local: true, uncommitted: 0, unpushed: 1 }] }), null],
  ["own paused frame: resume", record({ next: { kind: "resume-frame", target: { skill: "start-work" } } }), "resume"],
  ["own running start-work: continue", record({ next: { kind: "continue-work", target: { plan: "plans/a.md" } } }), "continue"],
  ["claimed done but plan rows open: next row", record({ sessions: [session("e3eeeeee", "ended", "Finished everything.")], roadmap: { plans: [openPlan("plans/a.md", "2. Row")], stalePlans: [] } }), "row"],
  ["remote plan row: no command to type here", record({ roadmap: { plans: [openPlan("plans/a.md", "2. Row", false)], stalePlans: [] } }), "row"],
];

describe("lit-adhd verdict replay", () => {
  it("matches at least eight of ten hand-labelled snapshots", () => {
    const misses = LABELLED.filter(([, data, kind]) => (decideVerdict(data).action?.kind ?? null) !== kind).map(([name]) => name);
    assert.ok(LABELLED.length >= 10);
    assert.ok((LABELLED.length - misses.length) / LABELLED.length >= 0.8, `misses: ${misses.join("; ")}`);
  });
});

describe("lit-adhd verdict CLI", () => {
  const project = () => {
    const dir = join(temp, `proj-${Math.random().toString(16).slice(2, 8)}`);
    mkdirSync(join(dir, "plans"), { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: dir });
    writeFileSync(join(dir, "plans", "only.md"), "- [x] 1. Scope\n- [ ] 2. Build\n");
    return dir;
  };
  const run = (cwd, args) => {
    let out = "";
    let err = "";
    const code = runRewindCli(args, cwd, { env: { PATH: process.env.PATH, HOME: join(temp, "home"), GROK_CONFIG_DIR: join(temp, "grok") }, stdout: { write: (text) => { out += text; } }, stderr: { write: (text) => { err += text; } } });
    return { code, out, err };
  };

  it("draws the card, then moves the cursor so the next look has a baseline", () => {
    const cwd = project();
    const first = run(cwd, ["--verdict", "--lang", "ko"]);
    assert.equal(first.code, 0, first.err);
    assert.match(first.out, /^처음 봄 — 비교할 기준 없음\n/u);
    assert.ok(first.out.trim().split("\n").length <= 6, "about six lines");
    const cursor = JSON.parse(readFileSync(join(cwd, ".grok", "litgrok", "adhd", "cursor.json"), "utf8"));
    assert.equal(cursor.version, 1);
    const second = run(cwd, ["--verdict", "--lang", "ko"]);
    assert.match(second.out, /^\d{2}:\d{2} 이후: /u);
  });

  it("speaks Korean unless the user asked for English: the code picks, the skill passes the exact flag", () => {
    for (const prompt of ["lit adhd", "where was I", "lit adhd detail", "Catch me up on every session", "어디까지 했지"]) {
      assert.equal(langForPrompt(prompt), "ko", prompt);
    }
    for (const prompt of ["lit adhd --en", "lit adhd in English", "where was I, in english please", "lit adhd 영어로"]) {
      assert.equal(langForPrompt(prompt), "en", prompt);
    }
    assert.match(run(project(), ["--verdict"]).out, /^처음 봄 — /u, "no flag draws the Korean card");
    assert.doesNotMatch(run(project(), ["--verdict", "--en"]).out, /처음 봄/u, "--en draws the English card");
  });

  it("refuses a symlinked cursor and leaves its target alone", async () => {
    const { symlinkSync } = await import("node:fs");
    const cwd = project();
    mkdirSync(join(cwd, ".grok", "litgrok", "adhd"), { recursive: true });
    const victim = join(temp, "victim.txt");
    writeFileSync(victim, "keep");
    symlinkSync(victim, join(cwd, ".grok", "litgrok", "adhd", "cursor.json"));
    assert.equal(run(cwd, ["--verdict"]).code, 0);
    assert.equal(readFileSync(victim, "utf8"), "keep");
  });

  it("--recap draws the per-session brief and refuses an unknown session id", () => {
    const cwd = project();
    const all = run(cwd, ["--recap", "--lang", "en"]);
    assert.equal(all.code, 0, all.err);
    assert.match(all.out, /^## 🧭 /u);
    const missing = run(cwd, ["--recap", "zzzz9999"]);
    assert.equal(missing.code, 66);
  });

  it("the recap reached through the old lit-recap words prints the moved note as its first line", () => {
    const moved = run(project(), ["--recap", "--moved", "--lang", "en"]);
    assert.equal(moved.code, 0, moved.err);
    assert.equal(moved.out.split("\n")[0], "lit-recap moved into lit-adhd (lit adhd recap).");
    assert.equal(RECAP_MOVED_NOTE, "lit-recap moved into lit-adhd (lit adhd recap).");
    assert.doesNotMatch(run(project(), ["--recap", "--lang", "en"]).out, /moved into lit-adhd/u, "only the old words get the note");
  });

  it("counts only herdr agents working inside this repository", () => {
    const cwd = realpathSync(project());
    const agent = (folder, status, pane) => ({ agent_status: status, pane_id: pane, cwd: folder, foreground_cwd: folder, agent_session: { value: `${pane}-session-id` } });
    const listing = JSON.stringify({ result: { agents: [agent("/somewhere/else/project", "working", "w1:p1"), agent("/somewhere/else/other", "blocked", "w1:p2"), agent(join(cwd, "plans"), "working", "w1:p3")] } });
    const exec = (file, args) => {
      if (file === "herdr") return listing;
      return spawnSync(file, args, { cwd, encoding: "utf8" }).stdout ?? "";
    };
    const data = collectRewind({ cwd, env: { PATH: process.env.PATH, HOME: join(temp, "home"), HERDR_ENV: "1", GROK_CONFIG_DIR: join(temp, "grok") }, exec });
    assert.deepEqual(data.herdr.agents.map((item) => item.pane), ["w1:p3"], "an agent in another folder is not running here");
    const lone = JSON.stringify({ result: { agents: [agent("/somewhere/else/project", "working", "w1:p1")] } });
    const quiet = collectRewind({ cwd, env: { PATH: process.env.PATH, HOME: join(temp, "home"), HERDR_ENV: "1", GROK_CONFIG_DIR: join(temp, "grok") }, exec: (file, args) => (file === "herdr" ? lone : exec(file, args)) });
    assert.equal(quiet.herdr.agents.length, 0);
    assert.notEqual(decideVerdict(quiet).action?.kind, "wait", "a foreign agent never makes the card wait");
  });

  it("--json carries the verdict beside the board", () => {
    const data = JSON.parse(run(project(), ["--json"]).out);
    assert.equal(data.verdict.version, VERDICT_LADDER_VERSION);
    assert.ok(data.coverage && typeof data.coverage.found === "number");
  });
});

describe("lit-recap folded into lit-adhd", () => {
  it("removes the lit-recap skill and keeps its words as aliases of the recap view", () => {
    assert.equal(existsSync(join(root, ".grok", "skills", "lit-recap")), false);
    const skill = read(".grok", "skills", "lit-adhd", "SKILL.md");
    assert.match(skill, /`--verdict` \(the card below\)/u);
    assert.match(skill, /`--recap \[<session>\]`/u);
    assert.match(skill, /lit-recap moved into lit-adhd \(lit adhd recap\)\./u);
    const rule = read(".grok", "rules", "00-litgrok.md");
    assert.match(rule, /`lit recap`/u);
    assert.match(rule, /`litrecap`/u);
    assert.match(rule, /lit-recap moved into lit-adhd \(lit adhd recap\)\./u);
  });

  it("no manifest, doc or test outside the history names lit-recap as a shipped skill", () => {
    const plugin = JSON.parse(read(".grok-plugin", "plugin.json"));
    assert.ok(!plugin.skills.some((path) => path.endsWith("/lit-recap")));
    for (const doc of ["docs/skills.md", "docs/skills_ko-KR.md", "README.md", "README_ko-KR.md"]) {
      assert.doesNotMatch(read(doc), /<code>lit-recap<\/code>|`lit-recap`, `lit-schematic`/u, doc);
    }
  });
});
