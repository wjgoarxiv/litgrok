# lit-adhd status taxonomy

The collector assigns every session exactly one status. The brief renders it in the user's language
with the words below and never invents a seventh.

| Status | Set when | English | 한국어 |
| --- | --- | --- | --- |
| `waiting-on-user` | The session's last word was the assistant asking something (a closing `?`, `lit approve`, `확인해 주세요`, `할까요`…) | waiting on you | 나를 기다림 |
| `active` | Written to within the last 15 minutes and not waiting, or a liveness record under 15 minutes old says `alive` | active | 진행 중 |
| `idle` | A liveness record under 15 minutes old says `idle` (a turn ended) and the session asked nothing | idle | 쉬는 중 |
| `done` | Its liveness record says `ended` (written by the SessionEnd hook), at any age | done | 마침 |
| `ended` | Quiet for longer than 15 minutes, with no SessionEnd record | ended | 끝남 |
| `unknown` | The records held no timestamp | unknown | 모름 |

Liveness records live at `.grok/litgrok/liveness/<key>.json`, where `<key>` is the first 32 hex digits of
the SHA-256 of the session id. A question the session asked still wins over any liveness record.

`waitingReason` says why a session waits (`asked the user`); name it in the card's status cell when
present: `waiting on you (asked the user)` / `나를 기다림 (질문에 답을 기다림)`.

Order in the brief: waiting sessions first, then active, idle, done, ended and unknown; newest first
inside each group. Waiting, active and idle sessions get cards; done and ended ones share the history
table, a done row marked ✓.

## Plans

A plan counts when its file changed inside the window; this worktree's plans are held to the window
too. A plan with every row checked stays in the roadmap as finished (`complete: true`, no current item)
and is counted in `roadmap.plansDone`. A plan outside the window, or one the read budget could not cover,
is not read and is counted in `roadmap.plansSkipped`; the brief's last line says how many.

## Sources

Each entry of `sources` is `ok` or `unknown`. An `unknown` source is named once on the brief's last
line and never filled in from memory.

| Key | Source |
| --- | --- |
| `transcripts` | Grok Build `sessions/<encoded cwd>/<session-id>/` |
| `plans` | `plans/*.md` checkbox rows |
| `handoffs` | `.handoff/HANDOFF.md`, else root `HANDOFF.md` |
| `git` | `git log --since` |
| `herdr` | `herdr agent list`, only with `HERDR_ENV=1` |

## Next-step kinds

| `next.kind` | Say | English | 한국어 |
| --- | --- | --- | --- |
| `start-plan` | `go` | start <plan> with start-work | <plan>을 start-work로 시작 |
| `none` | — | no next step on record | 기록된 다음 단계 없음 |
