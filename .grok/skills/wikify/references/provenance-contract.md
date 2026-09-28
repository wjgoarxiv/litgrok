# Wiki provenance contract

Provenance connects each durable wiki claim to evidence that another session can inspect. It prevents polished notes from becoming an authority merely because they survived longer than their sources.

## Provenance decision table

| Source condition | Page status | Claim treatment | Required follow-up |
| --- | --- | --- | --- |
| Current primary source supports claim | current | State directly with source ID | Record revision and checked date |
| Current live probe supports claim | current | State probe-bounded result | Record command, cwd, exit |
| Derived artifact has verified inputs | current | Label method and inputs | Preserve derivation receipt |
| Source supports only part | draft | Narrow or split claim | Identify unsupported clause |
| Source revision is older than current system | stale | Date-bound claim | Refresh evidence |
| Credible sources conflict | disputed | Present both interpretations | Record discriminating probe |
| Source cannot be located | draft | Mark source unknown | Search or remove claim |
| Source exists but access is blocked | draft | Mark evidence inaccessible | Record boundary and owner |
| New page replaces old contract | superseded | Link to replacement | Update inbound links |
| Claim is inferred from several facts | current or draft | Label inference explicitly | Link every premise |
| Test passed before later edits | stale | Treat as historical | Rerun on current revision |
| User decision has no external source | current | Attribute as decision | Record date and scope |

## Provenance row

Use this table for material claims:

```text
| Claim | Source | Status | Checked | Notes |
```

`Claim` is one proposition. `Source` is a header source ID. `Status` is `verified`, `derived`, `inferred`, `partial`, `conflicting`, `unknown`, `blocked`, or `stale`. `Checked` is the evidence inspection date, not merely the page edit date. `Notes` carries a probe, scope boundary, or conflict discriminator.

## Source identity

For repository evidence, record project-relative path and revision when available. For a command, record cwd, command, exit status, and the smallest decisive output. For host documentation, record the page or dump identity and retrieval date. For user decisions, record that the source is the user decision and the scope it authorized.

Do not store credentials, authorization headers, private conversation text, or ephemeral temporary paths as provenance. If the source itself is sensitive, store a bounded identifier and access boundary rather than copying it into the wiki.

## Conflict protocol

When sources conflict, keep both active rows. State which source would ordinarily control and why that hierarchy may not settle the present claim. Add one discriminating observation or authority. Change page status to `disputed` until resolved. Never delete inconvenient evidence to restore a clean narrative.

## Refresh protocol

On page use, refresh only claims that control the current decision or are likely to drift. Update their checked date and revision. If a refresh changes the contract, preserve the prior decision in history or a superseded page when it remains useful. Do not mechanically update the page date while leaving claims unverified.

## Link integrity

Every related-page link states its relationship: prerequisite, implementation, decision history, failure guide, or replacement. A link is not provenance unless the linked page itself reaches a primary source. Detect circular chains where pages cite each other without an external source.

## Completion check

A page is provenance-complete when every load-bearing claim has a source or an explicit unresolved status, every source can be identified by another session, conflicts remain visible, and the page status matches its weakest material claim. A well-formatted page with unknown evidence remains `draft`.
