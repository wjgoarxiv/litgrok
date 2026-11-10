// The lit-adhd KPI board: the default answer to `lit adhd`. In ten seconds a reader learns the one
// thing to do now and what to type, what is done, what is left and what not to forget. `buildBoard`
// turns the collector's records into language-free facts (four buckets, counts, bars, milestones,
// done and remaining rows, reminders); `renderBoard` lays those facts out as Markdown in English or
// Korean. Both are pure, so the same records always draw the same board and the model only shows it.
// The board never prints a session id, a commit hash, a raw status code or an internal path; the only
// path it may print is one the reader has to type.

import { basename } from "node:path";

import { clipToWidth } from "./gauge.mjs";

const CELLS = 10;
const MILESTONES = 4;
const DONE_ROWS = 5;
const LEFT_ROWS = 7;
const REMINDERS = 5;

/** `███████░░░ 4/6`, with ` (67%)` on request; null unless a total above zero is known. */
export const boardBar = (done, total, { percent = false } = {}) => {
  if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(done) || done < 0) return null;
  const k = Math.min(done, total);
  let filled = Math.round((k * CELLS) / total);
  // Some progress always shows, and an unfinished plan never shows a full bar.
  if (k > 0 && k < total) filled = Math.min(CELLS - 1, Math.max(1, filled));
  const bar = `${"█".repeat(filled)}${"░".repeat(CELLS - filled)} ${k}/${total}`;
  return percent ? `${bar} (${Math.round((k * 100) / total)}%)` : bar;
};

const bare = (text) => String(text ?? "").replace(/\s+/gu, " ").trim();
// One line of data as Markdown text: no tags or code spans, emphasis and table marks escaped.
const plain = (text) => bare(text).replace(/[<>`]/gu, (ch) => ({ "<": "‹", ">": "›", "`": "'" }[ch])).replace(/[*_|[\]\\]/gu, (ch) => `\\${ch}`);
const code = (text) => `\`${String(text).replace(/`/gu, "'")}\``;
// A plan row as a sentence: `3. Draw the board` reads `Draw the board`.
const sentence = (text) => bare(text).replace(/^\d+[.)]\s*/u, "");
const placeName = (worktree) => {
  const name = basename(String(worktree ?? ""));
  return name && name !== "unknown" ? name : null;
};
const sessionName = (session) => {
  const title = [session.title, ...(session.asked ?? [])].find((text) => text && text !== "unknown");
  return title ? clipToWidth(bare(title), 40) : null;
};
// The last question a session asked, from its last assistant words.
const questionOf = (result) => {
  const found = [...String(result ?? "").matchAll(/[^.!?。？\n]{4,}[?？]/gu)].at(-1)?.[0];
  return found ? clipToWidth(bare(found), 80) : null;
};
const stepKey = (text) => sentence(text).toLowerCase();

/** The board's facts from the collected records: no wording, only what the records hold. */
export const buildBoard = (data) => {
  const sessions = (data.sessions ?? []).filter((session) => !session.self);
  const plans = data.roadmap?.plans ?? [];
  const next = data.next ?? { kind: "none" };
  const ticked = plans.reduce((sum, plan) => sum + (plan.rows ?? []).filter((row) => row.checked).length, 0);
  const left = plans.reduce((sum, plan) => sum + (plan.rows ?? []).filter((row) => !row.checked).length, 0);
  const waitingSessions = sessions.filter((session) => session.status === "waiting-on-user");
  const working = sessions.filter((session) => session.status === "active");
  const boundaries = (data.startWork ?? []).filter((work) => work.pendingBoundary);
  const herdrBusy = (data.herdr?.agents ?? []).filter((agent) => agent && typeof agent === "object" && !agent.self && agent.status === "working").length;
  const glance = {
    done: ticked,
    inProgress: sessions.filter((session) => session.status === "active" || session.status === "idle").length,
    waiting: waitingSessions.length + boundaries.length,
    remaining: left,
    progress: { done: ticked, total: ticked + left, bar: boardBar(ticked, ticked + left, { percent: true }) },
  };

  // Open before finished, this worktree before others, the most recently saved first.
  const byRecency = (a, b) => (b.changedMs ?? 0) - (a.changedMs ?? 0);
  const milestonesAll = [...plans].sort((a, b) => Number(a.complete) - Number(b.complete) || Number(b.local) - Number(a.local) || byRecency(a, b));
  const milestones = milestonesAll.slice(0, MILESTONES).map((plan) => ({
    title: plan.title ?? sentence(basename(plan.plan, ".md")),
    place: plan.local ? null : placeName(plan.worktree),
    state: plan.complete ? "done" : plan.progress?.done ? "inProgress" : "notStarted",
    done: plan.progress?.done ?? null,
    total: plan.progress?.total ?? null,
    bar: boardBar(plan.progress?.done, plan.progress?.total),
    changedMs: plan.changedMs ?? null,
  }));

  // Done lately: ticked rows, the most recently saved plan first and its later rows first.
  const doneRows = [...plans].sort(byRecency).flatMap((plan) => (plan.rows ?? []).filter((row) => row.checked).map((row) => sentence(row.title)).reverse());

  // The plan to work on now leads the remaining rows; the rest follow in plan order.
  const targetPlan = next.target?.plan ?? null;
  const open = plans.filter((plan) => !plan.complete).sort((a, b) => Number(b.plan === targetPlan) - Number(a.plan === targetPlan) || Number(b.local) - Number(a.local) || byRecency(a, b));
  const tagged = open.length > 1;
  const leftRows = open.flatMap((plan) => (plan.rows ?? []).filter((row) => !row.checked).map((row) => ({ text: sentence(row.title), plan: tagged ? plan.title ?? null : null })));

  const now = nowStep(data, { sessions, waitingSessions, working, herdrBusy, open });

  const reminders = [];
  for (const session of waitingSessions) reminders.push({ kind: "waiting", title: sessionName(session), question: questionOf(session.result) });
  for (const work of boundaries) reminders.push({ kind: "approve", action: work.pendingBoundary.action ?? null });
  for (const tree of data.worktreeState ?? []) {
    if (tree.uncommitted) reminders.push({ kind: "uncommitted", count: tree.uncommitted, place: placeName(tree.worktree) });
  }
  for (const tree of data.worktreeState ?? []) {
    if (tree.unpushed) reminders.push({ kind: "unpushed", count: tree.unpushed, place: placeName(tree.worktree) });
  }
  if (working.length + herdrBusy) reminders.push({ kind: "lanes", count: working.length + herdrBusy });
  for (const plan of data.roadmap?.stalePlans ?? []) reminders.push({ kind: "stale", title: plan.title, days: plan.days, place: plan.local ? null : placeName(plan.worktree) });
  const handoffItem = handoffNext(data);
  if (handoffItem && !(now.kind === "handoff" && now.item === handoffItem)) reminders.push({ kind: "handoff", item: handoffItem });

  return {
    now,
    glance,
    milestones,
    milestonesTotal: milestonesAll.length,
    doneLately: doneRows.slice(0, DONE_ROWS),
    doneTotal: doneRows.length,
    remaining: leftRows.slice(0, LEFT_ROWS),
    remainingMore: Math.max(0, leftRows.length - LEFT_ROWS),
    reminders,
  };
};

// The first `## Next` item of this worktree's handoff that no checked row or commit already did.
const handoffNext = (data) => {
  const doneSteps = new Set([
    ...(data.roadmap?.plans ?? []).flatMap((plan) => (plan.rows ?? []).filter((row) => row.checked).map((row) => stepKey(row.title))),
    ...(data.commits ?? []).map((commit) => stepKey(commit.subject)),
  ]);
  const handoff = (data.handoffs ?? []).find((item) => item.local && item.next?.length);
  const item = handoff?.next.find((entry) => !doneSteps.has(stepKey(entry)));
  return item ? clipToWidth(bare(item), 60) : null;
};

// "Do this now" keeps the next-step priority of next-step.mjs (a step that runs on a typed word wins)
// and, when none runs, the fallback order of the brief: a question waiting on the user, a paused
// frame, a lane still working, the next row of an open plan, the handoff's next item, the newest
// ended session, else nothing on record.
const nowStep = (data, { sessions, waitingSessions, working, open }) => {
  const next = data.next ?? { kind: "none" };
  const planOf = (path) => (data.roadmap?.plans ?? []).find((plan) => plan.plan === path);
  const target = next.target ?? {};
  if (next.kind === "resume-frame") return { kind: "resume", skill: target.skill ?? null, stage: target.stage ?? null, say: next.say };
  if (next.kind === "approve-boundary") return { kind: "approve", action: target.action ?? null, say: "lit approve", alt: "lit deny" };
  if (next.kind === "continue-work") return { kind: "continue", plan: planOf(target.plan)?.title ?? null, say: next.say };
  if (next.kind === "start-plan") {
    const plan = planOf(target.plan);
    return { kind: "start", plan: plan?.title ?? null, item: plan?.current ? sentence(plan.current) : null, done: plan?.progress?.done ?? null, total: plan?.progress?.total ?? null, say: next.say };
  }
  const waiting = waitingSessions[0];
  if (waiting) return { kind: "answer", title: sessionName(waiting), question: questionOf(waiting.result), say: null };
  const paused = (data.workflows ?? []).find((frame) => frame.status === "paused");
  if (paused && !next.wait?.lanes) return { kind: "resume-elsewhere", skill: paused.skill ?? null, stage: paused.stage ?? null, say: null };
  if (next.wait?.lanes || working.length) return { kind: "wait", lane: working[0] ? sessionName(working[0]) : null, lanes: Math.max(next.wait?.lanes ?? 0, working.length), say: null };
  // A plan in the worktree of a live session comes first, then this worktree's, then the newest.
  const liveTrees = new Set(sessions.filter((session) => session.status !== "ended" && session.status !== "done").map((session) => session.worktree));
  const plan = open.find((item) => item.current && liveTrees.has(item.worktree)) ?? open.find((item) => item.current && item.local) ?? open.find((item) => item.current);
  if (plan) {
    return {
      kind: "plan", plan: plan.title ?? null, item: sentence(plan.current), done: plan.progress?.done ?? null, total: plan.progress?.total ?? null,
      place: plan.local ? null : placeName(plan.worktree), say: `start-work ${plan.plan}`,
    };
  }
  const item = handoffNext(data);
  if (item) return { kind: "handoff", item, say: `lit ${item}` };
  const ended = sessions.find((session) => session.status === "ended" || session.status === "done");
  if (ended) return { kind: "pickUp", title: sessionName(ended), say: null };
  return { kind: "empty", say: null };
};

const WORDS = {
  en: {
    heads: { now: "🎯 Do this now", glance: "📊 At a glance", milestones: "🏁 Milestones", done: "✅ Done lately", left: "⬜ Still to do", remind: "🔔 Don't forget" },
    of: (shown, total) => `(${shown} of ${total})`,
    type: "👉 Type:",
    waitFor: "👉 Wait:",
    yourWords: "what to do next, in your own words",
    yourAnswer: "your answer, in that session's window",
    glanceHead: "| ✅ Done | 🔄 In progress | ⏳ Waiting on you | ⬜ Left |",
    overall: "Overall",
    noRows: "no plan rows on record",
    milestoneHead: "| Milestone | State | Progress | Last |",
    state: { done: "✅ Done", inProgress: "🔄 In progress", notStarted: "⬜ Not started" },
    noBar: "no total recorded",
    noPlans: "No plans in this window",
    noDone: "Nothing done yet",
    noLeft: "Nothing left",
    noReminders: "Nothing to remember",
    more: (n) => `…and ${n} more`,
    justNow: "just now",
    minutes: (n) => `${n}m ago`,
    today: (hm) => `today ${hm}`,
    days: (n) => `${n}d ago`,
    notRead: (list) => `Not read: ${list}.`,
    older: "Older sessions were not read (read budget used up).",
    sources: { transcripts: "session records", plans: "plans", git: "git" },
    now: {
      resume: ({ skill, stage }) => [`Resume the paused ${skill ?? "workflow"}`, `this session stopped${stage ? ` at ${stage}` : ""}`],
      approve: ({ action }) => ["Approve or deny start-work's request", `it waits for ${action ? `${action} ` : ""}access and never goes on by itself`],
      continue: ({ plan }) => [`Keep going with ${plan ?? "this session's run"}`, "this session's run is still open"],
      start: ({ plan, item }) => [`Start ${plan ?? "the open plan"}${item ? `: ${item}` : ""}`, "it is the one open plan and nothing else is running"],
      answer: ({ title, question }) => [`Answer the question in “${title ?? "that session"}”`, question ? `it asked: “${question}”` : "it is waiting for you"],
      "resume-elsewhere": ({ skill, stage }) => [`Resume the paused ${skill ?? "workflow"} in its own session`, `it stopped${stage ? ` at ${stage}` : ""}`],
      wait: ({ lanes }) => ["Let the running work finish first", `${lanes} ${lanes === 1 ? "lane is" : "lanes are"} still working`],
      plan: ({ plan, item, done, total, place }) => [`Next in ${plan ?? "the open plan"}: ${item}`, `${done !== null && total !== null ? `${done} of ${total} done` : "rows are left"}${place ? `, in ${place}` : ""}`],
      handoff: ({ item }) => [item, "the first open item under Next in the handoff"],
      pickUp: ({ title }) => [`Pick up where “${title ?? "the last session"}” stopped`, "the last session here has ended"],
      empty: () => ["Nothing on record to pick up", "no session, plan or handoff in this window"],
    },
    waitLane: (lane) => (lane ? `until “${lane}” finishes` : "until the other lanes finish"),
    remind: {
      waiting: ({ title, question }) => `⏳ “${title ?? "A session"}” ${question ? `asked: “${question}”` : "is waiting for you"} → answer it in that session's window`,
      approve: ({ action }) => `⏳ start-work waits for your OK${action ? ` (${action} access)` : ""} → type \`lit approve\` or \`lit deny\``,
      uncommitted: ({ count, place }) => `💾 ${count} uncommitted ${count === 1 ? "change" : "changes"}${place ? ` (${place})` : ""} → commit them, or decide to drop them`,
      unpushed: ({ count, place }) => `📤 ${count} unpushed ${count === 1 ? "commit" : "commits"}${place ? ` (${place})` : ""} → push when you are ready`,
      lanes: ({ count }) => `🏃 ${count} ${count === 1 ? "lane" : "lanes"} still working → don't type \`go\` until ${count === 1 ? "it finishes" : "they finish"}`,
      stale: ({ title, days, place }) => `🕰️ Plan untouched for ${days} days: ${title}${place ? ` (${place})` : ""} → decide whether to pick it up or drop it`,
      handoff: ({ item }) => `📌 Handoff next: ${item} → start it when you are ready`,
    },
  },
  ko: {
    heads: { now: "🎯 지금 할 일", glance: "📊 한눈에 보기", milestones: "🏁 마일스톤", done: "✅ 최근 끝낸 일", left: "⬜ 남은 일", remind: "🔔 잊지 말 것" },
    of: (shown, total) => `(${total}개 중 ${shown}개)`,
    type: "👉 입력:",
    waitFor: "👉 기다리기:",
    yourWords: "이어서 할 일을 직접 적기",
    yourAnswer: "그 세션 창에서 답 쓰기",
    glanceHead: "| ✅ 끝남 | 🔄 진행 중 | ⏳ 나를 기다림 | ⬜ 남음 |",
    overall: "전체 진행",
    noRows: "기록된 계획 항목 없음",
    milestoneHead: "| 마일스톤 | 상태 | 진행 | 최근 |",
    state: { done: "✅ 끝남", inProgress: "🔄 진행 중", notStarted: "⬜ 남음" },
    noBar: "전체 개수 기록 없음",
    noPlans: "이 기간에 계획이 없어요",
    noDone: "아직 끝낸 일이 없어요",
    noLeft: "남은 일이 없어요",
    noReminders: "잊을 일이 없어요",
    more: (n) => `…외 ${n}개`,
    justNow: "방금",
    minutes: (n) => `${n}분 전`,
    today: (hm) => `오늘 ${hm}`,
    days: (n) => `${n}일 전`,
    notRead: (list) => `읽지 못함: ${list}.`,
    older: "오래된 세션은 읽지 않았어요(읽기 예산 소진).",
    sources: { transcripts: "세션 기록", plans: "계획", git: "git" },
    now: {
      resume: ({ skill, stage }) => [`멈춘 ${skill ?? "워크플로"} 이어가기`, `이 세션이 ${stage ? `${stage}에서 ` : ""}멈춰 있어요`],
      approve: ({ action }) => ["start-work 요청을 승인하거나 거절하기", `${action ? `${action} ` : ""}권한을 기다리고, 저절로 넘어가지 않아요`],
      continue: ({ plan }) => [`${plan ?? "이 세션의 작업"} 계속하기`, "이 세션의 실행이 아직 열려 있어요"],
      start: ({ plan, item }) => [`${plan ?? "열린 계획"} 시작하기${item ? `: ${item}` : ""}`, "열린 계획이 하나뿐이고 다른 작업이 없어요"],
      answer: ({ title, question }) => [`“${title ?? "그 세션"}” 질문에 답하기`, question ? `물어본 것: “${question}”` : "나를 기다리고 있어요"],
      "resume-elsewhere": ({ skill, stage }) => [`멈춘 ${skill ?? "워크플로"}를 그 세션에서 이어가기`, `${stage ? `${stage}에서 ` : ""}멈춰 있어요`],
      wait: ({ lanes }) => ["돌고 있는 작업이 끝나기를 먼저 기다리기", `레인 ${lanes}개가 아직 일하는 중이에요`],
      plan: ({ plan, item, done, total, place }) => [`${plan ?? "열린 계획"} 다음 항목: ${item}`, `${done !== null && total !== null ? `${total}개 중 ${done}개 끝남` : "남은 항목이 있어요"}${place ? ` (${place})` : ""}`],
      handoff: ({ item }) => [item, "핸드오프 Next의 첫 번째 남은 항목이에요"],
      pickUp: ({ title }) => [`“${title ?? "마지막 세션"}”이 멈춘 곳에서 이어받기`, "이곳의 마지막 세션은 끝났어요"],
      empty: () => ["이어 할 기록이 없어요", "이 기간에 세션·계획·핸드오프가 없어요"],
    },
    waitLane: (lane) => (lane ? `“${lane}” 끝날 때까지` : "다른 레인이 끝날 때까지"),
    remind: {
      waiting: ({ title, question }) => `⏳ “${title ?? "한 세션"}” ${question ? `질문: “${question}”` : "세션이 나를 기다림"} → 그 세션 창에서 답하기`,
      approve: ({ action }) => `⏳ start-work 승인 대기${action ? `(${action} 권한)` : ""} → \`lit approve\` 또는 \`lit deny\` 입력`,
      uncommitted: ({ count, place }) => `💾 커밋 안 된 변경 ${count}개${place ? ` (${place})` : ""} → 커밋할지, 버릴지 정하기`,
      unpushed: ({ count, place }) => `📤 푸시 안 된 커밋 ${count}개${place ? ` (${place})` : ""} → 준비되면 푸시하기`,
      lanes: ({ count }) => `🏃 아직 일하는 레인 ${count}개 → 끝날 때까지 \`go\` 치지 않기`,
      stale: ({ title, days, place }) => `🕰️ ${days}일째 멈춘 계획: ${title}${place ? ` (${place})` : ""} → 이어 할지, 접을지 정하기`,
      handoff: ({ item }) => `📌 핸드오프 다음 할 일: ${item} → 준비되면 시작하기`,
    },
  },
};

// `just now`, `10m ago`, `today 15:40`, `3d ago`, in the machine's local time.
const lastSeen = (ms, now, w) => {
  if (!Number.isFinite(ms)) return "·";
  const minutes = Math.max(0, Math.floor((now - ms) / 60_000));
  if (minutes < 1) return w.justNow;
  if (minutes < 60) return w.minutes(minutes);
  const at = new Date(ms);
  if (at.toDateString() === new Date(now).toDateString()) {
    return w.today(`${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`);
  }
  return w.days(Math.max(1, Math.floor((now - ms) / 86_400_000)));
};

// Every string inside a fact is data; it is escaped here, never interpreted.
const escapeFacts = (facts) => Object.fromEntries(Object.entries(facts).map(([key, value]) => [key, typeof value === "string" ? plain(value) : value]));

/** The board as Markdown. `lang` is `ko` or `en`; `now` is the clock the "Last" column reads. */
export const renderBoard = (data, { lang = "en", now = Date.parse(data.generatedAt) || Date.now() } = {}) => {
  const w = WORDS[lang] ?? WORDS.en;
  const board = buildBoard(data);
  const out = [];

  const step = board.now;
  const [action, why] = w.now[step.kind](escapeFacts(step));
  out.push(`## ${w.heads.now}`, `**${action}** — ${why}`);
  if (step.kind === "wait") out.push(`${w.waitFor} ${w.waitLane(step.lane ? plain(step.lane) : null)}`);
  else if (step.say) out.push(`${w.type} ${code(step.say)}${step.alt ? ` / ${code(step.alt)}` : ""}`);
  else out.push(`${w.type} ${step.kind === "answer" ? w.yourAnswer : w.yourWords}`);

  const { glance } = board;
  out.push("", `## ${w.heads.glance}`, w.glanceHead, "|:--:|:--:|:--:|:--:|", `| ${glance.done} | ${glance.inProgress} | ${glance.waiting} | ${glance.remaining} |`, "", `${w.overall}  ${glance.progress.bar ?? w.noRows}`);

  const more = board.milestonesTotal > board.milestones.length ? ` ${w.of(board.milestones.length, board.milestonesTotal)}` : "";
  out.push("", `## ${w.heads.milestones}${more}`);
  if (board.milestones.length) {
    out.push(w.milestoneHead, "|---|---|---|---|");
    for (const row of board.milestones) {
      const name = `${plain(row.title)}${row.place ? ` · ${plain(row.place)}` : ""}`;
      out.push(`| ${name} | ${w.state[row.state]} | ${row.bar ?? w.noBar} | ${lastSeen(row.changedMs, now, w)} |`);
    }
  } else {
    out.push(w.noPlans);
  }

  out.push("", `## ${w.heads.done}`);
  out.push(...(board.doneLately.length ? board.doneLately.map((text) => `- ${plain(text)}`) : [w.noDone]));

  out.push("", `## ${w.heads.left}`);
  if (board.remaining.length) {
    out.push(...board.remaining.map((row, index) => `${index + 1}. ${plain(row.text)}${row.plan ? ` · ${plain(row.plan)}` : ""}`));
    if (board.remainingMore) out.push(w.more(board.remainingMore));
  } else {
    out.push(w.noLeft);
  }

  out.push("", `## ${w.heads.remind}`);
  const reminders = board.reminders.slice(0, REMINDERS).map((item) => `- ${w.remind[item.kind](escapeFacts(item))}`);
  out.push(...(reminders.length ? reminders : [w.noReminders]));

  // A source that could not be read stays visible, once, under the board.
  const unread = ["transcripts", "plans", "git"].filter((name) => data.sources?.[name] && data.sources[name] !== "ok").map((name) => w.sources[name]);
  const notes = [unread.length ? w.notRead(unread.join(", ")) : null, data.budget?.exhausted ? w.older : null].filter(Boolean);
  if (notes.length) out.push("", "---", `*${notes.join(" ")}*`);
  return `${out.join("\n")}\n`;
};
