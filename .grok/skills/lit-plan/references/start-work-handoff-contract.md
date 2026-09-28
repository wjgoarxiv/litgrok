# Lit-plan to start-work handoff contract

This contract defines when an approved plan becomes executable work and which receipts travel in both directions. It prevents planning language from being mistaken for authorization and prevents implementation evidence from being lost between sessions.

## Handoff decision table

| Plan state or execution condition | start-work action | Required receipt | Result |
| --- | --- | --- | --- |
| Plan is `draft` | Do not mutate | Plan revision and missing approval | Return for approval |
| Plan is `approved` and scope is clear | Begin baseline checks | Plan receipt | Execution opens |
| Plan is `approved` but paths drifted | Reconcile read-only state | Plan plus drift receipt | Continue only if method unchanged |
| New work exceeds included scope | Stop that branch | Scope-delta receipt | Request authority |
| Dirty file overlaps a planned edit | Preserve and inspect | Baseline diff receipt | Adapt or stop |
| Focused RED reproduces target behavior | Implement minimum change | Baseline receipt | Move to GREEN |
| Focused test fails for unrelated reason | Diagnose before editing | Failure and clean-baseline evidence | Classify blocker |
| Step passes focused verification | Record result and continue | Implementation receipt | Next dependency opens |
| Full suite fails after focused GREEN | Compare causal evidence | Verification receipt | Fix or classify |
| Real-surface probe cannot run | Do not claim completion | Blocked probe receipt | Report incomplete evidence |
| User changes objective mid-run | Supersede current plan | New request and affected steps | Replan changed portion |
| All required evidence is green | Close execution | All four receipts | Return completed result |

## Plan receipt

The plan receipt contains the plan path or identifier, revision, objective, included and excluded scope, constraints, ordered steps, verification map, approval state, and approving user turn. If approval was conditional, quote the condition in operational terms.

## Baseline receipt

The baseline receipt records working directory, repository identity, branch, dirty paths, target behavior before edits, focused RED command and exit, and any existing failures. Do not clean, stash, or rewrite unrelated state. When a failure might be pre-existing, compare against an isolated clean baseline before classifying it.

## Implementation receipt

For each completed step, record changed paths, the smallest implemented behavior, focused verification, cleanup performed, and departures from the planned method. A departure is acceptable only when it preserves objective, scope, constraints, and risk. Otherwise return to approval.

## Verification receipt

Record each final command with cwd, exit status, and pass/fail counts. Add pack, install, rendered, or runtime evidence when those surfaces changed. Distinguish automated green from human acceptance. Preserve blocked checks as blockers rather than silently dropping them.

## Delegation packet

When a `general-purpose` subagent owns an isolated step, send:

```text
TASK: <one plan step>
DELIVERABLE: <files or evidence>
SCOPE: <owned paths and explicit exclusions>
CONSTRAINTS: <safety and host boundaries>
VERIFY: <focused commands and real-surface probe>
RETURN: <receipt fields>
```

The parent remains responsible for integration, full verification, and scope. Do not send overlapping write ownership to parallel lanes. Use worktrees only when their isolation and later integration are part of the approved method.

## Session continuity

Before a session ends or compacts, persist the current plan revision, last completed step, receipts, dirty paths, open blocker, and exact next command. On resume, validate the repository and plan state before executing. Historical green output is not current evidence after later edits.

## Completion rule

`start-work` may say complete only when every approved step has an implementation receipt, every required gate has a verification receipt, the real surface has been exercised when applicable, and no unreported scope delta remains. A plan file alone proves none of those outcomes.
