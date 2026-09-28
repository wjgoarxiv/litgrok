# Style bibles

A style bible fixes the look before any frame is rendered, so every shot of a film speaks one
visual language. Each preset below is a complete bible in the same template. The engine carries
the numbers (palette, pass list, pass parameters, motion tokens); this file explains them so the
agent can choose a preset, describe it in the reply, and judge a still against it.

## Template

- **Tone:** one sentence on how the film should feel.
- **Palette:** a small named set: ground, ink, one signal hue, at most one rare accent.
- **Three type voices:** display, body (Hangul and Latin), machine (numbers, labels, timecode).
- **Motion tokens:** a few named durations and curves reused everywhere; no ad hoc curves.
- **Passes and order:** which look-library GLSL passes run, in which order, and why.
- **Grid:** margins, columns and where type sits.
- **Anti-slop list:** the moves that make this look generic.
- **Originality rules:** what must be this film's own.

## Choosing a preset (MO-B-00)

Match whole words in the request and brief, first row wins, and an explicit style always wins.
Latin keywords match at word boundaries; Korean keywords match at the start of a word, so a
keyword inside a longer compound it merely ends does not count.

| Brief mentions | Preset |
|---|---|
| 터미널, CRT, 해커 / terminal, hacker | `terminalcore` |
| 물결, 파도, 잔잔한, 흐름 / gradient, wave, tide, calm | `tidal` |
| anything else | `swiss-signal` |

`system`, `status` and the bare `flow` are deliberately not keywords: they match unrelated briefs.
State the pick and its reason in the reply; the render report records it too.

## swiss-signal (default)

- **Tone:** printed, precise, confident; a poster that learned to move.
- **Palette:** ink ground `#0C0E13`, bone type `#E9EBE4`, teal signal `#0F7A82` (rules and one
  underline, never small text: it clears 3:1 only), gold accent `#D9A441` for one moment only,
  graphite `#4B5058` for hairlines, and a dim bone for pending words that still clears 4.5:1.
- **Voices:** Archivo display (width 75/100/125, weight 400/700/900 static instances) for titles;
  the product's PretendardGOV Regular/Bold for Hangul; MesloLGS NF for annotations and figures.
- **Motion tokens:** `slam` 180 ms on the downbeat (the proven `cubic-bezier(0.16,1,0.3,1)`
  deceleration, entrance scale never below 0.95); `hold` after the slam; `snap-cut` 0 ms at every
  scene boundary. No spring, no bounce.
- **Passes and order:** `swiss-grid` (hairline rules as real GPU line draws, guides off) then
  `dither` (Bayer 4×4 at strength 0.3, an engraved print texture), then the post chain (grain,
  vignette, light chromatic aberration).
- **Grid:** 12 columns, 24 px gutter, 96 px margin, 8 px baseline; type sits left on the grid with
  generous negative space; small mono annotations sit beside large type, not under it.
- **Anti-slop:** centred fade-in words as the only move; one ease for everything; glitch with no
  beat logic; any rainbow gradient; bloom on anything but the signal; a hold so long it stalls.
- **Originality:** the pattern transfers, not a borrowed palette: one signal hue, one rare accent.
  Invent this brief's own metaphor per shot; never reuse another film's scenes or motifs.

## terminalcore

- **Tone:** an instrument panel waking up; functional, luminous, patient.
- **Palette:** navy ground `#05070A`, panel `#0C1116`, phosphor green `#39FF6A` as the one signal
  and the type colour (it clears 4.5:1 on navy and panel, so body text may use it), a grey label
  tone for chrome. Never mix green and the electric-blue alternate in one film.
- **Voices:** Galmuri9 pixel Hangul (never the bitmap-only variant), VT323 for Latin, MesloLGS NF
  for the status readout, Silkscreen for window-chrome labels only. A line with Hangul uses Galmuri
  for the whole line, so Galmuri and VT323 never share a line; long Hangul text falls back to the
  body face to stay legible.
- **Motion tokens:** `type-in` at 22 characters per second, linear (a terminal does not ease);
  `boot-flicker` 250 ms at each shot start, bounded by the CRT flicker cap; `hard-cut` on the beat.
- **Passes and order:** `terminal-ui` (one Canvas2D chrome layer: 1.5 px frame, title bar, status
  bar, two meters, caret) then `crt` (scanlines, light barrel, triad mask, phosphor persistence,
  flicker at most 0.06) then `dither` (Bayer 4×4, 2 px cells) then `glitch` (rare, scheduled,
  at most 2 events per second per shot together with the boot flicker).
- **Grid:** thin-border window on a flat field, margins on the character cell; no depth, no shadow.
- **Anti-slop:** falling code rain; neon purple haze; glitch as constant texture; both signal hues;
  pixel type set below its legible size.
- **Originality:** window chrome, meters and log lines are this skill's own drawings, never a copy
  of a real operating system or app.

## tidal

- **Tone:** calm water; type rides a slow current.
- **Palette:** indigo ground `#0E1420`, off-white type `#E8ECEF`, two gradient stops (deep teal
  `#124559`, violet `#4C3B6E`), coral `#E07856` as punctuation for one moment only. Off-white
  clears 4.5:1 on every point of the gradient, so no scrim is needed.
- **Voices:** Archivo 100/700 used calmly (no width animation), PretendardGOV Regular for Hangul,
  MesloLGS NF sparingly for annotations.
- **Motion tokens:** `drift` 2-4 s on the in-out sine curve `cubic-bezier(0.37,0,0.63,1)`, matched to
  the gradient's slow flow; `surge-punch` 300 ms on the slam curve, timed to a scheduled surge.
- **Passes and order:** `tidal-gradient` (domain-warped fbm and curl, 4 octaves, seeded origin per
  shot, surges with attack and decay of at least 0.1 s) then `swiss-grid` (layout rules, guides
  off) then `glitch` at no more than 0.5 hits per second, as rare punctuation.
- **Grid:** the same 12-column backbone as swiss-signal; the grid keeps calm type from drifting
  into mush over a moving field.
- **Anti-slop:** rainbow or hue-cycling ramps; bloom on the gradient; glitch as constant texture;
  motion blur that smears held type.
- **Originality:** the flow field is seeded per shot, so no two films share a field; the stops stay
  within the two-to-three stop restraint.

## Writing the style line in the reply

Name the preset and the reason in plain words: the keyword it matched, "you asked for it" when the
request names the style, or "agent default" when you chose it yourself (never call your own choice
user-specified). Add one sentence of intent. Mention anything the preset could not honour (for example, a long Hangul line
that fell back from Galmuri to the body face).
