import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// lit-schematic moved to wjgoarxiv-skills (variants/litgrok/lit-schematic); LitGrok keeps its same-name note, and the
// project rule's Equipment drawings route still selects it. Only the route lives here now.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const body = readFileSync(join(root, ".grok", "skills", "lit-schematic", "SKILL.md"), "utf8");

// Grok Build discards the stdout of an allowing prompt hook, so the route is the project rule's
// "Equipment drawings" section plus the skill description. The model below applies the section's
// documented order (an owner named for the deliverable wins, then a trigger word selects the skill)
// so a rule edit that drops a trigger, an owner or the film exclusion turns these tests red.
describe("lit-schematic route", () => {
  const rule = readFileSync(join(root, ".grok", "rules", "00-litgrok.md"), "utf8");
  const section = rule.split(/^## Equipment drawings$/mu)[1]?.split(/^## /mu)[0] ?? "";
  const triggers = (section.match(/Triggers: ([^.]*(?:\.\w[^.]*)*)\. /u)?.[1] ?? "").split(", ").map((word) => word.trim()).filter(Boolean);
  const owners = [
    ["lit-scientific-visualization", /graph|chart|그래프|차트|데이터로|plot(?! plan)/iu],
    ["lit-docx", /report|보고서|리포트/iu],
    ["lit-pptx", /slides?|deck|발표|슬라이드/iu],
    ["frontend-ui-ux", /dashboard|page\b|screen|대시보드|페이지|화면|모니터링|landing/iu],
  ];
  const route = (prompt) => {
    if (!/^(?:lit\s|\/lit-schematic\b|lit-schematic\b)/iu.test(prompt)) return null;
    if (/^(?:\/?lit-schematic\b)/iu.test(prompt)) return "lit-schematic";
    for (const [owner, pattern] of owners) if (pattern.test(prompt)) return owner;
    const lower = prompt.toLowerCase();
    return triggers.some((word) => lower.includes(word.toLowerCase())) ? "lit-schematic" : null;
  };

  it("states its triggers, its owners and the film exclusion in the rule", () => {
    assert.ok(section.length > 200, "rule has an Equipment drawings section");
    for (const word of ["P&ID", "PFD", "BFD", "공정도", "apparatus", "isometric cutaway"]) assert.ok(triggers.includes(word), word);
    for (const owner of ["lit-scientific-visualization", "lit-diagram-drawer", "frontend-ui-ux"]) assert.ok(section.includes(`\`${owner}\``), owner);
    assert.match(rule, /\(vi\) a drawing of real equipment[^\n]*`lit-schematic`/u, "film exclusion (vi)");
    assert.match(section, /authorized bare `lit`/u);
    assert.match(section, /project\) or `~\/\.grok\/skills\/lit-schematic\/` \(user\)/u);
  });

  it("selects lit-schematic for lit prompts that ask to draw real equipment", () => {
    for (const prompt of [
      "lit draw a P&ID of the reactor loop",
      "lit 고압 하이드레이트 반응기 루프 P&ID 그려줘",
      "lit 공정도 그려줘",
      "lit draw the PFD for the absorber section",
      "lit 논문용 실험 장치 모식도 만들어줘",
      "lit isometric cutaway of a stirred autoclave",
      "lit draw the plot plan for the tank farm layout: equipment layout",
      "lit 오토클레이브 단면도 그려줘",
      "lit 냉각수 계통도 그려줘",
      "lit 오토클레이브 isometric cutaway 를 모션 영상으로 만들어줘",
      "lit make an interactive html cutaway: isometric cutaway of the reactor",
      "/lit-schematic hydrate reactor loop",
    ]) assert.equal(route(prompt), "lit-schematic", prompt);
  });

  it("keeps near misses with their owners and leaves tokenless or unauthorized prompts alone", () => {
    for (const [prompt, expected] of [
      ["lit P&ID 설명 보고서 작성해줘", "lit-docx"],
      ["lit make a report about the P&ID", "lit-docx"],
      ["lit 공정도 설명 발표자료 만들어줘", "lit-pptx"],
      ["lit 계통도 요약 슬라이드 만들어줘", "lit-pptx"],
      ["lit 배치도를 보여주는 대시보드 화면 만들어줘", "frontend-ui-ux"],
      ["lit build a dashboard showing the P&ID of the reactor", "frontend-ui-ux"],
      ["lit 단면도 데이터로 그래프 그려줘", "lit-scientific-visualization"],
      ["lit plot the P&ID loop pressure graph", "lit-scientific-visualization"],
      ["lit 도면 번호 체계 정리해줘", null],
      ["lit fix the database schema migration", null],
      ["draw a P&ID of the reactor", null],
      ["the lit-schematic skill is new", null],
      ["lit 우리 제품 소개 영상 만들어줘", null],
    ]) assert.equal(route(prompt), expected, prompt);
  });

  it("describes the skill so the model can pick it from the catalog alone", () => {
    const description = body.match(/^description: (.*)$/mu)[1];
    assert.ok(description.length <= 1024, "description length");
    for (const word of ["P&ID", "isometric", "journal"]) assert.match(description, new RegExp(word, "iu"), word);
    assert.doesNotMatch(description, /Grok/u);
  });
});
