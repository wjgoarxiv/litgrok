# Executable plan schema

This is the LitGrok document format shared by `lit-plan` and `start-work`. It is a workflow artifact, not a Grok Build host schema. A plan must be detailed enough to execute but must not pretend that approval or implementation has occurred.

## Record

```yaml
objective: string
scope:
  included: [path-or-surface]
  excluded: [path-or-surface]
constraints: [string]
evidence:
  baseline: [receipt]
  unknowns: [question]
steps:
  - id: string
    outcome: string
    paths: [path]
    method: string
    dependencies: [step-id]
    verification: [command-or-observation]
    rollback: string
verification:
  focused: [command-or-probe]
  full: [command-or-probe]
  real_surface: [probe]
approval_state: draft | approved | superseded | blocked
```

## Field rules

For mechanical validation, serialize this same record as JSON without changing its keys or value types, then run `scripts/validate-plan.mjs <plan.json>` from the `lit-plan` directory. JSON is the checker's interchange format; it is not a Grok Build configuration schema.

`objective` states one observable end condition. It does not describe activity such as “improve code.” `scope.included` names authorized repository paths or host surfaces. `scope.excluded` captures nearby work that must remain untouched. `constraints` preserves explicit safety, compatibility, release, and evidence boundaries.

`evidence.baseline` records current behavior, relevant tests, dirty-tree state, and host facts. `evidence.unknowns` contains only questions that can materially change the method or scope. Resolve cheap read-only questions during planning; leave only genuine decisions.

Each step owns one outcome. `paths` must be precise enough to prevent sibling or unrelated edits. `method` describes the minimum viable approach without embedding a large speculative patch. `dependencies` form an acyclic order. `verification` proves that step's outcome. `rollback` names a safe reversal or explains why the step is non-mutating.

The top-level `verification` separates fast feedback, full product gates, and the real host surface the user touches. Do not treat a unit test as a substitute for installation, pack, rendering, or runtime evidence when the plan changes those paths.

`approval_state` is authoritative for execution. `draft` cannot be executed. `approved` permits only the recorded scope. `superseded` points to a newer plan. `blocked` names the missing authority or external state.

## Invariants

- The objective, scope, and constraints do not contradict one another.
- Every included path belongs to the authorized product.
- Every step changes or verifies something necessary to the objective.
- Every mutation has a focused check and a cleanup or rollback story.
- Destructive, publishing, trust, credential, or host-config actions require explicit authority even if a plan mentions them.
- A dirty working tree is preserved and classified before overlapping edits.
- Unsupported host schemas are blockers, not implementation opportunities.
- Approval covers the recorded plan revision only.

## Example

```yaml
objective: "Install the packaged tree idempotently into a temporary project"
scope:
  included: ["bin/installer.mjs", "test/installer.test.mjs"]
  excluded: ["registry publish", "user host config"]
constraints:
  - "preserve foreign files"
  - "dry-run must not mutate"
evidence:
  baseline:
    - "focused installer test exit 1 on missing whole-tree behavior"
  unknowns: []
steps:
  - id: "installer-tree"
    outcome: "walk every packaged payload file"
    paths: ["bin/installer.mjs", "test/installer.test.mjs"]
    method: "reuse the existing payload walk and conflict preflight"
    dependencies: []
    verification: ["node --test test/installer.test.mjs"]
    rollback: "revert the two scoped files"
verification:
  focused: ["node --test test/installer.test.mjs"]
  full: ["npm test"]
  real_surface: ["install into validated temporary project and inventory files"]
approval_state: approved
```

## Validation

Before presenting the plan, check that each referenced path exists or is explicitly marked to be created, each command has a working directory, each count has a source, and each real-surface probe avoids external side effects. The plan subagent has no shell and no edits, so its claims must come from supplied evidence or read/list/search inspection rather than invented command output.
