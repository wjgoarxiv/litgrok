import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { entryFromPrompt } from "../.grok/hooks/workflow-stage.mjs";
import { collectRewind, parseSince, runRewindCli } from "../.grok/skills/lit-adhd/scripts/lib/collect.mjs";
import { aggregateProgress, gauge, knownFacts, progressOf } from "../.grok/skills/lit-adhd/scripts/lib/gauge.mjs";
import { adhdSuggestion } from "../.grok/skills/lit-adhd/scripts/lib/suggest.mjs";
import { chooseNextStep } from "../.grok/skills/lit-adhd/scripts/lib/next-step.mjs";
import { makeRedactor } from "../.grok/skills/lit-adhd/scripts/lib/redact.mjs";
import { renderBrief } from "../.grok/skills/lit-adhd/scripts/lib/brief.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillsRoot = join(root, ".grok", "skills");
const skillRoot = join(skillsRoot, "lit-adhd");
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const skillFiles = walk(skillRoot).map((file) => file.slice(skillRoot.length + 1).replaceAll("\\", "/"));
const body = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

let temp;
let counter = 0;

before(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "litgrok-adhd-")));
  mkdirSync(join(temp, "home"), { recursive: true });
});

const freshDir = (name) => {
  const dir = join(temp, `${name}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const git = (cwd, ...args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: join(temp, "home") } });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
};

// A fixture project: one waiting session, one active, one ended, two open plans, a handoff,
// one commit. Times are relative to the real now so recency is deterministic.
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const fixture = () => {
  const proj = freshDir("proj");
  git(proj, "init", "-q");
  git(proj, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "feat: scope the store");
  writeFileSync(join(proj, "plans.md"), "");
  mkdirSync(join(proj, "plans"), { recursive: true });
  writeFileSync(join(proj, "plans", "brief.md"), "- [x] 0. Scope the store\n- [ ] 1. Collect records\n- [ ] 2. Draw brief\n");
  mkdirSync(join(proj, ".handoff"), { recursive: true });
  writeFileSync(join(proj, ".handoff", "HANDOFF.md"), "# Handoff\n\n## Task\n\n## Current\n");
  const store = freshDir("store");
  const enc = encodeURIComponent(proj);
  const session = (id, updatedMs, summary, history, events = []) => {
    const dir = join(store, "sessions", enc, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ info: { id, cwd: proj, created_at: iso(updatedMs - 3_600_000), updated_at: iso(updatedMs) }, session_summary: summary }));
    writeFileSync(join(dir, "chat_history.jsonl"), history.map((line) => JSON.stringify(line)).join("\n"));
    if (events.length) writeFileSync(join(dir, "events.jsonl"), events.map((line) => JSON.stringify(line)).join("\n"));
    return dir;
  };
  session("sess-wait", NOW - 5 * 60_000, "ADHD lane", [
    { type: "user", content: "brief every session" },
    { type: "assistant", content: "Which window should I start with?" },
  ], [{ ts: iso(NOW - 5 * 60_000), type: "tool:read", file: "/tmp/litgrok-adhd-fixture/proj/brief.md" }]);
  session("sess-run", NOW - 60_000, "Collector lane", [{ type: "user", content: "port the collector" }]);
  session("sess-old", NOW - 5 * 3_600_000, "Old lane", [{ type: "user", content: "old work" }]);
  return { proj, store };
};

const baseEnv = (store, extra = {}) => ({
  PATH: process.env.PATH, HOME: join(temp, "home"), GROK_CONFIG_DIR: store, ...extra,
});

describe("lit-adhd collector", () => {
  it("reads sessions, plans, handoffs and git from the fixture", () => {
    const { proj, store } = fixture();
    const data = collectRewind({ cwd: proj, since: "30d", max: 5, sessionId: "sess-wait", env: baseEnv(store), now: NOW, record: false });
    assert.equal(data.version, 1);
    assert.equal(data.sources.transcripts, "ok");
    assert.equal(data.sources.plans, "ok");
    assert.equal(data.sources.git, "ok");
    assert.equal(data.summary.sessions, 3);
    assert.equal(data.summary.waitingOnUser, 1);
    assert.equal(data.sessions[0].status, "waiting-on-user");
    assert.equal(data.sessions[0].id8, "sess-wai");
    assert.match(data.sessions[0].title, /ADHD/u);
    assert.deepEqual(data.sessions[0].asked, ["brief every session"]);
    assert.ok(data.sessions.some((session) => session.status === "active"));
    assert.ok(data.sessions.some((session) => session.status === "ended"));
    assert.ok(data.roadmap.plans.some((plan) => plan.plan === "plans/brief.md" && plan.progress.done === 1 && plan.progress.total === 3));
    assert.equal(data.roadmap.progress.done, 1);
    assert.equal(data.commits.length, 1);
    assert.match(data.roadmap.plans[0].current, /Collect records/u);
  });

  it("reads handoffs only from the first 40 lines and names the source", () => {
    const { proj, store } = fixture();
    writeFileSync(join(proj, ".handoff", "HANDOFF.md"), `${"# Handoff\n\n## Task\n\nDo the thing.\n".padEnd(3000, "x")}\n## Secrets\n\nthe password is hunter2\n`);
    const data = collectRewind({ cwd: proj, since: "30d", max: 1, env: baseEnv(store), now: NOW, record: false });
    assert.equal(data.sources.handoffs, "ok");
    const headings = data.handoffs[0].headings.join("\n");
    assert.match(headings, /## Task/u);
    assert.doesNotMatch(headings, /hunter2/u);
  });

  it("marks missing sources unknown and never invents", () => {
    const proj = freshDir("empty");
    git(proj, "init", "-q");
    const data = collectRewind({ cwd: proj, since: "7d", max: 5, env: { PATH: process.env.PATH, HOME: join(temp, "home"), GROK_CONFIG_DIR: join(temp, "no-store") }, now: NOW, record: false });
    assert.equal(data.sources.transcripts, "unknown");
    assert.equal(data.sources.plans, "unknown");
    assert.equal(data.summary.sessions, 0);
    assert.equal(data.next.kind, "none");
  });

  it("redacts quoted JSON secrets, not just bare assignments", () => {
    const redact = makeRedactor({ env: { PATH: "/usr/bin", HOME: "/Users/someone" }, home: "/Users/someone" });
    for (const text of [
      '{"api_key": "abcd1234efgh5678ijkl", "password": "hunter22x"}',
      "{'token': 'zyxw9876vuts5432rqpo'}",
      'login with password: "correct horse 9999" now',
    ]) {
      const out = redact(text);
      assert.doesNotMatch(out, /abcd1234efgh5678ijkl|hunter22x|zyxw9876vuts5432rqpo|correct horse 9999/u, text);
      assert.match(out, /\[redacted\]/u, text);
    }
  });

  it("redacts before clipping, so a cut secret leaves no prefix", () => {
    const { proj, store } = fixture();
    writeFileSync(join(proj, "plans", "brief.md"), "- [x] 0. Scope the store\n- [ ] 1. Rotate the deploy credential before we release v2 to prod; the old one: ghp_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890\n");
    const data = collectRewind({ cwd: proj, since: "30d", max: 5, env: baseEnv(store), now: NOW, record: false });
    const titles = data.roadmap.plans.flatMap((plan) => [plan.current, ...plan.progress.remaining]);
    assert.ok(titles.some((title) => /\[redacted\]/u.test(title)), "the token is masked");
    for (const title of titles) assert.doesNotMatch(title, /ghp_/u, "no token prefix survives the clip");
  });

  it("strips control and bidi characters but keeps tabs and newlines", () => {
    const redact = makeRedactor({ env: { PATH: "/usr/bin" }, home: "/Users/someone" });
    assert.equal(redact("a\u001bb\u0007c\u001bd"), "abcd");
    assert.equal(redact("ok\u202efine\u2066now"), "okfinenow");
    assert.equal(redact("tab\there\nthere"), "tab\there\nthere");
    assert.equal(redact("keep \u007e tilde"), "keep ~ tilde");
  });

  it("redacts secrets, userinfo and home, and keeps paths", () => {
    const redact = makeRedactor({ env: { FOO: "short", TOK: "tok", LITGROK_TEST_SECRET: "s3cr3t-value-xyz", PATH: "/usr/bin" }, home: "/Users/someone" });
    assert.equal(redact("key=s3cr3t-value-xyz"), "key=[redacted]");
    assert.equal(redact("https://user:pass@example.com/x"), "https://[redacted]@example.com/x");
    assert.equal(redact("/Users/someone/proj/file.md"), "~/proj/file.md");
    assert.equal(redact("sk-ant-abcdefghijklmnopqrstuvwxyz0123456789"), "[redacted]");
    assert.equal(redact("/usr/bin:/bin"), "/usr/bin:/bin");
    assert.equal(redact("LITGROK_TEST_SECRET=s3cr3t-value-xyz"), "[redacted]", "a secret-named assignment is fully blanked");
  });
});

describe("lit-adhd gauge contract", () => {
  it("draws a gauge only from two real totals", () => {
    assert.equal(gauge(null, null), null);
    assert.equal(gauge(0, 0), null);
    assert.equal(gauge(2, 0), null);
    assert.equal(gauge(2, 3), "[▉▉░] 2/3");
    assert.equal(gauge(1, 1), "[▉] 1/1");
    assert.equal(gauge(0, 5), "[░░░░░] 0/5");
    assert.equal(gauge(131, 363), "[▉▉▉░░░░░░░] 131/363");
  });

  it("progressOf separates done, remainder and waiting remainders", () => {
    assert.deepEqual(progressOf(2, 4, ["c", "d"]), { done: 2, total: 4, gauge: "[▉▉░░] 2/4", remaining: ["c", "d"] });
    assert.deepEqual(progressOf(null, null, null), { done: null, total: null, gauge: null, remaining: ["unknown"] });
    assert.deepEqual(aggregateProgress([{ done: 1, total: 3 }, { done: 0, total: 2 }]), { done: 1, total: 5, gauge: "[▉░░░░] 1/5" });
    assert.equal(aggregateProgress([{ done: 1, total: null }]).gauge, null, "one unknown total kills the sum gauge");
  });

  it("knownFacts states what is known, never a question-mark gauge", () => {
    assert.equal(knownFacts({ steps: 12, elapsedMs: 240_000, last: "Edit README.md" }), "12 steps · 4m · last: Edit README.md");
    assert.equal(knownFacts({ elapsedMs: 5_000 }), "running 5s");
    assert.equal(knownFacts({}), "running");
    for (const text of [knownFacts({ steps: 3 }), knownFacts({}), knownFacts({ steps: null })]) {
      assert.doesNotMatch(text, /\?/u, "no question marks in facts");
    }
  });

  it("parseSince accepts the documented windows only", () => {
    assert.equal(parseSince("7d"), 604_800_000);
    assert.equal(parseSince("12h"), 43_200_000);
    assert.equal(parseSince("30m"), 1_800_000);
    assert.equal(parseSince("30d"), 2_592_000_000);
    assert.equal(parseSince("x"), null);
    assert.equal(parseSince("--help"), null);
  });
});

describe("lit-adhd next step", () => {
  it("writes no next-step record: go re-collects the same step", () => {
    const { proj, store } = fixture();
    const data = collectRewind({ cwd: proj, since: "30d", max: 5, sessionId: "sess-wait", env: baseEnv(store), now: NOW });
    assert.equal(data.next.kind, "none", "the fixture has work running, so nothing is offered");
    const stateFiles = [];
    const adhdDir = join(proj, ".grok", "litgrok", "adhd");
    if (existsSync(adhdDir)) stateFiles.push(...readdirSync(adhdDir));
    assert.deepEqual(stateFiles.filter((name) => name.startsWith("next-")), [], "no session record is written");
  });

  it("promises re-collection on go, never a written record", () => {
    assert.doesNotMatch(body, /wrote this session's next step/u, "no written-record claim");
    assert.match(body, /re-collect/u, "go re-collects the offered step");
  });

  it("offers the one open plan while nothing runs, and none otherwise", () => {
    const { proj, store } = fixture();
    const data = collectRewind({ cwd: proj, since: "30d", max: 5, env: baseEnv(store), now: NOW, record: false });
    assert.equal(chooseNextStep(data, "sess-run").kind, "none", "a running session blocks the offer");
    const ended = { ...data, sessions: data.sessions.map((session) => ({ ...session, status: "ended" })) };
    assert.deepEqual(chooseNextStep(ended, "sess-run"), { kind: "start-plan", target: { plan: "plans/brief.md" }, say: "go" });
    const two = { ...ended, roadmap: { ...ended.roadmap, plans: [...ended.roadmap.plans, { ...ended.roadmap.plans[0], plan: "plans/other.md", local: true }] } };
    assert.equal(chooseNextStep(two, "sess-run").kind, "none", "two open plans is not startable by word alone");
  });

  it("lets a plan saved in the last 30 minutes win over older open plans", () => {
    const { proj, store } = fixture();
    const data = collectRewind({ cwd: proj, since: "30d", max: 5, env: baseEnv(store), now: NOW, record: false });
    const ended = { ...data, sessions: data.sessions.map((session) => ({ ...session, status: "ended" })) };
    const base = ended.roadmap.plans[0];
    const withPlans = (plans) => ({ ...ended, roadmap: { ...ended.roadmap, plans } });
    const fresh = { ...base, plan: "plans/fresh.md", local: true, changedMs: NOW - 29 * 60_000 };
    const old = { ...base, local: true, changedMs: NOW - 3 * 3_600_000 };
    assert.deepEqual(chooseNextStep(withPlans([old, fresh]), "sess-run"), { kind: "start-plan", target: { plan: "plans/fresh.md" }, say: "go" });
    const stale = { ...fresh, changedMs: NOW - 31 * 60_000 };
    assert.equal(chooseNextStep(withPlans([old, stale]), "sess-run").kind, "none", "a plan older than 30 minutes is not just saved");
    const twin = { ...fresh, plan: "plans/twin.md", changedMs: NOW - 5 * 60_000 };
    assert.equal(chooseNextStep(withPlans([old, fresh, twin]), "sess-run").kind, "none", "two fresh plans stay ambiguous");
  });

  it("the rule and lit-plan route a bare go after a saved plan to start-work", () => {
    const rule = read(".grok", "rules", "00-litgrok.md");
    assert.match(rule, /bare `go`.{0,200}30 minutes/su, "rule routes go after a saved plan");
    const litPlan = readFileSync(join(skillsRoot, "lit-plan", "SKILL.md"), "utf8");
    assert.match(litPlan, /`go`.{0,300}30 minutes.{0,300}start-work/su, "lit-plan ends with the go offer");
    assert.match(litPlan, /mtime|modification time/u, "age comes from the plan file");
  });

});

// Round-3 shape: several lanes of one project, one finished plan, one plan nobody touched in weeks, one
// open plan, a lane that ended through SessionEnd, one waiting at a turn end, and a HANDOFF.md Next.
const liveness = (proj, id, state, atMs = NOW) => {
  const dir = join(proj, ".grok", "litgrok", "liveness");
  mkdirSync(dir, { recursive: true });
  const key = createHash("sha256").update(id).digest("hex").slice(0, 32);
  writeFileSync(join(dir, `${key}.json`), JSON.stringify({ sessionId: id, cwd: proj, state, pane: null, at: iso(atMs) }));
};
const roundThree = () => {
  const { proj, store } = fixture();
  writeFileSync(join(proj, "plans", "shipped.md"), "- [x] 1. Port liveness\n- [x] 2. Port rows\n");
  const stale = join(proj, "plans", "stale.md");
  writeFileSync(stale, "- [ ] 1. Forgotten idea\n");
  utimesSync(stale, new Date(NOW - 40 * 86_400_000), new Date(NOW - 40 * 86_400_000));
  writeFileSync(join(proj, ".handoff", "HANDOFF.md"), "# Handoff\n\n## Task\n\n## Next\n\n- Collect records\n- Rerun the family gates\n");
  liveness(proj, "sess-old", "ended", NOW - 5 * 3_600_000);
  liveness(proj, "sess-run", "idle", NOW - 60_000);
  return { proj, store };
};
const collectThree = (extra = {}) => {
  const { proj, store } = roundThree();
  return collectRewind({ cwd: proj, since: "30d", max: 5, sessionId: "sess-wait", env: baseEnv(store), now: NOW, ...extra });
};

describe("lit-adhd round-3 brief", () => {
  it("keeps a finished plan as complete and counts it", () => {
    const data = collectThree();
    const shipped = data.roadmap.plans.find((plan) => plan.plan === "plans/shipped.md");
    assert.ok(shipped, "a finished plan stays in the roadmap");
    assert.equal(shipped.complete, true);
    assert.equal(data.roadmap.plansDone, 1);
    assert.match(renderBrief(data, { lang: "en" }), /✓ .*plans\/shipped\.md/u, "the roadmap shows it as done");
  });

  it("holds local plans to the window and reports the ones it skipped", () => {
    const data = collectThree();
    assert.equal(data.roadmap.plans.some((plan) => plan.plan === "plans/stale.md"), false, "a local plan outside the window is left out");
    assert.equal(data.roadmap.plansSkipped, 1);
    assert.match(renderBrief(data, { lang: "en" }), /1 plan skipped/u);
    assert.match(renderBrief(data, { lang: "ko" }), /계획 1개 건너뜀/u);
  });

  it("reads plans before transcripts, so a spent budget still leaves the plans", () => {
    const data = collectThree({ budgetBytes: 200 });
    assert.ok(data.roadmap.plans.some((plan) => plan.plan === "plans/brief.md"), "plans are read first");
    assert.equal(data.budget.exhausted, true);
  });

  it("reads done from a SessionEnd record and idle from a turn end, next to the current statuses", () => {
    const data = collectThree();
    const byId = Object.fromEntries(data.sessions.map((session) => [session.id8, session.status]));
    assert.equal(byId["sess-old"], "done");
    assert.equal(byId["sess-run"], "idle");
    assert.equal(byId["sess-wai"], "waiting-on-user", "a session that asked something still waits on you");
    assert.equal(data.summary.idle, 1);
  });

  it("opens with three lines: done so far, doing now, next", () => {
    const text = renderBrief(collectThree(), { lang: "en" });
    const lines = text.split("\n");
    const at = lines.findIndex((line) => line.startsWith("**Done so far:**"));
    assert.ok(at > 0, text);
    assert.match(lines[at], /1 plan finished/u);
    assert.match(lines[at + 1], /^\*\*Doing now:\*\* /u);
    assert.match(lines[at + 1], /1 idle/u);
    assert.match(lines[at + 2], /^\*\*Next:\*\* /u);
    const ko = renderBrief(collectThree(), { lang: "ko" });
    assert.match(ko, /\*\*지금까지 한 일:\*\*/u);
    assert.match(ko, /\*\*지금 하는 일:\*\*/u);
    assert.match(ko, /\*\*다음:\*\*/u);
  });

  it("draws the step box in an untagged fence", () => {
    const text = renderBrief(collectThree(), { lang: "en" });
    assert.doesNotMatch(text, /```text/u);
    assert.match(text, /```\n╭─ RECOMMENDED NEXT STEP/u);
  });

  it("falls back to HANDOFF.md Next and never offers a step that is already done", () => {
    const { proj, store } = roundThree();
    writeFileSync(join(proj, "plans", "brief.md"), "- [x] 0. Scope the store\n- [x] 1. Collect records\n- [x] 2. Draw brief\n");
    rmSync(join(store, "sessions"), { recursive: true, force: true });
    const data = collectRewind({ cwd: proj, since: "30d", max: 5, env: baseEnv(store), now: NOW });
    assert.deepEqual(data.handoffs[0].next, ["Collect records", "Rerun the family gates"]);
    const text = renderBrief(data, { lang: "en" });
    const nextLine = text.split("\n").find((line) => line.startsWith("**Next:**"));
    const boxText = text.slice(text.indexOf("╭─"), text.indexOf("╯"));
    for (const shown of [nextLine, boxText]) {
      assert.doesNotMatch(shown, /Collect records/u, "a checked plan row is never the next step");
      assert.match(shown, /Rerun the family gates/u, "the first HANDOFF Next item not already done");
    }
  });
});

describe("lit-adhd brief rendering", () => {
  const collect = () => {
    const { proj, store } = fixture();
    return collectRewind({ cwd: proj, since: "30d", max: 5, sessionId: "sess-wait", env: baseEnv(store), now: NOW, record: false });
  };

  it("draws the English brief: waiting first, ended in one row, roadmap, one box", () => {
    const text = renderBrief(collect(), { lang: "en" });
    const waiting = text.indexOf("WAITING ON YOU");
    const active = text.indexOf("**ACTIVE**");
    const ended = text.indexOf("### ⚪ Ended");
    assert.ok(waiting !== -1 && waiting < active && active < ended, "waiting, then active, then ended");
    assert.match(text, /RECOMMENDED NEXT STEP/u);
    assert.match(text, /Next in plans\/brief\.md: 1\. Collect records/u, "exactly one go step");
    assert.match(text, /Nothing runs on its own here/u);
    assert.match(text, /plans\/brief\.md.*\[▉░░\] 1\/3/u, "the plan gauge is real");
    assert.doesNotMatch(text, /\?\/\?|\[\?\?\?\]|k\/\?/u, "no placeholder gauges");
    assert.match(text, /\*Not read: herdr\.\*/u, "unknown sources named once");
  });

  it("shows the suggestion in the box with the no-go footer, like upstream", () => {
    const text = renderBrief(collect(), { lang: "en" });
    assert.match(text, /Next in plans\/brief\.md: 1\. Collect records/u, "the box shows the suggestion");
    assert.match(text, /Nothing runs on its own here/u, "the suggestion is shown, never recorded");
  });

  it("draws the same brief in Korean", () => {
    const text = renderBrief(collect(), { lang: "ko" });
    assert.match(text, /나를 기다림/u);
    assert.match(text, /추천하는 다음 단계/u);
    assert.match(text, /plans\/brief\.md 다음 항목: 1\. Collect records/u, "exactly one go step");
    assert.match(text, /저절로 실행되는 단계는 아닙니다/u);
    assert.doesNotMatch(text, /\?\/\?|\[\?\?\?\]/u);
  });

  it("the CLI prints the brief and the JSON", () => {
    const { proj, store } = fixture();
    const help = spawnSync(process.execPath, [join(skillRoot, "scripts", "rewind.mjs"), "--help"], { encoding: "utf8" });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--brief/u);
    const bad = spawnSync(process.execPath, [join(skillRoot, "scripts", "rewind.mjs"), "--bogus"], { encoding: "utf8" });
    assert.notEqual(bad.status, 0);
    const json = spawnSync(process.execPath, [join(skillRoot, "scripts", "rewind.mjs"), "--json", "--session", "x"], {
      cwd: proj, encoding: "utf8", env: baseEnv(store),
    });
    assert.equal(json.status, 0);
    assert.equal(JSON.parse(json.stdout).version, 1);
  });
});

describe("lit-adhd enrollment", () => {
  it("is in the Grok catalog, the parity inventory, and ships complete", () => {
    const catalog = JSON.parse(read(".grok-plugin", "plugin.json")).skills;
    assert.ok(catalog.includes("./.grok/skills/lit-adhd"), "plugin.json skills");
    const parity = JSON.parse(read("tools", "payload-substance-parity.json"));
    assert.ok(parity.products.p33.skills.includes("lit-adhd"), "parity inventory");
    assert.equal(parity.products.p33.inventory.count, readdirSync(skillsRoot).length, "inventory count follows the skills tree");
    for (const file of ["SKILL.md", "scripts/rewind.mjs", "scripts/lib/collect.mjs", "scripts/lib/transcripts.mjs", "scripts/lib/gauge.mjs", "scripts/lib/brief.mjs", "scripts/lib/suggest.mjs", "scripts/lib/next-step.mjs", "scripts/lib/redact.mjs", "scripts/lib/plan-task-rows.mjs", "scripts/lib/project-state-root.mjs", "references/card-examples.md", "references/status-taxonomy.md"]) {
      assert.ok(skillFiles.includes(file), `${file} ships`);
    }
  });

  it("is documented in both guides, both skills pages, both references, both READMEs, the npm READMEs and the changelog", () => {
    for (const doc of ["docs/skills.md", "docs/skills_ko-KR.md", "docs/reference.md", "docs/reference_ko-KR.md", "README.md", "README_ko-KR.md", "docs/npm/README.md", "docs/npm/README_ko-KR.md", "CHANGELOG.md"]) {
      assert.match(read(doc), /lit-adhd/u, `${doc} must document the skill`);
    }
    assert.ok(existsSync(join(root, "docs", "assets", "skills", "lit-adhd.webp")), "skills page snapshot");
  });

  it("is routed by the rule and points back from handoff and recap", () => {
    const rule = read(".grok", "rules", "00-litgrok.md");
    assert.match(rule, /## Brief over sessions/u);
    assert.match(rule, /lit-adhd/u);
    assert.match(rule, /Triggers: adhd, rewind/u);
    for (const neighbour of ["lit-handoff", "lit-recap"]) {
      assert.match(readFileSync(join(skillsRoot, neighbour, "SKILL.md"), "utf8"), /lit adhd/u, neighbour);
    }
  });

  it("registers its script as an executable entry point", () => {
    const mode = statSync(join(skillRoot, "scripts", "rewind.mjs")).mode;
    assert.ok(mode & 0o111, "rewind.mjs is executable");
  });
});

describe("lit-adhd suggestion marker", () => {
  const suggestFixture = (plant) => {
    const proj = freshDir("suggest-proj");
    git(proj, "init", "-q");
    const store = freshDir("suggest-store");
    const sessionDir = join(store, "sessions", encodeURIComponent(proj), "sess-other");
    mkdirSync(sessionDir, { recursive: true });
    const victim = join(temp, `victim-${counter++}.txt`);
    writeFileSync(victim, "do not touch");
    plant(proj, victim);
    return { proj, store, victim };
  };

  it("refuses a symlinked marker file and leaves the target alone", () => {
    const { proj, store, victim } = suggestFixture((root, target) => {
      mkdirSync(join(root, ".grok", "litgrok", "adhd"), { recursive: true });
      symlinkSync(target, join(root, ".grok", "litgrok", "adhd", "suggested.json"));
    });
    assert.equal(adhdSuggestion({ storeDir: join(store, "sessions"), projectRoot: proj, sessionId: "sess-here", stateRoot: proj }), null);
    assert.equal(readFileSync(victim, "utf8"), "do not touch");
  });

  it("suggests once per day on a real directory", () => {
    const { proj, store } = suggestFixture(() => {});
    const args = { storeDir: join(store, "sessions"), projectRoot: proj, sessionId: "sess-here", stateRoot: proj };
    assert.match(adhdSuggestion(args), /lit adhd/u, "first call suggests");
    assert.equal(adhdSuggestion(args), null, "second call today stays quiet");
    assert.equal(JSON.parse(readFileSync(join(proj, ".grok", "litgrok", "adhd", "suggested.json"), "utf8")).day, new Date().toISOString().slice(0, 10));
  });

  it("ignores state under .grok/litgrok, never under .grok itself", () => {
    const { proj, store } = suggestFixture(() => {});
    adhdSuggestion({ storeDir: join(store, "sessions"), projectRoot: proj, sessionId: "sess-here", stateRoot: proj });
    assert.match(readFileSync(join(proj, ".grok", "litgrok", ".gitignore"), "utf8"), /^\*$/mu, "state stays uncommitted");
    assert.equal(existsSync(join(proj, ".grok", ".gitignore")), false, "the committed skills folder is untouched");
  });

  it("refuses a symlinked marker directory", () => {
    const elsewhere = freshDir("elsewhere");
    const { proj, store } = suggestFixture((root) => {
      mkdirSync(join(root, ".grok", "litgrok"), { recursive: true });
      symlinkSync(elsewhere, join(root, ".grok", "litgrok", "adhd"));
    });
    assert.equal(adhdSuggestion({ storeDir: join(store, "sessions"), projectRoot: proj, sessionId: "sess-here", stateRoot: proj }), null);
    assert.deepEqual(readdirSync(elsewhere), []);
  });
});

describe("lit-adhd look routes", () => {
  const hooksDir = join(root, ".grok", "hooks");
  const promptHook = join(hooksDir, "user-prompt-submit.mjs");
  const toolHook = join(hooksDir, "pre-tool-use.mjs");
  const statusLine = join(hooksDir, "lit-status-line.mjs");
  const collector = "node /installed/.grok/skills/lit-adhd/scripts/rewind.mjs --brief --lang en";

  const drive = (command, hookName, event, workspace, hudRoot, sessionId) => {
    const result = spawnSync(process.execPath, [command], {
      encoding: "utf8",
      input: `${JSON.stringify(event)}\n`,
      env: {
        ...process.env,
        GROK_HOOK_EVENT: event.hookEventName,
        GROK_HOOK_NAME: hookName,
        GROK_SESSION_ID: sessionId,
        GROK_WORKSPACE_ROOT: workspace,
        LITGROK_HUD_STATE_ROOT: hudRoot,
      },
    });
    assert.equal(result.status, 0, `${hookName}: ${result.stderr}`);
  };
  const card = (workspace, hudRoot) => spawnSync(process.execPath, [statusLine], {
    encoding: "utf8",
    input: JSON.stringify({ cwd: workspace }),
    env: { ...process.env, NO_COLOR: "1", COLUMNS: "100", LITGROK_HUD_STATE_ROOT: hudRoot },
  }).stdout;

  const promptFixture = () => {
    const workspace = freshDir("look-route");
    git(workspace, "init", "-q");
    const hudRoot = freshDir("look-hud");
    chmodSync(hudRoot, 0o700);
    return { workspace, hudRoot };
  };
  const submitPrompt = (workspace, hudRoot, sessionId, prompt) => drive(promptHook, "user-prompt-submit", {
    hookEventName: "UserPromptSubmit", sessionId, cwd: workspace, workspaceRoot: workspace, prompt,
  }, workspace, hudRoot, sessionId);
  const startTool = (workspace, hudRoot, sessionId, command) => drive(toolHook, "pre-tool-use", {
    hookEventName: "PreToolUse", sessionId, cwd: workspace, workspaceRoot: workspace,
    toolName: "run_terminal_command", toolInput: { command },
  }, workspace, hudRoot, sessionId);

  for (const [route, prompt] of [["bare word", "lit adhd"], ["slash command", "/lit-adhd"], ["alias", "lit rewind"]]) {
    it(`the ${route} route switches the card to the rewind look`, () => {
      const { workspace, hudRoot } = promptFixture();
      submitPrompt(workspace, hudRoot, "sess-look-route", prompt);
      assert.match(card(workspace, hudRoot), /✺ REWIND lit-adhd/u, route);
    });
  }

  it("a skill load without lit words switches the card when the collector starts", () => {
    const { workspace, hudRoot } = promptFixture();
    submitPrompt(workspace, hudRoot, "sess-look-load", "brief me");
    assert.doesNotMatch(card(workspace, hudRoot), /REWIND/u, "the bare words name no skill");
    startTool(workspace, hudRoot, "sess-look-load", collector);
    assert.match(card(workspace, hudRoot), /✺ REWIND lit-adhd/u, "the running collector is the route");
  });

  it("an unrelated tool call and prose about ADHD leave the card alone", () => {
    const { workspace, hudRoot } = promptFixture();
    submitPrompt(workspace, hudRoot, "sess-look-quiet", "how do I track ADHD");
    assert.doesNotMatch(card(workspace, hudRoot), /REWIND/u, "prose names no skill");
    startTool(workspace, hudRoot, "sess-look-quiet", "node scripts/other.mjs --brief");
    assert.doesNotMatch(card(workspace, hudRoot), /REWIND/u, "another script is not the collector");
  });
});

describe("lit-adhd route", () => {
  it("opens the discipline on the catch-up words and leaves the workflow row where it was", () => {
    const { entryFromPrompt: entry } = { entryFromPrompt };
    for (const prompt of ["lit adhd", "lit rewind", "lit-adhd where was I", "/lit-rewind", "lit adhd brief me"]) {
      assert.deepEqual(entry(prompt), { stage: null, entry: "switch", discipline: "lit-adhd" }, prompt);
    }
    assert.deepEqual(entry("lit plan the brief"), { stage: "plan", entry: "switch", discipline: "lit-plan" }, "plan keeps its own entry");
    assert.equal(entry("how do I track ADHD"), null, "no scolding of prose");
  });

  it("describes the skill so the model can pick it from the catalog alone", () => {
    const description = body.match(/^description: (.*)$/mu)[1];
    assert.ok(description.length <= 1024, "description length");
    for (const word of ["session", "roadmap", "next step"]) assert.match(description, new RegExp(word, "iu"), word);
    assert.doesNotMatch(description, /Grok/u);
  });
});
