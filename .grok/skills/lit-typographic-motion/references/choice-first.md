# Choose the house style first

A film has no default look. Before the treatment names a style, ask the user to
choose one: a numbered choice in the reply, the recommended style first with a
one-sentence reason, then the alternatives. Skip only when the prompt names the
style or says you choose; under bare `lit` the delegation is implicit, so choose
and label the default. A named style is never re-asked.

## Candidates

| # | Style | Character | Reach for it when |
|---|-------|-----------|-------------------|
| 1 | `swiss-signal` | Dark ink ground, bone type, one teal signal; type lands exactly and cuts hard | Nothing in the request picks another (the default) |
| 2 | `tidal` | Deep blue drift, pale type riding the current, one coral accent | The film flows, swells, or runs calm and slow |
| 3 | `terminalcore` | Phosphor console type at typing pace, one signal hue, hard cuts | The film is about code, systems, or logs |
| 4 | `paper` | Warm paper ground, near-black ink, soft springs, a calm hand | The film teaches, prints, or stays gentle |

On the type path, `paper` is out (it has no type preset); recommend from the other three.

## Recommendation order

Recommend the style `pickStyle` would take, and say why in one sentence:

1. The request names it (`swiss-signal`, `tidal`, `terminalcore`, `paper`, or a clear paraphrase).
2. The project's `motion-house.json` names it.
3. A keyword in the request or copy picks it (code, console, flow, calm, paper, teach).
4. The genre picks it (explainer → `paper`, brand-mood → `tidal`).
5. Otherwise `swiss-signal`.

Put the chosen style in the treatment and name it in the reply. The `styles` command renders the same demo film in every house style for comparison when the user asks to see them.
