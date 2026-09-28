# Craft loop: phases, look rounds and done

This is the working order for one film on either path. The renderer draws, captures and measures;
the agent directs, looks and fixes. A gate PASS proves hygiene (flash safety, legibility, size,
determinism), not quality, so a PASS never ends the loop by itself.

## Phase 0: treatment

Write `treatment.json` in the output directory (`treatment.md`). Under bare `lit` ask no questions:
keep the user's words when they supplied words; otherwise write the copy from the treatment's
`subject` and list every invention. Label every default in the reply (format, duration, faces,
preset, sound palette). Length comes from the genre's arc, not from a wish to keep the film short.

## Phase 1: path

The treatment's `path` decides the renderer: `make` for the type path (the words themselves are the
film), `stage` for everything else. Read only that path's references. Supplied words on the stage
path become stage copy.

## Phase 2: round 1 is always a stills round

Run `make --out <dir> --stills-only` or `stage --out <dir> --stills-only`. Every render, stills-only
or full, writes the stills set and lists it in `stills/index.json`:

- one frame at the midpoint of every beat;
- a transition strip per cut (the frames 6 before, at, and 6 after the cut);
- a 12-frame contact sheet (`stills/contact-sheet.png`);
- after a full render, the poster.

Open every listed PNG with the host's image tool and actually view it. A file listing, OCR or pixel
statistics are not a look; record them only as `aids`. Then write the answers file and run
`look --out <dir> --round 1 --answers <file>`. Round 1 must name the weakest beat and the change you
made because of it (`change` is required). Make that change before the full render.

## Phase 3: full render

`make --out <dir> --round 2` or `stage --out <dir> --round 2`. Give the call a timeout of at least
600 s. Never shorten the film, merge beats or drop effects to save render time. The render writes
the film, preview, poster, reduced-motion still, a new stills set, `manifest.json`,
`gate-report.txt` and, for a generated bed, `sound.wav` and `sound-cues.json`.

## Phase 4: look rounds

Look at the new stills (poster, contact sheet, every beat midpoint and every transition strip) and
record `look --round 2`. Rounds share one counter with renders, 1 to 3. The answers file is JSON:

```json
{ "viewed": ["stills/contact-sheet.png", "..."], "weakestBeat": 0, "change": "<what you changed>", "answers": [ { "q": 1, "verdict": "<yes or no or a sentence>", "frame": "stills/contact-sheet.png", "observed": "<a concrete visible detail in that frame>" } ] }
```

`observed` names something concretely visible in that frame, in at least one sentence; a bare yes or
no is refused. `look` refuses a frame that is not in the latest stills set and stamps the round with
the SHA-256 of the stills manifest and of every listed frame. When no image tool is reachable, run
`look --out <dir> --round N --blocked no-vision-tool`; the done-check then ends `DONE_UNVIEWED` and
the reply says plainly that nobody viewed the frames.

The nine questions, answered every round:

1. "A stranger would say this film is for: ..." (answered without rereading the request or the treatment).
2. Does every beat show its `onScreen` plan?
3. Is the craft at the level `ambition` asks for (transitions, rhythm, depth, hierarchy)?
4. Is any request text, meta label, placeholder, file name or internal term on screen?
5. Does the ending land?
6. Does the sound follow the cuts? Answer from `sound-cues.json`.
7. Name one thing a skilled motion designer, given only the request, would have shown that this film does not.
8. Is any element on screen without a job in its beat?
9. Could every copy line be pasted unchanged into a film about a different subject?

A "no" on 1, 2, 3, 5 or 6, a "yes" on 4, 8 or 9, or a nameable answer to 7 requires another round:
fix the cause, render again with the next round number, and look again. After round 3, deliver with
the open items stated plainly. On a "yes" to 9, rewrite the copy from `subject.specifics`.

## Phase 5: done and the reply

`node scripts/motion.mjs verify --out <dir>` prints DONE only when all of these hold: gate PASS, a
valid treatment, at least 2 look rounds (the round-1 stills round with a change, then a last round),
the last round's stills-manifest hash equals the final full render's, and the last round viewed the
poster, the contact sheet, every beat midpoint and every transition strip. It prints the missing
item otherwise. It also compares the final treatment with the first valid one and records
`downgraded` when the duration fell by more than 20 %, subject beats were removed, sound went to
`none` without a request, or the path moved from stage to type. Round 3 with a remaining FAIL is
delivered with the failed rules named; an MO-C-03 flash FAIL is withheld in every round.

## Never downgrade to pass

Do not answer a FAIL by shortening the film, removing a beat or the subject device, switching sound
to `none`, switching the path to type, or deleting effects. Fix the cause: a scrim behind copy, a
larger size, a placement inside the safe box, a longer hold, seeded randomness. Or deliver with the
failure stated.

## Gate table (both paths)

| Rule | What fails | Usual fix |
|---|---|---|
| MO-C-03 | more than 3 general or 3 red flashes in a 1 s window (master or looping preview); exports withheld | slower changes, smaller bright areas, softer cuts |
| MO-C-04 / title-safe | copy outside the central 90 % | move or wrap the line |
| MO-C-06 / contrast | copy under 4.5:1 (body) or 3:1 (large) at a settled frame | scrim, larger type, darker ground |
| MO-C-07/08 / reading floor | a copy run visible for less than its reading floor | hold it longer; the film may grow |
| MO-C-09 / determinism | two captures of one frame differ | seed the randomness; drop wall-clock reads |
| MO-C-10/11/12 | size, fps, duration (stage ±10 % of the target) or colour tags off | report the render defect |
| MO-C-13 | preview over 3 MB or poster over 1 MB | the preview ladder steps down itself |
| MO-D-03 | an empty near-black run too long | put the subject on screen |
| sound | stream missing, off by more than 0.1 s, clipping, or a silent opening in a generated bed | rebuild the bed; exit 20 names it |

Type-path extras (MO-C-01/02, MO-C-05, MO-C-25..29, MO-D-02, MO-D-04) are in `scene-contract.md`
and `type-craft.md`; stage-path extras (copy found, decor share, fonts, canvas text, meta labels)
are in `stage.md`. Rerun the gate on an existing render with `node scripts/motion.mjs gate --out
<dir>`; a gate re-run never resets the recorded look rounds.
