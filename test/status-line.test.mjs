import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';
import { writeHudRecords } from '../.grok/hooks/litgrok-hud-state.mjs';
import { installNotifications, installStatusLine, removeNotifications, removeStatusLine } from '../bin/status-line-config.mjs';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const HOOK = join(PRODUCT_ROOT, '.grok', 'hooks', 'user-prompt-submit.mjs');
const STATUS_SCRIPT = join(PRODUCT_ROOT, '.grok', 'hooks', 'lit-status-line.mjs');

function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-status-line-'));
  const home = join(root, 'fake home');
  const workspace = join(root, 'workspace');
  const stateRoot = join(root, 'state');
  mkdirSync(home);
  mkdirSync(workspace);
  return { root, home, workspace, stateRoot };
}

function baseEnvironment(home) {
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;
  delete env.COLUMNS;
  return env;
}

function runPromptHook({ home, workspace, stateRoot, sessionId = '../../unsafe/session', prompt = 'lit-plan' }) {
  const event = { hookEventName: 'UserPromptSubmit', cwd: workspace, workspaceRoot: workspace, prompt };
  const env = {
    ...baseEnvironment(home),
    GROK_HOOK_EVENT: 'UserPromptSubmit',
    GROK_HOOK_NAME: 'user-prompt-submit',
    GROK_WORKSPACE_ROOT: workspace,
    LITGROK_HUD_STATE_ROOT: stateRoot,
  };
  if (sessionId !== null) {
    event.sessionId = sessionId;
    env.GROK_SESSION_ID = sessionId;
  }
  if (sessionId === null) delete env.GROK_SESSION_ID;
  return spawnSync(process.execPath, [HOOK], { cwd: workspace, encoding: 'utf8', env, input: `${JSON.stringify(event)}\n` });
}

function readHudRecords(stateRoot) {
  assert.ok(existsSync(stateRoot), 'the hook must create the configured temporary HUD state root');
  const entries = readdirSync(stateRoot);
  assert.equal(entries.length, 2, 'one session-keyed and one cwd-keyed record must exist');
  assert.ok(entries.every((entry) => /^[A-Za-z0-9_-]+\.json$/u.test(entry)), 'keys must be safe single-file names');
  return entries.map((entry) => JSON.parse(readFileSync(join(stateRoot, entry), 'utf8')));
}

function runStatus({ home, stateRoot, cwd, env = {}, model = 'grok-4', percentage = 42, extra = {}, script = STATUS_SCRIPT }) {
  assert.ok(existsSync(script), 'the status-line command must be packaged');
  const statusInput = { cwd, model: { display_name: model }, context_window: { used_percentage: percentage }, ...extra };
  return spawnSync(process.execPath, [script], {
    cwd,
    encoding: 'utf8',
    env: { ...baseEnvironment(home), LITGROK_HUD_STATE_ROOT: stateRoot, ...env },
    input: `${JSON.stringify(statusInput)}\n`,
  });
}

function captureIo() {
  let stdout = '';
  let stderr = '';
  return {
    stdin: { isTTY: true },
    stdout: { isTTY: true, write(value) { stdout += String(value); return true; } },
    stderr: { isTTY: true, write(value) { stderr += String(value); return true; } },
    read() { return { stdout, stderr }; },
  };
}

async function runInstaller(args, home) {
  const io = captureIo();
  const env = baseEnvironment(home);
  const code = await run(args, { ...io, cwd: PRODUCT_ROOT, env });
  return { code, ...io.read() };
}

function statusBackups(home) {
  return readdirSync(join(home, '.grok')).filter((name) => /^config\.toml\.litgrok-backup-[a-f0-9-]+$/u.test(name));
}

test('UserPromptSubmit writes active and cleared HUD records with traversal-safe keys', (t) => {
  const { root, home, workspace, stateRoot } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const active = runPromptHook({ home, workspace, stateRoot });
  assert.equal(active.status, 0, active.stderr);
  assert.equal(active.stdout, '', 'passive-hook stdout is ignored');
  assert.equal(active.stderr, '');
  const activeRecords = readHudRecords(stateRoot);
  for (const record of activeRecords) {
    assert.deepEqual(Object.keys(record).sort(), ['at', 'cwd', 'discipline', 'sessionId']);
    assert.equal(record.sessionId, '../../unsafe/session');
    assert.equal(record.cwd, workspace);
    assert.equal(record.discipline, 'lit-plan');
    assert.ok(Number.isFinite(Date.parse(record.at)));
  }
  assert.equal(existsSync(join(root, 'unsafe')), false, 'an unsafe session key must not escape the state root');

  const idle = runPromptHook({ home, workspace, stateRoot, prompt: 'ordinary prompt' });
  assert.equal(idle.status, 0, idle.stderr);
  assert.equal(idle.stdout, '');
  assert.ok(readHudRecords(stateRoot).every((record) => record.discipline === null), 'a later ordinary prompt clears the activation');
});

test('HUD discipline follows bounded visible prompt tokens and clears code or nonmatches', (t) => {
  const { root, home, workspace, stateRoot } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const prompts = [
    ['lit', 'litwork'],
    ['hi lit', 'litwork'],
    ['... installed well. lit', 'litwork'],
    ['litwork', 'litwork'],
    ['lit-handoff', 'lit-handoff'],
    ['autoresearch', 'autoresearch'],
    ['autoconference', 'autoconference'],
    ['lit-scientific-visualization', 'lit-scientific-visualization'],
    ['lit-plan', 'lit-plan'],
    ['LIT-PLAN', 'lit-plan'],
    ['/lit-handoff', 'lit-handoff'],
    ['lit-plan then litwork', 'lit-plan'],
    ['litgrok', null],
    ['literature', null],
    ['split', null],
    ['lit-plan-x', null],
    ['`lit`', null],
    ['```text\nlit\n```', null],
    ['`lit` then lit-plan', 'lit-plan'],
    ['example:\n~~~md\nlit-plan\n~~~\nnow lit-handoff', 'lit-handoff'],
  ];

  for (const [prompt, discipline] of prompts) {
    const hook = runPromptHook({ home, workspace, stateRoot, sessionId: 'hud-discipline-session', prompt });
    assert.equal(hook.status, 0, `${prompt}: ${hook.stderr}`);
    assert.equal(hook.stdout, '');
    const records = readHudRecords(stateRoot);
    assert.ok(records.every((record) => record.discipline === discipline), `${prompt}: HUD records should be ${discipline}`);

    const status = runStatus({ home, stateRoot, cwd: workspace, env: { LITGROK_HUD_COLOR: '0', COLUMNS: '120' } });
    assert.equal(status.status, 0, `${prompt}: ${status.stderr}`);
    const expected = discipline
      ? `[🔥LIT] 🔥 LIT IGNITED · ${discipline} 🔥 | grok-4 │ ctx [█▎░] 42%`
      : '[🔥LIT] | grok-4 │ ctx [█▎░] 42%';
    assert.equal(stripVTControlCharacters(status.stdout).trim(), expected, prompt);
    assert.equal(status.stdout.includes('\u001b'), false, 'the plain HUD row emits zero escape bytes');
  }
});

test('HUD hook refuses state roots inside the fake home or project', (t) => {
  const { root, home, workspace } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const unsafeRoot of [join(home, '.grok', 'litgrok-hud'), join(workspace, '.grok', 'litgrok-hud')]) {
    const result = runPromptHook({ home, workspace, stateRoot: unsafeRoot });
    assert.notEqual(result.status, 0, 'home or project state is rejected');
    assert.equal(existsSync(unsafeRoot), false);
  }
});

test('UserPromptSubmit falls back to workspace and cwd keys when the session id is absent', (t) => {
  const { root, home, workspace, stateRoot } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const result = runPromptHook({ home, workspace, stateRoot, sessionId: null });

  assert.equal(result.status, 0, result.stderr);
  const records = readHudRecords(stateRoot);
  assert.ok(records.every((record) => record.sessionId === null && record.discipline === 'lit-plan'));
});

test('status line renders activation, idle fallback, plain text, NO_COLOR, and a bounded row', (t) => {
  const { root, home, workspace, stateRoot } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hook = runPromptHook({ home, workspace, stateRoot });
  assert.equal(hook.status, 0, hook.stderr);

  const plain = runStatus({ home, stateRoot, cwd: workspace, env: { LITGROK_HUD_COLOR: '0' } });
  assert.equal(plain.status, 0, plain.stderr);
  assert.equal(stripVTControlCharacters(plain.stdout).trim(), '[🔥LIT] 🔥 LIT IGNITED · lit-plan 🔥 | grok-4 │ ctx [█▎░] 42%');
  assert.equal(plain.stdout.includes('\u001b'), false, 'LITGROK_HUD_COLOR=0 emits zero escape bytes');

  const otherWorkspace = join(root, 'other-workspace');
  mkdirSync(otherWorkspace);
  const idle = runStatus({ home, stateRoot, cwd: otherWorkspace, env: { LITGROK_HUD_COLOR: '0' } });
  assert.equal(idle.status, 0, idle.stderr);
  assert.equal(stripVTControlCharacters(idle.stdout).trim(), '[🔥LIT] | grok-4 │ ctx [█▎░] 42%');
  const coloredIdle = runStatus({ home, stateRoot, cwd: otherWorkspace });
  assert.equal(coloredIdle.status, 0, coloredIdle.stderr);
  assert.equal(stripVTControlCharacters(coloredIdle.stdout).trim(), '[🔥LIT] | grok-4 │ ctx [█▎░] 42%');
  assert.match(coloredIdle.stdout, /^\u001b\[1m\u001b\[38;2;255;99;55m\[🔥LIT\]\u001b\[0m \| /u, 'the brand keeps its orange style');

  const colored = runStatus({ home, stateRoot, cwd: workspace });
  assert.equal(colored.status, 0, colored.stderr);
  const visible = stripVTControlCharacters(colored.stdout).trim();
  const label = 'LIT IGNITED · lit-plan';
  const coloredLine = colored.stdout.trimEnd();
  assert.equal(visible, '[🔥LIT] 🔥 LIT IGNITED · lit-plan 🔥 | grok-4 │ ctx [█▎░] 42%');
  assert.ok(coloredLine.startsWith('\u001b[1m\u001b[38;2;255;99;55m[🔥LIT]\u001b[0m 🔥 \u001b[1m\u001b[38;2;255;99;55mL'), 'color is enabled while stdout is a pipe');
  assert.ok(coloredLine.includes('\u001b[38;2;0;229;255mn\u001b[0m 🔥 |'), 'the label ends at cyan before the unpainted flame');
  assert.match(coloredLine, /mT \u001b\[38;2;\d+;\d+;\d+mI/u, 'the space after LIT is unpainted');
  assert.match(coloredLine, /m· \u001b\[38;2;\d+;\d+;\d+ml/u, 'the space after the separator is unpainted');
  // Bold is set once for the label and each letter changes only the colour, which keeps the row under Grok's 1024-character cut.
  const labelStart = coloredLine.indexOf('🔥 \u001b[1m') + '🔥 \u001b[1m'.length;
  const labelText = coloredLine.slice(labelStart, coloredLine.indexOf('\u001b[0m', labelStart));
  const painted = [...labelText.matchAll(/\u001b\[38;2;(\d+;\d+;\d+)m([^\u001b ])/gu)];
  assert.equal(painted.map((match) => match[2]).join(''), [...label].filter((character) => character !== ' ').join(''));
  assert.equal(stripVTControlCharacters(labelText), label);
  assert.ok(coloredLine.includes('\u001b[0m 🔥 \u001b'), 'the leading flame and space are unpainted');
  const secondFlame = coloredLine.indexOf('🔥 | ');
  assert.notEqual(secondFlame, -1, 'the trailing flame remains present');
  assert.doesNotMatch(coloredLine.slice(secondFlame), /\u001b/u, 'the trailing flame and model/context segment are unpainted');

  const noColor = runStatus({ home, stateRoot, cwd: workspace, env: { NO_COLOR: '1' } });
  assert.equal(noColor.status, 0, noColor.stderr);
  assert.equal(stripVTControlCharacters(noColor.stdout).trim(), visible);
  assert.equal(noColor.stdout.includes('\u001b'), false, 'NO_COLOR emits zero escape bytes');

  const longDiscipline = 'a-very-long-discipline-name';
  writeHudRecords({
    env: { ...baseEnvironment(home), LITGROK_HUD_STATE_ROOT: stateRoot },
    sessionId: 'clipped-discipline',
    cwd: workspace,
    workspaceRoot: workspace,
    discipline: longDiscipline,
  });
  const clippedDiscipline = runStatus({ home, stateRoot, cwd: workspace });
  assert.equal(clippedDiscipline.status, 0, clippedDiscipline.stderr);
  assert.match(stripVTControlCharacters(clippedDiscipline.stdout), /🔥 LIT IGNITED · [^\n]*… 🔥/u);
  assert.match(clippedDiscipline.stdout, /\u001b\[38;2;\d+;\d+;\d+m…\u001b\[0m/u, 'the clipped ellipsis is painted after plain-text clipping');

  const long = runStatus({ home, stateRoot, cwd: workspace, model: 'grok-model-'.repeat(12), extra: { effort: { level: 'high' }, context_window: { used_percentage: 42, context_window_size: 256000 } } });
  assert.equal(long.status, 0, long.stderr);
  const bounded = stripVTControlCharacters(long.stdout).trim();
  assert.equal(bounded.split(/\r?\n/u).length, 1);
  assert.ok(bounded.length < 80, 'the row must be trimmed below 80 cells');
  assert.match(bounded, /… \[high\] │ ctx \[█▎░\] 42%\/256k$/u, 'only the model name is clipped');
  const wide = runStatus({ home, stateRoot, cwd: workspace, model: 'grok-model-'.repeat(12), env: { COLUMNS: '200' } });
  assert.ok(stripVTControlCharacters(wide.stdout).trim().length > 80, 'a wider row from Grok COLUMNS keeps more of the model');
});

test('status line keeps the compact layout: installed version, effort, window size, unknown context', (t) => {
  const { root, home, workspace, stateRoot } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  // An installed copy finds its version in the install manifest beside its hooks folder.
  const installed = join(root, 'installed', '.grok');
  mkdirSync(join(installed, 'hooks'), { recursive: true });
  for (const name of readdirSync(dirname(STATUS_SCRIPT))) {
    if (name.endsWith('.mjs')) writeFileSync(join(installed, 'hooks', name), readFileSync(join(dirname(STATUS_SCRIPT), name)));
  }
  writeFileSync(join(installed, '.litgrok-install-manifest.json'), `${JSON.stringify({ schema: 'litgrok.install-manifest/v1', version: '9.8.7', files: {} })}\n`);
  const script = join(installed, 'hooks', 'lit-status-line.mjs');
  const row = (extra, percentage = 10) => {
    const result = runStatus({ home, stateRoot, cwd: workspace, model: 'Grok 4.5', percentage, extra, script, env: { LITGROK_HUD_COLOR: '0' } });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trimEnd();
  };
  const window = { context_window: { used_percentage: 10, context_window_size: 2000000 } };
  assert.equal(row({ effort: { level: 'high' }, ...window }), '[🔥LIT v9.8.7] | Grok 4.5 [high] │ ctx [▎░░] 10%/2m');
  assert.equal(row({ context_window: { used_percentage: 10, context_window_size: 256000 } }), '[🔥LIT v9.8.7] | Grok 4.5 │ ctx [▎░░] 10%/256k');
  assert.equal(row({ context_window: { context_window_size: 256000 } }), '[🔥LIT v9.8.7] | Grok 4.5 │ ctx ?/256k');
  assert.equal(row({ context_window: {} }), '[🔥LIT v9.8.7] | Grok 4.5 │ ctx ?');
  assert.equal(row({ effort: { level: '\u001b[31mhigh' }, ...window }), '[🔥LIT v9.8.7] | Grok 4.5 │ ctx [▎░░] 10%/2m', 'an odd effort value is not echoed');
  writeFileSync(join(installed, '.litgrok-install-manifest.json'), '{"version":"\u001b[31m1"}\n');
  assert.equal(row(window), '[🔥LIT] | Grok 4.5 │ ctx [▎░░] 10%/2m', 'an unreadable manifest drops the version');
});

test('user opt-in merges status line config and backs up the prior config', async (t) => {
  const { root, home } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const grokRoot = join(home, '.grok');
  mkdirSync(grokRoot);
  const configPath = join(grokRoot, 'config.toml');
  const original = '# local settings\n[model]\nname = "grok-4"\n';
  writeFileSync(configPath, original);

  const result = await runInstaller(['install', '--user', '--yes', '--status-line'], home);
  assert.equal(result.code, 0, result.stderr);
  const config = readFileSync(configPath, 'utf8');
  assert.ok(config.startsWith(original));
  assert.match(config, /\[ui\.status_line\]/u);
  assert.match(config, /type\s*=\s*"command"/u);
  assert.match(config, /command\s*=\s*"node .*\/\.grok\/hooks\/lit-status-line\.mjs'?"/u);
  assert.match(config, /refresh_interval\s*=\s*2/u);
  const backups = statusBackups(home);
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(grokRoot, backups[0]), 'utf8'), original);
  assert.ok(existsSync(join(grokRoot, 'hooks', 'lit-status-line.mjs')));
});

test('status-line opt-in is disabled by default and rejected for project scope', async (t) => {
  const { root, home, workspace } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const preview = await runInstaller(['install', '--user', '--yes', '--status-line', '--dry-run'], home);
  assert.equal(preview.code, 0, preview.stderr);
  assert.equal(existsSync(join(home, '.grok')), false, 'status-line dry-run must not change fake user config');

  const normal = await runInstaller(['install', '--user', '--yes'], home);
  assert.equal(normal.code, 0, normal.stderr);
  assert.equal(existsSync(join(home, '.grok', 'config.toml')), false);

  const projectIo = captureIo();
  const project = await run(['install', '--project', '--yes', '--status-line'], {
    ...projectIo,
    cwd: workspace,
    env: baseEnvironment(home),
  });
  assert.notEqual(project, 0);
  assert.equal(existsSync(join(workspace, '.grok')), false);
  assert.equal(existsSync(join(home, '.grok', 'config.toml')), false);
});

test('status-line opt-in still writes config when the payload is already current', async (t) => {
  const { root, home } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const first = await runInstaller(['install', '--user', '--yes'], home);
  assert.equal(first.code, 0, first.stderr);

  const second = await runInstaller(['install', '--user', '--yes', '--status-line'], home);
  assert.equal(second.code, 0, second.stderr);
  assert.match(readFileSync(join(home, '.grok', 'config.toml'), 'utf8'), /\[ui\.status_line\]/u);
});

test('existing user status line is preserved through opt-in and uninstall', async (t) => {
  const { root, home } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const grokRoot = join(home, '.grok');
  mkdirSync(grokRoot);
  const configPath = join(grokRoot, 'config.toml');
  const original = '[ui.status_line]\ntype = "builtin"\nitems = ["cwd"]\n\n[model]\nname = "grok-4"\n';
  writeFileSync(configPath, original);

  const install = await runInstaller(['install', '--user', '--yes', '--status-line'], home);
  assert.equal(install.code, 0, install.stderr);
  assert.equal(readFileSync(configPath, 'utf8'), original);
  assert.equal(statusBackups(home).length, 0, 'a config that was not changed needs no backup');

  const uninstall = await runInstaller(['uninstall', '--user', '--yes'], home);
  assert.equal(uninstall.code, 0, uninstall.stderr);
  assert.equal(readFileSync(configPath, 'utf8'), original);
});

test('uninstall preserves a status-line command changed by the user after opt-in', async (t) => {
  const { root, home } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const configPath = join(home, '.grok', 'config.toml');
  const install = await runInstaller(['install', '--user', '--yes', '--status-line'], home);
  assert.equal(install.code, 0, install.stderr);
  const edited = readFileSync(configPath, 'utf8').replace(/command\s*=\s*"[^"]+"/u, 'command = "node /user/custom-status.mjs"');
  writeFileSync(configPath, edited);

  const uninstall = await runInstaller(['uninstall', '--user', '--yes'], home);
  assert.equal(uninstall.code, 0, uninstall.stderr);
  assert.equal(readFileSync(configPath, 'utf8'), edited);
});

test('uninstall removes only the managed status-line value and backs up the changed config', async (t) => {
  const { root, home } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const grokRoot = join(home, '.grok');
  mkdirSync(grokRoot);
  const configPath = join(grokRoot, 'config.toml');
  const original = '[model]\nname = "grok-4"\n';
  writeFileSync(configPath, original);

  const install = await runInstaller(['install', '--user', '--yes', '--status-line'], home);
  assert.equal(install.code, 0, install.stderr);
  const installedConfig = readFileSync(configPath, 'utf8');
  writeFileSync(configPath, `${installedConfig}\n[mcp]\nservers = []\n`);
  const beforeUninstall = readFileSync(configPath, 'utf8');

  const uninstall = await runInstaller(['uninstall', '--user', '--yes'], home);
  assert.equal(uninstall.code, 0, uninstall.stderr);
  const remaining = readFileSync(configPath, 'utf8');
  assert.ok(remaining.startsWith(original));
  assert.match(remaining, /\[mcp\]\nservers = \[\]/u);
  assert.doesNotMatch(remaining, /litgrok-managed-status-line|\[ui\.status_line\]/u);
  assert.ok(statusBackups(home).some((name) => readFileSync(join(grokRoot, name), 'utf8') === beforeUninstall));
});

const CONFIG_SHAPES = {
  'empty file': '',
  'no final newline': 'a = 1',
  'one final newline': 'a = 1\n',
  'blank line at the end': 'a = 1\n\n',
  'two blank lines at the end': 'a = 1\n\n\n',
  'table without final newline': '[model]\nname = "grok-4"',
  'CRLF lines': '[model]\r\nname = "grok-4"\r\n',
  'comment only': '# local settings\n',
  'ui table header': '[ui]\ntheme = "dark"\n',
  'ui dotted keys': 'ui.theme = "dark"\n',
  'ui inline table inside another table': '[tool]\nui = { theme = "dark" }\n',
  'ui = text inside a multi-line string': 's = """\nui = 1\n[fake]\n"""\n',
  'ui = text inside a multi-line literal string': "s = '''\nui = 1\n'''\n",
};

test('status-line install then remove restores the original config bytes for every shape', (t) => {
  for (const [shape, original] of Object.entries(CONFIG_SHAPES)) {
    const root = mkdtempSync(join(tmpdir(), 'litgrok-status-shape-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const config = join(root, 'config.toml');
    writeFileSync(config, original);
    assert.equal(installStatusLine(root).changed, true, `${shape}: installs`);
    assert.match(readFileSync(config, 'utf8'), /\[ui\.status_line\]/u, shape);
    assert.equal(removeStatusLine(root).changed, true, `${shape}: removes`);
    assert.equal(readFileSync(config, 'utf8'), original, `${shape}: original bytes come back`);
  }
});

test('status-line install fails closed when ui is already a value or an array of tables', (t) => {
  for (const original of [
    'ui = { theme = "dark" }\n',
    '"ui" = { theme = "dark" }\n',
    "ui = 'compact'\n",
    '[[ui]]\ntheme = "dark"\n',
    'a = [\n  [1, 2]\n]\nui = { theme = "x" }\n',
    'a = [\n  "]",\n  [3],\n]\nui = 1\n',
    's = """\n[fake]\n"""\nui = { theme = "x" }\n',
    'm = { a = [\n1] }\n"ui" = 2\n',
  ]) {
    const root = mkdtempSync(join(tmpdir(), 'litgrok-status-conflict-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const config = join(root, 'config.toml');
    writeFileSync(config, original);
    const result = installStatusLine(root);
    assert.equal(result.changed, false, original);
    assert.match(result.detail, /not configured.*ui/u, original);
    assert.equal(readFileSync(config, 'utf8'), original, 'the config is left untouched');
    assert.equal(readdirSync(root).length, 1, 'no backup or temporary file is left behind');
  }
});

test('the finish notification is opt-in, user scope only, and uninstall takes back exactly what it added', async (t) => {
  const { root, home, workspace } = sandbox();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const grokRoot = join(home, '.grok');
  mkdirSync(grokRoot);
  const configPath = join(grokRoot, 'config.toml');
  const original = '[ui]\ntheme = "dark"\n';
  writeFileSync(configPath, original);

  const preview = await runInstaller(['install', '--user', '--yes', '--notify', '--dry-run'], home);
  assert.equal(preview.code, 0, preview.stderr);
  assert.match(preview.stdout, /would configure user finish notification .*config\.toml/u);
  assert.equal(readFileSync(configPath, 'utf8'), original, 'a dry run writes nothing');

  const plain = await runInstaller(['install', '--user', '--yes'], home);
  assert.equal(plain.code, 0, plain.stderr);
  assert.equal(readFileSync(configPath, 'utf8'), original, 'off unless asked for');

  for (const args of [['install', '--project', '--yes', '--notify'], ['uninstall', '--user', '--yes', '--notify']]) {
    const io = captureIo();
    assert.notEqual(await run(args, { ...io, cwd: workspace, env: baseEnvironment(home) }), 0, args.join(' '));
  }

  const install = await runInstaller(['install', '--user', '--yes', '--notify', '--status-line'], home);
  assert.equal(install.code, 0, install.stderr);
  assert.match(install.stdout, /finish notification configured/u);
  const config = readFileSync(configPath, 'utf8');
  assert.ok(config.startsWith(original));
  assert.match(config, /# litgrok-managed-notifications-v1\n\[ui\.notifications\]\ncondition = "always"\nevents = \["turn_complete", "approval_required", "agent_error"\]\n/u);
  assert.match(config, /\[ui\.status_line\]/u);

  const again = await runInstaller(['install', '--user', '--yes', '--notify'], home);
  assert.equal(again.code, 0, again.stderr);
  assert.equal(readFileSync(configPath, 'utf8'), config, 'a second opt-in changes nothing');

  const uninstall = await runInstaller(['uninstall', '--user', '--yes'], home);
  assert.equal(uninstall.code, 0, uninstall.stderr);
  assert.equal(readFileSync(configPath, 'utf8'), original, 'both blocks come out and the original bytes come back');
});

test('the finish notification leaves the user\'s own notification settings and conflicting ui values alone', (t) => {
  for (const original of [
    '[ui.notifications]\nmethod = "bel"\n',
    '[[ui.notifications.hooks]]\ncommand = "afplay /System/Library/Sounds/Glass.aiff"\n',
    '[ui]\nnotifications = { condition = "never" }\n',
    'ui = { theme = "dark" }\n',
    '[[ui]]\ntheme = "dark"\n',
  ]) {
    const root = mkdtempSync(join(tmpdir(), 'litgrok-notify-preserve-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const config = join(root, 'config.toml');
    writeFileSync(config, original);
    const result = installNotifications(root);
    assert.equal(result.changed, false, original);
    assert.equal(readFileSync(config, 'utf8'), original, 'the config is left untouched');
    assert.equal(readdirSync(root).length, 1, 'no backup or temporary file is left behind');
  }

  const root = mkdtempSync(join(tmpdir(), 'litgrok-notify-edited-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = join(root, 'config.toml');
  writeFileSync(config, 'a = 1');
  assert.equal(installNotifications(root).changed, true);
  const edited = readFileSync(config, 'utf8').replace('condition = "always"', 'condition = "unfocused"');
  writeFileSync(config, edited);
  assert.equal(removeNotifications(root).changed, false, 'an edited block is the user\'s now');
  assert.equal(readFileSync(config, 'utf8'), edited);
  writeFileSync(config, edited.replace('condition = "unfocused"', 'condition = "always"'));
  assert.equal(removeNotifications(root).changed, true);
  assert.equal(readFileSync(config, 'utf8'), 'a = 1', 'the newline LitGrok added goes too');
});
