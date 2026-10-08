# Journal

Long-form reading in two columns: essays, newsletters, white papers and research summaries that are not being submitted to a named journal. It sits closest to the publisher profiles in look: a title block with authors, affiliations, abstract and keywords across the full width, then the body in two columns, decimal section numbers for cross-references, Latin body text in Times New Roman with Hangul and headings in Pretendard, ragged right, and the short title with the folio in the header.

Worked example: `examples/06-journal-en.md` (3 pages).

## When it fits

- The reader reads from start to finish, and the argument builds over several sections.
- Prose dominates; tables are few and narrow.
- The piece has named authors and benefits from an abstract a reader can stop after.

## When it is wrong

- It is going to a journal or conference: use the publisher path (`--publisher elsevier|acs|ieee|nature|korean-generic`) and its own rules.
- It is mainly tables and figures for managers: use Report.
- Its purpose is approval of money or a plan: use Proposal.
- It is short. A two-column body under about two pages looks like a flyer; use Memo or Report.

## Structure that sets it apart

1. Full-width title block: the date at the right of the series line (and a kicker at the left if the cover directive gives one), title, subtitle, author names, numbered affiliations, an optional corresponding e-mail, one ink rule, the notice, then 초록 / Abstract and 주요어 / Keywords from frontmatter.
2. The body switches to two columns of about 77 mm with a 6 mm gap after the title block. The first section break also makes the gate treat page 1 as an opening page, so its fill is not judged.
3. Decimal numbering 1 / 1.1, so the text can say "Section 3.3". Back matter (References, 참고문헌, Acknowledgements) stays unnumbered.
4. Tables of up to three columns sit in a column; wider tables and their captions span the page automatically.
5. A section on limits or open questions near the end, which this kind of reader expects.

## Tokens from the pack

| Token | Value |
|---|---|
| Dials | density 9, variance 6 |
| Margins | 25 / 27 / 25 / 25 mm |
| Body | Times New Roman 10.5 pt for Latin, Pretendard for Hangul and headings, ragged right |
| Leading | Latin pitch 133 % (Word multiple 1.157 for Times) |
| Ramp | h1 1.3 (13.5 pt), h2 1.15 (12 pt), title 2.5 (26.5 pt) |
| Numbering | decimal |
| Title block | masthead with authors, affiliations, abstract, keywords |
| Summary | prose (the abstract) |
| Running head | header: short title left, folio right |
| Palette | ink #1A1A1A, muted #555555, line #8C8C8C, no accent |
| Columns | 2, gap 6 mm |
| Components | callout |
| Figures | at most 0.40 of the frame high |

## Components

Only the callout, drawn with ink rules since the pack has no accent. Use it for a note on how to read the numbers, a definition, or a caveat; one in a three- or four-page piece is plenty. The two-column body counts as a component kind and so does the opening title block, so the gate's two-kind floor is met without adding anything. Key figures and sidebars become plain text here.

## Writing the source

- Frontmatter carries `authors` (a list of names with `affiliation` numbers), `affiliations` (a numbered mapping), `abstract`, `keywords` and optionally `corresponding_email`; see `references/frontmatter_schema.md`.
- Keep each top-level section to a few hundred words in English. The prose lint measures vocabulary variety and sentence-length spread per `#` section, and a single 900-word section is likely to trip `rule-10-lexical-diversity`.
- Avoid naming sections exactly "Introduction" or "Discussion" unless you cite sources there: the lint expects citations in sections with those names. "Background", "Findings" and "Limits of the study" read naturally and lint cleanly.
- Never invent references. If there are none, leave the section out.
- Write tables narrow (three columns or fewer) so they stay in the column; check that every cross-reference matches the numbering.

## Do and avoid

| Do | Avoid |
|---|---|
| An abstract that states the method, the main numbers and the main limit | An abstract that only says what the paper "explores" |
| Decimal cross-references that match the printed numbers | "As shown above" across columns |
| Narrow tables with a caption above | A six-column table that forces a full-width break on every page |
| A limits section in plain words | Hedging piled into every sentence |

## Worked snippet

```markdown
---
title: Reading on the morning train
subtitle: A two-week diary study of commuters on one suburban line
authors:
  - { name: "Hana Seo", affiliation: 1 }
  - { name: "Daniel Okafor", affiliation: 2 }
affiliations:
  1: "Example Institute for Transport and Society"
  2: "Example University, School of Information"
date: 2026-10-05
short_title: Reading on the morning train
notice: "Sample study: replace with real data"
abstract: "Forty-two commuters kept a diary of what they read on the train for ten working days."
keywords: [commuting, reading habits, diary study]
tonality: Journal
---

# Findings

## How much reading

Reading of some kind appeared on 634 of 761 trips (83 %).

Table 1. Reading on 761 morning trips (sample data)

| Type of reading | Trips | Share |
| --- | ---: | ---: |
| Any reading | 634 | 83 % |
```

"Findings" prints as "1 Findings" and "How much reading" as "1.1 How much reading"; the three-column table stays inside its column.
