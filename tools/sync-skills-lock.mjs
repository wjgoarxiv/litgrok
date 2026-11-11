#!/usr/bin/env node
// Writes skills.lock.json at the product root.
//
// Generated on every run: `skills` (per .grok/skills/<id>: SKILL.md bytes and
// sha256, file count, total bytes, and one digest over every file) and `pack`
// (the sorted `npm pack --dry-run --json --ignore-scripts` file list).
// Hand-owned and kept as written: `budgets`. A budget is seeded only for an id
// named with --accept-new and removed only for an id named with --drop. While
// any skill sits outside its budget, has no budget, or a budget names a skill
// that is gone, or the pack would carry a file Git does not track, nothing is
// written and the exit code is 1.
//
// Only Git-tracked files are measured, so a stray local file never makes the
// lock stale. Outside a Git work tree (temporary test roots) the disk is walked.
// Raise a budget by hand when a skill grows on purpose; never lower one to pass.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import proc from '../.grok/skills/litgrok/scripts/proc.cjs';

export const PRODUCT_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const LOCK_FILE = 'skills.lock.json';
const SKILLS = '.grok/skills';
const NOTE = 'Written by npm run sync:lock. Generated: skills, pack. Hand-owned and kept by every sync: budgets (seed with --accept-new <id>, remove with --drop <id>).';
const CEILING = 1.5;

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const segments = (path) => path.split('/').join('\0');
const bySegments = (left, right) => (segments(left) < segments(right) ? -1 : segments(left) > segments(right) ? 1 : 0);
const sortedObject = (object) => Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.split('\0').filter(Boolean) : null;
}

function diskFiles(directory, base = directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return diskFiles(path, base);
    return entry.isFile() ? [relative(base, path).split('\\').join('/')] : [];
  });
}

/** Skill files that ship, relative to .grok/skills: Git-tracked and still on disk. */
export function skillFiles(root = PRODUCT_ROOT) {
  const tracked = git(root, ['ls-files', '-z', '--', SKILLS]);
  if (tracked === null) return diskFiles(join(root, SKILLS)).sort(bySegments);
  return tracked
    .filter((path) => existsSync(join(root, path)))
    .map((path) => path.slice(SKILLS.length + 1))
    .sort(bySegments);
}

/** Per skill id: SKILL.md size and hash, file count, total bytes, and a digest over `<sha256> <bytes> <path>` rows. */
export function measureSkills(root = PRODUCT_ROOT, files = skillFiles(root)) {
  const grouped = new Map();
  for (const path of files) {
    const cut = path.indexOf('/');
    if (cut < 0) continue;
    const id = path.slice(0, cut);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(path.slice(cut + 1));
  }
  const skills = {};
  for (const [id, paths] of grouped) {
    if (!paths.includes('SKILL.md')) continue;
    let bytes = 0;
    let skillMd;
    const rows = paths.map((path) => {
      const content = readFileSync(join(root, SKILLS, id, path));
      bytes += content.length;
      if (path === 'SKILL.md') skillMd = { bytes: content.length, sha256: digest(content) };
      return `${digest(content)} ${content.length} ${path}\n`;
    });
    skills[id] = { skillMd, files: paths.length, bytes, sha256: digest(rows.join('')) };
  }
  return sortedObject(skills);
}

export function packedPaths(root = PRODUCT_ROOT) {
  const result = proc.runNpm(['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', timeout: 180000 });
  if (result.error || result.status !== 0) throw new Error(`SKILLS_LOCK_PACK_FAIL: ${result.stderr || result.error?.message || ''}`);
  return JSON.parse(result.stdout)[0].files.map((file) => file.path).sort();
}

/** Packed paths Git does not track; empty outside a Git work tree. */
export function untrackedPacked(root, pack) {
  const tracked = git(root, ['ls-files', '-z']);
  if (tracked === null) return [];
  const known = new Set(tracked);
  return pack.filter((path) => !known.has(path));
}

const roundUp = (value) => Math.ceil((value * CEILING) / 1000) * 1000;

/** A first budget: today's SKILL.md size (down to 100 B) and file count as floors, half again as ceilings. */
export function seedBudget(skill) {
  return {
    minSkillBytes: Math.floor(skill.skillMd.bytes / 100) * 100,
    maxSkillBytes: roundUp(skill.skillMd.bytes),
    minFiles: skill.files,
    maxFiles: Math.ceil(skill.files * CEILING),
    maxBytes: roundUp(skill.bytes),
  };
}

export function budgetViolations(skills, budgets) {
  const problems = [];
  for (const id of [...new Set([...Object.keys(skills), ...Object.keys(budgets)])].sort()) {
    const skill = skills[id];
    const budget = budgets[id];
    if (!budget) {
      problems.push(`${id}: new skill without a budget (npm run sync:lock -- --accept-new ${id})`);
      continue;
    }
    if (!skill) {
      problems.push(`${id}: budget for a skill that is gone (npm run sync:lock -- --drop ${id})`);
      continue;
    }
    const size = skill.skillMd.bytes;
    if (size < budget.minSkillBytes) problems.push(`${id}: SKILL.md ${size} B is below its floor ${budget.minSkillBytes} B`);
    if (size > budget.maxSkillBytes) problems.push(`${id}: SKILL.md ${size} B is above its ceiling ${budget.maxSkillBytes} B`);
    if (skill.files < budget.minFiles) problems.push(`${id}: ${skill.files} files is below its floor ${budget.minFiles}`);
    if (skill.files > budget.maxFiles) problems.push(`${id}: ${skill.files} files is above its ceiling ${budget.maxFiles}`);
    if (skill.bytes > budget.maxBytes) problems.push(`${id}: ${skill.bytes} B in all is above its ceiling ${budget.maxBytes} B`);
  }
  return problems;
}

/** The next lock. Budgets change only through acceptNew and drop, and each must name a real new or gone skill. */
export function composeLock({ skills, pack, previous = {}, acceptNew = [], drop = [] }) {
  const budgets = { ...(previous.budgets ?? {}) };
  for (const id of acceptNew) {
    if (!skills[id] || budgets[id]) throw new Error(`SKILLS_LOCK_USAGE: --accept-new ${id} names no new skill`);
  }
  for (const id of drop) {
    if (skills[id] || !budgets[id]) throw new Error(`SKILLS_LOCK_USAGE: --drop ${id} names no gone skill`);
  }
  for (const id of drop) delete budgets[id];
  for (const id of acceptNew) budgets[id] = seedBudget(skills[id]);
  return { note: NOTE, budgets: sortedObject(budgets), skills, pack: [...pack].sort() };
}

export const readLock = (path = join(PRODUCT_ROOT, LOCK_FILE)) => JSON.parse(readFileSync(path, 'utf8'));
export const serializeLock = (lock) => `${JSON.stringify(lock, null, 2)}\n`;

function parseArguments(argv) {
  const options = { root: PRODUCT_ROOT, lock: null, pack: true, acceptNew: [], drop: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--no-pack') {
      options.pack = false;
      continue;
    }
    const value = argv[index + 1];
    if (!['--root', '--lock', '--accept-new', '--drop'].includes(flag) || value === undefined || value.startsWith('--')) {
      throw new Error('SKILLS_LOCK_USAGE: sync-skills-lock.mjs [--accept-new <id>]... [--drop <id>]... [--root <dir>] [--lock <file>] [--no-pack]');
    }
    index += 1;
    if (flag === '--root') options.root = value;
    else if (flag === '--lock') options.lock = value;
    else if (flag === '--accept-new') options.acceptNew.push(value);
    else options.drop.push(value);
  }
  options.lock ??= join(options.root, LOCK_FILE);
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const options = parseArguments(process.argv.slice(2));
  const previous = existsSync(options.lock) ? readLock(options.lock) : {};
  const pack = options.pack ? packedPaths(options.root) : previous.pack ?? [];
  const lock = composeLock({ skills: measureSkills(options.root), pack, previous, acceptNew: options.acceptNew, drop: options.drop });
  const problems = [
    ...budgetViolations(lock.skills, lock.budgets),
    ...untrackedPacked(options.root, lock.pack).map((path) => `pack: ${path} would ship but Git does not track it`),
  ];
  if (problems.length > 0) {
    process.stdout.write(`SKILLS_LOCK_REFUSED: ${problems.length} problem(s); ${LOCK_FILE} not written\n${problems.join('\n')}\n`);
    process.exitCode = 1;
  } else {
    const text = serializeLock(lock);
    const unchanged = existsSync(options.lock) && readFileSync(options.lock, 'utf8') === text;
    if (!unchanged) writeFileSync(options.lock, text);
    for (const id of options.acceptNew) {
      const budget = lock.budgets[id];
      process.stdout.write(`seeded budget: ${id} SKILL.md ${budget.minSkillBytes}-${budget.maxSkillBytes} B, ${budget.minFiles}-${budget.maxFiles} files, ${budget.maxBytes} B in all\n`);
    }
    for (const id of options.drop) process.stdout.write(`dropped budget: ${id}\n`);
    process.stdout.write(`SKILLS_LOCK_PASS: ${unchanged ? 'already current' : 'written'} skills=${Object.keys(lock.skills).length} packed=${lock.pack.length}\n`);
  }
}
