# Signal

Signal is for a room that listens: a pitch, a launch, a proposal presented live. One idea per slide,
set large on white, with a single hot red that belongs to the subject. Titles take display size,
figures stand on red panels, and a statement page is allowed for a real quotation. The density is
still 10: the large title is offset by full evidence underneath.

**Choose it** for pitches and launches presented in person, and when content slides are short
(around 40 Korean glyphs or 80 Latin characters of argument each) but every slide still has figures
behind it. **It is wrong** when the audience studies the file afterwards, when tables make up most of
the content (Signal has no `ledger-table` and no dashboard), and when the deck needs an agenda, a
timeline or long itemised text, none of which the pack carries.

## Tokens

| Role | Value |
|---|---|
| ground / surface | `#FFFFFF` / `#F4F4F5` |
| ink / ink-muted / line | `#15131A` / `#55525C` / `#D4D4D8` |
| accent / accent-deep / accent-tint | `#C8361A` / `#6E1A0C` / `#FBE7E2` |
| field / on-field | `#C8361A` / `#FFFFFF` |
| positive / negative | `#1E7A3F` / `#15131A` (a loss keeps the ink and carries its ▼) |
| chart series | `#C8361A`, `#15131A`, `#6B6870`, `#2F6F8F` |
| faces | Pretendard Bold for display, titles and figures; Regular for body and labels |
| figures | proportional |
| radius / edge | 0 / fill |

Density 10, compact ramp (title 26, display 36). Variance 6 allows four treatments; the pack has four.

**Tables**: open style, no header fill, a rule above and below, numbers right-aligned, totals bold;
the row whose first cell appears in the title is tinted red-pale as the row the slide is about.
**Charts**: no gridlines, direct labels, the red on the highlighted series, annotations allowed.
**Pictures** may bleed and crop.

## Titles by role

| Role | Default | Also allowed |
|---|---|---|
| content | `top-plain-large` | `top-rule`, `bottom-anchor` (by family) |
| data | `top-rule` | `top-plain-large`, `bottom-anchor` |
| data-takeaway | `top-plain-large` | `top-rule`, `bottom-anchor` |
| sequence | `top-rule` | `top-plain-large` |
| image | `bottom-anchor` | `top-plain-large`, `top-rule` |
| statement | `statement` | — |

`top-plain-large` sets the title at 36 pt in two lines of about 20 Korean glyphs; write titles that
fit, or the engine moves the slide to `top-rule`.

## Families and variants

statement, big-number, image-split, asymmetric-feature, process, kpi-row, chart-insight, full-chart,
comparison, table-insight, quote.

- Covers: `cover-numeral` (a year or real figure above the title), `cover-typographic` (drawn as a
  drench: the whole page red, the title low), `cover-split-field` (half the page red).
- Sections: `section-field`, `section-numeral`.
- Closings: `closing-statement` (one sentence, no table), `closing-ask` (the ask as action rows with
  the next step on a red band). Use `closing-ask` whenever there is money, a decision or a date.
- Display: statements stand open on white; big numbers sit on the red field with white figures.

Decoration: colour field, hairline rules, real numerals. No cards.

## Do

- Write the title as the topic, then let the first takeaway say the claim in one line.
- Use `big-number` for two to four related figures, each with its basis; the red panel carries them.
- Put the product on an `image-split` or `asymmetric-feature` early, so the room sees the thing.
- Keep lists to four items; a fifth goes to the next slide or into a table.
- Use `comparison` with matching criteria labels for "today versus with us".

## Avoid

- Red for losses; a loss is ink with ▼.
- More than two lines of display text on any slide.
- Cards and boxed bullet groups.
- A statement slide that holds a claim; claims go in the body of a content slide.

## Two worked slides

Both are trimmed for reading. Complete slides of the same kind in the example decks carry the
extra rows, groups and takeaways that fill a compact page and pass the gate.

Pilot figures on the red panel, with their evidence:

```markdown
---
layout: big-number

## 시범 운영 6개월 핵심 지표

| 폐기 비율 변화 | 유료 전환율 | 월 이탈률 |
|---|---|---|
| −3.3%p | 83% | 1.8% |
| 8.9% → 5.6% | 시범 12곳 중 10곳 | 유료 전환 후 3개월 평균 |

- 시범 매장 한 곳당 월 폐기 금액이 평균 47만 원 줄었다
- 이탈한 매장 두 곳은 모두 폐업이 사유였다
- 출처: 예시 스타트업 시범 운영 기록, 2026년 4-9월 (예시)
---
```

A short process, each step saying what happens:

```markdown
---
layout: process

## From order to restock suggestion

- **1. Sales sync** menu sales arrive from the till every 15 minutes
- **2. Stock deduction** recipes convert each sale into ingredient use
- **3. Count correction** the closing count fixes the gap between book and shelf
- **4. Order suggestion** tomorrow's bookings and weekday patterns set the quantity
- Source: sample service design document v0.9, September 2026 (sample)
---
```

Full deck: `examples/01-pitch-signal-ko.md`.
