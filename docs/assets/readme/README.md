# README artwork

The English and Korean landing pages share `ascii-readme.svg`, an outlined
presentation of the exact Ignition B banner and `grok` label. Its row labels
match the copyable `<details>` block, including the empty twentieth row.
`node tools/generate-lit-mark.mjs` refreshes those blocks from the repository's
canonical fixture and checks the approved SVG bytes and rows. `--check` does
not write files. The runtime mark still uses its original cell colors and
44×20 banner envelope.

The SVG glyph outlines use JetBrains Mono. Its notice is retained in
`JetBrainsMono-OFL.txt`; no font download is needed to display the image.

`badge-version.svg` is a static local-candidate badge, checked against the
package version. `badge-license.svg` links to this repository's MIT license.
Neither badge reports registry availability or a hosted build result.

The book-open, play and shield-check icons are Lucide artwork from revision
`2bfb9bb1bae5d74f6a9f81640ddd8bccc2c71860`, with the stroke adapted to Signal
Lime. The complete upstream notice is in `Lucide-LICENSE.txt`.

`ignition-poster.png`, `ignition-film.mp4` and `ignition-readme.gif` are the
approved Ignition motion exports. The poster links to the ten-second film;
the GIF is an alternative link. Motion files, the outlined ASCII mark, and the Lucide notices stay outside the
npm package. The version and license badges ship in the package so npmjs can
render them.

The landing pages lead with `../cover-motion.webp`, the looping 960×640 cover:
a terminal in the sunset look with a short conversation, a pixel LITFAMILY wordmark,
a striped half-sunk sun and LitGrok's status lines
(SHA-256 `f731a72a45a102eb22f71b2741a4591f0ea506813598b66c0c7fa8ae7da636f5`).
Readers who prefer reduced motion get `../cover-motion-still.webp`, its first
frame (SHA-256 `82e8cf45fcf5dd8a2ce40280fb55e60124ac4a6c4bd411ea6dbc2cabce014dc1`).
`../cover.webp` is the static seven-robot export with LitGrok lit
(SHA-256 `7a1eaf59b2292f1b879ab82d53bd645e5c2cafc83189ced49a84f946d83d58c0`);
the landing pages no longer show it. The SVG cover remains the editable,
low-bandwidth fallback. The WebP files ship in the package so the npmjs page can
load them.

`diagrams/` holds the three Tokyo Night drawings on the GitHub landing pages
(the install path, the `lit` route, and the core and extensions), each in
English and Korean with a light and a dark PNG. `schematic/` holds the same
route drawn as a small process plant: a looping WebP per language and theme,
plus a still PNG for readers who prefer reduced motion. These drawings stay
outside the npm package; the npm pages under `docs/npm/` do not show them.
