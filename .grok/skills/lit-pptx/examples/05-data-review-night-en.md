---
tonality: night
title: Mobile banking app product data review, Q3 2026
subtitle: Activation, retention and release health for the product council
date: 2026-10-05
department: Example Bank, Digital Product Analytics
presenter: Example Analytics Lead
notice: Sample data — replace with real figures
---

---
layout: cover-figures

# Mobile banking app product data review, Q3 2026
---

---
layout: kpi-over-chart

## Q3 headline metrics and weekly active users

| Weekly active users | 30-day retention | Activation rate | Crash-free sessions | App rating |
|---|---|---|---|---|
| 1.84 M | 61.2 % | 47.5 % | 99.62 % | 4.4 |
| Q2 1.71 M (+7.6 %) | Q2 58.9 % | target 50 % | target 99.70 % | Q2 4.3, 2,310 reviews |

::: chart type=line unit="M users"
| Week | Weekly active users (M) |
|---|---|
| W27 | 1.72 |
| W29 | 1.75 |
| W31 | 1.77 |
| W33 | 1.79 |
| W35 | 1.81 |
| W37 | 1.83 |
| W39 | 1.84 |
> Weekly active users, signed-in sessions, weeks 27-39 of 2026 (sample data)
:::

- Growth held at about 0.6 % a week; activation and crash-free sessions both missed target
- Source: sample product analytics warehouse, events table, 1 July-30 September 2026 (sample)
---

---
layout: dashboard-grid

## Activation funnel, stability and session length

::: chart type=bar unit="%"
| Step | Share of installs (%) |
|---|---|
| Install | 100 |
| Account linked | 72 |
| Identity verified | 58 |
| First transfer | 47.5 |
> Activation funnel, Q3 installs (sample data)
:::

::: chart type=line unit="%"
| Month | Crash-free sessions (%) |
|---|---|
| Jul | 99.71 |
| Aug | 99.55 |
| Sep | 99.60 |
> Crash-free sessions by month (sample data)
:::

::: chart type=column unit="min"
| Month | Median session (min) |
|---|---|
| Jul | 3.1 |
| Aug | 3.3 |
| Sep | 3.2 |
> Median session length (sample data)
:::

- Identity verification loses 14 points of installs; the August dip follows release 8.4
- Source: sample product analytics warehouse and crash reporter, Q3 2026 (sample)
---

---
layout: chart-insight

## 30-day retention by signup cohort

::: chart type=line unit="%"
| Signup month | Retained day 30 (%) | Retained day 60 (%) | Retained day 90 (%) |
|---|---|---|---|
| Mar | 56.0 | 49.1 | 45.2 |
| Apr | 57.2 | 50.0 | 46.1 |
| May | 58.1 | 51.4 | 47.0 |
| Jun | 59.4 | 52.2 | 47.9 |
| Jul | 60.3 | 53.0 | — |
| Aug | 61.2 | — | — |
> Share of each signup cohort still active after 30, 60 and 90 days (sample data)
:::

- Day-30 retention rose 5.2 points over six cohorts, about one point a month
- Cohorts from the new onboarding (from June) keep the gain at day 60
- Day-90 data for July and August cohorts is not yet complete
- Source: sample product analytics warehouse, cohort table, March-September 2026 (sample)
---

---
layout: section-field

# Release health
---

---
layout: full-chart

## Median and p95 cold-start time by release

::: chart type=line unit="s"
| Release | Median (s) | p95 (s) |
|---|---|---|
| 8.1 | 1.42 | 3.10 |
| 8.2 | 1.38 | 3.02 |
| 8.3 | 1.35 | 2.94 |
| 8.4 | 1.61 | 3.88 |
| 8.5 | 1.40 | 3.05 |
| 8.6 | 1.31 | 2.81 |
> Cold-start time on Android and iOS combined, releases 8.1-8.6 (sample data)
:::

- Source: sample performance monitoring, field data from 2.1 M devices, Q3 2026 (sample)
---

---
layout: method

## Metric definitions and data pipeline

- **Weekly active user** a signed-in user with at least one session in the ISO week
- **30-day retention** share of a signup cohort with a session on days 28-34 after signup
- **Activation** first completed transfer within 14 days of install
- **Crash-free sessions** sessions without a fatal error, divided by all sessions
- **Cold start** time from process launch to the first interactive frame, field data
- **p95** the value 95 % of measured cold starts stay under
- **Pipeline** client events land in the warehouse within 2 hours; the daily job runs at 04:00
- **Exclusions** staff accounts and test devices, about 0.8 % of sessions
- **Known gap** events from app versions below 7.9 lack the session identifier
- Source: sample analytics data dictionary, version 2026-09 (sample)
---

---
layout: comparison

## Android and iOS release health in Q3

:::: columns 1fr 1fr
::: col
- **Android**
  (1) Crash-free sessions: 99.54 %, target 99.70 %
  (2) p95 cold start: 3.4 s on release 8.6
  (3) Share of active users: 58 %
  (4) Main issue: memory crashes on devices under 3 GB RAM
:::
::: col
- **iOS**
  (1) Crash-free sessions: 99.73 %, target 99.70 %
  (2) p95 cold start: 2.1 s on release 8.6
  (3) Share of active users: 42 %
  (4) Main issue: biometric prompt timeouts after OS update
:::
::::

- Source: sample crash reporter and performance monitoring, Q3 2026 (sample)
---

---
layout: big-number

## Support contacts per 10,000 active users

| Contacts per 10k users | Identity-check share | Median resolution |
|---|---|---|
| 38 | 41 % | 6.5 h |
| Q2 44, target 35 | of all app contacts | Q2 9.0 h |

- Contacts fell after the June onboarding change, mostly password resets
- Identity checks remain the largest single reason for contact
- Resolution time dropped once the help centre linked straight to chat
- Source: sample customer support ticketing export, Q3 2026 (sample)
---

---
layout: timeline

## Q4 release and measurement plan

| Date | Milestone | Owner |
|---|---|---|
| 21 Oct | Release 8.7 with low-memory image cache on Android | Mobile platform team |
| 4 Nov | Identity check redesign to 10 % of new installs | Onboarding squad |
| 25 Nov | Readout of the identity check experiment | Product analytics |
| 9 Dec | Full rollout decision for the identity check redesign | Product council |
| 16 Dec | Release 8.8 freeze before the holiday period | Release manager |

- The experiment needs four weeks of new installs to detect a 3-point activation change
- Release 8.7 is the last change to the Android crash rate measured in Q4
- Source: sample product roadmap, version of 30 September 2026 (sample)
---

---
layout: closing-decision-box

## Q4 decisions for the product council

- Decision requested: fund the identity check redesign and hold Android releases to a 3 GB device gate

| Decision | Cost | Date | Owner |
|---|---|---|---|
| Identity check redesign experiment | 2 engineers, 6 weeks | 14 Oct | Product council |
| Android low-memory crash gate in release checks | 1 engineer, 3 weeks | 14 Oct | Mobile platform team |
| Retention target for Q4 cohorts at 62 % | none | 14 Oct | Product council |
| Weekly release health digest to council members | none | 21 Oct | Product analytics |

- Next step: the analytics lead circulates the experiment design by 11 October
---
