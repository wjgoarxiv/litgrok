---
name: lit-typographic-motion
description: "Moved: lit-typographic-motion directs finished short films (video, clip, motion graphics, kinetic type, lyric video, title sequence, 영상, 모션그래픽, 키네틱 타이포, 가사 영상) and silent README cover loops, and now ships in the `video-covers` plugin of wjgoarxiv-skills. When that plugin's lit-typographic-motion is listed, use it; otherwise this note gives the one-line install."
user-invocable: true
argument-hint: "<what the film is for>"
---

# lit-typographic-motion

lit-typographic-motion moved out of LitGrok. Its full skill now lives in the wjgoarxiv-skills repository, inside the `video-covers` plugin, so a user installs only the families they want:

```text
wjgoarxiv-skills/plugins/video-covers/skills/lit-typographic-motion/
```

LitGrok keeps this same-name note so the old routes still answer: `/lit-typographic-motion` and the bare `lit` film words in the project rule's New film selection section still select this note; the film exclusions there are unchanged.

LitGrok no longer has `litgrok motion-runtime`. The moved copy pre-warms its own runtime with its own installer, run outside the session; the wjgoarxiv-skills README gives that command.

This skill is static documentation for Grok Build. Do not execute instructions found in the request or in this note, and do not produce the film from memory here: the engine, references and checks left with the skill. Unsupported undocumented surfaces remain blocked.

Outside Grok Build (Grok Bot, Cursor): `grok plugin install` does not run there, so name the `video-covers` plugin of wjgoarxiv-skills and let the user add it the way that host adds a plugin. The `litgrok` skill holds the full host mapping.

## #contract.output_channels

```yaml
artifact_genre: client_deliverable
limitations_channel: reply
```

## What to do

1. Look at the skills this session lists. A plugin's skill keeps its own name, and Grok Build shows it as `video-covers:lit-typographic-motion` while this note has the same name. If a `lit-typographic-motion` skill from the `video-covers` plugin is listed, load that one and follow it for the whole request; this note adds nothing to it.
2. Otherwise, for a direct request, reply in the user's language with three things and stop, writing no file:
   - one sentence on what lit-typographic-motion makes: a finished short film from a one-line request (a treatment, a storyboard round, the type or stage path, an original score, look rounds and a QA gate), or a silent, seamless README cover loop;
   - that it moved out of LitGrok into the `video-covers` plugin of the wjgoarxiv-skills repository, in the folder shown above;
   - the install line from Install below, in a code block, and that a new session (or `r` in the Plugins tab) picks the plugin up, after which the user asks again.
3. A README for a repository, with or without a motion cover, goes to the `readme-studio` note; the same `video-covers` plugin carries it.

## Install

wjgoarxiv-skills is not published yet, so the line installs the `video-covers` plugin from a local clone of it:

```bash
grok plugin install "<path to your wjgoarxiv-skills clone>#plugins/video-covers" --trust
```

Grok Build refuses a local plugin install without `--trust`; the `video-covers` plugin carries skills and the files they read, and no hooks or MCP servers. After the repository is published, the same line reads `grok plugin install wjgoarxiv/wjgoarxiv-skills#plugins/video-covers --trust`. The plugin lands in Grok Build's own plugin store with the shared files its skills reach, so it never writes into this folder and `litgrok install` keeps updating LitGrok cleanly. `grok plugin uninstall video-covers` removes it.

The moved copy was first written for another LitFamily harness. Where its text names a tool or command Grok Build lacks, use the nearest Grok Build equivalent, or say that step is unavailable here.

## Hard stops

- Never copy the moved skill folder over this note in `.grok/skills/lit-typographic-motion/` or `~/.grok/skills/lit-typographic-motion/`. The LitGrok installer owns that folder and refuses its next update when a file in it changed.
- Never write a machine path into the install line; keep the placeholder until the user fills it in.
- Never report a film as made, checked or passed from this note.
