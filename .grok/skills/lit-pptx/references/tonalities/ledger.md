# Ledger

Ledger is for decks that are studied line by line: quarterly results, budgets, programme status.
White pages, compact type, tabular figures, tables with a dark header row, and one deep green that
marks the current period or the figure the slide is about. Tables and KPI rows carry the argument;
the title only labels it.

**Choose it** for business reviews and status updates in any language, especially when 30 % or more
of the content slides hold a table or chart and the reader looks at the screen or a printout for a
while. **It is wrong** for a short spoken pitch (the density reads as a wall), for a deck built on
photographs (Ledger has no image family), and for a Korean paper that circulates before a meeting,
where Gazette's band heads and boxed summary serve the reader better.

## Tokens

| Role | Value |
|---|---|
| ground / surface | `#FFFFFF` / `#F2F4F6` |
| ink / ink-muted / line | `#16212C` / `#4B5866` / `#D0D6DC` |
| accent / accent-deep / accent-tint | `#0E6B5A` / `#0A4438` / `#E2F0EC` |
| field / on-field | `#0A4438` / `#FFFFFF` |
| positive / negative | `#1E7A3F` / `#B3261E` |
| chart series | `#0E6B5A`, `#4B5866`, `#9A6A12`, `#2F5F8A` |
| faces | Pretendard Bold for titles and figures, Regular for body and labels |
| figures | tabular, so columns of numbers align |
| radius / edge | 0 / fill |

Density 10 puts Ledger on the compact ramp (body 13 pt, labels 11, sources 9, title 26) with 24 pt
margins. Variance 5 allows four title treatments in a deck.

**Tables**: header row in the field colour with white labels, rules under the header and over the
totals, no banding, numbers right-aligned and tabular, the totals row bold. **Charts**: hairline
gridlines, direct labels, the accent on the highlighted series and muted ink for the rest, short
annotations allowed. Pictures, if ever used, sit inside a hairline frame and never bleed.

## Titles by role

| Role | Default | Also allowed in the pack |
|---|---|---|
| content | `top-rule` | `kicker-numeral` (agenda, text-two-column) |
| data | `top-rule` | `side-rail`, `bottom-anchor`, `kicker-numeral` (by family) |
| data-takeaway | `side-rail` | `top-rule`, `bottom-anchor` |
| sequence | `kicker-numeral` | `top-rule`, `bottom-anchor` (timeline) |
| reference | `top-rule` | — |

The top-rule title rests on a short green accent rule. Ledger has no statement title; a quotation is
not a Ledger slide.

## Families and variants

kpi-row, kpi-over-chart, dashboard-grid, ledger-table, table-insight, chart-insight, full-chart,
big-number, comparison, timeline, matrix-2x2, agenda, text-two-column, references-appendix.

- Covers: `cover-figures` (the title over the deck's headline figures; needs a KPI row),
  `cover-typographic`, `cover-index`.
- Sections: `section-rule` (with an agenda, an index page with this part marked), `section-numeral`.
- Closings: `closing-decision-box` (the decision boxed in the accent tint, the items as action rows),
  `closing-ask`.
- Display: the big-number panel sits on the accent tint; section pages show the part index.

Decoration: accent rule, hairline rules, the filled rail under side titles, real numerals.

## Do

- Open with `cover-figures` and a `kpi-over-chart` slide, so the headline figures appear twice: once
  as the deck's face, once with their trend.
- Give each KPI its basis in the second table row: plan, prior period, or target.
- Put a totals row at the bottom of each table (`합계`, `Total`); the engine sets it bold.
- Use `▲` and `▼` with the sign in change columns, so colour is never the only cue.
- Use `matrix-2x2` for options sorted by effect and difficulty, with owner and date in each cell.

## Avoid

- KPI cards for counts that are not results (number of meetings, pages in the appendix).
- More than one accent series in a chart.
- Tables stretched with padding to fill a page; add rows of real data or a takeaway instead.
- Side rails on two data slides in a row; the engine's balancing usually prevents it.

## Two worked slides

Both are trimmed for reading. Complete slides of the same kind in the example decks carry the
extra rows, groups and takeaways that fill a compact page and pass the gate.

A KPI row with its trend, the claim as the takeaway:

```markdown
---
layout: kpi-over-chart

## 3분기 객실 지표와 월별 객실당 매출

| 객실 점유율 | 평균 객실 단가 | 객실당 매출 | 영업이익 |
|---|---|---|---|
| 81.4% | 14만 2천 원 | 11만 6천 원 | 63억 원 |
| 전년 동기 77.9% | 전년 대비 +3.1% | 전년 대비 +7.7% | 계획 대비 +5.0% |

::: chart type=column unit="천 원"
| 월 | 객실당 매출 (천 원) |
|---|---|
| 7월 | 111 |
| 8월 | 124 |
| 9월 | 113 |
> 판매 가능 객실당 매출, 2026년 7-9월 (예시 데이터)
:::

- 점유율과 단가가 함께 올라 객실당 매출이 세 달 모두 전년보다 높았다
- 출처: 예시 호텔운영사 객실 관리 시스템, 2026년 7-9월 (예시)
---
```

A status table with owners, read across:

```markdown
---
layout: ledger-table

## Workstream status and next milestone

| Workstream | Migrated | Status | Next milestone | Owner |
|---|---|---|---|---|
| Core policy | 152 of 180 | On track | Batch 9, 14 Oct | Policy lead |
| Payments | 41 of 120 | Late | Freeze lifted, 20 Oct | Payments lead |
| Data and reporting | 72 of 110 | At risk | Warehouse copy, 23 Oct | Data lead |
| Shared services | 49 of 90 | On track | Email relay, 15 Oct | Infrastructure lead |
| Total | 314 of 500 | — | Switchover, 28 Nov | Programme manager |

> Table 1. Workstream status at week 40 (sample data)

- Payments carries most of the shortfall against plan
- Source: sample programme tracker, week 40 of 2026 (sample)
---
```

Full decks: `examples/02-business-review-ledger-ko.md`, `examples/08-status-update-ledger-en.md`.
