# Korean and Latin type in motion

These rules decide how words are split, spaced, weighted and timed. Most are enforced by the
engine and the gate; knowing them lets the agent write a brief that passes on the first round.

## Script runs (MO-FT-04)

The type kit splits every string into script runs. A Hangul run is Hangul syllables and jamo; a
Latin run is Latin letters. Digits, punctuation and spaces are not their own run: they join the run
on their left, or the run on their right when nothing is on the left. So `2026년` is one Hangul run,
`LIT팀` is `LIT` + `팀`, and `LIT 스튜디오` is `LIT ` + `스튜디오`. Each run takes the voice's font
for its script: Archivo or VT323 for Latin, the product's PretendardGOV pair or Galmuri9 for Hangul.

A Hangul run never takes tracking and never takes width-axis motion, even inside a mixed line
where the Latin run beside it does. The gate fails a Hangul text box with non-zero tracking or an
Archivo width instance (MO-FT-04). There is no synthetic condensing and no synthetic bolding of
Hangul: weight steps move only between the two static files the lit-pptx skill ships, 400 and 700
(MO-A-33). Hangul is set about 6% smaller than Latin in mixed display lines so the syllable
blocks and the Latin cap height read as one line; that is a uniform size change, not a squeeze.

## Line breaks by 어절 (MO-A-13, MO-FT-05)

A line break and a karaoke reveal step happen only at a space between 어절, never inside one.
Latin text breaks on spaces too. If a single 어절 is too wide for the line at the minimum size,
the scene shrinks the size rather than splitting it. Write lines that break well: put a natural
pause between two halves of a long sentence, or give each half its own karaoke line.

## Per-glyph positioning (MO-A-32)

Layout comes from the font's own advance widths and kerning table through opentype.js, glyph by
glyph. When a word is drawn in two pieces (a revealed part and a pending part, or a typed-in
prefix), the second piece starts at `glyphX(line, i)`: the x of glyph i inside the whole kerned
line. Measuring the prefix alone would drop the kerning pair across the split and open a hairline
gap. Text boxes come from glyph outline bounds, so title-safe checks see real ink.

## Tracking (MO-C-25)

The display voice may animate tracking as tight as -0.04 em and no tighter (swiss-signal starts a
slam at -0.02 em and settles at 0). The machine voice (MesloLGS NF numbers and labels) and body text
never take negative tracking. Hangul runs stay at 0.

## Weights and sizes (MO-FT-07)

- PretendardGOV Regular (400) is the floor for held Hangul body text; titles and large slams use
  Bold (700). Nothing between or beyond those two files is synthesized.
- Galmuri9 renders at 45 px or larger (at least five times its 9 px grid) so its strokes do not fuse;
  the terminal scenes never set it smaller. A long Hangul line in terminalcore falls back to the body
  face instead of shrinking Galmuri below its floor.
- Galmuri and VT323 never share one line: a terminal line containing Hangul is set in Galmuri from
  end to end.
- Silkscreen is for window-chrome labels only; it is blocky at headline sizes.

## Punctuation (MO-A-34)

Display strings go through a smart-punctuation pass: straight quotes become typographic quotes,
three dots become an ellipsis, leading elisions get an apostrophe. The terminal voice and the
machine voice keep straight quotes, as typed input would. The pre-flight glyph check (MO-D-04)
runs after this pass, so a curly quote missing from a pixel font is caught before rendering.

## Reading floor (MO-C-07/08)

One function covers English, Korean and mixed text. Count Hangul syllables H, Latin words W and
Latin-run characters C in a unit:

- a line or scene holds at least max(1.0 s if any Hangul else 0.9 s, 0.2·H + W/3.3), and a line
  also stays at or under 17 Latin characters per second;
- a word shown alone holds at least max(0.5 s, 0.2·H + W/3.3);
- a karaoke reveal step holds at least 0.35 s (its line carries the rate floor).

A four-어절 line with 14 Hangul syllables needs 2.8 s. The generator paces every unit at 1.25 times
its floor, so a default timeline clears the gate; the gate fails a unit held below its floor by
more than one frame. These floors are provisional defaults pending sign-off.

## Leading and measure (MO-C-26, MO-C-27)

A block that shows two or more lines at once uses at least 1.5 leading for Latin and 1.6 for
Hangul or mixed text (never below 1.4 at three or more lines). A single display line keeps a tight
1.1 because there is no second line to crowd. A paragraph card of Latin running text keeps 60-75
characters per line; Korean paragraph cards get an advisory 30-45 note, never a FAIL.

## Contrast (MO-C-06)

Measured on the rendered pixels of a settled frame per text shot: the median ink under the glyph
mask (eroded by 1 px) against the 5th and 95th percentile background around the box (the mask
dilated by 2 px is excluded). Body text needs 4.5:1; large text (32 px and up, or 25 px and up at
weight 700) needs 3:1. Over a gradient, both ends of the ink and the ground are paired and the worst
pair counts. Small labels over vignetted corners are the usual casualty: keep them out of dark
corners or set them larger.

## Outlines and halos (MO-A-35)

No outlined or haloed type, ever. The engine has no outline primitive; legibility over a busy
ground comes from palette and layout, not from a stroke around the letters. The stroke-written
signature is a single-line plotter font, not an outlined glyph.
