# Changelog

## Unreleased

## 1.0.27 — 2026-10-27

- Three new skills bring LitGrok to 42. `lit-schematic` draws real equipment: a P&ID with ISA-5.1 tags and control loops, a PFD, an isometric cutaway or a journal figure of an apparatus, as editable SVG with PDF and PNG, checked by a QA script. `lit-hijack` ports a technique from a published project clean-room: it records where the source came from, checks the licence, and makes sure the new code does not copy it. `lit-adhd` catches you up on recent sessions: what each one asked, did and is waiting on, a progress gauge drawn only from real totals, and one next step.
- `lit-pptx` has five more design tonalities (thirteen in all), each with a worked deck, and its quality gate checks the same things across all of them. `frontend-ui-ux` ships its component kit, fonts and layouts, a design lock that keeps a chosen look consistent, and new interface probes. The motion skill keeps its house styles as data, shows a storyboard before the full render, rejects empty or text-only frames, writes a score for each film and can render through Blender.
- Design skills now ask which house style you want before they start, with the recommended one first.
- Drawings and charts are richer by default: `lit-diagram-drawer` aims for a dense diagram with three to five accent colours, and `lit-scientific-visualization` adds a light grid, direct labels and context panels unless you ask for a plain figure.
- The status row changes its look with the skill: a rainbow while `lit-adhd` runs, however you started it; the review lanes during `review-work`; a YOUR TURN marker while a plan gate or a question waits for you; and a short burst when work completes. With colour off, these appear as plain labels.
- The README has a "What you can make" gallery of real renders.
- Safer fetching: when `lit-hijack` or the motion skill downloads something, redirects stay on https, private and local addresses are refused, downloads are capped in size, and the connection goes to the exact address that passed the check, so a DNS change cannot point it elsewhere. Secrets are masked before collected text is shortened, control characters are removed, the session-start note no longer writes through symlinks, the bundled three.js build is checked by hash, and Blender renders stop at a deadline.

## 1.0.26 — 2026-10-26

- The motion skill's pinned dependencies pick up upstream fixes: `certifi` 2026.10.19 for the audio environment, and newer `hono` and `fast-uri` in the HyperFrames and Remotion template lockfiles. A fresh motion setup installs these versions; nothing else about how the skill runs changes.
- The README explains how LitGrok works inside Grok Bot, describes each state of the LIT status row, adds tables for install paths and supported hosts, and shows the LitGrok mascot under the cover.
- The repository now lets a Cursor directory scan find the same 39 skills. This marker stays out of the npm package, so an `npx` install is unchanged.

## 1.0.25 — 2026-10-22

- Grok Bot and Cursor can load the 39 LitGrok skills through the repository’s Cursor plugin and marketplace entry. Their setup is described in both READMEs. Grok Build continues to run the hooks, project rule and status line.
- A repeated `lit` picks up the selected discipline and preserves its workflow stage, checked tasks and test result. `lit new` and `lit restart` clear that progress for fresh work, while a bare `lit` can resume a plan already approved.
- `lit-brainstorm` turns an open question into options you can compare and choose from before planning. `litgoal` defines the finish line, and `review-work` selects either plan review or work review, with explicit commands for each.
- The status line shows a LIT card during work, with the current stage, live tool, next task, test result, model, context, cost and branch when Grok supplies them. It settles between turns, uses the family colours and supports an ASCII glyph mode.
- The motion skill now renders looping WebP covers with separate cover treatments, checked raster assets, decoded-animation gates and worked recipes. Any machine can be the hero. A missing asset or a cover page error stops the render promptly.
- Office setup finds Python 3.10–3.14; motion audio uses uv’s Python 3.12 or a supported Python 3.12 or 3.13 on PATH. A newer default Python is skipped, and an error names the interpreters tried when none fits.
- Windows launches support npm command shims, executable extensions and venv paths, keep child exit codes and find `ffmpeg.exe`. PDF conversion checks fonts and supports long tables. Status-line setup preserves an existing user-modified configuration block.
- Markdown reports place related figures with their units or periods in a table and decisions in a numbered list, with explanations in prose. Replies use the same structure when several results share fields.
- The README artwork now shows the seven-member LitFamily, and the automatic-handoff session pictures show the current status card.

## 1.0.24 — 2026-10-19

- Reports and decks no longer pile up sentences that define something by what it is not. The deliverable guard counts definitional negations such as `아닙니다`, `아님`, `is not` and `rather than` in each paragraph, list block or table column. Two Korean ones, or three in any language, make the `PreToolUse` hook deny the write with advice to say what the thing is first; two that are not both Korean only warn. Reworded forms that restate the same definition, such as `~로 읽을 수 없음`, `~을 뜻하지 않음`, `~와는 다르다`, `~로 읽으면 안 된다`, `should not be read as` and `does not mean`, count too, so swapping one negation for another no longer gets past the guard. A plain comparison such as `A와 B는 다르다` is still allowed.
- Code, quotes, internal paths and short table cells (12 characters or fewer, counted as characters, so an emoji status cell is skipped) are left out of the count.
- An Edit, a patch or a Write over an existing file is now judged in the context of the whole file, and only on the lines it changes. A change inside a code fence, a blockquote or inline code, or two paragraphs that each have one negation, is no longer refused by mistake, and a new file is still checked in full. The deny reason also goes to stderr as one line.
- The `lit-humanizer` skill and the always-on rule describe positive-first wording with a before-and-after example.

## 1.0.23 — 2026-10-18

- The GitHub and npm READMEs, in English and Korean, now say in their first lines what changes for a Grok Build user, show a real session as a short sketch, and name the kind of work LitGrok suits. Install comes sooner, and requirements and troubleshooting read as short paragraphs instead of bold-label lists. The images are unchanged.
- Leftover notes about the retired skill-hint feature are gone from the test that keeps such a hint from being added; the test is now `test/no-external-skill-hint.test.mjs` and still fails if a hint hook, its old switch or a call to its external API appears. No runtime behavior changed.

## 1.0.22 — 2026-10-18

- Asking for a Markdown or plain-text deliverable, such as `report.md` or `slides.md`, now gets plain Markdown. The project rule used to send these to `lit-docx` and `lit-pptx`, so renderer source like front matter and `::: callout` blocks landed in the reader's file and the run spent its time building Office files nobody asked for. Both skills now say their source format is renderer input only. Korean report prose keeps full sentences: the Brief tonality's 개조식 endings apply only when asked for, and the sentence-variance lint is no longer answered by cutting sentences into fragments.
- `.grok/rules/00-litgrok.md`, which Grok Build loads in full on every turn, drops from 18,323 to 15,469 bytes. The reply and reader-facing rules now come before the routing tables, and every trigger word, alias and route is unchanged. A test holds the installed rule to a 15,500-byte budget.
- New tests cover guard, status-row and installer paths that a deliberate break used to leave green, including symlinked manifests and payload files, a `.grok` path that is a file and a changelog that lost its release heading. Another test fails if a skill-hint hook, a `*_JEV` switch, a Typesafe call or any network call from the prompt hook is ever added. LitGrok never shipped such hints, so a leftover `TYPESAFE_API_KEY` or `*_JEV` variable in your shell is ignored and can be deleted.

## 1.0.21 — 2026-10-16

- The deliverable guard now refuses more of the lines that tell a reader what a document is not for, such as `This table is not a ranking.` or `이 문서는 제품을 비교하려는 것이 아닙니다.` These forms came from real sessions. Bold-label callouts such as `> **주의:** ...` are now read too, while ordinary quoted text is still skipped. Lines from manuals and lab reports that only look similar stay allowed.

## 1.0.20 — 2026-10-15

- Reports and decks no longer fill up with lines that tell the reader what the document is not for, such as `이 수치는 동일 조건의 독립 성능 비교로 쓰지 않음.` When the model writes one into a file, the `PreToolUse` hook denies the write and the model rewrites the line. Three new rules cover Korean self-referencing pledges, repeated disclaimers and the English forms. Legal and financial notices, safety warnings and real negative findings are left alone, and the rules finish in milliseconds even on very long runs of spaces.
- The `lit-docx` and `lit-pptx` skills now ask for a real limit once, written as a fact beside the number it affects. What a document is not for goes in the chat reply instead.

## 1.0.19 — 2026-10-13

- The status row shows where a session is in the LIT workflow. Once a prompt names `deep-interview`, `lit-plan`, `start-work`, `litwork`, a bare `lit` or `review-work`, a line such as `plan ✓ ━━━━ [WORK 3/7] ──── review · ──── done ·   ⠹ Bash · 0:31   tests ✓ 214` shows the stages passed, the current stage with the checked tasks of the newest plan, the tool running now and for how long, and the last test run. A command that only mentions a test runner inside a heredoc or a quoted string is not counted as a test run. LitGrok keeps only stage names, task counts and the test verdict, never a prompt, a command or its output.
- `litgrok install --user --notify` turns on Grok's own terminal notification for a finished turn, an approval request or an error, even while you are looking at the terminal. It is off until you ask for it, and a user uninstall removes only the unchanged table it added.
- The running ribbon and the live tool step now show in Grok Build 1.0.13, which sends the status line no turn start. LitGrok reads a turn in flight from its own session log instead, and stops showing it once the turn ends, fails or has been quiet for ten minutes.
- The bright cell that moves along the workflow rail is cyan, so it stays visible on a light terminal.

## 1.0.18 — 2026-10-12

- The README shows automatic handoff step by step. Each `litgrok auto-handoff` command (`on 60`, `status`, `off`) and the environment switches appear as terminal pictures with their real output, followed by the status row as the context nears your percent and the handoff is requested, and the `/compact` step that comes after.
- Install has a short prompt you can paste into a coding agent so it installs LitGrok for you. The agent shows its plan and waits for your yes, uses only the official npm package, passes `--yes` with `NO_COLOR` and `CI` cleared so a shell without a terminal really installs, asks before adding the status row, checks the result and reminds you to restart Grok Build. The prompt is in English and Korean.
- The GitHub page plays a new short film of the `--shout` session in seven numbered steps, from the bare `lit` request to the closing `litwork complete` status line, and the caption under it is gone.
- The slide runtime in `lit-pptx` and the readme-studio HyperFrames template pin sharp 0.35.5, and the HyperFrames and Remotion templates pin source-map-js 1.2.2. Slides still need Node.js 20.9 or newer.

## 1.0.17 — 2026-10-11

- The README is shorter and written for someone opening it for the first time: what LitGrok does, how to install it and what to type first. The detailed material moved, unchanged, into a guide and a skills page in English and Korean, and the GitHub page shows a short film of a real session as its demo.
- The optional status row is more compact. It reads like `[🔥LIT vX.Y.Z] | Grok 4.5 [high] │ ctx [█▎░] 42%/2m`, with the installed version, the model and its reasoning effort, and the context used out of the window size. A value Grok does not send is left out, and an unknown percent shows as `ctx ?`.
- While a LitGrok skill runs, a second line under the row shows the skill, how long the turn has run, the tool calls so far and the subagents still running. It reads `complete` for twenty seconds after the turn ends and then goes away, and it turns amber when the plan gate or automatic handoff needs you. `LITGROK_HUD_LINES=1` keeps the row to one line.
- The new `litgrok doctor` prints the installed version and, when npm has a newer one, the command that installs it. It only reads the registry and never installs anything.
- Long sessions and Korean input keep working. Hooks read Korean text over 64 KB without garbling it, and the session log survives a torn last line and rotates once it passes 8 MiB, keeping the two newest parts.
- `litgrok auto-handoff` uses the project's Git root when run from a subfolder and prints the file it used. The `.grok/litgrok/` runtime folder keeps itself out of Git.
- When `config.toml` already has an inline `ui` table, the status-line install leaves the file untouched and explains what to change. It used to add a second `ui` table that made the file invalid. Removing the status line now restores the original file byte for byte.
- The motion pre-warm command works. The installer and the motion skill pointed to a command name that was never published; they now print `npm exec --yes --package @litfamily/litgrok@<installed version> -- litgrok motion-runtime install`, pinned to the installed release.

## 1.0.16 — 2026-10-09

- The deck check in `lit-pptx` now finds placeholder text. It reads its placeholder words from a list that LitGrok had never shipped, so it found nothing, and a slide that still said "Lorem ipsum" or "[작성 중]" passed. The list now ships with the skill, and the installer copies it.
- The same check reads a one-word placeholder term such as "todo", "tbd", "fixme" or "placeholder" as a whole word. A slide that mentions "Mastodon" or a "photodocument" now passes, while "TODO:", "TODOs" and "(TBD)" still fail.
- The eight deck looks and six document looks no longer list settings the engine never applied, such as letter case, figure style, picture cropping and page fill targets, and their reference pages no longer promise them. Decks and documents come out the same as before.

## 1.0.15 — 2026-10-08

- `lit-pptx` now chooses how a deck should look before it builds anything. It reads who the deck is for, whether it is presented or sent ahead, and how much of it is tables, pictures or steps, then picks one of eight looks: a dense numbers review, a pitch with one idea per slide, a picture-led deck, a teaching deck, a research talk, a Korean briefing deck, an editorial layout or a dark keynote. The reply names the look, gives the reason in a sentence and mentions two others that would also suit; say one of their names to switch. The AZURE and BOILERPLATE templates still work when you ask for them by name.
- `lit-docx` does the same for documents, with six restrained looks: report, brief, manual, proposal, memo and journal. All six share one quiet print page with ink headings and plain ruled tables, and they differ in structure: the first page, the summary, the heading numbers, the few components each allows and the running head. Naming a publisher profile (Elsevier, ACS, IEEE, Nature or korean-generic) still uses that profile.
- New checks read every slide and page of the finished file and fail the build until the layout is fixed. They catch empty areas, a column much shorter than its neighbour, a heading stranded at the foot of a column or page, a short list split across pages and uneven columns on the last page. The document page checks need LibreOffice; without it, the reply says they did not run.
- `lit-pptx` ships the official, unmodified Pretendard Regular and Bold files and embeds them in decks, and `lit-typographic-motion` uses the same pair.

## 1.0.14 — 2026-10-01

- Automatic handoff now finds the handoff it asked for even when the model formats the marker line, for example as a bullet, in backticks or in bold. Before, some of these formats made the handoff look missing after the compaction. A handoff written by another session is still ignored.

## 1.0.13 — 2026-09-30

- Automatic handoff, off until you turn it on. Run `litgrok auto-handoff on <percent>` with a percent you choose; LitGrok has no built-in number. When a turn ends at or above that percent, the model is asked once to write a handoff while it still remembers the session. `auto-handoff off` and `auto-handoff status` turn it off and show its state, and `LITGROK_AUTO_HANDOFF` and `LITGROK_AUTO_HANDOFF_PERCENT` set it from the environment.
- On Grok Build the handoff is partly a reminder. Reading how full the context is needs the optional status row, and compacting stays yours: the model ends with "Handoff saved. Run /compact now." After the compaction, the next turn end asks the model to read the handoff this session saved. `status` warns when your percent is not below Grok's own compaction point.
- The GitHub pages, in English and Korean, show terminal pictures of what LitGrok prints (install, dry run, session start and the status row) and a new motion film set in Pretendard, with a Korean version. The pictures and films stay on GitHub, outside the npm package.

## 1.0.12 — 2026-09-30

- The GitHub pages, in English and Korean, gained a short motion film under "Watch it in motion": one working session in about twenty seconds, from typing a goal to handing the work to a fresh terminal. It is animated artwork, and the film files stay on GitHub, outside the npm package.

## 1.0.11 — 2026-09-29

- The READMEs and the npm install page, in English and Korean, are rewritten in plainer language, with the reason before each switch. The npm page stays a short install card that links to the full guide on GitHub.

## 1.0.10 — 2026-09-29

- lit-typographic-motion: the motion runtime now pins `ws` 8.22.0, which fixes a memory-exhaustion denial of service and an uninitialized-memory disclosure in 8.18.3. Run `litgrok-ai motion-runtime install` again after upgrading.
- The npm package no longer picks up Python bytecode (`__pycache__`, `.pyc`) left in the lit-pptx and lit-docx script folders.
- The READMEs are rewritten in plainer language, and GitHub and npmjs now get different pages: the full guide with the skills gallery stays on GitHub, and npmjs shows a shorter install-first page from `docs/npm/`, swapped in when the package is packed.

## 1.0.9 — 2026-09-28

- lit-pptx: the second rich render style id is now `green`.
- The repository no longer carries maintainer-only release tooling.

## 1.0.8

- Replace `lit-korean` with `lit-humanizer`, which revises model-written prose for its reader and adds a Korean deep review. Clear drafting residue in new reader-facing text must be fixed before saving; created DOCX and PPTX files, and PDFs when `pdftotext` is present, get advisory checks. Asking for `lit-korean` opens `lit-humanizer`, and an upgrade keeps any `lit-korean` copy you edited.
- Add `lit-pptx` for slide decks and `lit-docx` for reports and Word documents, with their engines, templates, QA scripts and pinned first-use installs into a LitGrok cache. Decks default to AZURE-PRO with Pretendard.
- The deck gate and the DOCX audit also flag layout faults such as misaligned numeric columns, overlong or cramped text, gradient text, glow, emoji bullets and empty table rows.
- Add `lit-diagram-drawer` for conceptual and technical diagrams, with the full diagram catalog, Node verifiers and importers. Its slash route stays a candidate until a Grok Build session confirms it. The visual verifier also checks group spacing, accent colours and label case.
- `frontend-ui-ux` now measures the built page in a browser across seven views, including dark, reduced motion and a 200% zoom reflow, and a remaining HIGH finding blocks "done". `litwork` hands interface work to this probe.
- Add frontend motion guidance and trim the affected guides while keeping their working decisions.
- Add the browser-drive probe, `npm run probe:browser-drive`, which checks for `agent-browser` and gives the install and first-use steps. LitGrok never installs it for you.
- Add `lit-typographic-motion`, which directs a finished film from a validated `treatment.json`. Films made of the words themselves use the type engine; other films, and every 9:16 film, are an authored page captured frame by frame on a virtual clock, with text QA and determinism replays.
- Every film gets a generated sound bed by default, and any planned track is muxed to the film's length. `look` records review rounds on the stills, and `verify` counts a film as done only after them. Pre-warm the runtime with `litgrok-ai motion-runtime install`.
- Lead both READMEs with a looping robot motion cover made with the LitFamily motion skill: five robot panels power on and the LitGrok robot wakes. Reduced motion shows the fully lit still. It replaces the line-animation hero and the static robot cover.
- Add a skills table to both READMEs, one row per skill with a snapshot of its result.
- Fix headless Chrome raising a macOS keychain dialog, a beat-grid film starting at its first beat instead of at zero, and a false determinism failure on pages with animated labels.

## 1.0.7

- Show the robot crew cover in a visible image under the motion hero in both READMEs instead of only near the LITFAMILY section, and remove the now-duplicate copy so it appears exactly once.
- Give a competing visual direction its own interview round in frontend-ui-ux and README Studio instead of an announced default, when the brief leaves it undecided.

## 1.0.6

- Add README Studio decoration patterns and the bounded multi-round design interview.
- Align both READMEs with the family layout and pin npm-rendered images and file links to this release.

## 1.0.5

- Route bare `lit` to `litwork` and show the first recognized visible discipline in the opt-in status row, while keeping session-ledger discipline limited to `lit-plan`.

## 1.0.4

- Add an opt-in Grok Build status line (`litgrok install --user --status-line`) that shows `🔥 LIT IGNITED · <discipline> 🔥` while a discipline is active.
- Paint the active status label with a bold per-character orange-to-pink-to-cyan truecolor gradient, leaving flames and model/context plain; `NO_COLOR` and `LITGROK_HUD_COLOR=0` stay escape-free.
- Update the five skill activation contracts to request one bold ignition line before response content, preserving each skill's existing discipline name;
  host display remains advisory.

## 1.0.3

- Add an animated README cover with a static option for reduced motion.
- Remove automatic skill review because it never completed a review in practice. Leftover `pending-review.json` and `skill-loop-state.json` files are inactive and may be deleted; no other state is affected.
- Refuse to publish when the test suite fails.
- Remove the retired `skill-observer` skill and its empty directories during upgrades while preserving user-owned files. If a user-owned file is inside the retired directory, installation refuses and names its path.
- List all 33 skills, 11 agents, and 11 hooks in the marketplace manifest so plugin scanners can find every component.
- Remove the private checkout path from the `litgoal` example.

## 1.0.2

- Add an explicit marketplace scanner manifest that enumerates all 34 skills, 11 agents, and the native hook manifest while preserving the existing Grok payload manifest.
- Make the optional cross-product payload freshness probe accept an injected family layout instead of embedding private checkout paths.
- Ignore local `.env` and `.npmrc` files so credentials and per-machine registry settings stay outside the product tree.

## 1.0.1

- Make the installer honor explicit `--yes` consent for piped, non-TTY
  invocations while keeping `CI`, `NO_COLOR`, and dry-run previews read-only.
- Remove empty payload directories during uninstall without touching user files,
  and retain the ownership checks that refuse modified or foreign content.
- Ship the native `hooks/hooks.json` aggregate so Grok Build discovers all eleven
  package-owned lifecycle registrations from the root plugin manifest.

## 1.0.0

- Release `@litfamily/litgrok` while retaining the `litgrok` and `litgrok-ai` executable aliases, native `.grok` paths, and existing ownership receipts.
- Preserve ownership-checked upgrades and removal, including refusal of modified, foreign, or unsafe files. Keep legacy skill and agent migration support.
- Align bilingual install and lifecycle references with the scoped package, document local data and support boundaries, and integrate the Ignition vector cover with editable installation commands in the READMEs.
- Use the selected Ignition B interlocking terminal mark with exact orange/lime/ivory cell colors in installer, help, SessionStart and README output. Preserve plain fallback, custom product labels, session suppression and functional progress colors; retain previous mark fixtures as history.
- Retain the shared terminal fallback policy, validated SessionStart mark suppression, and request-scoped reader/technical/audit guidance.
- Keep cover artwork and its generator out of the npm payload; ship the complete native skills, agents, rules, hooks, and vendor resources.

## 0.2.9 (pending) — 2026-09-03

- Add a shared, request-scoped `reader` / `technical` / `audit` communication
  contract across the project rule, conversational skills, and agent return
  packets. Reader replies now filter routine execution metadata while material
  failures remain visible and detailed evidence, ledgers, and handoffs stay
  intact.
- Cover the installed communication contract, parent/child projection,
  protected operational surfaces, and safe payload upgrades. LitGrok continues
  to label final-response enforcement as advisory because it does not ship a
  supported host response interceptor.

## 0.2.8 (pending) — 2026-09-02

- Move the scientific-visualization corpus to `.grok/vendor/` so the skill
  adapter stays a wrapper over the original files.
- Count vendor license, provenance, and NOTICE companions in family
  payload-parity so packed skills keep the material they name.

## 0.2.7 (pending) — 2026-09-02

- Repair payload upgrades across the ownership-manifest transition: installs now
  record a schema-checked `.grok/.litgrok-install-manifest.json` of SHA-256
  payload hashes, classify files matching recorded hashes as installer-owned,
  and atomically replace owned files during upgrades. Uninstall removes owned
  files and the manifest only after payload removal succeeds.
- Migrate a pristine manifest-free 0.2.5 payload through the bundled seven-file
  legacy hash snapshot, while malformed manifests and modified or unrecognized
  files still fail closed before payload writes.
- Add regression coverage for historical migration, legacy user edits,
  malformed ownership metadata, and manifest cleanup; enable full-history CI
  checkout for the historical archive fixture and document the ownership
  behavior in both READMEs.

## 0.2.6 (pending) — 2026-09-02

- Harden inode-reuse handling across skill-loop state locks and the
  autoconference/autoresearch output scaffolders: lock reclaim, failed-acquisition
  cleanup, and release stay bound to descriptor identity, ctime/birthtime, and
  exact bytes through tombstone checks, while opened output directories are
  revalidated against full stat identity before publication. Add same-inode race
  regressions and regenerate the affected canonical manifests so replacements fail
  closed while authorized rotations remain valid.

## 0.2.5 (pending) — 2026-09-01

- Add the shared stacked LitFamily ASCII wordmark to the installer and lead both
  READMEs with the version-free wordmark.
- Add a CI-enforced, manifest-driven version-lockstep guard for all eight release
  sites, counting both plain and escaped-regex pins.
- Report model-picker and output-style selection as Grok host limits rather than
  shipped surfaces: the installer writes no model or style keys, and
  `grok inspect --json` exposes no `model`, `outputStyles`, or `settings` keys.
- Add installer-depth coverage for explicit `--yes` consent, non-interactive
  no-write behavior, host-limit receipts, measured install phases, and isolated
  plugin validation.

## 0.2.4 (pending) — 2026-08-31

- Ship the Grok plugin manifest, eleven Grok-native agents, and complete reference
  corpora for `lit-scientific-visualization`, `lit-handoff`, `autoresearch`, and
  `autoconference` instead of single-entry skill stubs.
- Remove unsupported durable-goal-runtime claims from `litgoal` and `litwork`, and
  add packed-payload substance, cross-product parity, and referenced-path checks so
  installed skills retain the material they name.
- Refresh the canonical legal attribution metadata without changing the four
  upstream attributions it records. This candidate has not been published, tagged,
  or pushed.

## 0.2.3 (pending) — 2026-08-30

- Make the approved plan-file policy visible: `lit-plan` writes
  `plans/<slug>.md` and the planning turn is blocked until the file has
  executable checkbox tasks.
- Port the Grok-native `lsp-setup` skill with its 20 language references and
  expose it through the installer and `grok inspect --json` catalog.
- Add the shared install frame and explicit host-owned model-selection notice;
  this candidate has not been published, tagged, or pushed.
- Give the foreground review enough bounded time for the shipped four-turn model
  route while keeping export and model phases separately capped (5 seconds and
  60 seconds).

## 0.2.2 (pending)

- Keep the unpublished patch sequence explicit: `0.2.1` remains the first pending package version from the port-completion branch, and `0.2.2` is the subsequent pending skill-learning-loop patch. Publish `0.2.1` before `0.2.2`; this changelog does not claim that either version has been published.
- Add the user-invoked foreground skill learning loop: bounded session export and secret-scrubbed review, pending-only proposals, explicit apply/reject authority, a content-addressed decision ledger, rollback, and a deterministic archive-only curator.
- Route agent-owned skill writes only to `$HOME/.grok/skills/<name>/` with `metadata: { litgrokAgentGenerated: "true" }`, while refusing packaged, project-payload, unmarked, modified, and symlinked targets. Transcript content remains inert and `autoApply` remains false.
- Keep `Stop` and `SessionStart` model-free, preserve the existing SessionStart banner as the first line, and surface at most one pending-review line. Foreground review disables child tools, has a 30-second total budget, and fails closed on invalid or no-op proposals.
- Support the learning loop on macOS and Linux. On Windows, all learning-loop commands fail before subprocess, project learning-state, or user-skill access with `WINDOWS_SKILL_LOOP_UNSUPPORTED`; passive hooks and installation remain available while a native ACL and process-job helper is pending.
- Correct all eleven hook registrations to resolve commands from the hook configuration directory and normalize equivalent host event-name casing without accepting a different event.

## 0.2.1

- Prepare the 0.2.1 patch release with the manifest-pinned family-canon rule clarification: host-neutral references, schemas, datasets, legal files, focused references, and scripts may be carried byte-for-byte with provenance; contract prose is translated rather than copied verbatim.
- Carry the canonical frontend corpus and its legal/provenance records with verified aggregate SHA-256 `f6959eeeae02685102df9fbedafb2c437be4d51df8e102f9fcf32298f7674e7d7`, legal-tree SHA-256 `41b8726914b503469cb4f29410f911ccd9d963c63329bf3509e110c5cfafc7ec`, and dataset SHA-256 `a89011236a6ff14e12ec55fccbfab1bbd40ae34614cea5710c022121aa841bb8`. The reference volume is carried from the family canon rather than newly authored LitGrok prose.
- Add v1beta2 taste support for the `variance`, `motion`, and `density` dials, with schema, validator, query, and import checks.
- Carry programming, debugging, visual-qa, lit-comprehend, and browser-drive reference material, and deepen the review-work, start-work, and programming entry points with Grok-native routing and evidence contracts.
- Fresh Task 8 measurements record 426,524 reference-Markdown words and 38,029 SKILL.md words, versus Task 1's 20,042 and 29,088; review-work is 5,190 source / 3,715 target words, start-work is 4,027 / 2,743, programming is 5,225 / 3,881, and the skill spread is 10.16x versus Task 1's 4.4x. These counts describe carried corpus material and operational entry-point depth, not invented filler.

## 0.2.0

- Replace the two-file static package with a full Grok-native payload; `0.2.0` is a minor-version boundary because the installed product and runtime hook surface changed while the package remains pre-1.0.
- Ship 33 skills and the project rule at `.grok/rules/00-litgrok.md`.
- Add the bounded `SessionStart` payload announcement and the blocking `PreToolUse` deliverable-hedge guard.
- Widen the guard's Korean absent-evidence patterns after two isolated A/B evaluations showed that the original phrase list scored real limitation leaks as clean; the output-channel declaration is machine-readable guard metadata, not a claim that contract prose changes model behavior.
- Add recording-only `UserPromptSubmit`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `StopFailure`, `SubagentStart`, `SubagentStop`, `PreCompact`, and `PostCompact` hooks backed by a package-owned session ledger.
- Widen the installer to discover, install, verify, and uninstall the whole packaged `.grok/` tree with its existing refusal and idempotency policy.
- Keep undocumented schemas blocked: LitGrok ships no plugin manifest, plugin-supplied LSP server configuration, or custom agent definition.

## 0.1.2

- Add `npx litgrok-ai install` / `npx litgrok install`.
- Family-style cover, English and Korean README, LICENSE.

## 0.1.1

- First public candidate: one Grok skill and one project-rule document.
- Static npm payload only. No host login, plugin, hook, MCP, or TUI claim.
