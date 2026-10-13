# LitGrok guide

[README](../README.md) · [한국어](./guide_ko-KR.md) · [All skills](./skills.md) · [Reference](./reference.md)

This page holds the details behind the [README](../README.md): what LitGrok prints on screen, the other ways to install it, and how each feature behaves. If you have not installed LitGrok yet, start with the README.

## Carry the spark into the next session

> **A spark has been placed in your hands. Put it to work.**
>
> A bug you want fixed. A screen you want built. A project you want to finish.
>
> Starting takes a line. When the session changes, the harder part is finding where you left off. LIT guides you through leaving a goal, a plan, a checked result, and a next step with your project.
>
> **Leave something the next session can pick up.**

```text
Plan → Build → Verify → Hand off
```

When you end a session with `/lit-handoff` (see the [quick start](../README.md#quick-start)), it tells you where it saved the handoff. In the next session, give Grok Build that path and ask it to read the handoff and check the current files before continuing. The handoff goes to `.handoff/HANDOFF.md` in a new Git project, or to `HANDOFF.md` in a folder without Git. If a root handoff already exists, it is reused. [Where handoffs go](../.grok/skills/lit-handoff/SKILL.md).

If something breaks while you work, paste the actual error back into the session.

All of this happens inside your session, with the skills guiding each step, and LitGrok runs nothing in the background. When the session ends, the work waits there until you, or the next session, pick it up from the handoff.

## What you will see on screen

The pictures below show what LitGrok prints in your terminal, so you can see it before you install anything. Each one is output from LitGrok's own installer, SessionStart hook, prompt hook and status-line command, run on an empty demo project with a temporary home folder. Only the path of that home folder is shortened to `~`. The window frame is drawn around the text, and your own terminal will use its own fonts and colors. Most pictures follow your page theme, a dark window on a dark page and a light one on a light page. Bold text appears here in the regular weight, and the flame emoji is drawn as a small vector icon. The version number, the file count and the timings inside a picture belong to the run they were captured from.

The installer opens with the LIT mark and the package version, then says where the files will go and how many there are. Scope names the folder (here the demo project's `.grok` folder; `--user` would pick your home folder) and Payload counts the files, which are byte-identical copies. The MODEL ROUTE card tells you Grok Build keeps choosing the model, so the installer asks no model question and writes no model keys. This picture stays dark on every page theme, because the cream cells of the mark would fade on a white window.

<p align="center"><img src="./assets/screens/install-plan-dark.webp" width="824" alt="Terminal window titled zsh. The LitGrok block mark in orange, cream and lime with the package version beside it, and under it the line Grok Build skills, project rules, and hooks. Below, INSTALL with 01 · Scope project scope → ~/demo/.grok (use --user for user scope) and 02 · Payload 1154 files · byte-identical copies only, then whole packaged .grok tree, byte-identical copies only. Then MODEL ROUTE with Model selection: host-owned and Grok Build owns model and effort; the installer writes no model keys." /></p>

*Captured from the installer.*

Add `--dry-run` and you get the same plan followed by the line DRY RUN — no files written, and then one line for every file the installer would copy. The picture stops after the first three of those lines; the Payload line of your own run gives the total. Every other preview case listed under [Safety and uninstall](#safety-and-uninstall) prints the same kind of output, and its no-files-written line names the reason.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/screens/install-dry-run-dark.webp" /><img src="./assets/screens/install-dry-run-light.webp" width="932" alt="Terminal window titled zsh. INSTALL with 01 · Scope project scope → ~/demo/.grok (use --user for user scope), 02 · Payload 1154 files · byte-identical copies only and whole packaged .grok tree, byte-identical copies only. Then MODEL ROUTE with Model selection: host-owned and Grok Build owns model and effort; the installer writes no model keys. Then DRY RUN — no files written, followed by three lines: would install ~/demo/.grok/agents/litgrok-executor.md, would install ~/demo/.grok/agents/litgrok-korean-prose-editor.md and would install ~/demo/.grok/agents/litgrok-korean-style-analyzer.md." /></picture></p>

*Captured from the installer with `--dry-run`.*

A real install works through four checks and times each one. PAYLOAD counts the files, SAFETY confirms the install path is clear, OWNERSHIP compares every file with what is already on disk (a fresh project has none, so nothing conflicts), and WRITE copies them. The receipt then reads Ready and lists what stays with you: project hooks need a trusted Git root, so it points to `/hooks-trust`, and it says the installer never runs `git init` or changes trust. The last two lines give the command that pre-warms the video tools and tell you to restart Grok Build. The longest lines wrap at 100 columns the way a terminal wraps them.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/screens/install-done-dark.webp" /><img src="./assets/screens/install-done-light.webp" width="1004" alt="Terminal window titled zsh. INSTALL STEPS with four checked lines: PAYLOAD · 1154 files discovered · 19.8ms, SAFETY · install path clear · 2.9ms, OWNERSHIP · 1154 missing · 0 already-current · 0 owned · 0 conflicts · 91 legacy missing · 0 legacy owned · 0 legacy conflicts · 4.8ms, and WRITE · 1154 written · 0 already-current · 0 owned · 170.7ms. Then INSTALL RECEIPT: Status: Ready; Scope: project scope → ~/demo/.grok (use --user for user scope); Written vs already-current: 1154 written · 0 already-current; Model route: host-owned; the installer writes no model keys; Model picker: host limit — Grok Build owns session selection; no model keys are written; Output styles: host limit — Grok Build exposes no output-style selector; the installer writes no style keys; Hooks: project hooks require trust from a Git project root; Trust: use /hooks-trust or, on Grok Build 1.0.13, grok --trust inspect --json; Installer never runs git init or changes trust; Motion runtime: install stays copy-only; pre-warm lit-typographic-motion with npm exec --yes --package @litfamily/litgrok@(the package version) -- litgrok motion-runtime install; Next: restart Grok Build." /></picture></p>

*Captured from the installer.*

When a session starts in a trusted project, the SessionStart hook prints the LIT mark and one line saying the payload is present. If you see it, the hooks are loaded in that session; if it never appears, start with [Hooks do not show up](#hooks-do-not-show-up). The hook writes plain characters, so this mark has no colors; the installer banner above is the colored one.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/screens/session-start-dark.webp" /><img src="./assets/screens/session-start-light.webp" width="824" alt="Terminal window titled grok. The LitGrok block mark drawn in plain characters, and under it the line LitGrok payload present: skills, project rules, hooks, and the npx installer." /></picture></p>

*Captured from the SessionStart hook.*

The optional [status row](#an-optional-status-row) is one line that Grok keeps on screen. Until a prompt names a LitGrok skill it reads [🔥LIT], the model with its reasoning effort, and the context used. Once a prompt starts one, here `/litwork`, LIT IGNITED and the skill name join it, shaded from orange through pink to cyan. While that skill's turn runs, a ribbon sits under the row with the skill, how long the turn has run, the tool calls so far and the subagents still running. Under the ribbon, the workflow row shows the stages: plan passed, work in progress with three of the plan's seven tasks checked, the shell command in flight for 12 seconds, and the last test run. The window shows both states: the prompt hook was given an ordinary question first, then a `/lit-plan` prompt whose turn saved a seven-task plan and stopped, then a `/litwork` prompt. LitGrok's tool and subagent hooks logged three tool calls, one of them a real `node --test` run of three passing tests, and two subagents, one of them finished; then a shell command started, and the status-line command answered 12 seconds later. The model name, the effort, the 42%, the 2m window and the 1m42s turn are sample values passed in as input, since Grok supplies the real ones. The spinner in front of Bash turns at every redraw. The commands ran from the source folder, which has no install manifest, so the row shows no version; an installed copy shows it as `[🔥LIT vX.Y.Z]`.

<p align="center"><picture><source media="(prefers-color-scheme: dark)" srcset="./assets/screens/status-row-dark.webp" /><img src="./assets/screens/status-row-light.webp" width="819" alt="Terminal window titled grok. Two status rows. The first reads [flame icon]LIT in orange brackets, then | Grok 4.5 [high] │ ctx [█▎░] 42%/2m. The second reads the same brackets, then [flame icon] LIT IGNITED · litwork [flame icon] | Grok 4.5 [high] │ ctx [█▎░] 42%/2m with the label shaded from orange through pink to cyan. Right under the second row is the ribbon: a pink pill reading [flame icon] LIT, a cyan pill reading ● litwork, then 1m42s · 3 tools · 1 agent in grey. Under the ribbon is the workflow row: plan ✓ ━━━━ in orange, its rail lit from orange to pink with one cyan cell on it, a pink block reading WORK 3/7, then grey dashes with review · ──── done ·, then a spinner and Bash · 0:12 in amber and tests ✓ 3 in green." /></picture></p>

*Captured from the prompt, tool and subagent hooks and the status-line command.*

## Watch it in motion

This film follows one spark for about twenty-two seconds. The lime dot on the LIT mark lights the mark when you type a line, hops through Plan, Build, Verify and Hand off, lights the status row, rides a handoff card into a fresh terminal and comes home to relight the mark.

<p align="center"><a href="./assets/promo/promo.mp4"><picture><source media="(prefers-reduced-motion: reduce)" srcset="./assets/promo/promo-still.webp" /><source media="(prefers-reduced-motion: no-preference)" srcset="./assets/promo/promo-preview.webp" /><img src="./assets/promo/promo-preview.webp" width="880" alt="LitGrok promo film. A charcoal block LIT mark sits in the dark with one glowing lime dot. A typed litwork line lights the mark and shows the LIT IGNITED line. The mark shrinks to the corner and its dot travels a rail across the words Plan, Build, Verify and Hand off. A status row switches from LIT to LIT IGNITED with litwork. A card with Built, Checked and Remains hands the work to a fresh terminal that types Pick up where we left off. The dot returns to relight the mark beside Keep the work lit., For Grok Build and the install command." /></picture></a></p>

The film is animated artwork made with LitGrok's own film skill and set in Pretendard. The terminals and the status row show strings LitGrok really prints. The sample prompt, the card rows and the fresh terminal's line are illustrations, and the flames are drawn shapes. No Grok session was recorded for it. With reduced motion switched on you see a still frame. [Watch the MP4](./assets/promo/promo.mp4) to hear its generated music bed.

## Install options

The plain install in the [README](../README.md#install-in-30-seconds) is enough for most people. This section covers the other ways in, the optional status row, and what the installer checks before it writes or removes anything.

### Try a local package

To install from a package file instead of the npm registry, put its real absolute path in a variable, then run these two lines separately:

```bash
LITGROK_PACK='/absolute/path/to/the-provided-package.tgz'
npm exec --yes --package "$LITGROK_PACK" -- litgrok install
```

### An optional status row

LitGrok can also keep a status row on screen in Grok: which LitGrok skill your last prompt started, the model, and how much of the context is used. It lives in your user settings, so you switch it on with a user install:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok install --user --status-line
```

This adds a `[ui.status_line]` entry to `~/.grok/config.toml` that refreshes every two seconds. LitGrok backs the file up before changing it, and if you already have a status line of your own, it leaves the file alone. Uninstalling with `--user` later removes only what LitGrok added, and only if you haven't edited it since.

Grok reads this setting only from user or administrator configuration, never from a project or a plugin, which is why a project install can't turn it on ([status-line docs](https://docs.x.ai/build/features/status-line), [settings reference](https://docs.x.ai/build/settings/reference)).

Add `--notify` to the same command for a finish alert. It writes a `[ui.notifications]` table that has Grok raise its own terminal notification when a turn completes, needs your approval or fails, even while the terminal has focus. Grok's default notifies only while you are looking elsewhere. If you already have notification settings, LitGrok leaves them alone, and a user uninstall removes only the unchanged table it added.

<details>
<summary>What the row shows</summary>

While a LitGrok skill is active the row reads like `[🔥LIT vX.Y.Z] 🔥 LIT IGNITED · lit-plan 🔥 | Grok 4.5 [high] │ ctx [█▎░] 42%/2m`; the rest of the time it reads like `[🔥LIT vX.Y.Z] | Grok 4.5 [high] │ ctx [█▎░] 42%/2m`. The bracket after the model is the reasoning effort, shown only when Grok reports one, and the number after the slash is the size of the context window. A value Grok does not send shows as `?` or is left out.

The label comes from your latest prompt. LitGrok looks for the first of these names that appears in it: `lit-scientific-visualization`, `lit-handoff`, `autoconference`, `autoresearch`, `lit-plan` or `litwork`. A bare `lit` shows as `litwork`. Names inside inline or fenced code don't count, so pasting a snippet won't change the row.

With color on, the active `LIT IGNITED · <discipline>` label is bold and shaded letter by letter from orange-red through pink to cyan (`#FF6337 → #FF2D95 → #00E5FF`). The flames and the model and context parts stay plain. For a row with no color at all, set `NO_COLOR` (an empty value works too) or `LITGROK_HUD_COLOR=0` in Grok's environment. Truecolor, bold and emoji all displayed correctly in the status row on Grok Build 1.0.13. If your terminal shows fewer colors, `LITGROK_HUD_COLOR=256` or `LITGROK_HUD_COLOR=16` picks the nearest ones it has.

While a skill is at work, a ribbon joins the row as a second line, such as `🔥 LIT  ● litwork  1m42s · 3 tools · 1 agent`. It tells you how long the turn has run, how many tools it has called and how many subagents are still going. When the turn ends it reads `complete` for twenty seconds and then goes away, so between turns you see one line again. The ribbon turns amber when something needs you: the plan gate held a planning turn that hasn't saved its plan, automatic handoff asked for a handoff, or the context is close to your handoff percent. Grok's own numbers give the timer; the counts come from LitGrok's session log, and anything LitGrok can't read is left out rather than guessed. On a narrow screen the tool count goes first, then the subagents and the timer.

Two switches change the ribbon. `LITGROK_HUD_GLYPHS=nerd` draws rounded pills and small icons, which need a Nerd Font in your terminal; without it the pills stay square blocks that every font can show. `LITGROK_HUD_LINES=1` keeps the status row to its one line.

Once a prompt names a workflow skill, one more line shows where the session is in the LIT workflow, such as `plan ✓ ━━━━ [WORK 3/7] ──── review · ──── done ·   ⠹ Bash · 0:31   tests ✓ 214`. `deep-interview` starts the interview stage, `lit-plan` the plan, `start-work`, `litwork` or a bare `lit` the work, and `review-work` the review; interview appears only when the session went through it. A tick marks each stage the session has passed, the current stage is the filled block, and while working it counts the checked tasks of the newest plan in `plans/`. Done lights up when a review turn ends with every task in that plan checked. While a turn runs, the rail into the current stage carries a bright cell that moves one step at each redraw, and the line names the tool in flight with its time so far. The test badge is the verdict of the last command that called a test runner, with the passing count, or the failing count when it failed. LitGrok keeps only stage names, task counts and that verdict; never the prompt, a command or its output. On a narrow screen the rails get shorter first, then the test badge, the tool and the stage names give way, and the current stage always stays.

The row runs as a status command, so the hook count stays at eleven.

</details>

### Safety and uninstall

To see every destination before anything is written, add `--dry-run`:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok install --dry-run
```

Before it upgrades or removes a file, the installer checks that the file is one it put there. If you edited the file, it belongs to something else, or the path looks unsafe (a symlink, say), the installer stops before writing anything and names the file it refused.

Some runs only preview. The installer lists what it would do, prints `no files written`, and stops. That happens in these cases, even if you pass `--yes`:

- `--dry-run`: you asked to see the plan first.
- `--no-color`, or `NO_COLOR` in the environment, even with an empty value. Unset it when you mean to install.
- `CI` in the environment. A CI job always gets a preview.

Without `--yes`, a run that has no terminal attached, such as a script or a pipe, is a preview too. Add `--yes` when a script should really install; it then works without a terminal, as long as none of the cases above apply.

To remove LitGrok, uninstall the way you installed it: plain for a project install, with `--user` for a user install.

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok uninstall
npm exec --yes --package @litfamily/litgrok@latest -- litgrok uninstall --user
```

If you installed from a local package, remove it with the same package in the same project:

```bash
npm exec --yes --package "$LITGROK_PACK" -- litgrok uninstall
```

A user uninstall backs up `~/.grok/config.toml`, then takes out only the status-line keys LitGrok wrote and you left unchanged. Your other settings stay as they are. To update LitGrok, run `install` again.

A few things stay with you. Trusting hooks, creating the Git root, signing in and choosing a model all happen in Grok Build, and the installer leaves them, and your API keys, untouched. One hook, the hedge guard, stops vague hedging wording before it is written into a deliverable; if the host has an error, it steps aside and lets the write through (it is fail-open). The package tests check the files we ship. To see what your own session loaded, open it from the repository root and check `/hooks` and `grok inspect --json`. [Host boundaries and verification](./reference.md#verify).

## The routes you will use most

Day to day, most work goes through these six. Each one hands Grok Build a skill's instructions; your session shows what the model actually does with them.

| Type this | What happens |
| --- | --- |
| `/litwork` | Starts the shipped work checklist for a bounded task. |
| `handoff` or `/lit-handoff` | Carries the checked result and the next step into another session. |
| `/lit-plan` | Writes a plan with concrete checks. |
| `/start-work <approved-plan>` | Executes a plan you approved. |
| `/review-work` | Reviews a change and its evidence. |
| `/litresearch` | Runs bounded, source-traceable research without overstating the evidence. |

### Project hooks

The eleven hook registrations live in [`hooks/hooks.json`](../hooks/hooks.json). They show the LitGrok mark when a session starts, keep the optional status row current, check deliverable wording before it is written, and log the order of events. Like any project hook, they run only in a trusted Git root (see [Quick start](../README.md#quick-start)).

### The first line of an activated reply

Several LitGrok skills, `/litwork` among them, ask the model to open an activated reply with one line before anything else. For `/litwork` it looks like this:

🔥 **LIT IGNITED · litwork** 🔥

If you see it, the work has started. The line is a request to the model, so check the result itself before you trust it.

## Automatic handoff in detail

The [README](../README.md#automatic-handoff) has the short version. Here is the full set of switches and what happens on each step.

A long session eventually fills the context window, and Grok then compacts the conversation and drops detail. LitGrok can ask for a handoff before that happens: once the context reaches a percent you choose, the model writes one while it still remembers everything. The feature is off until you turn it on, and the percent is always yours. LitGrok has no built-in default.

Turn it on from the project root and pick your own number:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok auto-handoff on 60
```

- `auto-handoff on <percent>` turns it on at that percent, a whole number from 1 to 99. Plain `auto-handoff on` brings back the percent you used last, and asks for one if you never chose.
- `auto-handoff off` turns it off and remembers the percent for next time.
- `auto-handoff status` shows whether it is on, where each setting came from, and any warning.
- `LITGROK_AUTO_HANDOFF=1` turns it on for every session started from that environment, and `0` keeps it off there. `LITGROK_AUTO_HANDOFF_PERCENT=60` sets the percent and wins over the saved one. A percent outside 1 to 99 leaves the feature off, and `status` tells you why.

The choice is saved in `.grok/litgrok/auto-handoff.json` in the project. Here is what happens once it is on, and which steps LitGrok does for you on Grok Build:

| Step | On Grok Build |
| --- | --- |
| Reading how full the context is | Automatic, but only through the status row from [An optional status row](#an-optional-status-row). Grok gives hooks no other view of the percent, so without the row nothing happens. |
| Asking for the handoff | Automatic. When a turn ends at or above your percent, the Stop hook keeps the model working and tells it to write the handoff with the `lit-handoff` procedure. It asks once per crossing, and the model still has to follow the request. |
| Compacting | Yours to run. Grok lets no hook start a compaction, so the model ends with one plain line, "Handoff saved. Run /compact now." Grok also compacts by itself at 85 percent unless you changed that, so pick a percent below it. `status` warns when yours is not. |
| Bringing the handoff back | A reminder. After the compaction, the next turn end asks the model to read the handoff this session saved. Grok discards what a prompt hook prints, so the reminder cannot arrive any sooner. LitGrok skips a handoff that is older than the request or that another session wrote. |

After you compact and the context grows past your percent again, the cycle starts over. Like every project hook, this one runs only in a trusted Git root (`/hooks-trust`, see [Quick start](../README.md#quick-start)). The context figure lives in the temporary status-row folder described in the [reference](./reference.md#persistent-status-line-opt-in), and each step is noted in the session ledger.

## Where LitGrok keeps its state

Once trusted, the hooks log the order of events in `.grok/litgrok/session-ledger/`. To continue in a new session, give it the handoff path.

That ledger records session ids, folders and tool names, so the `.grok/litgrok/` folder that holds it (and the automatic-handoff setting) gets its own `.gitignore` containing `*` the first time LitGrok writes there. Committing your installed `.grok` skills, rules and hooks then leaves this runtime state behind.

[Checklist and hook boundaries](../.grok/skills/litwork/SKILL.md) · [Handoff destinations](../.grok/skills/lit-handoff/SKILL.md) · [Install details](./reference.md#install)

## Pages, slides, documents and prose

Use `/frontend-ui-ux <surface and outcome>` to build and inspect an interface you are allowed to change. With a clear brief it goes straight to working code; when something important is unclear, it asks one focused question first. If you only ask for a review or a plan, it changes no files.

For concept and technical diagrams, use the `lit-diagram-drawer` skill. Its slash route, `/lit-diagram-drawer`, hasn't been confirmed in a live Grok Build session yet, so find it through `/skills`. Ordinary interfaces go to `/frontend-ui-ux`, and plots of measured data go to `/lit-scientific-visualization`.

For slides, use `lit-pptx`; for reports and Word documents, use `lit-docx`. If you type a bare `lit` and describe what you want, the project rule asks Grok Build to choose one or both from your wording, and your session shows which one it picked. 
Neither skill starts from one fixed look. Before it writes a slide or a page, it reads the request for the things that shape a design: who reads the file, whether it is presented or sent ahead, how much of it is tables, pictures or steps. Then it picks a direction for that job. The reply names the direction, gives the reason in a sentence and mentions two others that would also suit, so you can switch with one word. A bare `lit` request gets all of this without a single question.

Decks have eight directions, each with its own colours, title placements and slide layouts: a dense numbers review, a pitch with one idea per slide, a picture-led deck, a teaching deck, a research talk, a Korean briefing deck, an editorial layout and a dark keynote. Slide titles name the topic, and the claim sits in the body with the basis and source of its figures, so the slides use the whole page. Documents have six restrained directions: report, brief, manual, proposal, memo and journal. They share one quiet print page with ink headings and plain ruled tables, and they differ in structure: the first page, the summary, the heading numbers, the few components each allows and the running head. Korean documents follow Korean conventions for dates, table captions and numbering. Publisher profiles (Elsevier, ACS, IEEE, Nature, korean-generic) and the older AZURE and BOILERPLATE deck templates still work when you ask for them by name. Pretendard is the typeface throughout.

Both skills bring their engines, templates and QA scripts with them. The first time you use one, it installs its pinned dependencies into its own cache. Slides need Node.js 20.9 or newer; Word documents and the base installer don't depend on that. Each skill page lists its commands and the optional render tools.

`/readme-studio <repository and outcome>` writes a README whose claims are checked against the repository, with outlined Pretendard or Meslo lettering and cover and motion recipes you can take elsewhere. It shows up in `/skills` after installation. Pictures depend on whether your Grok session offers image generation; if it reports `IMAGE_GENERATION_UNAVAILABLE`, give it a background image path instead. You set up fonts and renderers for each task. A local render is the first look; check the finished page again where it will live, on GitHub or npm. [README Studio](../.grok/skills/readme-studio/SKILL.md).

Use `lit-humanizer` for longer edits or a careful Korean review. Separately, a guard reads new text before Grok writes it into a reader-facing file. Clear problems have to be rewritten before the file is saved; milder ones come back as suggestions. Word and PowerPoint files are read right after they are created, and PDFs too when `pdftotext` is installed. If it can't read a file, it leaves the file as it is and tells you what it skipped.

### Browser automation

The `browser-drive` skill drives pages through [agent-browser](https://github.com/vercel-labs/agent-browser), a command-line browser engine that LitGrok doesn't install for you. Check for it with `npm run probe:browser-drive`. If the probe says it's missing, run `npm install -g agent-browser` and then `agent-browser install`.

### Scientific figures

The scientific visualization corpus is packaged at `.grok/vendor/scientific-visualization/`. The numeric `045_scientific-visualization` label remains only in license and provenance filenames.

## When something does not work

### Hooks do not show up

Grok Build runs project hooks only from a trusted Git project root. In a plain folder, the installed skills and rules still load, and the hooks stay off.

For a new practice project, run `git init` yourself, then trust it. For an existing repository, open Grok Build from its real root. The installer never runs `git init` or changes trust.

On Grok Build 1.0.13, `grok --trust inspect --json` trusted and inspected the project in one step, even though `grok --help` doesn't list `--trust`. Other versions may behave differently.

### The installer only previews

Read the installer's output. If it says `no files written`, the same line names the reason: `DRY RUN`, `NO COLOR` or `NON-INTERACTIVE`. The cases behind each one are listed under [Safety and uninstall](#safety-and-uninstall); fix that one, run again, and wait for real writes before you continue.

### The status row is missing

Grok reads the row from user or administrator configuration, not from a project or plugin, so add it with a user install: `install --user --status-line`. See the [status-line reference](https://docs.x.ai/build/features/status-line).

For host limits and current verification steps, see the [operational reference](./reference.md#verify).
