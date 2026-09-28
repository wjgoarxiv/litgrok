# general-purpose delegation packet

Load this format before assigning a bounded implementation, executable verification, or tool-assisted investigation to Grok Build's general-purpose subagent. This packet is plain-text workflow guidance, not a host configuration schema.

## Capability boundary

The documented general-purpose type is the default full-capability child. Full capability describes the child type, not user authorization. Its packet must preserve repository scope, release hard stops, privacy boundaries, and the parent's permission constraints. Verify the child's effective sandbox instead of assuming sandbox inheritance. The child has its own context and returns a summary to the parent.

Use it when the lane may need ordinary read, edit, or shell tools and can own a disjoint result. Do not use it for a read-only question that explore can answer, or a planning artifact that plan should draft.

## Required packet

Every packet contains:

    TASK: one observable outcome
    DELIVERABLE: exact files or evidence returned
    SCOPE: cwd, owned paths, allowed actions, and hard stops
    VERIFY: focused commands or probes with receipt fields

Add CONTEXT only for decisions and constraints the child cannot discover locally. Add RETURN FORMAT when integration depends on exact fields. Do not paste an entire session transcript.

TASK must name behavior, not activity. “Make installer refuse before mutation when one payload path is foreign” is bounded; “improve installer” is not.

DELIVERABLE must distinguish writable files from reported evidence. Name created paths, whether edits are allowed, and what the parent expects to inspect.

SCOPE must assign one owner per writable file, state that other agents share the filesystem, preserve dirty paths, and prohibit cleanup or history operations outside authority.

VERIFY must name the exact cwd and focused command. Require exit status, pass/fail counts, and the real behavior observed. A child must not infer release or external mutation authority from a verification instruction.

## Worked packet

    TASK: Add stdin fallback for passive hook event resolution. Prefer
    GROK_HOOK_EVENT, fall back to documented hookEventName, and fail only when
    both are absent. Preserve disagreement validation.

    DELIVERABLE: Modify only .grok/hooks/record-passive-event.mjs and the two
    named assertions in test/hook-drivers.test.mjs. Return the exact diff and
    RED/GREEN receipts.

    SCOPE: cwd is <repo>. You own only those two paths. Other agents share the
    filesystem; do not reset, stash, clean, rewrite docs, or touch another skill.
    No commit, push, tag, publish, trust grant, or host-config write.

    VERIFY: First run the two focused tests and preserve the intended RED.
    After implementation run the same command and report cwd, exit, pass/fail
    counts, stderr expectations, and cleanup state.

    RETURN FORMAT: CHANGED / RED / GREEN / PRESERVED / BLOCKERS.

This packet is complete because the child can identify exact ownership, old failure, new behavior, and evidence without reopening scope.

## Invalid packet

    TASK: Finish the feature.
    DELIVERABLE: Make everything pass.
    SCOPE: repository.
    VERIFY: run tests.

It is invalid because behavior is undefined, file ownership is absent, the command and cwd are missing, dirty state is unprotected, and external actions are not bounded. A full-capability child could reasonably choose mutually incompatible edits.

## Collision and state rules

Before launch, confirm no active writer owns the same file, manifest, snapshot, or generated payload. If ownership must transfer, stop the original writer and inspect live state first. Do not assign two writers with the intention to merge later in a shared checkout.

Require the child to inventory unexpected changes instead of reverting them. Temporary directories need exact paths and cleanup receipts. If a command backgrounds, the child must report task identity and final status or leave it explicitly running; elapsed time is not completion.

## Parent acceptance

The parent reads the actual diff, reruns load-bearing verification, checks status, and decides whether the outcome satisfies the original request. The child summary is not a passed gate by itself.

Reject the result when ownership was exceeded, evidence lacks command/cwd/status, a required test never went RED, a failure was called pre-existing without baseline, temporary state is unaccounted, or release/external state changed without authority.

## Return packet

A good return names changed paths, commands, cwd, statuses, counts, RED/GREEN behavior, preserved dirty state, assumptions, blockers, temporary resources, running tasks, and confirmation that forbidden external actions were not run.
