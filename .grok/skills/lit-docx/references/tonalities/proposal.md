# Proposal

A proposal, plan or funding request as a document. It is the only tonality with a separate cover page, and the cover is typographic: the kind of document, the title set left in the upper third, one short rule, the subtitle and a two-line lead, with the organisation and date at the foot. The body that follows is unnumbered, states the case once with a key-figure strip, puts one decision box where the reader meets the request, and carries a budget table and a schedule.

Worked examples: `examples/04-proposal-ko.md` (cover and 3 body pages) and `examples/08-proposal-en.md` (cover and 3 body pages).

## When it fits

- The document exists to get something approved: money, a pilot, a change of practice.
- The reader needs the problem, the plan, the cost, the timetable and how success will be judged, in that order.
- It may be read by people who were not in the room, so it must stand alone.

## When it is wrong

- The decision is small and the reader wants one page: use Brief.
- It reports results of work already done, with a request at the end: use Report.
- It is a plan only for the team that will carry it out, with steps: use Manual.
- A cover page on a two-page document looks inflated; under about three body pages choose Brief.

## Structure that sets it apart

1. Cover page (its own section, no folio): kicker such as 사업 제안서 or Proposal, the title in the upper third at 2.7 times the body, a 36 mm rule in the accent, subtitle, the cover directive's lead paragraph, and at the foot the byline, date and sample-data notice.
2. The body starts on page 2, numbered from 1, folio centred at the foot.
3. 제안 요약 / Proposal in brief: the problem in numbers, the key-figure strip after the first paragraph, what is proposed, and the decision box.
4. Unnumbered sections: current situation, what will be done, timetable, budget, benefits and how they will be measured.
5. One budget table with a basis column and a bold total row; one schedule table.
6. The last section names the measures and thresholds by which the pilot or plan will be judged.

## Tokens from the pack

| Token | Value |
|---|---|
| Dials | density 8, variance 6 |
| Margins | 26 / 28 / 26 / 26 mm |
| Body | Pretendard 10.5 pt Korean (justified), 11 pt English (ragged) |
| Ramp | h1 1.4, h2 1.2, title 2.7 (Korean 14.5 / 12.5 / 28.5 pt; English 15.5 / 13 / 29.5 pt) |
| Numbering | none |
| Title block | cover page |
| Summary | prose with one key-figure strip |
| Running head | footer: folio centred |
| Palette | ink #1A1A1A, muted #555555, line #8C8C8C, accent #6E2639 |
| Accent on | title rule, callout rules |
| Components | keyfigures (3 per row), callout (at most one), columns |
| Figures | at most 0.60 of the frame high |
| Fill target | median 0.75 |

## Components

- Key figures: three measured quantities that frame the case (the size of the problem, the target, the cost or payback), each with a basis line. Written inside `::: cover`, they are moved to the summary; they never stand on the cover.
- One decision box, `::: callout kind=key title="결정 요청"` / `title="Decision requested"`: what, how much, from which budget, by when. A second callout becomes plain text.
- Columns: for a short before / after or two-option comparison of similar length.

The cover counts as one component kind, so the strip or the box alone already meets the two-kind floor; use both.

## Writing the source

- Put the cover's lead in `::: cover` as one or two sentences stating what is proposed. The title stays a noun phrase ("자전거 출퇴근 지원 시범 사업 제안서", "Booking system for shared laboratory instruments").
- Give each budget line a basis in its own column (`80명 × 주 2.4회 × 26주 × 3,000원`), so the reader can check the arithmetic. Make sure the rows add up to the total.
- State savings and benefits at their estimated size with the assumption that produces them. If a figure is a ceiling, say so.
- The timetable is a table of phases with months, not a paragraph.
- End with the measures and thresholds, not a restatement of the benefits.

## Do and avoid

| Do | Avoid |
|---|---|
| One decision box with amount and source of funds | Boxes for each benefit |
| A budget table whose rows sum to the total | Rounded "약" figures that do not reconcile |
| Key figures with a basis, in the summary | Figures on the cover, or a "number of sites" posing as a metric |
| A cover lead that states the proposal in one or two sentences | A cover lead that repeats the title in other words |

## Worked snippet

```markdown
---
title: Booking system for shared laboratory instruments
subtitle: A twelve-month plan for the Chemistry Building core facility
author: Core Facility Committee
organization: Example University, Department of Chemistry
date: 2026-10-05
notice: "Sample data: replace with real figures"
tonality: Proposal
---

::: cover variant=typographic kicker="Proposal"
This proposal replaces paper booking sheets with one booking system tied to training records and charges.
:::

# Proposal in brief

Last year the paper sheets produced 46 recorded double bookings.

::: keyfigures
- **46** double bookings recorded (sample)
  * Facility incident log, 2025–26 academic year
- **610 h** booked but unused instrument time (sample)
  * Spreadsheet bookings against instrument logs
:::

::: callout kind=key title="Decision requested"
Approve the plan and a first-year budget of £38,500 (sample) from the equipment reserve.
:::
```

The cover holds the kicker, title, rule and lead with the byline and date at its foot; "Proposal in brief" opens page 1 of the body.
