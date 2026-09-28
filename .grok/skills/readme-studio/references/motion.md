# Local rendering and README delivery

Select an engine and record its version/license before rendering. Keep project-local dependencies; neither recipe imports another repository or a global package. Pin changes require fresh CLI, license and decoded-frame checks. Retain source if missing Chrome/FFmpeg or licensing prevents rendering: MOTION_RENDER_BLOCKED. Do not silently switch engines after a failed render.

## Remotion recipe

Copy templates/remotion into a new task directory and run `npm ci`. Remotion4.0.526 uses its own license; eligibility is organization-dependent, so review https://www.remotion.dev/license before selecting it. React19.3.0 is pinned in the lockfile. Verify the local CLI with `./node_modules/.bin/remotion versions`. CLI reference: https://www.remotion.dev/docs/cli/render .

Place an inspected background.png plus title/subtitle/label-dark-ink.svg and title/subtitle/label-light-ink.svg in public/. These names are ink colors: WideLight/MobileLight select dark ink; WideDark/MobileDark select light ink. The editable JSX exposes far blur (`blur`), middle blur (`midBlur`), grain, radial glow, rim light (`rimLight`) and a restrained/expressive variant through props. It layers a separately cropped sharp foreground plane above staged blur. Grain is a static grid; all motion derives from frames using bounded easing. No CSS animation drives this recipe. A still from this composition keeps both lighting layers and all three depth planes without requiring motion.

```sh
./node_modules/.bin/remotion render src/index.jsx WideLight wide-light-v01.mp4 --fps 60 --concurrency 1 --overwrite=false
./node_modules/.bin/remotion still src/index.jsx WideLight poster-wide-light-v01.png --frame 150 --overwrite=false
```

Repeat for WideDark, MobileLight and MobileDark with distinct fresh paths. Wide is1600x800 and mobile800x1000; each master is300frames at60fps (5seconds). The title is readable at frame0; short eased entry settles into a long hold and returns for the seam. Confirm actual metadata, never infer fps from source alone.

## HyperFrames alternative

Copy templates/hyperframes and run `npm ci`. Published hyperframes0.8.51 is Apache-2.0 and requires Node22+. Verify package license and `./node_modules/.bin/hyperframes render --help` locally. Package metadata: https://registry.npmjs.org/hyperframes/0.8.51 . This standalone HTML recipe starts at wide/dark; adapt theme/geometry and inspect them before claiming other variants. It uses the same public/ input filenames. CSS variables control far and middle blur; separate foreground and rim-light layers retain focal separation and the second light source in a static poster.

```sh
./node_modules/.bin/hyperframes check . --samples 60 --no-contrast --json
./node_modules/.bin/hyperframes render . -c index.html --fps 60 --workers 1 --output hyperframes-v01.mp4
```

Check that the output name does not exist before rendering. The positional argument is the project directory, with `-c index.html` selecting the composition. Keep the fixed viewport metadata, finite5-second CSS animation and data-no-timeline declaration together: there is intentionally no GSAP timeline. The motion sidecar must pass the pinned engine's actual checker. Keep `--workers 1`; inspect the full bottom edge to detect clipping. Do not put reduced-motion CSS in the movie composition; select static assets in the delivery layer.

## Encode and inspect

Create an inline GIF from each master; GIF support does not prove animated WebP support. A starting profile is6fps, wide560x280/mobile384x480, <=64colors. With FFmpeg available:

```sh
ffmpeg -n -i wide-light-v01.mp4 -filter_complex '[0:v]fps=6,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3' -loop 0 preview-wide-light-v01.gif
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,nb_frames -of json wide-light-v01.mp4
```

Measure each inline file against2.5MiB (2621440bytes). Optimize and inspect readability; if still too large, report INLINE_PREVIEW_SIZE_BLOCKED and an explicit delivery decision. Do not silently remove a required preview. Decode first/middle/last frames, compare loop geometry and confirm no clipping, color inversion or flicker. Inspect light/dark at320/390/1440px. Typography must remain >=4.5:1 against its actual field, not just a sampled background corner.

Use templates/picture.md: reduced-motion sources first, then animated sources, then a static img fallback. Render each static poster from the same effect stack so far/middle/foreground depth, radial glow and rim-light band remain visible without animation. Keep a normal Markdown master link, not arbitrary video HTML. First-frame identity and semantic README text survive unavailable animation. Local browser selection is bounded local evidence; GitHub/npm/CDN sanitation, public URLs and reduced-motion behavior remain POST_PUBLICATION_UNVERIFIED until separately authorized publication.

On interrupted rendering retain verified inputs and completed outputs, label partial files, stop only your process group, then use a new versioned output path. Never call an encoder exit code alone visual acceptance.
