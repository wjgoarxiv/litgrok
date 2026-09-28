# plan delegation packet

Load this format before assigning an implementation-plan artifact to Grok Build's plan subagent. The packet is plain-text workflow guidance, not a host agent-definition schema.

## Capability boundary

The documented plan type drafts an implementation plan and has no shell or edits. It is appropriate for ambiguous architecture, unclear requirements, or high-impact restructuring after an objective is approved. It is not an approval gate by itself and does not authorize execution.

Do not send a clear one-path edit, obvious fix, formatting task, or pure source lookup to plan. Do not ask it to verify live commands. The parent supplies current repository evidence and owns later execution.

## Required packet

    TASK: the approved objective the plan must make decision-complete
    DELIVERABLE: ordered implementation steps, affected surfaces, risks, gates
    SCOPE: readable roots, fixed decisions, exclusions, no shell, no edits
    VERIFY: tie each proposed step to an existing file or documented surface

TASK should identify what success looks like without prescribing speculative machinery. DELIVERABLE should request sequencing, ownership, rollback or cleanup, RED/GREEN gates, and real-surface proof. SCOPE must list decisions that are closed so the planner does not reopen them. VERIFY is source traceability, not test execution.

## Worked packet

    TASK: Draft a decision-complete plan to add earned references to four named
    skills while preserving package installation and avoiding undocumented Grok
    surfaces. The objective and four skill assignments are already approved.

    DELIVERABLE: Ordered edits by skill; exact reference purposes; entry-point
    routing changes; structural RED tests; package/install verification; word
    count and corpus-spread receipts; cleanup and rollback notes.

    SCOPE: Read-only planning within <repo> plus the named local depth spec and
    primary Grok Build documentation. No shell, no edits, no sibling products.
    Fixed decisions: direct .grok payload, no custom agent files, no plugin
    schema, no version or release operation.

    VERIFY: Tie every file operation to an existing skill directory, package
    tree walk, or documented host surface. Mark any step that would need an
    undocumented field as blocked instead of inventing it.

    RETURN FORMAT: ASSUMPTIONS / FILE MAP / ORDERED STEPS / RED-GREEN GATES /
    REAL-SURFACE PROBE / RISKS / BLOCKERS.

This packet lets the planner resolve sequence and evidence while preserving closed product decisions.

## Invalid packet

    TASK: Decide what product to build and implement it.
    DELIVERABLE: Complete release.
    SCOPE: all files and services.
    VERIFY: make sure it works.

It is invalid because the objective is not approved, execution exceeds the plan type, scope includes unspecified external state, and verification cannot be performed without shell or runtime access. A plan child cannot manufacture authority or evidence.

## Decision completeness

A plan is decision-complete when an implementer can start each step without selecting between materially different designs. It names exact surfaces, source ownership, state transitions, tests, failure handling, package enrollment, real-user probe, and hard stops.

The plan should use minimum-first reasoning: reuse existing paths and standard behavior before adding helpers or files. It must not invent host schemas. When primary documentation is silent, the plan records a blocker or narrower honest behavior.

Avoid pseudo-precision. Line counts and word counts can be receipts, not design goals. Name why each reference or script earns its place. A plan that asks every skill to reach the same size fails the subject-driven depth goal.

## Plan-to-execution handoff

The returned plan should state which user decision authorizes execution and which decisions still require input. The parent presents or validates the plan, then assigns writable ownership separately. The plan subagent must not launch writers or imply that planning approval authorizes publish, commit, trust, login, or host configuration.

When execution begins, the implementer must re-read live files because the plan has no shell evidence and the shared workspace may have changed.

## Parent acceptance

Reject a plan that proposes non-existent files without purpose, treats a guessed schema as documented, omits RED evidence, stops at unit tests for a shipped surface, ignores dirty state, or leaves key choices to the implementer. Accept only after checking its file anchors against live source.

## Return packet

A complete return includes assumptions, fixed decisions, files and owners, ordered steps, tests with expected RED, verification ladder, package/install proof, risks, cleanup, blocked undocumented behavior, and decisions still requiring the user.
