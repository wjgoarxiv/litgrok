---
tonality: paper
title: Sparse pressure sensing for leak localisation in district water networks
subtitle: A budget-aware placement method and a 1,140-node case study
date: 2026-10-05
department: Example University, Department of Civil Engineering
presenter: Example Researcher
notice: Sample data — replace with real figures
---

---
layout: cover-index

# Sparse pressure sensing for leak localisation in district water networks
---

---
layout: text-column

## Problem setting and scope

- **Context** District networks lose water through small background leaks that no single meter sees
  (1) Typical non-revenue water in the sample utility: 18 % of supplied volume (sample)
  (2) Leaks under 2 L/s run for a median of 41 days before a crew finds them (sample)
- **Gap** Placement methods assume a sensor budget large enough to cover every pressure zone
  (1) Real budgets cover 1-3 % of nodes, where coverage-based rules lose most of their accuracy
- **Question** How accurately can a fixed budget of pressure loggers localise a leak to a pipe segment?
- **Scope** One district metered area, 1,140 nodes, 96 km of mains, hydraulic model calibrated in 2025
- Source: sample utility asset register and night-flow records, 2024-2026 (sample)
---

---
layout: section-rule

# Method
---

---
layout: method

## Placement objective and its terms

![Information gain of candidate nodes over the test network (sample) | Source: sample figure](assets/example-a.png)

- **Candidate set** nodes with logger access, 412 of 1,140 after a site survey
- **Leak scenarios** 6,800 simulated leaks of 0.5-3 L/s at every pipe midpoint
- **Signature** pressure drop at each candidate node, from the calibrated model at night demand
- **Objective** expected entropy reduction over the scenario set, maximised under a budget k
- **Solver** lazy greedy selection with a 1 − 1/e bound, then one swap pass
- **Noise** logger error modelled as Gaussian, σ = 0.05 m head, from bench tests
---

---
layout: figure-academic

## Test network and logger layout at k = 12

![Logger positions at k = 12, test district (sample) | Source: sample figure](assets/example-b.png)

- **Observation** half the loggers sit on long transmission mains, not zone centres
- **Limitation** fitted to night demand, where noise is a third of daytime
- **Implication** sites with cheap access lose little accuracy
- Source: sample hydraulic model, calibrated against 2025 hydrant tests (sample)
---

---
layout: section-rule

# Results
---

---
layout: table-insight

## Detection and localisation by logger budget

| Loggers (k) | Share of nodes | Detected | Top-3 segment hit | Median error |
|---|---|---|---|---|
| 4 | 0.4 % | 71 % | 38 % | 610 m |
| 8 | 0.7 % | 84 % | 55 % | 390 m |
| 12 | 1.1 % | 91 % | 68 % | 240 m |
| 16 | 1.4 % | 94 % | 74 % | 190 m |
| 24 | 2.1 % | 96 % | 79 % | 150 m |
| 32 | 2.8 % | 97 % | 81 % | 140 m |

> Table 1. Results over 6,800 simulated leaks of 0.5-3 L/s, night demand (sample data)

- Gains flatten after k = 16: eight more loggers buy five points of top-3 hits
- At k = 12 the median search radius falls to 240 m, about two street blocks
- Source: sample simulation study, October 2026 (sample)
---

---
layout: chart-insight

## Median localisation error against logger count

::: chart type=line unit="m"
| Loggers | Proposed (m) | Greedy coverage (m) |
|---|---|---|
| 4 | 610 | 820 |
| 8 | 390 | 610 |
| 12 | 240 | 470 |
| 16 | 190 | 380 |
| 24 | 150 | 290 |
| 32 | 140 | 230 |
> Median distance from the true leak to the top-ranked segment (sample data)
:::

- The proposed placement halves the error of greedy coverage at k = 12 (240 m against 470 m)
- The two curves converge only past k = 32, beyond a realistic budget
- Source: sample simulation study, October 2026 (sample)
---

---
layout: figure-pair

## Leak probability maps under two placements

![Greedy coverage, k = 12 (sample) | Source: sample figure](assets/example-c.png)

![Proposed placement, k = 12 (sample) | Source: sample figure](assets/example-c.png)

- The same 2 L/s leak: coverage spreads probability over 11 segments, the proposed layout over 3
- Both maps use the night-demand model and the same 12-logger budget (sample data)
---

---
layout: comparison

## Proposed placement and greedy coverage

:::: columns 1fr 1fr
::: col
- **Greedy coverage**
  (1) Accuracy: 470 m median error at k = 12
  (2) Robustness: error rises 38 % under daytime noise
  (3) Compute: 4 s per layout on a laptop
  (4) Data needs: network graph only
:::
::: col
- **Proposed placement**
  (1) Accuracy: 240 m median error at k = 12
  (2) Robustness: error rises 21 % under daytime noise
  (3) Compute: 11 min per layout, run once per network
  (4) Data needs: calibrated hydraulic model
:::
::::

- Source: sample simulation study; noise test at three times night σ (sample)
---

---
layout: closing-summary-list

## Findings, limits and next experiments

- Twelve loggers (1.1 % of nodes) localise 68 % of simulated leaks to three segments
- Gains flatten after sixteen loggers, which sets a practical budget for this network type
- Results rest on a calibrated model; an uncalibrated model was not tested
- Next: a field trial with 12 loggers in the sample district, January-June 2027, owner: research group
---

---
layout: references-appendix

## References and definitions

- [1] Sample author A. Pressure-based leak localisation, a review. Sample Journal of Water Systems, 2024 (sample)
- [2] Sample author B. Submodular sensor placement in pipe networks. Sample Conference on Hydroinformatics, 2023 (sample)
- [3] Sample utility. District metered area asset register, 2025 edition (sample)
- [4] Sample utility. Hydrant test campaign and model calibration report, 2025 (sample)
- [5] Non-revenue water: supplied volume minus billed volume, as a share of supplied volume
- [6] Top-3 segment hit: the true leak lies in one of the three highest-ranked pipe segments
- [7] Median error: median distance from the true leak to the top-ranked segment
- [8] District metered area: a network zone with metered inflow and closed boundary valves
---
