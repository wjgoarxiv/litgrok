# Title treatments

A title treatment is where a slide's title sits and what is drawn with it. The engine has eight,
each with one fixed frame, so every slide under a treatment puts its title in the same spot. A deck
reads as designed when it uses three to five of them and each one always marks the same kind of
slide: a reader learns "the side rail means a chart with its reading" in two slides.

## Two rules for every title

**A title is a topic label.** Think of it as the heading of a table of contents: what is shown, in
what measure, for which period when that matters:
"권역별 대여소 이용 현황", "On-time delivery by region, Q3 2026". The claim goes in the body, as the
first takeaway, the first point, the boxed summary or the caption. The gate's OF-114 check fails a
title or cover subtitle that reads as a sentence:

- Korean: the last word ends in -다, -니다, -요 forms or -죠, or in a nominalised claim (-음 after a
  past or future stem, 있음, 없음, or -함/-됨 on a word other than 포함). "보고 순서" passes;
  "매출 증가함" and "목표를 달성했다" fail.
- English: a final period, an auxiliary (is, are, was, has, will …), or a finite verb after the
  first word: past forms (grew, rose, fell, improved, exceeded …) and a few third-person forms that
  seldom act as nouns (beats, exceeds, improves, grows …). Plural nouns such as "leads", "works" or
  "cuts" and hyphenated compounds such as "cut-over" stay labels: "Milestones to cut-over" passes,
  "Revenue rose 12%" fails.
- A question, a title that opens with a quotation mark, and a trailing parenthesis are not read as
  claims.

**No eyebrow, no decorative numeral.** Nothing small sits above a title. A numeral next to a title is
a real part, step or recommendation number, drawn by `kicker-numeral` or a section variant; it is
never added for texture.

## The eight

Geometry is for 16:9 on the compact grid (density 10: 24 pt margins, 54 pt columns, 24 pt gutters,
title 26 pt, display 36 pt). Budgets are Korean glyphs per line; Latin text takes about 1.7 times as
many characters.

| Treatment | Title frame | Drawn with it | Body zone | Budget |
|---|---|---|---|---|
| `top-rule` | columns 1-12 at y 36, title size | an accent rule one column wide, or a full-width hairline in packs without `accent-rule`, 6 pt under the title | 18 pt under the rule (y ≈ 92 for one line) to the floor at 486 | 2 lines of about 35 |
| `top-plain-large` | columns 1-10 at y 36, display size | nothing | 18 pt under the title (y ≈ 108 for one line) | 2 lines of about 20 |
| `side-rail` | columns 1-4 from y 36, title size | a filled rail (surface, or the field with white type in chalk) where the pack has `rail-fill`, else a hairline after column 4 | columns 5-12, from y 36; the rail under the title carries the criteria labels, the takeaways and the source | 4 lines of about 10 |
| `band` | inside a full-width band 108 pt tall, columns 1-11 | the band in the field colour, title in `on-field` | y 120 to the floor | 2 lines of about 32 |
| `statement` | columns 1-10, centred near y 303, display size | an optional support line under it | none | 3 lines of about 20 |
| `overlay` | lower left on a dark panel (columns 1-7) over a full-bleed picture; the panel is as tall as the title and its caption and stands on the page foot | the panel and the picture's caption | none: the picture is the content | 2 lines of about 19 |
| `kicker-numeral` | columns 3-12 at y 48, with a cover-size numeral in columns 1-2 | the numeral in the accent | y 120 to the floor | 1 line of about 27 |
| `bottom-anchor` | columns 1-9, its last line on the body floor at 486 (a one-line title leaves no band under it) | a hairline 12 pt above the title where the pack has `hairline-rule` | y 36 to 24 pt above the title for the visual; columns 10-12 beside the title stay clear | 2 lines of about 24 |

`kicker-numeral` needs a real number: a step, a ledger part, the part a section opened. An agenda is
not one: its rows carry the numbers, and a count beside its title read as a stray section number, so
the agenda takes another title (the gate fails a numeral there, OF-119). Without a number the engine
cannot draw it and picks another title.

## How a slide gets its title

The family sets the slide role: text families are `content`; tables, KPI rows, comparisons and
matrices are `data`; charts and big numbers are `data-takeaway`; processes, steps and timelines are
`sequence`; picture families are `image`; statements and quotes are `statement`; `method` is
`definition`; references are `reference`. The pack's `role-defaults` map gives each role a default
treatment. A pack may also give one family its own title under `structure`: Paper draws a comparison
under `top-rule` as a ruled table, Chalk sets the comparison's criteria on its board rail under
`side-rail`. That title comes before the role default and holds even when the deck already leans on
it, so two tonalities of one source differ in structure, not only in colour. When the role default
is a bottom title the slide may not take (a table), the pack's next treatment stands in.

For each slide the engine tries every treatment that both the family and the pack accept and that
the title fits. The role default is the pack's structure, so it stays unless another treatment fills
the body better by a tenth of the zone (by 0.15 when neither fills it) or the default cannot be drawn
without overflow; a side rail that would stay more than 40 % empty also gives way. Two deck-level passes follow: no title zone may
hold more than 40 % of the content slides, and the deck must carry enough distinct layouts for the
composition check. Each move is printed:

```text
variety: slide 5 drawn under side-rail so no title zone covers more than 40 % of the content slides
Treatments: 2:band 3:top-rule 4:band 5:top-rule 7:side-rail 8:top-rule 9:band 10:top-rule 11:band
```

The variance dial caps how many treatments one deck mixes: 2 at variance 3 or lower, 3 at 4, 4 at
5-6, 5 at 7 and above, never more than the pack has.

Closings with a table or a decision take only top titles (`top-rule`, `band`, `top-plain-large`).
Covers and sections draw their own variant's title and refuse a `title:` key.

## Pinning a title

Put `title: <treatment>` on the line after `layout:` when a slide must take a particular treatment.
The compile stops with a message naming the allowed list if the treatment is unknown, not in the pack,
not allowed by the family, or cannot hold the title:

```markdown
---
layout: comparison
title: side-rail

## 재배치 대안 비교
```

Pin sparingly. The usual reasons are a low-variance pack that needs a different partition to pass
the composition check (example 07 pins its agenda to `top-rule` and its comparison to `side-rail`),
or a comparison whose rows leave a column hollow under the role default (example 04).

## Choosing well

- **A chart or table with a reading** wants `side-rail` or `bottom-anchor`: the visual takes the full
  height and the title labels it from beside or below.
- **A page that is read** (briefing, status) wants `band` or `top-rule`, the most predictable heads.
- **A real sequence** wants `kicker-numeral`; a list with no order never gets a numeral.
- **A full-bleed photograph** takes `overlay`, and only on `image-full`. A large picture with a short
  label beneath takes `bottom-anchor`.
- **`statement`** is for a quotation (the `quote` family) or a display-led deck the user asked for. A
  single claim on an empty page is not a slide; it becomes the boxed summary or the first takeaway of
  a content slide.

Never move a title with a placed `box`. The frame is the treatment; a nudged title is a ninth,
broken treatment, and OF-113 fails it.

## What the gate checks

The gate classifies each title from the compiled file by geometry and companions and compares that
with the `title@<treatment>` name the engine writes on the shape; the name alone is never accepted.

- **OF-110**: a deck of eight or more slides shows at least three treatments (covers and sections
  not counted) and no more than the variance dial allows; every title is drawn as it is named.
- **OF-113**: slides under one treatment keep one frame (within 1 pt; a statement compares x and
  width only, a bottom title x, width and its bottom edge, because it stands on the floor).
- **OF-115**: a bottom title that ends more than 12 pt above the body floor fails, and so does a side
  rail more than 40 % empty under its title. What stands in the rail under the title belongs to the
  rail: it neither changes the side-rail reading nor counts as a body column. A text or picture column
  whose largest empty band, read beside a longer column, passes 40 % of the body fails as well; a
  source strip at the column's foot counts as a block but does not hide the band above it.
- **OF-119**: an agenda title stands without a numeral beside it.
- **OF-114**: titles and the cover subtitle are labels, as above.

On an enrolled template these findings are advisory, because the user asked for one fixed title
position.
