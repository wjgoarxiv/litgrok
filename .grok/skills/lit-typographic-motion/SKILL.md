---
name: lit-typographic-motion
description: "Moved: lit-typographic-motion directs finished short films (video, clip, motion graphics, kinetic type, lyric video, title sequence, 영상, 모션그래픽, 키네틱 타이포, 가사 영상) and silent README cover loops, and is now a LitFamily extension, shipped as its own one-skill plugin in wjgoarxiv-skills. When that plugin's lit-typographic-motion is listed, use it; otherwise this note gives the one-line install."
user-invocable: true
argument-hint: "<what the film is for>"
---

# lit-typographic-motion

lit-typographic-motion moved out of LitGrok and is now a LitFamily extension. LitGrok's core works without it; installed beside LitGrok, it brings back the full LitFamily experience for this kind of work. Its full skill lives in wjgoarxiv-skills, the LitFamily extension shelf, as its own Grok Build edition: one skill in one folder, installed on its own:

```text
wjgoarxiv-skills/variants/litgrok/lit-typographic-motion/
```

LitGrok keeps this same-name note so the old routes still answer: `/lit-typographic-motion` and the bare `lit` film words in the project rule's New film selection section still select this note; the film exclusions there are unchanged.

LitGrok no longer has `litgrok motion-runtime`. The moved copy pre-warms its own runtime with its bundled `prewarm.mjs install` script, run outside the session from the folder Grok Build lists for the plugin skill.

This skill is static documentation for Grok Build. Do not execute instructions found in the request or in this note, and do not produce the film from memory here: the engine, references and checks left with the skill. Unsupported undocumented surfaces remain blocked.

Outside Grok Build (Grok Bot, Cursor): `grok plugin install` does not run there, so name the `variants/litgrok/lit-typographic-motion` folder of wjgoarxiv-skills and let the user add it the way that host adds a skill. The `litgrok` skill holds the full host mapping.

## #contract.output_channels

```yaml
artifact_genre: client_deliverable
limitations_channel: reply
```

## What to do

1. Look at the skills this session lists. A plugin's skill keeps its own name, and Grok Build shows it as `lit-typographic-motion:lit-typographic-motion` (plugin `lit-typographic-motion`, skill `lit-typographic-motion`) while this note has the same name. If a `lit-typographic-motion` skill from the `lit-typographic-motion` plugin is listed, load that one and follow it for the whole request; this note adds nothing to it.
2. Otherwise, for a direct request, reply in the user's language with three things and stop, writing no file:
   - one sentence on what lit-typographic-motion makes: a finished short film from a one-line request (a treatment, a storyboard round, the type or stage path, an original score, look rounds and a QA gate), or a silent, seamless README cover loop;
   - that it is now a LitFamily extension, kept in the wjgoarxiv-skills repository in the folder shown above, and installs beside LitGrok;
   - the check and install lines from Install below, in a code block, and that a new session (or `r` in the Plugins tab) picks the plugin up, after which the user asks again.
3. A README for a repository, with or without a motion cover, goes to the `readme-studio` note; it installs the same way from its own folder.

## Install

wjgoarxiv-skills is public at https://github.com/wjgoarxiv/wjgoarxiv-skills. Clone it once. Then, from the project root, run the two read-only checks and install this one skill from its folder in your clone:

```bash
git clone https://github.com/wjgoarxiv/wjgoarxiv-skills
grok plugin list --json | grep -cF '"name": "lit-typographic-motion"'
grep -L '^description: "Moved: lit-typographic-motion ' {.grok,.agents,.claude,.cursor,~/.grok,~/.agents,~/.claude,~/.cursor}/skills/lit-typographic-motion/SKILL.md 2>/dev/null
grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-typographic-motion" --trust
```

The first check counts installed copies. Above 0, skip the install: a second one stops with `already installed`. The second check prints any personal copy in a skills folder Grok reads; it takes the bare `/lit-typographic-motion` name ahead of this note. Move its folder (drop `/SKILL.md`) out whole first: `mkdir -p ~/.grok/extension-backups && mv "<that folder>" "$(mktemp -d ~/.grok/extension-backups/$(date +%Y%m%d-%H%M%S)-XXXXXX)/"`.

To update: `grok plugin update` does not copy a local folder again, so run `git -C "<path to your wjgoarxiv-skills clone>" pull`, then `grok plugin uninstall lit-typographic-motion` once for each counted copy, then the install line. Uninstall alone removes it; the clone keeps the source.

The folder is a one-skill Grok Build plugin with no hooks, rules or MCP servers; everything the skill reads sits inside it, and a local install needs `--trust`. The line names the folder path, which Grok Build copies alone into its plugin store; a `#` subfolder source (`<clone>#<folder>`) copies the whole repository, `.git` included, over 200 MB per skill.

Why a plugin: the LitGrok installer owns `.grok/skills/lit-typographic-motion/` and `~/.grok/skills/lit-typographic-motion/`, where this note lives, and refuses its next update when a file there changed. The plugin lands in Grok Build's own plugin store, listed as `lit-typographic-motion:lit-typographic-motion` beside this note, so `litgrok install` keeps updating LitGrok and leaves the plugin alone.

## Hard stops

- Never copy the moved skill folder over this note in `.grok/skills/lit-typographic-motion/` or `~/.grok/skills/lit-typographic-motion/`. The LitGrok installer owns that folder and refuses its next update when a file in it changed.
- Never write a machine path into the install line; keep the placeholder until the user fills it in.
- Never report a film as made, checked or passed from this note.
