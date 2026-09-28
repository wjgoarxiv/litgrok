# Runtime, pre-warm and BLOCKED states

## One rule

Everything the engine needs from the network is installed once, outside any Grok session, by
`litgrok-ai motion-runtime install`. A render reads that cache and never installs, fetches, repairs
or re-verifies against the network. `litgrok-ai install` (the skill copy) stays copy-only and never
touches the network either; it only prints where to pre-warm.

## The cache

`${XDG_CACHE_HOME:-~/.cache}/litgrok/motion-runtime/<lock digest>/` for both install scopes,
never under `.grok/vendor/`. `LITGROK_MOTION_CACHE` (an absolute path) replaces the base. Inside:

- `node/` — the pinned engine dependencies (`opentype.js` for outlines, kerning and glyph bounds;
  `ws` for the frame socket), installed by `npm ci --omit=dev --ignore-scripts` from the lockfile
  shipped in this skill, with a ready marker holding the lockfile digest;
- `fonts/` — Galmuri9 and MesloLGS NF, each fetched from its pinned URL and kept only when its
  sha256 matches, with its licence files beside it (Galmuri OFL; the Meslo Apache notice, the
  Apache-2.0 text and the Bitstream Vera/Arev notices);
- `audio-venv/` — only after `--audio`: librosa from `requirements-audio.txt`, installed with
  `pip install --require-hashes --only-binary=:all:`;
- `install.lock` — held while an install runs; a second install started meanwhile stops and says so.

Archivo instances, VT323, Silkscreen and the five EMS stroke fonts ship inside the skill; the
Hangul body pair is the lit-pptx skill's own PretendardGOV Regular and Bold, checked against
LitGrok's recorded hashes.

## Commands

- `litgrok-ai motion-runtime install` — deps and fonts; prints one line per item and the cache path.
- `litgrok-ai motion-runtime install --audio` — also the Tier 2 venv (needs `uv` or Python 3.11-3.13).
- `litgrok-ai motion-runtime install --word-timing` — prints the model table (id, revision,
  licence, size) before any download. While any pin is unverified it fails closed and downloads
  nothing; Tier 3 then stays unavailable.
- `litgrok-ai motion-runtime status` — the five probes, every time:
  1. Chrome path and version;
  2. ffmpeg path, version line and the preview encoder rung (`libwebp_anim`, `img2webp` or GIF);
  3. the WebGL2 renderer string from a real headless probe;
  4. the software-GL warning (SwiftShader, llvmpipe and the rest of the one canonical list), or the
     unknown-renderer warning when the debug extension is unavailable;
  5. pre-warm state: which deps or fonts are missing or hash-mismatched, and the fix command;
  plus the audio venv and word-timing model state.

## Exit codes

| Exit | Name | Meaning and fix |
|---|---|---|
| 0 | OK | the requested mode finished (for a film: the gate passed) |
| 10 | BLOCKED_NO_CHROME | Chrome not found or failed to launch headless; the message quotes the launcher's first error line. Install Chrome or set `CHROME_PATH`. |
| 11 | BLOCKED_NO_WEBGL2 | Chrome ran but no WebGL2 context on any rung, not even SwiftShader. |
| 12 | BLOCKED_NO_FFMPEG_FOR_VIDEO | ffmpeg missing for a film; `--stills-only` still works and exits 0. |
| 13 | GATE_FAIL_QA | a pre-flight or full-gate rule failed; the report names it. |
| 14 | BLOCKED_DEPS_NOT_PREWARMED | engine deps (or word-timing models) absent: run `litgrok-ai motion-runtime install` outside the session. |
| 15 | BLOCKED_FONT_FETCH | a required font or its licence is missing or its bytes do not match the pin: run the same install. A mismatch is treated as tampering and never repaired in session. |
| 16 | BLOCKED_TREATMENT_INVALID | `treatment.json` is missing or a field fails; the message names the field. Fix the treatment, never the check. |
| 17 | STAGE_CONTRACT_ERROR | the stage page broke its contract: no `LitStage.define`, a size that is not the format, a forbidden element or API, a flipbook or animated raster, a refused path, a missing copy line, or a capture of the wrong size. |
| 18 | STAGE_NONDETERMINISTIC | a replayed sample frame differs from the master; the message names the frame and the region. Seed the randomness and drop wall-clock reads. |
| 19 | STAGE_NETWORK_REQUEST | the page reached outside `http://lit.stage/` (a URL, a WebSocket, a peer connection). |
| 20 | SOUND_INVALID | a planned track is missing from the film, cannot be decoded, or a generated bed opens silent. |

Exit 14 and exit 15 are both fixed by the pre-warm outside the session, never by retrying the render inside it. Name the code and the fix in the reply. Never report one cause as another: a missing cache is exit
14 even when Chrome is also missing, because the cache is checked first; a WebGL2 failure with
Chrome running is 11, not 10.

## Chrome, rungs and egress

Chrome is driven over its DevTools pipe (`--remote-debugging-pipe`), so no control port listens. The
rungs are tried in order and a rung counts only when `getContext('webgl2')` succeeds in the page:
macOS `--use-angle=metal`, Linux `--use-angle=gl`, Windows `--use-angle=d3d11`, then SwiftShader
(`--use-angle=swiftshader --enable-unsafe-swiftshader`); the three anti-throttling flags ride on
every rung. The working rung is recorded as `chromeFlags`. Under software GL the render lowers
samples to 1, halves the tidal octaves (minimum 3), switches CRT persistence off and marks the
affected passes `downgraded`. No other Chrome flag is added on the type path.

The stage path always uses the SwiftShader rung, plus the compositor and colour flags that make a
software capture reproducible (`--run-all-compositor-stages-before-draw`, `--disable-checker-imaging`,
`--disable-threaded-animation`, `--disable-lcd-text`, `--force-color-profile=srgb`,
`--force-device-scale-factor=1` and the rest listed in `stage.md`), the exact window size of the
format, and a host-resolver backstop that resolves nothing but the synthetic origin. Every launch on
either path carries `--use-mock-keychain --password-store=basic`.

Frames leave the page over a WebSocket bound to `127.0.0.1` on an OS-assigned port. If the host
refuses `listen`, the render uses the per-frame CDP pull of the same readback buffer instead and
names it in the report; if that also fails, the error quotes the listen error. The hashed, audited
and encoded bytes are identical in both paths. The Chrome profile lives in a short random directory
under `<out>/.run/` and is removed on exit.

## Sound and audio tiers

The treatment decides the sound on both paths (`treatment.md`):

- **generated** (the default under bare `lit`): a deterministic bed in pure code, 48 kHz 16-bit
  stereo, exactly as long as the film, at −16 LUFS (ITU-R BS.1770-4 integrated loudness) with the
  sample peak at or below −2 dBFS; `sound-cues.json` lists every accent against its beat or cut.
  Three timbres: `glass` (bell partials over a sine pad), `felt` (a soft filtered pad, a mellow
  pluck and a light kick), `pulse` (a pulse-width pad, a tight kick and off-beat ticks).
- **supplied** or **authored**: the file is decoded, padded with silence or trimmed to the video's
  exact length with a 50 ms fade, and always muxed (AAC 256k), whatever state the Tier 2 venv is in.
  There is no `-shortest`, so a short track never shortens the film.
- **none**: only when the user asked for silence or the channel plays muted.

The sound gate decodes the muxed stream: a stream is present, its length is within 0.1 s of the
video's, the sample peak is at or below −0.5 dBFS, and a generated bed has no stretch below −50
dBFS longer than 1.5 s in its first 3 s. A missing planned stream or a silent generated opening is
exit 20 (`SOUND_INVALID`); the same silence in a supplied track is only a WARN.

Timing tiers on the type path:

- **Tier 1** needs nothing: reading time plus a beat grid from the brief's tempo; a generated bed
  follows that tempo so cuts land on its pulse.
- **Tier 2** runs when the treatment supplies an audio file and the venv is ready:
  `scripts/beat_grid.py` analyses the file once before rendering and the beat list replaces the
  fixed grid. An absent venv, or one whose installed packages no longer match the pins, falls back
  to Tier 1 with the warning `audio analysis not prewarmed: run litgrok-ai motion-runtime install
  --audio`, and the track is still muxed. Never aubio, essentia or madmom.
- **Tier 3** is opt-in with `--word-timing` and never selected by bare `lit`; absent models exit 14.

## Host notes

ffmpeg and Chrome are host tools found on PATH (Chrome also at its standard install paths), never
bundled. The render writes only inside its output directory. Rendering while other heavy jobs run
slows the perf check (MO-D-02); rerun it alone before calling a timing FAIL real.
