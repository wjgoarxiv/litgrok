// lit-typographic-motion studio: house styles as data, style choice by rule, the house file,
// the storyboard, the scaffold and the validator's style and shot rules.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillRoot = join(root, ".grok", "skills", "lit-typographic-motion");
const lib = join(skillRoot, "scripts", "lib");
const motion = join(skillRoot, "scripts", "motion.mjs");
const styles = await import(join(lib, "styles.mjs"));
const { readHouse, recordHouse, HOUSE_FILE } = await import(join(lib, "house.mjs"));
const { boardGrid, boardHtml, addToStills } = await import(join(lib, "board.mjs"));
const { scaffoldHtml, linesPerShot, asksPathTraced, findBlender } = await import(join(lib, "scaffold.mjs"));
const { validateTreatment, loadTreatment } = await import(join(lib, "treatment.mjs"));
const { PRESETS } = await import(join(lib, "presets.mjs"));

const temps = [];
after(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});
const temp = (prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
};
const field = (t, opts) => {
  const result = validateTreatment(t, opts);
  return result.ok ? null : result.field;
};
const reason = (t, opts) => {
  const result = validateTreatment(t, opts);
  return result.ok ? "" : result.message;
};
const fixture = (name) => JSON.parse(readFileSync(join(root, "test", "fixtures", "motion", name), "utf8"));
// A treatment that declares its style, so the style rules engage. The request names the style,
// so the choice rule resolves to it; the palette, faces and bed come from the style data.
const styled = (id = "swiss-signal") => {
  const t = fixture("treatment-stage.json");
  const style = styles.readStyle(id);
  t.style = id;
  if (!t.request.includes(id)) t.request = `${t.request} in the ${id} style`;
  t.palette = [
    { hex: style.palette.ground, role: "ground" },
    { hex: style.palette.ink, role: "ink" },
    { hex: style.palette.signal, role: "signal" },
  ];
  t.typePlan = { faces: [style.faces.display.family, style.faces.body.family], hierarchy: "One line.", maxWordsOnScreen: 4 };
  t.register = "minimal";
  t.sound = { mode: "generated", plan: "a pulse under the drawings", palette: { ...style.sound }, events: [{ t: 6, on: "the droplet lifts off the sea", kind: "tap" }, { t: 12, on: "droplets gather with a soft clang", kind: "hit" }] };
  t.beats = t.beats.map((b, i) => ({ ...b, layout: ["split", "split-alt", "hero", "split", "title"][i], hero: `Move ${i + 1}.`, transition: i < 4 ? "match" : "end" }));
  return t;
};

describe("house styles are data, valid and shared with the type engine", () => {
  it("every shipped style validates: contrast floors, a descending scale, its bed, its bans", () => {
    const files = readdirSync(join(skillRoot, "styles")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/u, "")).sort();
    assert.deepEqual(files, [...styles.STYLE_IDS].sort());
    for (const id of styles.STYLE_IDS) assert.equal(styles.readStyle(id).id, id);
    assert.throws(() => styles.validateStyle({ ...styles.readStyle("paper"), palette: { ...styles.readStyle("paper").palette, muted: "#D9D2C5" } }), /muted on ground needs 4\.5:1/u);
  });

  it("the three type-engine styles carry the presets' own palette, so one style means one look on both paths", () => {
    for (const id of ["swiss-signal", "tidal", "terminalcore"]) {
      const style = styles.readStyle(id);
      assert.equal(style.typePreset, id);
      assert.equal(style.palette.ground.toLowerCase(), PRESETS[id].palette.bg.toLowerCase(), id);
    }
    assert.equal(styles.readStyle("swiss-signal").palette.signal.toLowerCase(), PRESETS["swiss-signal"].palette.signal.toLowerCase());
    assert.equal(styles.readStyle("paper").typePreset, null);
  });

  it("every type zone sits inside the central 90 % title-safe area, in both formats", () => {
    for (const format of ["16:9", "9:16"]) {
      for (const [id, z] of Object.entries(styles.LAYOUTS[format])) {
        if (!z.type) continue;
        const [x, y, w, h] = z.type;
        assert.ok(x >= 0.05 && y >= 0.05 && x + w <= 0.95 && y + h <= 0.95, `${format} ${id}`);
      }
    }
  });
});

describe("the style is chosen by rule, the same way every run", () => {
  it("named, then house, then keyword, then the genre default; the type path never takes paper", () => {
    const pick = (request, extra = {}) => styles.pickStyle({ request, ...extra }).id;
    assert.equal(pick("엘리베이터 호출 순서를 보여주는 설명 영상 만들어줘 lit"), "swiss-signal");
    assert.equal(pick("make a calm wave intro video lit"), "tidal");
    assert.equal(pick("터미널 느낌의 출시 영상 lit"), "terminalcore");
    assert.equal(pick("따뜻한 동네 빵집 영상 lit"), "paper");
    assert.equal(pick("a film in the paper style about tides lit"), "paper", "a named style beats a keyword");
    assert.equal(pick("make a video lit", { house: { style: "tidal" } }), "tidal");
    assert.equal(pick("make a video in the terminalcore style lit", { house: { style: "tidal" } }), "terminalcore");
    assert.equal(pick("따뜻한 키네틱 타이포 영상 lit", { path: "type" }), "swiss-signal");
    for (let i = 0; i < 3; i++) assert.equal(pick("Tidewell, an offline-first notes sync tool"), "swiss-signal", "Tidewell is not the word tide");
  });

  it("the validator refuses any other style and names the rule that chose", () => {
    assert.equal(field(styled()), null);
    const off = styled();
    off.style = "tidal";
    assert.equal(field(off), "style");
    const unknown = styled();
    unknown.style = "nope";
    assert.equal(field(unknown), "style");
  });

  it("the validator holds shot fields to the layout grid when a beat names them", () => {
    const cases = [
      [(t) => { t.beats[1].layout = "collage"; }, "beats[1].layout"],
      [(t) => { delete t.beats[2].hero; }, null, "a missing hero stays valid"],
      [(t) => { t.beats[0].transition = "dissolve"; }, "beats[0].transition"],
      [(t) => { t.beats[4].transition = "cut"; }, "beats[4].transition"],
      [(t) => { t.beats[0].lines = [7]; }, "beats[0].lines"],
      [(t) => { t.beats[2].layout = "full"; t.beats[2].lines = [1]; }, "beats[2].lines"],
    ];
    for (const [mutate, expected] of cases) {
      const t = styled();
      mutate(t);
      assert.equal(field(t), expected ?? null);
    }
  });

  it("the stage palette, faces and bed come from the declared style", () => {
    const off = styled();
    off.palette[1].color = "#ff00aa";
    off.palette[1].hex = "#ff00aa";
    assert.equal(field(off), "palette");
    const faces = styled();
    faces.typePlan.faces = ["VT323"];
    assert.equal(field(faces), "typePlan.faces");
    const bed = styled();
    bed.sound.palette.tempo = 120;
    assert.equal(field(bed), "sound.palette");
  });
});

describe("the house file keeps the style for the next film", () => {
  it("a passed film writes it; a declared style against it fails naming the rule", () => {
    const dir = temp("lit-house-");
    const first = join(dir, "motion-first");
    recordHouse(first, { style: "terminalcore", path: "stage", format: "16:9", durationSec: 16 });
    const house = readHouse(join(dir, "motion-second"));
    assert.equal(house.style, "terminalcore");
    assert.equal(house.films.length, 1);
    const core = styles.readStyle("terminalcore");
    const t = styled();
    t.style = "terminalcore";
    t.request = fixture("treatment-stage.json").request + " in the terminalcore style";
    t.palette = [
      { hex: core.palette.ground, role: "ground" },
      { hex: core.palette.ink, role: "ink" },
      { hex: core.palette.signal, role: "signal" },
    ];
    t.typePlan = { faces: ["VT323"], hierarchy: "One line.", maxWordsOnScreen: 4 };
    t.sound = { mode: "authored", file: "stage/console.wav", plan: "a pulse under the console" };
    t.beats.forEach((b, i) => { b.transition = i < 4 ? "cut" : "end"; });
    assert.equal(field(t, { house }), null, "a named style beats the house");
    const held = styled();
    held.request = held.request.replace(" in the swiss-signal style", "");
    assert.equal(reason(held, { house }), "the project's house style is terminalcore (motion-house.json); this film takes the terminalcore style");
    assert.equal(field(held, { house }), "style", "an unnamed declaration yields to the house style");
  });
});

describe("the page gets the style and the timeline", () => {
  it("style.css carries the role classes and sizes; style.js the zones in pixels and the shots", () => {
    const style = styles.readStyle("paper");
    const css = styles.styleCss(style, "9:16");
    assert.match(css, /\.lit-headline \{ font-family: "Pretendard"; font-size: 74px; font-weight: 700;/u);
    assert.match(css, /--lit-signal: #B0452A;/u);
    assert.match(css, /word-break: keep-all;/u, "Korean breaks between eojeol, never inside a word");
    const t = styled();
    const js = styles.styleScript(styles.readStyle("swiss-signal"), "16:9", t);
    const window = {};
    vm.runInNewContext(js, { window, Object, JSON });
    assert.deepEqual(JSON.parse(JSON.stringify(window.LitStyle.zones.split.type)), { x: 154, y: 173, w: 691, h: 734 });
    assert.equal(window.LitTimeline.beats[2].layout, "hero");
  });
});

describe("the scaffold command", () => {
  const run = (args, env = {}) => spawnSync(process.execPath, [motion, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
  const plant = (dir, t) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "treatment.json"), JSON.stringify(t ?? styled()));
  };

  it("writes the starting page, refuses to replace one, and names the invalid field at exit 16", () => {
    const dir = temp("lit-scaffold-");
    plant(dir);
    const ok = run(["scaffold", "--out", dir]);
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /SCAFFOLD: .*stage\/index\.html \(style swiss-signal, 5 shots\)/u);
    assert.ok(existsSync(join(dir, "stage", "index.html")));
    const again = run(["scaffold", "--out", dir]);
    assert.equal(again.status, 2);
    assert.match(again.stderr, /never overwrites a page/u);
    const bad = temp("lit-scaffold-bad-");
    const t = styled();
    t.beats[1].layout = "collage";
    plant(bad, t);
    const invalid = run(["scaffold", "--out", bad]);
    assert.equal(invalid.status, 16);
    assert.match(invalid.stdout, /exit 16 BLOCKED_TREATMENT_INVALID/u);
    assert.match(invalid.stderr, /field=beats\[1\]\.layout/u);
  });

  it("holds a folder to its house style unless the request names another", () => {
    const dir = temp("lit-scaffold-house-");
    const t = styled();
    t.request = fixture("treatment-stage.json").request;
    plant(dir, t);
    recordHouse(dir, { style: "terminalcore", path: "stage", format: "16:9", durationSec: 16 });
    const held = run(["scaffold", "--out", dir]);
    assert.equal(held.status, 16, "the unnamed declaration yields to the house");
    assert.match(held.stderr, /the project's house style is terminalcore/u);
  });
});

describe("the board and the scaffold", () => {
  it("the board grid fills the page without lopsided rows", () => {
    assert.equal(boardGrid(4, 1920, 1080).cols, 2);
    assert.equal(boardGrid(5, 1920, 1080).rows, 2);
    assert.ok(boardGrid(6, 1080, 1920).cols >= 3);
  });

  it("the board page names every shot, its time, layout and hand-off, and outlines its type zone", () => {
    const t = styled();
    const html = boardHtml({ treatment: t, stills: t.beats.map((_, i) => `s${i}.png`), check: { rules: [{ id: "TEXT-ZONE", status: "FAIL" }] } });
    for (const b of t.beats) assert.ok(html.includes(b.hero), b.hero);
    assert.match(html, /01 {2}· {2}0\.0–4\.0 s {2}· {2}split {2}· {2}→ match/u);
    assert.equal((html.match(/class="zone"/gu) ?? []).length, 5);
    assert.match(html, /layout check: FAIL — TEXT-ZONE/u);
    assert.doesNotMatch(html, /https?:\/\//u);
  });

  it("addToStills lists the board in the stills index and returns the new manifest hash", async () => {
    const out = temp("lit-board-index-");
    mkdirSync(join(out, "stills"), { recursive: true });
    writeFileSync(join(out, "stills", "index.json"), JSON.stringify({ schema: 1, path: "stage", stills: [{ file: "stills/sheet.png", kind: "sheet" }] }));
    writeFileSync(join(out, "stills", "board.png"), "png");
    const { createHash } = await import("node:crypto");
    const sha = (b) => createHash("sha256").update(b).digest("hex");
    const h = addToStills(out, { file: "stills/board.png", kind: "board" }, { sha256: sha });
    assert.equal(h, sha(readFileSync(join(out, "stills", "index.json"))));
    assert.ok(JSON.parse(readFileSync(join(out, "stills", "index.json"), "utf8")).stills.some((f) => f.kind === "board"));
  });

  it("a 3D scaffold maps three onto the vendored build and keeps one protagonist across the shots", () => {
    const flat = styled();
    assert.doesNotMatch(scaffoldHtml(flat), /importmap|three|WORLD/, "a flat film has no 3D world");
    const solid = styled();
    solid.visualDevices[0] = { kind: "depth3d", role: "subject", beats: [0, 1, 2, 3, 4] };
    solid.depth = "3d";
    assert.equal(field(solid), null);
    const html = scaffoldHtml(solid);
    assert.match(html, /<script type="importmap">\{ "imports": \{ "three": "\/lit\/three\/three\.module\.js"/u);
    assert.match(html, /<script type="module">/u);
    assert.match(html, /import \{ RoomEnvironment \} from "three\/addons\/environments\/RoomEnvironment\.js"/u);
    assert.match(html, /preserveDrawingBuffer: true/u);
    assert.ok(html.includes('<canvas id="world"'), "the world canvas sits behind the shots");
    assert.equal((html.match(/\(s, hero, cam, t\) => \{\},/gu) ?? []).length, solid.beats.length, "one WORLD function per shot");
    assert.match(html, /drawWorld\(s, t\)/u);
    assert.doesNotMatch(html, /https?:\/\//u, "never a CDN");
  });

  it("a path-traced request earns the Blender rung advice when Blender is installed", () => {
    assert.ok(asksPathTraced("시네마틱한 고퀄리티 3D 영상을 Blender로 만들어줘 lit"));
    assert.ok(!asksPathTraced("비가 어떻게 만들어지는지 보여주는 영상 만들어줘 lit"));
    const nope = () => false;
    assert.equal(findBlender({ env: { LITGROK_BLENDER: process.execPath }, exists: nope }), null, "an explicit path is used only if it exists");
    assert.deepEqual(findBlender({ env: { LITGROK_BLENDER: process.execPath, PATH: "" }, exists: () => true }), { path: process.execPath, source: "LITGROK_BLENDER" });
    assert.deepEqual(findBlender({ env: { PATH: "/usr/bin" }, exists: (p) => p === "/usr/bin/blender" }), { path: "/usr/bin/blender", source: "PATH" });
    assert.equal(findBlender({ env: { PATH: "" }, exists: nope }), null, "nothing installed, no advice");
  });

  it("the scaffold writes one DRAW per beat, every copy line verbatim, and the style routes", () => {
    const t = styled();
    const html = scaffoldHtml(t);
    assert.equal((html.match(/\(s, t\) => \{\},/gu) ?? []).length, t.beats.length, "one DRAW per beat");
    for (const line of t.copy.lines) assert.ok(html.includes(JSON.stringify(line)), line);
    for (const route of ["/lit/fonts.css", "/lit/style.css", "/lit/stage-kit.js", "/lit/style.js"]) assert.ok(html.includes(route), route);
    assert.doesNotMatch(html, /https?:\/\//u);
    assert.deepEqual(linesPerShot(t).map((l) => l.length), [1, 1, 1, 1, 1]);
    assert.deepEqual(linesPerShot({ ...t, beats: t.beats.map((b, i) => ({ ...b, layout: i === 2 ? "full" : b.layout })) }).map((l) => l.length), [1, 1, 0, 2, 1]);
  });
});
