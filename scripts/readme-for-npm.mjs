#!/usr/bin/env node
// GitHub and npmjs show different READMEs. The repository keeps the GitHub pages at the root and the
// npm pages under docs/npm/. `apply` swaps the npm pages in for packing, `restore` puts the GitHub
// pages back byte for byte, and `check` guards what the npm pages may contain.
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BACKUP = join(ROOT, '.readme-for-npm');
const MAX_NPM_README_BYTES = 24 * 1024;
const PAGES = [
  { target: 'README.md', source: 'docs/npm/README.md', guide: (repo) => `${repo}#readme` },
  { target: 'README_ko-KR.md', source: 'docs/npm/README_ko-KR.md', guide: (repo) => `${repo}/blob/main/README_ko-KR.md` },
];

const read = (path) => readFileSync(join(ROOT, path));
const sameBytes = (left, right) => Buffer.compare(left, right) === 0;
const slug = (heading) => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/gu, '-');

function packageInfo() {
  const pkg = JSON.parse(read('package.json'));
  const repo = String(pkg.repository?.url ?? pkg.repository ?? '').replace(/^git\+/u, '').replace(/\.git$/u, '');
  return { name: pkg.name, version: pkg.version, files: pkg.files ?? [], repo };
}

function githubPage(target) {
  const saved = join(BACKUP, target);
  return existsSync(saved) ? readFileSync(saved) : read(target);
}

export function check() {
  const { name, version, files, repo } = packageInfo();
  const base = `https://cdn.jsdelivr.net/npm/${name}@${version}/`;
  const shipped = (path) => files.some((entry) => !entry.startsWith('!') && (path === entry || path.startsWith(`${entry.replace(/\/$/u, '')}/`)));
  const pin = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\/]/gu, '\\$&')}@(\\d+\\.\\d+\\.\\d+)`, 'gu');
  const problems = [];
  for (const page of PAGES) {
    if (!existsSync(join(ROOT, page.source))) {
      problems.push(`${page.source}: missing`);
      continue;
    }
    const bytes = read(page.source);
    const text = bytes.toString('utf8');
    const anchors = new Set([...text.matchAll(/^#{1,6} (.+)$/gmu)].map((match) => slug(match[1])));
    const targets = [
      ...[...text.matchAll(/(?:src|srcset|href)="([^"]+)"/gu)].map((match) => match[1]),
      ...[...text.matchAll(/\]\(([^)\s]+)\)/gu)].map((match) => match[1]),
    ];
    for (const target of targets) {
      if (target.startsWith('#')) {
        if (!anchors.has(decodeURIComponent(target.slice(1)))) problems.push(`${page.source}: no heading for ${target}`);
      } else if (target.startsWith('https://cdn.jsdelivr.net/npm/')) {
        if (!target.startsWith(base)) {
          problems.push(`${page.source}: CDN URL is not pinned to ${name}@${version}: ${target}`);
          continue;
        }
        const path = decodeURIComponent(new URL(target).pathname.slice(new URL(base).pathname.length));
        if (!existsSync(join(ROOT, path))) problems.push(`${page.source}: ${path} does not exist`);
        else if (!shipped(path)) problems.push(`${page.source}: ${path} is not in package files[]`);
      } else if (!/^https?:\/\//u.test(target)) {
        problems.push(`${page.source}: relative target ${target} breaks on npmjs`);
      }
    }
    for (const match of text.matchAll(pin)) {
      if (match[1] !== version) problems.push(`${page.source}: stale pin ${match[0]}`);
    }
    if (!text.includes(page.guide(repo))) problems.push(`${page.source}: missing the full-guide link ${page.guide(repo)}`);
    if (bytes.length > MAX_NPM_README_BYTES) problems.push(`${page.source}: ${bytes.length} bytes exceeds ${MAX_NPM_README_BYTES}`);
    if (bytes.length >= githubPage(page.target).length) problems.push(`${page.source}: not shorter than the GitHub ${page.target}`);
  }
  return problems;
}

function apply() {
  if (existsSync(BACKUP)) {
    if (PAGES.every((page) => sameBytes(read(page.target), read(page.source)))) {
      process.stderr.write('readme-for-npm: npm READMEs already applied\n');
      return 0;
    }
    process.stderr.write('readme-for-npm: a backup exists but README.md is not the npm page; run restore first\n');
    return 1;
  }
  const problems = check();
  if (problems.length > 0) {
    process.stderr.write(`readme-for-npm: refusing to apply:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n`);
    return 1;
  }
  mkdirSync(BACKUP);
  for (const page of PAGES) copyFileSync(join(ROOT, page.target), join(BACKUP, page.target));
  for (const page of PAGES) copyFileSync(join(ROOT, page.source), join(ROOT, page.target));
  process.stderr.write('readme-for-npm: npm READMEs applied; run restore after packing\n');
  return 0;
}

function restore() {
  if (!existsSync(BACKUP)) {
    process.stderr.write('readme-for-npm: nothing to restore\n');
    return 0;
  }
  for (const page of PAGES) {
    const saved = join(BACKUP, page.target);
    if (!existsSync(saved) || !statSync(saved).isFile()) {
      process.stderr.write(`readme-for-npm: backup of ${page.target} is missing; nothing was changed\n`);
      return 1;
    }
  }
  for (const page of PAGES) copyFileSync(join(BACKUP, page.target), join(ROOT, page.target));
  rmSync(BACKUP, { recursive: true, force: true });
  process.stderr.write('readme-for-npm: GitHub READMEs restored\n');
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const command = process.argv[2];
  if (process.argv.length !== 3 || !['apply', 'restore', 'check'].includes(command)) {
    process.stderr.write('Usage: node scripts/readme-for-npm.mjs apply|restore|check\n');
    process.exitCode = 2;
  } else if (command === 'check') {
    const problems = check();
    if (problems.length > 0) process.stderr.write(`readme-for-npm check FAILED:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n`);
    else process.stderr.write('readme-for-npm check OK\n');
    process.exitCode = problems.length > 0 ? 1 : 0;
  } else {
    process.exitCode = command === 'apply' ? apply() : restore();
  }
}
