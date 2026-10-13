// Checkbox progress of the newest plan. The prompt, tool and stop hooks note it in the workflow
// snapshot for the status line, which never reads plan files itself.

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { IMPLEMENTATION_ROW, planLinesOutsideFences } from '../skills/lit-plan/scripts/scaffold-plan.mjs';

const MAX_PLAN_BYTES = 256 * 1024;
const MAX_PLAN_ENTRIES = 500;

/**
 * Checkbox progress of the newest plan in `<workspace>/plans/` that has column-zero task rows:
 * { done, total }, or null. Symlinks, oversized files and fenced rows are skipped.
 */
export function planProgress(workspaceRoot) {
  const directory = join(workspaceRoot, 'plans');
  try {
    if (!lstatSync(directory).isDirectory()) return null;
  } catch {
    return null;
  }
  const candidates = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).slice(0, MAX_PLAN_ENTRIES)) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const status = lstatSync(join(directory, entry.name));
    if (status.isFile() && status.size <= MAX_PLAN_BYTES) candidates.push({ path: join(directory, entry.name), mtimeMs: status.mtimeMs });
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
  for (const { path } of candidates) {
    const rows = planLinesOutsideFences(readFileSync(path, 'utf8')).filter(({ line }) => IMPLEMENTATION_ROW.test(line));
    if (rows.length === 0) continue;
    return { done: rows.filter(({ line }) => /^- \[[xX]\]/u.test(line)).length, total: rows.length };
  }
  return null;
}
