# Source verdict taxonomy

Assign a verdict to each source-claim pair, not to a source in the abstract. One document can be primary for a policy text, secondary for implementation behavior, and silent on a quantitative claim.

## Source verdict taxonomy

| Verdict | Claim relationship | Acceptable use | Required record |
| --- | --- | --- | --- |
| primary-direct | Source is the controlling or original record | Support the claim within explicit scope | Exact section, date, revision |
| primary-measured | Source contains original observations or data | Support measured result and method | Dataset/table and units |
| official-derived | Official source summarizes another controlling record | Support operational summary, not hidden method | Upstream citation and summary boundary |
| secondary-independent | Independent analysis examines primary evidence | Corroborate interpretation or context | Author, method, cited primary source |
| secondary-repeating | Source repeats another report without independent work | Navigation only | Upstream source it repeats |
| implementation-current | Current repository file or live read-only output | Support present implementation fact | Path or command and revision |
| implementation-historical | Archived file, release note, or old receipt | Support dated behavior only | Version and date boundary |
| conflicting | Credible sources disagree on the load-bearing claim | Present conflict, not consensus | Both sources and discriminating question |
| partial | Source supports only part of the proposition | Narrow the claim | Supported and unsupported clauses |
| stale | Source may have been superseded | Historical context only | Retrieval date and missing refresh |
| inaccessible | Identified source could not be opened | Explain evidence gap | Identifier and access failure |
| unsupported | No inspected source supports the claim | Do not state as fact | Missing evidence and next search |

## Independence test

Two URLs are not independent merely because their domains differ. Trace quotations, figures, press releases, and dataset identifiers upstream. If both depend on one announcement, count them as one evidence chain. Independence requires a separate observation, analysis, controlling authority, or reproduction.

## Temporal test

Record the date the source describes separately from the retrieval date. For changing software, policy, prices, schedules, or public roles, verify that the effective revision covers the question. A current webpage can describe historical behavior; an old paper can remain primary for its original experiment.

## Claim fit

Before citing, write the exact proposition the source must support. Check actor, action, object, conditions, magnitude, unit, and time. If any load-bearing element is absent, use `partial` or `unsupported`. Do not let a source's general authority substitute for claim fit.

## Conflict handling

Keep conflicting records visible. Prefer the controlling text for legal or policy questions, the current implementation for software behavior, and the original measurement for reported scientific results. When the hierarchy does not resolve the conflict, name the one observation or source that could. Never average incompatible claims into false precision.

## Verdict receipt

For every load-bearing claim record: claim ID, verdict, source identifier, inspected date, supporting location, independence chain, temporal boundary, and consequence for the answer. This makes source selection auditable without turning the final answer into a search diary.
