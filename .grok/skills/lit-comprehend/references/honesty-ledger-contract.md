# Honesty ledger contract

The honesty ledger is the boundary between what the artifact says and what the evidence proves. It is a compact claim register, not a list of generic caveats.

## Ledger decision table

| Evidence state | Internal status | Reader-facing wording | Required action |
| --- | --- | --- | --- |
| Direct primary source inspected and matched | verified | State the observed result | Cite the source when needed |
| Reproducible command or test passed now | verified-by-probe | State the command-scoped result | Record command and exit |
| Derived value recomputed from verified inputs | derived | State the value and method | Cite inputs and calculation |
| Several independent sources agree | corroborated | Give the supported conclusion | Cite the sources when needed |
| Source supports only part of the claim | partial | State the supported part; mention a material gap once in the reply | Identify the unsupported portion internally |
| Evidence supports a likely mechanism, not direct observation | inferred | Describe the inference in ordinary language | Keep reasoning and alternatives internally |
| Sources disagree materially | conflicting | Explain the disagreement plainly when it affects the answer | Preserve both sources and seek a discriminator |
| Required source exists but was not accessible | blocked | Do not present the claim as established; name a needed action in the reply | Record the access boundary |
| No source was found | unknown | Leave the conclusion open without a status label | Name missing evidence internally |
| Evidence belongs to an older revision | stale | Date the statement or refresh it before calling it current | Recheck the current revision |
| Probe was planned but not run | untested | Do not imply success; state a needed action in the reply when material | Record the proposed probe |
| Claim falls outside the reader question | excluded | Omit it unless that changes the requested scope | Record a material scope change |

## Row format

```text
| Claim | Status | Evidence | Probe | Consequence |
```

`Claim` is one falsifiable proposition. `Status` is exactly one decision-table value. `Evidence` is a source-map identifier or `none`. `Probe` is the command, observation, or comparison that established the status, or the next discriminating probe for unresolved rows. `Consequence` states how the status changes the reader-facing answer.

## Granularity rules

Split a compound claim when its clauses have different statuses. Do not use one verified source to launder an adjacent inference. Merge rows only when they share evidence, status, and consequence. Keep implementation detail out unless it changes the explanation's conclusion.

If a claim changes status during the session, replace the current status but preserve the decisive evidence in the source map or working note. Do not leave contradictory active rows without explaining which revision supersedes the other.

## Language rules

Use direct language for `verified`, `verified-by-probe`, `derived`, and `corroborated` claims within their boundaries. Explicitly label `inferred`, `partial`, `conflicting`, `blocked`, `unknown`, `stale`, and `untested`. Do not weaken verified findings with protective language. Do not make unresolved findings sound complete through passive voice.

## Session continuity

Before compaction or handoff, copy unresolved rows and their next probes into durable session state. After resuming, validate source paths before reusing their status. A prior session's `verified-by-probe` remains historical evidence until the probe is rerun against the current revision.

## Invalid ledger patterns

- `Status: complete` without a defined decision-table meaning.
- Evidence described as “the repository” without a file or probe.
- A probe that is actually a planned command but is written in past tense.
- Multiple claims compressed into one row to hide a contradiction.
- Limitations repeated after every paragraph rather than expressed by claim status.
- A `verified` row whose source is generated from the claim itself.
