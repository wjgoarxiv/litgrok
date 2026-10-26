// `motion.mjs scaffold --out <dir>`: the starting stage page, written from the treatment, so every
// film shares one architecture: the COPY block, one DRAW function per beat where the drawing goes,
// entrances on the house style's tokens. It never overwrites an existing page.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EXIT } from "./constants.mjs";
import { BlockedError } from "./constants.mjs";
import { readHouse } from "./house.mjs";
import { loadTreatment } from "./treatment.mjs";

const HANGUL = /[ㄱ-ㆎ가-힣]/u;

// A high-quality, cinematic or photoreal request earns the offline Cycles rung when Blender exists.
const PATH_TRACED = /(고퀄리티|고품질|시네마틱|실사|cinematic|photoreal|high-quality|\bblender\b)/iu;
export function asksPathTraced(request) { return PATH_TRACED.test(String(request ?? '')); }

/**
 * Where Blender is: an explicit LITGROK_BLENDER path (used only if it exists), the macOS app,
 * then `blender` on PATH. `{ env, exists }` are injectable for tests.
 */
export function findBlender({ env = process.env, exists = existsSync } = {}) {
  if (env.LITGROK_BLENDER) return exists(env.LITGROK_BLENDER) ? { path: env.LITGROK_BLENDER, source: 'LITGROK_BLENDER' } : null;
  if (exists('/Applications/Blender.app/Contents/MacOS/Blender')) return { path: '/Applications/Blender.app/Contents/MacOS/Blender', source: 'macOS app' };
  for (const dir of String(env.PATH ?? '').split(':')) {
    if (dir && exists(path.join(dir, 'blender'))) return { path: path.join(dir, 'blender'), source: 'PATH' };
  }
  return null;
}

/**
 * Which copy lines each beat shows: the beat's own `lines` when given; otherwise spread in order
 * over the beats, the first line on the first and the last line on the last.
 */
export function linesPerShot(treatment) {
  const beats = treatment.beats;
  if (beats.some((b) => Array.isArray(b.lines))) return beats.map((b) => (Array.isArray(b.lines) ? b.lines : []));
  const lines = treatment.copy.lines.map((_, i) => i);
  const textShots = beats.map((b, i) => (b.layout === "full" ? null : i)).filter((i) => i !== null);
  const out = beats.map(() => []);
  if (!textShots.length) return out;
  lines.forEach((line, k) => {
    const at = lines.length > 1 ? Math.round((k * (textShots.length - 1)) / (lines.length - 1)) : 0;
    out[textShots[at]].push(line);
  });
  return out;
}

/** The scaffold page for a stage treatment, in the renderer's page contract. */
export function scaffoldHtml(treatment) {
  const format = treatment.format === "9:16" ? "9:16" : "16:9";
  const [width, height] = format === "9:16" ? [1080, 1920] : [1920, 1080];
  const perShot = linesPerShot(treatment);
  const lang = treatment.copy.lines.some((l) => HANGUL.test(l)) ? "ko" : "en";
  const draws = treatment.beats.map((b, i) => `    // shot ${i + 1}${b.layout ? ` (${b.layout})` : ""}: ${String(b.hero ?? b.onScreen ?? "").replace(/\*\//gu, "* /")}\n    (s, t) => {},`).join("\n");
  // A 3D film also gets the three.js world: an import map onto the vendored build, a full-frame
  // canvas behind the shots, one protagonist group for the whole film, and one WORLD function per
  // shot that poses it. Copy stays DOM text over the canvas so the QA can read it.
  const solid = treatment.depth === "3d";
  const worlds = treatment.beats.map((b, i) => `    // shot ${i + 1}${b.layout ? ` (${b.layout})` : ""}\n    (s, hero, cam, t) => {},`).join("\n");
  const head3d = solid ? `\n<script type="importmap">{ "imports": { "three": "/lit/three/three.module.js", "three/addons/": "/lit/three/addons/" } }</script>` : "";
  const canvas3d = solid ? `<canvas id="world" width="${width}" height="${height}"></canvas>\n` : "";
  const style3d = solid ? `\n  #world { position: absolute; left: 0; top: 0; width: ${width}px; height: ${height}px; }` : "";
  const world3d = solid ? `
  // The world: one scene for the whole film, drawn on the GPU rung (software when it is missing).
  // Build the protagonist once, in HERO, and only pose it per shot: that is what makes it the same
  // object across the film. Tint the lights to the style; keep the type in DOM text, never in 3D.
  // More parts of the vendored build: three/addons/geometries/RoundedBoxGeometry.js.
  const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("world"), antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(${width}, ${height}, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(32, ${width} / ${height}, 0.1, 100);
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.radius = 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  scene.add(key, new THREE.HemisphereLight(0xf4f1ea, 0x101418, 0.6));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const HERO = new THREE.Group();
  scene.add(HERO);

  const WORLD = [
${worlds}
  ];

  function drawWorld(s, t) {
    cam.position.set(0, 1.6, 7);
    cam.lookAt(0, 0.6, 0);
    WORLD[s.index](s, HERO, cam, t);
    renderer.render(scene, cam);
  }
` : "";
  const scriptOpen = solid ? `<script type="module">
  import * as THREE from "three";
  import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
` : "<script>\n";
  const script = `${scriptOpen}  // The film's words: every copy line of treatment.json, verbatim. Edit them here.
  const COPY = ${JSON.stringify(treatment.copy.lines, null, 2).replace(/\n/gu, "\n  ")};

  const { define, text } = LitStage;

  // One function per shot: draw the subject as a function of the shot's progress.
  // s carries the shot index, p (0..1 within the shot) and local seconds.
  const SHOTS = ${JSON.stringify(treatment.beats.map((b) => [b.t0, b.t1]))};
  function shotOf(t) {
    let index = SHOTS.findIndex(([t0, t1]) => t >= t0 && t < t1);
    if (index < 0) index = t < SHOTS[0][0] ? 0 : SHOTS.length - 1;
    const [t0, t1] = SHOTS[index];
    return { index, p: t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0, t: Math.min(Math.max(0, t - t0), t1 - t0), duration: t1 - t0 };
  }
  const DRAW = [
${draws}
  ];

  function paint(i, s, t) {
    DRAW[i](s, t);
  }
${world3d}
  define({ width: ${width}, height: ${height}, fps: ${treatment.fps ?? 60}, duration: ${treatment.durationSec}, render(t) {
    const s = shotOf(t);
    paint(s.index, s, t);${solid ? "\n    drawWorld(s, t);" : ""}
  } });
</script>`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/lit/fonts.css">
<link rel="stylesheet" href="/lit/style.css">
<script src="/lit/stage-kit.js"></script>
<script src="/lit/style.js"></script>${head3d}
<style>
  html, body { width: ${width}px; height: ${height}px; }${style3d}
</style>
</head>
<body>
${canvas3d}${script}
</body>
</html>
`;
}

/** Write `<out>/stage/index.html` from the treatment; refuses to replace a page. */
export function scaffoldCommand({ out }) {
  const treatment = loadTreatment(out, { house: readHouse(out) });
  if (treatment.path !== "stage") throw new BlockedError(EXIT.TREATMENT_INVALID, `BLOCKED_TREATMENT_INVALID field=path: scaffold writes the stage page, but this treatment's path is ${treatment.path}; render it with make --out ${out}`);
  const file = path.join(out, "stage", "index.html");
  if (existsSync(file)) throw new BlockedError(EXIT.USAGE, `${file} exists; scaffold never overwrites a page (move it away to start again)`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, scaffoldHtml(treatment));
  // The scaffold's word on the 3D renderer: a Blender film draws its world in stage/scene.py; a film that
  // the request wants path-traced takes the Blender rung when Blender is installed, three.js otherwise.
  let advice = "";
  if (treatment.depth === "3d") {
    if (treatment.render3d === "blender") advice = ` This is a Blender film: write the world in ${path.join(out, "stage", "scene.py")}, look at the preview stills (blender --out ${out}), render the plate (--final), and show it under the type with LitStage.plate() in place of the three.js world (references/depth.md, The Blender rung).`;
    else {
      const found = asksPathTraced(treatment.request) ? findBlender() : null;
      if (found) advice = `\nBLENDER: ${found.path} is installed and the request asks for high-quality 3D. Take the Blender rung: set render3d "blender" in the treatment, write stage/scene.py, and keep this page for the type, labels and panels over the plate (references/depth.md, The Blender rung).`;
    }
  }
  return { code: EXIT.OK, message: `SCAFFOLD: ${file} (style ${treatment.style ?? "default"}, ${treatment.beats.length} shots). Draw each shot's subject in its DRAW function, then render the board: stage --out ${out} --round 1 --stills-only${advice}` };
}
