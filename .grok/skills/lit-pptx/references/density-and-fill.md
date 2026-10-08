# Density and fill

Two dials decide how a deck uses its pages. **Density** sets how much a page holds and how tightly:
grid margins, type ramp, gaps, padding, table row height and how much empty band a slide may leave
under its last block. **Variance** sets how many title treatments one deck mixes. Every pack starts at
density 10; variance starts between 4 (gazette) and 8 (studio). The skill may move a dial by up to 2
on its own and writes the move on the direction card; a larger move waits for the user. Set the dials
in the frontmatter (`density: 8`) so the source records them.

The engine cannot invent content, so a full page comes mostly from how the source is written. This
file says what the dials change, what the engine does to close a gap, and how to write a source that
fills.

## Density steps

| Density | Grid (16:9 side margin) | Ramp | Body | Gaps item / group / block | Padding | Min table row | Engine band cap |
|---|---|---|---|---|---|---|---|
| 1-2 | airy (60 pt) | presented | 18, steps up to 24 | 18 / 36 / 48 | 24 | 36 | 0.28 |
| 3-4 | standard (48 pt) | presented | 18, steps up to 24 | 12 / 24 / 36 | 24 | 32 | 0.24 |
| 5-6 | standard (48 pt) | reading | 14, steps up to 18 | 6 / 18 / 24 | 18 | 24 | 0.18 |
| 7-8 | dense (36 pt) | reading | 14, steps up to 18 | 6 / 12 / 24 | 12 | 22 | 0.14 |
| 9 | dense (36 pt) | reading | 14, no step-up | 6 / 12 / 24 | 12 | 20 | 0.12 |
| 10 | compact (24 pt) | compact | 13, no step-up | 6 / 12 / 18 | 12 | 18 | 0.12 |

The compact ramp is source 9, label 11, body 13, lead 18, title 26, display 36, cover 44 pt. On it a
top-rule title sits close over its rule, the body starts about 92 pt from the top, a text column holds
up to 22 lines, and type is never enlarged to fill. Nothing goes under the readable floor
(body 12 pt, table cells and captions 11 pt, sources 9 pt). For a big room, density 8 gives body 14
pt and 36 pt margins, and the skill may make that move without asking.

## Variance

| Variance | Most title treatments in one deck |
|---|---|
| 1-3 | 2 (only for a user who asks for a uniform deck) |
| 4 | 3 |
| 5-6 | 4 |
| 7-10 | 5 |

The cap never exceeds the number of treatments the pack has. At variance 4 a deck still needs five
distinct layouts for the composition check, so variety has to come from the body partitions; see
example 07, which pins two slides to reach them.

## What the engine does with a gap

When a content slide leaves more empty band than its cap, the engine tries the pack's `fill-order`
one policy at a time and keeps a step only if nothing overflows:

- **step-up**: body one ramp step larger, table data from label to body size, KPI values a step up.
  Off on density 9 and 10.
- **distribute**: item, group and block gaps open one step each; the body keeps its top edge, and a
  row of peers keeps equal heights.
- **anchor-visual**: a chart, figure or picture takes the remaining height; table rows grow up to a
  quarter above the minimum.
- **change-family**: an instruction to the author. The engine cannot pick a better shape for the
  content, so the log says so.

A column can stand empty beside a full one even when the band under the body is small: two short
takeaways beside a chart, a source line at the column's foot and nothing between. The engine reads
each text or picture column against the column beside it (its largest empty band, from the top of the
pair down to where the longer column ends) and fills one that leaves more than 40 % of the body empty,
by layout only and in this order:

- the visual takes columns: a narrower takeaway column wraps onto more lines and a wider chart or
  picture grows, down to three columns of takeaways, never lowering the takeaways' size;
- the takeaways step up to lead size when they fit;
- the room left is shared between the points, at most a sixth of the body a gap;
- two short points beside a chart that still leave the column empty run under the chart, side by
  side, and the chart takes the body's width;
- a short sidebar note beside a long main column stands across the top at lead size and the main
  points run in two columns under it;
- a title under which a column still stays empty gives way to another title that fits.

When none of these fills it, the gate fails the slide (OF-115) and the fix is in the source: the
takeaway the slide lacks, the values beside the chart, or another family.

Every attempt is logged:

```text
fill: slide 3 band 0.22 -> 0.06 (distribute)
fill: slide 8 band 0.26 -> 0.26 (none: nothing on the slide can grow; choose a fuller family)
```

Title choice is part of filling: when the default title leaves a short body, the engine may switch to
a rail or a bottom title so a chart or table gets the whole height. Padding cards and adding shapes are
not in its repertoire.

## Writing a source that fills

These rules are what the twelve examples follow. Each gives the engine real material for the lower
half of the body.

- **Each content slide answers the reader's follow-up questions**: where a figure comes from, what it
  is compared with (last year, the plan, a peer), which period it covers, who published it, and what
  follows from it.
- **Every data slide ends with a source line.** `출처: …` or `Source: …` names the origin and period;
  a `주: …` or `Note: …` line may follow with a definition or caveat. Both go to the foot strip.
- **Tables run five to eight rows**, four to six columns, units in the header or caption, two or
  three takeaways after the caption. Three rows or fewer read better as a `kpi-row` or a
  `comparison`.
- **KPI rows hold four to six figures**, with a second row giving each figure's basis ("계획 대비
  +2.8%", "Q2 1.71 M"). A `big-number` panel holds two to four related figures the same way.
- **Comparisons have three or four criteria**, each opened with the same label on both sides
  ("비용: …", "Accuracy: …"), so the engine can draw a criteria column and rows that read across.
- **Charts carry a caption and two to four takeaways**; write the chart table with exact figures.
- **Processes and step diagrams** name what happens at each step. Add two or three plain bullets
  after the steps (rules, a sample sentence, the source); they run under the steps and fill the page.
- **Method slides list eight to twelve terms** when the formula is short, including a worked value
  for each term (example 04).
- **Itemised text uses groups with sub-points**: four to six bold heads, two or three `(1)` `(2)`
  sub-points each. Flat one-line bullets leave half a compact page empty.
- **Timelines take five dated rows and two or three takeaways**; an axis with one line under it, or
  nothing, can leave the band under the axis empty, which OF-109 fails.
- **References list eight to ten entries**, sources first, then the definitions the deck relies on.
- **Closings carry the ask, the decision, and the next step with owner and date**, usually as a
  small table of item, amount or deadline, owner.
- **Merge before padding.** A slide with little to say joins its neighbour or takes a family made
  for short content. A bullet that restates the title is filler, not fill.

## Numbers

Figures come in structured groups, never as one giant number on its own page. Every figure has its
unit, its basis or comparison, its period and its source. Nothing is set above title size. Sample
values are marked: the frontmatter `notice:` line (`예시 데이터 — 실제 수치로 바꿔 주세요` or `Sample
data — replace with real figures`) prints a notice on every slide, and captions and source lines say
"(예시)" or "(sample)". Avoid inflated framing ("10배 성장", "massive"): state the before and after and
let the reader judge.

## How the gate measures fill

On the compiled file, the empty band is the part of the body zone left under the last content block.
The zone runs from the bottom of the title (or from the top margin under a bottom title) to the floor
at 486 pt.
Decoration, the footer and the notice are not content. Covers, sections, statements, quotes and
statement closings are exempt.

- **OF-112** lists slides above their density cap as advisories; the deck fails only when the median
  band across measured slides exceeds 0.20.
- **OF-109** is per slide and per card: one unbroken empty stretch over 35 % of the area fails, even
  when the deck median is fine. Hollow text slides are what it usually catches.
- **OF-111** fails when content slides share one composition (title zone × body partition × dominant
  content) on more than 40 % of them, or show fewer distinct compositions than the deck length needs
  (up to five).
- **OF-115** fails a text or picture column whose largest empty band beside a longer column passes
  40 % of the body; a source strip at its foot counts as a block but never hides the band above it,
  and a chart's values table under the takeaways is read as part of their column. Beside the figure
  rows of a kpi-row or big-number slide the takeaways' column is read down to the body floor, since
  the rows stop where their spacing ends: the engine sets the takeaways across under the rows, or
  lets them share the room beside the rows when the across form would leave a band between the two.
- **Visual substance** fails a content slide whose blocks cover less than about a fifth of the
  content area, and a deck in which every content slide is a table.

When OF-109 fires on a text slide, add the missing supporting facts as groups and sub-points; when
it fires on a comparison or timeline, add takeaways under it or pin a title whose body is wider.
Shrinking type, stretching cards or adding shapes to pass the gate is a defect.
