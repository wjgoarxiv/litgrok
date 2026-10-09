# Chalk

Chalk lays a lesson out in order. Numbered steps, one marked idea per slide, a fenced note for the
definition or the usual mistake, slightly rounded surfaces, and a warm rust accent for the thing
being taught. Under a side title the rail becomes a dark green board with the title in white. The
deck should let a student who missed the class follow it from the file.

**Choose it** for lectures, tutorials, onboarding and worked examples: decks with definitions, a
formula, or a sequence of three or more steps taught in order. **It is wrong** for decision decks,
where the step rhythm reads as filler; for anything built on charts (Chalk has no chart family and no
KPI row); and for a timeline, which it cannot draw.

## Tokens

| Role | Value |
|---|---|
| ground / surface | `#FAFBFC` / `#EEF2F5` |
| ink / ink-muted / line | `#1F2933` / `#4E5A66` / `#CBD3DA` |
| accent / accent-deep / accent-tint | `#9A3412` / `#6B2409` / `#FCEBE0` |
| field / on-field | `#1F3B33` / `#FFFFFF` |
| chart series | `#9A3412`, `#1F3B33`, `#4E5A66`, `#2E6A8E` |
| faces | Pretendard Bold for titles, step numerals and display; Regular for body |
| radius / edge | 6 pt / fill |

Density 10, compact ramp. Variance 6 allows four treatments; the pack has exactly four.

**Tables**: header row in the accent tint with deep rust labels, row rules, numbers right-aligned,
totals bold.

## Titles by role

| Role | Default | Also allowed |
|---|---|---|
| content | `top-rule` | `kicker-numeral`, `side-rail` (by family) |
| data | `top-rule`; a comparison takes `side-rail` (the pack's `structure`): its criteria stand on the board rail | `side-rail` |
| sequence | `kicker-numeral` in the pack map | `step-diagram` takes only `top-rule`, `process` takes `top-rule` or `side-rail`; the step numbers come from the step lines |
| image | `side-rail` | `top-rule` |
| statement | `statement` | `top-rule` (quote) |
| definition | `side-rail` | `top-rule` |

The agenda draws no numeral (OF-119): a chalk deck whose only kicker was its agenda needs a step or
sidebar slide under `kicker-numeral` to keep three treatments (OF-110), and a sidebar note set across
the top adds a top-title grid slide that can push that composition past 40 % (OF-111).

## Families and variants

step-diagram, process, method, sidebar-note, comparison, image-split, quote, agenda, statement,
text-column, table-insight.

- Covers: `cover-rail` (the title on the dark board rail), `cover-typographic`, `cover-numeral`.
- Sections: `section-numeral` (with the agenda, an index page with this part marked),
  `section-rail`.
- Closings: `closing-summary-list` (the lesson's takeaways numbered down the page, then the homework
  with its deadline), `closing-ask`.
- Display: a statement page is drenched in the board green; big-number panels use the accent tint;
  closings put the next step in a tinted box.

Decoration: accent rule, rail fill, real numerals. The pack lists `mark-underline`, but the engine
does not draw it yet.

## Filling a compact Chalk page

Chalk's text families leave the most empty band at density 10 if written as flat bullets. What
works (example 04):

- `sidebar-note`: four groups, each a bold head with two sub-points, then the `::: main-box` note.
- `step-diagram` and `process`: five steps, then two to four plain bullets (a rule, a sample
  sentence, the source) that run under the steps.
- `method`: the formula line, then ten to twelve terms, each with its value in the worked example.
- `comparison`: the criteria stand on the board rail by default; if the rail still leaves one column
  hollow, give each side its missing row rather than pinning another title, which also keeps the
  deck apart from its Paper alternative.

## Do

- Number only what is a sequence: steps, parts, homework items.
- Mark one idea per slide: the term being defined or the step being taught.
- Put the definition or the usual mistake in the sidebar note, not in a bullet.
- Use the same worked example through the deck so every slide builds on the last.
- Close with what was learned, the assignment, its deadline and who checks it.

## Avoid

- More than one marked term per slide.
- Numerals on points that have no order.
- Definitions buried in bullets instead of the note.
- A chart-heavy lesson; choose Paper or Night for that.

## Two worked slides

Both are trimmed for reading. Complete slides of the same kind in the example decks carry the
extra rows, groups and takeaways that fill a compact page and pass the gate.

A point with its fenced misconception:

```markdown
---
layout: sidebar-note

## 가설 검정의 기본 질문

- **귀무가설과 대립가설**
  (1) 귀무가설: 두 모집단의 평균이 같다 (차이는 0)
  (2) 대립가설: 평균이 다르다 (양측) 또는 한쪽이 크다 (단측)
- **유의수준**
  (1) 귀무가설이 맞는데도 기각할 위험을 자료를 보기 전에 정한 값
  (2) 보통 0.05, 오판 비용이 큰 분야는 0.01도 쓴다

::: main-box
흔한 오해: p값은 귀무가설이 참일 확률이 아니다.
:::
---
```

A formula with its terms and the worked values:

```markdown
---
layout: method

## Standard error of a mean

SE = s ÷ √n

- **s** sample standard deviation, 8 cm in the height example
- **n** sample size, 25 students
- **√n** square root of n, so quadrupling n halves SE
- **SE** 8 ÷ 5 = 1.6 cm, the spread of means across repeated samples
- Source: sample course notes, week 4 (sample)
---
```

Full deck: `examples/04-lecture-chalk-ko.md`.
