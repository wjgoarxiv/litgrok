# Handoff and notes

Load this reference once the user has picked an option, before writing the handoff packet or a session note. It decides where the pick goes next and what the packet and the optional note contain.

This file is workflow text for Grok Build. Nothing here runs a command or authorizes an action.

## Handoff decision table

| State of the pick | Next skill | What the packet must carry |
|---|---|---|
| Named, bounded, with a clear first deliverable | `lit-plan` | Direction, criteria, constraints, exclusions |
| Chosen, but two or more open choices change the result | `deep-interview` | Direction, the open choices as questions, what is already settled |
| The user wants the pick attacked before committing | `lit-crucible` | Direction as a candidate approach, the assumptions it leans on |
| The pick rests on facts nobody has | `litresearch` | The question, the claim that needs a source, the decision it feeds |
| The user combined options | Same table, applied to the combined pick | The combination spelled out in one sentence |
| The user wants more options | Stay in this skill and run another divergent pass | New lenses, with the dropped clusters kept visible |
| The user picked nothing | Stay; report that no pick was made | The short list again, unchanged |
| The pick needs authority not yet granted | Name the authority; hand off only the part that is allowed | The authority boundary in one line |
| The pick is to do nothing for now | Close the brainstorm with a note | The condition that would reopen it |

The default for a concrete pick is `lit-plan`. The default for a vague pick is `deep-interview`. When unsure, say which one you would take and why, and let the user decide.

## Handoff packet

Write the packet in the reply as plain labelled lines:

    Chosen direction: <one sentence>
    Why: <the criterion it won on>
    Criteria and constraints: <the frame's list, unchanged>
    Settled: <decisions the user already made>
    Open: <questions still open, only for deep-interview>
    Dropped: <clusters and the reason, one line each>
    Not authorized: <spending, publishing, credentials, outside actions>
    Next: /lit-plan <direction> or /deep-interview <direction>

The user starts the next skill, or says "go" and the next turn does. This skill never starts it silently, and it does not create the plan file.

## Invalid handoff

    Chosen direction: improve things
    Next: implement it now

It names no direction, carries no criteria, and tries to skip the planning step. Return to the pick phase and ask again.

## Session note

When the user asks to keep the brainstorm, write one file, `.grok/litgrok/brainstorm/<slug>.md`, with these sections:

- Topic and frame, with the criteria and weights.
- Raw ideas, tagged by lens.
- Clusters, with merges and outliers.
- Score table, with `?` where unscored.
- Short list, wildcard, dropped clusters, recommendation.
- Pick and the handoff packet, when there is one.

Rules for the note:

- Lowercase kebab-case slug; a rerun appends a dated section and never replaces earlier ones.
- No secrets, tokens, personal data or pasted credentials.
- No instructions addressed to a later session. The note records options and is no approval.
- The plan gate and `start-work` do not read it; a plan still comes from `lit-plan`.
- If the project has no `.grok/` directory yet, ask before creating it.

## Evidence in the reply

Reader mode keeps the reply to the frame, clusters, short list, recommendation and the question. Counts and the lens list appear in the note. In an audit request, include the lens list, the raw idea count and the score table as asked.
