<p align="center"><picture><source media="(prefers-reduced-motion: reduce)" srcset="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/assets/cover-motion-still.webp" /><source media="(prefers-reduced-motion: no-preference)" srcset="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/assets/cover-motion.webp" /><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/assets/cover-motion.webp" width="100%" alt="LitFamily motion cover: seven armored robots power on one by one, the LitGrok robot wakes with glowing eyes and a lit frame, then LITFAMILY and KEEP THE WORK LIT. light up." /></picture></p>

<h1 align="center">LitGrok</h1>
<p align="center"><strong>Keep the work lit.</strong></p>

LitGrok is an add-on for xAI's Grok Build. It makes Grok check its own work before it says "done", and leaves a note so the next session starts where this one stopped. One npm command adds its skills, project rule and hooks to your project.

**[Full README on GitHub](https://github.com/wjgoarxiv/litgrok#readme)** · [Guide](https://github.com/wjgoarxiv/litgrok/blob/main/docs/guide.md) · [All skills](https://github.com/wjgoarxiv/litgrok/blob/main/docs/skills.md) · [한국어](https://github.com/wjgoarxiv/litgrok/blob/main/README_ko-KR.md) · [Install](#install-in-30-seconds) · [Reference](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/reference.md)

<p align="center">
<a href="#install-in-30-seconds"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/assets/readme/badge-version.svg" alt="1.0.40" /></a>
<a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/LICENSE"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/assets/readme/badge-license.svg" alt="MIT license" /></a>
</p>

<p align="center"><a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/reference.md"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/assets/readme/lucide-book-open.svg" width="16" alt="" /> Docs</a> &nbsp; <a href="#install-in-30-seconds">Install</a> &nbsp; <a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/assets/cover-motion.webp"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/assets/readme/lucide-play.svg" width="16" alt="" /> Cover motion</a> &nbsp; <a href="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/LICENSE"><img src="https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/assets/readme/lucide-shield-check.svg" width="16" alt="" /> MIT</a></p>

You ask Grok Build for a feature. It writes the code and says it is finished, and a day later you find the tests never ran. You open a new session and explain the whole project again.

With LitGrok you start the same request with `lit`. Grok first writes down what "finished" means for this task, adds a test that fails, makes it pass, and ends by telling you what it checked and what it could not. When you stop, type `handoff`. Grok saves a note, and the next session reads it before it carries on.

It ships 42 skills, 11 agents, one project rule, and twelve hook registrations. Grok Build still runs the session and chooses the model. It suits work that runs longer than one sitting, such as a feature spread over a few days or a report someone else will read.

## Two ways to use it

**The easy way.** Start your request with `lit` and write the rest as usual:

```text
lit fix the date parsing bug in src/dates.js, with a test
```

Grok sets the goal, writes a failing test, fixes the bug, checks the result and tells you what it checked. Most tasks need nothing more.

Grok Build starts this a little differently from other agents. It does not pass a prompt hook's reply on to the model, so no hook can switch `lit` on for you. Instead, Grok reads LitGrok's project rule on every turn. The rule treats `lit` at the start of a prompt as the signal, and Grok then picks the matching skill itself; for a code change that is usually `litwork`. When you want to be sure which skill runs, type its name as a slash command: `/litwork fix the date parsing bug in src/dates.js, with a test` does the same job.

**The full workflow.** For a bigger job, go one step at a time. Each step hands its result to the next, and you can skip any step you do not need. Every step is a skill you call by name with a slash.

| Step | Type | What happens |
| --- | --- | --- |
| 1. Explore | `/lit-brainstorm <question>` | Many options, scored, cut to a short list you pick from |
| 2. Clarify | `/deep-interview <idea>` | Grok asks questions until the goal is clear |
| 3. Plan | `/lit-crucible <approach>` or `/lit-plan <task>` | Crucible attacks the approach first and hands what survives to planning; lit-plan writes the steps to `plans/` and waits for your yes |
| 4. Build | `yes` to the plan, or `/litwork <task>` | An exact `yes` starts `/start-work` on the plan; `/litwork` runs a task that has no plan, with tests and checks |
| 5. Review | `/review-work` | Read-only review lanes, findings first |
| 6. Hand off | `handoff` or `/lit-handoff` | What was built, checked and left, saved to `.handoff/HANDOFF.md` |

Install with one line from your project's folder, then restart Grok Build from the Git root and trust the hooks in `/hooks-trust` ([The first thing to type](#the-first-thing-to-type) has the full first run):

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok install
```

## Install in 30 seconds

You need Node.js and Grok Build. In an interactive terminal, from the project you want to try:

```bash
npm exec --yes --package @litfamily/litgrok@latest -- litgrok install
```

The files land in `<project>/.grok/`. Add `--user` to install under `~/.grok/` instead, or use `--package @litfamily/litgrok@1.0.40` to pin this release. Add `--dry-run` to see every destination before anything is written.

Trying a local package instead? Put its real absolute path in a variable, then run these two lines separately:

```bash
LITGROK_PACK='/absolute/path/to/the-provided-package.tgz'
npm exec --yes --package "$LITGROK_PACK" -- litgrok install
```

## The first thing to type

Open (or restart) Grok Build from the project's Git root. Grok runs project hooks only after you trust them, so review and trust them in `/hooks-trust`; on Grok Build 1.0.13, `grok --trust inspect --json` did the same. In a plain folder without Git, the skills and rules load but the hooks stay off. Then send:

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
| `/lit-brainstorm` | Opens a question into many options and a short list to pick from. |
| `/lit-plan` | Writes a plan with concrete checks. |
| `/start-work <approved-plan>` | Executes a plan you approved. |
| `/review-work` | Reviews a plan before work or a change after it, with its evidence. |
| `/litresearch` | Runs bounded, source-traceable research without overstating the evidence. |

`/skills` lists everything your session loaded. The [skills gallery on GitHub](https://github.com/wjgoarxiv/litgrok/blob/main/docs/skills.md) shows all 42 with a picture of each result.

Beyond code, `lit-pptx` and `lit-docx` point you to wjgoarxiv-skills for slide decks, reports and Word documents, each in a design direction it picks for the job and names in the reply with two alternatives (thirteen for decks, six restrained ones for documents); `/frontend-ui-ux` points you to wjgoarxiv-skills, which builds and checks interfaces, `/readme-studio` points you to wjgoarxiv-skills, which writes source-checked READMEs, `lit-humanizer` rewrites stiff English or Korean prose, `lit-schematic` points you to wjgoarxiv-skills, which draws checked P&IDs, equipment layouts and isometric cutaways, `lit-hijack` ports published techniques clean-room with provenance, licence gate and parity proof, `lit-adhd` answers "where was I" across every recent session in a six-line card (`lit adhd recap` replays them), `ultra-brainstorm` runs a hundred or more cheap idea agents as one workflow after showing the cost, and `lit team <goal>` turns the session into the orchestrator of its own team.

## What changes after install

The installer copies the skills, agents, project rule, and hooks into `.grok/`. The twelve hook registrations in [`hooks/hooks.json`](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/hooks/hooks.json) run only in a trusted Git root, and they log the order of events in `.grok/litgrok/session-ledger/`. Everything runs inside your Grok session, and nothing runs in the background; when the session ends, the work waits for the next one.

If you'd like a status row showing the active LitGrok skill, the model and how much context is used, add it with `install --user --status-line`. It writes `[ui.status_line]` into `~/.grok/config.toml` and backs up an existing file first. Once a prompt starts a workflow skill, the row also shows the workflow stage, the tool running now and the last test result. Add `--notify` for Grok's terminal notification when a turn finishes.

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

If the hooks don't show up, check where Grok Build was opened. Grok runs hooks only from a trusted Git project root, so in a new project run `git init` yourself and then trust it, and in an existing one open Grok Build from its real root.

If the installer wrote nothing, the output says `no files written` and names the reason: `DRY RUN`, `NO COLOR` or `NON-INTERACTIVE`. Fix that case from the list above and run the install again.

If the status row is missing, add it with `install --user --status-line`. Grok reads the row only from user or administrator configuration, which is why a project install can't turn it on.

---

**[Guide with screenshots, install options and troubleshooting on GitHub →](https://github.com/wjgoarxiv/litgrok/blob/main/docs/guide.md)**

If LitGrok saves you some re-explaining, a [star on GitHub](https://github.com/wjgoarxiv/litgrok) helps other Grok Build users find it.

[Reference](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/reference.md) · [Changelog](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/CHANGELOG.md) · [Privacy](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/docs/privacy.md) · [MIT license](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/LICENSE) · [Trademark policy](https://cdn.jsdelivr.net/npm/@litfamily/litgrok@1.0.40/TRADEMARK.md)

The cover is brand motion made with the LitFamily motion skill: animated artwork, with no Grok session recorded in it.
