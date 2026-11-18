// The lit-adhd verdict: the default answer to `lit adhd`, about six lines drawn from the collected
// records alone. A fixed, versioned ladder picks ONE action; the model prints the card as drawn.
//
//   line 1  what changed since the user last looked        `18:02 이후: 2개 끝남, 1개가 너를 기다림`
//   line 2  the one action and where to do it              `지금 할 일: api 에서 질문에 답하기 #a1b2c3`
//   line 3  the exact text to type                         `입력: \`go\``
//   line 4  why, and the cost of leaving it                `이유: … · 안 하면: …`
//   line 5  what waits after it (at most two)              `다음 대기: …`
//   line 6  how much of the record was read                `읽음 6/7 세션 — 못 읽음: 읽기 예산 초과 1`
//
// Evidence gates: a plan whose rows are all ticked and a commit are proven done. A session whose last
// words claim it finished is a claim, and claims never count. Each action carries a fingerprint of
// the records it rests on, so a card whose state moved says the old action is withdrawn. A push, a
// publish or a release is never the action; it waits in line 5 as a question for the user. "Nothing
// to do" is said only when every source was read. The cursor (when the user last looked) lives in
// `.grok/litgrok/adhd/cursor.json` and is read and written by the CLI, never here.
import { createHash } from "node:crypto";
import { basename } from "node:path";

import { clipToWidth } from "./gauge.mjs";

export const VERDICT_LADDER_VERSION = "litgrok-adhd-verdict.v1";
const CLIP = 60;

const WORDS = {
  ko: {
    since: (time) => `${time} 이후`,
    first: "처음 봄 — 비교할 기준 없음",
    changed: (done, waiting) => `${done}개 끝남, ${waiting}개가 너를 기다림`,
    still: "바뀐 것 없음",
    withdrawn: (fp) => `지난 할 일 #${fp} 철회 — 상태가 바뀜`,
    doNow: "지금 할 일",
    place: (where, action) => (where ? `${where} 에서 ${action}` : action),
    type: "입력",
    typeOwnWords: (where) => `없음 — ${where ?? "그 세션"}에서 직접 답하기`,
    typeWait: "없음 — 끝날 때까지 기다리기",
    why: "이유",
    ifNot: "안 하면",
    queue: "다음 대기",
    ask: "네 확인 필요",
    read: (read, found) => `읽음 ${read}/${found} 세션`,
    missing: "못 읽음",
    clear: (count) => `지금 할 일 없음 — 확인한 기록 ${count}개`,
    hold: "판단 보류 — 못 읽은 기록이 있음",
    gaps: { budget: "읽기 예산 초과", limit: "최대 개수 초과", unreadable: "읽을 수 없음", sessions: "세션 기록 없음", git: "git 상태" },
    act: {
      approve: (plan) => `${plan}의 멈춘 단계 승인 또는 거절`,
      answer: (question) => (question ? `질문에 답하기: ${question}` : "질문에 답하기"),
      resume: (skill) => `멈춘 ${skill} 이어가기`,
      continue: (plan) => `${plan} 계속 진행`,
      start: (plan) => `${plan} 실행 시작`,
      wait: (lanes) => `기다리기 — 다른 세션 ${lanes}개가 일하는 중`,
      dirty: (count) => `커밋 안 된 파일 ${count}개 확인`,
      row: (item) => `다음 항목: ${item}`,
    },
    because: {
      approve: "그 작업이 네 승인을 기다림",
      answer: "그 세션이 네 답을 기다림",
      resume: "이 세션의 작업이 멈춰 있음",
      continue: "이 세션의 start-work가 진행 중",
      start: "열린 계획이 하나뿐이고 돌고 있는 세션이 없음",
      wait: "다른 세션이 이 저장소에서 일하는 중",
      dirty: "아직 커밋 안 된 변경이 있음",
      row: "계획에 체크 안 된 항목이 남음",
    },
    otherwise: {
      approve: "그 작업이 멈춘 채로 남음, 잃는 것은 없음",
      answer: "그 세션이 계속 기다림",
      resume: "멈춘 그대로 남음",
      continue: "남은 항목이 그대로 남음",
      start: "계획이 시작되지 않은 채 남음",
      wait: "없음",
      dirty: "변경이 커밋 안 된 채 남음",
      row: "계획이 그대로 남음",
    },
    push: (where, count) => `${where}의 커밋 ${count}개를 push 할까?`,
    stale: (name, days) => `${name} 계획이 ${days}일째 그대로 — 계속할지 닫을지`,
    waitsAt: (where) => `${where} 세션이 답을 기다림`,
    more: (count) => `(+${count})`,
  },
  en: {
    since: (time) => `Since ${time}`,
    first: "First look — nothing to compare with",
    changed: (done, waiting) => `${done} finished, ${waiting} waiting on you`,
    still: "nothing changed",
    withdrawn: (fp) => `last action #${fp} withdrawn — the state moved`,
    doNow: "Do now",
    place: (where, action) => (where ? `in ${where}: ${action}` : action),
    type: "Type",
    typeOwnWords: (where) => `nothing — answer in ${where ?? "that session"} yourself`,
    typeWait: "nothing — wait until they finish",
    why: "Why",
    ifNot: "If not",
    queue: "Next waiting",
    ask: "Your call",
    read: (read, found) => `Read ${read}/${found} sessions`,
    missing: "not read",
    clear: (count) => `Nothing to do now — ${count} records checked`,
    hold: "No verdict — some records were not read",
    gaps: { budget: "read budget spent", limit: "over the session cap", unreadable: "unreadable", sessions: "no session records", git: "git state" },
    act: {
      approve: (plan) => `approve or deny the parked step of ${plan}`,
      answer: (question) => (question ? `answer: ${question}` : "answer its question"),
      resume: (skill) => `resume the paused ${skill}`,
      continue: (plan) => `continue ${plan}`,
      start: (plan) => `start ${plan}`,
      wait: (lanes) => `wait — ${lanes} other session(s) at work`,
      dirty: (count) => `review ${count} uncommitted file(s)`,
      row: (item) => `next item: ${item}`,
    },
    because: {
      approve: "that run waits for your approval",
      answer: "that session waits for your answer",
      resume: "this session's work is paused",
      continue: "this session's start-work is running",
      start: "one open plan and no session running",
      wait: "another session is working in this repository",
      dirty: "there are uncommitted changes",
      row: "the plan still has unticked rows",
    },
    otherwise: {
      approve: "the run stays parked, nothing is lost",
      answer: "that session keeps waiting",
      resume: "it stays paused",
      continue: "the open rows stay open",
      start: "the plan stays unstarted",
      wait: "nothing",
      dirty: "the changes stay uncommitted",
      row: "the plan stays as it is",
    },
    push: (where, count) => `push ${count} commit(s) in ${where}?`,
    stale: (name, days) => `${name} untouched for ${days} days — keep it or close it?`,
    waitsAt: (where) => `the session in ${where} waits for an answer`,
    more: (count) => `(+${count})`,
  },
};

const placeOf = (worktree) => (worktree && worktree !== "unknown" ? basename(String(worktree)) : null);
const clipped = (text) => clipToWidth(String(text ?? "").replace(/[`*_]/gu, "").replace(/\s+/gu, " ").trim(), CLIP);
const planName = (path) => clipped(basename(String(path ?? "plan")).replace(/\.md$/u, "").replace(/^\d{4}-\d{2}-\d{2}-/u, ""));
const questionOf = (result) => {
  const parts = String(result ?? "").split(/(?<=[.!?？。])\s+|\n+/u);
  const asked = parts.filter((part) => /[?？]\s*$/u.test(part)).at(-1);
  return asked ? clipped(asked) : null;
};

export const fingerprint = (parts) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 6);

/** What is proven finished: plans with every row ticked, and commits. A session's own claim is not here. */
export const provenDone = (data) => [
  ...(data.roadmap?.plans ?? []).filter((plan) => plan.complete && plan.progress?.total > 0).map((plan) => `plan:${plan.worktree}:${plan.plan}`),
  ...(data.commits ?? []).map((commit) => `commit:${commit.hash}`),
];

const waitingOn = (data) => (data.sessions ?? []).filter((session) => !session.self && session.status === "waiting-on-user");

/** Which records could not be read, from the collector's own coverage counts. */
export const coverageOf = (data) => {
  const notRead = data.coverage?.notRead ?? {};
  const missing = [];
  for (const reason of ["budget", "limit", "unreadable"]) if (notRead[reason] > 0) missing.push({ reason, count: notRead[reason] });
  if (data.sources?.transcripts !== "ok") missing.push({ reason: "sessions", count: null });
  if (data.sources?.git !== "ok" && !(data.worktreeState ?? []).some((tree) => tree.uncommitted !== null)) missing.push({ reason: "git", count: null });
  const read = (data.sessions ?? []).length;
  const found = read + missing.reduce((sum, item) => sum + (item.count ?? 0), 0);
  return { read, found, missing, full: missing.length === 0 };
};

/**
 * The ladder, top rule first. A rule returns null or the action it proves. Changing the order or the
 * meaning of a rule changes VERDICT_LADDER_VERSION and the fixtures that pin it.
 */
export const LADDER = Object.freeze([
  ["approve-parked-step", (data) => (data.next?.kind === "approve-boundary"
    ? { kind: "approve", where: null, subject: planName(data.next.target?.plan), type: "lit approve", fp: fingerprint(["approve", data.next.target]), pre: "a parked start-work step waits for the user" }
    : null)],
  ["answer-waiting-session", (data) => {
    const session = waitingOn(data)[0];
    return session ? { kind: "answer", where: placeOf(session.worktree), subject: questionOf(session.result), type: null, fp: fingerprint(["answer", session.id8, session.last]), pre: "that session's last turn asked the user" } : null;
  }],
  ["resume-own-frame", (data) => (data.next?.kind === "resume-frame"
    ? { kind: "resume", where: null, subject: data.next.target?.skill ?? "work", type: "lit continue", fp: fingerprint(["resume", data.next.target]), pre: "this session's frame is paused" }
    : null)],
  ["continue-own-run", (data) => (data.next?.kind === "continue-work"
    ? { kind: "continue", where: null, subject: planName(data.next.target?.plan), type: "go", fp: fingerprint(["continue", data.next.target]), pre: "this session's start-work is running" }
    : null)],
  ["other-sessions-at-work", (data) => (data.next?.wait?.lanes
    ? { kind: "wait", where: null, subject: data.next.wait.lanes, type: null, fp: fingerprint(["wait", data.next.wait.lanes]), pre: "another session is active here" }
    : null)],
  ["start-only-open-plan", (data) => (data.next?.kind === "start-plan"
    ? { kind: "start", where: null, subject: planName(data.next.target?.plan), type: "go", fp: fingerprint(["start", data.next.target]), pre: "one open plan, nothing running" }
    : null)],
  ["review-uncommitted", (data) => {
    const tree = (data.worktreeState ?? []).find((item) => item.uncommitted > 0);
    return tree ? { kind: "dirty", where: tree.local ? null : placeOf(tree.worktree), subject: tree.uncommitted, type: "git status", fp: fingerprint(["dirty", tree.worktree, tree.uncommitted]), pre: "the worktree has uncommitted changes" } : null;
  }],
  ["next-unticked-row", (data) => {
    const plans = data.roadmap?.plans ?? [];
    const plan = plans.find((item) => item.local && item.current) ?? plans.find((item) => item.current);
    return plan ? { kind: "row", where: plan.local ? null : placeOf(plan.worktree), subject: clipped(plan.current), type: plan.local ? `start-work ${plan.plan}` : null, fp: fingerprint(["row", plan.plan, plan.current]), pre: "that row is still unticked" } : null;
  }],
]);

/** Everything else that waits on the user; irreversible steps only as questions. */
const queueOf = (data, action, words) => {
  const items = [];
  for (const session of waitingOn(data)) {
    if (action?.kind === "answer" && action.fp === fingerprint(["answer", session.id8, session.last])) continue;
    items.push(words.waitsAt(placeOf(session.worktree) ?? session.id8));
  }
  for (const tree of data.worktreeState ?? []) if (tree.unpushed > 0) items.push(`${words.ask}: ${words.push(placeOf(tree.worktree) ?? "this worktree", tree.unpushed)}`);
  for (const plan of [...(data.roadmap?.stalePlans ?? [])].sort((a, b) => b.days - a.days)) items.push(words.stale(planName(plan.plan), plan.days));
  return items;
};

/** The structured verdict: delta against the cursor, the one action (or none / hold), queue, coverage. */
export const decideVerdict = (data, { cursor = null } = {}) => {
  const done = provenDone(data);
  const since = cursor && Number.isFinite(Date.parse(cursor.at)) ? Date.parse(cursor.at) : null;
  const seen = new Set(Array.isArray(cursor?.seen) ? cursor.seen : []);
  const newlyDone = since === null ? null : done.filter((id) => !seen.has(id)).length;
  let action = null;
  let rule = null;
  for (const [name, test] of LADDER) {
    action = test(data);
    if (action) {
      rule = name;
      break;
    }
  }
  const coverage = coverageOf(data);
  const code = action ? (action.kind === "wait" ? "WAIT" : action.kind === "approve" || action.kind === "answer" ? "NEEDS_YOU" : "ONE_ACTION") : coverage.full ? "ALL_CLEAR" : "HOLD";
  const checked = done.length + (data.sessions ?? []).length + (data.roadmap?.plans ?? []).length + (data.worktreeState ?? []).length;
  return { version: VERDICT_LADDER_VERSION, code, rule, action, since, newlyDone, waiting: waitingOn(data).length, coverage, checked, done };
};

const clock = (ms) => {
  const date = new Date(ms);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/** The card as text, Korean by default. */
export const renderVerdict = (data, { lang = "ko", cursor = null } = {}) => {
  const words = WORDS[lang] ?? WORDS.ko;
  const verdict = decideVerdict(data, { cursor });
  const lines = [];
  if (verdict.since === null) lines.push(words.first);
  else {
    const moved = typeof cursor?.fp === "string" && /^[0-9a-f]{6}$/u.test(cursor.fp) && cursor.fp !== (verdict.action?.fp ?? null) ? ` · ${words.withdrawn(cursor.fp)}` : "";
    const change = verdict.newlyDone === 0 && verdict.waiting === 0 ? words.still : words.changed(verdict.newlyDone, verdict.waiting);
    lines.push(`${words.since(clock(verdict.since))}: ${change}${moved}`);
  }
  const { action } = verdict;
  if (action) {
    lines.push(`${words.doNow}: ${words.place(action.where, words.act[action.kind](action.subject))} #${action.fp}`);
    const typed = action.type ? `\`${action.type}\`` : action.kind === "wait" ? words.typeWait : words.typeOwnWords(action.where);
    lines.push(`${words.type}: ${typed}`);
    lines.push(`${words.why}: ${words.because[action.kind]} · ${words.ifNot}: ${words.otherwise[action.kind]}`);
  } else {
    lines.push(verdict.code === "ALL_CLEAR" ? words.clear(verdict.checked) : words.hold);
  }
  const queue = queueOf(data, action, words);
  if (queue.length) lines.push(`${words.queue}: ${queue.slice(0, 2).join(" · ")}${queue.length > 2 ? ` ${words.more(queue.length - 2)}` : ""}`);
  const { read, found, missing } = verdict.coverage;
  const gaps = missing.map((item) => `${words.gaps[item.reason]}${item.count ? ` ${item.count}` : ""}`).join(", ");
  lines.push(`${words.read(read, found)}${gaps ? ` — ${words.missing}: ${gaps}` : ""}`);
  return { text: `${lines.join("\n")}\n`, verdict };
};

/** The cursor after a card was shown: when the user looked, what they have now seen, the action's print. */
export const nextCursor = (verdict, now) => ({ version: 1, at: new Date(now).toISOString(), seen: verdict.done.slice(0, 300), fp: verdict.action?.fp ?? null });
