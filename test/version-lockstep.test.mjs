import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REGISTRY_PATH = join(PRODUCT_ROOT, "tools", "version-manifests.json");
const VERSION = JSON.parse(readFileSync(join(PRODUCT_ROOT, "package.json"), "utf8")).version;

function runGuard(root = PRODUCT_ROOT) {
  return spawnSync(process.execPath, [join(root, "tools", "check-version-lockstep.mjs")], { cwd: root, encoding: "utf8" });
}

function withVersionFixture(check) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "litgrok-version-fixture-")));
  try {
    const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
    const paths = new Set([
      "tools/check-version-lockstep.mjs",
      "tools/version-manifests.json",
      ...registry.manifests.map((entry) => entry.path),
      ...registry.incidentalMatches.map((entry) => entry.path),
    ]);
    for (const path of paths) {
      const target = join(root, path);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(PRODUCT_ROOT, path), target);
    }
    return check(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function trackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], { cwd: PRODUCT_ROOT, encoding: "utf8" });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.split("\0").filter(Boolean);
}

function hasBoundedToken(source, token) {
  let index = source.indexOf(token);
  while (index !== -1) {
    const before = source[index - 1];
    const after = source[index + token.length];
    const bounded = (before === undefined || !/[0-9.]/u.test(before)) && (after === undefined || !/[0-9.]/u.test(after));
    if (bounded) return true;
    index = source.indexOf(token, index + token.length);
  }
  return false;
}

function versionBearingFiles() {
  const escaped = VERSION.replace(/\./gu, "\\.");
  return trackedFiles()
    .filter((path) => {
      let source;
      try {
        source = readFileSync(join(PRODUCT_ROOT, path), "utf8");
      } catch {
        return false;
      }
      return hasBoundedToken(source, VERSION) || hasBoundedToken(source, escaped);
    })
    .sort();
}

test("the version lockstep guard accepts the committed repository", () => {
  const result = runGuard();
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test("a drifted literal pin fails and names its file", () => withVersionFixture((root) => {
  const target = join(root, "docs", "npm", "README.md");
  const original = readFileSync(target, "utf8");
  assert.ok(original.includes(VERSION), "fixture precondition: the npm README pins the release");
  try {
    writeFileSync(target, original.replace(VERSION, "0.0.0"), "utf8");
    assert.equal(readFileSync(join(PRODUCT_ROOT, "docs", "npm", "README.md"), "utf8"), original, "the live npm README must remain unchanged while the fixture is drifted");
    const result = runGuard(root);
    assert.notEqual(result.status, 0, "guard must reject a drifted literal pin");
    assert.match(`${result.stdout}\n${result.stderr}`, /docs[\\/]npm[\\/]README\.md/u);
  } finally {
    writeFileSync(target, original, "utf8");
  }
  assert.equal(runGuard(root).status, 0, "guard must pass after the literal pin is restored");
}));

test("host versions that extend the release semver are not counted as pins", () => withVersionFixture((root) => {
  const target = join(root, "README.md");
  const original = readFileSync(target, "utf8");
  writeFileSync(target, `${original}\nObserved Grok Build ${VERSION}.4.\n`, "utf8");
  const result = runGuard(root);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}));

test("a drifted escaped-regex pin fails and names its file", () => withVersionFixture((root) => {
  const target = join(root, "test", "installer.test.mjs");
  const original = readFileSync(target, "utf8");
  const escaped = VERSION.replace(/\./gu, "\\.");
  assert.ok(original.includes(escaped), "fixture precondition: installer.test.mjs pins an escaped release");
  try {
    writeFileSync(target, original.replace(escaped, "0\\.0\\.0"), "utf8");
    assert.equal(readFileSync(join(PRODUCT_ROOT, "test", "installer.test.mjs"), "utf8"), original, "the live installer test must remain unchanged while the fixture is drifted");
    const result = runGuard(root);
    assert.notEqual(result.status, 0, "guard must reject a drifted escaped pin");
    assert.match(`${result.stdout}\n${result.stderr}`, /test[\\/]installer\.test\.mjs/u);
  } finally {
    writeFileSync(target, original, "utf8");
  }
  assert.equal(runGuard(root).status, 0, "guard must pass after the escaped pin is restored");
}));

test("a drifted incidental match fails and names its file", () => withVersionFixture((root) => {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  const relativePath = registry.incidentalMatches[0].path;
  const target = join(root, relativePath);
  const original = readFileSync(target, "utf8");
  const incidentalVersion = registry.incidentalMatches[0].version ?? VERSION;
  assert.ok(original.includes(incidentalVersion), "fixture precondition: incidental text matches the declared version");
  try {
    writeFileSync(target, original.replace(incidentalVersion, "0.0.0"), "utf8");
    assert.equal(readFileSync(join(PRODUCT_ROOT, relativePath), "utf8"), original, "the live payload must remain unchanged while the fixture is drifted");
    const result = runGuard(root);
    assert.notEqual(result.status, 0, "guard must reject a stale incidental-match declaration");
    assert.match(`${result.stdout}\n${result.stderr}`, /backend-hono\.md/u);
  } finally {
    writeFileSync(target, original, "utf8");
  }
  assert.equal(runGuard(root).status, 0, "guard must pass after the incidental match is restored");
}));

test("every tracked file carrying either version spelling is classified", () => {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  assert.ok(registry && Array.isArray(registry.manifests), "registry must contain a manifests array");
  const registered = registry.manifests.map((entry) => entry.path).sort();
  assert.deepEqual(registered, [...new Set(registered)].sort(), "registry paths must be unique");
  const incidental = registry.incidentalMatches.map((entry) => entry.path).sort();
  assert.deepEqual(incidental, [...new Set(incidental)].sort(), "incidental-match paths must be unique");
  const expected = [...new Set([...versionBearingFiles(), ...incidental])].sort();
  assert.deepEqual(
    [...registered, ...incidental].sort(),
    expected,
    "every tracked file carrying the current release or a declared incidental version must be classified exactly once",
  );
});

test("each registry entry declares a valid kind, count, and reason", () => {
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  for (const entry of registry.manifests) {
    assert.ok(["pinned", "history", "derived"].includes(entry.kind), `bad kind for ${entry.path}`);
    assert.equal(Number.isInteger(entry.occurrences), true, `occurrences missing for ${entry.path}`);
    assert.ok(entry.occurrences > 0, `occurrences must be positive for ${entry.path}`);
    assert.equal(typeof entry.why, "string", `why missing for ${entry.path}`);
    assert.ok(entry.why.trim().length > 0, `why must be non-empty for ${entry.path}`);
  }
  for (const entry of registry.incidentalMatches) {
    assert.match(entry.version ?? VERSION, /^\d+\.\d+\.\d+$/u, `bad incidental version for ${entry.path}`);
    assert.equal(Number.isInteger(entry.occurrences), true, `incidental count missing for ${entry.path}`);
    assert.ok(entry.occurrences > 0, `incidental count must be positive for ${entry.path}`);
    assert.equal(typeof entry.why, "string", `incidental reason missing for ${entry.path}`);
    assert.ok(entry.why.trim().length > 0, `incidental reason must be non-empty for ${entry.path}`);
  }
});
