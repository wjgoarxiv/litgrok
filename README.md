<p align="center"><picture><source media="(prefers-reduced-motion: reduce)" srcset="./docs/assets/cover-motion-still.webp" /><source media="(prefers-reduced-motion: no-preference)" srcset="./docs/assets/cover-motion.webp" /><img src="./docs/assets/cover-motion.webp" width="100%" alt="LitFamily motion cover: seven armored robots power on one by one, the LitGrok robot wakes with glowing eyes and a lit frame, then LITFAMILY and KEEP THE WORK LIT. light up." /></picture></p>

<div align="center"><table>
<tr><th colspan="2">LitGrok Bot · the Grok Bot cover</th></tr>
<tr><td align="center" width="240"><picture><source media="(prefers-reduced-motion: reduce)" srcset="./docs/assets/readme/mascot-still.webp" /><source media="(prefers-reduced-motion: no-preference)" srcset="./docs/assets/readme/mascot.webp" /><img src="./docs/assets/readme/mascot.webp" width="220" alt="LitGrok mascot loop: a round plum character with two slanted cream eyes that glow amber when lit walks the lit loop in quick beats. It blinks while idle, glances up to plan, narrows its eyes as a small orange flame pops on its head during work, squints to review, and hops with happy eyes and a bigger flame when the work is done." /></picture></td><td>This round fellow is the cover for Grok Bot. It runs the lit loop in quick beats: it blinks while idle, glances up to plan, lights a small flame to work, squints to review and hops when the work is done.<br /><br />LitGrok brings the same skills into Grok Bot through Cursor. <a href="#use-litgrok-in-grok-bot-and-cursor">Use LitGrok in Grok Bot →</a></td></tr>
</table></div>

<h1 align="center">LitGrok</h1>
<p align="center"><strong>Keep the work lit.</strong></p>
<p align="center">Skills, a project rule and hooks that help xAI's Grok Build plan the work, build it, check it, and leave a handoff the next session can pick up.</p>

<p align="center">
<a href="https://www.npmjs.com/package/@litfamily/litgrok"><img src="https://img.shields.io/npm/v/@litfamily/litgrok?color=FF6337&amp;label=npm" alt="npm version" /></a>
<a href="https://www.npmjs.com/package/@litfamily/litgrok"><img src="https://img.shields.io/npm/dm/@litfamily/litgrok?color=D7F75B" alt="npm downloads per month" /></a>
<a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
<a href="https://github.com/wjgoarxiv/litgrok/stargazers"><img src="https://img.shields.io/github/stars/wjgoarxiv/litgrok?style=flat" alt="GitHub stars" /></a>
</p>

Start a Grok Build prompt with `lit` and the session follows a routine: it writes the test before the fix, checks the
real result, and says plainly what it could not check. Ask for a handoff when you stop, and tomorrow's session opens on
the note where today's ended.

Grok Build still runs the session and picks the model. LitGrok adds the way of working, as plain files in your
project's `.grok/` folder.

> [!TIP]
> Install into one project with the line under [Install in 30 seconds](#install-in-30-seconds), follow
> [Quick start](#quick-start), then hand Grok one task: `lit fix the date parsing bug in src/dates.js, with a test`.

<p align="center"><a href="#install-in-30-seconds">Install</a> &nbsp; <a href="#quick-start">Quick start</a> &nbsp; <a href="#what-you-can-make">Showcase</a> &nbsp; <a href="./docs/guide.md"><img src="./docs/assets/readme/lucide-book-open.svg" width="16" alt="" /> Guide</a> &nbsp; <a href="./docs/skills.md">Skills</a> &nbsp; <a href="./docs/guide.md#watch-it-in-motion"><img src="./docs/assets/readme/lucide-play.svg" width="16" alt="" /> Film</a> &nbsp; <a href="./docs/guide.md#safety-and-uninstall"><img src="./docs/assets/readme/lucide-shield-check.svg" width="16" alt="" /> Safety</a> &nbsp; <a href="./docs/reference.md">Reference</a> &nbsp; <a href="./README_ko-KR.md">한국어</a></p>

<!-- demo-gif --><p align="center"><img src="./docs/assets/demo.webp" width="960" alt="A short film of a real Grok Build session in a small Node project, in seven steps. 1, the request starts with lit: lit add a --shout flag that prints the greeting in capitals, with a test. 2, LitGrok lights up: the status line reads [LIT v1.0.16] LIT IGNITED · litwork. 3, it reads its playbook, the project guidance and the code-change skill, and shows Read 2 skills. 4, the test is written first, before greet.js changes. 5, then the fix, checked: the pre_tool_use and post_tool_use hooks tick on each edit. 6, real tests: Re-run tests and check the shout CLI. 7, done, with evidence: node greet.js --shout Ada now prints HELLO, ADA!, and the status line reads litwork complete · 35s · 2 tools." /></p>

<details>
<summary>Why LitGrok, and who it suits</summary>

Grok Build is quick to start: you type a line and it gets to work. The trouble comes later. A long session fills its
context and gets compacted, the next session starts without what the last one knew, and "done" often just means the
model said so, so you end up explaining again where you were and checking by hand what actually works.

LitGrok gives each session a routine to follow. A bigger change gets a written plan before the first edit, the work is
checked against that plan, and anything nobody could check is marked as unverified. Before you stop, a handoff file
records what was built, what was checked and what is left, so the next session can read it and carry on.

It suits Grok Build work that runs longer than one sitting: a feature spread over a few days, a bug you want a test to
prove fixed, a refactor you want reviewed before it merges. It also builds editable slide decks and Word reports, draws
diagrams and equipment schematics, and cleans up stiff English or Korean prose. LitGrok itself needs no account or
sign-in.

The film above is one real session: you type the first line, the hooks answer with the second, and the status row walks
the third as the work happens. Stripped down to three lines, it goes like this:

```text
you typed   lit add a --shout flag that prints the greeting in capitals, with a test
it did      wrote the test first, changed greet.js, re-ran the tests and the CLI
it ended    node greet.js --shout Ada prints HELLO, ADA!   litwork complete · 35s · 2 tools
```

</details>

## Pick your path

| I want to… | Do this | Go to |
| --- | --- | --- |
| Try it in one project | Run one install line | [Install in 30 seconds](#install-in-30-seconds) |
| Run a first task | Restart, trust the hooks, send `/litwork` | [Quick start](#quick-start) |
| See real outputs | Drawings, decks, documents and pages | [What you can make](#what-you-can-make) |
| Pick the right route | Plan, build, review, research, brief | [What you get](#what-you-get) |
| Keep work across a compaction | Turn on automatic handoff | [Automatic handoff](#automatic-handoff) |
| Use it in Grok Bot | Add the Cursor marketplace | [Use LitGrok in Grok Bot and Cursor](#use-litgrok-in-grok-bot-and-cursor) |
| Make decks, documents or figures | Install an extension | [Extensions](#extensions) |
| Update or remove LitGrok | `doctor`, `install`, `uninstall` | [Requirements, update and uninstall](#requirements-update-and-uninstall) |

## Install in 30 seconds

You need Node.js and Grok Build. Run from the project you want to try, in an interactive terminal:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok install
```

The installer copies LitGrok's skills, agents, project rule and hooks into `<project>/.grok/` and changes nothing else.
Its install receipt should read `Status: Ready` and names the two steps only you can take, which
[Quick start](#quick-start) step 1 covers. Running the same command later updates LitGrok.

| Switch | What it does | When to use it |
| --- | --- | --- |
| `--dry-run` | Prints every destination and writes nothing | You want to look first |
| `--user` | Installs under `~/.grok/`, so the skills and rule are in every project | You want LitGrok everywhere |
| `--status-line`, added to `--user` | Adds the LIT status row | Grok reads the row only from user settings |
| `--package @litfamily/litgrok@1.0.35` in place of `@latest` | Pins this release | A team wants everyone on the same files |

<details>
<summary>Where the same package can live: this project, your user account or Grok Bot</summary>

| Place | How you add it | Where it lives |
| --- | --- | --- |
| Grok Build, this project | The [install line](#install-in-30-seconds) | `<project>/.grok/` |
| Grok Build, your user account | `litgrok install --user`, with `--status-line` for the status row | `~/.grok/` |
| Grok Bot, through Cursor | Add Marketplace, From GitHub Repository, then Connect apps | `.cursor-plugin/plugin.json` in this repository |

[Every install option, local packages and the safety checks](./docs/guide.md#install-options).

</details>

### What the install writes, and what it leaves to you

After gathering its files from the package, the installer checks that every folder on the way into `.grok/` is real
and compares each file with `.litgrok-install-manifest.json`, the hashes kept from the last install. A new file is
written, and LitGrok's own unchanged file is replaced or, when current, left alone. A file you edited stops the run
before anything is written, and the installer names it.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./docs/assets/readme/diagrams/installer.en.dark.png" /><img src="./docs/assets/readme/diagrams/installer.en.light.png" width="960" alt="Flowchart titled What litgrok install writes, and what it leaves to you. litgrok install (add --dry-run to look first) runs PAYLOAD (skills, agents, rules, hooks from the package's .grok/), then SAFETY (every folder on the path is real, a symlink is refused), then OWNERSHIP, which compares each file with the manifest. Not there yet leads to Written. LitGrok's, unchanged leads to Replaced or left alone. Changed since install leads to Stops before writing, with the message Refusing to overwrite different existing file: path. Written and replaced files go to WRITE, then the receipt: Status: Ready, with .litgrok-install-manifest.json recording each file's hash. A side card says it writes to project/.grok/ by default and to ~/.grok/ with --user. Next: restart Grok Build leads to two steps the installer leaves to you: open Grok Build from the Git root (in a plain folder, run git init yourself) and trust the hooks with /hooks-trust, since project hooks stay off until you do. The installer never runs git init or changes trust." /></picture></p>

The last two boxes are where people trip: the installer leaves both to you, and until you do them the skills and the
rule work while the hooks wait. [Quick start](#quick-start) step 1 walks through them.

### Let a coding agent install it

Open the agent in the project folder and paste the prompt below. It asks the agent to show you its plan and wait for
your yes, to use only the official npm package, and to check the result before it reports back.

<details>
<summary>The install prompt for a coding agent</summary>

An agent's shell has no terminal attached, which is why the install lines carry `--yes` and clear `NO_COLOR` and `CI`;
without that the installer only previews.

```text
Install LitGrok, the skill pack for xAI's Grok Build, into this project.
Use only the official npm package @litfamily/litgrok. Do not clone repositories, run other install scripts or use any other package.
Before you change anything, show me your plan and wait for my yes.

1. Check that Node.js and Grok Build are installed and that this folder is the project's Git root. If it is not a Git repository, ask me before running git init.
2. Preview the install and show me where the files would go:
   npm exec --yes --package @litfamily/litgrok@latest -- litgrok install --dry-run
3. Install. Your shell has no terminal, so pass --yes and clear NO_COLOR and CI, or the installer only previews:
   env -u NO_COLOR -u CI npm exec --yes --package @litfamily/litgrok@latest -- litgrok install --yes
4. Ask me whether I also want the LitGrok status row. It is a user install: it copies LitGrok into ~/.grok/ and adds a status line to ~/.grok/config.toml after backing it up. Only if I say yes, run:
   env -u NO_COLOR -u CI npm exec --yes --package @litfamily/litgrok@latest -- litgrok install --user --status-line --yes
5. Verify: the install receipt says "Status: Ready", and the project now has .grok/skills, .grok/rules and .grok/hooks. If the output says "no files written", tell me the reason printed on that line instead of trying other flags.
6. Report what was written and where, anything the installer refused, and anything you could not check. Then remind me to restart Grok Build from the project's Git root and to trust the hooks with /hooks-trust.
```

</details>

## Quick start

1. Open (or restart) Grok Build from the project's Git root. In a plain folder, run `git init`
   yourself first: without a Git root the skills and rules load, but the hooks stay off. Grok
   runs project hooks only after you trust them, so review and trust them in `/hooks-trust`.
   [Other ways to trust them, and what to check when hooks don't show up](./docs/guide.md#hooks-do-not-show-up).
2. Check that `/skills` lists the LitGrok skills and `/hooks` lists the hook registrations.
3. Send a small first task that needs no external service:

```text
/litwork Build a to-do list in one index.html with no external dependencies. Implement add, complete, and delete. Leave the checks performed and the next step. Do not open a browser automatically; give me the steps to check it myself.
```

4. Open `index.html` yourself and add, complete and delete an item. That click-through is the real test, and anything
   you didn't get to try stays marked unverified.

When the hooks are loaded, a new session opens with the LIT mark and the line `LitGrok payload present: skills, project
rules, hooks, and the npx installer.` The reply to `/litwork` is asked to open with 🔥 **LIT IGNITED · litwork** 🔥, work
through the checklist, and end with what it checked and what comes next.
[Pictures of what LitGrok prints](./docs/guide.md#what-you-will-see-on-screen).

You can also begin a message with plain `lit` and describe the task. The project rule asks Grok Build to pick the
matching skill, and your session shows which one it picked. Before you stop for the day, ask for a handoff:

```text
/lit-handoff Record what we built, what we checked, and what remains. Tell me where you saved the handoff.
```

In the next session, give Grok Build the path it returned and ask it to read the handoff and check the current files
before continuing. A new Git project keeps it at `.handoff/HANDOFF.md`.
[Where handoffs go](./.grok/skills/lit-handoff/SKILL.md).

## What you can make

Every picture below is real output from LitGrok with its [extensions](#extensions) installed; all but the `lit adhd`
brief come from extension skills. A prompt under a picture produced it in a Grok Build session; otherwise the skill's own
engine made it from a bundled example that the caption names. None is a mock-up, so the same request gets you the same kind of result.

### Draw it

Each drawing comes from the skill that knows its rules, and every one passed that skill's QA script before export.

- **`lit-diagram-drawer`** draws concept and technical diagrams (architectures, flows, sequences, timelines); an
  architecture gets a trust boundary and numbered flows.
- **`lit-schematic`** draws real equipment as editable SVG with PDF and a 600 dpi PNG: a P&ID with ISA-5.1 tags, control
  loops and a title block, an equipment layout, an isometric cutaway with material colours and leader labels, or a
  journal figure of an experimental setup.

<table>
<tr><td width="50%" valign="top"><img src="./docs/assets/showcase/pid.webp" width="400" alt="A3 P&amp;ID of a hypochlorite dosing skid: tank, duty and standby metering pumps, relief valve, instruments and control loop, title block at the bottom." /><br /><b>lit-schematic · P&amp;ID</b><br /><sub>Built from the skill&#39;s bundled worked example <code>pid-dosing-skid</code> by its own kit; the QA gate passed.</sub></td><td width="50%" valign="top"><img src="./docs/assets/showcase/schematic-iso-heat-exchanger.webp" width="400" alt="Isometric cutaway of a blue shell-and-tube heat exchanger on green saddle supports, the shell opened to show copper tubes and grey segmental baffles, with leader labels for the inlets, tube bundle, channel flange, shell, baffle and saddle support." /><br /><b>lit-schematic · isometric cutaway</b><br /><sub>From the bundled example <code>iso-heat-exchanger</code>; QA passed on the SVG and on the 600 dpi PNG and PDF exports.</sub></td></tr>
<tr><td width="50%" valign="top"><img src="./docs/assets/showcase/schematic-journal-adsorption-rig.webp" width="400" alt="Two-panel journal figure: (a) a flow diagram of CO2/N2 and He cylinders feeding mass-flow controllers into an adsorption column in an oven, with a back-pressure valve, a pressure transmitter and a mass spectrometer; (b) an isometric glass column packed with adsorbent, with thermocouples, glass wool, a feed inlet and a line to the MS." /><br /><b>lit-schematic · journal apparatus figure</b><br /><sub>From the bundled example <code>journal-adsorption-rig</code>; QA passed.</sub></td><td width="50%" valign="top"><img src="./docs/assets/showcase/diagram-architecture.webp" width="400" alt="Light-theme Korean architecture diagram: a mobile app request enters a trust boundary through an API gateway and flows through auth, order, database, event queue, worker, inventory, audit log and payment adapter boxes out to an external payment provider." /><br /><b>lit-diagram-drawer · service architecture</b><br /><sub>From the bundled example <code>01-service-architecture</code>, exported by the skill&#39;s own script; the diagram, type and brief checks passed.</sub></td></tr>
</table>

### Present it

`lit-pptx` picks one of thirteen tonalities for the audience, then compiles native, editable charts, KPI rows and
tables with Pretendard embedded. Its deck QA checks the result before you get it.

<table>
<tr><td width="50%" valign="top"><img src="./docs/assets/showcase/deck-newsroom.webp" width="400" alt="Contact sheet of ten off-white Korean newsroom-style slides with rust-orange accents, briefing residents on district housing prices and moving plans: a headline KPI cover, an agenda, a line chart, a bar chart with stat cards, a horizontal bar chart, a neighbourhood table, a timeline and a sources page." /><br /><b>lit-pptx · newsroom, Korean public briefing</b><br /><sub>From the bundled example <code>17-public-data-briefing-newsroom-ko.md</code>; the deck QA passed.</sub></td><td width="50%" valign="top"><img src="./docs/assets/showcase/deck-night.webp" width="400" alt="Contact sheet of ten dark navy slides with amber accents from a Q3 mobile banking app data review: a KPI title slide, line and bar charts, a retention cohort table, a section divider, metric definitions, an Android and iOS comparison and a Q4 release timeline." /><br /><b>lit-pptx · night, data review</b><br /><sub>From the bundled example <code>05-data-review-night-en.md</code>; the deck QA passed.</sub></td></tr>
<tr><td width="50%" valign="top"><img src="./docs/assets/showcase/deck.webp" width="400" alt="A lit-pptx slide: completed this week and planned for week 41, two columns of numbered items, and a sample-data footer." /><br /><b>lit-pptx · status deck</b><br /><sub>Built from the skill&#39;s bundled sample report by its own converter; the layout gate passed.</sub></td></tr>
</table>

### Write it

`lit-docx` writes a Word file you can keep editing, in one of six restrained tonalities: a cover or title block, key
figures, ruled tables and numbered sections. It leaves the Markdown source beside the file, renders the pages and
runs a layout gate before handing it over. The reply names the tonality, the reason and two alternatives you can switch
to with one word.

<table>
<tr><td width="50%" valign="top"><img src="./docs/assets/showcase/docx-report.webp" width="400" alt="The first three pages of a Korean Word report on the first year of a rooftop solar installation: a bold title block, a key-figure strip, section headings and ruled data tables." /><br /><b>lit-docx · Korean report, Report tonality</b><br /><sub>From the bundled example <code>01-report-ko.md</code> by the skill&#39;s own converter; the layout gate passed.</sub></td><td width="50%" valign="top"><img src="./docs/assets/showcase/docx-proposal.webp" width="400" alt="The first three pages of a Korean Word proposal for a bicycle-commuting support pilot: a cover page, a summary with three key figures, body sections, a schedule table and a budget table." /><br /><b>lit-docx · Korean proposal, Proposal tonality</b><br /><sub>From the bundled example <code>04-proposal-ko.md</code>; the layout gate passed.</sub></td></tr>
</table>

### Build it and keep track of it

`frontend-ui-ux` builds a page from a brief and then checks it at several widths. Beside it is the brief `lit adhd`
prints when work has spread over several sessions.

<table>
<tr><td width="50%" valign="top"><img src="./docs/assets/showcase/page.webp" width="400" alt="Landing page built by frontend-ui-ux: hero with install command, how-it-works steps, pricing tiers and FAQ, shown at phone width with no sideways scroll." /><br /><b>frontend-ui-ux · landing page</b><br /><sub>Built from a plain brief; the probe renders it at seven views and checks overflow, contrast and motion.</sub></td><td width="50%" valign="top"><img src="./docs/assets/showcase/brief.webp" width="400" alt="Terminal showing the lit-adhd brief: one headline session, one ended session in a table, a roadmap with checkmarks, and a boxed recommended next step." /><br /><b>lit-adhd · the brief</b><br /><code>lit adhd</code></td></tr>
</table>

Prompts like these reach the extension skills above:

```text
/lit-pptx A six-slide update on this quarter's support tickets for Monday's team meeting.
lit write a two-page proposal for the new onboarding flow, as a Word file
lit draw a P&ID of a hypochlorite dosing skid with duty and standby pumps
lit 논문용 흡착 실험 장치 모식도 그려줘
```

## What you get

It ships 42 skills, 11 agents, one project rule, and twelve hook registrations, and most days you type a handful of
the routes below.

| Type this | What happens |
| --- | --- |
| `/litwork` | Turns a bounded task into a checklist, recording each check and the next step. |
| `handoff` or `/lit-handoff` | Carries the checked result and the next step into another session. |
| `/lit-brainstorm` | Opens a question into many options and a short list to pick from. |
| `/lit-plan` | Writes a plan file of numbered rows with checks, and edits nothing yet. |
| `/start-work <approved-plan>` | Runs the plan you approved row by row, ticking a row once its checks pass. |
| `/review-work` | Reviews a plan before work or a change after it, and changes no files. |
| `/litresearch` | Runs bounded research that ties every claim to a source. |
| `lit hijack <source> into <skill>` | Brings a technique you read about into your own skill, without copying the text. |
| `/lit-humanizer <file>` | Rewrites stiff English or Korean prose and keeps the facts. |
| `lit adhd` | Briefs every recent session on one read-only board; `go` takes its next step. |

[All 42 skills, with a picture of what each one gives you](./docs/skills.md).

Paste one into Grok Build to try a route:

```text
/litwork Fix the date parsing bug in src/dates.js and add a test that fails without the fix.
/lit-plan Add CSV export to the reports page, with tests.
/start-work <the plan path it printed>
/review-work the changes on this branch
/litresearch Which SQLite settings matter most for write speed in a small web app? Cite your sources.
lit hijack https://example.com/post and docs/paper.pdf into .grok/skills/lit-humanizer
/lit-humanizer docs/intro.md
lit adhd
go
```

<details>
<summary>How each route works</summary>

- **`/litwork`** follows its checklist to the end, so you can see what was done and what was only assumed.
- **`/lit-plan` and `/start-work`** suit a larger change: you read and approve the plan before `/start-work` runs it.
- **`/review-work`** picks the mode from what exists: a branch, a diff or ticked plan rows mean the change, and a plan
  with no ticked rows means the plan. `/review-work plan` or `/review-work work` forces one. A change goes through six
  read-only lanes, the findings are ranked by the evidence behind each one, and fixing is a separate step.
- **`/litresearch`** keeps the question bounded and says plainly when the evidence is thin, without overstating it.
- **`lit hijack`** is for a post, an article or a repository that does something your own skill does not. It records
  where each source came from, checks what its licence allows, writes a spec in its own words, has the change built
  through `lit-plan` and `start-work`, and proves it on the real surface against a baseline that cannot see the new
  work. The report says what was taken, what was left and why.
- **`lit adhd`** (or `lit rewind`) is for after a day of several sessions and interruptions: it reads every recent agent
  session of this repository and prints one board, changing nothing. If the step it suggests is what you want, type
  `go` and the session takes it; `lit adhd detail` adds one card per session under the board.
- **The board** shows the one thing to do now and what to type; how much is done, in progress, waiting on you and left;
  each plan as a milestone with a progress bar; what you finished lately and what is still to do; and a short list of
  things not to forget, such as a session waiting on your answer, uncommitted changes or a plan that stalled.

</details>

## The LIT status row

While you work, Grok can keep one LitGrok line at the bottom of the screen, so you can follow the session without
scrolling back through it. It is optional and lives in your user settings, so you switch it on with a user install
(`litgrok install --user --status-line`).

Until a prompt names a LitGrok skill, the row stays a single quiet line with the model and its effort, how much of the
context is used, the session's cost and the Git branch. Once a prompt starts a skill, here `/litwork`, it grows into a
small LIT card. Read it from top to bottom:

- **Title:** the skill, the tool calls and subagents so far, and whether the turn is running (with its time), just
  finished, or needs you.
- **Map:** the stages of the work, such as `plan ✓ ━━━━ [work 3/7] ━━━━ review · ──── done ·`; stages behind you carry a
  tick, and the one you are in is lit with the plan tasks checked so far.
- **Line under the map:** the next open task, the tool running right now and for how long, and how the last test run went.
- **Last line:** the model, the context gauge, the cost and the branch.

When the turn ends, the card folds back into the single line and keeps where the work got to. It turns yellow when
something needs you: a planning turn that has not saved its plan, a handoff request, or a context close to your handoff
percent.

Add `--notify` to the same install command if you also want Grok's terminal notification each time a turn finishes,
even while you are watching. Both stay off until you ask for them.
[Pictures of the row idle and at work, and the switches for colour and glyphs](./docs/guide.md#what-you-will-see-on-screen).

## Automatic handoff

A long session slowly fills Grok's context window. When it is nearly full, Grok compacts the conversation, and the details of what you were in the middle of get squeezed out. Automatic handoff has the model write its handoff while it still remembers everything, so after the compaction it can pick up exactly where it was.

- **Off until you ask.** It stays off until you turn it on, and the percent is always your choice.
- **One project at a time.** The setting lives in that project's `.grok/litgrok/auto-handoff.json`.
- **Status row first.** Grok shares how full the context is with the status row and with no hook, so add [the row](#the-lit-status-row) first; it lives in your user settings and only needs doing once.
- **Trusted hooks.** The Stop hook that does the asking is a project hook like the others, so it runs in a trusted Git root (`/hooks-trust`).

Run it inside the project; from a subfolder it finds the Git root on its own:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok auto-handoff on 60
```

`auto-handoff status` then reads the setting back, says where each part of it came from, and warns you about anything that would keep it from working.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./docs/assets/auto-handoff/auto-handoff-on-dark.webp" /><img src="./docs/assets/auto-handoff/auto-handoff-on-light.webp" width="960" alt="Terminal card titled demo — zsh. The command litgrok auto-handoff on 60 prints Automatic handoff is ON at 60 percent for this project., When a turn ends with the context at or above that percent, the model is asked to write a handoff and then to tell you to run /compact. and Saved in ~/demo/.grok/litgrok/auto-handoff.json. Then litgrok auto-handoff status prints Automatic handoff: ON at 60 percent, Set by: .grok/litgrok/auto-handoff.json, Percent: 60, from .grok/litgrok/auto-handoff.json, Grok's own auto-compact point: not reported yet (the status line reports it while automatic handoff is ON; Grok's documented default is 85 percent), It needs the LitGrok status line (litgrok install --user --status-line) to see how full the context is. Without it, nothing happens. and Project file: ~/demo/.grok/litgrok/auto-handoff.json." /></picture></p>

### What you see in a session

Once the context comes within ten points of your percent, the status row shows a yellow warning with how close it is. When a turn ends at or above your percent, the Stop hook keeps the model going for one more step and asks it, once, to write the handoff with the `lit-handoff` procedure; the card reads `⚠ handoff requested`.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./docs/assets/auto-handoff/auto-handoff-session-dark.webp" /><img src="./docs/assets/auto-handoff/auto-handoff-session-light.webp" width="960" alt="Terminal card titled demo — grok status line. Three status cards during a /litwork turn, each titled [🔥LIT] | 🔥 LIT · litwork with 2 tools and 1m04s at the right, the stage map plan, work, review, done with work lit, and a last line reading Grok 4.5 [high] │ ctx 54%/2m or 61%/2m │ handoff@60%. At 54% the warning line reads ctx 54% → handoff at 60%. At 61% it reads ctx 61% ≥ handoff at 60%. After the Stop hook asks for the handoff it reads handoff requested." /></picture></p>

When the packet is saved, the model ends with one plain line: "Handoff saved. Run /compact now." Type `/compact` then, since Grok lets no hook start a compaction; the next time a turn ends, LitGrok points the model at the saved handoff and asks it to check the current files and continue from its next steps.

Grok also compacts on its own at 85 percent unless you changed that, so choose a percent below it.

### Turning it off, or deciding per shell

`auto-handoff off` stops it for the project and keeps your percent, so a plain `auto-handoff on` later brings back the same number.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./docs/assets/auto-handoff/auto-handoff-off-dark.webp" /><img src="./docs/assets/auto-handoff/auto-handoff-off-light.webp" width="960" alt="Terminal card titled demo — zsh. The command litgrok auto-handoff off prints Automatic handoff is OFF for this project., 60 percent is remembered for the next &quot;on&quot;. and Saved in ~/demo/.grok/litgrok/auto-handoff.json." /></picture></p>

You can also decide from the environment you start Grok Build in, which is handy for a single shell or a script:

- **`LITGROK_AUTO_HANDOFF=1`** turns the feature on for every session started from that environment, and `0` keeps it off there.
- **`LITGROK_AUTO_HANDOFF_PERCENT`** sets the percent and wins over the saved one.
- **`status`** tells you when the environment is overriding the project file.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./docs/assets/auto-handoff/auto-handoff-env-dark.webp" /><img src="./docs/assets/auto-handoff/auto-handoff-env-light.webp" width="960" alt="Terminal card titled demo — zsh. After export LITGROK_AUTO_HANDOFF=1 LITGROK_AUTO_HANDOFF_PERCENT=50, the command litgrok auto-handoff status prints Automatic handoff: ON at 50 percent, Set by: LITGROK_AUTO_HANDOFF, Percent: 50, from LITGROK_AUTO_HANDOFF_PERCENT, LITGROK_AUTO_HANDOFF in this environment overrides .grok/litgrok/auto-handoff.json., then the auto-compact and status line notes and Project file: ~/demo/.grok/litgrok/auto-handoff.json." /></picture></p>

[Every step in detail, including what happens when a handoff is stale or written by another session](./docs/guide.md#automatic-handoff-in-detail).

## The ground rules in your user rule

A user install also leaves a short ground-rules section at the end of `~/.grok/rules/00-litgrok.md`, so every Grok Build
session on your machine knows the basics before any skill loads: a prompt starting with `lit` is LitGrok's activation
word, plans live in `plans/` and the handoff in `.handoff/HANDOFF.md`, and a push, a publish, a tag or a version bump
waits for your explicit yes.

The section is LitGrok's own, and you decide whether it stays. `litgrok doctor` and `litgrok ground status` print a
`GROUND:` line with its presence and version; `ground off` takes it out and keeps it out, and `ground on` puts it back.

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok ground status
npm exec --yes --package @litfamily/litgrok@latest -- litgrok ground off
npm exec --yes --package @litfamily/litgrok@latest -- litgrok ground on
```

`install --no-ground` skips it for that one run. For a single repository, an approved lit-init can add the same agreement
as its own project file, `.grok/rules/10-litgrok-ground.md`, by running `litgrok ground project`.

## Use LitGrok in Grok Bot and Cursor

You can use the same planning and review habits inside Grok Bot, without a separate Grok Build install. The
Cursor-format manifest at `.cursor-plugin/plugin.json`, which Grok Bot and Cursor both read, points them at the 42
skills in `.grok/skills`. Ask with the folder name and the job, such as "lit-plan this change" or "litwork the to-do
list", and the bot reads that skill and works with the tools it already has.

Grok Bot's **Connect apps** reads the Cursor Marketplace, so add LitGrok there from this repository:

1. In Cursor, open **Customize**, choose **Add Marketplace**, pick **From GitHub Repository** and paste `https://github.com/wjgoarxiv/litgrok`.
2. In the marketplace section Cursor then shows with LitGrok in it, press **Add**.
3. In Grok Bot, open **Connect apps**, find LitGrok under **Your plugins** and add it; connect GitHub if the Bot asks for it.

Grok Bot reads marketplaces when it starts, so if LitGrok is not listed yet, restart Grok Bot and look again.

The hooks, the project rule, the status row and the LIT mark stay with Grok Build: Grok Bot shows only the skills and
connectors a plugin brings, and hooks are started by Grok Build itself. Skills that run a bundled script, such as the
slide and document skills, need Node.js or Python on the computer that runs them.

<details>
<summary>What loads in Grok Build and what loads in Grok Bot</summary>

| Piece | Grok Build | Grok Bot |
| --- | --- | --- |
| Skills | The install copies the 42 folders into `.grok/skills`, and you call one by name. | The plugin points at those folders, and you call one by its folder name in the message. |
| Agents | Eleven definitions in `.grok/agents` take a bounded job, such as a plan or a review. | No agent definitions load; the bot does the work with the tools it already has. |
| Hooks | The twelve registrations run after you trust the project with `/hooks-trust`. | None run: the plugin declares skills only, and hook commands are started by Grok Build. |
| Project rule | `.grok/rules/00-litgrok.md` is the guidance the session reads. | The working habits are written into the skill files, so the bot reads them there. |
| Status row and LIT mark | `--status-line` on a user install draws the row, and a trusted session opens with the LIT mark. | Neither appears; Connect apps lists the plugin's skills. |

</details>

<details>
<summary>The 42 skill names you can call</summary>

`autoconference`, `autoresearch`, `browser-drive`, `comment-checker`, `debugging`, `deep-interview`, `frontend-ui-ux`, `lit-brainstorm`, `lit-burnoff`, `lit-burnoff-file`, `lit-code`, `lit-commit`, `lit-comprehend`, `lit-crucible`, `lit-diagram-drawer`, `lit-docx`, `lit-adhd`, `lit-handoff`, `lit-hijack`, `lit-humanizer`, `lit-init`, `lit-plan`, `lit-pptx`, `lit-recap`, `lit-schematic`, `lit-scientific-visualization`, `lit-team`, `lit-typographic-motion`, `litgoal`, `litgrok`, `litresearch`, `litwork`, `lsp`, `lsp-setup`, `readme-studio`, `refactor`, `review-work`, `rules`, `start-work`, `structural-search`, `visual-qa`, `wikify`.

</details>

<details>
<summary>What Grok Bot loaded on 22 October 2026</summary>

On 22 October 2026, Grok Bot loaded LitGrok 1.0.25. It came from this public repository through
that Cursor marketplace and listed 39 skills. The xAI catalog pull request, xai-org #1619, is
still open, so this is the repository's own marketplace entry.

</details>

## How it works

A `lit` prompt passes through three layers. The project rule picks the skill from your words, and the workflow skills
walk the stages one at a time: questions, plan, work, review, done. Underneath, the trusted hooks keep the record and
hold a turn when a check fails, so a planning turn cannot end until its plan is saved and a deliverable full of hedges
is refused before it is written.

| Piece | What it does |
| --- | --- |
| Skills | Instructions the session reads when you call one by name or start a prompt with `lit` |
| Agents in `.grok/agents` | Take a bounded job from a workflow skill, such as a plan, a review or a prose pass |
| Project rule `.grok/rules/00-litgrok.md` | Tells Grok Build which skill fits a request |
| Hooks | Show the LIT mark, keep the status row current, check deliverable wording before it is written, log the order of events |

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./docs/assets/readme/diagrams/route.en.dark.png" /><img src="./docs/assets/readme/diagrams/route.en.light.png" width="960" alt="Diagram titled What happens when you type lit. You type lit task or /litwork task; a prompt goes to the project rule .grok/rules/00-litgrok.md, which matches your words to a skill and picks start-work. start-work hands a bounded job to the agents, .grok/agents/litgrok-*.md, 11 definitions such as planner, executor and verifier. The workflow skills sit in a row, one stage each: deep-interview (interview), lit-plan (plan), start-work with litwork (work), review-work (review) and done (all rows checked). Below them are the trusted hooks from hooks/hooks.json. When a plan turn ends, Stop's plan gate holds the planning turn until plans/slug.md is saved, and asks for the project files plans/slug.md and .handoff/HANDOFF.md. On each Edit or Write, PreToolUse runs deliverable-hedge-guard, which denies a hedged deliverable with exit 2, so the deliverable is checked by lit-humanizer rules before the file is written. UserPromptSubmit records the stage your prompt names, routes nothing and prints nothing, and appends a line to the session ledger .grok/litgrok/session-ledger/, which the LIT status row reads." /></picture></p>

Once you trust the hooks, they log the order of events in `.grok/litgrok/session-ledger/`. Nothing runs in the
background: when the session ends, the work waits in the handoff until you, or the next session, pick it up.
[Where LitGrok keeps its state](./docs/guide.md#where-litgrok-keeps-its-state) and
[what goes over the network](./docs/privacy.md).

### The same route, drawn as a plant

If you think in process diagrams, this is the same session as a small plant: the prompt comes in on the left, each
workflow skill is a vessel, and the hooks are the instruments on the lines between them.

<p align="center"><picture><source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="./docs/assets/readme/schematic/lit-plant.en.dark.png" /><source media="(prefers-reduced-motion: reduce)" srcset="./docs/assets/readme/schematic/lit-plant.en.png" /><source media="(prefers-color-scheme: dark)" srcset="./docs/assets/readme/schematic/lit-plant-loop.en.dark.webp" /><img src="./docs/assets/readme/schematic/lit-plant-loop.en.webp" width="900" alt="Looping process-flow drawing of the lit workflow in Grok Build, with flow marching along the lines. A Prompt enters the header labelled project rule 00-litgrok.md, metered by instrument FQR-101 for UserPromptSubmit, which signals the session ledger. The header feeds four vessels in series: deep-interview, lit-plan, start-work and review-work. Between lit-plan and start-work, analyser AIC-102 (Stop, plan gate) works a control valve, and a side stream takes plans/slug.md off the plan line. Between start-work and review-work, AIC-103 (PreToolUse, hedge guard) works a second valve. After review-work, AIC-104 (review-work verdict) works a three-way valve: Checked work leaves on the right, and a red findings line, stream 6, runs back into start-work. A stream table lists stages interview, plan, work and review, what each line carries (answered questions, an approved plan, the change and its tests, the change to judge, findings) and what gates it. The key reads Prompt, Work in progress, Saved or checked, Findings back to work, Hook signal." /></picture></p>

<details>
<summary>What each part of the plant stands for</summary>

The project rule is the header that feeds the prompt to whichever stage your words named. The `UserPromptSubmit` meter
records every prompt into the session ledger, the `Stop` plan gate holds the plan line until `plans/<slug>.md` is saved,
and the `PreToolUse` guard closes the work line on a hedged deliverable. At the end, `review-work` is a three-way valve:
checked work leaves on the right, and findings run back to the work vessel for another pass.

The tags on the instruments and the stream numbers belong to the drawing. The names on the vessels, the
hooks and the files are the real ones from this repository.

</details>

## Extensions

LitGrok's core is complete and works on its own: planning, building, review, research, handoff and the rest of the lit
workflow need nothing else. Nine skills that make finished files, such as decks, documents, figures, design work and
video covers, are now LitFamily extensions on the LitFamily extension shelf,
[wjgoarxiv-skills](https://github.com/wjgoarxiv/wjgoarxiv-skills). Install the ones you use beside LitGrok for
the full LitFamily experience, and leave out the rest.

`litgrok install` still copies 42 skill folders: the 33 core skills and a short note under each extension's old name.
A request for one, by its slash name, a bare `lit` prompt or an agent that preloads it, still reaches that note, which
gives the install line. The picture shows which skills sit where and the four steps `litgrok extensions install` takes
to bring one back.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./docs/assets/readme/diagrams/core-extensions.en.dark.png" /><img src="./docs/assets/readme/diagrams/core-extensions.en.light.png" width="960" alt="Diagram titled Core and extensions in LitGrok. litgrok install copies 42 skill folders into .grok/skills. On the left, the core, 33 skills complete on its own, in five groups. Plan, build and review: litwork, lit-plan, start-work, review-work, deep-interview, lit-brainstorm, lit-crucible, litgoal, lit-team. Research: litresearch, autoresearch, autoconference, lit-hijack, browser-drive, lit-comprehend. Code: lit-code, lit-commit, debugging, refactor, structural-search, lsp, lsp-setup, comment-checker, lit-burnoff, lit-burnoff-file, lit-init, rules. Carrying work over: lit-handoff, lit-recap, lit-adhd, wikify. Prose and the host: lit-humanizer, litgrok. In the middle, nine same-name notes, each pointing with an arrow to its folder under wjgoarxiv-skills variants/litgrok/: lit-pptx, lit-docx, lit-diagram-drawer, lit-schematic, lit-scientific-visualization, frontend-ui-ux, visual-qa, lit-typographic-motion, readme-studio. Below, bringing one extension back with litgrok extensions install skill --yes, in four steps: 1, check: grok plugin list --json and the eight skills folders, and a personal copy stops it; 2, move aside: each store copy, whole, into a dated folder under ~/.grok/extension-backups; 3, copy: grok plugin uninstall, then grok plugin install folder --trust; 4, receipt: Grok Build's registry.json, read back by grok plugin list --json, with source, store path and time. Notes: the other verbs are litgrok extensions list, check, update, remove and prune-backups; by hand, each note keeps the git clone and install lines." /></picture></p>

For Grok Build each extension is its own folder under `variants/litgrok/`, a one-skill plugin with everything it reads
inside it. Run from the project root; the first line only prints the plan, and `--yes` carries it out:

```bash
litgrok extensions install lit-pptx
litgrok extensions install lit-pptx --yes
```

<details>
<summary>What <code>--yes</code> does, step by step</summary>

With `--yes` it fetches the shelf into its own cache folder
(`~/.cache/litgrok/extensions-src`, a shallow copy of `variants/litgrok/` only; `--from "<path to your
wjgoarxiv-skills clone>"` uses a clone you already have), runs the same two checks the manual route below
uses, and stops when a personal copy of the skill sits in a folder Grok reads. It names that folder and
the line that moves it aside, and never moves it itself; `--allow-shadow` installs beside it with a
warning instead. An installed copy that differs from the shelf, or a second copy from another clone, is
first copied whole into a dated folder under `~/.grok/extension-backups/`, then uninstalled, so exactly
one live copy is left. The install itself is `grok plugin install "<folder>" --trust`, and Grok Build's own
plugin list is the receipt: LitGrok writes no record of its own.

</details>

The other verbs work the same way, printing first and acting only with `--yes`:

| Verb | What it does |
| --- | --- |
| `litgrok extensions list` | Shows the nine extensions and what is installed, from which folder and when. |
| `litgrok extensions check` | Reports duplicates, competing same-name skills, copies whose source folder is gone and the backups with their size, with the line that fixes each; exits 1 while something needs action. |
| `litgrok extensions update` | Pulls the shelf and reinstalls only the extensions that differ from it. |
| `litgrok extensions remove lit-pptx` | Backs up and uninstalls a copy that came from a shelf folder, and refuses a plugin of that name from anywhere else. |
| `litgrok extensions prune-backups --older-than 30` | Lists the backups with their size and deletes them only with `--yes`. |

Pick several at once with `--family decks|documents|figures|design|video-covers` or `--all`. `litgrok doctor` prints a
one-line summary of the check.

Films and README covers come from two of the extensions: `lit-typographic-motion` (a treatment first, then a short film
checked by a QA gate, or a silent README cover loop) and `readme-studio`. The `litgrok motion-runtime` command left with
the skill, and the plugin pre-warms its own engine.

<details>
<summary>Install an extension by hand</summary>

Clone the shelf once. Then, from the project root, run two
read-only checks and the install line for each skill you want (`lit-pptx` here):

```bash
git clone https://github.com/wjgoarxiv/wjgoarxiv-skills
grok plugin list --json | grep -cF '"name": "lit-pptx"'
grep -L '^description: "Moved: lit-pptx ' {.grok,.agents,.claude,.cursor,~/.grok,~/.agents,~/.claude,~/.cursor}/skills/lit-pptx/SKILL.md 2>/dev/null
grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-pptx" --trust
```

LitGrok keeps a short note under each old name, so `/lit-pptx`, the bare `lit` routes and the agents
that preload these skills still answer: the note says the skill is a LitFamily extension now and gives
you its install line. The line names the skill's folder path, so Grok Build copies only that folder, a
few megabytes at most. A `#` subfolder source (`<clone>#<folder>` or `owner/repo#<folder>`) would copy
the whole repository, `.git` included, over 200 MB for each skill.

The plugin goes into Grok Build's own
plugin store, never into `.grok/skills/`, where LitGrok's installer keeps the note, so `litgrok install`
keeps updating LitGrok cleanly. Once it is installed, the skill answers as `<skill>:<skill>` beside the
note, and `grok plugin uninstall <skill>` removes it.

The checks are there because Grok Build keeps one copy per name and does not merge. The first counts
the plugin copies already installed; above 0, skip the install, because a second install of the same
folder stops with `already installed` and changes nothing. The second prints any personal `SKILL.md`
with that name in a skills folder Grok reads (project `.grok`, `.agents`, `.claude`, `.cursor`, and the
same four in your home), leaving out LitGrok's own note.

Such a copy takes the bare `/lit-pptx` name
ahead of the note, so move its folder (the printed path without `/SKILL.md`) out whole before you
install. The backup goes to a dated folder Grok does not scan, and nothing is deleted:

```bash
mkdir -p ~/.grok/extension-backups && mv "<that folder>" "$(mktemp -d ~/.grok/extension-backups/$(date +%Y%m%d-%H%M%S)-XXXXXX)/"
```

</details>

<details>
<summary>Update or remove an extension by hand</summary>

To update an extension, `grok plugin update` is no help: for a local folder it reports the plugin as
already live and copies nothing. Pull the clone, then uninstall and install again:

```bash
git -C "<path to your wjgoarxiv-skills clone>" pull
grok plugin uninstall lit-pptx
grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-pptx" --trust
```

If the first check counted more than one copy (the same skill installed from two clones), run the
uninstall line once for each. `grok plugin uninstall <skill>` on its own removes an extension; your
clone keeps the source. `litgrok install` and its updates never touch Grok Build's plugin store.

</details>

<details>
<summary>The install line for each of the nine extensions</summary>

| Skill | Folder in wjgoarxiv-skills | Install line |
| --- | --- | --- |
| `frontend-ui-ux` | `variants/litgrok/frontend-ui-ux/` | `grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/frontend-ui-ux" --trust` |
| `visual-qa` | `variants/litgrok/visual-qa/` | `grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/visual-qa" --trust` |
| `lit-typographic-motion` | `variants/litgrok/lit-typographic-motion/` | `grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-typographic-motion" --trust` |
| `readme-studio` | `variants/litgrok/readme-studio/` | `grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/readme-studio" --trust` |
| `lit-diagram-drawer` | `variants/litgrok/lit-diagram-drawer/` | `grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-diagram-drawer" --trust` |
| `lit-schematic` | `variants/litgrok/lit-schematic/` | `grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-schematic" --trust` |
| `lit-scientific-visualization` | `variants/litgrok/lit-scientific-visualization/` | `grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-scientific-visualization" --trust` |
| `lit-docx` | `variants/litgrok/lit-docx/` | `grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-docx" --trust` |
| `lit-pptx` | `variants/litgrok/lit-pptx/` | `grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-pptx" --trust` |

</details>

<details>
<summary>What the installer tells you about extensions</summary>

The installer tells you this when you install or update, and when it finds a same-name copy of an
extension in a skills folder it adds one line that points at `litgrok extensions check`. On an update from 1.0.34 or older it also
names the old engine caches still on disk (`~/.cache/litgrok/office-docs` and
`~/.cache/litgrok/motion-runtime`, under `$XDG_CACHE_HOME` if you set it); nothing reads them now,
because the extensions keep their own cache, so you can delete them.

If you use the LIT status row, it
adds a one-line reminder for the first session after. Grok Build ignores what a session-start hook
prints, so without the status row the install output is the only place you see it.

</details>

## Requirements, update and uninstall

You need Node.js and Grok Build; the notes on this page were checked on Grok Build 1.0.13. Slides need Node.js 20.9 or
newer, and the office skills install their pinned tools into their own cache the first time you use them.

To update, run the [install line](#install-in-30-seconds) again. Two more commands look after an install:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok doctor
npm exec --yes --package @litfamily/litgrok@latest -- litgrok uninstall
```

- **`doctor` only reads:** it prints the installed version and the `GROUND:` line, and when npm has a newer version, the command that installs it, leaving the choice to you.
- **`uninstall` removes only what it put there:** it takes the scope you installed with (add `--user` for a user install), and if you edited a file, it stops before removing anything and names that file.
- **A user uninstall** also takes out the status-line keys LitGrok wrote, if you left them unchanged.

The installer never runs `git init`, trusts hooks, signs in or picks a model for you; those
steps, and your API keys, stay with you in Grok Build.

## Learn more

- [Guide](./docs/guide.md): pictures of what LitGrok prints, the promo film, install options and
  the status row, safety checks, automatic handoff in detail, slides and documents, and fixes for
  common problems.
- [All skills](./docs/skills.md): the 42 skills, one row each, with a picture of each.
- [Operational reference](./docs/reference.md): installation, hooks, terminal output, payload
  checks and source provenance.
- [Project rule](./.grok/rules/00-litgrok.md), [skill folders](./.grok/skills),
  [changelog](./CHANGELOG.md), [privacy and local data](./docs/privacy.md) and
  [migration from the old npm name](./docs/reference.md#npm-package-migration).
- [LitFamily](https://github.com/wjgoarxiv/litfamily): the same way of working for other coding agents.

## LITFAMILY

The seven armored robots on the cover stand for the seven LitFamily products. Each one works on its own in its own host: install just the one you use, and it needs none of the others.

The cover is brand motion made with the LitFamily motion skill: animated artwork, with no Grok session recorded in it. The editable vector version is `docs/assets/cover.svg`, and if your system asks for reduced motion, you see a still frame instead. The film near the top of this page is the one that shows a real Grok Build session.

<p align="center"><img src="./docs/assets/readme/ascii-readme.svg" width="480" alt="LIT ASCII B mark — Grok" /></p>

<details>
<summary>Copy ASCII logo</summary>

```text
                             ▄▄▄▄
                   ▗███▌   ▗██████▖
 ▗▄▄▄▄▄          ▗▟████▌   ▝██████▘
 ▐█████        ▗▟██████▌    ▝▀▜█▀▘
 ▐█████      ▗▟███████▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
 ▐█████    ▗▟█████████████████████████ ▐█▀
 ▐█████    ████████████████████████████▀
 ▐█████    ██▛▘   ▄ ▄▄▄▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▖
 ▐█████    ▀    ▄██ ████▌█████████████▌
 ▐█████       ▄████ ████▌█████████████▌
 ▐█████     ▄█████▛
 ▐█████  ▗▟█████▀▘       ▄▄▄▄▄     ▗▖
 ▐█████ ▐█████▀          █████     ▐▛▀
 ▐█████ ▐███▀            █████
 ▐█████ ▐█▀              █████
 ▐█████ ▝                █████
 ▐█████▄▄▄▄▄▄▄▖          █████
 ▐███████████▛           █████
 ▐██████████▀            █████


grok
```

</details>

If LitGrok saves you some re-explaining, a star on GitHub helps other Grok Build users find it.

To contribute, start with a small issue or pull request; the [contributing guide](./CONTRIBUTING.md) lists the checks to run first. See also [security](./SECURITY.md), the [code of conduct](./CODE_OF_CONDUCT.md) and [support](./SUPPORT.md). LitGrok is released under the [MIT license](./LICENSE); the name and logos follow the [trademark policy](./TRADEMARK.md).
