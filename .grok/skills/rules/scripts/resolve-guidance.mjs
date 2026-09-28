#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const GUIDANCE_NAMES = ['AGENTS.md', 'Agents.md', 'AGENT.md', 'CLAUDE.md', 'Claude.md', 'CLAUDE.local.md'];
const ALLOWED_CONFIG_SECTIONS = new Set(['mcp_servers', 'plugins', 'permission']);

function fail(code, message) {
  process.stderr.write(`FAIL ${code}: ${message}\n`);
  process.exit(1);
}

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

function isDirectory(path) {
  return existsSync(path) && statSync(path).isDirectory();
}

function repositoryRoot(cwd) {
  let current = cwd;
  while (true) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

function pathChain(root, cwd) {
  if (root === cwd) return [root];
  const suffix = relative(root, cwd).split(sep).filter(Boolean);
  const paths = [root];
  for (const part of suffix) paths.push(join(paths.at(-1), part));
  return paths;
}

function escapeRegex(character) {
  return /[|\\{}()[\]^$+?.]/.test(character) ? `\\${character}` : character;
}

function globRegex(pattern, source) {
  if (pattern.startsWith('!') || /[\\[]/.test(pattern)) {
    fail('UNSUPPORTED_GITIGNORE_PATTERN', `${source} ${pattern}`);
  }

  const directoryOnly = pattern.endsWith('/');
  const leadingSlash = pattern.startsWith('/');
  let value = pattern.replace(/^\//, '').replace(/\/$/, '');
  let body = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '*' && value[index + 1] === '*' && value[index + 2] === '/') {
      body += '(?:.*/)?';
      index += 2;
    } else if (character === '*' && value[index + 1] === '*') {
      body += '.*';
      index += 1;
    } else if (character === '*') {
      body += '[^/]*';
    } else if (character === '?') {
      body += '[^/]';
    } else {
      body += escapeRegex(character);
    }
  }

  const anchored = leadingSlash || value.includes('/');
  const prefix = anchored ? '^' : '(?:^|/)';
  const suffix = directoryOnly || !value.includes('.') ? '(?:$|/)' : '$';
  return new RegExp(`${prefix}${body}${suffix}`);
}

function isIgnored(path, root) {
  const directories = pathChain(root, dirname(path));
  let ignored = false;
  for (const directory of directories) {
    const ignoreFile = join(directory, '.gitignore');
    if (!isFile(ignoreFile)) continue;
    const candidate = relative(directory, path).split(sep).join('/');
    for (const rawLine of readFileSync(ignoreFile, 'utf8').split(/\r?\n/)) {
      const pattern = rawLine.trim();
      if (!pattern || pattern.startsWith('#')) continue;
      if (globRegex(pattern, relative(root, ignoreFile)).test(candidate)) ignored = true;
    }
  }
  return ignored;
}

function filesForScope(directory, root, useIgnoreRules, globalScope = false) {
  const files = [];
  const identities = new Set();
  function append(path) {
    const stats = statSync(path);
    const identity = `${stats.dev}:${stats.ino}`;
    if (!identities.has(identity)) files.push(path);
    identities.add(identity);
  }

  const directoryEntries = readdirSync(directory, { withFileTypes: true });
  for (const name of GUIDANCE_NAMES) {
    const entry = directoryEntries.find((candidate) => candidate.name === name && candidate.isFile());
    if (!entry) continue;
    const path = join(directory, entry.name);
    if (!useIgnoreRules || !isIgnored(path, root)) append(path);
  }

  const rules = globalScope ? join(directory, 'rules') : join(directory, '.grok', 'rules');
  if (isDirectory(rules)) {
    for (const entry of readdirSync(rules, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const path = join(rules, entry.name);
      if (!useIgnoreRules || !isIgnored(path, root)) append(path);
    }
  }
  return files;
}

function topLevelTomlKey(expression, source) {
  const value = expression.trim();
  const key = value.match(/^(?:"([^"\\]*)"|'([^']*)'|([A-Za-z0-9_-]+))/);
  if (!key) fail('CONFIG_KEY_INVALID', source);
  const remainder = value.slice(key[0].length).trim();
  if (remainder && !remainder.startsWith('.')) fail('CONFIG_KEY_INVALID', source);
  return key[1] ?? key[2] ?? key[3];
}

function configSections(path) {
  const sections = new Set();
  let insideTable = false;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed.startsWith('[')) {
      const arrayTable = trimmed.startsWith('[[');
      const match = trimmed.match(arrayTable ? /^\[\[(.*)\]\]\s*(?:#.*)?$/ : /^\[(.*)\]\s*(?:#.*)?$/);
      if (!match) fail('CONFIG_TABLE_INVALID', trimmed);
      sections.add(topLevelTomlKey(match[1], trimmed));
      insideTable = true;
      continue;
    }
    const assignment = trimmed.match(/^(.+?)\s*=/);
    if (!insideTable && assignment) sections.add(topLevelTomlKey(assignment[1], trimmed));
  }
  for (const section of sections) {
    if (!ALLOWED_CONFIG_SECTIONS.has(section)) fail('DISALLOWED_CONFIG_SECTION', section);
  }
  return [...sections].sort();
}

const input = process.argv[2];
if (!input || process.argv.length !== 3) fail('USAGE', 'resolve-guidance.mjs <cwd>');

const requestedCwd = resolve(input);
if (!isDirectory(requestedCwd)) fail('CWD_NOT_FOUND', requestedCwd);
const cwd = realpathSync(requestedCwd);
const root = repositoryRoot(cwd);
const guidance = [];
const configs = [];

const home = process.env.HOME;
if (home) {
  const globalRoot = join(home, '.grok');
  if (isDirectory(globalRoot)) {
    for (const path of filesForScope(globalRoot, root, false, true)) guidance.push({ scope: 'global', path });
  }
}

for (const [depth, directory] of pathChain(root, cwd).entries()) {
  for (const path of filesForScope(directory, root, true)) guidance.push({ scope: `project:${depth}`, path });
  const config = join(directory, '.grok', 'config.toml');
  if (isFile(config)) configs.push({ path: config, sections: configSections(config) });
}

process.stdout.write('ORDER scope=global,root-to-cwd within-scope=deterministic-presentation-only\n');
for (const item of guidance) process.stdout.write(`GUIDANCE ${item.scope} ${item.path}\n`);
for (const item of configs) process.stdout.write(`CONFIG_SECTIONS ${item.path} ${item.sections.join(',')}\n`);
process.stdout.write(`PASS guidance=${guidance.length} configs=${configs.length}\n`);
