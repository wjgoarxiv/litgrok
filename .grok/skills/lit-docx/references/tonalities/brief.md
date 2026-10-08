# Brief

A briefing of one to three pages for a person who must decide something, written conclusion first. The decision request stands right under a compact title block, the summary is four numbered points that each open with a bold sentence, and the rest of the document is short, unnumbered sections in itemised form (개조식) with a table or two. It is the Korean 검토 보고 or 현황 보고 in a restrained print form.

Worked example: `examples/02-brief-ko.md` (3 pages).

## When it fits

- One decision, one reader or one committee, little time.
- The reader will read page 1 and skim the rest; everything needed to decide must be on page 1.
- The options can be compared in one table.

## When it is wrong

- The analysis itself is the product, or there are several findings of similar weight: use Report.
- There is nothing to decide, only something to announce: use Memo.
- The request needs a budget breakdown, schedule and evaluation plan to be credible: use Proposal.
- It runs past three pages. Cut it or move to Report; a long brief defeats its purpose.

## Structure that sets it apart

1. Masthead: kicker (검토 보고, 현황 보고, Briefing) and date on the series line, title, subtitle, byline, an accent rule, the notice. Use an empty `::: cover` body; a lead paragraph would push the decision box down.
2. The decision box, `::: callout kind=key title="결정 요청"`, moved by the converter to stand directly under the title block wherever it sits in the source. It states what is to be approved, by whom, by when, and the amount.
3. 요약 / Summary: up to four paragraphs, each turned into a numbered point ①-④. The converter makes the first sentence bold (up to the first `다.` or the first full stop) and hangs the point. So each paragraph opens with a short claim and continues with its evidence.
4. Unnumbered sections, each under a full-width hairline instead of a number: background, options compared, schedule and risks, budget. Write them as dash lists in 개조식, noun or `~함`/`~임` endings, one fact per item.
5. Only the folio at the foot, right-aligned, from page 2.

## Tokens from the pack

| Token | Value |
|---|---|
| Dials | density 9, variance 3 |
| Margins | 25 / 27 / 25 / 25 mm |
| Body | Pretendard 10.5 pt, Korean justified |
| Ramp | h1 1.3 (13.5 pt), h2 1.15 (12 pt), title 2.5 (26.5 pt) |
| Numbering | none; h1 opens under a hairline (`h1_rule: above`) |
| Title block | masthead, no contents |
| Summary | numbered points ①-④, `conclusion_first: true` |
| Running head | footer: folio right |
| Palette | ink #1A1A1A, muted #555555, line #8C8C8C, accent #2D5A47 |
| Accent on | title rule, callout rules |
| Components | callout (at most one), columns |
| Figures | at most 0.40 of the frame high |

## Components

One callout, and it is the decision box. If the source has a second callout it becomes a bold line and plain text. Columns are allowed for a genuine two-way comparison of similar length, but a table usually serves better. Key figures and sidebars are not part of this tonality; a `::: keyfigures` block turns into a bulleted list.

## Writing the source

- Write the 요약 paragraphs so that the first sentence alone is a complete answer: "안 2로 전환하면 3년간 1억 1,400만 원을 아낀다." The bold lead is cut at the first `다.`, so put no other sentence-ending before the point is made.
- Keep the first section to four paragraphs; a fifth stays unnumbered.
- In 개조식 sections, one line per fact, no nested lists. A list of one item loses its dash, so merge a lone item into the sentence above.
- Use headings that name the content ("대안 비교", "소요 예산"), not "검토 결과" or "기타".
- 개조식 endings belong to list items only. Headings stay noun phrases, and the 요약 points are full sentences.

## Do and avoid

| Do | Avoid |
|---|---|
| Put the amount and deadline in the decision box | A decision box that says "검토 바랍니다" without a decision |
| One options table with the same rows for each option | Three paragraphs describing three options |
| Label sample figures `(예시)` | A key-figure strip; it is not drawn here |
| Stop at three pages | A closing section that repeats the summary |

## Worked snippet

```markdown
---
title: 사내 메신저 전환 검토 보고
subtitle: 현행 계약 만료에 따른 대안 비교와 2027년 1분기 전환안
author: 정보전략팀
organization: 예시 공사
date: 2026-10-05
notice: "예시 데이터: 실제 수치로 바꿔 주세요"
tonality: Brief
---

::: cover variant=masthead kicker="검토 보고"
:::

::: callout kind=key title="결정 요청"
2027년 3월 말까지 그룹웨어 내장 메신저로 전환하는 안과 전환 비용 3,200만 원(예시)의 집행 승인을 요청한다.
:::

# 요약

안 2로 전환하면 3년간 1억 1,400만 원을 아낀다. 현행 메신저를 3년 더 쓰는 비용은 2억 400만 원이다.

기능 손실은 크지 않다. 대화, 파일 전송, 화상 통화가 전체 사용의 96%를 차지한다.

# 검토 배경

- 현행 계약 만료일 2027. 3. 31., 연장 시 사용료 연 18% 인상
- 두 메신저를 함께 쓰는 부서에서 업무 요청 누락 사례 반복
```

The two paragraphs under 요약 print as "① **안 2로 전환하면 3년간 1억 1,400만 원을 아낀다.** 현행 메신저를…" and "② **기능 손실은 크지 않다.** …". Each list line under 검토 배경 starts with a word, never with the date, so Markdown does not read it as a numbered list.
