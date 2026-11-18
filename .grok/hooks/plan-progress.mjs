// Checkbox progress of the plan this session's start path named, or, for a record from before that,
// of the newest plan. The prompt, tool and stop hooks note it in the workflow snapshot for the status
// line, which never reads plan files itself.

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { IMPLEMENTATION_ROW, planLinesOutsideFences } from '../skills/lit-plan/scripts/scaffold-plan.mjs';
import { MAX_NEXT_CHARACTERS } from './workflow-stage.mjs';

const MAX_PLAN_BYTES = 256 * 1024;
const MAX_PLAN_ENTRIES = 500;

/**
 * Checkbox progress of `planPath` when the start path recorded one (a finished plan reads finished even
 * when a newer plan is open), otherwise of the newest plan in `<workspace>/plans/` with column-zero task rows:
 * { done, total, next }, or null, where `next` is the first unchecked row without its checkbox
 * (`4. README demo GIF`) and is left out once every row is checked. Symlinks, oversized files and
 * fenced rows are skipped.
 */
export function planProgress(workspaceRoot, planPath = undefined) {
  if (typeof planPath === 'string') return progressOf(join(workspaceRoot, planPath));
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
    const progress = progressOf(path);
    if (progress !== null) return progress;
  }
  return null;
}

/** Progress of one plan file, or null when it is missing, a link, oversized or has no task rows. */
function progressOf(path) {
  try {
    const status = lstatSync(path);
    if (!status.isFile() || status.size > MAX_PLAN_BYTES) return null;
  } catch {
    return null;
  }
  const rows = planLinesOutsideFences(readFileSync(path, 'utf8')).filter(({ line }) => IMPLEMENTATION_ROW.test(line));
  if (rows.length === 0) return null;
  const progress = { done: rows.filter(({ line }) => /^- \[[xX]\]/u.test(line)).length, total: rows.length };
  const next = rows.find(({ line }) => line.startsWith('- [ ] '));
  if (next) {
    const title = next.line.slice(6).replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').replace(/\s+/gu, ' ').trim();
    progress.next = [...title].length > MAX_NEXT_CHARACTERS ? `${[...title].slice(0, MAX_NEXT_CHARACTERS - 1).join('')}…` : title;
  }
  return progress;
}
