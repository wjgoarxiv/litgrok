# Direction step

A deck's look is decided once, before the first slide is written, and it is decided as data: one of
the eight tonality packs in `templates/tonalities/<id>/pack.yaml`. The pack fixes the palette roles,
the type ramp, the title treatments each slide role may take, the layout families the engine will
draw, the cover, section and closing variants, and the density and variance dials. Skipping this
step leaves the engine without a design and the deck without a reason for looking the way it does.

The step produces three things: a direction card in the build log, a `tonality:` line in the deck
frontmatter, and two or three sentences in the reply that name the choice and two alternatives. A
bare request (`lit 발표자료 만들어줘`, "make me a deck on X") asks the user nothing. The skill
infers what it needs, writes the inference on the card, and lets the user correct it afterwards.

## What to settle first

Write down four facts. Take them from the brief when it says them and infer them from the request
and the sources when it does not.

| Fact | Question it answers | Typical inference |
|---|---|---|
| Deck type | What job does the deck do? | "투자 유치" → pitch; "분기 실적" → business review; "주간 보고" → status update |
| Setting | Who looks at it, where, for how long? | a board at a desk, a hall with a stage screen, a class reviewing the file later |
| Delivery | Presented live, read alone, or both? | "미리 배포", "보고서형", "circulate" → read; "keynote", "demo day" → presented |
| Language | Korean, English or mixed? | the language of the request, unless the sources or the user say otherwise |

Pretendard Regular and Bold are the only faces this skill ships. Every pack draws with them, so the
direction never depends on a font the machine might lack. Hierarchy comes from size, weight, colour
and placement.

## Candidates by deck type

Start from the row for the deck type. The first name is the default when no signal below moves it.

| Deck type | First choice | Second | Third, and when |
|---|---|---|---|
| Pitch (투자·제안) | signal | studio | atlas, when the product is a physical thing to show |
| Business review (실적 보고) | ledger | gazette, when circulated in Korean before the meeting | night, when shown on a stage screen |
| Research talk (연구 발표) | paper | night, for a keynote hall | chalk, for a tutorial |
| Lecture (강의·교육) | chalk | paper | studio, for a public lecture |
| Data-heavy review (데이터 리뷰) | night | ledger | paper, for a written analysis |
| Image-led (제품·현장·포트폴리오) | atlas | studio | signal, for a launch |
| Korean briefing (보고서형 덱) | gazette | ledger | — |
| Status update (주간·월간 보고) | ledger | gazette | night |

## Count the outline, then reorder

Draft the outline before choosing: one line per slide with its message and the visual it needs (a
table, a chart, a picture, a list, a sequence). Then count. Apply the rows below from top to bottom;
when two packs tie, the deck-type order breaks the tie, so the same outline always yields the same
choice.

| Signal | Fires when | Effect |
|---|---|---|
| User's choice | the brief or an earlier turn names a tonality | use it, still write the card |
| Named template | the brief names an enrolled template such as AZURE-PRO | use that template, offer two tonalities as alternatives |
| Read, not presented | the brief says the file is sent ahead or filed | gazette (Korean) or ledger (any language) moves to first |
| Tables | 30 % or more of content slides hold a table | ledger and gazette up one place |
| Charts | 30 % or more hold a chart | ledger, night and paper up one place |
| Pictures | 30 % or more hold a photo or screenshot | atlas and studio up one place; gazette down one |
| Long bodies | over about 150 Korean glyphs or 300 Latin characters per content slide | gazette and ledger up; signal down |
| Short bodies | under about 40 Korean glyphs or 80 Latin characters per content slide | signal and studio up; density stays 10 |
| Citations | numbered references, DOIs or a references slide | paper up one place |
| Teaching structure | definitions, a formula, or a sequence of three or more steps taught in order | chalk up one place, paper up one |
| Dark room | keynote, stage, demo day | night up one place |
| Coverage gap | a pack has no family for a slide the outline needs | drop that pack |

The coverage row decides more often than it seems. Read `--list-layouts <id>` against the outline:

| Pack | Has no family for |
|---|---|
| ledger | pictures (no image family) |
| signal | agenda, timeline, running text |
| atlas | tables, charts |
| chalk | charts, KPI rows, timelines |
| paper | agenda, KPI rows, timelines, process steps |
| gazette | charts, pictures |
| studio | tables |
| night | tables (KPI rows and charts only), pictures, running text |

A ten-slide deck with four charts cannot be a chalk or gazette deck, however well the rest fits. A
deck with a 2×2 option matrix needs ledger or gazette.

**Worked case.** A Korean monthly status update built from a project tracker, eleven slides. The
type gives ledger, gazette, night. Three of nine content slides hold a table (33 %), so ledger and
gazette each move up one: no change in order. Bodies average 170 glyphs, so the long-body row fires
for both again. The brief says "월간 보고서로 배포", so the read row puts gazette first. The outline
has no chart, which costs gazette nothing. Result: gazette; alternatives ledger and night. Example
`12-status-update-gazette-ko.md` is a deck of this kind.

## The direction card

The card records the decision and why. Fill every field; a build that cannot name its tonality and
its reason stops and asks instead of guessing a look.

```text
Direction card
  Deck type        status update (월간 보고), read before the monthly steering meeting
  Setting          eight executives, on laptops and printed, about ten minutes each
  Language         Korean
  Tonality         gazette        alternatives: ledger, night
  Reason           read rather than presented; 33 % table slides; bodies near 170 glyphs
  Signals          read-not-presented, tables, long bodies
  Dials            density 10, variance 4 (pack defaults)
  Titles by role   content band · data top-rule · data-takeaway side-rail · sequence kicker-numeral
  Families         cover-index, agenda, summary-box-list, ledger-table, table-insight, section-rule,
                   text-column, matrix-2x2, timeline, closing-ask
  Wrong if         the deck is presented to a room; ledger's top titles and KPI rows suit that better
```

The "wrong if" line names the fact that would overturn the choice. A reviewer checks it first. If it
turns out true, rebuild under the alternative it names and update the card.

**Dials.** Density (1-10) and variance (1-10) start at the pack defaults: density 10 in every pack,
variance between 4 (gazette) and 8 (studio). The skill may move either dial by up to 2 on its own and
records the move on the card. A larger move needs the user's word. Lower density to 8 for a deck shown
to a large room; raise variance when the deck is long and its slide jobs repeat. Variance under 4 is
for a user who asks for a uniform deck. Set the dials in the frontmatter (`density: 8`,
`variance: 6`) so the source carries the decision. `density-and-fill.md` says what each step changes.

**Titles and families.** The role-to-title map comes straight from the pack's sheet in
`references/tonalities/`; each outline line gets one family from the pack's own list. The engine may draw a slide under another allowed title when the body fills
better there, and the compile log says so.

## Say it in the reply

Name the tonality, the reason, and the two alternatives in plain words, in the user's language:

> gazette로 만들었습니다. 회의 전에 읽는 월간 보고이고 표가 슬라이드의 3분의 1을 넘어서입니다.
> 발표 화면에 띄운다면 ledger, 어두운 회의실이라면 night도 맞습니다.

> Built in ledger: the deck is a weekly status read on screen, and a third of its slides are tables.
> Gazette fits if it circulates in Korean; night fits a stage screen.

Keep the sentences short. The card stays in the build log; the reply carries only the decision.

## Build log

Write the log beside the source. It is working evidence, delivered only when the user asks for the
audit trail.

```text
deck.md          source, with tonality: in the frontmatter
deck.build.md    direction card, compile output (note:, variety:, fill:, Treatments: lines), gate JSON summary
deck.pptx        compiled deck
```

Compile and gate from the project root:

```bash
node .grok/skills/lit-pptx/scripts/compile-deck.js deck.md --pptx deck.pptx
node .grok/skills/lit-pptx/scripts/run.mjs qa_deck.py deck.pptx
```

The first line of the compile output repeats the direction (`Tonality gazette · density 10 ·
variance 4 · 16:9 compact grid`); paste it into the log under the card.

## Comparing looks

When the user asks to see options, or says the look is open ("어떤 느낌이 좋을지 모르겠어요",
"show me a few styles"), build the cover and the first two content slides under the chosen pack and
the two alternatives. Keep content and order identical; change only the `tonality:` line.

```bash
for t in gazette ledger night; do
  sed "s/^tonality: .*/tonality: $t/" strip.md > "strip-$t.md"
  node .grok/skills/lit-pptx/scripts/compile-deck.js "strip-$t.md" --pptx "strip-$t.pptx"
done
```

If `soffice` is available, convert each strip to PDF and show the three rows of three pages. If it
is not, say the comparison is unrendered and describe each strip from its pack sheet. The user's
pick becomes the card's reason ("chosen from the comparison"); then build the full deck.

## Enrolled templates

The templates in `templates/enrolled/` keep their single fixed look. `--list-tonalities` lists them
as legacy templates after the eight packs. Use one only when the user names it or an existing source
already says `template:`. The card names the template, the reply still offers two tonalities, and
the gate reports its variety and band checks as advisories, because a named template asks for one
look on purpose.

## Mistakes this step prevents

- Choosing by topic ("a startup, so signal") without counting the outline.
- A reply that names one look, or none.
- A reason that restates the deck type instead of naming the signals.
- A pack that cannot draw a slide the outline needs; the compile prints `note: slide N: <family> is
  not a <pack> layout family`, and the fix is another family or another pack.
- Moving a dial by three or more without asking.
- Swapping the tonality after the build without updating the card and the reply.

## Example decks

Twelve complete decks live in `examples/`, each verified to compile and pass the gate under its
pack. Open the one whose deck type and language match the job before drafting. The picture slides name `assets/example-a.png`, `assets/example-b.png` and
`assets/example-c.png`; put real images at those paths, or change the paths, before compiling.

| File | Deck type | Tonality | Alternatives |
|---|---|---|---|
| `01-pitch-signal-ko.md` | pitch | signal | studio, atlas |
| `02-business-review-ledger-ko.md` | business review | ledger | gazette, night |
| `03-research-talk-paper-en.md` | research talk | paper | night, chalk |
| `04-lecture-chalk-ko.md` | lecture | chalk | paper, studio |
| `05-data-review-night-en.md` | data-heavy review | night | ledger, paper |
| `06-image-led-atlas-en.md` | image-led field report | atlas | studio, signal |
| `07-briefing-gazette-ko.md` | Korean briefing | gazette | ledger |
| `08-status-update-ledger-en.md` | status update | ledger | gazette, night |
| `09-pitch-studio-en.md` | pitch for a physical product | studio | signal, atlas |
| `10-image-led-studio-ko.md` | image-led portfolio | studio | atlas, signal |
| `11-business-review-night-en.md` | business review on a stage screen | night | ledger, gazette |
| `12-status-update-gazette-ko.md` | status update, circulated in Korean | gazette | ledger, night |
