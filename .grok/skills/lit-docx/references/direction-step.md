# Choosing a tonality

A tonality is a page design chosen per document. LitGrok's `lit-docx` skill ships six of them as data packs in `.grok/skills/lit-docx/templates/tonalities/`: `report`, `brief`, `manual`, `proposal`, `memo` and `journal`. They share one restrained look (near-black ink, booktabs tables, Pretendard, A4) and differ in structure: what stands on page 1, how the summary is set, whether and how headings are numbered, which page components the document may use, and what the running head carries. This file explains how to pick one before writing the source, how to state the choice, and when not to pick a tonality at all.

The choice is made once per document, before the Markdown is written, because each tonality expects a different source shape. A Brief needs a first section of short paragraphs that open with their conclusion; a Manual needs numbered steps; a Memo needs a To / From / Subject line. Converting a Report source with `tonality: Memo` produces a valid file, but not a memo.

## Who decides

The order of authority is fixed.

1. A tonality, publisher or font the user names wins. "Make it a brief", "ACS format", "two columns like a newsletter" settle the question.
2. A journal submission, or a named publisher, goes to the publisher path (`--publisher elsevier|acs|ieee|nature|korean-generic`), never to a tonality. The two are mutually exclusive: the converter refuses `--tonality` together with `--publisher`, and refuses frontmatter `tonality:` on a publisher run.
3. Otherwise the agent chooses, from the document type first and the source second.

A bare request ("lit, 보고서 하나 만들어 줘", "write me a project report") asks nothing about design. Pick the tonality, build the document, and say in the reply which one was used and which two were the alternatives. A question about tonality before any output is a wasted turn: the user can react to a finished page far faster than to a menu.

## Start from the document type

Map the request to a type, then take the first tonality of its row. The other two in the row are the alternatives you name in the reply.

| Document type and the words that signal it | First choice | Alternatives |
|---|---|---|
| Results, project report, analysis, quarterly review (보고서, 결과 보고, 분석, 실적) | Report | Brief, Manual |
| Briefing for one decision maker, one to three pages (개조식, 현황 보고, 검토 보고, 보고 자료) | Brief | Memo, Report |
| Guide, procedure, operating manual, onboarding (가이드, 매뉴얼, 절차서, 운영 지침) | Manual | Report, Brief |
| Proposal, plan, pitch, funding request as a document (제안서, 기획서, 계획서, 사업 계획) | Proposal | Report, Brief |
| Notice, internal memo, short decision request, letter (메모, 공지, 안내문, 협조 요청) | Memo | Brief, Report |
| Essay, newsletter, white paper, research summary not bound for a journal | Journal | Report, Proposal |
| Manuscript for a named journal | publisher profile | none |

Some requests carry two types. "A proposal with last year's results" is still a Proposal: the results are evidence inside it. "A report that asks for a budget" is a Report whose last section is a request; it becomes a Proposal only when the request is the reason the document exists.

## Let the source reorder the row

When the user supplies notes, data or a draft, read it before choosing. Signals in the material can move a different member of the same row to the front. They never add a tonality from outside the row.

| Signal in the material | Effect on the order |
|---|---|
| Four or more tables, or tables make up a third of the blocks | Report or Manual first |
| Under about 900 words, or "one page" / "두 쪽 이내" in the brief | Memo or Brief first |
| Numbered procedures, warnings, checklists | Manual first |
| English long-form prose with few tables | Journal first |
| A decision or approval is the point of the document | Brief (short) or Proposal (with budget) first |
| Many images supplied by the user | Proposal or Journal first |

Length matters most at the edges. A Memo that grows past two pages has stopped being a memo, and a Report of one and a half pages looks empty under its title block and contents logic. When the material and the type disagree, follow the material and say why.

## The structure each tonality sets

Keep this table in mind while choosing; it is what the reader will see.

| Tonality | Page 1 | Summary | Headings | Components allowed | Running head |
|---|---|---|---|---|---|
| Report | masthead title block, contents from about five pages | prose, optional key-figure strip | Korean Ⅰ. / 1. / 가., English 1 / 1.1 | key figures, callout, columns | footer: short title left, folio right |
| Brief | compact masthead, the decision box straight under it | four numbered points ①-④, bold lead sentence each | unnumbered, hairline above each section | one callout, columns | footer: folio right |
| Manual | title over a document-control block, contents from about five pages | prose | 1 / 1.1 / 1.1.1 | callout (warning), sidebar, columns | header: short title; footer: folio right |
| Proposal | a typographic cover page, body from page 2 | prose with one key-figure strip | unnumbered | key figures, one callout, columns | footer: folio centred |
| Memo | label, subject as title, To / From / Date / Subject rows | prose | unnumbered | none | footer: folio right from page 2 |
| Journal | masthead with authors, affiliations, abstract, keywords; body in two columns | abstract | 1 / 1.1 | callout | header: short title left, folio right |

## Write the direction card

Before writing the source, write a short direction card for yourself and keep it in the build notes beside the Markdown (never inside the document). It forces the choice to be explicit and gives the reply its one line about design.

```text
Document     사내 메신저 전환 검토 보고 (decision briefing, 2 pages)
Reader       경영위원회 위원장, reads the first page only
Tonality     Brief, because one decision is requested and the reader wants the conclusion first
Alternatives Memo (if the budget table is dropped), Report (if the alternatives need full analysis)
Dials        density 9, variance 3 (pack defaults)
Page 1       masthead: kicker "검토 보고", date, title, subtitle, byline, notice
Components   callout kind=key "결정 요청" (the decision); nothing else
Numbers      sample figures labelled (예시); notice in frontmatter
Wrong if     the reader needs the analysis behind each option to decide
```

Every component in the card needs a one-line purpose. A component without one is dropped before writing, not after the gate complains. The "wrong if" line is the honest test: when it turns out to be true while drafting, switch to the alternative and rewrite the card.

## Rules every card carries

These hold whatever tonality is chosen, and the gate checks most of them.

- Titles, subtitles and headings are noun-phrase labels. Korean labels never end in a sentence ending (-다, -니다, -요, -죠) or a nominalised claim (-음, -함, -됨): write "1년 운영 결과", not "목표를 달성함". English labels have no finite verb and no closing full stop: "Conversion by feed rate", not "Conversion rose with feed rate." The finding belongs in the first sentence under the heading.
- Numbers are stated at their real size. A key figure carries its label and a basis line (period and source). No rounding up, no "up to", no display-size numerals.
- Invented values are labelled. Frontmatter `notice:` carries `"예시 데이터: 실제 수치로 바꿔 주세요"` or `"Sample data: replace with real figures"` (a colon, never a spaced dash), and figures in key-figure labels and table captions carry `(예시)` / `(sample)`.
- Pretendard everywhere; Journal sets Latin body text in Times New Roman and keeps Pretendard for Hangul and headings.
- Korean dates in the text read `2026. 10. 5.` or `2026년 10월 5일`. The converter rewrites an ISO date in Korean Markdown, but write the Korean form yourself so the source reads correctly too.

## Dials

Each pack has two dials, `density` and `variance`, from 1 to 10. Density sets margins, body size and leading. Variance is validated and printed on the converter's last line, but in the restrained packs it changes nothing on the page; the component budget is fixed by the pack. Leave both at the pack value unless the user asks for a looser or tighter page. Override them with `--density 7` on the command line or `density: 7` in frontmatter. A density under 8 widens the margins (26 mm sides at 8, 27 mm at 6) and opens the leading a step.

## Build and check

```bash
node .grok/skills/lit-docx/scripts/run.mjs convert_md_to_docx.py brief.md brief.docx
node .grok/skills/lit-docx/scripts/run.mjs docx_gate.py brief.docx --source brief.md --layout
```

The converter reads `tonality:` from frontmatter, or `--tonality brief` (any case). Its last line names the tonality, the dials and the detected locale; check that line before anything else. The gate exits 0 only when the package, content, prose lint and page checks all pass; `--layout` renders through LibreOffice and adds the page checks. Fix a finding in the source, never by switching tonality to dodge it.

## Comparing directions

When the user asks to see options ("두세 가지 스타일로 보여 줘", "compare a report and a brief version"), build the same source in two or three tonalities from the same row. Keep one source where you can: a directive the tonality does not use falls back to plain text, so a Report source converts as a Brief without edits. Then check that the versions really differ:

```bash
node .grok/skills/lit-docx/scripts/run.mjs convert_md_to_docx.py plan.md plan-report.docx --tonality report
node .grok/skills/lit-docx/scripts/run.mjs convert_md_to_docx.py plan.md plan-brief.docx --tonality brief
node .grok/skills/lit-docx/scripts/run.mjs docx_gate.py plan-report.docx --source plan.md --layout --compare plan-brief.docx
```

`--compare` fails `tonality.structure` when two files differ in fewer than three of six features: title block, summary form, heading numbering, component set, running head, contents list. Show the first pages side by side, name what each version is good for, and let the user pick. Never compare more than three; the fourth option is always noise.

## Publisher profiles

A request that names a journal or a publisher style (Elsevier, ACS, IEEE, Nature, or the Korean generic manuscript profile) leaves the tonality system entirely. Use `--publisher <name>`, follow `references/journal_style_spec.md`, and run the gate with `--publisher <name> --kind manuscript`. The Journal tonality is for long-form reading that resembles a paper without being submitted anywhere; do not use it for a real submission, and do not use a publisher profile for an internal white paper.

## Saying it in the reply

One line is enough: the tonality used, the reason in a phrase, and the two alternatives. "Brief로 만들었습니다(결정 요청 한 건, 두 쪽). 분석을 더 길게 보시려면 Report, 예산표 없이 짧게는 Memo로 바꿀 수 있습니다." The direction card, gate JSON and page counts stay in the build notes unless the user asks for them.

## Failure patterns

- Choosing by mood ("this feels formal, use Report") instead of by document type and length.
- Picking Proposal because it has a cover page. The cover is a consequence of the type, not a reason to pick it.
- A Memo stretched to four pages, or a Brief whose first section is one long paragraph, so the ①-④ points never form.
- Adding components because the pack allows them. The budget is a ceiling.
- Asking the user to choose a tonality before showing anything.
- Using Journal for a submission, or a publisher profile for a newsletter.
