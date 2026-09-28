<p align="center"><picture><source media="(prefers-reduced-motion: reduce)" srcset="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/cover-motion-still.webp" /><source media="(prefers-reduced-motion: no-preference)" srcset="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/cover-motion.webp" /><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/cover-motion.webp" width="100%" alt="LitFamily motion cover: five armored robots power on one by one, the LitGrok robot wakes with glowing eyes and a lit frame, then LITFAMILY and KEEP THE WORK LIT. light up." /></picture></p>

<h1 align="center">LitGrok</h1>
<p align="center"><strong>Keep the work lit.</strong></p>

Make something useful in Grok Build. Leave the checked result and the next step with your project.

**[Full guide and skills gallery on GitHub](https://github.com/wjgoarxiv/litgrok#readme)** · [한국어](https://github.com/wjgoarxiv/litgrok/blob/main/README_ko-KR.md) · [Install](#install-in-30-seconds) · [Reference](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/reference.md)

<p align="center">
<a href="#install-in-30-seconds"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/badge-version.svg" alt="1.0.10" /></a>
<a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/LICENSE"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/badge-license.svg" alt="MIT license" /></a>
</p>

<p align="center"><a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/reference.md"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/lucide-book-open.svg" width="16" alt="" /> Docs</a> &nbsp; <a href="#install-in-30-seconds">Install</a> &nbsp; <a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/cover-motion.webp"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/lucide-play.svg" width="16" alt="" /> Cover motion</a> &nbsp; <a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/LICENSE"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/assets/readme/lucide-shield-check.svg" width="16" alt="" /> MIT</a></p>

LitGrok gives Grok Build a way of working: plan the change, build it, check it, and leave a handoff the next session can read. It ships 38 skills, 11 agents, one project rule, and eleven hook registrations. Grok Build still runs the session and chooses the model.

## Install in 30 seconds

You need Node.js and Grok Build. In an interactive terminal, from the project you want to try:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok install
```

The files land in `<project>/.grok/`. Add `--user` to install under `~/.grok/` instead, or use `--package @litfamily/litgrok@1.0.10` to pin this release. Add `--dry-run` to see every destination before anything is written.

Trying a local package instead? Put its real absolute path in a variable, then run these two lines separately:

```bash
LITGROK_PACK='/absolute/path/to/the-provided-package.tgz'
npm exec --yes --package "$LITGROK_PACK" -- litgrok install
```

## The first thing to type

Open or restart Grok Build at the project's Git root, then review and trust its hooks with `/hooks-trust` (on the observed Grok Build 1.0.23 host, `grok --trust inspect --json` also works). A plain folder still loads skills and rules, but its hooks stay unavailable. Then send:

```text
/litwork Build a to-do list in one index.html with no external dependencies. Implement add, complete, and delete. Leave the checks performed and the next step. Do not open a browser automatically; give me the steps to check it myself.
```

Open `index.html` yourself and try adding, completing, and deleting an item. Leave any check you did not run marked unverified.

## Carry the work into the next session

For a larger change, start with `/lit-plan`, read the plan it saves, then run `/start-work <plan path>`. Before you stop, ask:

```text
/lit-handoff Record what we built, what we checked, and what remains. Tell me where you saved the handoff.
```

Next time, give Grok Build the path it returned and ask it to read the handoff and check the current files before continuing. A handoff does not resume anything on its own.

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

The installer copies the skills, agents, project rule, and hooks into `.grok/`. The eleven hook registrations in [`hooks/hooks.json`](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/hooks/hooks.json) run only in a trusted Git root, and they record the order of events in `.grok/litgrok/session-ledger/`. LitGrok does not schedule background work or keep going after the session ends.

An optional status row is available at user level with `install --user --status-line`. It adds `[ui.status_line]` to `~/.grok/config.toml` and backs up an existing file first.

## Safety and uninstall

The installer checks that it owns a file before it upgrades or removes it, and refuses to overwrite modified, foreign, or unsafe files. `CI`, `NO_COLOR` (even empty), `--no-color`, and `--dry-run` are no-write previews, even with `--yes`. A non-interactive run without `--yes` is a preview too.

Uninstall with the same scope you installed with:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok uninstall
npm exec --yes --package @litfamily/litgrok@latest -- litgrok uninstall --user
```

The installer never runs `git init`, grants hook trust, writes login state or API keys, or chooses a model. A passing package test does not prove live Grok behavior; check `/hooks` and `grok inspect --json` from the repository root in your own session.

## If something does not work

- **No hooks:** hooks need a trusted Git project root. For a new project, run `git init` yourself before trusting it; for an existing one, open Grok Build from its actual root.
- **Nothing was written:** one of the preview conditions above applied. Check that the installer reports actual writes.
- **No status row:** the row comes from user or administrator configuration. Grok does not read it from project or plugin configuration.

---

**[Full guide, skills gallery and troubleshooting on GitHub →](https://github.com/wjgoarxiv/litgrok#readme)**

[Reference](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/reference.md) · [Changelog](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/CHANGELOG.md) · [Privacy](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/docs/privacy.md) · [MIT license](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.10/LICENSE)

The cover is brand motion made with the LitFamily motion skill, not a recording of a Grok task execution.
