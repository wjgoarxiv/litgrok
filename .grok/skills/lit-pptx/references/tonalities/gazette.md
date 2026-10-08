# Gazette

Gazette turns a Korean 보고서 into slides. A slate band carries the title on content pages, a boxed
one- or two-line conclusion opens the argument, 개조식 evidence runs in groups at reading size, and
tables have a filled header and a full grid. A dark red is kept for the one key line. The deck is
made to be read page by page at a desk, by someone who was not in the room when it was written.

**Choose it** when the deck is circulated before a meeting, submitted for approval, or filed as the
record: 검토 보고, 월간 보고, 건의안. Korean language, long bodies (over about 150 glyphs per
content slide) and a fair share of tables push it to the front. **It is wrong** for a live talk
(what helps a reader swamps a listener), for any deck with charts or photographs (Gazette has neither
a chart nor an image family), and for English read-alone decks, which suit Ledger.

## Tokens

| Role | Value |
|---|---|
| ground / surface | `#FFFFFF` / `#F1F4F8` |
| ink / ink-muted / line | `#1A2230` / `#4A5568` / `#C8D0DA` |
| accent / accent-deep / accent-tint | `#A61B1B` / `#233A4F` / `#E8EEF4` |
| field / on-field | `#233A4F` / `#FFFFFF` |
| positive / negative | `#1E7A3F` / `#1A2230` |
| chart series | `#A61B1B`, `#233A4F`, `#4A5568`, `#7A6A2A` |
| faces | Pretendard Bold for titles and figures, Regular for body and labels |
| figures | tabular |
| radius / edge | 0 / fill and border |

Density 10, compact ramp. **Variance 4 allows three title treatments**, out of the four the pack
has. A briefing repeats its page head on purpose, so variety has to come from the body: a box over
groups, two columns, a full table, a matrix, a timeline.

**Tables**: header in the slate field with white labels, a hairline grid on every cell, the first
column shaded with the surface colour, numbers right-aligned, totals bold. Pictures, if forced in,
sit in a hairline frame with no bleed.

## Titles by role

| Role | Default | Also allowed |
|---|---|---|
| content | `band` | `top-rule`, `kicker-numeral` (by family), `side-rail` (text-column, agenda) |
| data | `top-rule` | `band`, `side-rail`, `kicker-numeral` (ledger-table) |
| sequence | `kicker-numeral` | `top-rule`, `band` (timeline takes only these two) |
| reference | `top-rule` | `band` |

With three treatments allowed, a deck usually settles on `band`, `top-rule` and one of `side-rail` or
`kicker-numeral`. If the composition check still finds too few layouts, pin one slide: example 07
sets its agenda to `title: top-rule` and its comparison to `title: side-rail`.

## Families and variants

summary-box-list, text-two-column, text-column, ledger-table, table-insight, comparison, timeline,
matrix-2x2, agenda, references-appendix.

- Covers: `cover-band` (the title under a slate band, the deck's parts across the page),
  `cover-typographic`, `cover-index` (needs the agenda).
- Sections: `section-band` (the part index in the band, the part title under it), `section-rule`.
- Closings: `closing-decision-box` (건의 사항: the decision in an outlined box, items as action rows
  keyed by deadline), `closing-ask`.
- Display: big-number panels are outlined in ink; the next step sits in an outlined box.

Decoration: header band, box outlines, hairline rules, real numerals.

## Do

- Open the body with the conclusion in `::: key-message`, one or two lines; the title stays a label
  ("핵심 요약: 대여소 38곳 재배치 건의").
- Keep 개조식 levels honest: the bold head states the point, `(1)` `(2)` give evidence, at most four
  sub-points, endings consistent (-음, -함 in the body are fine; titles never).
- Give each table a caption with period and unit, and two or three readings after it.
- Use `matrix-2x2` for tasks by effect and difficulty, with owner and date in each cell.
- Close on 건의 사항 as a table of 결정 사항, 담당 and 기한. Lines over about 38 Korean glyphs fail the
  measure check, so a long request becomes two bullets.

## Avoid

- English section labels on a Korean page.
- Red on anything but the key line.
- A summary box longer than three lines.
- More than three text families in a row; break the run with a table, a matrix or a timeline.
- The `statement` family, which Gazette does not carry; a single claim belongs in the summary box.

## Two worked slides

Both are trimmed for reading. Complete slides of the same kind in the example decks carry the
extra rows, groups and takeaways that fill a compact page and pass the gate.

The summary page: label in the band, conclusion in the box, evidence in groups.

```markdown
---
layout: summary-box-list

## 핵심 요약: 대여소 38곳 재배치 건의

::: key-message
이용이 적은 대여소 38곳을 지하철역·대단지 주변으로 옮기고, 거치대 수를 이용량에 맞춰 다시 나눈다
:::

- **현황**
  (1) 대여소 214곳 중 하루 대여 5건 미만이 38곳 (18%)
  (2) 상위 20곳이 전체 대여의 41%
- **재배치 효과 (추정)**
  (1) 하루 대여 약 520건 증가, 빈 거치대 민원 월 140건 → 60건
  (2) 재배치 비용 4억 1천만 원
---
```

The decision page, keyed by deadline:

```markdown
---
layout: closing-decision-box

## 건의 사항: 결정 요청과 기한

- 아래 세 가지를 기한 안에 결정해 주시기 바람
- 결정 후 교통행정과가 11월 둘째 주까지 세부 공사 계획을 보고함

| 결정 사항 | 담당 | 기한 |
|---|---|---|
| 안 2 채택 | 부구청장 | 10월 넷째 주 |
| 예산 4억 1천만 원 배정 | 기획예산과 | 10월 말 |
| 대단지 협의 위임 | 교통행정과장 | 11월 첫째 주 |
---
```

Full decks: `examples/07-briefing-gazette-ko.md`, `examples/12-status-update-gazette-ko.md`.
