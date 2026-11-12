import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';

// `litgrok extensions` wraps Grok Build's own plugin commands. Every test here runs against a fake `grok` and a fake
// `git` on a PATH that holds nothing else, inside a throwaway HOME, so no test can reach the real Grok Build, its
// plugin store or the network. The fake grok keeps the shapes Grok Build 1.0.13 showed in an isolated HOME:
// `plugin list --json` prints an array of {name, repo_key, path, source}, a second install of the same folder stops
// with `already installed`, and each `plugin uninstall <name>` removes one copy.
const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const IDS = ['lit-pptx', 'lit-docx', 'lit-scientific-visualization', 'lit-diagram-drawer', 'lit-schematic', 'frontend-ui-ux', 'visual-qa', 'readme-studio', 'lit-typographic-motion'];

const FAKE_GROK = `#!${process.execPath}
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const store = join(process.env.HOME, '.grok', 'installed-plugins');
const registryPath = join(store, 'registry.json');
const read = () => (existsSync(registryPath) ? JSON.parse(readFileSync(registryPath, 'utf8')) : { version: 1, repos: {} });
const save = (registry) => { mkdirSync(store, { recursive: true }); writeFileSync(registryPath, JSON.stringify(registry, null, 2)); };
const log = (line) => writeFileSync(join(process.env.HOME, 'grok-calls.log'), line + '\\n', { flag: 'a' });
const [group, verb, target] = process.argv.slice(2);
log(process.argv.slice(2).join(' '));
if (group !== 'plugin') process.exit(2);
const registry = read();
if (verb === 'list') {
  const rows = Object.entries(registry.repos).map(([key, repo]) => ({ status: 'installed', name: Object.keys(repo.plugins)[0], repo_key: key, version: '0.1.0', path: repo.path, source: repo.kind.source_path, marketplace: null }));
  process.stdout.write(JSON.stringify(rows, null, 2) + '\\n');
} else if (verb === 'install') {
  if (!existsSync(target) || !statSync(target).isDirectory()) { process.stderr.write('Error: install failed: local path is not a directory: ' + target + '\\n'); process.exit(1); }
  const name = JSON.parse(readFileSync(join(target, '.grok-plugin', 'plugin.json'), 'utf8')).name;
  const key = name + '-' + createHash('sha256').update(target).digest('hex').slice(0, 8);
  if (registry.repos[key]) { process.stderr.write("Error: repo '" + key + "' already installed\\n"); process.exit(1); }
  const path = join(store, key);
  cpSync(target, path, { recursive: true });
  const now = new Date().toISOString();
  registry.repos[key] = { kind: { type: 'Local', source_path: target }, installed_at: now, updated_at: now, path, plugins: { [name]: { version: '0.1.0' } } };
  save(registry);
  process.stdout.write('Installed 1 plugin(s) from ' + target + ': ' + name + '\\n');
} else if (verb === 'uninstall') {
  const entry = Object.entries(registry.repos).find(([, repo]) => Object.keys(repo.plugins)[0] === target);
  if (!entry) { process.stderr.write('Error: plugin not installed: ' + target + '\\n'); process.exit(1); }
  rmSync(entry[1].path, { recursive: true, force: true });
  delete registry.repos[entry[0]];
  save(registry);
  process.stdout.write('Uninstalled 1 plugin(s): ' + target + '\\n');
} else process.exit(2);
`;

// clone and pull copy the folder named by FAKE_SHELF; without it they fail the way git does offline.
const FAKE_GIT = `#!${process.execPath}
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
writeFileSync(join(process.env.HOME, 'git-calls.log'), args.join(' ') + '\\n', { flag: 'a' });
const offline = () => { process.stderr.write("fatal: unable to access 'https://github.com/wjgoarxiv/wjgoarxiv-skills/': Could not resolve host: github.com\\n"); process.exit(128); };
if (args[0] === 'clone') {
  if (!process.env.FAKE_SHELF) offline();
  const destination = args[args.length - 1];
  cpSync(process.env.FAKE_SHELF, destination, { recursive: true });
  mkdirSync(join(destination, '.git'), { recursive: true });
} else if (args[0] === '-C' && args[2] === 'sparse-checkout') {
  process.exit(0);
} else if (args[0] === '-C' && args[2] === 'pull') {
  if (!process.env.FAKE_SHELF) offline();
  cpSync(process.env.FAKE_SHELF, args[1], { recursive: true });
} else process.exit(2);
`;

function captureIo() {
  let stdout = '';
  let stderr = '';
  return {
    stdin: { isTTY: false },
    stdout: { isTTY: false, write(chunk) { stdout += String(chunk); return true; } },
    stderr: { isTTY: false, write(chunk) { stderr += String(chunk); return true; } },
    read() { return { stdout: stripVTControlCharacters(stdout), stderr: stripVTControlCharacters(stderr) }; },
  };
}

function writeShelf(root) {
  for (const id of IDS) {
    const folder = join(root, 'variants', 'litgrok', id);
    mkdirSync(join(folder, '.grok-plugin'), { recursive: true });
    writeFileSync(join(folder, '.grok-plugin', 'plugin.json'), `${JSON.stringify({ name: id, version: '0.1.0', skills: ['./'] })}\n`);
    writeFileSync(join(folder, 'SKILL.md'), `---\nname: ${id}\ndescription: "the full ${id} skill"\n---\n\n# ${id}\n`);
  }
  return root;
}

function sandbox(t, { tools = ['grok', 'git'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-ext-manager-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home');
  const project = join(root, 'project');
  const bin = join(root, 'bin');
  for (const folder of [home, project, bin]) mkdirSync(folder);
  if (tools.includes('grok')) writeFileSync(join(bin, 'grok'), FAKE_GROK, { mode: 0o755 });
  if (tools.includes('git')) writeFileSync(join(bin, 'git'), FAKE_GIT, { mode: 0o755 });
  const shelf = writeShelf(join(root, 'shelf'));
  const env = { HOME: home, PATH: bin, XDG_CACHE_HOME: join(root, 'cache') };
  return { root, home, project, shelf, env, backups: join(home, '.grok', 'extension-backups') };
}

async function ext(context, args, extraEnv = {}) {
  const io = captureIo();
  const code = await run(['extensions', ...args], { ...io, cwd: context.project, env: { ...context.env, ...extraEnv } });
  return { code, ...io.read() };
}

function plugins(context) {
  const path = join(context.home, '.grok', 'installed-plugins', 'registry.json');
  if (!existsSync(path)) return [];
  return Object.values(JSON.parse(readFileSync(path, 'utf8')).repos).map((repo) => ({ name: Object.keys(repo.plugins)[0], path: repo.path, source: repo.kind.source_path }));
}

const grokCalls = (context) => (existsSync(join(context.home, 'grok-calls.log')) ? readFileSync(join(context.home, 'grok-calls.log'), 'utf8') : '');

test('a fresh install previews first, then --yes runs grok plugin install from the shelf folder', async (t) => {
  const context = sandbox(t);
  const preview = await ext(context, ['install', 'visual-qa', '--from', context.shelf]);
  assert.equal(preview.code, 0, preview.stderr);
  assert.match(preview.stdout, /DRY RUN/u);
  const folder = join(context.shelf, 'variants', 'litgrok', 'visual-qa');
  assert.ok(preview.stdout.includes(`grok plugin install "${folder}" --trust`), preview.stdout);
  assert.match(preview.stdout, /--yes/u, 'the preview says how to run it');
  assert.deepEqual(plugins(context), [], 'a preview installs nothing');
  assert.doesNotMatch(grokCalls(context), /install/u, 'a preview never calls grok plugin install');

  const done = await ext(context, ['install', 'visual-qa', '--from', context.shelf, '--yes']);
  assert.equal(done.code, 0, done.stderr);
  assert.deepEqual(plugins(context).map(({ name, source }) => [name, source]), [['visual-qa', folder]]);
  assert.match(done.stdout, /visual-qa: installed/u);
  assert.match(done.stdout, /new Grok Build session/u, 'says how Grok Build picks it up');

  const again = await ext(context, ['install', 'visual-qa', '--from', context.shelf, '--yes']);
  assert.equal(again.code, 0, again.stderr);
  assert.match(again.stdout, /visual-qa: current/u);
  assert.equal(plugins(context).length, 1, 'a second install adds no second copy');
});

test('install over an existing copy from another clone backs it up and leaves one live copy', async (t) => {
  const context = sandbox(t);
  const old = writeShelf(join(context.root, 'old-clone'));
  writeFileSync(join(old, 'variants', 'litgrok', 'lit-pptx', 'my-notes.md'), 'kept\n');
  await ext(context, ['install', 'lit-pptx', '--from', old, '--yes']);
  const second = writeShelf(join(context.root, 'second-clone'));
  // A hand-run install from a second clone, the way each note's manual line allows, gives Grok Build a second copy.
  const { spawnSync } = await import('node:child_process');
  spawnSync(join(context.root, 'bin', 'grok'), ['plugin', 'install', join(second, 'variants', 'litgrok', 'lit-pptx'), '--trust'], { env: context.env });
  assert.equal(plugins(context).length, 2);

  const preview = await ext(context, ['install', 'lit-pptx', '--from', context.shelf]);
  assert.match(preview.stdout, /lit-pptx: would install: back up 2 copies/u, preview.stdout);
  const done = await ext(context, ['install', 'lit-pptx', '--from', context.shelf, '--yes']);
  assert.equal(done.code, 0, done.stderr);
  const live = plugins(context);
  assert.equal(live.length, 1, 'one live copy');
  assert.equal(live[0].source, join(context.shelf, 'variants', 'litgrok', 'lit-pptx'));
  const dated = readdirSync(context.backups);
  assert.equal(dated.length, 1, 'one dated backup folder');
  assert.match(dated[0], /^\d{8}-\d{6}-/u);
  const saved = readdirSync(join(context.backups, dated[0])).sort();
  assert.deepEqual(saved, ['lit-pptx', 'lit-pptx-2']);
  const kept = saved.map((name) => join(context.backups, dated[0], name, 'my-notes.md')).filter((path) => existsSync(path));
  assert.equal(kept.length, 1, 'the file inside the old copy survives in the backup');
  assert.equal(readFileSync(kept[0], 'utf8'), 'kept\n');
});

test('a competing personal copy stops the install and is named with its move line; --allow-shadow only warns', async (t) => {
  const context = sandbox(t);
  const personal = join(context.home, '.claude', 'skills', 'lit-docx');
  mkdirSync(personal, { recursive: true });
  writeFileSync(join(personal, 'SKILL.md'), '---\nname: lit-docx\ndescription: "my own docx skill"\n---\n');
  // LitGrok's own note never counts as competition.
  const note = join(context.project, '.grok', 'skills', 'lit-docx');
  mkdirSync(note, { recursive: true });
  writeFileSync(join(note, 'SKILL.md'), '---\nname: lit-docx\ndescription: "Moved: lit-docx makes documents"\n---\n');

  const stopped = await ext(context, ['install', 'lit-docx', '--from', context.shelf, '--yes']);
  assert.equal(stopped.code, 1);
  assert.ok(stopped.stderr.includes(personal), stopped.stderr);
  assert.ok(!stopped.stderr.includes(note), 'the LitGrok note is not reported');
  assert.ok(stopped.stderr.includes(`mv "${personal}"`), 'gives the move line for that folder');
  assert.match(stopped.stderr, /--allow-shadow/u);
  assert.deepEqual(plugins(context), [], 'nothing installed');
  assert.equal(existsSync(join(personal, 'SKILL.md')), true, 'the personal copy is never touched');

  const shadowed = await ext(context, ['install', 'lit-docx', '--from', context.shelf, '--yes', '--allow-shadow']);
  assert.equal(shadowed.code, 0, shadowed.stderr);
  assert.ok(shadowed.stderr.includes(personal), 'still warns');
  assert.equal(plugins(context).length, 1);
  assert.equal(existsSync(join(personal, 'SKILL.md')), true);

  const listed = await ext(context, ['list', '--json']);
  const row = JSON.parse(listed.stdout).extensions.find(({ id }) => id === 'lit-docx');
  assert.equal(row.status, 'installed');
  assert.deepEqual(row.competing.map(({ path }) => path), [personal]);
});

test('update reinstalls only what differs from the source and reports the rest as current', async (t) => {
  const context = sandbox(t);
  await ext(context, ['install', 'lit-pptx', 'lit-docx', '--from', context.shelf, '--yes']);
  writeFileSync(join(context.shelf, 'variants', 'litgrok', 'lit-pptx', 'SKILL.md'), '---\nname: lit-pptx\ndescription: "a newer lit-pptx"\n---\n');
  const preview = await ext(context, ['update', '--from', context.shelf]);
  assert.equal(preview.code, 0, preview.stderr);
  assert.match(preview.stdout, /lit-pptx: would update/u);
  assert.match(preview.stdout, /lit-docx: current/u);
  const done = await ext(context, ['update', '--from', context.shelf, '--yes']);
  assert.equal(done.code, 0, done.stderr);
  assert.match(done.stdout, /lit-pptx: updated/u);
  assert.match(done.stdout, /lit-docx: current/u);
  assert.doesNotMatch(done.stdout, /visual-qa/u, 'an extension that is not installed is left out');
  const pptx = plugins(context).find(({ name }) => name === 'lit-pptx');
  assert.match(readFileSync(join(pptx.path, 'SKILL.md'), 'utf8'), /a newer lit-pptx/u);
  assert.equal(plugins(context).length, 2);
  assert.equal(readdirSync(context.backups).length, 1, 'the replaced copy went to a backup');
});

test('remove backs up and uninstalls a shelf copy and refuses a plugin of the same name from elsewhere', async (t) => {
  const context = sandbox(t);
  await ext(context, ['install', 'readme-studio', '--from', context.shelf, '--yes']);
  const preview = await ext(context, ['remove', 'readme-studio']);
  assert.match(preview.stdout, /would back up/u);
  assert.equal(plugins(context).length, 1, 'a preview removes nothing');
  const removed = await ext(context, ['remove', 'readme-studio', '--yes']);
  assert.equal(removed.code, 0, removed.stderr);
  assert.deepEqual(plugins(context), []);
  const [dated] = readdirSync(context.backups);
  assert.equal(existsSync(join(context.backups, dated, 'readme-studio', 'SKILL.md')), true, 'nothing is deleted outright');

  const own = join(context.root, 'my-plugins', 'visual-qa');
  cpSync(join(context.shelf, 'variants', 'litgrok', 'visual-qa'), own, { recursive: true });
  const { spawnSync } = await import('node:child_process');
  spawnSync(join(context.root, 'bin', 'grok'), ['plugin', 'install', own, '--trust'], { env: context.env });
  const refused = await ext(context, ['remove', 'visual-qa', '--yes']);
  assert.equal(refused.code, 1);
  assert.ok(refused.stderr.includes(own), refused.stderr);
  assert.match(refused.stderr, /user-managed/u);
  assert.equal(plugins(context).length, 1, 'the user plugin stays');
});

test('prune-backups lists sizes, deletes only with --yes and only inside its own folder', async (t) => {
  const context = sandbox(t);
  const oldOne = join(context.backups, '20250101-000000-aaaaaa');
  const newOne = join(context.backups, '20261112-000000-bbbbbb');
  for (const folder of [oldOne, newOne]) {
    mkdirSync(join(folder, 'lit-pptx'), { recursive: true });
    writeFileSync(join(folder, 'lit-pptx', 'SKILL.md'), 'x'.repeat(2048));
  }
  const past = new Date('2025-01-01T00:00:00Z');
  utimesSync(oldOne, past, past);
  const outside = join(context.home, 'keep-me');
  mkdirSync(outside);

  const listed = await ext(context, ['prune-backups']);
  assert.equal(listed.code, 0, listed.stderr);
  assert.ok(listed.stdout.includes(oldOne) && listed.stdout.includes(newOne));
  assert.match(listed.stdout, /2\.0 KB/u);
  assert.match(listed.stdout, /DRY RUN/u);
  assert.equal(readdirSync(context.backups).length, 2, 'a dry run deletes nothing');

  const pruned = await ext(context, ['prune-backups', '--older-than', '30', '--yes']);
  assert.equal(pruned.code, 0, pruned.stderr);
  assert.equal(existsSync(oldOne), false, 'the old backup is gone');
  assert.equal(existsSync(newOne), true, 'a recent one stays');
  assert.equal(existsSync(outside), true, 'nothing outside the backups folder is touched');
  assert.equal(statSync(context.backups).isDirectory(), true);
});

test('without --from an offline or missing git stops before any change and names --from', async (t) => {
  const offline = sandbox(t);
  const result = await ext(offline, ['install', 'lit-pptx', '--yes']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Could not resolve host|could not fetch/u, result.stderr);
  assert.match(result.stderr, /--from/u);
  assert.deepEqual(plugins(offline), []);
  const cacheRoot = join(offline.env.XDG_CACHE_HOME, 'litgrok');
  assert.equal(existsSync(join(cacheRoot, 'extensions-src')), false, 'no half-fetched source is left as the cache');
  assert.deepEqual(existsSync(cacheRoot) ? readdirSync(cacheRoot) : [], [], 'the failed clone leaves no temporary folder');

  const noGit = sandbox(t, { tools: ['grok'] });
  const missing = await ext(noGit, ['install', 'lit-pptx', '--yes']);
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /git was not found/u);
  assert.match(missing.stderr, /--from/u);

  const noGrok = sandbox(t, { tools: ['git'] });
  const host = await ext(noGrok, ['install', 'lit-pptx', '--from', noGrok.shelf, '--yes']);
  assert.equal(host.code, 1);
  assert.match(host.stderr, /grok was not found/u);

  const badFrom = await ext(offline, ['install', 'lit-pptx', '--from', join(offline.root, 'nowhere'), '--yes']);
  assert.equal(badFrom.code, 1);
  assert.match(badFrom.stderr, /variants\/litgrok/u);
});

test('without --from the shelf is fetched once into the LitGrok cache, sparse, and update pulls it', async (t) => {
  const context = sandbox(t);
  const env = { FAKE_SHELF: context.shelf };
  const done = await ext(context, ['install', '--family', 'design', '--yes'], env);
  assert.equal(done.code, 0, done.stderr);
  const cache = join(context.env.XDG_CACHE_HOME, 'litgrok', 'extensions-src');
  assert.deepEqual(plugins(context).map(({ name }) => name).sort(), ['frontend-ui-ux', 'visual-qa']);
  assert.ok(plugins(context).every(({ source }) => source.startsWith(cache)), 'installed from the cache clone');
  const gitLog = readFileSync(join(context.home, 'git-calls.log'), 'utf8');
  assert.match(gitLog, /clone --depth 1 --filter=blob:none --sparse https:\/\/github\.com\/wjgoarxiv\/wjgoarxiv-skills/u);
  assert.match(gitLog, /sparse-checkout set variants\/litgrok/u);
  const updated = await ext(context, ['update', '--yes'], env);
  assert.equal(updated.code, 0, updated.stderr);
  assert.match(readFileSync(join(context.home, 'git-calls.log'), 'utf8'), /pull --ff-only/u);
});

test('check is read only, exits 1 with a fix line for each finding and 0 when clean', async (t) => {
  const context = sandbox(t);
  const clean = await ext(context, ['check']);
  assert.equal(clean.code, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, /clean/u);

  await ext(context, ['install', 'lit-schematic', '--from', context.shelf, '--yes']);
  const other = writeShelf(join(context.root, 'other'));
  const { spawnSync } = await import('node:child_process');
  spawnSync(join(context.root, 'bin', 'grok'), ['plugin', 'install', join(other, 'variants', 'litgrok', 'lit-schematic'), '--trust'], { env: context.env });
  rmSync(other, { recursive: true, force: true });
  const personal = join(context.project, '.agents', 'skills', 'visual-qa');
  mkdirSync(personal, { recursive: true });
  writeFileSync(join(personal, 'SKILL.md'), '---\nname: visual-qa\ndescription: "mine"\n---\n');
  mkdirSync(join(context.backups, '20261101-000000-cccccc', 'lit-pptx'), { recursive: true });
  writeFileSync(join(context.backups, '20261101-000000-cccccc', 'lit-pptx', 'SKILL.md'), 'old');
  const before = JSON.stringify(plugins(context));

  const result = await ext(context, ['check']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /lit-schematic: 2 plugin copies/u);
  assert.ok(result.stdout.includes('litgrok extensions update lit-schematic --yes'));
  assert.match(result.stdout, /source .* no longer exists/u);
  assert.ok(result.stdout.includes(personal));
  assert.ok(result.stdout.includes(`mv "${personal}"`));
  assert.match(result.stdout, /1 backup/u);
  assert.ok(result.stdout.includes('litgrok extensions prune-backups'));
  assert.equal(JSON.stringify(plugins(context)), before, 'check changes nothing');
  assert.equal(existsSync(join(personal, 'SKILL.md')), true);
  const json = JSON.parse((await ext(context, ['check', '--json'])).stdout);
  assert.equal(json.clean, false);
  assert.ok(json.findings.some(({ kind }) => kind === 'duplicate'));
  assert.ok(json.findings.some(({ kind }) => kind === 'competing'));
});

test('an old full LitGrok copy of a moved skill is reported with the install line that turns it into the note', async (t) => {
  const context = sandbox(t);
  const grok = join(context.home, '.grok');
  mkdirSync(join(grok, 'skills', 'lit-pptx'), { recursive: true });
  writeFileSync(join(grok, '.litgrok-install-manifest.json'), '{}\n');
  writeFileSync(join(grok, 'skills', 'lit-pptx', 'SKILL.md'), '---\nname: lit-pptx\ndescription: "Build a finished deck"\n---\n');
  const result = await ext(context, ['check']);
  assert.equal(result.code, 1);
  assert.ok(result.stdout.includes(join(grok, 'skills', 'lit-pptx')));
  assert.ok(result.stdout.includes('litgrok install --user'), result.stdout);
});

test('list shows all nine with their state and never fetches anything', async (t) => {
  const context = sandbox(t);
  await ext(context, ['install', 'lit-docx', '--from', context.shelf, '--yes']);
  const result = await ext(context, ['list']);
  assert.equal(result.code, 0, result.stderr);
  for (const id of IDS) assert.ok(result.stdout.includes(id), `lists ${id}`);
  assert.match(result.stdout, /lit-docx\s+installed/u);
  assert.match(result.stdout, /lit-pptx\s+not installed/u);
  const json = JSON.parse((await ext(context, ['list', '--json'])).stdout);
  assert.equal(json.extensions.length, 9);
  const docx = json.extensions.find(({ id }) => id === 'lit-docx');
  assert.equal(docx.plugins[0].source, join(context.shelf, 'variants', 'litgrok', 'lit-docx'));
  assert.ok(docx.plugins[0].installed_at, 'reads installed_at from Grok Build\'s registry');
  assert.equal(existsSync(join(context.home, 'git-calls.log')), false, 'list never runs git');
});

test('unknown verbs, ids and families print the extensions usage', async (t) => {
  const context = sandbox(t);
  for (const args of [[], ['frobnicate'], ['install'], ['install', 'not-a-skill'], ['install', '--family', 'nope'], ['prune-backups', '--older-than', 'soon']]) {
    const result = await ext(context, args);
    assert.equal(result.code, 1, args.join(' '));
    assert.match(result.stderr, /litgrok extensions (list|install)/u, args.join(' '));
  }
  const help = await ext(context, ['--help']);
  assert.equal(help.code, 0);
  for (const verb of ['list', 'check', 'install', 'update', 'remove', 'prune-backups']) assert.ok(help.stdout.includes(`litgrok extensions ${verb}`), verb);
});

test('the top-level help and doctor name the extensions verbs', async (t) => {
  const context = sandbox(t);
  const io = captureIo();
  assert.equal(await run(['--help', '--no-color'], { ...io, cwd: context.project, env: context.env }), 0);
  assert.match(io.read().stdout, /litgrok extensions list\|check\|install\|update\|remove\|prune-backups/u);
  await ext(context, ['install', 'lit-docx', '--from', context.shelf, '--yes']);
  const doctorIo = captureIo();
  assert.equal(await run(['doctor'], { ...doctorIo, cwd: context.project, env: { ...context.env, LITGROK_NO_UPDATE_CHECK: '1' } }), 0);
  assert.match(doctorIo.read().stdout, /^EXTENSIONS: 1 of 9 installed · nothing to fix \(litgrok extensions list\)$/mu);
  const personal = join(context.home, '.cursor', 'skills', 'lit-pptx');
  mkdirSync(personal, { recursive: true });
  writeFileSync(join(personal, 'SKILL.md'), '---\nname: lit-pptx\n---\n');
  const second = captureIo();
  assert.equal(await run(['doctor'], { ...second, cwd: context.project, env: { ...context.env, LITGROK_NO_UPDATE_CHECK: '1' } }), 0, 'doctor stays exit 0');
  assert.match(second.read().stdout, /^EXTENSIONS: 1 of 9 installed · 1 to fix \(run: litgrok extensions check\)$/mu);
});

test('the package ships the extensions module', () => {
  const pkg = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.files.includes('bin'));
  assert.ok(existsSync(join(PRODUCT_ROOT, 'bin', 'extensions.mjs')));
});

async function grokInstall(context, folder) {
  const { spawnSync } = await import('node:child_process');
  spawnSync(join(context.root, 'bin', 'grok'), ['plugin', 'install', folder, '--trust'], { env: context.env });
}

async function userPlugin(context, id) {
  const own = join(context.root, 'my-plugins', id);
  cpSync(join(context.shelf, 'variants', 'litgrok', id), own, { recursive: true });
  await grokInstall(context, own);
  return own;
}

test('a bare update or --all skips a user-managed plugin with a note and still updates the rest', async (t) => {
  const context = sandbox(t);
  await ext(context, ['install', 'lit-pptx', '--from', context.shelf, '--yes']);
  const own = await userPlugin(context, 'visual-qa');
  writeFileSync(join(context.shelf, 'variants', 'litgrok', 'lit-pptx', 'SKILL.md'), '---\nname: lit-pptx\ndescription: "a newer lit-pptx"\n---\n');
  for (const args of [['update'], ['update', '--all']]) {
    const preview = await ext(context, [...args, '--from', context.shelf]);
    assert.equal(preview.code, 0, preview.stderr);
    assert.match(preview.stdout, /lit-pptx: would update/u, args.join(' '));
    assert.ok(preview.stdout.includes(own), 'names the user-managed plugin it skips');
  }
  const done = await ext(context, ['update', '--from', context.shelf, '--yes']);
  assert.equal(done.code, 0, done.stderr);
  assert.match(done.stdout, /lit-pptx: updated/u);
  assert.match(done.stdout, /visual-qa: a user-managed plugin.*update leaves it alone/u);
  assert.deepEqual(plugins(context).filter(({ name }) => name === 'visual-qa').map(({ source }) => source), [own], 'the user plugin stays');
  const named = await ext(context, ['update', 'visual-qa', '--from', context.shelf, '--yes']);
  assert.equal(named.code, 1, 'naming a user-managed plugin is still refused');
});

test('install refuses a user-managed plugin of the same name like update and remove do, even with --allow-shadow', async (t) => {
  const context = sandbox(t);
  const own = await userPlugin(context, 'visual-qa');
  for (const extra of [[], ['--allow-shadow']]) {
    const refused = await ext(context, ['install', 'visual-qa', '--from', context.shelf, '--yes', ...extra]);
    assert.equal(refused.code, 1, refused.stdout);
    assert.ok(refused.stderr.includes(own), refused.stderr);
    assert.match(refused.stderr, /user-managed/u);
    assert.match(refused.stderr, /grok plugin uninstall visual-qa/u, 'gives the manual line');
    assert.doesNotMatch(refused.stderr, /--allow-shadow/u, 'does not offer --allow-shadow for a plugin');
  }
  assert.deepEqual(plugins(context).map(({ source }) => source), [own], 'the user plugin stays');
  assert.equal(existsSync(context.backups), false, 'nothing was backed up or uninstalled');
  assert.doesNotMatch(grokCalls(context), /uninstall/u);
});

test('doctor gives up on a slow grok plugin list quickly and says the host listing is unavailable', { timeout: 30_000 }, async (t) => {
  const context = sandbox(t);
  writeFileSync(join(context.root, 'bin', 'grok'), `#!${process.execPath}\nsetTimeout(() => {}, 60_000);\n`, { mode: 0o755 });
  const io = captureIo();
  const started = Date.now();
  assert.equal(await run(['doctor'], { ...io, cwd: context.project, env: { ...context.env, LITGROK_NO_UPDATE_CHECK: '1' } }), 0);
  assert.ok(Date.now() - started < 15_000, `doctor took ${Date.now() - started} ms`);
  assert.match(io.read().stdout, /^EXTENSIONS: host listing unavailable/mu);
});

test('check gives the grok uninstall line for duplicates when one copy is user-managed', async (t) => {
  const context = sandbox(t);
  await ext(context, ['install', 'lit-docx', '--from', context.shelf, '--yes']);
  await userPlugin(context, 'lit-docx');
  const result = await ext(context, ['check']);
  assert.equal(result.code, 1);
  assert.match(result.stdout, /lit-docx: 2 plugin copies/u);
  assert.ok(!result.stdout.includes('litgrok extensions update lit-docx --yes'), result.stdout);
  assert.match(result.stdout, /grok plugin uninstall lit-docx/u);
});

test('the prune preview warns that a backup may hold a skill the user moved there', async (t) => {
  const context = sandbox(t);
  mkdirSync(join(context.backups, '20261101-000000-dddddd', 'lit-pptx'), { recursive: true });
  writeFileSync(join(context.backups, '20261101-000000-dddddd', 'lit-pptx', 'SKILL.md'), 'mine');
  const preview = await ext(context, ['prune-backups']);
  assert.equal(preview.code, 0, preview.stderr);
  assert.match(preview.stdout, /your own/u);
  assert.equal(existsSync(join(context.backups, '20261101-000000-dddddd')), true);
});

test('a blocked install fetches nothing, and a linked LitGrok cache folder is refused', async (t) => {
  const context = sandbox(t);
  const personal = join(context.home, '.claude', 'skills', 'lit-docx');
  mkdirSync(personal, { recursive: true });
  writeFileSync(join(personal, 'SKILL.md'), '---\nname: lit-docx\ndescription: "mine"\n---\n');
  const stopped = await ext(context, ['install', 'lit-docx', '--yes'], { FAKE_SHELF: context.shelf });
  assert.equal(stopped.code, 1);
  assert.equal(existsSync(join(context.home, 'git-calls.log')), false, 'no clone before the check');
  assert.equal(existsSync(join(context.env.XDG_CACHE_HOME, 'litgrok')), false);

  const elsewhere = join(context.root, 'elsewhere');
  mkdirSync(elsewhere);
  mkdirSync(context.env.XDG_CACHE_HOME, { recursive: true });
  const { symlinkSync } = await import('node:fs');
  symlinkSync(elsewhere, join(context.env.XDG_CACHE_HOME, 'litgrok'));
  const linked = await ext(context, ['install', 'visual-qa', '--yes'], { FAKE_SHELF: context.shelf });
  assert.equal(linked.code, 1);
  assert.match(linked.stderr, /Refusing/u);
  assert.deepEqual(readdirSync(elsewhere), [], 'nothing written through the link');
});

test('an update dry run fetches nothing and says what it compared with', async (t) => {
  const context = sandbox(t);
  await ext(context, ['install', 'lit-pptx', '--from', context.shelf, '--yes']);
  const noCache = await ext(context, ['update'], { FAKE_SHELF: context.shelf });
  assert.equal(noCache.code, 0, noCache.stderr);
  assert.doesNotMatch(noCache.stdout, /lit-pptx: would update/u, noCache.stdout);
  assert.match(noCache.stdout, /after the fetch/u);
  assert.equal(existsSync(join(context.home, 'git-calls.log')), false, 'a dry run fetches nothing');

  await ext(context, ['install', 'visual-qa', '--yes'], { FAKE_SHELF: context.shelf });
  rmSync(join(context.home, 'git-calls.log'));
  const cached = await ext(context, ['update'], { FAKE_SHELF: context.shelf });
  assert.equal(cached.code, 0, cached.stderr);
  assert.match(cached.stdout, /cached copy/u);
  assert.match(cached.stdout, /--yes/u);
  assert.equal(existsSync(join(context.home, 'git-calls.log')), false, 'a dry run pulls nothing');
});
