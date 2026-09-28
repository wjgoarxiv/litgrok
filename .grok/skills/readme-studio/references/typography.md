# Image branch and shaped typography

Inspect this session's native tools. If a supported generator exists, request an original text-free field, inspect the returned file, and copy it into the authorized project. Keep prompt/tool/input/output provenance. If absent, record IMAGE_GENERATION_UNAVAILABLE; do not ask for credentials, fall back to an external API or use another host. Independently finish facts and source, then use an explicitly supplied background if available. Describe that asset as supplied, never generated here.

Copy templates/typography to a new task-local directory. Install using `npm ci --ignore-scripts`. It pins fontkit2.0.4 (MIT); its layout API supplies glyph advances/offsets and outline bounds: https://github.com/foliojs/fontkit . Obtain explicit regular, bounded Pretendard and Meslo LGS NF files and their license notices. Verify font family, file hash and actual glyph coverage, including Korean; retain records and editable strings in cover-source.json. No global font install or unverifiable bundled fonts.

From that copied directory, use fresh output filenames:

```sh
node outline.mjs --font "$PRETENDARD_FILE" --text 'Research Notes 연구 노트' --family Pretendard --license "$PRETENDARD_LICENSE" --root "$COVER_OUTPUT_ROOT" --output title-dark-ink.svg --fill '#16252b'
node outline.mjs --font "$MESLO_FILE" --text 'LOCAL / RESEARCH' --family 'MesloLGS NF' --license "$MESLO_LICENSE" --root "$COVER_OUTPUT_ROOT" --output label-light-ink.svg --fill '#f7f5ef'
```

Run each title/subtitle/label in both ink colors. Light themes use dark ink; dark themes use light ink. Suffixes name ink, not theme. Confirm path-only SVG, exact text source, visible bounds and contrast >=4.5:1. The helper refuses missing glyphs, .notdef, nonfinite positioning, symlink parents, traversal and overwrite. License input proves a supplied notice exists, not that its legal terms were interpreted; inspect it before redistribution. Keep font bytes out of distributable art unless licensed.

Use untrusted images only after decoding; reject active SVG scripts, handlers, external URLs and foreignObject rather than embedding arbitrary XML. The shipped outline helper emits its own escaped path-only SVG. A raster background plus vector typography is a hybrid composition. Separate Gaussian blur, static seeded grain, depth/lighting and glow from crisp foreground text. An original authored pixel grid provides the illustration; do not claim a smooth vector icon is pixel art.
