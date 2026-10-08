# Page components

A component is anything on the page beyond headings, paragraphs, lists, tables and figures: a key-figure strip, a callout box, a sidebar, a side-by-side column block, and the title block or cover that opens the document. They are written in the Markdown source as fenced directives, three or more colons, and the converter (`scripts/docx_design.py`) splits them out before Markdown sees the text, so no fence ever reaches the page.

Components are the fastest way to make a document look machine-made. A box in every section, a strip of big numbers on the cover, a pull quote that repeats the paragraph beside it: each is a known tell. The rules below are therefore ceilings, and a good document usually uses fewer components than its tonality allows.

## Grammar

```text
::: <name> [positional] [key=value] [key="quoted value"]
body (Markdown, may hold tables and lists)
:::
```

- Names: `cover`, `callout`, `sidebar`, `pullquote`, `keyfigures`, `columns`. Any other name stops the conversion with an error that lists the six.
- Each name takes a fixed set of attributes (below). An unknown attribute, a repeated one, or a fence that is never closed is an error naming the line. A lone `:::` with nothing open is an error too.
- A fence inside a fenced code block is left alone, so you can document the syntax in a document.
- To nest one directive inside another, give the outer fence more colons (`::::` around `:::`). Use this sparingly; a box inside a box is itself a budget violation.
- `<!-- column-break -->` is valid only inside `::: columns`.

## The budget

The converter enforces the budget while it builds, so a component past the budget is never an error: it keeps its content as ordinary text (a title becomes a bold line above it) and the document still converts. The gate then checks the result.

| Rule | Where it is enforced |
|---|---|
| Only the kinds the tonality allows | converter; others become text |
| At most three component kinds per document | converter and gate (`component.budget`) |
| One key-figure strip per document, in the summary, never on a cover | converter and gate |
| About one callout per four pages, capped at one in Brief and Proposal; decision box first, then warnings, then notes | converter |
| Columns only when the parts are within 20 % of each other in length | converter |
| No pull quotes in any tonality | converter and gate |
| A document of four or more pages uses at least two component kinds (the title block or cover counts as one) | gate (`component.variety`) |

Which tonality allows what:

| Tonality | Allowed | Notes |
|---|---|---|
| Report | keyfigures, callout, columns | callouts by length |
| Brief | callout, columns | one callout; `kind=key` moves to the top |
| Manual | callout, sidebar, columns | the only tonality with sidebars |
| Proposal | keyfigures, callout, columns | one callout; keyfigures three per row |
| Memo | none | every directive becomes plain text |
| Journal | callout | the body is already in two columns |

Before you write a directive, put its purpose in the direction card in one line ("the decision the committee must take", "definitions the steps rely on"). If you cannot, leave it out.

## `::: cover`

```text
::: cover [variant=typographic|band|split|masthead] [kicker="…"] [image=…]
optional lead paragraph, or To / From / Subject lines for a memo
:::
```

The cover directive configures page 1; it must be the first block of the body, and its title always comes from frontmatter `title:` (a cover without one is an error). What it produces depends on the tonality, not on `variant`: the variant value is checked against the four names and then the pack's own title block is drawn. `image=` is accepted by the parser and drawn nowhere; leave it out.

- Report, Brief, Journal: a masthead on page 1. The kicker stands at the left of a series line with the date at the right, then the title, subtitle, byline, one rule and the notice. The directive's body becomes a lead paragraph set half a point above the body size.
- Manual: the title and subtitle over a document-control block (문서 / 작성 부서 / 기관 / 시행일, or Document / Owner / Organisation / Issued) built from `short_title`, `author`, `organization` and `date`.
- Proposal: a full typographic cover page. Kicker, title left-aligned in the upper third, a 36 mm rule, subtitle and lead; byline, date and notice at the foot. The body starts on the next page as page 1.
- Memo: a label (the kicker, or 메모 / Memo), the subject as title, then To / From / Date / Subject rows between two hairlines. Write the rows on one line separated by ` · `; the date is filled in from frontmatter after From.

```text
::: cover kicker="안내"
받는 사람: 본사 전 직원 · 보내는 사람: 안전관리실 · 제목: 10월 22일 소방 대피 훈련
:::
```

A `::: keyfigures` block inside the cover is moved into the summary when the tonality allows key figures, and left out (with a note) when it does not. A cover never carries figures, tiles, colour blocks or photographs.

## `::: callout kind=<note|key|warning> [title="…"]`

Use a callout for content that stands outside the reading order: the decision a reader is asked to take, a warning that must be seen before a step, a definition or assumption that a calculation depends on. Never for a summary of the paragraph next to it.

It is drawn as one ruled box: a 0.75 pt rule above and a 0.5 pt rule below in the pack's accent (ink in Journal), no side stripe, no fill, the title in bold ink at body size. Without `title=` the label is 참고 / 핵심 / 주의 or Note / Key point / Warning. The box never splits across pages.

```text
::: callout kind=key title="결정 요청"
2027년 1월부터 6월까지 시범 사업을 시행하고 사업비 4,680만 원(예시)을 복리후생 예산에서 집행하는 안의 승인을 요청한다.
:::
```

When the budget allows fewer callouts than the source has, the converter keeps the decision box first, then warnings, then notes, in source order; the rest become a bold title line and plain text. In a Brief the first `kind=key` callout is moved to stand right under the title block, whatever its position in the source.

## `::: sidebar [title="…"] [width=third|half] [float=right|left|none]`

Manual only. A box beside the text with a hairline down its left side (in the accent), no fill, table-size text: definitions, required tools, a short list of preconditions. Default width is a third of the text block, floated right.

```text
::: sidebar title="용어"
**면속도**: 새시 개구부를 지나 들어가는 공기의 평균 속도(m/s).

**새시**: 흄후드 앞면의 위아래로 움직이는 유리문.
:::
```

A floating sidebar needs enough text beside it. When the paragraphs between the sidebar and the next heading are shorter than the box, the converter stops the float and sets the box full width in the flow; the gate's `sidebar.overlap` check catches any case that slips through. Place a sidebar right after the first paragraph of a long section, never just before a heading. In a two-column body a sidebar never floats.

## `::: pullquote [cite="…"]`

Off in every tonality. A pull quote that repeats a sentence of the body is dropped with a note; any other text is kept as a plain paragraph. Do not write one.

## `::: keyfigures [cols=2|3|4]`

One row of real, comparable metrics in the summary: three is usual, four at most per row, eight items at most in total. Each figure is set one modest step above the body (the h2 size), bold, in ink, over a hairline, with its label below and an optional basis line (period and source) in muted ink.

```text
::: keyfigures
- **312MWh** 연간 발전량 (예시)
  * 2025. 10.~2026. 9. 인버터 누적 기록
- **8.4%** 본사 전력 사용량 대비 (예시)
  * 같은 기간 수전 계량기 기준
:::
```

The figure is the bold part and must contain a digit; the label follows it. An indented list item under a figure is its basis. Write the basis as an indented `  - ` or `  * ` item. The prose lint counts a spaced hyphen as a dash only between two words, so a list marker or an empty table cell never trips `rule-02-em-dash-cluster`.

A figure must be a measured quantity with a basis. A count of sites, a project name or a slogan is not a key figure. Put the strip after the first paragraph of the summary; the same numbers then do not need repeating in the paragraph above it. In a tonality without key figures (Brief, Manual, Memo, Journal) the block becomes a bulleted list with each basis in brackets.

## `::: columns <1|2|3> [gap=<mm>] [rule=true]`

Two short blocks side by side: before and after, two options, field opinion and management opinion. Top level only, never inside a box.

```text
::: columns 2 rule=true
**현행 방식**

서류 접수 후 담당자가 수기로 대조한다. 처리 기간은 평균 4일이다.
<!-- column-break -->
**변경 방식**

접수와 동시에 시스템이 대조한다. 담당자는 불일치 건만 확인한다.
:::
```

With a `<!-- column-break -->` each part gets its own cell of one borderless row, tops aligned (`rule=true` draws a hairline between them). Without a break the content flows through a balanced column section. Parts whose lengths differ by more than 20 % are set one after another as plain text, because an unbalanced pair leaves a hole under the shorter column.

## Table captions and table styles

A table caption is a plain line above the table: `표 1. 제목` or `Table 1. Title`. Korean captions become `<표 1> 제목` with the label bold; English keep `Table 1.` bold. A `{style=banded}` (or `light-grid`, `header-fill`) attribute after a caption is accepted for older sources but every tonality draws booktabs, and the converter prints a note saying so.

Lines that open with `자료:`, `출처:`, `주:`, `Source:` or `Note:` right under a table take the source-note style (smaller, muted ink, 3 pt below the rule) and stay with the table. Korean `출처:` is rewritten as `자료:`.

## Misuse

- A callout in every section, or a callout that restates the paragraph above it.
- Key figures that are not metrics, that lack a basis, or that appear on the cover.
- A sidebar used as a decorative panel for a quote or a slogan.
- Columns used to fill width with two unrelated lists.
- Nesting a box in a box.
- Writing components in a Memo and expecting boxes; they turn into text by design.
