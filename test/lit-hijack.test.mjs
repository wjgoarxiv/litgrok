import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildImplementerBrief,
  checkRun,
  decideLicence,
  detectLicence,
  findOverlap,
  fxtwitterToMarkdown,
  htmlToText,
  parseXStatusUrl,
  resolveTreeSubpath,
} from "../.grok/skills/lit-hijack/scripts/hijack.mjs";
import { isPublicAddress, safeFetch } from "../.grok/skills/lit-hijack/scripts/lib/safe-fetch.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillsRoot = join(root, ".grok", "skills");
const skillRoot = join(skillsRoot, "lit-hijack");
const cliPath = join(skillRoot, "scripts", "hijack.mjs");
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]);
const skillFiles = walk(skillRoot).map((file) => relative(skillRoot, file).replaceAll("\\", "/"));
const body = readFileSync(join(skillRoot, "SKILL.md"), "utf8");
const read = (...parts) => readFileSync(join(root, ...parts), "utf8");

let temp;
let counter = 0;

before(() => {
  temp = mkdtempSync(join(tmpdir(), "litgrok-hijack-"));
  mkdirSync(join(temp, "home"), { recursive: true });
});

const freshDir = (name) => {
  const dir = join(temp, `${name}-${counter++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
};

const projectCwd = () => {
  const cwd = freshDir("proj");
  writeFileSync(join(cwd, "package.json"), "{}\n");
  return cwd;
};

const cli = (args, cwd = temp) => spawnSync(process.execPath, [cliPath, ...args], {
  cwd,
  encoding: "utf8",
  env: { PATH: process.env.PATH, HOME: join(temp, "home"), NO_COLOR: "1" },
});

// Own-written sample prose. Nothing here is taken from a real post.
const SOURCE_PROSE = [
  "A careful studio writes the brief before any frame exists, so the model cannot fill gaps with its favourite defaults.",
  "The brief names the one thing a viewer must remember and the outcome that would make the film unacceptable to ship.",
].join(" ");
const PARAPHRASE = "Pin the takeaway and the rejection condition in a short production note first; only then may rendering start.";

describe("lit-hijack enrollment", () => {
  it("is in the Grok catalog, the parity inventory, and ships complete in the skills tree", () => {
    const catalog = JSON.parse(read(".grok-plugin", "plugin.json")).skills;
    assert.ok(catalog.includes("./.grok/skills/lit-hijack"), "plugin.json skills");
    const parity = JSON.parse(read("tools", "payload-substance-parity.json"));
    assert.ok(parity.products.p33.skills.includes("lit-hijack"), "parity inventory");
    assert.equal(parity.products.p33.inventory.count, readdirSync(skillsRoot).length, "inventory count follows the skills tree");
    for (const file of ["SKILL.md", "scripts/hijack.mjs", "references/capture-and-provenance.md", "references/distil-and-licence.md", "references/gap-and-port-design.md", "references/clean-room-build.md", "references/parity-and-report.md"]) {
      assert.ok(skillFiles.includes(file), `${file} ships`);
    }
  });

  it("is documented in both guides, both skills pages, both references, both READMEs, the npm READMEs and the changelog", () => {
    for (const doc of ["docs/guide.md", "docs/guide_ko-KR.md", "docs/skills.md", "docs/skills_ko-KR.md", "docs/reference.md", "docs/reference_ko-KR.md", "README.md", "README_ko-KR.md", "docs/npm/README.md", "docs/npm/README_ko-KR.md", "CHANGELOG.md"]) {
      assert.match(read(doc), /lit-hijack/u, `${doc} must document the skill`);
    }
    assert.ok(existsSync(join(root, "docs", "assets", "skills", "lit-hijack.webp")), "skills page snapshot");
  });

  it("points to its neighbours and they point back", () => {
    for (const neighbour of ["litresearch", "lit-plan", "start-work", "review-work"]) {
      assert.match(body, new RegExp(`\`${neighbour}\``, "u"), `hands work to ${neighbour}`);
    }
    for (const neighbour of ["litresearch", "lit-plan", "start-work"]) {
      assert.match(readFileSync(join(skillsRoot, neighbour, "SKILL.md"), "utf8"), /lit-hijack/u, neighbour);
    }
  });

  it("registers its script as an executable entry point", () => {
    const mode = statSync(join(skillRoot, "scripts", "hijack.mjs")).mode;
    assert.ok(mode & 0o111, "hijack.mjs is executable");
  });
});

// Grok Build discards the stdout of an allowing prompt hook, so the route is the project rule's
// "Mechanism ports" section plus the skill description. The model below applies the section's
// documented order (a hijack route word directly after `lit` wins, then an owner named for the
// deliverable wins, then a trigger word selects the skill) so a rule edit that drops a trigger,
// an owner or the precedence turns these tests red.
describe("lit-hijack route", () => {
  const rule = readFileSync(join(root, ".grok", "rules", "00-litgrok.md"), "utf8");
  const section = rule.split(/^## Mechanism ports$/mu)[1]?.split(/^## /mu)[0] ?? "";
  const triggers = (section.match(/Triggers: ([^.]*(\.\w[^.]*)*)\. /u)?.[1] ?? "").split(", ").map((word) => word.trim()).filter(Boolean);
  const owners = [
    ["litresearch", /research\b|find what people|what .* do about/iu],
    ["lit-plan", /plan the|plan\b/iu],
    ["review-work", /review\b|is this .*correct/iu],
    ["debugging", /debug\b/iu],
    ["litwork", /fix\b/iu],
    ["lit-docx", /report|보고서|리포트/iu],
    ["lit-pptx", /slides?|deck|발표|슬라이드/iu],
    ["lit-schematic", /P&ID|PFD|apparatus|isometric|cutaway/iu],
  ];
  const route = (prompt) => {
    if (/^(?:\/lit-hijack\b|lit-hijack\b)/iu.test(prompt)) return "lit-hijack";
    if (!/^(?:lit\s)/iu.test(prompt)) return null;
    if (/^lit\s+(hijack|hijacking|하이재킹|하이잭)\b/iu.test(prompt)) return "lit-hijack";
    for (const [owner, pattern] of owners) if (pattern.test(prompt)) return owner;
    const lower = prompt.toLowerCase();
    return triggers.some((word) => lower.includes(word.toLowerCase())) ? "lit-hijack" : null;
  };

  it("states its triggers, its owners and the precedence in the rule", () => {
    assert.ok(section.length > 200, "rule has a Mechanism ports section");
    for (const word of ["hijack", "hijacking", "하이재킹", "하이잭"]) assert.ok(triggers.includes(word), word);
    for (const owner of ["`litresearch`", "`lit-plan`", "`start-work`", "`review-work`"]) assert.ok(section.includes(owner), owner);
    assert.match(section, /route words directly after `lit` win/u, "precedence over later words");
    assert.match(section, /authorized bare `lit`/u);
    assert.match(section, /project\) or `~\/\.grok\/skills\/lit-hijack\/` \(user\)/u);
  });

  it("routes the hijack words to lit-hijack ahead of plan, review and research", () => {
    for (const prompt of [
      "lit hijack https://x.com/someone/status/1 into my motion skill",
      "lit hijacking the review lanes from this repo into my plan skill",
      "lit hijack this repo's research method into a new skill",
      "lit 하이재킹 이 글의 기법을 내 스킬에",
      "lit 하이잭 이 PDF 두 개",
      "lit-hijack these five posts",
      "/lit-hijack https://github.com/example/repo",
    ]) assert.equal(route(prompt), "lit-hijack", prompt);
  });

  it("keeps the neighbouring routes where they were", () => {
    for (const [prompt, expected] of [
      ["lit plan the hijack report layout", "lit-plan"],
      ["lit review the hijack ledger", "review-work"],
      ["lit research session hijack defences", "litresearch"],
      ["lit debug the session hijack in the login flow", "debugging"],
      ["lit fix the session hijack bug", "litwork"],
      ["lit draw a P&ID of the hijack test rig", "lit-schematic"],
      ["lit P&ID 설명 보고서 작성해줘", "lit-docx"],
      ["lit 공정도 요약 슬라이드 만들어줘", "lit-pptx"],
    ]) assert.equal(route(prompt), expected, prompt);
  });

  it("stays ahead of the equipment route when the material is a drawing technique", () => {
    for (const [prompt, expected] of [
      ["lit hijack the P&ID drawing technique from this post into lit-schematic", "lit-hijack"],
      ["lit 하이재킹 이 글의 컷어웨이 그리는 기법을 내 스킬에", "lit-hijack"],
      ["lit draw a P&ID of the reactor loop", "lit-schematic"],
    ]) assert.equal(route(prompt), expected, prompt);
  });

  it("leaves tokenless, unauthorized or hook-shaped prompts alone", () => {
    for (const prompt of [
      "`lit hijack these posts`",
      "hijack these posts into my skill",
      "how do attackers hijack a session cookie?",
      "the lit-hijack skill is new",
      "lit 우리 제품 소개 영상 만들어줘",
    ]) assert.equal(route(prompt), null, prompt);
  });

  it("describes the skill so the model can pick it from the catalog alone", () => {
    const description = body.match(/^description: (.*)$/mu)[1];
    assert.ok(description.length <= 1024, "description length");
    for (const word of ["mechanism", "licence", "parity"]) assert.match(description, new RegExp(word, "iu"), word);
    assert.doesNotMatch(description, /Grok/u);
  });
});

describe("hijack.mjs capture helpers", () => {
  it("parses X status URLs and nothing else", () => {
    assert.equal(parseXStatusUrl("https://x.com/someone/status/2105643919119696297"), "2105643919119696297");
    assert.equal(parseXStatusUrl("https://twitter.com/a_b/status/42?s=20"), "42");
    assert.equal(parseXStatusUrl("https://x.com/i/article/42"), null);
    assert.equal(parseXStatusUrl("https://example.com/status/42"), null);
  });

  it("never decodes an entity into a control character", () => {
    assert.equal(htmlToText("<p>a&#27;b&#7;c&#8;d</p>"), "abcd");
    assert.equal(htmlToText("<p>ok&#11;fine</p>"), "okfine");
    assert.doesNotMatch(htmlToText('<meta name="author" content="x&#27;]52;c;hi&#7;">'), /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/u);
  });

  it("keeps a tree subpath inside the clone", () => {
    const repo = join("clone", "repo");
    assert.equal(resolveTreeSubpath(repo, "/skills/lit-adhd").folder, resolve(repo, "skills", "lit-adhd"));
    for (const escape of ["/../../etc", "/a/../../etc", "/./a", "/a/./b", "/%2e%2e/x", "/a/%2E%2E/b"]) {
      assert.throws(() => resolveTreeSubpath(repo, escape), /repository/u, escape);
    }
    assert.equal(resolveTreeSubpath(repo, null), null);
    assert.equal(resolveTreeSubpath(repo, "/"), null);
  });

  it("turns an fxtwitter post with a long article into Markdown and provenance", () => {
    const json = {
      code: 200,
      tweet: {
        url: "https://x.com/writer/status/77",
        id: "77",
        text: "Short teaser",
        created_at: "Thu Oct 01 13:00:05 +0000 2026",
        author: { screen_name: "writer", name: "A Writer" },
        article: {
          title: "Studio notes",
          content: {
            blocks: [
              { key: "a", type: "header-one", text: "First part", entityRanges: [] },
              { key: "b", type: "unstyled", text: "Plain paragraph.", entityRanges: [] },
              { key: "c", type: "unordered-list-item", text: "one item", entityRanges: [] },
              { key: "d", type: "atomic", text: " ", entityRanges: [{ key: 0, offset: 0, length: 1 }] },
              { key: "e", type: "atomic", text: " ", entityRanges: [{ key: 1, offset: 0, length: 1 }] },
              { key: "f", type: "blockquote", text: "quoted line", entityRanges: [] },
            ],
            entityMap: [
              { key: "0", value: { type: "MARKDOWN", data: { markdown: "```\nlayout/\n```" } } },
              { key: "1", value: { type: "MEDIA", data: {} } },
            ],
          },
        },
      },
    };
    const { markdown, meta } = fxtwitterToMarkdown(json);
    assert.equal(meta.author, "A Writer (@writer)");
    assert.equal(meta.published, "2026-10-01T13:00:05.000Z");
    assert.equal(meta.kind, "x-article");
    assert.equal(meta.title, "Studio notes");
    assert.match(markdown, /^# Studio notes$/mu);
    assert.match(markdown, /^## First part$/mu);
    assert.match(markdown, /^- one item$/mu);
    assert.match(markdown, /^```\nlayout\/\n```$/mu);
    assert.match(markdown, /^\[media\]$/mu);
    assert.match(markdown, /^> quoted line$/mu);
    const plain = fxtwitterToMarkdown({ code: 200, tweet: { ...json.tweet, article: null } });
    assert.equal(plain.meta.kind, "x-post");
    assert.match(plain.markdown, /Short teaser/u);
  });
});

describe("safeFetch SSRF guard", () => {
  const publicDns = async () => [{ address: "203.0.113.7", family: 4 }];
  const seen = [];
  const stream = (chunk, times = Infinity) => {
    let sent = 0;
    return {
      getReader() {
        return {
          async read() {
            if (sent++ >= times) return { done: true, value: undefined };
            return { done: false, value: chunk };
          },
          cancel() {},
        };
      },
    };
  };
  const response = ({ status = 200, location = null, type = "text/plain", body = null, text = "" }) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ ...(location ? { location } : {}), "content-type": type }),
    body,
    arrayBuffer: async () => new Uint8Array(Buffer.from(text)).buffer,
  });
  const fetching = (routes) => async (url) => {
    seen.push(url);
    return routes[url] ?? { ok: false, status: 404, headers: new Headers(), body: null, arrayBuffer: async () => new ArrayBuffer(0) };
  };

  it("classifies loopback, link-local, private and ULA addresses as non-public", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "::", "fe80::1", "fc00::1", "::ffff:127.0.0.1"]) {
      assert.equal(isPublicAddress(ip), false, ip);
    }
    for (const ip of ["8.8.8.8", "203.0.113.7", "2001:db8::1"]) assert.equal(isPublicAddress(ip), true, ip);
  });

  it("follows a public https redirect and returns the body", async () => {
    seen.length = 0;
    const fetchImpl = fetching({
      "https://start.example/": response({ status: 302, location: "https://cdn.example/file" }),
      "https://cdn.example/file": response({ text: "hello" }),
    });
    const { buffer, finalUrl } = await safeFetch("https://start.example/", { limit: 1024, timeoutMs: 5000, fetchImpl, dnsImpl: publicDns });
    assert.equal(buffer.toString("utf8"), "hello");
    assert.equal(finalUrl, "https://cdn.example/file");
    assert.deepEqual(seen, ["https://start.example/", "https://cdn.example/file"]);
  });

  it("refuses a redirect to a private address without requesting it", async () => {
    seen.length = 0;
    const fetchImpl = fetching({ "https://evil.example/": response({ status: 302, location: "http://127.0.0.1:8080/admin" }) });
    await assert.rejects(safeFetch("https://evil.example/", { limit: 1024, timeoutMs: 5000, fetchImpl, dnsImpl: publicDns }), /refused/u);
    assert.deepEqual(seen, ["https://evil.example/"], "the private hop is never requested");
  });

  it("refuses a literal private URL and a scheme downgrade", async () => {
    seen.length = 0;
    const fetchImpl = fetching({});
    await assert.rejects(safeFetch("https://127.0.0.1/x", { limit: 1024, timeoutMs: 5000, fetchImpl, dnsImpl: publicDns }), /refused/u);
    await assert.rejects(safeFetch("http://203.0.113.7/x", { limit: 1024, timeoutMs: 5000, fetchImpl, dnsImpl: publicDns }), /refused/u);
    assert.deepEqual(seen, [], "nothing is requested");
  });

  it("refuses when DNS fails or any resolved address is private", async () => {
    const fetchImpl = fetching({});
    await assert.rejects(safeFetch("https://gone.example/", { limit: 1024, timeoutMs: 5000, fetchImpl, dnsImpl: async () => { throw new Error("ENOTFOUND"); } }), /refused/u);
    await assert.rejects(safeFetch("https://mixed.example/", {
      limit: 1024, timeoutMs: 5000, fetchImpl, dnsImpl: async () => [{ address: "203.0.113.7", family: 4 }, { address: "10.9.9.9", family: 4 }],
    }), /refused/u);
    assert.deepEqual(seen, [], "nothing is requested");
  });

  it("connects to the address the hop check approved, not a re-resolution", async () => {
    const approved = [];
    const dnsImpl = async (host) => {
      approved.push(host);
      return host === "first.example" ? [{ address: "203.0.113.7" }] : [{ address: "198.51.100.9" }];
    };
    const connected = [];
    const requestImpl = (href, { headers, signal, lookup }, onResponse) => {
      const host = new URL(href).hostname;
      lookup(host, {}, (_error, address, family) => {
        connected.push({ host, address, family });
        const res = new Readable({ read() {} });
        res.statusCode = host === "first.example" ? 302 : 200;
        res.headers = host === "first.example" ? { location: "https://second.example/file" } : { "content-type": "text/plain" };
        onResponse(res);
        if (host !== "first.example") {
          res.push("pinned");
          res.push(null);
        }
      });
      return { on() {}, end() {} };
    };
    const { buffer, finalUrl } = await safeFetch("https://first.example/", { limit: 1024, fetchImpl: null, requestImpl, dnsImpl });
    assert.equal(buffer.toString("utf8"), "pinned");
    assert.equal(finalUrl, "https://second.example/file");
    assert.deepEqual(approved, ["first.example", "second.example"], "each hop is checked");
    assert.deepEqual(connected, [
      { host: "first.example", address: "203.0.113.7", family: 4 },
      { host: "second.example", address: "198.51.100.9", family: 4 },
    ]);
  });

  it("stops an endless body at the cap instead of buffering it", async () => {
    let bytes = 0;
    const counting = { getReader: stream(Buffer.alloc(65536, 7)).getReader };
    const origGetReader = counting.getReader.bind(counting);
    let reads = 0;
    counting.getReader = () => {
      const reader = origGetReader();
      const origRead = reader.read.bind(reader);
      reader.read = async () => { reads += 1; const chunk = await origRead(); if (chunk.value) bytes += chunk.value.length; return chunk; };
      return reader;
    };
    const fetchImpl = fetching({ "https://flood.example/": response({ type: "application/octet-stream", body: counting }) });
    await assert.rejects(safeFetch("https://flood.example/", { limit: 1024 * 1024, timeoutMs: 10000, fetchImpl, dnsImpl: publicDns }), /larger/u);
    assert.ok(bytes < 2 * 1024 * 1024, `stops near the cap (read ${bytes})`);
    assert.ok(reads < 40, `does not loop forever (${reads} reads)`);
  });
});

describe("hijack.mjs licence gate", () => {
  it("detects common licences from their text or an SPDX line", () => {
    assert.equal(detectLicence("MIT License\n\nPermission is hereby granted, free of charge, to any person").spdx, "MIT");
    assert.equal(detectLicence("Apache License\nVersion 2.0, January 2004").spdx, "Apache-2.0");
    assert.equal(detectLicence("GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007").spdx, "GPL-3.0");
    assert.equal(detectLicence("GNU AFFERO GENERAL PUBLIC LICENSE\nVersion 3").spdx, "AGPL-3.0");
    assert.equal(detectLicence("// SPDX-License-Identifier: MPL-2.0\n").spdx, "MPL-2.0");
    assert.equal(detectLicence("This is free and unencumbered software released into the public domain.").spdx, "Unlicense");
    assert.equal(detectLicence("Licensed under Creative Commons Attribution-NonCommercial 4.0").spdx, "CC-BY-NC-4.0");
    assert.equal(detectLicence("Just a readme with no terms").spdx, "NOASSERTION");
  });

  it("maps every licence class to a take decision, and prohibition to review", () => {
    assert.equal(decideLicence("MIT").decision, "ideas-credit");
    assert.equal(decideLicence("Apache-2.0").decision, "ideas-credit");
    assert.equal(decideLicence("CC-BY-4.0").decision, "ideas-credit");
    assert.equal(decideLicence("GPL-3.0").decision, "ideas-only");
    assert.equal(decideLicence("CC-BY-SA-4.0").decision, "ideas-only");
    assert.equal(decideLicence("CC-BY-NC-4.0").decision, "ideas-only");
    assert.equal(decideLicence("NOASSERTION").decision, "ideas-only");
    assert.equal(decideLicence("NOASSERTION", { text: "Do not copy, adapt or redistribute any part of this guide." }).decision, "needs-review");
    assert.equal(decideLicence("NOASSERTION", { text: "© 2026 A Writer. All rights reserved.\nNo part of this publication may be reproduced." }).decision, "needs-review");
  });

  it("reads reuse terms only where the source talks about rights, not inside its subject matter", () => {
    const article = "## Reference analysis\n\n- KEEP: the pacing of the reveal\n- DO NOT COPY: the exact layout of the hero shot\n";
    assert.equal(decideLicence("NOASSERTION", { text: article }).decision, "ideas-only");
    assert.equal(decideLicence("MIT", { text: `${article}\nSPDX-License-Identifier: MIT` }).decision, "ideas-credit");
  });
});

describe("hijack.mjs overlap gate", () => {
  it("flags a verbatim run and passes a paraphrase", () => {
    const sources = [{ id: "S1", text: SOURCE_PROSE }];
    const copied = `Intro line.\nAs one note says, a careful studio writes the brief before any frame exists, so the model cannot fill gaps.\n`;
    const runs = findOverlap({ sources, targets: [{ path: "SKILL.md", text: copied }], minWords: 12 });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].source, "S1");
    assert.equal(runs[0].path, "SKILL.md");
    assert.equal(runs[0].line, 2);
    assert.ok(runs[0].words >= 12);
    assert.deepEqual(findOverlap({ sources, targets: [{ path: "SKILL.md", text: PARAPHRASE }], minWords: 12 }), []);
  });

  it("ignores case, punctuation and Markdown, and works on Hangul", () => {
    const sources = [{ id: "S2", text: "먼저 브리프를 쓰고 그다음에 장면을 그린다 그래야 모델이 빈칸을 자기 취향으로 채우지 않는다 정말로" }];
    const target = "**먼저** 브리프를 쓰고, 그다음에 장면을 그린다. 그래야 모델이 빈칸을 자기 취향으로 채우지 않는다!";
    assert.equal(findOverlap({ sources, targets: [{ path: "a.md", text: target }], minWords: 12 }).length, 1);
    assert.equal(findOverlap({ sources, targets: [{ path: "a.md", text: target }], minWords: 20 }).length, 0);
  });
});

// A complete small run on disk: one captured source, one mechanism, a spec, a build, parity and a report.
const writeRun = () => {
  const target = freshDir("target");
  mkdirSync(join(target, "skills", "toy"), { recursive: true });
  writeFileSync(join(target, "skills", "toy", "SKILL.md"), "# Toy\n\nLine two.\nWrite the promo brief.\n");
  const run = join(target, ".grok", "litgrok", "hijack", "studio-brief");
  const init = cli(["init", run, "--target", target, "--base-ref", "abc1234"]);
  assert.equal(init.status, 0, init.stderr);
  const sourceFile = join(target, "post.md");
  writeFileSync(sourceFile, `${SOURCE_PROSE}\n`);
  const capture = cli(["capture", run, sourceFile, "--kind", "file", "--url", "https://x.com/writer/status/77", "--author", "A Writer", "--date", "2026-10-01"]);
  assert.equal(capture.status, 0, capture.stderr);
  const licence = cli(["licence", run]);
  assert.equal(licence.status, 0, licence.stderr);
  const ledgerPath = join(run, "ledger.json");
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  ledger.mechanisms = [{
    id: "M1",
    title: "Brief before render",
    sources: ["S1"],
    locator: "S1 paragraph 1",
    what: "A production note fixes the takeaway and the rejection condition before any rendering.",
    why: "Unfilled decisions are filled by model defaults, which is where look-alike output comes from.",
    evidence: "anecdotal",
    evidence_note: "Practitioner report, no measurement.",
    gap: { status: "weak", refs: ["skills/toy/SKILL.md:4"], note: "asks for a brief with no required fields" },
    port: { decision: "adapt", reason: "The toy skill already writes a brief; it lacks the two required fields." },
    parity: {
      criterion: "A brief from the toy skill names the takeaway and the rejection condition.",
      red: "baseline brief has neither field",
      green: "treatment brief has both fields",
      surface: "grok -p in a throwaway workspace",
      artifact: "parity/treatment.md",
    },
  }];
  ledger.build = { plan: "plans/toy-brief.md", changed: ["skills/toy/SKILL.md"] };
  ledger.parity = { baseline_outputs: ["parity/baseline.md"], treatment_outputs: ["parity/treatment.md"], markers: ["Rejection condition"] };
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  writeFileSync(join(run, "SPEC.md"), "# Spec\n\n## M1 Brief before render\n\nThe toy skill's brief gains two required fields: Takeaway and Rejection condition.\n");
  mkdirSync(join(target, "plans"), { recursive: true });
  writeFileSync(join(target, "plans", "toy-brief.md"), "# Toy brief\n\n- [ ] 1. Add the two fields (SPEC M1)\n");
  writeFileSync(join(target, "skills", "toy", "SKILL.md"), "# Toy\n\nLine two.\nWrite the promo brief with a Takeaway and a Rejection condition field.\n");
  mkdirSync(join(run, "parity"), { recursive: true });
  writeFileSync(join(run, "parity", "baseline.md"), "Brief: a fun launch video.\n");
  writeFileSync(join(run, "parity", "treatment.md"), "Takeaway: one tap. Rejection condition: any invented screen.\n");
  writeFileSync(join(run, "REPORT.md"), "# Report\n\n## Taken\n\nM1 adapted.\n\n## Left\n\nNothing else.\n\n## Provenance\n\nS1 https://x.com/writer/status/77 (A Writer, 2026-10-01), ideas-only.\n");
  return { target, run, ledgerPath };
};

const editLedger = (ledgerPath, change) => {
  const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
  change(ledger);
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
};

describe("hijack.mjs run gate", () => {
  it("passes a complete run through every phase, from the CLI too", () => {
    const { run } = writeRun();
    const result = checkRun(run, { phase: "report" });
    assert.deepEqual(result.issues, []);
    assert.equal(result.ok, true);
    const ledger = JSON.parse(readFileSync(join(run, "ledger.json"), "utf8"));
    assert.equal(ledger.sources[0].licence.decision, "ideas-only", "an X post with no licence is ideas-only");
    assert.match(ledger.sources[0].retrieved_at, /^\d{4}-\d{2}-\d{2}T/u);
    assert.match(ledger.sources[0].files[0].sha256, /^[0-9a-f]{64}$/u);
    const cliCheck = cli(["check", run, "--phase", "report"]);
    assert.equal(cliCheck.status, 0, cliCheck.stdout + cliCheck.stderr);
  });

  it("fails a source with missing provenance or a tampered capture", () => {
    const { run, ledgerPath } = writeRun();
    editLedger(ledgerPath, (ledger) => { delete ledger.sources[0].retrieved_at; });
    assert.match(checkRun(run, { phase: "capture" }).issues.join("\n"), /S1: retrieved_at/u);
    const second = writeRun();
    const captured = JSON.parse(readFileSync(second.ledgerPath, "utf8")).sources[0].files[0].path;
    writeFileSync(join(second.run, captured), "changed after capture\n");
    assert.match(checkRun(second.run, { phase: "capture" }).issues.join("\n"), /S1: .*sha256 mismatch/u);
  });

  it("fails a gap claim whose file:line does not resolve", () => {
    const { run, ledgerPath } = writeRun();
    editLedger(ledgerPath, (ledger) => { ledger.mechanisms[0].gap.refs = ["skills/toy/SKILL.md:400"]; });
    assert.match(checkRun(run, { phase: "gap" }).issues.join("\n"), /M1: gap ref skills\/toy\/SKILL\.md:400/u);
  });

  it("fails a taken mechanism that rests only on a no-go source", () => {
    const { run, ledgerPath } = writeRun();
    editLedger(ledgerPath, (ledger) => { ledger.sources[0].licence.decision = "no-go"; });
    assert.match(checkRun(run, { phase: "gap" }).issues.join("\n"), /M1: .*no-go/u);
  });

  it("fails a spec that points at the sources or copies them", () => {
    const { run } = writeRun();
    writeFileSync(join(run, "SPEC.md"), "# Spec\n\n## M1\n\nRead sources/S1/content.md for details.\n");
    assert.match(checkRun(run, { phase: "spec" }).issues.join("\n"), /SPEC\.md names the captured sources/u);
    writeFileSync(join(run, "SPEC.md"), `# Spec\n\n## M1\n\n${SOURCE_PROSE}\n`);
    assert.match(checkRun(run, { phase: "spec" }).issues.join("\n"), /SPEC\.md:5 copies \d+ words from S1/u);
  });

  it("fails a build without a plan in lit-plan's row grammar that covers every taken mechanism", () => {
    const { run, target, ledgerPath } = writeRun();
    writeFileSync(join(target, "plans", "toy-brief.md"), "# Toy brief\n\n1. Add the two fields (SPEC M1)\n");
    assert.match(checkRun(run, { phase: "build" }).issues.join("\n"), /build\.plan plans\/toy-brief\.md has no column-zero task row/u);
    writeFileSync(join(target, "plans", "toy-brief.md"), "# Toy brief\n\n- [ ] 1. Add the two fields\n");
    assert.match(checkRun(run, { phase: "build" }).issues.join("\n"), /build\.plan plans\/toy-brief\.md never cites M1/u);
    editLedger(ledgerPath, (ledger) => { delete ledger.build.plan; });
    assert.match(checkRun(run, { phase: "build" }).issues.join("\n"), /build\.plan is missing/u);
  });

  it("fails a build that copied source wording into the target", () => {
    const { run, target } = writeRun();
    writeFileSync(join(target, "skills", "toy", "SKILL.md"), `# Toy\n\n${SOURCE_PROSE}\n`);
    assert.match(checkRun(run, { phase: "build" }).issues.join("\n"), /skills\/toy\/SKILL\.md:3 copies \d+ words from S1/u);
  });

  it("fails parity when the behaviour never appeared, or the baseline saw the treatment", () => {
    const { run } = writeRun();
    writeFileSync(join(run, "parity", "treatment.md"), "A fun launch video.\n");
    assert.match(checkRun(run, { phase: "parity" }).issues.join("\n"), /marker "Rejection condition" never appears in a treatment output/u);
    const second = writeRun();
    writeFileSync(join(second.run, "parity", "baseline.md"), "Rejection condition: none.\n");
    assert.match(checkRun(second.run, { phase: "parity" }).issues.join("\n"), /baseline output parity\/baseline\.md shows marker "Rejection condition"/u);
  });

  it("fails a report that skips a mechanism or a needed credit", () => {
    const { run, ledgerPath } = writeRun();
    writeFileSync(join(run, "REPORT.md"), "# Report\n\n## Taken\n\n## Left\n\n## Provenance\n");
    assert.match(checkRun(run, { phase: "report" }).issues.join("\n"), /REPORT\.md does not account for M1/u);
    const second = writeRun();
    editLedger(second.ledgerPath, (ledger) => { ledger.sources[0].licence.decision = "ideas-credit"; });
    assert.match(checkRun(second.run, { phase: "report" }).issues.join("\n"), /S1 needs credit/u);
    void ledgerPath;
  });

  it("builds an implementer brief from the spec alone", () => {
    const { run } = writeRun();
    const brief = buildImplementerBrief(run);
    assert.match(brief, /^TASK:/mu);
    assert.match(brief, /DELIVERABLE/u);
    assert.match(brief, /SCOPE/u);
    assert.match(brief, /VERIFY/u);
    assert.match(brief, /Rejection condition/u, "carries the spec text");
    assert.doesNotMatch(brief, /x\.com\/writer|sources\/S1/u, "names no captured source");
  });

  it("refuses a PDF capture whose bytes are not a PDF", () => {
    const { run, target } = writeRun();
    writeFileSync(join(target, "fake.pdf"), "not a pdf\n");
    const result = cli(["capture", run, join(target, "fake.pdf"), "--kind", "pdf"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /%PDF-/u);
  });
});

describe("lit-hijack skill depth", () => {
  const skill = () => readFileSync(join(skillRoot, "SKILL.md"), "utf8");

  it("is a dense phased workflow, not a stub", () => {
    const text = skill();
    assert.ok(Buffer.byteLength(text, "utf8") >= 18_000, `SKILL.md is ${Buffer.byteLength(text, "utf8")} bytes`);
    assert.match(text, /^---\nname: lit-hijack\n/u);
    for (const heading of [
      "## When to use lit-hijack",
      "## How to start it in Grok Build",
      "## The run folder",
      "## Phase 0: Frame",
      "## Phase 1: Capture",
      "## Phase 2: Distil",
      "## Phase 3: Licence gate",
      "## Phase 4: Gap analysis",
      "## Phase 5: Port design and spec",
      "## Phase 6: Build",
      "## Phase 7: Parity proof",
      "## Phase 8: Report",
      "## Stop rules",
      "## Safety boundaries",
      "## Failure modes",
      "## Worked example",
      "## Final checklist",
    ]) assert.ok(text.includes(heading), `missing ${heading}`);
  });

  it("routes to its neighbours instead of re-implementing them", () => {
    const text = skill();
    for (const neighbour of ["litresearch", "lit-plan", "start-work", "review-work"]) {
      assert.match(text, new RegExp(`\`${neighbour}\``, "u"), `hands work to ${neighbour}`);
    }
    for (const command of ["capture", "licence", "overlap", "brief", "check"]) {
      assert.match(text, new RegExp(`hijack\\.mjs ${command}\\b`, "u"), `documents hijack.mjs ${command}`);
    }
    assert.match(text, /api\.fxtwitter\.com/u);
    assert.match(text, /TASK:[\s\S]*DELIVERABLE[\s\S]*SCOPE[\s\S]*VERIFY/u);
    assert.match(text, /\/lit-hijack <sources>/u);
  });

  it("resolves every references/ path it names, and the references carry real content", () => {
    const text = skill();
    const named = [...new Set([...text.matchAll(/references\/([a-z0-9-]+\.md)/gu)].map((match) => match[1]))];
    assert.ok(named.length >= 5, "names its reference files");
    for (const file of named) assert.ok(existsSync(join(skillRoot, "references", file)), `references/${file}`);
    assert.deepEqual(readdirSync(join(skillRoot, "references")).sort(), [...named].sort(), "no orphaned reference file");
    for (const file of named) {
      assert.ok(readFileSync(join(skillRoot, "references", file), "utf8").length >= 3_000, `references/${file} has content`);
    }
  });

  it("names no sibling product, foreign harness, or Claude shape", () => {
    const corpus = [skill(), ...readdirSync(join(skillRoot, "references")).map((f) => readFileSync(join(skillRoot, "references", f), "utf8"))].join("\n");
    assert.doesNotMatch(corpus, /\blit(?:claude|hermes|codex|opencode|muse|gravity)\b|\.litclaude\/|litclaude:|27_LITFAMILY|plans\/2026/iu);
  });
});

