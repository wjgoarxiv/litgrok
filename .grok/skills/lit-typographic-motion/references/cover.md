# Cover mode: the README cover loop

Read this when the request is a README cover, a hero or banner loop, an animated project cover, or
any short picture that plays forever at the top of a page. Such a loop is not a film. It has no
beats, no arc, no ending, no sound and no copy lines: it is one picture that never stops moving and
never shows where it starts. Every other request stays on the film paths (`stage`, `make`), which
this mode does not change.

The film pipeline rewards the wrong things for a cover. Beats of at least 1.2 s, a new composition
per beat, stills at beat midpoints, a settled end card and a reading floor all pull a loop toward a
slide deck, and that is what earlier covers looked like. Cover mode replaces them with a loop
contract, a review that watches motion instead of stills, and a gate that reads the encoded file a
reader's browser will actually decode.

## What changes from a film

| Film rule | Cover mode |
| --- | --- |
| Beats of at least 1.2 s, each showing something new | No beats: three speed layers and one system, each running the whole loop |
| A settled end card; holds are a reward | No ending: any hold over 0.5 s is a defect (G3) |
| 10 s minimum, "never shorten" | 6 to 12 s; 8 s suited every recipe |
| 16:9 or 9:16 | 2:1 (page 1200 x 600, cover 1000 x 500) or 3:2 (page 1200 x 800, cover 960 x 640) |
| A generated sound bed and the sound gates | Silent; `sound` is absent or `none` |
| An invented subject and invented copy lines | The brand word, plus at most one motto the user wrote or the project already uses |
| Title fade-in, a stage that fades up from black | Frame 0 is the poster and already the whole picture |
| Look questions about purpose and beats | Look questions about motion, the seam and damage (Review, below) |

## Page contract

- Write `<dir>/cover/index.html`, with local files beside it (`cover/assets/`). The renderer serves
  only that folder, the loop kit at `/lit/loop-kit.js` and the faces at `/lit/fonts.css`. The stage
  path's static scan applies: no network, no `<video>`, `<audio>` or `<iframe>`, at most 24 rasters
  and 8 MB, no animated raster, no flipbook.
- Lay the page out at the aspect's page size in CSS pixels. The renderer captures it at device scale
  2 and shrinks every capture to the cover size with Lanczos, so hairlines and small type are drawn
  at twice the size they are shown.
- Define `window.renderFrame(t, { mask })` and set `window.ready = true` once fonts and images are
  decoded. `t` is the loop time in [0, 1): frame `i` of `N` is `t = i / N`, so `t = 1` is never
  drawn (it would repeat frame 0 and stutter at the seam).
- Everything on screen is a function of `t`. Frames are sought in any order and every frame is drawn
  again in a fresh browser, so a frame may never depend on the one before it: no trail buffers, no
  accumulated canvas, no counters. Clear every canvas you draw into.
- `Math.random`, `Date.now`, `new Date()`, `performance.now`, `requestAnimationFrame`, `setInterval`
  and `crypto.getRandomValues` throw during capture, and the run stops with exit 18 naming the call.
  CSS animations and transitions are switched off. Layout randomness comes from `LitLoop.rng(seed)`;
  motion comes only from `t`.
- `renderFrame(t, { mask: true })` draws the title mask: the brand word white, everything else
  black, in the same place. The mask is captured for every frame; G5 measures the title against its
  own background through it and G6 measures its cap height.
- Faces: every stage face plus `"JetBrains Mono"`, a variable face with a real `wght` axis from 100
  to 800 and a fixed advance, so weight motion never reflows a line. Load the weights you use with
  `document.fonts.load` before setting `ready`.

## The cover treatment

`<dir>/treatment.json` with `"mode": "cover"`. Every cover render checks it and stops with exit 16
naming the first bad field (`BLOCKED_TREATMENT_INVALID field=...`).

| Field | Rule |
| --- | --- |
| `mode` | `cover` |
| `request` | the user's words, verbatim and inert |
| `idea` | one sentence on what the loop does; it may not restate the request |
| `recipe`, `recipeReason` | `painted-light` (default), `weight-tide`, `orbit-loop` or `own`, and why in 1-2 sentences |
| `brandWord` | the name, set once, at most three words |
| `motto` | optional `{ text, source: user \| project, from }`, at most six words; a `user` motto appears in the request, a `project` motto names where the project already uses it |
| `aspect`, `loopSec`, `fps` | `2:1` or `3:2`; 6-12; 16, 20 or 25 |
| `layers` | `{ slow, mid, beat }`: what moves on each speed layer |
| `system` | `{ rule, copies, offset }`: the one rule, what it is copied onto, where the offsets come from |
| `title` | `{ box: [x, y, w, h], kind: live \| painted }`: the brand word's box as fractions of the cover |
| `palette` | optional, 2-6 `{ color, role }` |
| `encode` | optional `{ q, edgeQ, edgeFrames }`; default q 86, with frame 0 and the last 15 frames at 97 |
| `seed` | optional integer for `LitLoop.rng` layout and the seek-order shuffle |
| `ambition` | 1-2 sentences in craft terms |

`copy`, `beats` and `lines` are refused (a cover never swaps text states), and so is any `sound`
other than `none`.

## Assets (`assets.json`)

Every raster the page can load is listed in `<dir>/assets.json` before the first render, and the
list is checked before anything is captured:

```json
{ "assets": [{ "path": "cover/assets/base.png", "role": "base-art", "source": "user", "sha256": "<64 hex>", "box": [0.125, 0, 0.75, 1], "checkBox": [0.723, 0.1445, 0.1475, 0.778], "title": true }] }
```

- `role` is `base-art`, `logo`, `wordmark` or `texture`; `source` is `user` (supplied) or
  `generated` (made for this cover, and labelled as generated in the reply); `sha256` is the file's.
- A listed file that is missing stops the run with exit 22 `BLOCKED_ASSET_MISSING` and writes no
  frame. Ask for the art or generate it; never draw a stand-in in its place. The `painted-light`
  recipe needs a `base-art` entry. A raster under `cover/` that the list does not name, or a listed
  file whose bytes changed, is exit 17.
- `box` is where the base art sits on the cover. After the render, frame 0 has to show the art: the
  SSIM of `checkBox` (default: the whole box) in decoded frame 0 against the same region of the
  source scaled into the box reaches 0.90 (the ART line). A page that relights a painting dims most of
  it at frame 0 on purpose, so point `checkBox` at the part it leaves lit (the hero bay); it covers
  at least 10 % of the box. The LitGrok line-up painting with the hero bay lit measured 0.946 there.
- `title: true` on the base art declares the brand word painted into it; only then is the title
  exempt from the glyph-height floor, and G6 still measures and reports it as INFO.
- The art is scaled into its box, never cropped.

## Craft rules, ranked

1. **The encoder is part of the design.** Lossy animated WebP treats a pixel as unchanged when it
   moves less than about `31(1 - sqrt(q/100)) + sqrt(q/100)` levels from the previous frame: about 6
   levels at q72 and 3 at q90. Slow fades and slow breathing below that are dropped, go stale, and
   snap back at the next keyframe, which by default is the loop point. This failure is invisible in
   the PNG frames and plain in the decoded file, which is why the gate decodes.
2. **Light is a moving edge, not an in-place fade.** A travelling window with a 24-40 px edge
   survives the encoder; a 150 px soft edge does not at q72 (the moving share fell from 0.92 to 0.83
   and the seam jumped to 24 times its neighbours on the same frames). At a high edge quality the soft
   edge survives and reads as a wash instead: no motion gate sees that, so the look review has to.
3. **Something translates.** A weight tide alone lost most of its motion in the encoder (median step
   0.0007, seam 14x); one word of row drift per loop kept all of it (0.0098, seam 1.1x).
4. **One rule, many copies, offsets from position.** One swell over hundreds of letters, one orbit
   rule on three rings, one light window over the bays. Offsets come from x, y, angle or loop noise
   and the wave appears by itself. No timeline, no scenes.
5. **Three speed layers.** A slow, perpetual, linear layer (drift, laps, rising motes), a mid swell
   (the tide, the light window) and beat events (a cursor step with `outBack`, a gate flash, a lens
   pulse, a flare). Every cover that reached TARGET had all three.
6. **The brand word is set once and never leaves.** It is the material (its weight moves, its place
   does not), or it stands still beside the system, or it is painted into the base art. Motion
   happens in, around or behind it.
7. **Frame 0 is the poster.** Reduced-motion readers, thumbnails and slow networks show it alone, so
   it is the whole picture: no fade from black, no empty opening.
8. **Bands are flat steps, and every step clears the threshold.** A 3 px leading line with a two-step
   afterglow (0.10, 0.05) passed; a third 0.03 step drifted and pushed the seam from 1.71 to 2.48. A
   single flat slab encodes well but reads as a box.
9. **Exponential tails are slow fades.** `expImpulse` sits under the threshold for half the loop. Use
   the symmetric `cubicPulse` for beat events and put one across `t = 0`, so the keyframe reset lands
   under motion.
10. **Small movers over texture are expensive.** Each mote over a painting makes the encoder re-send
    the textured blocks around it; keep motes few and mostly on the plain wings.
11. **Use the painted title instead of laying live text over it.** Live text set at a painting's
    scale came out about 11 px tall in a README. The painted word is the title, and its mask is the
    letters above the plate's level. When G5 finds the painted letters under 4.5:1, lift them in
    place with a luminance-keyed gain (only pixels above the plate's level brighten, so the plate
    stays black): that took one painted word from 1.8:1 to 4.9:1.
12. **Spend quality at the seam, not on keyframes.** Once every edge is sharp, what is left at the
    loop point is requantisation: keyframe 0 and the frames before it carry different error. Raise
    the quality of frame 0 and the last second (`edgeQ`, `edgeFrames`) and keep the default
    keyframes. Periodic keyframes spread the snap into visible pops; a small `-kmax` made a 2.5-5 Hz
    shimmer.
13. **16 fps for slow painted covers, 25 for a system with fast dots.** 20 fps cost 18 % more and
    dropped the median step under 0.0015 on the painted cover. At 16 fps img2webp writes 63 ms
    frames, so an 8 s loop is 8.064 s; that is fine.

## Recipes

Each recipe ships as a worked page in `recipes/<name>/index.html` with the gate row it reached in
`recipes/<name>/expected.json`. Copy the page into `<dir>/cover/`, then replace the name, the motto
and, for the painted recipe, the `PAINTING` block. The pages are examples; the rules above are what
transfers.

- **Painted base + travelling light (`painted-light`, the default).** A finished painting (supplied,
  or generated and labelled) is the whole picture and the page relights it. The painting keeps its
  own coordinates and is scaled, never cropped; at 2:1 a 3:2 painting is pillarboxed and the wings
  stay quiet (a static spill, a few motes). Mid: a light window with a 24 px feather walks the dim
  bays once per loop, and each bay gets a scan band twice per loop, offset by its position. Slow: a
  comet laps the hero frame; motes rise one screen per loop. Beat: the hero's lenses light in turn,
  one fast skewed glint crosses the title in **overlay** blend (screen lights a visible box;
  colour-dodge turned a coloured letter into a red block), and the accent word pulses at `t = 0` and
  `t = 0.5`. The LitGrok line-up reached TARGET at q 79 with frame 0 and the last 44 frames at 95 (seamLocal
  1.83, 1.98 MB). At q 80 with the last 30 frames at 97 the seam sat at 1.92, and an earlier rerun
  reached 2.03-2.04, past the target; at q 83 with the last 18 frames at 97 it missed too.
  More frames at a high edge quality lower the seam and cost bytes, so a seam margin is bought with
  the size budget, never with a looser threshold.

  **Choosing the hero.** Any bay can be the hero, so a cover can feature one machine of a shared
  line-up. Three things move together:
  1. `PAINTING.hero` is the bay index (0 is the leftmost bay). The dim pool still spans the first to
     the last dim bay, so the light window walks every bay as one continuous light, but it is
     clipped around the hero bay: a hero in the middle stays at source brightness. The comet laps
     the hero's border and its scan band stays at full strength.
  2. `PAINTING.lenses` maps a bay index to the lenses measured on that machine (`[x, y, radius]` in
     painting pixels). Only the hero's entry lights. A hero with no entry stops the page with
     `PAINTING.lenses has no entry for the hero bay N` (the render ends as `STAGE_CONTRACT_ERROR`
     after the 60 s ready wait), because borrowing another machine's coordinates draws its lenses
     on the wrong body. Measure them, or write `[]` for that bay to run with no lenses and say so
     in the treatment's beat layer. A hero index that is not a bay stops the page the same way.
  3. The base art's `checkBox` in `assets.json` points at the hero bay. With the shipped layout
     (painting scaled by `S = 600 / 1024` and pillarboxed 150 px from the left of a 1200 x 600
     page) a bay `[x0, x1]` with panel `top` and `bottom` is
     `[(150 + x0·S) / 1200, top·S / 600, (x1 - x0)·S / 1200, (bottom - top)·S / 600]`. A box left
     on another bay measures a dimmed bay and the ART line fails.

  The accent flare and the title glint belong to the painted motto and title, not to the hero, and
  stay where they are.
- **Weight tide (`weight-tide`).** Rows of the brand word in JetBrains Mono at about 1.3:1 to the
  ground drift one word length per loop, alternate rows opposite ways. Weight is
  `gain(swell(fract(t - offset)), 2.4)` with `offset = 0.85 x / W + 0.35 y / H`. The name, on a
  knockout band, takes the same field over 340-800 so it never thins. One accent: a cursor that
  dwells under each letter, steps on with `outBack` and returns home.
- **Orbit loop (`orbit-loop`).** Three rings with whole laps per loop (3, 2, 1) in alternating
  directions, dots with fading arc trails, a gate at twelve o'clock that flashes on each crossing,
  and a ledger under the word whose cells light at the crossing times (as many crossings as cells,
  so the ledger loops). The core breathes once per loop and rings out on each bar. The word stands
  still on the left.
- **Own.** Any system that keeps the rules: one rule many copies, three layers, a still word, edges
  instead of fades. Name it in `recipeReason`.

## Loop kit (`/lit/loop-kit.js`)

`LitLoop` holds `rng(seed)` (mulberry32, layout only); `makeNoise(seed)` and
`loopNoise(noise, t, offset, radius)` (value noise read on a circle, so it closes at `t = 1`);
`ease.smooth`, `ease.outCubic`, `ease.inCubic`, `ease.outExpo`, `ease.outBack(p, s)`,
`ease.gain(p, k)`; `cubicPulse(c, w, x)` and `expImpulse(x, k)`; `phase(t, offset, cycles)`;
`cdist(p, c)` (distance around the loop, for an event that straddles `t = 0`); `window(p, start,
dur)` (a one-shot event inside the loop, -1 outside); `steps(p, stops, travel, ease)` (hold and
move); `swell(p)`; `TAU`, `clamp`, `fract`, `mix`. Every helper is pure or periodic in `t`.

## Encode

`img2webp`, lossy, loop forever, `-m 4`, every frame `-d round(1000 / fps)` ms, frame 0 and the last
`edgeFrames` frames at `edgeQ`, default keyframes. `-m 6` took minutes and gained little; `-mixed`
changes nothing while every frame is lossy. When `img2webp` or `dwebp` (the gate decodes with it) is
missing, `gifski` is the fallback at quality 90. Neither is exit 21 `BLOCKED_NO_COVER_ENCODER`. A
cover is never an MP4: README renderers do not autoplay video.

## Gate (decoded file)

The gate decodes the cover (each frame through `dwebp`, composited as a browser shows it) and
measures on a fixed grid of `max(50 ms, shortest frame)`, because the encoder merges identical
frames into long ones and frame counts would flatter a slide film. `d` is the mean |change in luma|
(0..1, at about 300 px wide) per grid step, and the loop is a ring, so the seam is one more step.

| Gate | Metric | FLOOR (fails) | TARGET (cover mode) |
| --- | --- | --- | --- |
| G0 determinism | SHA-256 per frame, two captures in fresh browsers | 100 % identical | same |
| G1 budget | bytes, duration, loop | ≤ 3 MiB, 6-12 s, loop 0 | ≤ 2 MiB |
| G2 motion energy | median d; share of moving steps | ≥ 0.0004; ≥ 0.45 | ≥ 0.0015; ≥ 0.95 |
| G3 anti-slide | longest still run; max d / median d | ≤ 2.0 s | ≤ 0.5 s, spike ≤ 6 |
| G4 seam | seam / mean of the two steps on each side | ≤ 8 | 0.25-2.0 |
| G5 title contrast | median title pixel vs the worst background decile in the box, every frame, through the mask | ≥ 4.5:1 | same |
| G6 title size | cap height of the title glyphs in the mask at the README width (830 px) | ≥ 24 px | same; a title painted into declared base art is INFO |
| SEEK order | 16 frames in a seeded shuffled order in a fresh page, against the master | identical, or within one level per channel (else exit 18 naming the frame and its time) | same |
| ART | SSIM of the base art's check box in decoded frame 0 against the source | ≥ 0.90 | same |
| FLASH | WCAG 2.3.1 flashes in any 1 s window, the loop wrapped | ≤ 3 general, ≤ 3 red | same; a FAIL withholds the cover under `withheld/` |

FLOOR was set so eight earlier painted covers pass and four slide-like negatives fail; TARGET is
what cover mode delivers, and those earlier covers miss it on purpose (a 1.9 s hold, a flash at the
seam). A cover render exits 13 until every gate reaches TARGET, 2 MiB included. G2 and G3 are
area-weighted: a small comet on a still picture counts as still at thumbnail scale, which is
intended. Never raise a number, shorten the loop or drop a layer to pass; fix the cause.

G6 splits the mask's title pixels into connected glyphs, leaves out dots and accents (under 1 % of
the largest glyph's area or 30 % of the tallest), takes the median glyph height of the smallest of
twelve samples and scales it from the cover width to 830 px. The seek-order check catches a page
that keeps state between frames (a trail drawn by never clearing a canvas): the sequential captures
agree with each other, and a frame sought out of order does not. The software rasterizer can round
a few text or opacity pixels one level apart depending on what it painted before, so a sought frame
within one level per channel passes and is counted as `oneLevel`; kept state differs by far more.

`node scripts/motion.mjs cover-gate <file> [--frames d --frames2 d --masks d --title x,y,w,h]
[--strict] [--json]` runs the same gate on any cover file.

## Review

Every cover render writes, from the DECODED file:

- `stills/sheet.png`: twelve frames at `t = k / 12` above a plot of every grid step's `d`, the still
  threshold (red dashes) and the median (green dots). A hold is a flat run on the dashes; encoder
  pops are regular spikes; a reset is a spike at the right end.
- `stills/poster.png` (frame 0) and `stills/seam.png` (the last frame beside frame 0);
- `stills/frame-00.png` to `frame-11.png`, the sheet's frames at full size.

Open the sheet, the poster and the seam pair with Grok Build's image viewing (the same tool the
film loop uses; `craft-loop.md`) and look at them; a file listing is not a look. The gate cannot see
damage: the two worst defects of the first painted cover, a colour-dodge glint that turned a letter
into a red block and a wing glow that read as a dark disc, were found only by eye on the sheet.

Answer all eight every round, each naming a stills file and what you saw in it:

1. Is something moving in every half-second window (the plot never lies flat on the dashes)?
2. Does the seam disappear in the decoded file (`seam.png`, the right end of the plot)?
3. Does it still move after encoding: no region that freezes and then pops?
4. Is the brand word present, legible and in place in every frame, never faded or swapped?
5. Are all three speed layers visible: a slow perpetual layer, a mid swell, beat events?
6. Does anything read as a slide, a card swap, a title fade or an end card, or does light wash in
   place instead of travelling as an edge?
7. Is any glyph, glint or glow damaged: a colour block, a dark disc, a visible box?
8. Name one thing a skilled motion designer would add or remove, or `none`.

A `no` on 1-5, a `yes` on 6 or 7, or anything but `none` on 8 asks for another round. Record the
round with `look --out <dir> --round <N> --answers <file>`. The answers file has the film's shape
(`viewed`, `answers` with `q`, `verdict`, `frame`, `observed`) with eight answers and no
`weakestBeat`; round 1 names the `change` you make before round 2. With no image tool reachable,
`--blocked no-vision-tool` ends the cover `DONE_UNVIEWED`, said plainly in the reply.

## Defects and window re-renders

What the eye finds goes into the round as `defects`, at most three, worst first:

```json
"defects": [{ "t": 1.2, "region": [340, 10, 330, 50], "frame": "stills/frame-02.png", "observed": "<what is visible there>", "cause": "<why>", "fix": "<the change>" }]
```

`t` is the loop time in seconds where the defect shows, `region` the `[x, y, w, h]` it covers in cover
pixels, `frame` a file of the current stills set that shows it. `look` refuses a defect with no time,
a time outside the loop, a region off the cover, or a frame outside the current stills set.

Check each fix before the next full render with
`node scripts/motion.mjs cover --out <dir> --round <N> --window <t0>,<t1>`: it captures only the
frames from `t0 - 0.5 s` to `t1 + 0.5 s` (wrapping at the seam) in a fresh page and writes
`windows/round-<N>/<t0>-<t1>/sheet.png` (the span shaded on its plot) and `window.json`. It shows the
frames before encoding, touches no stills, report or manifest, and never counts as done: the full
render and its gate decide.

## Rounds and done

Rounds share one counter with the renders, 1 to 3, and every round is a full cover render followed
by a look. `node scripts/motion.mjs verify --out <dir>` says DONE when all of these hold: a valid
cover treatment unchanged since the last render; that render's report reading
`COVER gate --strict: PASS+TARGET`; at least two look rounds, the first naming its change; the last
round stamped with the final render's stills and viewing `stills/sheet.png`, `stills/poster.png` and
`stills/seam.png`. After round 3 deliver with the open items said plainly. A window render never
counts. When the cover is done, `verify` prints one line per asset `assets.json` marks as generated,
and the reply carries that label.

## Recipe rows and negatives

Each recipe keeps its gate row in `recipes/<name>/expected.json` (median d, moving share, longest
still, spike, seamLocal, bytes, the settings and the treatment it shipped with). In a LitGrok
checkout `npm run qa:cover-recipes` re-renders every recipe through `cover --out` and fails when it
has no row, median d or the moving share leaves ±15 % of its row, seamLocal leaves TARGET, the file
passes 2 MiB or the render exits non-zero.

Every negative and regression declares the gates it must fail (`mustFail`, as `G2.floor` or
`G1.target`). `--negatives` renders the four negatives and every regression a recipe declares, and
one counts as caught only when its render completed and gated the decoded file (exit 0 or 13 with a
manifest), every declared gate failed at its tier, and no undeclared FLOOR gate among G1-G4 failed.
A crash, a missing declaration, a missing expected file, a patch whose search text left the page or a
failure on another gate fails the QA with the reason; a declared gate that was not measured is not
caught either.

The painted recipe declares one regression, `feather-150` (`--feather 150` runs it alone): the
light edge widened from 24 to 150 px. The defect it stands for is light drawn as a soft wash instead
of a moving edge, but at this recipe's encode (q 79, edge q 95 for 44 frames) the encoder keeps the
soft edge and the motion numbers stay where the recipe's are. What it reliably trips is the size
TARGET (G1: 2.58 MB against 1.98 MB), so `G1.target` is all it declares; seamLocal sits inside
run-to-run noise around its own TARGET, so no G4 is declared. A decoded-file edge measure was
considered and not added: it would score every soft change in the frame, not the travelling edge, and
any threshold would be fitted to one painting. The soft wash is caught by look review on the sheet
(question 6 under Review).

`recipes/negatives/` ships four slide-like pages that must keep failing on their named gates: a title
slam with lines that appear and hold before an end card (G2, G3), card scenes that fade in, hold and
fade out (G2), a still with a faint breathing glow (G2, G3), and a progress sweep that resets at the
seam (G4). They are never recipes: read them to see what cover mode exists to prevent, and never tune
a threshold so one of them passes.

## Commands and exits

Run from the skill root:

```bash
node scripts/motion.mjs cover --out <dir> --round <N>
node scripts/motion.mjs cover --out <dir> --round <N> --window <t0>,<t1>
node scripts/motion.mjs look --out <dir> --round <N> --answers <file>
node scripts/motion.mjs cover-gate <dir>/cover.webp --strict
node scripts/motion.mjs verify --out <dir>
```

A cover render runs in the foreground; give the call a timeout of at least 600 s (the painted recipe
took about 3 minutes on the software rung). It writes `cover.webp` (or `cover.gif`), `poster.png`,
`stills/`, `manifest.json` and `gate-report.txt`. Exit 13 names the gates that miss TARGET; 16 the
treatment field; 17 the page contract or the asset list; 18 a call that is not a function of `t`, or
a frame that differs in a fresh browser or when sought out of order; 19 a network request; 21 no cover
encoder; 22 a listed asset is missing. `gate --out <dir>` on a cover points at `cover-gate`.

## Unconfirmed

- Whether the single keyframe reset at the loop point is visible to a person on a real README; the
  numbers say smooth, nobody has watched it there yet.
- How a cover reads inside GitHub's README column at full width; review so far used local frames.
- The encoder threshold formula comes from libwebp's animation encoder as remembered; measured
  behaviour matches it (q72 drops slow fades, q86-90 drops fewer).
- The thresholds come from 8 positives and 4 negatives in one family's style; re-check them on covers
  made for other projects.
