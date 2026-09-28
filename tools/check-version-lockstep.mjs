#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PRODUCT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_PATH = resolve(PRODUCT_ROOT, "package.json");
const REGISTRY_PATH = resolve(PRODUCT_ROOT, "tools", "version-manifests.json");
const VALID_KINDS = new Set(["pinned", "history", "derived"]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function versionPatterns(version) {
  return [version, version.replace(/\./gu, "\\.")];
}

function isVersionBoundary(character) {
  return character === undefined || !/[0-9.]/u.test(character);
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    const before = haystack[index - 1];
    const after = haystack[index + needle.length];
    if (isVersionBoundary(before) && isVersionBoundary(after)) count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

function countVersion(haystack, version) {
  const [literal, escaped] = versionPatterns(version);
  // The escaped spelling does not contain the plain literal, so these counts do not overlap.
  return countOccurrences(haystack, literal) + countOccurrences(haystack, escaped);
}

function insideProductRoot(path) {
  const fromRoot = relative(PRODUCT_ROOT, path);
  return fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && fromRoot !== "";
}

export function run() {
  const packageJson = readJson(PACKAGE_PATH);
  const version = packageJson.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/u.test(version)) {
    return {
      version: String(version),
      manifestCount: 0,
      failures: ["package.json version is not a plain release semver"],
      status: 2,
    };
  }

  const registry = readJson(REGISTRY_PATH);
  if (!registry || !Array.isArray(registry.manifests)) {
    throw new Error("version-manifests.json must contain a manifests array");
  }
  const incidentalMatches = registry.incidentalMatches ?? [];
  if (!Array.isArray(incidentalMatches)) {
    throw new Error("version-manifests.json incidentalMatches must be an array");
  }

  const failures = [];
  const seen = new Set();
  const packageName = typeof packageJson.name === "string" ? packageJson.name : "";
  const qualifiedPin = packageName
    ? new RegExp(`${escapeRegExp(packageName)}(?:@|-)(\\d+\\.\\d+\\.\\d+)`, "gu")
    : null;

  for (const entry of registry.manifests) {
    const path = entry?.path;
    if (typeof path !== "string" || path.length === 0) {
      failures.push("registry entry has no relative path");
      continue;
    }
    if (seen.has(path)) {
      failures.push(`${path}: duplicate registry entry`);
      continue;
    }
    seen.add(path);

    const absolute = resolve(PRODUCT_ROOT, path);
    if (!insideProductRoot(absolute)) {
      failures.push(`${path}: registry path escapes the product root`);
      continue;
    }
    if (!VALID_KINDS.has(entry.kind)) {
      failures.push(`${path}: unsupported registry kind '${entry.kind}'`);
      continue;
    }
    if (!Number.isInteger(entry.occurrences) || entry.occurrences < 1) {
      failures.push(`${path}: occurrences must be a positive integer`);
      continue;
    }

    let text;
    try {
      text = readFileSync(absolute, "utf8");
    } catch (error) {
      failures.push(`${path}: cannot read (${error.code ?? error.message})`);
      continue;
    }

    if (entry.kind === "history") {
      const heading = new RegExp(`^##\\s+${escapeRegExp(version)}(?:\\s|$)`, "mu");
      if (!heading.test(text)) {
        failures.push(`${path}: no release heading for the current package version`);
      }
      continue;
    }

    const actual = countVersion(text, version);
    if (actual !== entry.occurrences) {
      failures.push(`${path}: expected ${entry.occurrences} occurrence(s), found ${actual}`);
      continue;
    }

    if (qualifiedPin) {
      for (const match of text.matchAll(qualifiedPin)) {
        if (match[1] !== version) {
          failures.push(`${path}: stale package-qualified pin '${match[0]}'`);
        }
      }
    }
  }

  for (const entry of incidentalMatches) {
    const path = entry?.path;
    if (typeof path !== "string" || path.length === 0) {
      failures.push("incidental match entry has no relative path");
      continue;
    }
    if (seen.has(path)) {
      failures.push(`${path}: duplicate or manifest-overlapping incidental match entry`);
      continue;
    }
    seen.add(path);

    const absolute = resolve(PRODUCT_ROOT, path);
    if (!insideProductRoot(absolute)) {
      failures.push(`${path}: incidental match path escapes the product root`);
      continue;
    }
    if (!Number.isInteger(entry.occurrences) || entry.occurrences < 1) {
      failures.push(`${path}: incidental match occurrences must be a positive integer`);
      continue;
    }
    if (typeof entry.why !== "string" || entry.why.trim().length === 0) {
      failures.push(`${path}: incidental match reason must be non-empty`);
      continue;
    }
    const incidentalVersion = entry.version ?? version;
    if (typeof incidentalVersion !== "string" || !/^\d+\.\d+\.\d+$/u.test(incidentalVersion)) {
      failures.push(`${path}: incidental match version must be a plain release semver`);
      continue;
    }

    let text;
    try {
      text = readFileSync(absolute, "utf8");
    } catch (error) {
      failures.push(`${path}: cannot read incidental match (${error.code ?? error.message})`);
      continue;
    }

    const actual = countVersion(text, incidentalVersion);
    if (actual !== entry.occurrences) {
      failures.push(`${path}: expected ${entry.occurrences} incidental match(es), found ${actual}`);
    }
    if (qualifiedPin && [...text.matchAll(qualifiedPin)].length > 0) {
      failures.push(`${path}: package-qualified release pins cannot be classified as incidental`);
    }
  }

  return { version, manifestCount: registry.manifests.length, failures, status: failures.length ? 1 : 0 };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const report = run();
    if (report.status === 2) {
      process.stderr.write(`version lockstep: ${report.failures.join("; ")}\n`);
      process.exitCode = 2;
    } else if (report.failures.length > 0) {
      process.stderr.write(`version lockstep FAILED against package.json ${report.version}:\n`);
      for (const failure of report.failures) process.stderr.write(`  - ${failure}\n`);
      process.stderr.write(`\n${report.failures.length} disagreement(s). Every pinned site must move in one pass.\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`version lockstep OK: ${report.manifestCount} manifests agree on ${report.version}\n`);
    }
  } catch (error) {
    process.stderr.write(`version lockstep ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
