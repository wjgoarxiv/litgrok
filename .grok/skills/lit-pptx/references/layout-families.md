# Layout families

Each slide does one job, and each job has a shape the engine knows how to draw: that shape is a
layout family. You write its name after `layout:`; the pack then supplies the titles it may take and
the look of its tables, charts and rules. There are 28 content families and 20 cover, section and closing variants. No pack
carries all of them. Each pack lists the ones that suit its character, and a slide that asks for a
family outside that list is drawn with the family's own geometry and a `note:` line, which is a
signal to change the family or the pack.

Choose the family from what the slide must do, never from what the previous slide used. Variety in
a deck comes from slides doing different jobs; the gate's OF-111 check reads the compiled file and
fails a deck whose content slides share one composition too often.

List what a pack offers before writing:

```bash
node .grok/skills/lit-pptx/scripts/compile-deck.js --list-tonalities
node .grok/skills/lit-pptx/scripts/compile-deck.js --list-layouts gazette
```

The second command prints each family with the titles it may take under that pack, then the cover,
section and closing variants.

## Content families

| Family | Job | What the source gives it | Packs |
|---|---|---|---|
| `text-column` | itemised text that keeps a reading measure | `- **head** text` lines with `(1)` `(2)` sub-points | atlas, chalk, gazette, paper |
| `text-two-column` | a longer itemised body split in two | four to six bold-headed groups; the engine splits at a group boundary | gazette, ledger, studio |
| `summary-box-list` | a boxed conclusion over its evidence | `::: key-message` (one or two lines), then bold-headed groups | gazette |
| `sidebar-note` | a point with a fenced note beside it; a note too short for its column stands across the top at lead size with the points in two columns under it, and under a side title it stands in the rail | bold-headed groups, then `::: main-box` holding the definition or the usual mistake | chalk |
| `agenda` | the deck's parts, numbered | `- **Part** what it covers`, three to six lines | chalk, gazette, ledger |
| `statement` | a quotation or a display-led page the user asked for | the `##` line is the sentence; one body line becomes the support line | atlas, chalk, night, paper, signal, studio |
| `quote` | a quotation with its source | a line opening with `“`, then a line opening with `—` | chalk, paper, signal |
| `kpi-row` | four to six headline figures | a two-row table: values, then each figure's basis; then takeaways and a source line | atlas, ledger, night, signal, studio |
| `kpi-over-chart` | figures above the trend that explains them | the KPI table, then a `::: chart` block, then one takeaway and a source line | ledger, night |
| `dashboard-grid` | two or three small charts read together | two or three `::: chart` blocks, then one takeaway and a source line | ledger, night |
| `table-insight` | a table with its reading beside it | a pipe table, a `>` caption, two or three takeaways, a source line | chalk, gazette, ledger, paper, signal |
| `ledger-table` | a full-width table that is the evidence | a table of five to eight rows and up to six columns, caption, takeaways under it | gazette, ledger |
| `matrix-2x2` | options on two axes | a 3 × 3 table: corner `효과 \ 난이도`, two column heads, two row heads; cells `item · detail · owner` | gazette, ledger |
| `comparison` | two sides read across shared criteria | `:::: columns 1fr 1fr`, each `::: col` with `- **side**` and `(1) 기준: …` items | all eight |
| `chart-insight` | a chart with its reading | a `::: chart` block with a `>` caption, two to four takeaways, a source line | ledger, night, paper, signal, studio |
| `full-chart` | one chart across the page | a `::: chart` block and a source line | ledger, night, paper, signal |
| `big-number` | two to four related figures as a data panel | a KPI table (labels, values, basis row), then evidence bullets | ledger, night, signal, studio |
| `process` | three to five steps in order | `- **1. 단계** what happens`; plain bullets after the steps are takeaways | chalk, signal |
| `step-diagram` | steps taught one at a time | as `process` | chalk |
| `timeline` | dated events on one axis | a `시점 \| 할 일 \| 담당` table (or Date, Milestone, Owner), caption, takeaways | atlas, gazette, ledger, night, studio |
| `method` | a formula or figure with its terms | a formula line or an image, then `- **term** meaning` lines | chalk, night, paper |
| `image-full` | one photograph as the page | one image whose alt text is the caption | atlas, studio |
| `image-split` | a picture beside its explanation | an image, then bold-headed bullets | atlas, chalk, signal, studio |
| `photo-grid` | a row of two or three pictures | the images on consecutive lines, then a single sentence | atlas, studio |
| `figure-pair` | two states of one subject (before/after, A/B) | two images, then one or two measured lines | atlas, paper |
| `figure-academic` | a journal figure and how to read it | an image captioned `Figure N.`, then bullets headed observation, limitation, implication | paper |
| `asymmetric-feature` | one large picture and a narrow text column | an image, then four or five short bullets | atlas, signal, studio |
| `references-appendix` | sources and definitions, one a line | `- [1] …` lines, eight to ten entries | gazette, ledger, paper |

Old layout names still compile under a tonality: `content` and `main` become `text-column`,
`summary` becomes `comparison`, `closing` becomes `closing-statement`, and `cover` or `section` take
the pack's first variant.

## Source details that decide the result

- **Charts.** `::: chart type=column unit="억 원"` around a pipe table: categories in the first
  column, one column per series, a `>` caption inside the block. Types: bar, column, line, area, pie,
  doughnut, stacked. The chart is native and editable; on the compact step its values also appear as
  a small table beside the takeaways when they fit (up to eight rows and four columns).
- **Captions.** A `>` line after a table or inside a chart block is its caption; say what is shown,
  the unit, the period, and "(예시 데이터)" or "(sample data)" for sample values.
- **Source strip.** A body line that opens with `출처:`, `자료:`, `주:`, `Source:` or `Note:` is set as a
  strip at source size, so it costs the takeaways no room. Under a side title it closes the rail;
  beside a chart, table or picture it closes the takeaway column on the floor, so the column runs as
  long as the visual; elsewhere it runs across the foot of the body. A takeaway column that still
  stops halfway down the visual beside it fails the gate (OF-115): add the source or a note line, or
  the takeaway the slide lacks. The gate reads the largest empty band inside the column, so a strip
  at the foot under two short points still fails; see density-and-fill.md for how the engine fills it.
- **Run-in labels.** A point may open with a bold label: `- **요약:** 앱에서 맡기면 …`, `- **Basis:**
  1.0 L/min feed`. Write the colon; the engine adds one when the label ends without a separator,
  because a bold word running into its sentence reads as part of it. A bold line with nothing after
  it is a group heading and takes none. The gate fails a hand-set label without a separator (OF-118).
- **Pictures.** `![caption | 출처: …](assets/name.png)`. The text before `|` is the caption, the rest
  its source. Write the caption without a number: the engine prefixes `도 N.` on a Korean deck and
  `Figure N.` otherwise, and drops a `도/그림/Figure/Table N.` you typed. The gate wants every figure's
  caption and source beside it: under the picture, or on the panel laid over a full-bleed photograph
  and the picture a cover borrows (examples 06, 09 and 10).
- **Covers take no blocks.** A cover slide holds only its `#` title (and notes). `cover-split-image`
  and `cover-full-image` borrow the deck's first picture; `cover-figures` borrows its first KPI row;
  `cover-index` borrows the agenda.
- **Bullets beside a picture are narrow.** Under a bottom title the takeaways run in columns 10-12;
  keep each under about 60 Latin characters or 30 Korean glyphs, and captions under about 70.

## Covers, sections and closings

Name a variant on the `layout:` line (`layout: cover-band`). The engine draws it when the pack lists
it and the deck holds what it needs; otherwise it takes the pack's first variant it can draw and
prints `note: slide 1: drawn as …`.

| Variant | What it shows | Needs | Packs |
|---|---|---|---|
| `cover-typographic` | the title drawn with the pack's cover device | nothing | atlas, chalk, gazette, ledger, night, paper, signal |
| `cover-figures` | the title over the deck's headline figures | a KPI row in the deck | ledger, night |
| `cover-index` | the title beside the deck's parts | an agenda, or two or more sections | gazette, ledger, paper |
| `cover-numeral` | a year or real figure at title size above the title | a year or figure in the title or date | chalk, night, signal, studio |
| `cover-split-field` | half the page in the accent field | nothing | signal |
| `cover-split-image` | the title beside the first picture | a picture in the deck | atlas, paper, studio |
| `cover-full-image` | the first picture full-bleed, title on a panel | a picture | atlas |
| `cover-band` | the title under a strong head band, the parts across the page | nothing | gazette |
| `cover-rail` | the title in a left rail | nothing | chalk, studio |
| `section-field` | the part title on a colour field | nothing | atlas, night, paper, signal |
| `section-numeral` | the part number beside the part title | nothing | chalk, ledger, night, signal, studio |
| `section-rule` | with an agenda, an index page with this part marked | nothing | gazette, ledger, paper |
| `section-rail` | the part title in the rail | nothing | chalk, studio |
| `section-band` | the part index in the band, the part title under it | nothing | gazette |
| `section-image` | the part title on the section's own picture | a picture on that slide | atlas |
| `closing-ask` | the ask as title, its table as action rows, the next step on the floor | a table or bullets | atlas, chalk, gazette, ledger, paper, signal |
| `closing-decision-box` | a boxed decision line over the items to approve | one decision bullet, then a table if there are items | gazette, ledger, night |
| `closing-statement` | one closing sentence | no table or picture | night, signal |
| `closing-summary-list` | the takeaways numbered down the page | bullets | chalk, paper, studio |
| `closing-contact-split` | action rows beside a field holding each row's amount or date | a table or bullets, plus a next-step line | atlas, studio |

A closing title names the ask ("시드 투자 15억 원 사용 계획", "Decisions for the November peak"). The
body carries what is to be decided, the amount or deadline, the owner, and the next step with its
date. "감사합니다" or "Questions?" alone is not a closing.

## Display devices

A cover or a section page holds a handful of words, so a pack's `display:` key names the device that
gives such a page its weight. A device frames what the source already says; it never
adds words or figures.

| Device | Draws | Packs |
|---|---|---|
| cover `drench` | the field over the whole page, title anchored low | signal |
| cover `plate` | a field plate over a little under half the page, title on it | atlas |
| cover `rail` / `band` | the pack's `cover-rail` / `cover-band` | chalk / gazette |
| cover `figures` | `cover-figures` when a KPI row exists, else the plain cover | ledger |
| cover `numeral` | `cover-numeral` with the year | night |
| cover `rules` | a journal title page: heavy rule, title, hairline, presenter, place and date | paper |
| statement `open` / `drench` / `rules` / `offset` | the sentence alone; on the field over the whole page; between hairlines; beside a short rail | signal, night / chalk, atlas / paper, studio / no pack (the rail beside a quote stood empty) |
| number `field` / `tint` / `outline` | the panel behind a big number | signal / atlas, chalk, ledger, night, studio / gazette, paper |
| closing `band` / `box` / `rules` | the next step on the floor as a field band, a tinted or outlined box, or under a rule | atlas, night, signal, studio / chalk, gazette, ledger / paper |
| `index: true` | sections show the deck's parts with this one marked | gazette, ledger, paper |

## What the engine does with the source

- A title that needs two lines is split so both lines are about as wide, never leaving one word
  alone below; figures are glued to their counter ("15억 원", "4 분기", "다섯 곳").
- Line breaks in body text and table cells are placed by the engine at spaces, so "51점" or "(10월" is
  never split between digit and unit by the renderer, and a short parenthetical such as "(▲ +3.9%)" (up to
  16 characters) is never split inside.
- Section numerals come from the agenda: write the section title exactly as its agenda head and the
  page shows "02 / 04". With no agenda the sections are counted; a lone section gets no numeral at
  all, and its title is set large over the titles of the next slides.
- A closing's table becomes action rows keyed by the amount column (each row gets a bar for its share
  of the total), else by the date column. A `합계` or `Total` row is never an action row.
- A big number is a panel of two to four figures, one row each (value, label, basis), never larger
  than title size, seven of twelve columns wide, with the evidence beside it.
- Dark devices that do not fill the page (plates, rails, panels) stay under half its area, so the
  pack's ground still reads as the page colour.
- In tables of signal and night, the row whose first cell appears in the slide title is tinted as
  the row the slide is about.

## Families under different titles

The same family changes shape with its title, which is where a lot of a deck's variety comes from:

- With a `side-rail` title, figures from a KPI table stack as rows, process steps run downward, and a
  chart fills columns 5-12 from top to floor. The rail under the title carries the slide's supporting
  content: a comparison's criteria labels, a visual's takeaways (a step up, at lead size, when body
  size leaves the rail more than 40 % empty), a values table and the source strip. A table gives up
  its takeaways only when its rows, opened, still fill the body. A slide whose rail would stay more
  than 40 % empty takes another title unless `title: side-rail` pins it, and the gate fails that
  rail (OF-115).
- With a `bottom-anchor` title, the chart, figure or panel owns the zone from y 36 to 24 pt above the
  title, and the title's last line stands on the body floor.
- Beside a visual, takeaways that leave their column more than 40 % empty are set a step up (lead)
  when they still fit; compact process rows that leave a quarter of the body's width empty do the same.
- Under `band`, the body starts at y 120 and runs to the floor at reading size.
- A `quote` under `statement` sets the quotation as the page's sentence and the source as support.

## Reading the compile log

```text
note: slide 4: timeline is not a chalk layout family (step-diagram, process, …); drawn with its own geometry
note: slide 1: cover-figures cannot be drawn (the deck has no row of headline numbers)
note: slide 1: drawn as cover-typographic
variety: slide 3 drawn under top-rule so the deck carries 6 layouts
fill: slide 6 band 0.19 -> 0.19 (none: nothing on the slide can grow; choose a fuller family)
```

Treat every `note:` as a request the pack could not honour. Change the source: pick a family from the
pack's list, shorten the title, or go back to `direction-step.md` and choose another pack.
A `variety:` line is the engine keeping the deck varied and needs no action. A `fill:` line that
ends in "choose a fuller family" is covered in `density-and-fill.md`.
