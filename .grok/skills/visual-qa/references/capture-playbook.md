# Visual capture playbook

Use this playbook to choose the smallest capture set that proves the requested visual claim. Respect the sandbox and permission system; never work around a denied capture boundary.

## Capture decision table

| Review question | Required state | Capture | Required context |
| --- | --- | --- | --- |
| Is hierarchy clear on entry? | Initial ready state | Full viewport | Route, dimensions, fixture |
| Does content survive narrow width? | Narrow ready state | Full scrollable surface plus problem regions | Width, text scale |
| Does long content clip or collide? | Maximum-content fixture | Full viewport and close crop | Fixture values |
| Is an empty state actionable? | Empty data fixture | Full viewport | Cause of emptiness |
| Is validation recoverable? | Invalid submission | Control region and full context | Trigger and preserved input |
| Does loading preserve orientation? | In-flight state | Before and loading captures | Trigger timing |
| Is success verifiable? | Completed action | Result region and persistent context | Submitted value |
| Is permission denial understandable? | Denied state | Message and available actions | Denied capability |
| Is focus visible and ordered? | Keyboard traversal | Sequential captures or recording | Start focus and key sequence |
| Does a modal remain escapable? | Maximum-content modal | Full modal at narrow and wide sizes | Focus position |
| Does a figure remain legible? | Final output scale | Full figure and label crops | Physical or pixel size |
| Did a correction close a finding? | Exact prior failing state | Before/after pair | Finding ID and identical fixture |

## Capture sequence

1. Identify the acceptance criterion and the one state that could falsify it.
2. Load a deterministic fixture; record any unavoidable dynamic data.
3. Set the exact viewport or output size before interaction.
4. Reach the state through the same user-visible path the criterion describes.
5. Capture the whole surface to preserve hierarchy and context.
6. Add a close crop only when the full view cannot show the defect clearly.
7. Record route, state, dimensions, fixture, and capture path immediately.
8. Inspect at final viewing scale, not only a zoomed editor view.
9. Repeat with the minimum alternate viewport or state that could change the verdict.
10. Preserve the original failing capture when recording a corrected result.

## Permission and sandbox boundary

Use only capture methods authorized for the current environment. If the active application, browser, or output file cannot be inspected, record the attempted surface and the denial. Do not substitute a source-code screenshot for a rendered one. Do not change host settings merely to make capture convenient. A blocked capture produces a `blocked` evidence item and belongs in the single methodology paragraph.

## Integrity checks

- Confirm the capture belongs to the current artifact, not a prior run.
- Confirm dimensions from the capture or tool receipt rather than visual estimation.
- Confirm fonts and assets loaded before judging spacing.
- Confirm overlays, selection boxes, devtools, or cursor states do not hide the defect.
- Confirm crops do not omit nearby controls that change the interpretation.
- Confirm before/after captures use the same fixture and scale.
- Remove temporary captures after the final evidence paths are recorded, when cleanup is authorized.
