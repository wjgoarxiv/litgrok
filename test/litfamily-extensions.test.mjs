import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';

// The nine skills that make files left LitGrok for the LitFamily extension shelf, wjgoarxiv-skills. LitGrok says so
// where a user meets it: once in the install or update output, and, for a user who runs the LIT status row, as one
// row during the first session after. Grok Build 1.0.13 ignores a SessionStart hook's stdout, so the status row is
// the only in-session surface that can show it.
const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOKS = join(PRODUCT_ROOT, '.grok', 'hooks');
const SHELF = 'https://github.com/wjgoarxiv/wjgoarxiv-skills';
const CLONE_LINE = `git clone ${SHELF}`;
const PLUGIN_LINE = 'grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/<skill>" --trust';
const sha256Text = (text) => createHash('sha256').update(text).digest('hex');

function captureIo() {
  let stdout = '';
  let stderr = '';
  return {
    stdin: { isTTY: true },
    stdout: { isTTY: true, write(chunk) { stdout += String(chunk); return true; } },
    stderr: { isTTY: true, write(chunk) { stderr += String(chunk); return true; } },
    read() { return { stdout: stripVTControlCharacters(stdout), stderr: stripVTControlCharacters(stderr) }; },
  };
}

function sandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-extensions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const project = join(root, 'project');
  const home = join(root, 'home');
  mkdirSync(project);
  mkdirSync(home);
  const env = { ...process.env, HOME: home, XDG_CACHE_HOME: join(root, 'cache') };
  for (const name of ['CI', 'NO_COLOR', 'LITGROK_HUD_LINES']) delete env[name];
  return { root, project, home, env };
}

async function install(args, { project, env }) {
  const io = captureIo();
  const code = await run(args, { ...io, cwd: project, env });
  return { code, ...io.read() };
}

function noticeBlock(stdout) {
  const start = stdout.indexOf('╭─ LITFAMILY EXTENSIONS');
  if (start === -1) return null;
  const end = stdout.indexOf('╰─', start);
  return stdout.slice(start, end + 2);
}

// The state a 1.0.34 project install leaves after the move: a skill that is now a note still has a body file the
// last install owned, and the ownership manifest records 1.0.34.
async function olderInstall(context, { bodyText = 'an old deck reference\n', recordedText = bodyText } = {}) {
  const first = await install(['install', '--project', '--yes'], context);
  assert.equal(first.code, 0, first.stderr);
  const grok = join(context.project, '.grok');
  const manifestPath = join(grok, '.litgrok-install-manifest.json');
  const body = 'skills/lit-pptx/references/deck-notes.md';
  mkdirSync(join(grok, dirname(body)), { recursive: true });
  writeFileSync(join(grok, body), bodyText);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.version = '1.0.34';
  manifest.files[body] = sha256Text(recordedText);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { grok, manifestPath, body: join(grok, body) };
}

test('install output names the extension shelf, the clone line and the plugin line, in under a dozen lines', async (t) => {
  const context = sandbox(t);
  const result = await install(['install', '--project', '--yes'], context);
  assert.equal(result.code, 0, result.stderr);
  const block = noticeBlock(result.stdout);
  assert.ok(block, 'a successful install shows the LitFamily extensions card');
  assert.ok(result.stdout.indexOf('╭─ INSTALL RECEIPT') < result.stdout.indexOf('╭─ LITFAMILY EXTENSIONS'), 'the card follows the receipt');
  assert.match(block, /LitGrok's core is complete and works on its own\./u);
  assert.match(block, /LitFamily extensions/u);
  assert.match(block, /decks, documents, figures, design and video covers/u);
  assert.ok(block.includes(SHELF), 'names the shelf');
  assert.ok(block.includes(CLONE_LINE), 'gives the clone line');
  assert.ok(block.includes(PLUGIN_LINE), 'gives the plugin line the notes print');
  assert.match(block, /full LitFamily experience/u);
  for (const id of ['lit-pptx', 'lit-docx', 'lit-scientific-visualization', 'lit-diagram-drawer', 'lit-schematic', 'frontend-ui-ux', 'visual-qa', 'readme-studio', 'lit-typographic-motion']) {
    assert.ok(block.includes(id), `names ${id}`);
  }
  const lines = block.split('\n');
  assert.ok(lines.length >= 6 && lines.length <= 12, `the card is ${lines.length} lines`);
  assert.doesNotMatch(block, /cache/u, 'a fresh install names no old cache');
  const again = await install(['install', '--project', '--yes'], context);
  assert.equal(again.code, 0, again.stderr);
  assert.ok(noticeBlock(again.stdout), 'an install that finds everything current still shows the card');
});

test('an update from 1.0.34 also names the old engine caches that are still on disk', async (t) => {
  const context = sandbox(t);
  await olderInstall(context);
  const office = join(context.env.XDG_CACHE_HOME, 'litgrok', 'office-docs');
  mkdirSync(office, { recursive: true });
  const result = await install(['install', '--project', '--yes'], context);
  assert.equal(result.code, 0, result.stderr);
  const block = noticeBlock(result.stdout);
  assert.ok(block, 'the update shows the card');
  assert.ok(block.includes(office), 'names the office cache that exists');
  assert.ok(!block.includes(join(context.env.XDG_CACHE_HOME, 'litgrok', 'motion-runtime')), 'leaves out a cache that is not there');
  assert.match(block, /you can delete/u);
  assert.equal(existsSync(office), true, 'the installer never deletes the cache itself');
});

test('the card stays out of previews, uninstall and the ownership manifest', async (t) => {
  const context = sandbox(t);
  for (const args of [['install', '--project', '--dry-run'], ['install', '--project', '--no-color', '--yes']]) {
    const preview = await install(args, context);
    assert.equal(preview.code, 0, preview.stderr);
    assert.equal(noticeBlock(preview.stdout), null, `${args.join(' ')} shows no card`);
  }
  const ci = captureIo();
  assert.equal(await run(['install', '--project', '--yes'], { ...ci, cwd: context.project, env: { ...context.env, CI: '1' } }), 0);
  assert.equal(noticeBlock(ci.read().stdout), null, 'CI shows no card');
  assert.equal((await install(['install', '--project', '--yes'], context)).code, 0);
  const manifest = readFileSync(join(context.project, '.grok', '.litgrok-install-manifest.json'), 'utf8');
  assert.doesNotMatch(manifest, /wjgoarxiv-skills|LitFamily/u, 'the machine-readable manifest carries no notice');
  JSON.parse(manifest);
  const removed = await install(['uninstall', '--project', '--yes'], context);
  assert.equal(removed.code, 0, removed.stderr);
  assert.equal(noticeBlock(removed.stdout), null, 'uninstall shows no card');
});

test('an update names a file it keeps beside a moved skill\'s note because the installer does not own it', async (t) => {
  const context = sandbox(t);
  const { grok, body } = await olderInstall(context);
  const mine = join(grok, 'skills', 'lit-pptx', 'my-deck-notes.md');
  writeFileSync(mine, 'my own notes\n');
  const result = await install(['install', '--project', '--yes'], context);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(existsSync(body), false, 'the owned body file is removed');
  assert.equal(readFileSync(mine, 'utf8'), 'my own notes\n', 'the user file survives');
  assert.ok(result.stderr.includes(`Warning: keeping ${mine}`), `the output names the kept file:\n${result.stderr}`);
  assert.match(result.stderr, /lit-pptx note/u);
  const again = await install(['install', '--project', '--yes'], context);
  assert.equal(again.code, 0, again.stderr);
  assert.ok(!again.stderr.includes(mine), 'a later install that removes nothing does not repeat the warning');
});

test('a dry run previews the removals, the refusals and the kept files with their counts, and writes nothing', async (t) => {
  const context = sandbox(t);
  const { grok, manifestPath, body } = await olderInstall(context);
  const changed = join(grok, 'skills', 'lit-docx', 'references', 'checklist.md');
  mkdirSync(dirname(changed), { recursive: true });
  writeFileSync(changed, 'the user edited this\n');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.files['skills/lit-docx/references/checklist.md'] = sha256Text('the shipped text\n');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const mine = join(grok, 'skills', 'lit-pptx', 'my-deck-notes.md');
  writeFileSync(mine, 'my own notes\n');
  const before = readFileSync(manifestPath, 'utf8');
  const result = await install(['install', '--project', '--dry-run'], context);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.includes(`would remove ${body}`), 'previews the removal');
  assert.ok(result.stdout.includes(`would refuse ${changed}`), 'previews the refusal');
  assert.ok(result.stdout.includes(`would keep ${mine}`), 'previews the kept file');
  assert.match(result.stdout, /Preview: \d+ to write · 1 to remove · 1 refused · 1 kept/u);
  assert.match(result.stdout, /stops before writing anything/u, 'says the real run would stop');
  assert.equal(readFileSync(manifestPath, 'utf8'), before, 'the manifest is untouched');
  assert.equal(existsSync(body), true, 'nothing is removed');
});

function installedHooks(root) {
  const installed = join(root, 'installed', '.grok');
  mkdirSync(join(installed, 'hooks'), { recursive: true });
  for (const name of readdirSync(HOOKS)) {
    if (name.endsWith('.mjs')) writeFileSync(join(installed, 'hooks', name), readFileSync(join(HOOKS, name)));
  }
  writeFileSync(join(installed, '.litgrok-install-manifest.json'), `${JSON.stringify({ schema: 'litgrok.install-manifest/v1', version: '9.8.7', files: {} })}\n`);
  return installed;
}

function statusRows({ root, home, script, sessionId, env = {} }) {
  const workspace = join(root, 'workspace');
  mkdirSync(workspace, { recursive: true });
  const input = { cwd: workspace, session_id: sessionId, model: { display_name: 'Grok 4.5' }, context_window: { used_percentage: 10 } };
  const childEnv = { ...process.env, HOME: home, LITGROK_HUD_STATE_ROOT: join(root, 'hud-state'), LITGROK_HUD_COLOR: '0', ...env };
  for (const name of ['NO_COLOR', 'COLUMNS', 'CI']) if (!Object.hasOwn(env, name)) delete childEnv[name];
  if (!Object.hasOwn(env, 'LITGROK_HUD_LINES')) delete childEnv.LITGROK_HUD_LINES;
  const result = spawnSync(process.execPath, [script], { cwd: workspace, encoding: 'utf8', env: childEnv, input: `${JSON.stringify(input)}\n` });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trimEnd().split('\n');
}

test('the status row adds one extensions row for the whole first session after an install, then never again', (t) => {
  const { root, home } = sandbox(t);
  const installed = installedHooks(root);
  const script = join(installed, 'hooks', 'lit-status-line.mjs');
  const extensionRow = (rows) => rows.find((row) => row.includes('LitFamily extensions'));
  const first = statusRows({ root, home, script, sessionId: 'session-one' });
  assert.ok(extensionRow(first), `the first session shows the row:\n${first.join('\n')}`);
  assert.ok(extensionRow(first).includes('github.com/wjgoarxiv/wjgoarxiv-skills'));
  assert.ok(first.length >= 2 && !first[0].includes('LitFamily'), 'the HUD row stays first');
  assert.ok(extensionRow(statusRows({ root, home, script, sessionId: 'session-one' })), 'every refresh of that session keeps it');
  assert.equal(extensionRow(statusRows({ root, home, script, sessionId: 'session-two' })), undefined, 'the next session has no row');
  assert.ok(existsSync(join(installed, 'litgrok', 'extensions-notice.json')), 'the marker sits beside the installed hooks');
  const marker = readFileSync(join(installed, 'litgrok', 'extensions-notice.json'), 'utf8');
  assert.ok(!marker.includes('session-one'), 'the marker stores no raw session id');
});

test('the extensions row respects the one-line HUD and never comes from the repository copy', (t) => {
  const { root, home } = sandbox(t);
  const installed = installedHooks(root);
  const script = join(installed, 'hooks', 'lit-status-line.mjs');
  const quiet = statusRows({ root, home, script, sessionId: 'session-quiet', env: { LITGROK_HUD_LINES: '1' } });
  assert.equal(quiet.length, 1, 'LITGROK_HUD_LINES=1 keeps one row');
  assert.ok(!quiet[0].includes('LitFamily'), 'and that row is the HUD');
  assert.equal(existsSync(join(installed, 'litgrok', 'extensions-notice.json')), false, 'a quiet session does not use up the notice');
  const repo = statusRows({ root, home, script: join(HOOKS, 'lit-status-line.mjs'), sessionId: 'session-repo' });
  assert.ok(!repo.some((row) => row.includes('LitFamily')), 'the uninstalled repository copy shows no row');
  assert.equal(existsSync(join(PRODUCT_ROOT, '.grok', 'litgrok', 'extensions-notice.json')), false, 'and writes no marker into the repository');
});

test('README and README_ko-KR carry an Extensions section in the same framing', () => {
  const english = readFileSync(join(PRODUCT_ROOT, 'README.md'), 'utf8');
  assert.match(english, /\n## Extensions\n/u);
  const section = english.slice(english.indexOf('\n## Extensions\n'), english.indexOf('\n## ', english.indexOf('\n## Extensions\n') + 5));
  assert.match(section, /core is complete and works on its own/u);
  assert.match(section, /LitFamily extensions?/u);
  assert.match(section, /full LitFamily experience/u);
  assert.ok(section.includes(CLONE_LINE));
  assert.ok(section.includes('grok plugin install "<path to your wjgoarxiv-skills clone>/variants/litgrok/lit-pptx" --trust'));
  assert.doesNotMatch(english, /#skills-that-moved-to-wjgoarxiv-skills/u, 'old anchors point at the new section');
  const korean = readFileSync(join(PRODUCT_ROOT, 'README_ko-KR.md'), 'utf8');
  assert.match(korean, /\n## 확장 스킬\n/u);
  const koSection = korean.slice(korean.indexOf('\n## 확장 스킬\n'), korean.indexOf('\n## ', korean.indexOf('\n## 확장 스킬\n') + 5));
  assert.match(koSection, /LitFamily 확장/u);
  assert.match(koSection, /코어/u);
  assert.ok(koSection.includes(CLONE_LINE));
  assert.doesNotMatch(korean, /#wjgoarxiv-skills로-옮긴-스킬/u, 'old anchors point at the new section');
});
