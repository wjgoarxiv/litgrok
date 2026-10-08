---
tonality: ledger
title: Data centre migration programme status, week 40
subtitle: Progress, risks and decisions for the steering group
date: 2026-10-05
department: Example Insurance, Infrastructure Programme Office
presenter: Example Programme Manager
notice: Sample data — replace with real figures
---

---
layout: cover-typographic

# Data centre migration programme status, week 40
---

---
layout: kpi-row

## Programme position at week 40

| Workloads migrated | Against plan | Budget spent | Open high risks | Days to cut-over |
|---|---|---|---|---|
| 412 of 680 | −18 | 6.9 M of 11.2 M | 3 | 54 |
| 61 % complete | plan 430 by week 40 | 62 %, plan 60 % | week 39: 4 | target 28 Nov |

- The programme is 18 workloads behind plan, all in the payments estate
- Spend tracks plan within two points; no contingency has been drawn
- One high risk closed this week (backup licence transfer)
- Source: sample programme tracker and finance ledger, week 40 of 2026 (sample)
---

---
layout: chart-insight

## Workloads migrated per week against plan

::: chart type=column unit="workloads"
| Week | Plan | Actual |
|---|---|---|
| W35 | 34 | 36 |
| W36 | 36 | 33 |
| W37 | 38 | 35 |
| W38 | 40 | 31 |
| W39 | 40 | 34 |
| W40 | 40 | 37 |
> Workloads moved to the new site per week, weeks 35-40 of 2026 (sample data)
:::

- Throughput fell in week 38 when the payments freeze started
- Weeks 39-40 recovered to 34-37 a week, still below the plan of 40
- At 37 a week the remaining 268 workloads finish in week 47, one week late
- Source: sample programme tracker, weeks 35-40 of 2026 (sample)
---

---
layout: ledger-table

## Workstream status and next milestone

| Workstream | Workloads | Migrated | Status | Next milestone | Owner |
|---|---|---|---|---|---|
| Core policy | 180 | 152 | On track | Batch 9, 14 Oct | Policy platform lead |
| Claims | 140 | 98 | On track | Batch 7, 16 Oct | Claims platform lead |
| Payments | 120 | 41 | Late | Freeze lifted, 20 Oct | Payments lead |
| Data and reporting | 110 | 72 | At risk | Warehouse copy, 23 Oct | Data lead |
| Shared services | 90 | 49 | On track | Email relay, 15 Oct | Infrastructure lead |
| Network and security | 40 | — | On track | Firewall rules, 12 Oct | Network lead |
| Total | 680 | 412 | — | Cut-over, 28 Nov | Programme manager |

> Table 1. Workstream status at week 40; network work counts as infrastructure, not workloads (sample data)

- Payments carries 15 of the 18 workloads behind plan
- Data and reporting is at risk because the warehouse copy needs a 36-hour window
- Source: sample programme tracker, week 40 of 2026 (sample)
---

---
layout: text-two-column

## Completed this week and planned for week 41

- **Completed in week 40**
  (1) 37 workloads moved, including the broker portal and quote engine
  (2) backup licence transferred to the new site; high risk R-07 closed
  (3) disaster recovery test for core policy passed in 2 h 40 min (target 4 h)
- **Planned for week 41**
  (1) 40 workloads, of which 12 from claims batch 7
  (2) firewall rule review with the security team on 12 October
  (3) warehouse copy rehearsal on 10 October, 36-hour window
- **Blocked**
  (1) payments batches wait for the quarter-end freeze to lift on 20 October
- **Changed this week**
  (1) claims batch 8 moved from week 42 to week 43 at the claims team's request
- Source: sample programme weekly report, week 40 of 2026 (sample)
---

---
layout: matrix-2x2

## Open high and medium risks by impact and likelihood

| Impact \ Likelihood | Likely | Unlikely |
|---|---|---|
| High | R-11 payments backlog after freeze · 15 workloads · payments lead | R-14 warehouse copy over window · 1 night · data lead |
| Medium | R-09 staff leave in December · 2 engineers · programme manager | R-16 vendor patch delay · 4 workloads · infrastructure lead |

> Table 2. Open risks at week 40, likelihood over the next four weeks (sample)

- R-11 drives the one-week slip; extra weekend batches would absorb it
- R-14 has a fallback: copy in two 18-hour windows over two weekends
- Source: sample programme risk register, week 40 of 2026 (sample)
---

---
layout: timeline

## Milestones to the site switchover

| Date | Milestone | Owner |
|---|---|---|
| 20 Oct | Payments freeze lifted, payments batches restart | Payments lead |
| 25 Oct | Warehouse copy complete | Data lead |
| 8 Nov | All workloads migrated except payments tail | Workstream leads |
| 21 Nov | Full disaster recovery test at the new site | Infrastructure lead |
| 28 Nov | Cut-over and old site read-only | Programme manager |

> Table 3. Milestones to cut-over, October-November 2026 (sample)

- Cut-over on 28 November holds only if two weekend batches are approved
- Source: sample programme plan, version 4.2 of 30 September 2026 (sample)
---

---
layout: table-insight

## Budget by cost category

| Category | Budget | Spent | Forecast | Variance |
|---|---|---|---|---|
| Hardware and racks | 3.8 | 3.6 | 3.8 | 0.0 |
| Migration services | 3.1 | 1.9 | 3.2 | ▲ +0.1 |
| Licences | 1.6 | 0.9 | 1.5 | ▼ −0.1 |
| Internal staff | 1.9 | 0.5 | 1.9 | 0.0 |
| Weekend batches | 0.0 | 0.0 | 0.12 | ▲ +0.12 |
| Contingency | 0.8 | 0.0 | 0.68 | ▼ −0.12 |
| Total | 11.2 | 6.9 | 11.2 | 0.0 |

> Table 4. Budget in millions, spent to week 40, forecast to close (sample data)

- Weekend batches cost 0.12 M and come out of contingency
- The forecast stays inside the approved 11.2 M
- Source: sample finance ledger, week 40 of 2026 (sample)
---

---
layout: closing-ask

## Decisions requested from the steering group

| Decision | Amount | Needed by | Owner |
|---|---|---|---|
| Two weekend batches for payments | 0.12 M | 9 Oct | Programme manager |
| Fallback copy plan for the warehouse | none | 9 Oct | Data lead |
| December leave cover, two contract engineers | 0.06 M | 16 Oct | Infrastructure lead |

- Next step: the programme manager confirms the batch dates with payments by 10 October
---
