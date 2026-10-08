# Page composition

This file describes the page a tonality builds, what the converter already does for you, and what the gate measures, so that a source can be written to land well on A4 the first time. It applies to the six tonalities only; publisher profiles keep their own geometry from `templates/registry.yaml`.

The governing idea is restraint. A printed report earns trust by looking like the work of a careful typesetter: one ink colour for text and headings, quiet steps between heading sizes, tables drawn with three rules, generous but even white space, and furniture that stays out of the way. Most of the craft is in what the page leaves out.

## Page and text block

Every tonality sets A4 portrait. Margins follow the density dial, and the packs ship at density 8 or 9:

| Density | Top | Bottom | Left | Right | Text block width |
|---|---|---|---|---|---|
| 10 | 24 mm | 26 mm | 25 mm | 25 mm | 160 mm |
| 9 (Report, Brief, Manual, Memo, Journal) | 25 mm | 27 mm | 25 mm | 25 mm | 160 mm |
| 8 (Proposal) | 26 mm | 28 mm | 26 mm | 26 mm | 158 mm |
| 6 | 27 mm | 29 mm | 27 mm | 27 mm | 156 mm |

Side margins never fall under 25 mm and the bottom margin is always at least the top. Inside the block the converter works on a 12-column grid with a 4 mm gutter: the Proposal cover title spans 10 columns, its subtitle 9, a third-width sidebar 4, a half-width one 6, the label column of the memo and control blocks 2.

## Measure

At 10.5 pt Pretendard on a 160 mm block a Korean line holds about 43 syllables, close to the upper edge of comfortable reading; the prose lint reports this as an `OF-301` advisory, which is expected and not a failure. English lines run to roughly 90 characters at 10.5 pt, which is why Memo and Proposal set English body text at 11 pt and why Journal splits the block into two columns of about 77 mm with a 6 mm gap (around 50 characters each in Times New Roman). Do not try to shorten the measure by narrowing tables or adding columns; write shorter paragraphs instead.

## Type sizes

Body text is 10.5 pt in every pack, 11 pt for English in Memo and Proposal; the readable floor is 10.5 pt. Headings step up by about 1.2 times and never exceed 1.5 times the body:

| Pack | Title | h1 | h2 | h3 | Tables | Notes and sources | Running head |
|---|---|---|---|---|---|---|---|
| Report | 26.5 | 14.5 | 12.5 | 10.5 bold | 9.5 | 9 | 8.5 |
| Brief | 26.5 | 13.5 | 12 | 10.5 bold | 9.5 | 9 | 8.5 |
| Manual | 26.5 | 14 | 12 | 10.5 bold | 9.5 | 9 | 8.5 |
| Proposal (ko / en) | 28.5 / 29.5 | 14.5 / 15.5 | 12.5 / 13 | body bold | 9.5 / 10 | 9 / 9.5 | 8.5 / 9 |
| Memo (ko / en) | 19 / 20 | 12.5 / 13 | 11.5 / 12 | body bold | 9.5 / 10 | 9 / 9.5 | 8.5 / 9 |
| Journal | 26.5 | 13.5 | 12 | 10.5 bold | 9.5 | 9 | 8.5 |

Sizes are in points. All headings are near-black ink (#1A1A1A); levels are told apart by size, weight and the space above them, never by colour. Use at most three heading levels. Each heading keeps with the paragraph after it, and a short first paragraph keeps with the one after that, so a heading always carries at least two lines of its section.

## Leading

Leading is set by measurement, not by Word's "single" label. A single line of Pretendard is not 1.0 em: on rendered pages it measured 1.55 em in Word and 1.51 em in LibreOffice, so the engine uses 1.53 em. Times New Roman's single line is about 1.15 em. The target pitch (baseline to baseline over the type size) depends on script and density:

| Density | Hangul pitch | Latin pitch |
|---|---|---|
| 8 to 10 | 175 % | 133 % |
| 5 to 7 | 180 % | 137 % |
| 1 to 4 | 185 % | 140 % |

The Word multiple written into the file is the pitch divided by the face's single line: 1.75 / 1.53 = 1.144 for Korean text, 1.33 / 1.53 = 0.869 for English in Pretendard, 1.33 / 1.15 = 1.157 for Journal's Times body. If you ever measure a render, compare baseline distances, not the number in Word's paragraph dialog. Paragraphs are separated by space after, never by space and a first-line indent together.

## Alignment and Korean line breaking

Korean body text is justified in Report, Brief, Memo and Proposal; English body text stays ragged right everywhere, and Journal and Manual are ragged in both languages. Every paragraph carries the Korean line-breaking settings (word wrap and kinsoku on, the language marked ko-KR), so Microsoft Word breaks Hangul between words (어절) and keeps closing punctuation off the start of a line. LibreOffice ignores the word-wrap setting and breaks Hangul body text between syllables; a LibreOffice preview therefore shows breaks a Word reader will not see. Titles and headings do not depend on the renderer: the converter breaks them between words itself, into at most three lines kept as even as the words allow, and steps the size down if a word would not fit or a fourth line would be needed. The gate fails `heading.wrap` and `title.lines` if that ever goes wrong.

Hangul is never set in italic; emphasis is bold. Korean lists use a plain dash, and a list of one item loses its bullet.

## Headings and numbering

| Scheme | Used by | Form |
|---|---|---|
| Korean institute order | Report in Korean | Ⅰ. 요약 / 1. 설치 규모 / 가. 세부 항목, one space after the number |
| Decimal | Report in English, Manual, Journal | 1 / 1.1 / 1.1.1, hung so the heading texts of a level line up |
| None | Brief, Proposal, Memo | Brief opens each section under a full-width hairline |

Numbers are added by the converter; never type them into the Markdown heading. A heading whose parent level is missing stays unnumbered, and back matter (References, 참고문헌, Acknowledgements, 감사의 글) is never numbered. Open the document with a `#` heading and never skip a level downward (`heading.order`). Cross-references in the text ("4장의 조치", "Section 3.3") must match the numbers the converter will assign, so count them before writing.

## Tables

Every data table is booktabs: a 1 pt rule above and below, 0.5 pt under the header row, no vertical rules, no fills, no zebra stripes. The header is bold ink; a row starting with 합계, 총계, 소계, 계, Total or Sum is bold under its own 0.5 pt rule. Numeric columns are right-aligned in tabular figures, and no column is narrower than its longest word. A text column that wraps while the other columns hold their longest cell with room to spare takes that room, so it wraps onto fewer lines. Negative figures take the minus sign (−), never a hyphen, in Korean tables too. A sentence right above a table without a caption keeps 6 pt under itself so the header rule never touches it; a component box under a paragraph stands 6 pt clear in the same way. Under a publisher profile the paragraph after a table stands three quarters of a body line clear.

- Caption above, as a plain line: `표 1. 제목 (예시)` becomes `<표 1> 제목 (예시)`; `Table 1. Title (sample)` keeps `Table 1.` bold.
- Units: in Korean tables, when every header cell after the first ends in the same unit in brackets (`2025 (억 원)`, `2026 (억 원)`), the unit moves to one `(단위: 억 원)` line right-aligned above the table. Mixed units stay in their headers.
- Sources and notes under the table: `주:` first, then `자료:` in Korean; `Note:` then `Source:` in English. They keep with the table.
- Wide tables in Journal: a table of more than three columns is set across both columns with its caption; narrower tables take one column's width.

A table that fits on one page is kept whole with its caption. In a tonality run a long table (a header and six or more body rows) may break between rows, repeating its header, when moving it whole would leave the page under 0.75 filled; at least three body rows stand on each side. Plan tables so most fit in half a page; split a fifteen-row table into two tables with their own captions rather than relying on the break.

## Figures

The examples in this skill carry no pictures, but a figure the user supplies is sized to the text width and capped in height by the pack (0.40 of the frame in Brief, Memo and Journal, 0.45 in Report and Manual, 0.60 in Proposal). The paragraph holding it is single spaced so the image is never clipped. Korean figure captions read `[그림 1] 제목`, English `Figure 1. Title`; the caption stays on the figure's page (`figure.split`).

## Page 1 and covers

Five of the six tonalities open with a title block on page 1 and the body directly below it. Only Proposal has a cover page, and it is typographic: kicker, the title left-aligned in the upper third, one short rule in the accent, subtitle and lead, with the byline, date and notice at the foot. No colour block, no tiles, no photograph. The gate fails `cover.block` if filled shapes cover more than a quarter of a cover page.

The sample-data notice from frontmatter `notice:` appears once: in the title block, or at the foot of the cover. It is never repeated in headers.

Report and Manual add a short contents list (each h1, dotted leader, page number) after the title block when the source is long enough for about five pages.

## Running heads and folios

Furniture is set at about 82 % of the body size, regular weight, in the muted ink (#555555). No running head or folio appears on page 1 of a title-block document or on a cover page.

| Pack | Header | Footer |
|---|---|---|
| Report | none | short title left, folio right |
| Brief | none | folio right |
| Manual | short title | folio right |
| Proposal | none | folio centred, body numbered from 1 after the cover |
| Memo | none | folio right |
| Journal | short title left, folio right | none |

The running title comes from `short_title:`; without it the title is cut at about 40 characters on a word boundary. Give every document over two pages a `short_title`.

## Page fill and splits

The gate renders the document and measures each page.

- `fill.page`: every body page except the cover and the last is filled to at least 0.35 of its frame. Medians around 0.8 are normal.
- `heading.stranded`: no page ends on a heading.
- `table.split` and `figure.split`: as above; component boxes never split.
- `page.spill`: a two-page document fills its second page to at least 0.4 of the frame, and no document ends on a page filled under an eighth. A source of about one page by the converter's estimate is set with tight spacing in any tonality, as a memo is, so a page of text does not spill a few lines over; a closing paragraph of up to about four lines keeps the block before it company.
- `list.split`: a list of up to six items stands on one page and in one column. The converter keeps every item but the last with the next, and a lead-in of a line or two right before the list with the list; a publisher run does the same. In a two-column body a list of five or six items may break once: the lead-in keeps with the first two items and the last two items stay together, so the block no longer jumps to the next column and leaves a third of a column empty.
- `heading.column`: in a two-column body a heading never ends a column while its first lines open the next one. A `Source:` or `자료:` line under a page-wide table spans the page with the table, so the column section after it opens with the heading and its text.
- `columns.balance`: in a two-column body no column stops more than a quarter of the frame short (under 0.75) beside one that runs to the foot, and the last page sets its two columns to about the same depth. The converter ends the column body with a continuous section break, which balances the last page.
- The last section of a single-column document, when it has no table or picture and comes to about twelve lines or fewer, keeps whole: its paragraph goes to the last page with its list instead of leaving the list and a closing line alone there.
- `heading.apart`: a heading whose short lead sentence opens a table of up to eight body rows stands on the page where the table starts. The converter keeps the heading, the sentence, any caption or units line and the table together in a single-column body.
- A section that opens under a hairline right after a ruled box draws no second rule; the box's own bottom rule parts the two.
- A final page holding two or three lines is legal but looks careless. When the last page is under about 0.15, trim a sentence or two, or merge a short closing paragraph upward; when a page in the middle is short because a table jumped, move the table below the paragraph that follows it or shorten the table.

The converter never forces a page break before a heading, so short pages come from blocks that refuse to split. The fix is always in the source: shorter tables, a paragraph moved, a component dropped.

## Numbers and dates on the page

Write Korean dates as `2026. 10. 5.` or `2026년 10월 5일`, never in ISO form; the gate fails `date.iso` on a Korean document that still holds one. A date at the start of a line would read as a numbered list, so start the line with a word. Keep one unit-spacing style per document (`312MWh` or `312 MWh`, not both), use `~` or an en dash for ranges, and avoid a spaced hyphen in prose, which the lint reads as a dash.

## Colour

One accent per pack at most (Report #1F3A5F, Brief #2D5A47, Manual #2E4A66, Proposal #6E2639; Memo and Journal none), on at most two element kinds: the title rule and the callout rules in Report, Brief and Proposal, the callout and sidebar rules in Manual. Everything else is ink and two greys. The gate fails `color.accent-kinds`, `heading.ink`, `table.fill` and `furniture.chip` when a document breaks this, which only happens if the source or a template is edited by hand.
