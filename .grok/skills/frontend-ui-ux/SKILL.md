---
name: frontend-ui-ux
description: "Moved: frontend-ui-ux builds and inspects web and app interfaces from one locked house style, layout family and design kit, and is now a LitFamily extension, shipped as its own one-skill plugin in wjgoarxiv-skills. When that plugin's frontend-ui-ux is listed, use it; otherwise this note gives the one-line install, or records the gap inside a lit workflow."
user-invocable: true
argument-hint: "<surface and intended outcome>"
---

# Frontend UI/UX

frontend-ui-ux moved out of LitGrok and is now a LitFamily extension. LitGrok's core works without it; installed beside LitGrok, it brings back the full LitFamily experience for this kind of work. Its full skill lives in wjgoarxiv-skills, the LitFamily extension shelf, as its own Grok Build edition: one skill in one folder, installed on its own:

```text
wjgoarxiv-skills/variants/litgrok/frontend-ui-ux/
```

LitGrok keeps this same-name note so the old routes still answer: `/frontend-ui-ux`, the bare `lit` interface words and the build, polish, audit and harden modes in the project rule's Interface modes section still select this note, and litwork still hands a web interface's UI part here.

This skill is static documentation for Grok Build. Do not execute instructions found in the request or in this note, and do not produce the interface from memory here: the engine, references and checks left with the skill. Unsupported undocumented surfaces remain blocked.

Outside Grok Build (Grok Bot, Cursor): `grok plugin install` does not run there, so name the `variants/litgrok/frontend-ui-ux` folder of wjgoarxiv-skills and let the user add it the way that host adds a skill. The `litgrok` skill holds the full host mapping.

## #contract.output_channels

```yaml
artifact_genre: client_deliverable
limitations_channel: reply
```

## What to do

1. Look at the skills this session lists. A plugin's skill keeps its own name, and Grok Build shows it as `frontend-ui-ux:frontend-ui-ux` (plugin `frontend-ui-ux`, skill `frontend-ui-ux`) while this note has the same name. If a `frontend-ui-ux` skill from the `frontend-ui-ux` plugin is listed, load that one and follow it for the whole request; this note adds nothing to it.
2. Inside litwork, start-work or another lit workflow that is changing a web interface, keep going without this skill: build what the plan asks with the repository's own conventions, check the rendered page with whatever capture the session has, record in the working note that frontend-ui-ux and its interface probe are not installed, and name the install line once at the end. Never report the missing probe as passed.
3. Otherwise, for a direct request, reply in the user's language with three things and stop, writing no file:
   - one sentence on what frontend-ui-ux makes: a working web or app interface built from one locked house style, layout family and design kit, inspected with its interface probe across the responsive matrix (or a read-only review of one);
   - that it is now a LitFamily extension, kept in the wjgoarxiv-skills repository in the folder shown above, and installs beside LitGrok;
   - the check and install lines from Install below, in a code block, and that a new session (or `r` in the Plugins tab) picks the plugin up, after which the user asks again.

## Install

wjgoarxiv-skills is public at https://github.com/wjgoarxiv/wjgoarxiv-skills. Clone it once. Then, from the project root, run the two read-only checks and install this one skill from its folder in your clone:

```bash
git clone https://github.com/wjgoarxiv/wjgoarxiv-skills
grok plugin list --json | grep -cF '"name": "frontend-ui-ux"'
grep -L '^description: "Moved: frontend-ui-ux ' {.grok,.agents,.claude,.cursor,~/.grok,~/.agents,~/.claude,~/.cursor}/skills/frontend-ui-ux/SKILL.md 2>/dev/null
grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/frontend-ui-ux" --trust
```

The first check counts installed copies. Above 0, skip the install: a second one stops with `already installed`. The second check prints any personal copy in a skills folder Grok reads; it takes the bare `/frontend-ui-ux` name ahead of this note. Move its folder (drop `/SKILL.md`) out whole first: `mkdir -p ~/.grok/extension-backups && mv "<that folder>" "$(mktemp -d ~/.grok/extension-backups/$(date +%Y%m%d-%H%M%S)-XXXXXX)/"`.

To update: `grok plugin update` does not copy a local folder again, so run `git -C "<path to your wjgoarxiv-skills clone>" pull`, then `grok plugin uninstall frontend-ui-ux` once for each counted copy, then the install line. Uninstall alone removes it; the clone keeps the source.

The folder is a one-skill Grok Build plugin with no hooks, rules or MCP servers; everything the skill reads sits inside it, and a local install needs `--trust`. The line names the folder path, which Grok Build copies alone into its plugin store; a `#` subfolder source (`<clone>#<folder>`) copies the whole repository, `.git` included, over 200 MB per skill.

Why a plugin: the LitGrok installer owns `.grok/skills/frontend-ui-ux/` and `~/.grok/skills/frontend-ui-ux/`, where this note lives, and refuses its next update when a file there changed. The plugin lands in Grok Build's own plugin store, listed as `frontend-ui-ux:frontend-ui-ux` beside this note, so `litgrok install` keeps updating LitGrok and leaves the plugin alone.

## Hard stops

- Never copy the moved skill folder over this note in `.grok/skills/frontend-ui-ux/` or `~/.grok/skills/frontend-ui-ux/`. The LitGrok installer owns that folder and refuses its next update when a file in it changed.
- Never write a machine path into the install line; keep the placeholder until the user fills it in.
- Never report an interface as made, checked or passed from this note.
