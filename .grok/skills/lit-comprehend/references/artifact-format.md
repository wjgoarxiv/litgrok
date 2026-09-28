# Comprehension artifact format

Use this format when the explanation must survive outside the repository or beyond the current session. The artifact is reader-facing evidence synthesis, not a transcript of the work.

## Reader question

Open with the exact question the artifact answers and the assumed reader level. State the boundary of the explanation in one sentence. Translate repository-specific terms on first use. If the question contains several independent decisions, split them rather than hiding the scope in a long introduction.

Required fields:

- `Question`: one answerable sentence;
- `Reader`: role and relevant prior knowledge;
- `Boundary`: included and excluded systems, dates, or artifacts;
- `Answer`: a short direct answer that the rest of the document substantiates.

## Working source map

Keep this map in the internal work record, not in the reader-facing explainer.

List every source needed to reproduce the explanation. Use stable project-relative paths for repository files and direct identifiers for external evidence. For each source, record what claim it supports, whether it was inspected in this session, and whether it is primary, derived, or contextual.

Do not cite a directory when one file carries the evidence. Do not cite a test name without the command or fixture needed to interpret it. Do not turn source volume into confidence; several files can repeat one unsupported assumption.

## Explanation

Structure the body around causal or operational steps rather than the order in which files were discovered:

1. Define the actors, state, and boundary.
2. Describe the entry condition.
3. Trace the important state transitions.
4. Connect each transition to a source-map item.
5. Show the observable result and failure path.
6. Separate verified behavior from inference.
7. Close with the direct implication for the reader's question.

Use a diagram, table, or worked trace only when it makes the relationship easier to verify. Every abbreviation and status value must have one stable meaning. Short code excerpts may illustrate a transition, but the artifact must remain understandable without repository access.

## Internal claim record

Keep the detailed claim ledger beside task evidence, not in the reader-facing explainer.

Maintain the ledger defined in `honesty-ledger-contract.md` in the internal record. Every material claim receives a status and evidence pointer. A contradiction remains visible until resolved. An unrun probe is never presented as a pass.

Minimum columns are `Claim`, `Status`, `Evidence`, `Probe`, and `Consequence`. The ledger can be short when the explanation is simple, but it cannot omit a claim that controls the answer.

## Artifact header

Use this compact header in the internal delivery record for a file written outside the repository:

```text
Title: <reader-facing title>
Question: <exact question>
Prepared from: <project or evidence boundary>
Evidence current through: <date or revision>
Artifact location: <absolute or user-approved destination>
```

Do not place project secrets, credentials, private absolute paths, or transient session identifiers in the artifact. Keep the exact destination in the internal delivery record.

## Completion criteria

The artifact is complete when a reader can answer the opening question and find citations for material assertions. Keep claim status, source inventory, and reproduction steps in the internal record unless the user requests an audit artifact.
