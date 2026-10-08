# Report

The default for results, project reports, periodic reviews and analyses read by managers, from about three to thirty pages. In Korean it follows the manner of a central-bank or research-institute issue note: an unadorned title block, numbered sections in the institute order Ⅰ. / 1. / 가., prose paragraphs that state a finding and then its evidence, and tables that carry the numbers. In English it is the same page with decimal numbering.

Worked examples: `examples/01-report-ko.md` (4 pages) and `examples/07-report-en.md` (3 pages).

## When it fits

- The reader needs the evidence, not only the conclusion: tables, comparisons, causes.
- The document will be filed and read again, so section numbers help people point at things ("Ⅲ장 2절").
- There are several findings of similar weight and one or more requests at the end.

## When it is wrong

- One decision for one busy reader: use Brief.
- The document exists to win approval for new spending: use Proposal, which gives the budget and the decision box their proper place.
- Readers will follow it step by step at a machine or a desk: use Manual.
- It fits on one page: use Memo.

## Structure that sets it apart

1. Page 1 masthead: the kicker (the kind of report, e.g. "운영 결과 보고" or "Quarterly review") at the left of a series line with the date at the right, then the title, subtitle, byline, one rule in the accent, the sample-data notice, and the cover directive's lead paragraph.
2. A short contents list after the title block when the source is long enough for about five pages.
3. A first section named 요약 / Summary in prose: the main result in the first sentence, the key-figure strip after the first paragraph, then what the reader is asked to do.
4. Numbered sections, each opening with a paragraph before its first subsection.
5. Tables with numbered captions, units and source lines.
6. The last section ends on the request, the next step or the open question, never on a generic wrap-up.

## Tokens from the pack

| Token | Value |
|---|---|
| Dials | density 9, variance 5 |
| Margins | 25 / 27 / 25 / 25 mm (top, bottom, left, right) |
| Body | Pretendard 10.5 pt, Korean justified, English ragged |
| Ramp | h1 1.4 (14.5 pt), h2 1.2 (12.5 pt), title 2.5 (26.5 pt) |
| Numbering | Korean `roman-ko` (Ⅰ. / 1. / 가.), English `decimal` |
| Title block | masthead, contents on |
| Summary | prose |
| Running head | footer: short title left, folio right |
| Palette | ink #1A1A1A, muted #555555, line #8C8C8C, accent #1F3A5F |
| Accent on | title rule, callout rules |
| Components | keyfigures (3 per row), callout, columns |
| Figures | at most 0.45 of the frame high |

## Components

Use at most two of the three in most reports:

- One key-figure strip in the summary, three real metrics each with a basis.
- A callout for a stated assumption, a definition, or a warning about how to read a number; about one per four pages.
- Columns for a genuine pair (before / after, two sites), rarely.

A report of four pages or more must show two component kinds, and the masthead does not count as one in this tonality; the strip plus one callout is the usual pair.

## Writing the source

- Headings are topics: "발전 실적", "효율 저하 요인", "Speed of response". Never "발전량이 예측을 넘었다".
- The first sentence under each heading carries the finding; the rest gives the evidence.
- Each table is introduced by the paragraph above it and followed by a sentence that says what to notice.
- Captions: `표 2. 분기별 발전량과 예측 대비 실적 (예시)`. Put units in the header cells; when all value columns share one unit, the converter lifts it into a `(단위: …)` line.
- Close a table with `자료:` (and `주:` before it when needed) or `Source:`.
- Avoid the generic institute headings that say nothing (개요, 주요 내용, 시사점, 결론) when a specific label is available.

## Do and avoid

| Do | Avoid |
|---|---|
| Give every number its period and source | Rounding a 4.7 % gain to "약 5%" in one place and "4.7%" in another |
| Keep sections uneven when the material is uneven | Padding a short section to match its neighbours |
| Write `short_title:` so the footer reads cleanly | Typing section numbers into headings |
| End on the request or next step | Ending each section with a one-line restatement |

## Worked snippet

```markdown
---
title: 본사 옥상 태양광 설비 1년 운영 결과
subtitle: 2025년 10월~2026년 9월 발전 실적과 2027년 보완 계획
author: 시설관리팀 에너지파트
organization: 예시 주식회사
date: 2026-10-05
short_title: 옥상 태양광 1년 운영 결과
notice: "예시 데이터: 실제 수치로 바꿔 주세요"
tonality: Report
---

::: cover variant=masthead kicker="운영 결과 보고"
첫 1년의 발전량, 절감액, 고장 이력과 2027년 보완 예산 요청을 담았다.
:::

# 요약

옥상 태양광 설비는 1년 동안 312MWh를 생산해 본사 전력 사용량의 8.4%를 대체했다.

::: keyfigures
- **312MWh** 연간 발전량 (예시)
  * 2025. 10.~2026. 9. 인버터 누적 기록
:::

# 발전 실적

## 월별 발전량

표 1. 분기별 발전량 (예시)

| 분기 | 예측 (MWh) | 실적 (MWh) |
| --- | ---: | ---: |
| 2026년 2분기 | 94 | 101 |

자료: 인버터 원격 감시 기록
```

The headings print as "Ⅰ. 요약", "Ⅱ. 발전 실적" and "1. 월별 발전량"; the caption prints as "<표 1> 분기별 발전량 (예시)". The basis line may open with `*` or `-`; either reads as a list marker, not a dash.
