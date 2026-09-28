# Visual QA verdict taxonomy

Assign verdicts from visible evidence and the accepted design contract. Severity and confidence are separate: a high-impact observation with weak evidence is blocked or needs recapture, not automatically severe.

## Verdict taxonomy

| Verdict | Meaning | Minimum evidence | Next action |
| --- | --- | --- | --- |
| pass | Required states meet their criteria | Complete packet for every required state | Close review |
| conditional pass | Only explicit non-blocking issues remain | Complete packet plus bounded issue list | Track follow-up |
| fail-functional | Visual behavior prevents task completion | Reproducible state and action path | Fix before release |
| fail-accessibility | Visual or interaction presentation blocks access | Reproducible keyboard, focus, contrast, or name evidence | Fix before acceptance |
| fail-integrity | Clipping, collision, loss, or misleading state corrupts meaning | Full context plus close evidence | Correct and recapture |
| fail-hierarchy | Emphasis or ordering leads to the wrong decision | Full-view evidence tied to user job | Rework hierarchy |
| fail-responsive | Required content or action fails at a material size | Exact dimensions and fixture | Correct layout and retest |
| fail-content | Labels, errors, or status copy misstate the result | Visible copy plus triggering state | Correct content contract |
| blocked-capture | Required rendered state could not be inspected | Attempt receipt and boundary | Resolve access or narrow claim |
| blocked-fixture | Required data or state cannot be reproduced | Missing fixture and attempted path | Create or obtain fixture |
| not-applicable | Criterion does not belong to this surface | Contract-based reason | Exclude explicitly |
| superseded | Evidence belongs to an obsolete artifact | New artifact identity | Recapture current version |

## Severity overlay

Use `critical` when the user can complete an irreversible wrong action or cannot access the primary task. Use `major` when a common path is materially obstructed or meaning is unreliable. Use `minor` when the issue is visible and reproducible but does not block comprehension or action. Use `note` for a bounded improvement outside the acceptance boundary.

Do not downgrade severity because a workaround exists unless the workaround is visible, safe, and part of the intended path. Do not upgrade a preference because it is visually conspicuous.

## Confidence overlay

Use `confirmed` for reproducible evidence at the required scale. Use `probable` when the visible symptom is clear but a dynamic dependency prevents exact repetition. Use `unresolved` when evidence conflicts. Never issue a passing verdict from `unresolved` evidence.

## Aggregation

The final verdict is the most consequential unresolved row. A group of minor findings can become major only when their combined effect blocks the user job; explain that interaction explicitly. `not-applicable` and `superseded` items do not improve the score. `blocked` items prevent an unconditional pass when they cover required states.
