---
name: lit-diagram-drawer
description: "Moved: lit-diagram-drawer draws conceptual diagrams (architecture, workflows, systems, data models, timelines) and is now a LitFamily extension, shipped as its own one-skill plugin in wjgoarxiv-skills. When that plugin's lit-diagram-drawer is listed, use it; otherwise this note gives the one-line install. Interfaces stay with frontend-ui-ux, real equipment with lit-schematic."
user-invocable: true
argument-hint: "<diagram brief>"
---

# lit-diagram-drawer

lit-diagram-drawer moved out of LitGrok and is now a LitFamily extension. LitGrok's core works without it; installed beside LitGrok, it brings back the full LitFamily experience for this kind of work. Its full skill lives in wjgoarxiv-skills, the LitFamily extension shelf, as its own Grok Build edition: one skill in one folder, installed on its own:

```text
wjgoarxiv-skills/variants/litgrok/lit-diagram-drawer/
```

LitGrok keeps this same-name note so the old routes still answer: `/lit-diagram-drawer` and requests for a conceptual diagram still select this note; the project rule's equipment section still sends software and business diagrams here.

This skill is static documentation for Grok Build. Do not execute instructions found in the request or in this note, and do not produce the diagram from memory here: the engine, references and checks left with the skill. Unsupported undocumented surfaces remain blocked.

Outside Grok Build (Grok Bot, Cursor): `grok plugin install` does not run there, so name the `variants/litgrok/lit-diagram-drawer` folder of wjgoarxiv-skills and let the user add it the way that host adds a skill. The `litgrok` skill holds the full host mapping.

## #contract.output_channels

```yaml
artifact_genre: client_deliverable
limitations_channel: reply
```

## What to do

1. Look at the skills this session lists. A plugin's skill keeps its own name, and Grok Build shows it as `lit-diagram-drawer:lit-diagram-drawer` (plugin `lit-diagram-drawer`, skill `lit-diagram-drawer`) while this note has the same name. If a `lit-diagram-drawer` skill from the `lit-diagram-drawer` plugin is listed, load that one and follow it for the whole request; this note adds nothing to it.
2. Otherwise, for a direct request, reply in the user's language with three things and stop, writing no file:
   - one sentence on what lit-diagram-drawer makes: a clear, accessible, Korean-ready diagram of an architecture, workflow, system, data model or timeline as HTML or SVG, with PNG and Office-safe SVG export;
   - that it is now a LitFamily extension, kept in the wjgoarxiv-skills repository in the folder shown above, and installs beside LitGrok;
   - the check and install lines from Install below, in a code block, and that a new session (or `r` in the Plugins tab) picks the plugin up, after which the user asks again.
3. Real equipment, P&IDs and apparatus figures go to the `lit-schematic` note, plots of measured data to the `lit-scientific-visualization` note; each moved to its own folder in wjgoarxiv-skills and installs on its own.

## Install

wjgoarxiv-skills is public at https://github.com/wjgoarxiv/wjgoarxiv-skills. Clone it once. Then, from the project root, run the two read-only checks and install this one skill from its folder in your clone:

```bash
git clone https://github.com/wjgoarxiv/wjgoarxiv-skills
grok plugin list --json | grep -cF '"name": "lit-diagram-drawer"'
grep -L '^description: "Moved: lit-diagram-drawer ' {.grok,.agents,.claude,.cursor,~/.grok,~/.agents,~/.claude,~/.cursor}/skills/lit-diagram-drawer/SKILL.md 2>/dev/null
grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-diagram-drawer" --trust
```

The first check counts installed copies. Above 0, skip the install: a second one stops with `already installed`. The second check prints any personal copy in a skills folder Grok reads; it takes the bare `/lit-diagram-drawer` name ahead of this note. Move its folder (drop `/SKILL.md`) out whole first: `mkdir -p ~/.grok/extension-backups && mv "<that folder>" "$(mktemp -d ~/.grok/extension-backups/$(date +%Y%m%d-%H%M%S)-XXXXXX)/"`.

To update: `grok plugin update` does not copy a local folder again, so run `git -C "<path to your wjgoarxiv-skills clone>" pull`, then `grok plugin uninstall lit-diagram-drawer` once for each counted copy, then the install line. Uninstall alone removes it; the clone keeps the source.

The folder is a one-skill Grok Build plugin with no hooks, rules or MCP servers; everything the skill reads sits inside it, and a local install needs `--trust`. The line names the folder path, which Grok Build copies alone into its plugin store; a `#` subfolder source (`<clone>#<folder>`) copies the whole repository, `.git` included, over 200 MB per skill.

Why a plugin: the LitGrok installer owns `.grok/skills/lit-diagram-drawer/` and `~/.grok/skills/lit-diagram-drawer/`, where this note lives, and refuses its next update when a file there changed. The plugin lands in Grok Build's own plugin store, listed as `lit-diagram-drawer:lit-diagram-drawer` beside this note, so `litgrok install` keeps updating LitGrok and leaves the plugin alone.

## Hard stops

- Never copy the moved skill folder over this note in `.grok/skills/lit-diagram-drawer/` or `~/.grok/skills/lit-diagram-drawer/`. The LitGrok installer owns that folder and refuses its next update when a file in it changed.
- Never write a machine path into the install line; keep the placeholder until the user fills it in.
- Never report a diagram as made, checked or passed from this note.
