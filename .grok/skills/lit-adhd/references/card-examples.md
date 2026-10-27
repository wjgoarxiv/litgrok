# lit-adhd brief examples

The collector draws the brief (`scripts/rewind.mjs --brief --lang en|ko`), and the skill prints it
exactly as drawn. Both examples below come from the same three fixture sessions: one that waits on
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
