<p align="center"><picture><source media="(prefers-reduced-motion: reduce)" srcset="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/assets/cover-motion-still.webp" /><source media="(prefers-reduced-motion: no-preference)" srcset="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/assets/cover-motion.webp" /><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/assets/cover-motion.webp" width="100%" alt="LitFamily motion cover: five armored robots power on one by one, the LitGrok robot wakes with glowing eyes and a lit frame, then LITFAMILY and KEEP THE WORK LIT. light up." /></picture></p>

<h1 align="center">LitGrok</h1>
<p align="center"><strong>Keep the work lit.</strong></p>

Make something useful in Grok Build. Leave the checked result and the next step with your project.

**[Full guide and skills gallery on GitHub](https://github.com/wjgoarxiv/litgrok#readme)** · [한국어](https://github.com/wjgoarxiv/litgrok/blob/main/README_ko-KR.md) · [Install](#install-in-30-seconds) · [Reference](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/reference.md)

<p align="center">
<a href="#install-in-30-seconds"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/assets/readme/badge-version.svg" alt="1.0.13" /></a>
<a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/LICENSE"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/assets/readme/badge-license.svg" alt="MIT license" /></a>
</p>

<p align="center"><a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/reference.md"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/assets/readme/lucide-book-open.svg" width="16" alt="" /> Docs</a> &nbsp; <a href="#install-in-30-seconds">Install</a> &nbsp; <a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/assets/cover-motion.webp"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/assets/readme/lucide-play.svg" width="16" alt="" /> Cover motion</a> &nbsp; <a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/LICENSE"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/assets/readme/lucide-shield-check.svg" width="16" alt="" /> MIT</a></p>

LitGrok gives Grok Build a way of working: plan the change, build it, check it, and leave a handoff the next session can read. It ships 38 skills, 11 agents, one project rule, and eleven hook registrations. Grok Build still runs the session and chooses the model.

## Install in 30 seconds

You need Node.js and Grok Build. In an interactive terminal, from the project you want to try:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok install
```

The files land in `<project>/.grok/`. Add `--user` to install under `~/.grok/` instead, or use `--package @litfamily/litgrok@1.0.13` to pin this release. Add `--dry-run` to see every destination before anything is written.

Trying a local package instead? Put its real absolute path in a variable, then run these two lines separately:

```bash
LITGROK_PACK='/absolute/path/to/the-provided-package.tgz'
npm exec --yes --package "$LITGROK_PACK" -- litgrok install
```

## The first thing to type

Open (or restart) Grok Build from the project's Git root. Grok runs project hooks only after you trust them, so review and trust them in `/hooks-trust`; on Grok Build 1.0.23, `grok --trust inspect --json` did the same. In a plain folder without Git, the skills and rules load but the hooks stay off. Then send:

```text
/litwork Build a to-do list in one index.html with no external dependencies. Implement add, complete, and delete. Leave the checks performed and the next step. Do not open a browser automatically; give me the steps to check it myself.
```

Then open `index.html` yourself and add, complete and delete an item. That click-through is the real test; anything you didn't try stays marked unverified.

## Carry the work into the next session

For a larger change, start with `/lit-plan`, read the plan it saves, then run `/start-work <plan path>`. Before you stop, ask:

```text
/lit-handoff Record what we built, what we checked, and what remains. Tell me where you saved the handoff.
```

Next time, give Grok Build the path it returned and ask it to read the handoff and check the current files before it continues.

Long sessions can write their own handoff. Turn on automatic handoff with `litgrok auto-handoff on <percent>`, choosing the percent yourself, and LitGrok asks the model for a handoff when the context reaches it. It stays off until you do, and it reads the context percent from the optional status row. [What runs by itself and what you run](https://github.com/wjgoarxiv/litgrok#automatic-handoff)

## Routes people use

| Type this | What happens |
| --- | --- |
| `/litwork` | Starts the shipped work checklist for a bounded task. |
| `handoff` or `/lit-handoff` | Carries the checked result and the next step into another session. |
| `/lit-plan` | Writes a plan with concrete checks. |
| `/start-work <approved-plan>` | Executes a plan you approved. |
| `/review-work` | Reviews a change and its evidence. |
| `/litresearch` | Runs bounded, source-traceable research without overstating the evidence. |

`/skills` lists everything your session loaded. The [skills gallery on GitHub](https://github.com/wjgoarxiv/litgrok#skills-at-a-glance) shows all 38 with a picture of each result.

Beyond code, `lit-pptx` makes slide decks, `lit-docx` makes reports and Word documents, `/frontend-ui-ux` builds and checks interfaces, `/readme-studio` writes source-checked READMEs, and `lit-humanizer` rewrites stiff English or Korean prose.

## What changes after install

The installer copies the skills, agents, project rule, and hooks into `.grok/`. The eleven hook registrations in [`hooks/hooks.json`](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/hooks/hooks.json) run only in a trusted Git root, and they log the order of events in `.grok/litgrok/session-ledger/`. Everything runs inside your Grok session, and nothing runs in the background; when the session ends, the work waits for the next one.

If you'd like a status row showing the active LitGrok skill, the model and how much context is used, add it with `install --user --status-line`. It writes `[ui.status_line]` into `~/.grok/config.toml` and backs up an existing file first.

## Safety and uninstall

Before it upgrades or removes a file, the installer checks that the file is one it put there. If any file was edited, belongs to something else or looks unsafe, it stops before writing anything and names that file.

Some runs only preview: the installer lists what it would do, prints `no files written`, and stops, even with `--yes`. That happens with:

- `--dry-run`, when you want to see the plan first;
- `--no-color`, or `NO_COLOR` in the environment, even empty (unset it when you mean to install);
- `CI` in the environment, so CI jobs always get a preview.

Without `--yes`, a run with no terminal attached, such as a script, is a preview too.

Uninstall with the same scope you installed with:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok uninstall
npm exec --yes --package @litfamily/litgrok@latest -- litgrok uninstall --user
```

The installer never runs `git init`, trusts hooks, signs in or picks a model for you; those steps, and your API keys, stay with you in Grok Build. The package tests check the files we ship. To see what your own session loaded, open it from the repository root and check `/hooks` and `grok inspect --json`.

## If something does not work

- **No hooks:** Grok runs hooks only from a trusted Git project root. For a new project, run `git init` yourself, then trust it; for an existing one, open Grok Build from its real root.
- **Nothing was written:** the output says `no files written` and names the reason (`DRY RUN`, `NO COLOR` or `NON-INTERACTIVE`). Fix that case from the list above and run the install again.
- **No status row:** Grok reads the row from user or administrator configuration, not from a project or plugin, so add it with `install --user --status-line`.

---

**[Full guide, skills gallery and troubleshooting on GitHub →](https://github.com/wjgoarxiv/litgrok#readme)**

[Reference](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/reference.md) · [Changelog](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/CHANGELOG.md) · [Privacy](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/docs/privacy.md) · [MIT license](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.13/LICENSE)

The cover is brand motion made with the LitFamily motion skill: animated artwork, with no Grok session recorded in it.
