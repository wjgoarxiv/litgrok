# Local wiki page format

This is the LitGrok format for durable task knowledge stored under the project `.grok/` state boundary. It is not a host configuration schema. Choose a project-approved wiki subdirectory and keep page links relative so the set remains portable.

## Header

```yaml
title: string
summary: string
status: current | draft | stale | superseded | disputed
updated: YYYY-MM-DD
source:
  - id: string
    location: string
    revision: string
```

`title` names one stable concept, procedure, decision, or system boundary. `summary` states the page's use in one or two sentences. `status` reflects evidence currency, not writing polish. `updated` is the date the claims were last checked. Each `source` item has a stable ID used by claim annotations in the body.

## Body sections

Use only sections that earn their place, in this order:

1. `Purpose` — why the page exists and which reader question it answers.
2. `Current contract` — concise present-tense behavior or decision.
3. `Operational procedure` — ordered actions with prerequisites and stop conditions.
4. `Decision record` — alternatives, chosen option, and evidence when a decision matters.
5. `Failure modes` — observable symptom, likely boundary, discriminating probe, and recovery.
6. `Examples` — real input and expected output when the contract is easy to misread.
7. `Provenance` — claim-to-source table required by the provenance contract.
8. `Open questions` — unresolved claims with owner or next evidence.
9. `Related pages` — relative links with the relationship stated.

Do not create empty headings. A short page can contain only Purpose, Current contract, Provenance, and Related pages.

## Claim annotation

For a load-bearing statement, append a compact source reference such as `[S1]`. When a paragraph mixes verified behavior and inference, split it and label the inference. Do not attach one citation to several unrelated claims.

## Naming and links

Use lowercase, stable, descriptive filenames with hyphens. Prefer concept names over dates unless the page is explicitly a dated decision record. Use relative Markdown links. Rename a page only after updating inbound links and leaving a clear supersession path where old references may persist.

## Update behavior

Update an existing page when its purpose and concept identity remain the same. Create a new page when the question, scope, or authority changes materially. Mark a page `superseded` when a newer page replaces its contract, and link both directions. Mark it `stale` when evidence is old but no replacement is ready. Mark it `disputed` when credible sources conflict.

## Example

```markdown
---
title: Hook trust boundary
summary: Explains why installed project hooks may remain inactive.
status: current
updated: 2026-08-27
source:
  - id: S1
    location: Grok Build project-trust documentation
    revision: retrieved 2026-08-27
---

# Hook trust boundary

## Purpose

Explain the activation step after a project payload installs hook files.

## Current contract

Project hook files require user trust through the documented trust flow before they run. [S1]

## Provenance

| Claim | Source | Status | Checked |
| --- | --- | --- | --- |
| Project hooks require trust | S1 | verified | 2026-08-27 |
```

## Validation

Before saving, check required header fields, relative links, source IDs, status consistency, duplicate concepts, and whether the page contains transient secrets or absolute local paths. A wiki page is durable only when another session can verify it without reconstructing the original conversation.
