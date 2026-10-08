# Manual

A technical guide, procedure or operating manual that someone follows with the document open beside the task. It opens with the title over a document-control block, lists its contents when it runs to about five pages, numbers its sections 1 / 1.1 / 1.1.1, writes procedures as numbered steps, uses one warning style for every callout, and may set a narrow sidebar of definitions beside the text. The short title runs in the header so a loose printed page still says which manual it belongs to.

Worked example: `examples/03-manual-ko.md` (4 pages).

## When it fits

- The reader acts on the text: inspects, installs, operates, responds to an alarm.
- Steps have an order that matters, and some steps carry a hazard.
- The document is revised and reissued, so it needs an owner, an issue date and stable section numbers.

## When it is wrong

- The reader is deciding, not doing: use Brief or Report.
- It is a one-off notice of a changed procedure: use Memo, and reference the manual.
- It is mostly explanation with no steps: use Report.

## Structure that sets it apart

1. Title and subtitle, then the control block between two hairlines: 문서 (from `short_title`, else the title), 작성 부서 (`author`), 기관 (`organization`), 시행일 (`date`); in English Document, Owner, Organisation, Issued. The notice follows. No `::: cover` is needed; if you add one, its kicker stands alone on a line above the title (the date lives in the control block) and its body becomes a lead paragraph.
2. A contents list for longer manuals.
3. Section 1 states scope and responsibility: which equipment, which users, who does what, how often.
4. Procedure sections: a sentence of context, then an ordered list of steps, each a single action in the imperative. A step that needs a check names the expected value.
5. Warnings in a callout placed before the step they protect, not after.
6. Reference tables (schedules, limits, contacts) with numbered captions.
7. A closing section for faults, recovery or revision, so the manual ends on what to do when things go wrong.

## Tokens from the pack

| Token | Value |
|---|---|
| Dials | density 9, variance 6 |
| Margins | 25 / 27 / 25 / 25 mm |
| Body | Pretendard 10.5 pt, ragged right in both languages |
| Ramp | h1 1.35 (14 pt), h2 1.15 (12 pt), title 2.5 (26.5 pt) |
| Numbering | decimal 1 / 1.1 / 1.1.1 |
| Title block | `manual` (control block), contents on |
| Summary | prose |
| Running head | header: short title; footer: folio right |
| Palette | ink #1A1A1A, muted #555555, line #8C8C8C, accent #2E4A66 |
| Accent on | callout rules, sidebar rule |
| Components | callout, sidebar (third width, floated right), columns |
| Figures | at most 0.45 of the frame high |

## Components

- Callout: one style for every kind; use `kind=warning` for hazards and keep about one per four pages. When there are more warnings than the budget allows, the converter keeps the earliest ones as boxes and sets the rest as a bold title and text, which is still readable but no longer stands out, so choose the warnings that matter.
- Sidebar: definitions, tools required, or preconditions, in table-size text beside the opening paragraphs of a section. Give it at least as much running text beside it as it is tall, or it is set full width.
- Columns: rarely, for two parallel short procedures.

The control block counts as a component kind, so a four-page manual with one warning box already meets the two-kind floor.

## Writing the source

- Steps are `1.` lists; each starts with a verb in the reader's voice ("전원 스위치를 켜고…", "Open the valve…") and holds one action. Lists restart at 1 in every procedure.
- Put limits in the step: "면속도가 0.4~0.6m/s 범위 안에 있는지 읽는다", not "적정한지 확인한다".
- Cross-references use the numbers the converter assigns: "4장의 조치", "see 3.2". Count them before writing.
- Units in table headers; a table of limits gets a caption with `(예시)` when values are invented.
- No glyph markers (■, ▶, ✓) in headings or steps.

## Do and avoid

| Do | Avoid |
|---|---|
| Name the owner and issue date through frontmatter | A revision history table on page 1 |
| One action per step, expected value included | Steps that mix three actions and a warning |
| Warning before the step it protects | A box for every caution |
| End on fault handling and recovery | Ending on a summary of what was just described |

## Worked snippet

```markdown
---
title: 연구동 공용 흄후드 일상 점검 절차서
subtitle: 사용 전 점검, 월간 풍속 측정과 이상 시 조치
author: 연구지원팀 실험실안전파트
organization: 예시 연구원
date: 2026-10-05
short_title: 흄후드 일상 점검 절차서
notice: "예시 데이터: 실제 값으로 바꿔 주세요"
tonality: Manual
---

# 적용 범위

## 대상 설비와 사용자

이 절차서는 3층 공용 실험실의 흄후드 6대에 적용한다.

::: sidebar title="용어"
**면속도**: 새시 개구부를 지나 들어가는 공기의 평균 속도(m/s).
:::

흄후드는 실험 중 생기는 유해 증기를 옥상 배기구로 내보낸다. 이 기능은 면속도가 기준 범위 안에 있을 때만 유지된다.

# 사용 전 점검

::: callout kind=warning title="경보가 울릴 때"
작업을 멈추고 용기 뚜껑을 닫은 뒤 새시를 끝까지 내린다.
:::

1. 전원 스위치를 켜고 조명과 배기 팬이 함께 작동하는지 확인한다.
2. 표시창의 면속도가 0.4~0.6m/s 범위 안에 있는지 읽는다.
```

The headings print as "1 적용 범위", "1.1 대상 설비와 사용자" and "2 사용 전 점검"; the header of every page after the first reads "흄후드 일상 점검 절차서".
