# Terminal mark sources

`ignition-b.json` is the active, byte-identical copy of the Ignition B design
selected on 2026-09-06. Its SHA-256 is
`e7f3e2be168bedc5c15836d105ffed570f3bfd8745522502293de8718f503aec`.
The family design source was `brand/ascii-study/rows.json`; this repository
contains its own copy and does not load any sibling or umbrella file at runtime.

The source preserves each quadrant-block glyph, trailing space and cell color
in the standard 22×10, banner 44×20 and micro 16×5 envelopes. Colors are Ignition
Orange `#FF6337`, Signal Lime `#D7F75B` and Terminal Ivory `#F2EFDF`. Their fixed
256-color approximations are 203, 191 and 230. The terminal background is never
set. The micro mark uses eleven active columns inside its sixteen-column box.

Run `node tools/generate-lit-mark.mjs` to enroll the source rows and compact
per-cell color keys in `.grok/hooks/lit-mark.mjs` and refresh both README heroes.
Run it with `--check` to detect stale derived source without writing. The
generator uses only Node built-ins and launches no subprocesses. The mark module
is self-contained in the packaged `.grok/hooks` tree: the installer and help
import it directly, and SessionStart imports the same installed file. These
fixtures and the development generator remain outside the package allowlist.

`round6.txt` and `litmark6.mjs` are immutable historical sources for the previous
flame and extrusion mark. Their byte-integrity test remains; neither is an input
to the current mark generator. Their provenance does not describe Ignition B.
