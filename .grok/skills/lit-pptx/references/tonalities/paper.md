# Paper

Paper is a journal page on a screen. Ink on white, hairlines instead of fills, figures first with
numbered captions, booktabs tables, and one deep crimson kept for the proposed method. The cover is a
title page: a heavy rule, the title, a hairline, the authors, the place and the date. Nothing on a
Paper slide is decoration; every mark is a rule, a figure or a word.

**Choose it** for research talks, thesis defences, technical reviews and written analyses: decks
built on figures, tables and citations, often with a references slide. **It is wrong** for a sales or
launch room, where the restraint reads as cold, and for decks that need an agenda, a KPI row, a
timeline or a process, none of which Paper carries.

## Tokens

| Role | Value |
|---|---|
| ground / surface | `#FFFFFF` / `#F5F5F6` |
| ink / ink-muted / line | `#111418` / `#50565E` / `#C9CDD2` |
| accent / accent-deep / accent-tint | `#8C1C2B` / `#5E121C` / `#F6E6E8` |
| field / on-field | `#111418` / `#FFFFFF` |
| positive / negative | `#1E6B3A` / `#50565E` |
| chart series | `#8C1C2B`, `#111418`, `#50565E`, `#2E5E8A` (series order, first is the proposed method) |
| faces | Pretendard Bold for titles and display, Regular for body and numerals |
| figures | tabular |
| radius / edge | 0 / border |

Density 10, compact ramp. Variance 5 allows four treatments, which is all Paper has.

**Tables**: booktabs (a heavy rule above the header, a light one under it, a heavy one at the foot),
no fills, numbers right-aligned and tabular, totals bold. **Charts**: hairline gridlines, direct
labels, colour by series order with the proposed method first, no annotation. **Pictures** never
bleed, crop or take a frame.

## Titles by role

| Role | Default | Also allowed |
|---|---|---|
| content | `top-rule` | `side-rail` (text-column) |
| data | `top-rule`; a comparison is a ruled table under `top-rule` (the pack's `structure`, kept even when the deck already leans on it) | `side-rail`, `bottom-anchor` |
| data-takeaway | `bottom-anchor` | `top-rule`, `side-rail` |
| image | `bottom-anchor` | `top-rule`, `side-rail` |
| statement | `statement` | `top-rule` (quote) |
| definition | `side-rail` | `top-rule` |
| reference | `top-rule` | — |

The top-rule title rests on a full-width hairline; Paper has no short accent bar.

## Families and variants

figure-academic, figure-pair, method, chart-insight, full-chart, table-insight, comparison, quote,
statement, text-column, references-appendix.

- Covers: `cover-index` (the title beside the part list; needs two or more sections, since Paper has
  no agenda family), `cover-typographic` (the journal title page), `cover-split-image`.
- Sections: `section-rule` (an index page with this part marked), `section-field`.
- Closings: `closing-summary-list` (findings, limits, next experiment with owner and date),
  `closing-ask`.
- Display: statements sit between two hairlines; big-number panels are outlined in ink; closings set
  the next step under a rule.

Decoration: hairline rules and box outlines only.

## Do

- Number every figure and table and give each caption its condition and source: "Figure 2. Logger
  positions at k = 12, test district (sample)".
- Use `figure-academic` for a figure that needs reading: observation, limitation, implication.
- Reserve crimson for one thing across the whole talk: the proposed method's series, row or label.
- Put the method on a `method` slide with the objective and each term defined.
- End with references and the definitions the talk relies on, eight to ten lines.

## Avoid

- The short accent bar under a title.
- Coloured card fills.
- Figures without numbered captions.
- The accent on anything other than the proposed method.
- Bullets longer than about 60 characters beside a figure under a bottom title; that column is three
  grid columns wide.

## Two worked slides

Both are trimmed for reading. Complete slides of the same kind in the example decks carry the
extra rows, groups and takeaways that fill a compact page and pass the gate.

A results table with the reading beside it:

```markdown
---
layout: table-insight

## Detection and localisation by logger budget

| Loggers (k) | Detected | Top-3 segment hit | Median error |
|---|---|---|---|
| 4 | 71 % | 38 % | 610 m |
| 8 | 84 % | 55 % | 390 m |
| 12 | 91 % | 68 % | 240 m |
| 16 | 94 % | 74 % | 190 m |
| 24 | 96 % | 79 % | 150 m |

> Table 1. Results over 6,800 simulated leaks, night demand (sample data)

- Gains flatten after k = 16
- At k = 12 the median search radius is 240 m
- Source: sample simulation study, October 2026 (sample)
---
```

A numbered figure with its reading:

```markdown
---
layout: figure-academic

## 시험 관망과 압력계 배치

![압력계 12대 배치, 시험 구역 (예시) | 출처: 예시 그림](assets/example-b.png)

- **관찰** 절반이 구역 중심이 아닌 긴 송수관 위에 놓인다
- **한계** 야간 수요 기준으로 맞춘 배치다
- **의미** 접근이 쉬운 지점을 골라도 정확도 손실이 작다
- 출처: 예시 수리 모형, 2025년 소화전 시험으로 보정 (예시)
---
```

Full deck: `examples/03-research-talk-paper-en.md`.
