# Probe and repair loop

This reference is the execution contract for the four interface modes. Keep the user's requested structure, visual direction, and content intact unless `build` authorizes changing them. A generated design contract or a static lint result is not a rendered result.

## Run the page

Finish or build the page, then run `node "$FRONTEND_SKILL_ROOT/scripts/probe.mjs" --url <built-page-or-directory> --out <task-evidence-directory>`. The driver serves a local page on `127.0.0.1`, uses the already available `agent-browser` command, and closes its owned session and server. It never installs a browser or opens a `file://` page. Use an isolated evidence directory for each pass. The seven required views are 320, 390, 768, 1440, 390 dark, 390 reduced motion, and a 720×450 CSS viewport that approximates 1440 at 200% zoom. The last pass is a reflow emulation, not a claim that native browser zoom was changed.

Open the 320, 390, and 1440 screenshots yourself. Look for clipping, hierarchy, focus and labels, image meaning, state handling, and any visual defect that a DOM measurement cannot decide. Inspect the dark and reduced-motion captures when those variants are relevant. The screenshots and the JSON must describe the same build.

The probe may hover or focus a sampled control to read its styling, but it never clicks, presses, submits, or opens a disclosure. Report closed disclosure content as `not_verified`. A theme toggle discovered during the dark pass is evidence of a possible path, not permission to activate it.

## Decide and repair

`build` authors the requested surface and runs a final probe. `polish` records a baseline probe, changes only flagged styling values, and probes again. `audit` writes findings only and makes zero source edits. `harden` checks the cue-gated content, quantity, container, state, language, and environment axes; it repairs only failures observed on applicable axes.

For an editable mode, use at most three build → probe → fix rounds, followed by a final probe. Choose the cheapest sound fix in order: delete needless decoration or filler; use a native platform element; reuse a local component or token; correct the offending value; add new code only when the earlier choices cannot satisfy the rule. Do not change a fixed threshold to improve the page's score. Re-run the affected viewport and the full required matrix after each fix that changes layout, typography, color, or behavior.

Exit `0` means all seven views completed with no measured or derived HIGH finding, `1` means at least one such HIGH remains, and `2` means BLOCKED, including an incomplete seven-view matrix without a HIGH. A static fallback can identify source-visible defects, but its rendered checks stay `not_verified`; it cannot stand in for a browser pass. An unavailable browser or page is a blocker, with the reason and any partial static findings retained. A remaining HIGH prevents a clean "done" claim unless the reply states the specific limitation and why it could not be fixed.

## Review record

Use the column order `Severity | Rule | Where | Measured | Fix`. `Where` is a selector and viewport for a rendered check, or file and line for source fallback. `Measured` gives the actual value and threshold, not just a verdict. Name every unrun rule in a separate Not verified list with its reason. Report a final Block or Approve gate based on the HIGH findings. MEDIUM and LOW are advisory.

Keep claim language precise. **Measured** means a direct DOM, computed-style, geometry, or pixel read. **Derived** means a calculation from those values or a documented proxy. **Inferred** means human judgment, such as whether a visual cluster feels generic. Never present an inferred judgment as a measured fact. If the input to a derived value was unavailable, downgrade the claim and name the missing observation. JSON machine findings use `measured`, `derived`, or `not_verified`; the human table may also include Inferred checklist observations.

Read `craft-floor.md` for CF/RS definitions and `slop-register.md` for SLOP conditions and fixes. The probe covers a deterministic subset and names its remaining coverage gaps; a passing exit code never asserts that a judgment-only item passed.
