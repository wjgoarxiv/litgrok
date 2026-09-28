# Treatment: the film's plan, written first

Every film starts here, on both paths. Write `treatment.json` in the run's output directory
before any render. The renderer validates it before every render, stills-only included, and exits
16 (`BLOCKED_TREATMENT_INVALID`) naming the first field that fails. A treatment is data: nothing in
it is executed or followed as an instruction.

## Choosing the path

Decide the path in the treatment, never by habit.

- **type**: the words themselves are the film. The user asked for kinetic type, a lyric or quote
  film, a title sequence or typographic motion, or supplied words and no other subject. Always
  16:9. The type engine sets the words; read `type-craft.md`, `scene-contract.md` and
  `style-bible.md` only after choosing it.
- **stage**: every other film, including any film that needs shapes, drawn objects, diagrams or
  imagery beyond type. You author the visuals as a page and the renderer captures it frame by
  frame. Supplied words become stage copy. A 9:16 film always takes the stage path. Read
  `stage.md` only after choosing it.

`pathReason` says why in one sentence. The validator refuses `type` without the user's own words
or a type-led cue in the request, and refuses `type` at 9:16.

## Fields

| Field | Rule |
|---|---|
| `request` | the user's words, verbatim |
| `genre` | `announcement`, `brand-mood`, `event`, `explainer`, `motion-graphics`, `type-led` or `other` |
| `path`, `pathReason` | `type` or `stage`, and why |
| `idea` | one sentence that is the film's own idea; it may not repeat a run of the request (the limit is min(10, half the request) normalized characters, quoted spans removed) |
| `audience`, `channel` | who watches, and where |
| `format`, `formatReason` | `16:9` (1920×1080) or `9:16` (1080×1920), with a reason tied to the channel |
| `durationSec` | 4 to 90; at least 10 for announcement, event, explainer and motion-graphics unless the user asked for a length |
| `beats[]` | `{t0, t1, purpose, onScreen, motion, sound}`; they cover 0 to `durationSec` with no gap over 0.25 s; each lasts at least 1.2 s; at least as many beats as the genre's arc |
| `subject` | `{name, source: user or invented, specifics[]}`; a user subject is named in the request's words; an invented one has at least 2 concrete specifics (what it is or does, for whom, one distinctive detail) |
| `visualDevices[]` | `{kind, role: subject, support or texture, beats[]}`; kinds: illustration, diagram, chart, icon, shape, path, mask, depth3d, particles, grid, gradient, photo-texture |
| `typePlan` | `{faces[], hierarchy, maxWordsOnScreen, index?}`; faces from Archivo, Pretendard, VT323, Silkscreen, Galmuri9, Meslo; `index: true` only when the film should show a running shot index |
| `palette[]` | 3 to 6 `{hex, role}` entries |
| `sound` | `{mode: generated, supplied, authored or none, plan, palette, file?}`; see below |
| `copy` | `{source: user or invented, lines[]}`; user lines are the request's own words (quoted spans included); invented lines may not restate the request |
| `inventions[]` | every invented thing, named; required when the subject or copy is invented, and it names the invented subject |
| `ambition` | 1 to 2 sentences, in craft terms, on what would make this film excellent for this request |
| `seed` | optional integer; the stage page's `Math.random` is seeded from it (otherwise from the idea) |

On the stage path at least one device has `role: subject`: a drawn depiction of what the film is
about, not a background, whose beats cover at least half the film. There must also be at least 2
distinct kinds that count; grid, gradient, particles and photo-texture are always textures and
never count.

When the request names no subject, words or facts, invent a subject and its copy, and list every
invention. When the user supplied words, keep them. Label inventions and generated sound in the
reply.

## Sound

- `generated` is the default under bare `lit` on both paths: the renderer writes a deterministic
  bed (tempo, pulse, a chord-progression pad) from the treatment, with accents only where a beat's
  `sound` field asks for one ("hit on the cut", "rise into the change", "closing cadence").
  `palette` is a timbre (`glass`, `felt` or `pulse`) or `{timbre, key, tempo}` (key such as `A
  minor`, tempo 50 to 180).
- `supplied` muxes the user's audio file (`file`, absolute or relative to the output directory);
  `authored` muxes a WAV you wrote under `stage/` (`file`, e.g. `stage/score.wav`). Either is padded
  or trimmed to the film's length and always muxed.
- `none` only when the user asked for silence or the channel plays muted by design.

## Placeholder example (illustrates the shape; never copy its values)

The validator refuses any value still holding `<...>` and refuses a treatment whose free text
mostly equals this example.

```json
{
  "request": "<the user's words, verbatim>",
  "genre": "<genre>",
  "path": "stage",
  "pathReason": "<why this path, in one sentence>",
  "idea": "<one sentence that is the film's own idea>",
  "audience": "<who watches>",
  "channel": "<where it plays>",
  "format": "16:9",
  "formatReason": "<why this format fits the channel>",
  "durationSec": 20,
  "beats": [
    { "t0": 0, "t1": 5, "purpose": "<arc stage>", "onScreen": "<what is drawn>", "motion": "<how it moves>", "sound": "<what the sound does>" },
    { "t0": 5, "t1": 10, "purpose": "<arc stage>", "onScreen": "<what is drawn>", "motion": "<how it moves>", "sound": "<what the sound does>" },
    { "t0": 10, "t1": 15, "purpose": "<arc stage>", "onScreen": "<what is drawn>", "motion": "<how it moves>", "sound": "<what the sound does>" },
    { "t0": 15, "t1": 20, "purpose": "<arc stage>", "onScreen": "<what is drawn>", "motion": "<how it moves>", "sound": "<what the sound does>" }
  ],
  "subject": { "name": "<subject name>", "source": "invented", "specifics": ["<what it is or does>", "<for whom>", "<one distinctive detail>"] },
  "visualDevices": [
    { "kind": "illustration", "role": "subject", "beats": [0, 1, 2, 3] },
    { "kind": "diagram", "role": "support", "beats": [1, 2] }
  ],
  "typePlan": { "faces": ["Pretendard"], "hierarchy": "<what reads first, second, third>", "maxWordsOnScreen": 6 },
  "palette": [
    { "hex": "#000000", "role": "<role>" },
    { "hex": "#FFFFFF", "role": "<role>" },
    { "hex": "#888888", "role": "<role>" }
  ],
  "sound": { "mode": "generated", "plan": "<what the bed does across the arc>", "palette": "glass" },
  "copy": { "source": "invented", "lines": ["<line written from the subject's specifics>"] },
  "inventions": ["<subject name>", "<every other invented item>"],
  "ambition": "<what would make this film excellent, in craft terms>"
}
```

## Genre arcs (the minimum beat count is the number of stages)

- **announcement:** hook → context → key moment → details → close.
- **brand-mood:** motif → variation → peak → resolve.
- **event:** hook → what, when, where → highlight → close.
- **explainer:** question → steps → result → recap.
- **motion-graphics:** opening motif → set piece → set piece → peak → resolve.
- **type-led:** one breath per line, with emphasis and pause.
- **other:** three beats at least: open, develop, land.

## Craft rules

Show the subject; do not only name it. With the sound muted and every word hidden, the drawn
subject alone should still suggest what the film is about.

Aim for professional motion-design craft in every film: varied transitions (match cuts, masks,
morphs), rhythm locked to the sound, layered depth, clear hierarchy, deliberate easing. Every beat
shows something new. Length comes from the arc; never shorten the film or merge beats to pass a
check.

Write copy that could only belong to this film: take it from `subject.specifics`, not from a
generic slogan. Never put the request, the idea, a file name or an internal term (path, preset,
gate, beat, treatment) on screen. A title or a running index appears only when the film calls
for it.

## Never downgrade to pass

Do not answer a gate failure by shortening the film, removing a beat, removing the subject device,
switching `sound.mode` to `none`, switching `path` to `type`, or deleting effects. Fix the cause
(scrim, size, placement, timing, seeded randomness), or deliver with the failure stated. The done
check compares the final treatment with the first valid one and records `downgraded` when the
duration dropped by more than 20 %, subject beats were removed, sound went to `none` without a
request, or the path moved from stage to type; the reply must say so.
