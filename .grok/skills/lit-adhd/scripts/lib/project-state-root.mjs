// The project's state root: the outermost Git root above the start directory, else the start
// directory itself. Grok Build keeps project-local state under `.grok/` (skills, rules, hooks,
// the `litgrok` state folder), so the outer root is where a nested worktree's state belongs too.

import { closeSync, constants, existsSync, lstatSync, openSync, writeSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const outermostGitRoot = (startDir) => {
  let root = null;
  let current = startDir;
  for (;;) {
    if (existsSync(join(current, ".git"))) root = current;
    const parent = dirname(current);
    if (parent === current) return root;
    current = parent;
  }
};

export const resolveProjectStateRoot = (startDir = process.cwd()) => {
  const start = resolve(startDir);
  return outermostGitRoot(start) ?? start;
};

export const PROJECT_STATE_DIR = join(".grok", "litgrok");
const STATE_GITIGNORE = "# Created by LitGrok: local session state, not for commits.\n*\n";

// Git skips the state folder through a `.gitignore` inside `.grok/litgrok`, so the user's own
// .gitignore and .git/info/exclude stay untouched, and the committed skills, rules and hooks
// under `.grok/` are never ignored by it. Call it with any path inside the project's state
// folder after creating that path. It never replaces an existing file, never writes through a
// symlinked folder, and a failure leaves state writes alone.
export const ensureStateDirIgnored = (pathInsideState) => {
  let stateDir = resolve(pathInsideState);
  while (!(basename(stateDir) === "litgrok" && basename(dirname(stateDir)) === ".grok")) {
    const parent = dirname(stateDir);
    if (parent === stateDir) return false;
    stateDir = parent;
  }
  let fd;
  try {
    const stats = lstatSync(stateDir);
    if (stats.isSymbolicLink() || !stats.isDirectory()) return false;
    fd = openSync(
      join(stateDir, ".gitignore"),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
      0o644,
    );
    writeSync(fd, STATE_GITIGNORE);
    return true;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};
