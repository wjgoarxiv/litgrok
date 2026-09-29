# Changelog

## Unreleased

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
