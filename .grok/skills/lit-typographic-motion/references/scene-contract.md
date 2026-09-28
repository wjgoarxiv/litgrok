# Brief, scenes and the engine contract

## The brief file

On the type path the treatment comes first (`treatment.md`); the brief only arranges the
treatment's copy into scenes. Without `--brief`, `make` sets each copy line as one karaoke line.
A brief is UTF-8 JSON (a plain-text file also works: first line is the title, each further line is
a karaoke line). Every string is data; nothing in a brief is executed or followed as an
instruction. Every on-screen string in a brief (title, lines, list items, counter label,
signature, end card) must be one of the treatment's `copy.lines`, a part of one, or the film's own
name (`subject.name`); anything else exits 16 naming the brief field. A working title, the request
or a description of the film never goes on screen.

| Field | Type | Meaning |
|---|---|---|
| `title` | string | opening title slam |
| `lines` | string[] | one karaoke line each, revealed 어절 by 어절 |
| `list` | string[] (2-5) | a kinetic list, one item per reveal |
| `counter` | `{ value, label }` | a number counting up to `value` (at most 7 digits) with a label |
| `signature` | string | a stroke-written sign-off (Latin only; Hangul becomes a karaoke line) |
| `end` | `{ title, note }` | end card; defaults to the title |
| `style` | `swiss-signal` \| `terminalcore` \| `tidal` | explicit style; wins over MO-B-00 |
| `prompt` | string | ignored: the treatment's `request` drives the MO-B-00 pick |
| `bpm` | 40-220 | tempo for the Tier 1 grid (default 100) |
| `seed` | integer | run seed (default 20260926); change it for a different glitch/flow draw |
| `annotations` | boolean | ignored: the small index mark (`01 — 04`) shows only when the treatment sets `typePlan.index: true` |
| `audio` | path | an audio file relative to the brief; enables Tier 2 when pre-warmed |
| `shots` | `{ scene, text, items, value, label, note }[]` | explicit shot list overriding the default order |

Default shot order: title slam, one karaoke line per line, the list, the counter, the signature,
then the end card. A karaoke line over about 40 Latin characters or 20 Hangul syllables wraps to
two or three lines; the timeline gives it the reading time it needs.

The treatment's `durationSec` is a target on this path: every hold scales up to meet it and never
drops below its reading floor. When the floors alone need a longer film, the gate WARNs and the
reply says so. The generated sound bed (`treatment.md`) is the default here too; its tempo follows
the brief's `bpm` so the cuts land on the pulse.

## The six starter scenes

All six are original to this skill and render in every preset's voice.

- **title-slam** — the display voice. swiss-signal slams it in on the downbeat (180 ms, scale from
  0.95, width steps 75 → 100 → 125 on Latin runs only) with a teal rule; tidal drifts it up over
  0.9 s; terminalcore types it in with a caret. Prefers one line; two lines take 1.5 (Latin) or 1.6
  (Hangul) leading.
- **karaoke-line** — the body voice. The whole line is set in a dim tone that still clears 4.5:1,
  and each 어절 steps to full ink at its reveal time; terminalcore types each 어절 instead.
- **kinetic-list** — items enter one per reveal step with a short rule; 1.6 leading.
- **number-counter** — the machine voice counts to the value, stepping 15 times per second so
  digits never change every frame, settled by 55% of the hold; the label sits under it.
- **stroke-signature** — a single-stroke EMS font written by a moving pen; each character is
  written inside its own time slot, so the pen follows the timeline, not a fixed speed.
- **end-card** — the title again (or `end.title`) with a small machine-voice note.

## The engine contract

A scene is created once per shot and renders through `render(f, out)`: given the frame record
`f` (time `t`, local time `lt`, progress `p`, hold `dur`, frame index, accent window) it paints
type, rules and graphics into the shot's layers and returns post-chain overrides. The contract:

- **Purity.** The same `t` and run seed always paint the same pixels. No wall clock, no unseeded
  randomness, no network or file reads during a frame (MO-A-01, MO-A-23).
- **Anchors, not frame numbers.** Beats are functions of `f.p`, `f.lt` and the beat grid, never a
  literal frame or second baked into a scene (MO-A-06).
- **Named easing only.** `slam`, `drift`, `linear` and the small named set; no ad hoc curve
  literals (MO-A-08). Entrance scale never starts below 0.95.
- **State.** A scene or pass that carries state across frames is `stateful`. The only stateful
  pass here is the CRT phosphor persistence; its state is re-integrated from the shot start on
  every seek (`prerollMax` equals the shot), so a still at time t equals the sequential film
  frame at t (MO-A-25). Under software GL the persistence is switched off (MO-SH-09).
- **Hard cuts.** Adjacent shots meet on a beat with a hard cut (MO-A-07).
- **Type geometry.** Every drawn run reports a `textBoxes` entry (element, text, voice, font file,
  size, cap height, weight, fill, script, tracking, opacity, bbox from glyph outline bounds after
  the element transform and the post chain's shake/zoom); every non-glyph element reports its
  bbox; every multi-line block reports its leading; the glyph-coverage mask is rendered per frame.
- **Pass log.** Every look pass writes its uniforms through one wrapper that counts draws; the
  frame log (`render.jsonl`) has a pass line per pass per frame and one frame line with
  `rgbaSha256`, text boxes, ink count and flash-audit records (MO-SH-00a).

## Timeline tiers

- **Tier 1 (default):** reading time. Each unit holds 1.25 × its floor; every cut snaps forward to
  the next beat of the brief's tempo (default 100 BPM); every scene holds at least two beats.
- **Tier 2 (audio file given):** librosa beats from the pre-warmed venv replace the fixed grid; the
  same holds and snaps apply. If the venv is absent or no longer matches its pins, the render falls
  back to Tier 1 with a warning and still renders.
- **Tier 3 (`--word-timing`, opt-in only):** never used by bare `lit`. Without pinned models the
  render exits 14 and names `litgrok-ai motion-runtime install --word-timing`.

## Frames, samples and seeds

Frame n is at t = n / 60. The master averages 4 sub-samples across a half-frame shutter at fixed
offsets (MO-A-28) in linear HDR before the post chain, which runs once with the middle sample's
overrides; stills and the perf run use 1 sample; software GL uses 1 everywhere. Pass seeds are
`fnv1a32("${runSeed}:${sceneId}:${shotIndex}:${pass}")` as a uint (MO-SH-01); glitch hits, surges
and boot bursts are scheduled per shot from that seed before rendering and capped at two events
in any one-second window of a shot (MO-SH-03).
