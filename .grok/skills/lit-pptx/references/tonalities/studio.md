# Studio

Studio is an editorial spread. The 12-column grid shows through hairlines between columns, titles
take a side rail or open a page at display size, splits are asymmetric, real figures run on tinted
panels, and a dark ochre points at one thing per slide. It mixes the most title treatments of any
pack, so a deck feels laid out page by page rather than filled from one template.

**Choose it** for narratives that combine pictures and figures: a pitch for a physical product, a
portfolio, a public lecture, an annual story. **It is wrong** for dense data reviews, where its
open layouts starve tables (Studio has no table family), and for read-alone briefings.

## Tokens

| Role | Value |
|---|---|
| ground / surface | `#FFFFFF` / `#F2F2F0` |
| ink / ink-muted / line | `#141414` / `#525252` / `#D2D2CE` |
| accent / accent-deep / accent-tint | `#8A5A00` / `#4D3200` / `#F5ECD9` |
| field / on-field | `#141414` / `#FFFFFF` |
| chart series | `#8A5A00`, `#141414`, `#525252`, `#3B5F7F` |
| faces | Pretendard Bold for titles, display and figures; Regular for body |
| radius / edge | 0 / fill |

Density 10, compact ramp. **Variance 8 allows all five treatments**, and the engine uses them.

**Tables** (inside KPI rows and timelines): a 2 pt rule under the header, no fills, numbers
right-aligned. **Charts**: no gridlines, direct labels, the ochre on the highlighted series.
**Pictures** take no frame.

## Titles by role

| Role | Default | Also allowed |
|---|---|---|
| content | `side-rail` | `top-plain-large` (text-two-column takes only this) |
| data | `top-plain-large` | `side-rail`, `bottom-anchor` |
| data-takeaway | `side-rail` | `bottom-anchor`, `top-plain-large` |
| sequence | `side-rail` in the pack map | the timeline takes `top-plain-large` or `bottom-anchor` |
| image | `side-rail`: the picture across columns 5-12, its facts in the rail under the title | `top-plain-large`, `bottom-anchor`, `overlay` (image-full only) |
| statement | `statement` | — |

## Families and variants

asymmetric-feature, big-number, image-split, image-full, photo-grid, text-two-column, chart-insight,
kpi-row, timeline, comparison, statement.

- Covers: `cover-split-image` (the title beside the deck's first picture), `cover-rail`,
  `cover-numeral` (a year in the title or date, e.g. "포트폴리오 2026").
- Sections: `section-numeral`, `section-rail`. A single section with no agenda draws no numeral and
  sets its title as a statement over the slides it opens.
- Closings: `closing-contact-split` (action rows beside a dark field holding each amount or date, the
  next step as a band meeting it), `closing-summary-list`.
- Display: a statement stands between two hairlines on the open page (a short rail beside it stood
  empty); big-number panels use the ochre
  tint; closings put the next step on a dark band.

Decoration: column hairlines, real numerals, rail fill, colour field, caption band.

## Captions

The cover borrows the deck's first picture with its caption, and `image-full` sets its caption on a
panel, where the gate reads caption and source. Leave the number out of the caption: the engine
numbers figures in deck order.

## Do

- Let large figures be real figures: a `big-number` panel of two or three values with their basis.
- Use asymmetric splits: `asymmetric-feature` with five short bullets beside a large picture.
- Give `text-two-column` four to six groups with two or three sub-points each; flat bullets leave the
  page half empty at density 10 (example 10).
- Alternate full-bleed pages with split pages and a grid of three.
- Close with `closing-contact-split` when there is money to ask for, keyed by the amount column.

## Avoid

- Large numerals that are not real figures.
- Column hairlines running through text.
- Two side-rail slides with the same split in a row.
- Centred body text.

## Two worked slides

Both are trimmed for reading. Complete slides of the same kind in the example decks carry the
extra rows, groups and takeaways that fill a compact page and pass the gate.

A feature told by one large picture and a narrow column:

```markdown
---
layout: asymmetric-feature

## A refill station inside a neighbourhood grocer

![Station with six products in 0.9 m of shelf width (sample) | Source: sample photo](assets/example-a.png)

- **What it is** a self-service dispenser for six cleaning products
- **How it works** customers bring any bottle; the scale reads the tare
- **Price** 25-35 % below the same product in a new bottle
- **Store share** 18 % of refill revenue goes to the grocer
---
```

Figures as a panel with their evidence:

```markdown
---
layout: big-number

## 스테이션당 단위 경제성

| 월 매출 | 월 공헌이익 | 회수 기간 |
|---|---|---|
| 119만 원 | 31만 원 | 19개월 |
| 월 412회 리필 기준 | 매장 몫과 재고 차감 후 | 설치비 590만 원 |

- 9월 시범 평균이며 전망치가 아니다
- 월 500회 리필이면 회수 기간은 14개월로 줄어든다
- 출처: 예시 시범 운영 손익, 2026년 9월 (예시)
---
```

Full decks: `examples/09-pitch-studio-en.md`, `examples/10-image-led-studio-ko.md`.
