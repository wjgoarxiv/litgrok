# lit-adhd board and brief examples

## The KPI board (default)

`scripts/rewind.mjs --brief --lang en|ko` draws the board, and the skill shows it as given. Both
examples below are real collector runs over one throwaway fixture repository: a finished plan with
three rows, a plan with two of five rows ticked, a plan nobody touched for twelve days, a session
that asked the user a question, a session still working, uncommitted changes and a handoff with a
`## Next` item. Counts, bars, titles and reminders come from those records; only the labels change
with the language.

How to read it in ten seconds: the bold line under **Do this now** is the one action and `👉` says
what to type (or what to wait for); the table under **At a glance** counts done, in progress,
waiting on you and left; **Milestones** gives each plan its bar; **Done lately** and **Still to do**
list the rows; **Don't forget** holds at most five `thing → what to do` reminders.

````markdown
## 🎯 Do this now
**Answer the question in “Release notes”** — it asked: “Should the notes mention the old installer?”
👉 Type: your answer, in that session's window

## 📊 At a glance
| ✅ Done | 🔄 In progress | ⏳ Waiting on you | ⬜ Left |
|:--:|:--:|:--:|:--:|
| 5 | 1 | 1 | 3 |

Overall  ██████░░░░ 5/8 (63%)

## 🏁 Milestones
| Milestone | State | Progress | Last |
|---|---|---|---|
| KPI board | 🔄 In progress | ████░░░░░░ 2/5 | 2m ago |
| LitGrok autopilot | ✅ Done | ██████████ 3/3 | 2d ago |

## ✅ Done lately
- Write the RED tests
- Pin the spec
- Ship the status line
- Port plan rows
- Port liveness

## ⬜ Still to do
1. Draw the board
2. Update the skill
3. Run the gates

## 🔔 Don't forget
- ⏳ “Release notes” asked: “Should the notes mention the old installer?” → answer it in that session's window
- 💾 3 uncommitted changes (kpi-demo) → commit them, or decide to drop them
- 🏃 1 lane still working → don't type `go` until it finishes
- 🕰️ Plan untouched for 12 days: Docs tour → decide whether to pick it up or drop it
- 📌 Handoff next: Write the evidence file → start it when you are ready
````

````markdown
## 🎯 지금 할 일
**“Release notes” 질문에 답하기** — 물어본 것: “Should the notes mention the old installer?”
👉 입력: 그 세션 창에서 답 쓰기

## 📊 한눈에 보기
| ✅ 끝남 | 🔄 진행 중 | ⏳ 나를 기다림 | ⬜ 남음 |
|:--:|:--:|:--:|:--:|
| 5 | 1 | 1 | 3 |

전체 진행  ██████░░░░ 5/8 (63%)

## 🏁 마일스톤
| 마일스톤 | 상태 | 진행 | 최근 |
|---|---|---|---|
| KPI board | 🔄 진행 중 | ████░░░░░░ 2/5 | 2분 전 |
| LitGrok autopilot | ✅ 끝남 | ██████████ 3/3 | 2일 전 |

## ✅ 최근 끝낸 일
- Write the RED tests
- Pin the spec
- Ship the status line
- Port plan rows
- Port liveness

## ⬜ 남은 일
1. Draw the board
2. Update the skill
3. Run the gates

## 🔔 잊지 말 것
- ⏳ “Release notes” 질문: “Should the notes mention the old installer?” → 그 세션 창에서 답하기
- 💾 커밋 안 된 변경 3개 (kpi-demo) → 커밋할지, 버릴지 정하기
- 🏃 아직 일하는 레인 1개 → 끝날 때까지 `go` 치지 않기
- 🕰️ 12일째 멈춘 계획: Docs tour → 이어 할지, 접을지 정하기
- 📌 핸드오프 다음 할 일: Write the evidence file → 준비되면 시작하기
````

What the board does not do:

- It shows no session id, commit hash, status code or plan file path. A plan is named by its first
  `# ` heading; a session by its title in quotes.
- It invents no reminder. The 💾 count is the worktree's `git status --porcelain` lines; the 🕰️ plan
  was last saved twelve days ago and still has a row left; the 🏃 lane is the session still working.
- It draws no bar without a total. With no plan rows the overall line says so in words.

`lit adhd detail` (`--detail`) prints the same board, a `---` rule, and then the per-session brief
below, unchanged.

# The per-session brief (detail)

The collector draws the brief under the board (`scripts/rewind.mjs --brief --detail --lang en|ko`),
and the skill prints it exactly as drawn. Both examples below come from the same three fixture sessions: one that waits on
the user, one still running with no recorded total, and one finished session, which collapses into
the ended table. Gauges, ids, titles, dates and names come from the records; only the connecting
words change with the language.

## How to read it in ten seconds

1. **Headline** (`## 🧭 …`): how many sessions, how many wait on you, how many are active, and the
   next step in plain words.
2. **Opener**, three lines: **Done so far** (finished plans, commits, sessions done), **Doing now**
   (waiting, active and idle counts), **Next** (the one step the box recommends).
3. **One card per live session** (waiting, active or idle), under a `### 🌿 branch · worktree` group:
   - badge: 🟠 waiting on you, 🟢 active, 🔵 idle, ⚫ unknown, with the reason it waits;
   - the goal in bold, from the session's title or its first ask;
   - a gauge only when both numbers are recorded (a session backed by a plan shows its plan's
     gauge), otherwise the known facts after ⏳ (how long it ran and its last ask), never a
     question-mark gauge;
   - ✅ what was done (edited files, commits, or the tools used before any edit) and ▶ what is next
     for that session, or what it is doing now.
4. **Done and ended sessions**, one table row each; a session that ended through SessionEnd is done
   and its id is marked ✓.
5. **Roadmap** timeline: ✓ finished commits with their dates, ✓ finished plans, ▶ the current item of
   each open plan with its gauge, ○ the items after it.
6. **One recommended next step** in a box (an untagged fence), and the word to type. A step that a
   checked plan row or a commit already did is never offered; with no open plan, the first remaining
   item under this worktree's HANDOFF.md `## Next` is the fallback.

## English

````markdown
## 🧭 3 sessions · 1 waits on you · 1 active · next: Answer sess-wai in proj: “Which window should I start with?”
*last 30d · 1 worktree*

**Done so far:** 1 commit
**Doing now:** 1 waits on you · 1 active
**Next:** Answer sess-wai in proj: “Which window should I start with?”

### 🌿 `unknown` · proj

> 🟠 **WAITING ON YOU** (it asked you something) · `sess-wai` · just now  
> **ADHD lane**  
> ⏳ 20m of work · last ask: “brief every session”  
> ✅ Done: no file edits or commits on record  
> ▶ Next: answer its question: “Which window should I start with?”

> 🟢 **ACTIVE** · `sess-run` · just now  
> **Collector lane**  
> ⏳ 1m of work · last ask: “port the collector”  
> ✅ Done: no file edits or commits on record  
> ▶ Next: still working in that session

### ⚪ Ended · 1

| id | where | goal | ago | done |
|---|---|---|---|---|
| `sess-old` | proj | Old lane | 5d | · |

### 🗺️ Roadmap `[▉░░] 1/3`

- ✓ 10-26 16:51 · `master` feat: scope the store
- ▶ **now** · `plans/brief.md` `[▉░░] 1/3` → 1. Collect records
  - ○ later · 2. Draw brief

```
╭─ RECOMMENDED NEXT STEP ──────────────────────────────────────╮
│ Answer sess-wai in proj: “Which window should I start with?” │
╰──────────────────────────────────────────────────────────────╯
```

Type **`go`** to continue.

*Not read: handoffs.*
````

## 한국어

````markdown
## 🧭 세션 3개 · 나를 기다리는 것 1 · 진행 중 1 · 다음: proj의 sess-wai에 답하기: “Which window should I start with?”
*최근 30d · 워크트리 1개*

**지금까지 한 일:** 커밋 1개
**지금 하는 일:** 나를 기다리는 것 1 · 진행 중 1
**다음:** proj의 sess-wai에 답하기: “Which window should I start with?”

### 🌿 `unknown` · proj

> 🟠 **나를 기다림** (질문에 답을 기다림) · `sess-wai` · 방금  
> **ADHD lane**  
> ⏳ 20m 작업 · 마지막 요청: “brief every session”  
> ✅ 한 일: 기록된 파일 수정·커밋 없음  
> ▶ 다음: 질문에 답하기: “Which window should I start with?”

> 🟢 **진행 중** · `sess-run` · 방금  
> **Collector lane**  
> ⏳ 1m 작업 · 마지막 요청: “port the collector”  
> ✅ 한 일: 기록된 파일 수정·커밋 없음  
> ▶ 다음: 그 세션에서 작업 중

### ⚪ 끝난 세션 · 1

| id | 위치 | 목표 | 끝난 지 | 한 일 |
|---|---|---|---|---|
| `sess-old` | proj | Old lane | 5d | · |

### 🗺️ 로드맵 `[▉░░] 1/3`

- ✓ 10-26 16:51 · `master` feat: scope the store
- ▶ **지금** · `plans/brief.md` `[▉░░] 1/3` → 1. Collect records
  - ○ 이후 · 2. Draw brief

```
╭─ 추천하는 다음 단계 ──────────────────────────────────────────╮
│ proj의 sess-wai에 답하기: “Which window should I start with?” │
╰───────────────────────────────────────────────────────────────╯
```

**`go`** 라고 입력하면 이어갑니다.

*읽지 못함: handoffs.*
````

## What the examples do not do

- They do not estimate the running session's progress. Its total is not recorded, so its card says
  how long it has run and what it was last asked, and shows no gauge.
- They do not describe work the records do not show: the running session has no edit or commit yet,
  so its done line names the tools it used and its next line what it is doing now.
- They offer one next step only, and do not start it; the user's `go` does.
