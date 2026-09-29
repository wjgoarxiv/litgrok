import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);

function isFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile();
}

function isDirectory(directoryPath) {
  return existsSync(directoryPath) && statSync(directoryPath).isDirectory();
}

function skillFiles() {
  const skillsDirectory = join(PRODUCT_ROOT, '.grok', 'skills');
  if (!isDirectory(skillsDirectory)) return [];

  return readdirSync(skillsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(skillsDirectory, entry.name, 'SKILL.md'))
    .filter(isFile);
}

function ruleFiles() {
  const rulesDirectory = join(PRODUCT_ROOT, '.grok', 'rules');
  if (!isDirectory(rulesDirectory)) return [];

  return readdirSync(rulesDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === '.md')
    .map((entry) => join(rulesDirectory, entry.name));
}

function allDirectories(directoryPath) {
  if (!isDirectory(directoryPath)) return [];

  const directories = [];
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    // .git and .github are repository infrastructure, not Grok surfaces. GitHub
    // mandates the .github/workflows path, so CI cannot avoid the name 'workflows'.
    if (!entry.isDirectory() || entry.name === '.git' || entry.name === '.github') continue;
    const childPath = join(directoryPath, entry.name);
    directories.push(childPath, ...allDirectories(childPath));
  }
  return directories;
}

test('describes @litfamily/litgrok 1.0.11 without runtime dependencies', () => {
  const packagePath = join(PRODUCT_ROOT, 'package.json');
  assert.ok(isFile(packagePath), `missing ${relative(PRODUCT_ROOT, packagePath)}`);

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
  assert.equal(packageJson.name, '@litfamily/litgrok');
  assert.equal(packageJson.version, '1.0.11');

  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.deepEqual(packageJson[field] ?? {}, {}, `${field} must be empty`);
  }
  assert.deepEqual(packageJson.bundledDependencies ?? [], [], 'bundledDependencies must be empty');
});

test('provides at least one static skill document at .grok/skills/*/SKILL.md', () => {
  assert.ok(skillFiles().length > 0, 'expected at least one .grok/skills/*/SKILL.md file');
});

test('litgrok describes the whole-tree user install', () => {
  const content = readFileSync(join(PRODUCT_ROOT, '.grok', 'skills', 'litgrok', 'SKILL.md'), 'utf8');
  assert.match(content, /user install[^\n]*whole packaged tree[^\n]*skills, rules, and hooks/i);
});

test('litgoal and litwork do not claim unshipped runtimes', () => {
  const litgoal = readFileSync(join(PRODUCT_ROOT, '.grok', 'skills', 'litgoal', 'SKILL.md'), 'utf8');
  const litwork = readFileSync(join(PRODUCT_ROOT, '.grok', 'skills', 'litwork', 'SKILL.md'), 'utf8');
  const removedClaims = [
    { content: litgoal, phrase: 'package-owned durable goal record across Grok Build sessions', pattern: /package-owned durable goal record across Grok Build sessions/i },
    { content: litgoal, phrase: 'Create, inspect, update, or close one bounded durable goal through', pattern: /Create, inspect, update, or close one bounded durable goal through/i },
    { content: litwork, phrase: 'Drive a bounded goal across a Grok Build session with live progress and background-task control', pattern: /Drive a bounded goal across a Grok Build session with live progress and background-task control/i },
    { content: litwork, phrase: 'background tasks must remain coordinated in one Grok Build session', pattern: /background tasks must remain coordinated in one Grok Build session/i },
  ];
  for (const claim of removedClaims) {
    assert.doesNotMatch(claim.content, claim.pattern, `removed claim returned: ${claim.phrase}`);
  }
});

test('each static skill identifies itself and keeps unsupported surfaces blocked', () => {
  const files = skillFiles();
  assert.ok(files.length > 0, 'expected static skill files before checking their contracts');

  for (const filePath of files) {
    const skillName = basename(dirname(filePath));
    const content = readFileSync(filePath, 'utf8');
    const label = relative(PRODUCT_ROOT, filePath);

    assert.match(
      content,
      /^---\s*\n[\s\S]*^name:\s*[^\n]+\n[\s\S]*^description:\s*[^\n]+\n[\s\S]*^---\s*\n/m,
      `${label} must declare name and description frontmatter`,
    );

    assert.match(content, new RegExp(`\\b${skillName.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\b`, 'i'), `${label} must identify ${skillName}`);
    assert.match(content, /static documentation/i, `${label} must warn that it is documentation`);
    assert.match(content, /do not execute/i, `${label} must warn against execution`);
    assert.match(content, /Grok Build/, `${label} must use Grok Build terminology`);
    assert.match(
      content,
      /(?=[\s\S]*\bunsupported\b)(?=[\s\S]*\bundocumented\b)(?=[\s\S]*\bsurfaces?\b)(?=[\s\S]*\bremain(?:s)?\s+blocked\b)/i,
      `${label} must state that unsupported undocumented surfaces remain blocked`,
    );
  }
});

test('provides a root AGENTS.md file', () => {
  assert.ok(isFile(join(PRODUCT_ROOT, 'AGENTS.md')), 'missing root AGENTS.md');
});

test('records a valid public source commit without treating SOURCE_REV as a ref', () => {
  const readmePath = join(PRODUCT_ROOT, 'README.md');
  assert.ok(isFile(readmePath), 'missing README.md entry path');

  const readme = readFileSync(readmePath, 'utf8');
  const version = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8')).version;
  assert.ok(readme.includes('](./docs/reference.md)'), 'the GitHub README links the reference in the repository');
  const npmReadme = readFileSync(join(PRODUCT_ROOT, 'docs/npm/README.md'), 'utf8');
  assert.ok(npmReadme.includes(`https://cdn.jsdelivr.net/npm/@litfamily/litgrok@${version}/docs/reference.md`), 'the npm README links the packaged reference');
  const reference = readFileSync(join(PRODUCT_ROOT, 'docs/reference.md'), 'utf8');
  assert.match(reference, /github\.com\/xai-org\/grok-build\/tree\/[0-9a-f]{40}/i);
  assert.match(reference, /SOURCE_REV/);
  assert.match(reference, /not a public Git ref/i);
});

test('provides at least one .grok/rules/*.md file', () => {
  assert.ok(ruleFiles().length > 0, 'expected at least one .grok/rules/*.md file');
});

test('rules describe AGENTS-family and .grok/rules loading without invented schemas', () => {
  const files = ruleFiles();
  assert.ok(files.length > 0, 'expected rule files before checking their contracts');

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const label = relative(PRODUCT_ROOT, filePath);

    assert.match(content, /AGENTS(?:[- ]family|\.md)/i, `${label} must describe AGENTS-family guidance`);
    assert.match(content, /\.grok\/rules(?:\/\*\.md)?/i, `${label} must name .grok/rules loading`);
    assert.match(content, /\b(?:load|loaded|loading|discover|read|apply)\b/i, `${label} must describe loading`);
    assert.match(
      content,
      /\b(?:without\s+inventing|do\s+not\s+invent|don't\s+invent|without\s+assuming|do\s+not\s+assume|don't\s+assume)\b[\s\S]{0,100}\bschemas?\b/i,
      `${label} must not invent a schema`,
    );
  }
});

test('does not add undocumented surface directories', () => {
  const prohibitedDirectory = /^(?:plugins?|marketplaces?|mcp|lsp|tui|skin|tui-skin|acp|(?:custom-)?subagents?|workflow(?:s|-engine)?|install(?:er|ers)?|login|runtime-probes?)$/i;
  const prohibited = allDirectories(PRODUCT_ROOT)
    .filter((directoryPath) => !relative(PRODUCT_ROOT, directoryPath).startsWith(`${join('.grok', 'skills')}${sep}`))
    .filter((directoryPath) => prohibitedDirectory.test(basename(directoryPath)))
    .map((directoryPath) => relative(PRODUCT_ROOT, directoryPath));

  assert.deepEqual(prohibited, [], `prohibited v1 directories found: ${prohibited.join(', ')}`);
});
