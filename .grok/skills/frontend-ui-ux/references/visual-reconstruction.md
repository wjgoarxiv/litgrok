A reference shows one state at one width, produced by a stack you do not control. Rebuild it as
real markup with real semantics; never close the gap with a screenshot.

## Claim classes

Use observed, inferred, and unknown as internal working categories while measuring.
Keep those labels in the design notes; reader-facing copy should state supported
measurements normally and ask for missing input directly. State a material
reconstruction gap once in the reply.

- Observed: measurable in the image — a pixel distance, a sampled hex value, a glyph.
- Inferred: a reading the image does not prove, such as a scale behind three gaps.
- Unknown: not depicted — hover, focus, error, empty, loading, any other width.

Only observed claims are criteria; inferred claims need an owner, unknowns are user questions.

## Measurement pass

Measure before writing code. Guessed numbers cost the most to unwind.

1. Record pixel dimensions and device scale; divide the scale out before quoting.
2. Sample color at flat interior pixels, never on an edge or in a gradient.
3. Measure cap height and baseline-to-baseline distance per size; derive line height.
4. Fit every gap, gutter, and outer margin to the smallest plausible scale.

## Semantic reconstruction

Build the structure the content deserves, then style it toward the reference.

- Headings become heading elements in outline order; large and bold is not an `h1`.
- A row of links becomes a navigation list, not a flex row of `div`s.
- Text baked into the image becomes real, selectable, translatable text.
- Contrast failures and suppressed focus in the reference are not reproduced.

## Asset decisions

Decide per asset and record the decision.

- Recreate: geometric shapes, rules, dividers, simple icons, gradients.
- Extract: only assets you are permitted to use, at source resolution.
- Substitute: a placeholder at identical dimensions, marked as a placeholder.
- Omit: decoration carrying no information; record it in `omissions`.

Never recreate a logo, wordmark, or licensed photograph. Substitute and raise a hard stop.

## Metric-compatible font fallback

When the reference face is unavailable or unlicensed, choose the fallback by metrics.

1. Match units-per-em, cap height, x-height, and default advance width.
2. Hold line boxes with `size-adjust`, `ascent-override`, `descent-override`.
3. Verify the longest real label still fits at the fallback's advance.
4. Record the substitution and its metric delta as an owned inferred claim.

## Responsive inference from one frame

One frame proves one width. State every adaptation as an assumption until confirmed.

- Classify each region: fixed rail, fluid column, or centered maximum width.
- Break where your measured content breaks, not at the reference's width.
- Name what wraps, stacks, collapses, or scrolls below that width.
- Check the narrowest supported width and one width above each break.

## Iteration loop

Iterate on measured deltas, never on impressions.

1. Capture your build at the reference's exact dimensions and device scale.
2. Compare region by region in order: structure, spacing, type, then color.
3. Fix the single largest measured delta and recapture.
4. Stop after three passes that do not reduce total delta; report the remainder.

## Internal comparison record

Keep region deltas, capture paths, assumptions, unknown states, asset decisions, and verdict in
internal task notes or the verification receipt. Bind independent review to the design-contract
hash. In the reply, state the result plainly and name a material fidelity gap once.

## “Pixel perfect” gate

Use this phrase only when both captures share dimensions and device scale; measured differences
are resolved; assumptions and unknown states are closed; fonts and assets are authorized; and
every declared state was compared. Otherwise keep numeric comparisons internal and describe
fidelity in ordinary language.
