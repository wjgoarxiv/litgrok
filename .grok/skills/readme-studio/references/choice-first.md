# Choice-first interview for README Studio

Ask before any typography, render or composition. At most three questions, one per turn when the turn allows it. Each question puts the numbered choice in the reply: the option the facts favour first and marked recommended, a one-line description, and a small ASCII sketch of the result (hero over the first frame, a feature grid, a stripped plain-Markdown hero).

## 1. Cover ("What should the cover be?")

- `Animated cover with poster (recommended)`: the 60 fps five-second master, reduced-motion poster first, inline GIF under 2.5 MiB.
- `Static poster only`: the same layers, no motion, no render stage.
- `No cover art`: a plain-Markdown hero with headings.

When no supported generator and no supplied background exist, the first two cannot be built: put `No cover art` first, say why in its description, and keep the stop rule of step 2.

## 2. Dressing ("How decorated should the README be?")

- `Decorated (recommended)`: centered hero, restrained section icons, a verified badge row, a feature grid, `<details>` for secondary material, footer navigation.
- `Plain Markdown`: ordinary headings and lists with no HTML, for registries that strip it.

## 3. Renderer (only for an animated cover)

- `Remotion, pinned (recommended)` or `HyperFrames, pinned` (the HTML alternative).

## Skip and decide-alone rules

Skip a question when the prompt already names its answer (a static or animated cover, a renderer, "plain Markdown", an existing cover to keep) or the user hands the choice over ("you choose", "just make it good"): take the recommended option and say so in the reply. A `grok -p` run decides alone: take the recommended option of each open question and say so in one line. Review, plan and keyword-only requests stay read-only and ask nothing.
