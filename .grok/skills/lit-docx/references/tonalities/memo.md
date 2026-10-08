# Memo

A notice, internal memo, short decision request or letter of one or two pages. It has no cover and no components: a small label, the subject set as the title, To / From / Date / Subject rows between two hairlines, then a few unnumbered sections of plain prose. Its quietness is the point; a memo that looks designed reads like marketing.

Worked examples: `examples/05-memo-en.md` and `examples/09-memo-ko.md`, one page each.

## When it fits

- Something has changed or will happen, and a defined group needs to know what to do: a move, a drill, a new rule, a deadline.
- A short request to one person or team that needs a written record.
- The whole message fits on one page, two at most.

## When it is wrong

- The reader must choose between options: use Brief, which puts the decision and the comparison up front.
- It needs tables of evidence or more than one table: use Report or Brief.
- It is over two pages. Shorten it, or move the detail into an attached manual or report and keep the memo as the cover note.

## Structure that sets it apart

1. A label in muted bold at table size: the kicker of the `::: cover` directive (공지, 안내, Notice, Memo), or 메모 / Memo by default.
2. The subject as the title, at 1.8 times the body (19 pt Korean, 20 pt English), not the 26 pt of the other tonalities. Frontmatter `subtitle:` is not printed in a memo (it still has to be a noun phrase, because the gate reads it), so put anything the reader needs into the Subject row.
3. The memo block: rows of label and value between two ink hairlines, built from the cover line `To: … · From: … · Subject: …` (Korean `받는 사람:`, `보내는 사람:`, `제목:`, `참조:`; English also `Cc:`). The date row is added after From from frontmatter `date:` and printed as `2026. 10. 5.` or `5 October 2026`.
4. The notice line under the block.
5. Unnumbered sections in prose: what is happening, what each group must do, by when, whom to ask. The first section gives the whole message; later sections give detail.
6. The folio at the foot from page 2, right-aligned; nothing in the header.

## Tokens from the pack

| Token | Value |
|---|---|
| Dials | density 9, variance 2 |
| Margins | 25 / 27 / 25 / 25 mm |
| Body | Pretendard 10.5 pt Korean (justified), 11 pt English (ragged) |
| Ramp | h1 1.2 (12.5 / 13 pt), h2 1.1 (11.5 / 12 pt), title 1.8 (19 / 20 pt) |
| Numbering | none |
| Title block | memo block |
| Summary | prose |
| Running head | footer: folio right |
| Palette | ink #1A1A1A, muted #555555, line #8C8C8C, no accent |
| Accent on | nothing |
| Components | none |
| Figures | at most 0.40 of the frame high |
| Spacing | `spacing: tight`: line pitch at the low end (Hangul 165 %, Latin 120 %), heading space reduced; a run-in title line keeps a heading's 12 pt above it, and the paragraph after a list stands 6 pt clear of the last item |
| Fit | a memo never runs onto a second page that it fills under a quarter of the frame (`memo.fit`) |

## Components

None. Every directive except `::: cover` turns into plain text: a callout becomes a bold title line and its paragraph, key figures become a list. That is deliberate; if something must stand out, put it in the first sentence of the first section. The memo block itself counts as the one component kind the gate sees, which is why a memo must stay under four pages.

## Writing the source

- The subject line in the memo block and the title can differ: the title names the matter ("Finance team move to the sixth floor"), the Subject row says what the memo does ("Moving the finance team from floor 3 to floor 6 on 14–15 November").
- Write the To / From / Subject values on one line, separated by ` · ` (space, middle dot, space). English values are capitalised automatically.
- Korean memos to staff use 합니다체 consistently; a notice from an office may use 해요체 if the organisation does. Do not mix.
- One small table is acceptable (a schedule, a floor-by-floor list); give it no caption if it is the only one.
- End with the contact section: names, extensions, the date of any follow-up.
- Dates in Korean text as `10월 22일(목)` or `2026. 10. 22.`; a line must not begin with a date.

## Do and avoid

| Do | Avoid |
|---|---|
| Say what changes for whom in the first paragraph | A background section before the reader learns what to do |
| Name a person and an extension for questions | "문의 사항은 담당 부서로" with no name |
| Keep it to one page when you can | Callouts, key figures or columns; they will print as text |
| Trim sentences when a few lines spill onto page 2 | Leaving a second page that holds two lines (`memo.fit` fails it) |

## Worked snippet

```markdown
---
title: 2026년 하반기 본사 소방 대피 훈련 안내
subtitle: 훈련 일시, 층별 대피 경로와 부서별 협조 사항
author: 안전관리실
organization: 예시 주식회사
date: 2026-10-05
notice: "예시 데이터: 실제 내용으로 바꿔 주세요"
tonality: Memo
---

::: cover kicker="안내"
받는 사람: 본사 전 직원 · 보내는 사람: 안전관리실 · 제목: 10월 22일 오후 소방 대피 훈련 실시
:::

# 훈련 개요

본사 건물 전체를 대상으로 하는 하반기 소방 대피 훈련을 10월 22일(목) 오후 2시부터 2시 40분까지 실시합니다.

# 문의

훈련 일정은 안전관리실 김도윤 책임(내선 4410)에게 연락해 주십시오.
```

Page 1 shows "안내", the title, then four rows (받는 사람, 보내는 사람, 날짜 2026. 10. 5., 제목) between hairlines, the notice, and the two sections.
