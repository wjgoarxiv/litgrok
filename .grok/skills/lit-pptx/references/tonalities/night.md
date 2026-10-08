# Night

Night is a deck for a screen in a dark hall. A near-black blue ground, off-white type, an amber accent
with a soft blue second series, light numerals and large charts. Data pages carry their title in a
slightly lighter band; slides that open on a claim take display-size titles. Every slide in the deck
is dark: a single light slide flashes the room.

**Choose it** for data reviews and technical or business reviews presented on a stage screen or in a
dim room: keynotes, all-hands, product councils, operations town halls. **It is wrong** for printed
or read-alone decks (dark pages print badly and tire a desk reader), for anything that needs a table
family (Night has KPI rows and charts but no `table-insight` or `ledger-table`), for photographs, and
for running text.

## Tokens

| Role | Value |
|---|---|
| ground / surface | `#0F1419` / `#1A222B` |
| ink / ink-muted / line | `#E8EDF2` / `#A3AEBA` / `#5A6672` |
| accent / accent-deep / accent-tint | `#E3A857` / `#F2C98A` / `#2A2418` |
| field / on-field | `#1E2A36` / `#F5F7FA` |
| positive / negative | `#6CC08B` / `#F08A7E` |
| chart series | `#E3A857`, `#7FB8E0`, `#A3AEBA`, `#C58FD0` |
| faces | Pretendard Bold for titles and display, Regular for body and numerals |
| figures | tabular |
| radius / edge | 6 pt / fill |

On Night `accent-deep` is the lighter amber, because "deep" means the stronger contrast against the
ground. Density 10, compact ramp. Variance 6 allows four of the pack's five treatments.

**Tables** (KPI rows, closing tables): header on the surface colour, row rules, numbers right-aligned
and tabular, totals bold; the row named in the title is tinted. **Charts**: hairline gridlines,
direct labels, amber on the highlighted series, annotations allowed. Charts are native, drawn on the
dark ground at full size. Pictures bleed on one side only.

## Titles by role

| Role | Default | Also allowed |
|---|---|---|
| content | `top-plain-large` | `band` (closings) |
| data | `band` | `top-plain-large`, `side-rail` |
| data-takeaway | `side-rail` | `band`, `top-plain-large` (full-chart takes only `top-plain-large`) |
| sequence | `kicker-numeral` in the pack map | the timeline takes `band` or `top-plain-large` |
| definition | `side-rail` | `band` |
| statement | `statement` | — |

## Families and variants

full-chart, chart-insight, kpi-row, kpi-over-chart, dashboard-grid, big-number, method, comparison,
timeline, statement.

- Covers: `cover-numeral` (the year at title size above the title; put the year in the title or
  date), `cover-typographic`, `cover-figures` (the title over the headline KPI row).
- Sections: `section-numeral`, `section-field`.
- Closings: `closing-decision-box` (the decision boxed, the items as action rows, the next step on a
  band), `closing-statement` (one sentence with no table; use it only when nothing is asked).
- Display: statements stand open on the dark ground; big-number panels use the amber tint.

Decoration: header band, hairline rules, real numerals, rail fill.

## Do

- Open with a KPI row or `kpi-over-chart`: five figures with their basis, then the trend.
- Use `dashboard-grid` for two or three small charts that answer one question together.
- Give every chart a caption with period and "(sample data)" where it applies, and a source line.
- Put definitions on a `method` slide: each metric, its formula in words, exclusions, known gaps.
- Keep every slide dark. A diagram or plot exported on white would stand here as a small white card:
  put a dark variant beside it, named like the file with `.dark` before the extension
  (`assets/flow.png` and `assets/flow.dark.png`), and the deck draws that one. The gate fails a
  mostly-white figure on a dark ground (OF-117).

## Avoid

- Neon or saturated glows.
- A pure black ground.
- Light slides mixed into the deck.
- Thin light type below 18 pt; body text stays Regular on the compact ramp, never lighter.

## Two worked slides

Both are trimmed for reading. Complete slides of the same kind in the example decks carry the
extra rows, groups and takeaways that fill a compact page and pass the gate.

Three small charts read together:

```markdown
---
layout: dashboard-grid

## Fleet use and fuel per 100 km

::: chart type=line unit="%"
| Month | Fleet utilisation (%) |
|---|---|
| Jul | 86 |
| Aug | 88 |
| Sep | 91 |
> Delivery vans in service on an average working day (sample data)
:::

::: chart type=column unit="litres"
| Month | Diesel per 100 km (L) |
|---|---|
| Jul | 11.8 |
| Aug | 11.6 |
| Sep | 11.9 |
> Average diesel use per 100 km (sample data)
:::

- Utilisation above 90 % leaves no spare vans for the peak without hires
- Source: sample fleet telematics, July-September 2026 (sample)
---
```

Metric definitions as a method page:

```markdown
---
layout: method

## 지표 정의와 집계 기준

- **주간 활성 사용자** ISO 주 안에 로그인 세션이 한 번 이상인 사용자
- **30일 유지율** 가입 후 28-34일째 세션이 있는 가입자 비율
- **활성화** 설치 후 14일 안에 첫 송금 완료
- **무충돌 세션** 치명 오류 없이 끝난 세션의 비율
- **제외** 직원 계정과 시험 기기, 전체 세션의 약 0.8%
- 출처: 예시 분석 데이터 사전, 2026년 9월판 (예시)
---
```

Full decks: `examples/05-data-review-night-en.md`, `examples/11-business-review-night-en.md`.
