import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { collectRewind } from "../.grok/skills/lit-adhd/scripts/lib/collect.mjs";
import { boardBar, renderBoard } from "../.grok/skills/lit-adhd/scripts/lib/board.mjs";

// The lit-adhd v2 board: one screen that says what to do now and what to type, what is done, what is
// left and what not to forget. The collector computes every count, bar and reminder; these tests pin
// the board it draws from a fixture repository built in a temporary folder.

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillRoot = join(root, ".grok", "skills", "lit-adhd");
const rewind = join(skillRoot, "scripts", "rewind.mjs");
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86_400_000;
const WAIT_ID = "0198a3c2-7f41-7c55-9e0e-5d1f2a3b4c5d";
const RUN_ID = "0198a3c2-9a10-7d22-8b1c-6e2f3a4b5c6d";

let temp;
let counter = 0;
before(() => {
  temp = realpathSync(mkdtempSync(join(tmpdir(), "litgrok-board-")));
  mkdirSync(join(temp, "home"), { recursive: true });
});
const freshDir = (name) => {
  const dir = join(temp, `${name}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};
const gitEnv = () => ({ ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: join(temp, "home") });
const git = (cwd, ...args) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: gitEnv() });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
};
const age = (path, days) => utimesSync(path, new Date(NOW - days * DAY), new Date(NOW - days * DAY));

// The spec fixture: one plan fully ticked, one half done, one plan nobody touched in 40 days, a
// session waiting on the user, a session still working, and uncommitted changes.
const fixture = ({ sessions = true, plans = true } = {}) => {
  const proj = freshDir("proj");
  git(proj, "init", "-q");
  writeFileSync(join(proj, "README.md"), "first\n");
  git(proj, "add", "README.md");
  git(proj, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "feat: scope the store");
  writeFileSync(join(proj, "README.md"), "changed\n");
  mkdirSync(join(proj, "plans"), { recursive: true });
  if (plans) {
    writeFileSync(join(proj, "plans", "2026-11-01-autopilot.md"), "# LitGrok autopilot\n\n- [x] 1. Port liveness\n- [x] 2. Port rows\n");
    writeFileSync(join(proj, "plans", "2026-11-10-kpi-board.md"), "# KPI board\n\n- [x] 1. Pin the spec\n- [x] 2. Write the RED tests\n- [ ] 3. Draw the board\n- [ ] 4. Run the gates\n");
    const stale = join(proj, "plans", "2026-09-01-old-idea.md");
    writeFileSync(stale, "# Old idea\n\n- [ ] 1. Forgotten idea\n");
    age(stale, 40);
    age(join(proj, "plans", "2026-11-01-autopilot.md"), 1);
  }
  const store = freshDir("store");
  const enc = encodeURIComponent(proj);
  const session = (id, updatedMs, summary, history) => {
    const dir = join(store, "sessions", enc, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "summary.json"), JSON.stringify({ info: { id, cwd: proj, created_at: iso(updatedMs - 3_600_000), updated_at: iso(updatedMs) }, session_summary: summary }));
    writeFileSync(join(dir, "chat_history.jsonl"), history.map((line) => JSON.stringify(line)).join("\n"));
  };
  if (sessions) {
    session(WAIT_ID, NOW - 5 * 60_000, "ADHD lane", [
      { type: "user", content: "brief every session" },
      { type: "assistant", content: "Which window should I start with?" },
    ]);
    session(RUN_ID, NOW - 60_000, "Collector lane", [{ type: "user", content: "port the collector" }]);
  }
  return { proj, store };
};
const envOf = (store) => ({ PATH: process.env.PATH, HOME: join(temp, "home"), GROK_CONFIG_DIR: store });
const collect = (proj, store, extra = {}) => collectRewind({ cwd: proj, since: "7d", max: 5, env: envOf(store), now: NOW, ...extra });
const board = (fixtureOptions, lang = "en", extra = {}) => {
  const { proj, store } = fixture(fixtureOptions);
  const data = collect(proj, store, extra);
  return { data, text: renderBoard(data, { lang, now: NOW }), proj, store };
};
const section = (text, heading) => {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## ${heading}`));
  assert.ok(start !== -1, `section ${heading} in\n${text}`);
  const end = lines.findIndex((line, index) => index > start && (line.startsWith("## ") || line === "---"));
  return lines.slice(start + 1, end === -1 ? undefined : end).filter((line) => line.trim());
};

const EN = ["🎯 Do this now", "📊 At a glance", "🏁 Milestones", "✅ Done lately", "⬜ Still to do", "🔔 Don't forget"];
const KO = ["🎯 지금 할 일", "📊 한눈에 보기", "🏁 마일스톤", "✅ 최근 끝낸 일", "⬜ 남은 일", "🔔 잊지 말 것"];

describe("lit-adhd board", () => {
  it("draws the six sections in the fixed order, in both languages", () => {
    for (const [lang, headings] of [["en", EN], ["ko", KO]]) {
      const { text } = board({}, lang);
      const positions = headings.map((heading) => text.indexOf(`## ${heading}`));
      assert.ok(positions.every((at) => at !== -1), `${lang}: every heading\n${text}`);
      assert.deepEqual([...positions].sort((a, b) => a - b), positions, `${lang}: fixed order`);
    }
  });

  it("draws ten-cell bars with k/n and a rounded percent", () => {
    assert.equal(boardBar(0, 4), "░░░░░░░░░░ 0/4");
    assert.equal(boardBar(2, 4), "█████░░░░░ 2/4");
    assert.equal(boardBar(4, 6, { percent: true }), "███████░░░ 4/6 (67%)");
    assert.equal(boardBar(1, 30), "█░░░░░░░░░ 1/30", "any progress shows one cell");
    assert.equal(boardBar(29, 30), "█████████░ 29/30", "unfinished never shows a full bar");
    assert.equal(boardBar(11, 11), "██████████ 11/11");
    assert.equal(boardBar(0, 0), null, "no total, no bar");
  });

  it("counts the four buckets and the overall bar from the records", () => {
    const { data, text } = board();
    assert.deepEqual(
      { done: data.board.glance.done, inProgress: data.board.glance.inProgress, waiting: data.board.glance.waiting, remaining: data.board.glance.remaining },
      { done: 4, inProgress: 1, waiting: 1, remaining: 2 },
    );
    const glance = section(text, "📊 At a glance");
    assert.equal(glance[0], "| ✅ Done | 🔄 In progress | ⏳ Waiting on you | ⬜ Left |");
    assert.equal(glance[2], "| 4 | 1 | 1 | 2 |");
    assert.equal(glance[3], "Overall  ███████░░░ 4/6 (67%)");
    const ko = section(board({}, "ko").text, "📊 한눈에 보기");
    assert.equal(ko[0], "| ✅ 끝남 | 🔄 진행 중 | ⏳ 나를 기다림 | ⬜ 남음 |");
    assert.equal(ko[3], "전체 진행  ███████░░░ 4/6 (67%)");
  });

  it("lists milestones by title with their state and bar, never by file name", () => {
    const { text } = board();
    const rows = section(text, "🏁 Milestones");
    assert.equal(rows[0], "| Milestone | State | Progress | Last |");
    const kpi = rows.find((row) => row.startsWith("| KPI board |"));
    const auto = rows.find((row) => row.startsWith("| LitGrok autopilot |"));
    assert.match(kpi, /^\| KPI board \| 🔄 In progress \| █████░░░░░ 2\/4 \| .+ \|$/u);
    assert.match(auto, /^\| LitGrok autopilot \| ✅ Done \| ██████████ 2\/2 \| .+ \|$/u);
    assert.ok(rows.indexOf(kpi) < rows.indexOf(auto), "open before finished");
    assert.doesNotMatch(rows.join("\n"), /\.md|plans\/|Old idea/u, "titles, not paths; a stale plan is a reminder");
  });

  it("says the one thing to do now in plain words, with what to type", () => {
    const { text } = board();
    const now = section(text, "🎯 Do this now");
    assert.match(now[0], /^\*\*Answer the question in “ADHD lane”\*\* — .+/u);
    assert.match(now[0], /Which window should I start with\?/u);
    assert.match(now[1], /^👉 Type: /u);
    const ko = section(board({}, "ko").text, "🎯 지금 할 일");
    assert.match(ko[0], /^\*\*“ADHD lane” 질문에 답하기\*\* — /u);
    assert.match(ko[1], /^👉 입력: /u);
  });

  it("offers go when one plan is open and nothing runs, and keeps the next-step record", () => {
    const { data, text } = board({ sessions: false });
    assert.equal(data.next.kind, "start-plan");
    assert.equal(data.next.say, "go");
    const now = section(text, "🎯 Do this now");
    assert.match(now[0], /^\*\*Start KPI board: Draw the board\*\* — /u);
    assert.equal(now[1], "👉 Type: `go`");
    assert.equal(section(board({ sessions: false }, "ko").text, "🎯 지금 할 일")[1], "👉 입력: `go`");
  });

  it("tells the user to wait for a lane that is still working", () => {
    const { proj, store } = fixture();
    const data = collect(proj, store);
    const running = { ...data, sessions: data.sessions.filter((session) => session.status === "active") };
    running.next = { kind: "none", target: null, wait: { lanes: 1 } };
    const now = section(renderBoard(running, { lang: "en", now: NOW }), "🎯 Do this now");
    assert.match(now[1], /^👉 Wait: until “Collector lane” finishes$/u);
    const ko = section(renderBoard(running, { lang: "ko", now: NOW }), "🎯 지금 할 일");
    assert.match(ko[1], /^👉 기다리기: “Collector lane” 끝날 때까지$/u);
  });

  it("shows done lately newest first, capped at five, and what is left capped at seven", () => {
    const { proj, store } = fixture({ sessions: false });
    const rows = (prefix, n, checked) => Array.from({ length: n }, (_, i) => `- [${checked ? "x" : " "}] ${i + 1}. ${prefix} ${i + 1}`).join("\n");
    writeFileSync(join(proj, "plans", "2026-11-10-kpi-board.md"), `# KPI board\n\n${rows("Shipped", 8, true)}\n${rows("Todo", 9, false)}\n`);
    const data = collect(proj, store);
    const en = renderBoard(data, { lang: "en", now: NOW });
    const done = section(en, "✅ Done lately");
    assert.equal(done.length, 5, en);
    assert.equal(done[0], "- Shipped 8", "newest first, plan numbering dropped");
    const left = section(en, "⬜ Still to do");
    assert.equal(left.length, 8);
    assert.equal(left[0], "1. Todo 1", "plan order");
    assert.equal(left[6], "7. Todo 7");
    assert.equal(left[7], "…and 2 more");
    assert.equal(section(renderBoard(data, { lang: "ko", now: NOW }), "⬜ 남은 일")[7], "…외 2개");
  });

  it("keeps reminders action-shaped, most urgent first, at most five", () => {
    const { data, text } = board();
    const reminders = section(text, "🔔 Don't forget");
    assert.ok(reminders.length >= 3 && reminders.length <= 5, text);
    for (const line of reminders) assert.match(line, /^- \S+ .+ → .+$/u, line);
    assert.match(reminders[0], /^- ⏳ “ADHD lane” asked: “Which window should I start with\?” → /u, "waiting first");
    const uncommitted = reminders.find((line) => line.startsWith("- 💾"));
    const count = data.board.reminders.find((item) => item.kind === "uncommitted").count;
    assert.ok(count >= 2, "modified README plus untracked plans");
    assert.match(uncommitted, new RegExp(`^- 💾 ${count} uncommitted changes \\(proj-\\d+\\) → `, "u"));
    assert.match(reminders.join("\n"), /^- 🏃 1 lane still working → don't type `go` until it finishes$/mu);
    assert.match(reminders.join("\n"), /^- 🕰️ Plan untouched for 40 days: Old idea → decide whether to pick it up or drop it$/mu);
    const ko = section(board({}, "ko").text, "🔔 잊지 말 것");
    assert.match(ko.join("\n"), /^- 🏃 아직 일하는 레인 1개 → 끝날 때까지 `go` 치지 않기$/mu);
    assert.match(ko.join("\n"), /^- 🕰️ 40일째 멈춘 계획: Old idea → 이어 할지, 접을지 정하기$/mu);
    assert.match(ko.join("\n"), /^- 💾 커밋 안 된 변경 \d+개 \(proj-\d+\) → /mu);
  });

  it("caps reminders at five when more facts are on record", () => {
    const { proj, store } = fixture();
    for (const name of ["a", "b", "c", "d"]) {
      const path = join(proj, "plans", `2026-08-0${name.charCodeAt(0) - 96}-${name}.md`);
      writeFileSync(path, `# Stale ${name}\n\n- [ ] 1. Idea ${name}\n`);
      age(path, 20);
    }
    const data = collect(proj, store);
    assert.ok(data.board.reminders.length > 5, "more facts than the cap");
    assert.equal(section(renderBoard(data, { lang: "en", now: NOW }), "🔔 Don't forget").length, 5);
  });

  it("never shows a session id, commit hash, raw status code or internal path", () => {
    for (const lang of ["en", "ko"]) {
      const { text, proj } = board({}, lang);
      const head = git(proj, "rev-parse", "HEAD").trim();
      for (const banned of [WAIT_ID, WAIT_ID.slice(0, 8), RUN_ID.slice(0, 8), head.slice(0, 7), "waiting-on-user", "plans/", ".md", proj, ".grok"]) {
        assert.ok(!text.includes(banned), `${lang}: ${banned} leaked\n${text}`);
      }
      assert.doesNotMatch(text, /\b(?:idle|ended|unknown)\b/u, `${lang}: raw status words`);
    }
  });

  it("prints one plain line for every empty section", () => {
    const proj = freshDir("empty");
    git(proj, "init", "-q");
    const data = collectRewind({ cwd: proj, since: "7d", env: envOf(join(temp, "no-store")), now: NOW });
    const en = renderBoard(data, { lang: "en", now: NOW });
    assert.deepEqual(section(en, "🏁 Milestones"), ["No plans in this window"]);
    assert.deepEqual(section(en, "✅ Done lately"), ["Nothing done yet"]);
    assert.deepEqual(section(en, "⬜ Still to do"), ["Nothing left"]);
    assert.deepEqual(section(en, "🔔 Don't forget"), ["Nothing to remember"]);
    assert.match(en, /^Overall  no plan rows on record$/mu, "no total, no bar");
    const ko = renderBoard(data, { lang: "ko", now: NOW });
    assert.deepEqual(section(ko, "⬜ 남은 일"), ["남은 일이 없어요"]);
    assert.deepEqual(section(ko, "✅ 최근 끝낸 일"), ["아직 끝낸 일이 없어요"]);
    assert.deepEqual(section(ko, "🔔 잊지 말 것"), ["잊을 일이 없어요"]);
    assert.deepEqual(section(ko, "🏁 마일스톤"), ["이 기간에 계획이 없어요"]);
  });

  it("stays at about forty lines, even with every list full", () => {
    assert.ok(board().text.trimEnd().split("\n").length <= 40, "the fixture board");
    const { proj, store } = fixture();
    for (let i = 0; i < 6; i += 1) writeFileSync(join(proj, "plans", `2026-11-0${i + 1}-extra-${i}.md`), `# Extra ${i}\n\n- [x] Done ${i}\n- [ ] Left ${i}a\n- [ ] Left ${i}b\n`);
    for (const name of ["a", "b", "c", "d"]) {
      const path = join(proj, "plans", `2026-08-0${name.charCodeAt(0) - 96}-${name}.md`);
      writeFileSync(path, `# Stale ${name}\n\n- [ ] 1. Idea ${name}\n`);
      age(path, 20);
    }
    for (const lang of ["en", "ko"]) {
      const text = renderBoard(collect(proj, store), { lang, now: NOW });
      assert.ok(text.trimEnd().split("\n").length <= 44, `${lang}: ${text.split("\n").length} lines\n${text}`);
      assert.match(text, lang === "en" ? /## 🏁 Milestones \(4 of 8\)/u : /## 🏁 마일스톤 \(8개 중 4개\)/u);
    }
  });

  it("emits the ready board and its fields from the collector, the session detail only on request", () => {
    const { proj, store } = fixture();
    const run = (...args) => spawnSync(process.execPath, [rewind, ...args], { cwd: proj, encoding: "utf8", env: envOf(store) });
    const plain = run("--brief", "--lang", "en");
    assert.equal(plain.status, 0, plain.stderr);
    assert.ok(plain.stdout.startsWith("## 🎯 Do this now\n"), plain.stdout);
    assert.doesNotMatch(plain.stdout, /### 🌿|RECOMMENDED NEXT STEP|WAITING ON YOU/u, "no session cards by default");
    const detail = run("--brief", "--detail", "--lang", "en");
    assert.equal(detail.status, 0, detail.stderr);
    assert.ok(detail.stdout.startsWith("## 🎯 Do this now\n"), "the board stays on top");
    const cards = detail.stdout.indexOf("### 🌿");
    assert.ok(cards > detail.stdout.indexOf("## 🔔 Don't forget"), "session detail under the board");
    assert.match(detail.stdout, /RECOMMENDED NEXT STEP/u);
    const json = JSON.parse(run("--json", "--lang", "ko").stdout);
    assert.equal(json.board.glance.done, 4);
    assert.equal(json.board.text, renderBoard(json, { lang: "ko", now: Date.parse(json.generatedAt) }));
    assert.match(json.board.text, /^## 🎯 지금 할 일/u);
  });

  it("is what the skill tells the model to show, as given", () => {
    const body = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
    for (const heading of EN) assert.ok(body.includes(heading.slice(heading.indexOf(" ") + 1)), heading);
    assert.match(body, /--detail/u, "detail route documented");
    assert.match(body, /lit adhd detail/u);
    assert.match(body, /자세히/u);
    assert.match(body, /as given|exactly as drawn/u);
    const rule = readFileSync(join(root, ".grok", "rules", "00-litgrok.md"), "utf8");
    assert.match(rule, /## Brief over sessions[\s\S]{0,700}board/u, "the rule names the board");
  });
});
