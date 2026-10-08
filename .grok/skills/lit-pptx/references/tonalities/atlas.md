# Atlas

Atlas lets pictures lead. Photographs bleed to the page edge, titles sit on a dark panel over a
full-bleed image or under a large one, and the images supply most of the colour. The pack's own
accent is a quiet slate blue for charts and rules. Text follows the pictures: short bold-headed
bullets beside a photo, a caption under each figure, a KPI row where numbers matter.

**Choose it** for image-led decks: a product, a building or site, a field report, a portfolio, when
30 % or more of the content slides hold a real photograph or screenshot. **It is wrong** when real
pictures are scarce (the layouts turn into empty frames or placeholders), when the argument rests on
tables or charts (Atlas has neither a table nor a chart family; only `kpi-row` carries figures), and
for a read-alone briefing.

## Tokens

| Role | Value |
|---|---|
| ground / surface | `#FFFFFF` / `#F3F4F5` |
| ink / ink-muted / line | `#1A1D21` / `#555B63` / `#D6D9DD` |
| accent / accent-deep / accent-tint | `#2B4C7E` / `#1B2F4E` / `#E6ECF4` |
| field / on-field | `#1A1D21` / `#FFFFFF` |
| positive / negative | `#1E7A3F` / `#B3261E` |
| chart series | `#2B4C7E`, `#555B63`, `#8A6A2E`, `#3E7A5A` |
| faces | Pretendard Regular for display and figures, Bold for titles, Regular for body |
| figures | proportional |
| radius / edge | 0 / fill |

Atlas is the one pack whose display face is Regular: large cover and statement text stays light so
the photograph keeps the weight. Density 10, compact ramp. Variance 7 allows all five treatments.

**Pictures** may bleed and crop, with no frame. **Tables** (inside KPI rows) use a light grid of row
rules, no header fill. **Charts**, if a figure is placed as an image, follow hairline gridlines and
direct labels without annotation.

## Titles by role

| Role | Default | Also allowed |
|---|---|---|
| content | `side-rail` | `top-plain-large` |
| data | `top-plain-large` | `side-rail`, `bottom-anchor` |
| data-takeaway | `bottom-anchor` | — |
| sequence | `top-plain-large` | `bottom-anchor` (timeline) |
| image | `overlay` (image-full only) | `top-plain-large`, `side-rail`, `bottom-anchor` by family |
| statement | `statement` | — |

## Families and variants

image-full, image-split, photo-grid, figure-pair, asymmetric-feature, kpi-row, comparison, timeline,
text-column, statement.

- Covers: `cover-full-image` (the first picture full-bleed, title on a panel as tall as its text,
  standing on the page foot), `cover-split-image`
  (title beside the first picture), `cover-typographic` (title on a dark plate over a little under
  half the page). Covers hold only the title; the picture comes from the deck.
- Sections: `section-image` (on the section slide's own picture, its panel on the page foot), `section-field`.
- Closings: `closing-contact-split` (action rows beside a dark field holding each amount or date, the
  next step as a band meeting the field), `closing-ask`.
- Display: a statement or quote stands on the field over the whole page (a plate under part of the
  page left the open page above it empty); big-number panels use the accent tint.

Decoration: caption band, hairline rules, colour field.

## Captions

The picture a cover borrows and every `image-full` photo show their caption on the panel, not under
the picture; the gate reads the caption and source there. Write the caption without a number, since
the engine numbers every figure itself, and name the source after `|` on every picture.

## Do

- Open with the place or product: `cover-split-image` or `cover-full-image`, then one summary slide
  in `text-column` with scope, schedule, budget and open items.
- Alternate shapes: a full-bleed page, a split with bullets, a pair, a grid of three.
- Use `figure-pair` for before and after, with one or two lines giving the measured change.
- Put the numbers that matter in one `kpi-row` with the prior-year basis.
- End with a `closing-contact-split` keyed by amounts when the deck asks for money.

## Avoid

- Text set straight on a photograph; text on a picture always sits on the panel.
- Images inside card frames.
- More than three images in one row.
- Grey placeholder boxes in a delivered deck; if the pictures are not there, choose another pack.

## Two worked slides

Both are trimmed for reading. Complete slides of the same kind in the example decks carry the
extra rows, groups and takeaways that fill a compact page and pass the gate.

A picture beside its explanation, each bullet a fact:

```markdown
---
layout: image-split

## Bank stabilisation at the mill bend

![Stone toe and willow stakes eight weeks after planting | Source: sample photo](assets/example-b.png)

- **Problem** the bend lost about 1.2 m of bank a year to winter floods
- **Works** 380 m of stone toe and 2,600 live willow stakes
- **Early result** no measurable bank loss through the July high water
- **Planting** 84 % of stakes in leaf at week eight; target 70 %
---
```

Before and after with the measured change:

```markdown
---
layout: figure-pair

## 남쪽 계단 정비 전후

![정비 전 목재 계단, 2026년 5월 | 출처: 예시 이미지](assets/example-b.png)

![정비 후 석재 계단과 경사로, 2026년 9월 | 출처: 예시 이미지](assets/example-c.png)

- 높이가 제각각이던 목재 계단을 석재 34단과 1:15 경사로로 바꿈 (예시)
- 계단 12단마다 쉼터를 두고 양쪽에 손잡이를 설치 (예시)
---
```

Full deck: `examples/06-image-led-atlas-en.md`.
