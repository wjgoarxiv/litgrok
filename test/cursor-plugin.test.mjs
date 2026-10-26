import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

// Cursor and Grok Bot read a plugin from `.cursor-plugin/` in the GitHub repository. Grok Bot
// surfaces only skills and MCP servers from that manifest, so LitGrok declares its skills and
// nothing else: its hooks need GROK_PLUGIN_ROOT, which neither host sets, and its rule and
// agents use Grok Build formats.
const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CURSOR_DIRECTORY = join(PRODUCT_ROOT, '.cursor-plugin');
const PLUGIN_PATH = join(CURSOR_DIRECTORY, 'plugin.json');
const MARKETPLACE_PATH = join(CURSOR_DIRECTORY, 'marketplace.json');
const PACKAGE = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));
const PLUGIN_NAME = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const ALLOWED_PLUGIN_KEYS = new Set([
  'name', 'displayName', 'description', 'version', 'author', 'homepage', 'repository',
  'license', 'keywords', 'logo', 'skills',
]);

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertRelativeInside(path, label) {
  assert.equal(typeof path, 'string', `${label} must be a path string`);
  assert.equal(isAbsolute(path), false, `${label} must be relative`);
  assert.equal(path.split('/').includes('..'), false, `${label} must not climb out of the repository`);
}

function frontmatterFields(source, label) {
  const block = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/u);
  assert.ok(block, `${label} must start with YAML frontmatter`);
  const fields = new Map();
  for (const line of block[1].split('\n')) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/u);
    if (match) fields.set(match[1], match[2].replace(/^(['"])(.*)\1$/u, '$2'));
  }
  return fields;
}

test('the Cursor plugin manifest names LitGrok and stays in lockstep with package.json', () => {
  assert.equal(existsSync(PLUGIN_PATH), true, '.cursor-plugin/plugin.json must exist');
  const manifest = readJson(PLUGIN_PATH);
  for (const key of Object.keys(manifest)) {
    assert.ok(ALLOWED_PLUGIN_KEYS.has(key), `unexpected Cursor manifest key ${key}`);
  }
  assert.equal(manifest.name, 'litgrok');
  assert.match(manifest.name, PLUGIN_NAME);
  assert.equal(manifest.version, PACKAGE.version, 'the Cursor manifest must report the package release');
  assert.equal(typeof manifest.description, 'string');
  assert.ok(manifest.description.trim().length > 0, 'the Cursor manifest needs a description');
  assert.deepEqual(manifest.author, { name: 'LitGrok contributors' });
  assert.equal(manifest.homepage, 'https://github.com/wjgoarxiv/litgrok');
  assert.equal(manifest.repository, 'https://github.com/wjgoarxiv/litgrok');
  assert.equal(manifest.license, 'MIT');
  assertRelativeInside(manifest.logo, 'logo');
  assert.equal(statSync(join(PRODUCT_ROOT, manifest.logo)).isFile(), true, 'the logo must be a committed file');
  // The marketplace submission asks for a square PNG on a background plate, so the logo carries no alpha.
  const png = readFileSync(join(PRODUCT_ROOT, manifest.logo));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'the logo must be a PNG');
  assert.equal(png.subarray(12, 16).toString('latin1'), 'IHDR');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.equal(width, height, 'the logo must be square');
  assert.ok(width >= 512, 'the logo must be at least 512 pixels wide');
  assert.equal(png[25], 2, 'the logo must be opaque RGB on its plate (PNG colour type 2)');
});

test('the Cursor manifest ships skills only', () => {
  const manifest = readJson(PLUGIN_PATH);
  assert.equal(manifest.skills, './.grok/skills');
  for (const key of ['rules', 'hooks', 'agents', 'commands', 'mcpServers', 'variables']) {
    assert.equal(Object.hasOwn(manifest, key), false, `${key} is not part of the Cursor manifest`);
  }
  assert.equal(existsSync(join(CURSOR_DIRECTORY, 'hooks.json')), false, 'no Cursor hook file is shipped');
});

test('every skill under the Cursor skills path passes Cursor\'s name and description rules', () => {
  const manifest = readJson(PLUGIN_PATH);
  assertRelativeInside(manifest.skills, 'skills');
  const skillsRoot = join(PRODUCT_ROOT, manifest.skills);
  const directories = readdirSync(skillsRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const grokCatalog = readJson(join(PRODUCT_ROOT, '.grok-plugin', 'plugin.json')).skills;
  assert.equal(directories.length, grokCatalog.length, 'Cursor must see the same skills as the Grok catalog');
  assert.equal(directories.length, 42);
  for (const directory of directories) {
    const skillFile = join(skillsRoot, directory.name, 'SKILL.md');
    const label = posix.join(manifest.skills, directory.name, 'SKILL.md');
    assert.equal(existsSync(skillFile), true, `${label} must exist`);
    const fields = frontmatterFields(readFileSync(skillFile, 'utf8'), label);
    const name = fields.get('name') ?? '';
    const description = fields.get('description') ?? '';
    assert.equal(name, directory.name, `${label} name must match its folder`);
    assert.match(name, SKILL_NAME, `${label} name must be lowercase letters, numbers and single hyphens`);
    assert.ok(name.length <= 64, `${label} name must be at most 64 characters`);
    assert.doesNotMatch(description, /^[|>]/u, `${label} description must be a plain scalar so this check reads its text`);
    assert.ok(description.trim().length > 0, `${label} needs a description`);
    assert.ok(description.length <= 1024, `${label} description must be at most 1024 characters`);
  }
});

// cursor.directory's repository scan ignores the manifest's `skills` path. It looks for `skills/*/SKILL.md`
// at the root and in each folder that holds a `.cursor-plugin/plugin.json`, so `.grok/` carries a marker
// manifest. The root manifest stays the one that names the release.
test('the .grok marker manifest points the directory scan at the same skills', () => {
  const markerPath = join(PRODUCT_ROOT, '.grok', '.cursor-plugin', 'plugin.json');
  assert.equal(existsSync(markerPath), true, '.grok/.cursor-plugin/plugin.json must exist');
  const marker = readJson(markerPath);
  const root = readJson(PLUGIN_PATH);
  for (const key of Object.keys(marker)) {
    assert.ok(ALLOWED_PLUGIN_KEYS.has(key), `unexpected marker manifest key ${key}`);
  }
  assert.equal(marker.name, root.name);
  assert.equal(marker.description, root.description);
  assert.equal(Object.hasOwn(marker, 'version'), false, 'only the root manifest pins the release');
  assert.equal(marker.skills, './skills');
  assert.equal(join(PRODUCT_ROOT, '.grok', marker.skills), join(PRODUCT_ROOT, root.skills));
  for (const key of ['rules', 'hooks', 'agents', 'commands', 'mcpServers', 'variables']) {
    assert.equal(Object.hasOwn(marker, key), false, `${key} is not part of the marker manifest`);
  }
  assert.equal(PACKAGE.files.some((entry) => entry === '.grok' || entry.startsWith('.grok/.cursor-plugin')), false, 'the marker stays out of the npm package');
});

test('the Cursor marketplace lists LitGrok from the repository root', () => {
  assert.equal(existsSync(MARKETPLACE_PATH), true, '.cursor-plugin/marketplace.json must exist');
  const marketplace = readJson(MARKETPLACE_PATH);
  assert.match(marketplace.name, PLUGIN_NAME);
  assert.deepEqual(marketplace.owner, { name: 'LitGrok contributors' });
  assert.equal(Object.hasOwn(marketplace, 'metadata'), false, 'the plugin manifest owns the version and description');
  assert.equal(marketplace.plugins.length, 1);
  const [entry] = marketplace.plugins;
  assert.equal(entry.name, readJson(PLUGIN_PATH).name);
  assert.equal(entry.source, './');
  assertRelativeInside(entry.source, 'marketplace source');
  assert.deepEqual(Object.keys(entry).sort(), ['description', 'name', 'source']);
});

test('both GitHub READMEs explain what loads in Grok Bot and Cursor and how to add it', () => {
  for (const [file, heading, route] of [
    ['README.md', '## Use LitGrok in Grok Bot and Cursor', /From GitHub Repository/u],
    ['README_ko-KR.md', '## Grok Bot과 Cursor에서 LitGrok 쓰기', /From GitHub Repository/u],
  ]) {
    const source = readFileSync(join(PRODUCT_ROOT, file), 'utf8');
    const start = source.indexOf(`${heading}\n`);
    assert.notEqual(start, -1, `${file} needs the section ${heading}`);
    const section = source.slice(start, source.indexOf('\n## ', start + heading.length));
    assert.match(section, /\.cursor-plugin\/plugin\.json/u, `${file} names the manifest`);
    assert.match(section, /Connect apps/u, `${file} names the Grok Bot entry point`);
    assert.match(section, route, `${file} names the Cursor import route`);
    assert.match(section, /hook|훅/iu, `${file} says the hooks stay in Grok Build`);
    assert.match(section, /\*\*Add Marketplace\*\*/u, `${file} names the Cursor control the user clicks`);
    assert.match(section, /press \*\*Add\*\*|\*\*Add\*\*를 누릅니다/u, `${file} says to press Add in Cursor`);
    assert.match(section, /restart Grok Bot|Grok Bot을 다시 시작/u, `${file} says a restart may be needed before Grok Bot lists LitGrok`);
  }
});

test('the litgrok skill tells a Grok Bot or Cursor reader what runs there', () => {
  // Grok Bot reads this SKILL.md text and follows it, so stale release or listing claims reach users.
  const source = readFileSync(join(PRODUCT_ROOT, '.grok', 'skills', 'litgrok', 'SKILL.md'), 'utf8');
  assert.doesNotMatch(source, /unpublished candidate|not verified public availability/iu, 'the scoped npm package is published');
  assert.match(source, /`@litfamily\/litgrok` is published on npm/u);
  assert.doesNotMatch(source, /ships no marketplace listing/iu, 'the repository carries a Cursor marketplace manifest');
  assert.match(source, /`\.cursor-plugin\/`/u, 'the skill names the Cursor manifest');
  const heading = '## When you are reading this inside Grok Bot or Cursor';
  const start = source.indexOf(`${heading}\n`);
  assert.notEqual(start, -1, `the skill needs the section ${heading}`);
  const end = source.indexOf('\n## ', start + heading.length);
  const section = source.slice(start, end === -1 ? undefined : end);
  for (const [pattern, why] of [
    [/only the skills/iu, 'only skills load there'],
    [/hooks/iu, 'hooks do not run'],
    [/installer/iu, 'the installer does not run'],
    [/status row/iu, 'the status row does not render'],
    [/rule/iu, 'the Grok Build rule does not load'],
    [/worktree/iu, 'worktree-specific steps need a host equivalent'],
    [/LSP/u, 'LSP code-intel steps need a host equivalent'],
    [/trust/iu, 'trust prompts do not exist there'],
    [/nearest equivalent/iu, 'map Grok Build tools to the host'],
    [/unavailable/iu, 'or say the step is unavailable'],
    [/Grok Bot shows only the plugin's skills/u, 'Grok Bot loads skills only'],
    [/`~\/\.grok\/agents`/u, 'Cursor\'s third-party route also lists the user agents'],
  ]) assert.match(section, pattern, why);
  assert.doesNotMatch(section, /Either way, only the skills load/u, 'Cursor\'s third-party route also reads agents');
  assert.doesNotMatch(section, /`\.grok\/agents\/` definitions[^\n]*are not loaded/u, 'agents load in Cursor on the third-party route');
});

test('both reference manuals describe the Cursor manifest instead of claiming no listing', () => {
  for (const file of ['docs/reference.md', 'docs/reference_ko-KR.md']) {
    const source = readFileSync(join(PRODUCT_ROOT, file), 'utf8');
    assert.doesNotMatch(source, /ships no marketplace listing|Marketplace listing[^\n]*제공하지 않습니다/u, `${file} still claims no listing`);
    assert.match(source, /`\.cursor-plugin\/`/u, `${file} names the Cursor manifest`);
    assert.match(source, /MCP server[^\n]*plugin-supplied LSP[^\n]*command catalog[^\n]*output style[^\n]*TUI\/skin/u, `${file} keeps the unshipped list`);
  }
});

// Grok Bot and Cursor pick a skill by its description and read its body as text, so discovery text stays
// host-neutral and each skill that leans on a Grok Build-only tool says what to do without it.
const GROK_SUBJECT_SKILLS = new Set(['litgrok', 'lsp', 'lsp-setup', 'rules']);
const HOST_NOTE_SKILLS = [
  'autoconference', 'autoresearch', 'browser-drive', 'comment-checker', 'debugging', 'deep-interview',
  'lit-brainstorm', 'lit-docx', 'lit-handoff', 'lit-pptx', 'lit-recap', 'lit-typographic-motion', 'litgoal', 'litresearch',
  'litwork', 'lsp-setup', 'lsp', 'refactor', 'rules', 'structural-search', 'wikify',
];

test('skill descriptions name Grok only where Grok Build is the subject', () => {
  const skillsRoot = join(PRODUCT_ROOT, '.grok', 'skills');
  for (const entry of readdirSync(skillsRoot, { withFileTypes: true }).filter((item) => item.isDirectory())) {
    if (GROK_SUBJECT_SKILLS.has(entry.name)) continue;
    const description = frontmatterFields(readFileSync(join(skillsRoot, entry.name, 'SKILL.md'), 'utf8'), entry.name).get('description') ?? '';
    assert.doesNotMatch(description, /\bGrok\b/u, `${entry.name} description should read well in Grok Bot and Cursor`);
  }
});

test('skills that need a Grok Build-only tool carry one short host note that points at litgrok', () => {
  // The motion SKILL.md has a 4096-byte activation budget, so its note sits in the runtime reference
  // that a missing runtime sends the reader to.
  const noteFile = (id) => (id === 'lit-typographic-motion' ? join('references', 'runtime.md') : 'SKILL.md');
  for (const id of HOST_NOTE_SKILLS) {
    const lines = readFileSync(join(PRODUCT_ROOT, '.grok', 'skills', id, noteFile(id)), 'utf8').split('\n');
    const notes = lines.filter((line) => line.startsWith('Outside Grok Build (Grok Bot, Cursor):'));
    assert.equal(notes.length, 1, `${id} needs exactly one host note`);
    assert.match(notes[0], /`litgrok` skill/u, `${id} host note points at the litgrok mapping`);
    assert.ok(notes[0].length <= 420, `${id} host note stays one short line`);
  }
});
