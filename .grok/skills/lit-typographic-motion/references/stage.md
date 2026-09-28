# Stage path: an authored page, captured frame by frame

On the stage path you author the film's visuals as a web page and the renderer captures it
deterministically, one frame at a time, then runs the QA gate. Use it for every film that shows
something beyond the words: a drawn subject, shapes, diagrams, charts, illustration or imagery, and
for every 9:16 film. The treatment (`treatment.md`) comes first; this file is read only after
`path` is `stage`.

## Files

Write `stage/index.html` and its local assets inside the run's output directory (`<dir>/stage/`).
Allowed files: html, js, mjs, css, svg, png, jpg, webp, gif, wav, woff, woff2, ttf, otf, json.

- Use the kit and your own code. Never install, download or copy a third-party library into the
  stage directory.
- Rasters are textures and stills, never a frame sequence: at most 24 raster images and 8 MB in
  total. Ten or more rasters of one size (a flipbook), or any animated GIF, APNG or WebP, is exit 17.
- Forbidden, exit 17 naming it: `<video>`, `<audio>`, `<iframe>`, `<object>`, `<embed>`, `<frame>`,
  `new Audio()`, `AudioContext`, `OfflineAudioContext`, Worker, SharedWorker, service workers,
  WebSocket, WebTransport, RTCPeerConnection.
- Load fonts and the kit from the renderer's own routes:

```html
<link rel="stylesheet" href="/lit/fonts.css">
<script src="/lit/stage-kit.js"></script>
```

`/lit/fonts.css` declares the verified faces with `font-display: block`: `Archivo` (weights 400,
700, 900; `font-stretch` 75 %, 100 %, 125 %), `Pretendard` (Hangul, 400 and 700), `VT323`,
`Silkscreen` (400, 700), `Galmuri9` and `Meslo` (both need the pre-warm). A face listed in
`typePlan.faces` that is not warm exits 14; a tampered one exits 15. Set Hangul copy in
`Pretendard` (for example `font-family: Archivo, Pretendard`) so no system font fills a gap.

Put the copy in one `COPY` object at the top of `stage/index.html`, so it is easy to edit and the
reply can point at it:

```html
<script>const COPY = { headline: '<copy line>', footer: '<copy line>' };</script>
```

## The contract

The page declares the film once:

```js
LitStage.define({ width: 1920, height: 1080, fps: 60, duration: 20, render(t) { /* draw frame t (s) */ } });
```

`window.litStage = { ... }` with the same fields also works. `width` and `height` match the
treatment's format (1920×1080 or 1080×1920); `duration` is the treatment's `durationSec` (the
render must land within ±10 %); `fps` is 60, or 30 when the treatment says so. `render(t)` is
optional when CSS or Web Animations drive everything.

The renderer drives time from a virtual clock, so all of these are deterministic: CSS animations
and transitions, the Web Animations API (including `finished.then` chains), SVG SMIL, `setTimeout`,
`setInterval`, `requestAnimationFrame` with Canvas2D or WebGL, `requestIdleCallback`, `Date`,
`performance.now`, `document.timeline.currentTime` and `Math.random` (seeded from the treatment).
Not covered, so they fail determinism (exit 18): `performance.timeOrigin`,
`crypto.getRandomValues`, and any wall-clock source you invent. Canvas and WebGL contexts are kept
with `preserveDrawingBuffer`. Exit 11 applies only when the page asks for WebGL and gets none.

Text drawn on a canvas or in WebGL is invisible to the QA unless you register it each frame:

```js
LitStage.text({ content: COPY.headline, x: 120, y: 200, w: 900, h: 140 });
```

Illustrative text inside a drawn subject (a label on a jar, a street sign) is decor: mark it with
`LitStage.text(el, { decor: true })`. Decor may not carry a copy line and may cover at most 25 % of
the visible text area in any sample. Mark a copy block with `LitStage.text(el)` when its words are
split across many spans.

## Kit primitives (`/lit/stage-kit.js`)

Motion primitives only; the kit ships no scene, object, layout, name or copy.

```js
const e = LitStage.ease.outCubic(p);                 // named eases: linear, in/out/inOut Quad, Cubic, Quart, Expo, Back, Sine
const b = LitStage.bezier(0.2, 0, 0, 1);             // cubic-bezier as a function of p
const y = LitStage.spring({ from: 0, to: 1, stiffness: 180, damping: 14 })(t);   // analytic spring
const x = LitStage.kf(t, [[0, 0], [1.2, 400, 'outCubic'], [2, 380]]);          // keyframes: [time, value, ease]
const d = LitStage.stagger(i, { each: 0.06 });       // per-index delay
const s = LitStage.seq([['in', 0.8], ['hold', 2], ['out', 0.6]]); LitStage.at(t, s.in); // named spans, progress 0..1
const r = LitStage.rand(42); r();                    // seeded random
const parts = LitStage.splitText(el, { by: 'grapheme' | 'word' | 'eojeol' });  // Intl.Segmenter
LitStage.drawPath(svgPath, p);                       // stroke draw-on
const shape = LitStage.morph(dA, dB); path.setAttribute('d', shape(p));        // single-subpath morph
LitStage.clip(el, p, { from: 'left' });              // inset reveal; LitStage.circle(el, p, { x, y })
const c = LitStage.mix('#0b1f33', '#7fd1ff', p);     // colour mix
```

`morph` normalizes both paths to cubics, resamples them by arc length and picks the best rotation;
paths with more than one subpath are not supported (split them into separate paths).

## Serving and network

The page is served from the synthetic origin `http://lit.stage/` with no listening socket. Only
files whose real path lies inside `stage/`, plus the kit and font routes, are served; `..` and a
symlink that escapes the directory are refused (exit 17). Every request outside the origin is
blocked and fails the run with exit 19, and a pre-flight scan refuses absolute `http(s)://` or
protocol-relative URLs and preconnect or prefetch links (SVG and XML namespace URIs are fine).

## What the renderer does

1. Validates the treatment (16) and scans the stage files (17, 19).
2. Opens a software-rendered Chrome at the exact format size, loads every font and decodes every
   image, then steps the clock from frame 0 sequentially: timers, animation frames, `render(t)`,
   style flush, then a capture. Each capture must decode to the exact format size (17).
3. Writes the stills set (beat midpoints, a −6/0/+6 strip per cut, a 12-frame contact sheet), then,
   unless `--stills-only`, encodes the master with the pinned encode and the sound track, the
   preview, the poster and the reduced-motion still (the final beat's midpoint).
4. Replays the clock in a fresh Chrome and compares 8 to 16 sample frames by the SHA-256 of their
   decoded pixels (exit 18 names the frame and the first differing region), and replays it again in
   a separate QA Chrome for the text checks below.

A long render prints progress to `<dir>/.run/progress.json`. Give the command a timeout of at least
600 s and never shorten the film to save render time.

## Text QA

A run is the text of the nearest `LitStage.text` element, or of the nearest block. Runs whose
words are in `copy.lines` are copy; runs marked decor are decor; any other text is judged as copy.

| Check | Copy | Decor |
|---|---|---|
| contrast (3:1 large, 4.5:1 body) at settled samples | FAIL | WARN |
| inside the central 90 % of the frame | FAIL | exempt |
| visible for its reading floor | FAIL | exempt |

Runs are read at 10 fps; contrast and the safe box are judged only at settled samples (the run
moved under 2 px since the neighbouring reads and its opacity chain is at least 0.95). The reading
floor follows the words, not the box: a line that slides while it stays readable keeps its time.
Every copy line must appear on screen somewhere (exit 17 quotes a missing line). WARN, and the look
must answer them: a meta label on screen (the request, the idea, a file name, or the words path,
preset, gate, beat, treatment), unregistered canvas text, a system font where a product face was
expected (FAIL for copy), frames where nothing but text is drawn, and samples where state moved
during the ink capture.

## Effects

Blur filters, `backdrop-filter`, `mix-blend-mode`, `box-shadow`, SVG `feGaussianBlur`, Canvas2D
`shadowBlur` and WebGL shaders render deterministically on the software rung. An effect that does
not is named in the determinism error; fix the source, never remove the subject.
