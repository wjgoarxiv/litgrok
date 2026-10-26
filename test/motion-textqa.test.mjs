// The text and fill gate: TEXT-OVERLAP, TEXT-ON-STYLE, TEXT-ZONE, RICH-FILL, FLAT-FRAME and
// DEAD-AIR as pure rules over recorded samples and frames, plus the register it defaults to.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { judgeTextRules, parseCssColour, richFill, runClass } from "../.grok/skills/lit-typographic-motion/scripts/lib/stage-qa.mjs";
import { checkDeadAir, checkFlatFrames } from "../.grok/skills/lit-typographic-motion/scripts/lib/stage-gate.mjs";
import { validateTreatment } from "../.grok/skills/lit-typographic-motion/scripts/lib/treatment.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const style = "swiss-signal";
const treatment = {
  request: "a film in the swiss-signal style",
  genre: "explainer",
  path: "stage",
  format: "16:9",
  style,
  copy: { source: "user", lines: ["물방울 여행", "떠오른다"] },
  palette: [],
  typePlan: { faces: ["Archivo"], hierarchy: "One line.", maxWordsOnScreen: 4 },
  beats: [
    { t0: 0, t1: 4, layout: "split", hero: "Drop.", transition: "match" },
    { t0: 4, t1: 8, layout: "hero", hero: "Rise.", transition: "end" },
  ],
};
const norms = ["물방울 여행", "떠오른다"];
const settled = () => true;
const run = (over = {}) => ({
  text: "물방울 여행",
  norm: "물방울 여행",
  rects: [[100, 100, 900, 220]],
  opacity: 1,
  ink: 500,
  decor: false,
  family: "Archivo",
  color: "rgb(233, 235, 228)",
  fontSizePx: 76,
  scale: 1,
  gradient: null,
  ...over,
});
const sample = (runs, beat = 0, kind = "mid", regions = null) => ({ frame: 60, beat, kind, runs, regions });

describe("TEXT-OVERLAP: text over text fails", () => {
  it("names the overlapping pair and passes runs that sit apart", () => {
    const a = run();
    const b = run({ text: "떠오른다", norm: "떠오른다", rects: [[500, 150, 1200, 260]] });
    const [rule] = judgeTextRules({ treatment, width: 1920, height: 1080, samples: [sample([a, b])], settled, copyNorms: norms });
    assert.equal(rule.id, "TEXT-OVERLAP");
    assert.equal(rule.status, "FAIL");
    assert.match(rule.detail, /물방울 여행/u);
    const apart = run({ text: "떠오른다", norm: "떠오른다", rects: [[100, 600, 900, 720]] });
    const [passRule] = judgeTextRules({ treatment, width: 1920, height: 1080, samples: [sample([a, apart])], settled, copyNorms: norms });
    assert.equal(passRule.status, "PASS");
  });
});

describe("TEXT-ON-STYLE: copy keeps the house style", () => {
  const rules = (runs) => judgeTextRules({ treatment, width: 1920, height: 1080, samples: [sample(runs)], settled, copyNorms: norms });
  const byId = (runs, id) => rules(runs).find((r) => r.id === id);

  it("fails copy off the style roles, faces and type steps", () => {
    assert.match(byId([run({ color: "rgb(255, 0, 170)" })], "TEXT-ON-STYLE").detail, /colour off the swiss-signal text roles/u);
    assert.equal(byId([run({ color: "rgb(255, 0, 170)" })], "TEXT-ON-STYLE").status, "FAIL");
    assert.match(byId([run({ family: "VT323" })], "TEXT-ON-STYLE").detail, /VT323/u);
    assert.equal(byId([run({ fontSizePx: 50 })], "TEXT-ON-STYLE").status, "FAIL", "50 px sits on no swiss-signal step");
  });

  it("passes on-style copy, warns other text off the scale, skips the style without one declared", () => {
    assert.equal(byId([run()], "TEXT-ON-STYLE").status, "PASS");
    const warnRule = byId([run(), run({ text: "장식", norm: "장식", fontSizePx: 50 })], "TEXT-ON-STYLE");
    assert.equal(warnRule.status, "WARN", "decor off the scale warns; copy is clean");
    const plain = { ...treatment };
    delete plain.style;
    const rulesNoStyle = judgeTextRules({ treatment: plain, width: 1920, height: 1080, samples: [sample([run()])], settled, copyNorms: norms });
    assert.ok(!rulesNoStyle.some((r) => r.id === "TEXT-ON-STYLE"), "no declared style, no style rule");
  });
});

describe("TEXT-ZONE: settled copy stays in its shot zone", () => {
  it("fails a run outside the zone and a full shot that carries copy", () => {
    const outside = run({ rects: [[1400, 100, 1900, 220]] });
    const [rule] = judgeTextRules({ treatment, width: 1920, height: 1080, samples: [sample([outside])], settled, copyNorms: norms })
      .filter((r) => r.id === "TEXT-ZONE");
    assert.equal(rule.status, "FAIL");
    assert.match(rule.detail, /split type zone/u);
    const full = { ...treatment, beats: [{ t0: 0, t1: 4, layout: "full", hero: "Drop.", transition: "end" }] };
    const [fullRule] = judgeTextRules({ treatment: full, width: 1920, height: 1080, samples: [sample([run()])], settled, copyNorms: norms })
      .filter((r) => r.id === "TEXT-ZONE");
    assert.equal(fullRule.status, "FAIL");
    assert.match(fullRule.detail, /full shot/u);
  });
});

describe("RICH-FILL: a rich film fills its frame", () => {
  const full = Array(12).fill(0.5);
  const thin = (n) => [...Array(12 - n).fill(0.5), ...Array(n).fill(0)];

  it("fails thin midpoints, passes one miss, stays N/A for minimal and unmeasured films", () => {
    const fail = richFill({ treatment, samples: [sample([], 0, "mid", thin(5)), sample([], 1, "mid", thin(6))] });
    assert.equal(fail.status, "FAIL");
    assert.match(fail.detail, /2 of 2 beat midpoints/u);
    const one = richFill({ treatment, samples: [sample([], 0, "mid", thin(6)), sample([], 1, "mid", full)] });
    assert.equal(one.status, "PASS", "the end card may breathe");
    assert.equal(richFill({ treatment: { ...treatment, register: "minimal" }, samples: [sample([], 0, "mid", thin(6))] }).status, "N/A");
    assert.equal(richFill({ treatment, samples: [sample([], 0, "mid", null)] }).status, "N/A");
  });
});

describe("FLAT-FRAME and DEAD-AIR: any colour can be empty", () => {
  const frames = (n, p005, p995, busy) => Array.from({ length: n }, (_, i) => ({ frame: i, lumP005: p005, lumP995: p995, busy }));

  it("fails a long empty run of any colour and a long near-empty run", () => {
    assert.equal(checkFlatFrames(frames(150, 0.85, 0.86, 0.5), 60).status, "FAIL", "2.5 s of cream with nothing on it");
    assert.equal(checkFlatFrames(frames(30, 0.85, 0.86, 0.5), 60).status, "PASS");
    const mid = [...frames(40, 0, 0.5, 0.3), ...frames(50, 0, 0.5, 0.01), ...frames(40, 0, 0.5, 0.3)];
    assert.equal(checkDeadAir(mid, 60).status, "FAIL", "a 50-frame dead stretch mid-film");
    assert.equal(checkDeadAir(frames(20, 0, 0.5, 0.01), 60).status, "PASS");
  });

  it("stays N/A when the render did not record the spread or the busy share", () => {
    assert.equal(checkFlatFrames([{ frame: 0, lumP995: 0.5 }], 60).status, "N/A");
    assert.equal(checkDeadAir([{ frame: 0, lumP995: 0.5 }], 60).status, "N/A");
    assert.equal(checkFlatFrames([], 60).status, "N/A");
  });
});

describe("the register defaults to rich", () => {
  it("accepts rich and minimal, refuses the rest, fills the default in", () => {
    const plain = JSON.parse(readFileSync(join(root, "test", "fixtures", "motion", "treatment-stage.json"), "utf8"));
    const field = (t) => {
      const r = validateTreatment(t);
      return r.ok ? null : r.field;
    };
    assert.equal(field({ ...plain, register: "rich" }), null);
    assert.equal(field({ ...plain, register: "minimal" }), null);
    const bed = { mode: "generated", plan: "a glass bed", palette: { timbre: "glass", key: "A", mode: "minor", tempo: 104 }, events: plain.sound.events };
    assert.equal(field({ ...plain, register: "rich", sound: bed }), "sound.mode");
    assert.equal(field({ ...plain, register: "dense" }), "register");
    const filled = validateTreatment({ ...plain });
    assert.equal(filled.ok, true);
    assert.equal(filled.treatment.register, "rich");
  });
});

describe("parseCssColour and runClass", () => {
  it("reads rgb() and hex, and tells copy from the rest", () => {
    assert.deepEqual(parseCssColour("rgb(233, 235, 228)"), [233, 235, 228]);
    assert.deepEqual(parseCssColour("#B0452A"), [176, 69, 42]);
    assert.equal(parseCssColour("paper"), null);
    assert.equal(runClass({ norm: "물방울 여행" }, norms), "copy");
    assert.equal(runClass({ norm: "장식" }, norms), "other");
    assert.equal(runClass({ norm: "" }, norms), "other");
  });
});
