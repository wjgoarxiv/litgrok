// scope-roots.mjs — name the folders outside the project that a plan's todos reach without a
// `Scope roots: <path> (<actions>)` line, so start-work never has to stop and ask for them.
//
// Node built-ins only and read-only. `scaffold-plan.mjs --check` and the Stop plan gate both call
// it on the lines `planLinesOutsideFences` returns, so a path inside a fenced block never counts.
// A command quoted in an inline code span (it holds whitespace) is data too; a span that is one
// path still counts.

import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const SCOPE_LINE = /^Scope roots?:[ \t]*(\S+)[ \t]*\(([a-z, -]+)\)[ \t]*$/u;
const ABSOLUTE_PATH = /(?<![\w.~/-])\/[\w.@+%,=~-]+(?:\/[\w.@+%,=~-]+)+\/?/gu;

function realOrSelf(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function isInside(root, path) {
  const rest = relative(root, path);
  return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest));
}

function existingFolder(path) {
  let at = path;
  for (;;) {
    try {
      if (statSync(at).isDirectory()) return at;
    } catch {
      // Not created yet; try the parent.
    }
    if (dirname(at) === at) return at;
    at = dirname(at);
  }
}

function pathsOnLine(line) {
  const unquoted = line.replace(/`([^`]*)`/gu, (_, span) => (/\s/u.test(span.trim()) ? ' ' : ` ${span.trim()} `));
  return (unquoted.match(ABSOLUTE_PATH) ?? []).map((path) => path.replace(/[.,:;)]+$/u, ''));
}

/**
 * `visibleLines` is the `{ line }` list from `planLinesOutsideFences`. Returns one entry per
 * uncovered folder named under `## Todos`: `{ path, line }` with the `Scope roots:` line to paste,
 * or `{ path, problem }` when the nearest existing folder is too broad to grant.
 */
export function uncoveredScopePaths(visibleLines, projectRoot) {
  const project = realOrSelf(resolve(projectRoot));
  const granted = visibleLines
    .map(({ line }) => SCOPE_LINE.exec(line.trim()))
    .filter(Boolean)
    .map(([, path]) => realOrSelf(resolve(project, path)));
  const found = new Map();
  let inTodos = false;
  for (const { line } of visibleLines) {
    const heading = line.trimEnd();
    if (heading === '## Todos') inTodos = true;
    else if (/^## /u.test(heading)) inTodos = false;
    if (!inTodos || SCOPE_LINE.test(line.trim())) continue;
    for (const path of pathsOnLine(line)) {
      const folder = realOrSelf(existingFolder(path));
      const candidates = [realOrSelf(path), folder];
      if (candidates.some((candidate) => isInside(project, candidate) || granted.some((root) => isInside(root, candidate)))) continue;
      if (found.has(folder)) continue;
      const tooBroad = dirname(dirname(folder)) === dirname(folder) || folder === realOrSelf(homedir());
      found.set(folder, tooBroad
        ? { path, problem: `${path} is outside the project; add a Scope roots line for a narrower existing folder` }
        : { path, line: `Scope roots: ${folder} (read)` });
    }
  }
  return [...found.values()];
}

export function describeScopePath(entry) {
  return entry.line
    ? `${entry.path} is outside the project and no Scope roots line covers it; add: ${entry.line}`
    : entry.problem;
}
