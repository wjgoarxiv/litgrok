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

The landing pages lead with `../cover-motion.webp`, the looping 960×640 robot
cover: the five robot panels power on one by one, the LitGrok robot wakes, then
LITFAMILY and KEEP THE WORK LIT. light up
(SHA-256 `e4ff0b0bb4d77d9f7dadcb7110334ec623be6bc04f74753b6f571981a09cd3cd`).
Readers who prefer reduced motion get `../cover-motion-still.webp`, its fully lit
hold frame (SHA-256 `29edb07d1584fc9f84b2f243a7f4eb33d1f05ff5a235a46f1b4391824e96a539`).
`../cover.webp` is the earlier static robot export
(SHA-256 `0725bed298d34bd5221955fb856b10b4f996b595effc838c9e053954ac49eddd`);
the landing pages no longer show it. The SVG cover remains the editable,
low-bandwidth fallback. The WebP files ship in the package so the npmjs page can
load them.
