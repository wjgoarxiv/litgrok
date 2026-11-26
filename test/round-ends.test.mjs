import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { run } from '../bin/litgrok.mjs';
import { ICON_FONT, addIconFont, grokOnPath, planIconFont, roundEnds, saveGlyphs } from '../bin/round-ends.mjs';
import { statusLineOn } from '../bin/status-line-config.mjs';
import { drawsRoundCaps, glyphChoice, hasIconFont, hudSettingsPath, readHudSettings } from '../.grok/hooks/lit-caps.mjs';
import { rememberedIconFont } from '../.grok/hooks/litgrok-hud-state.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

// A zip of the two wanted files and one more, one stored and two deflated.
function zipOf(entries) {
  const locals = [];
  const central = [];
  let at = 0;
  for (const [name, bytes, stored] of entries) {
    const label = Buffer.from(name);
    const data = stored ? bytes : deflateRawSync(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(bytes.length, 22);
    local.writeUInt16LE(label.length, 26);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(stored ? 0 : 8, 10);
    head.writeUInt32LE(data.length, 20);
    head.writeUInt32LE(bytes.length, 24);
    head.writeUInt16LE(label.length, 28);
    head.writeUInt32LE(at, 42);
    locals.push(local, label, data);
    central.push(head, label);
    at += 30 + label.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(at, 16);
  return Buffer.concat([...locals, directory, end]);
}

const FONT = Buffer.from('a small test font '.repeat(400));
const LICENSE = Buffer.from('a test license\n');
const ARCHIVE = zipOf([['README.md', Buffer.from('skip me'), false], ['SymbolsNerdFontMono-Regular.ttf', FONT, false], ['LICENSE', LICENSE, true]]);
const PINS = {
  ...ICON_FONT,
  archiveSha256: sha(ARCHIVE),
  files: ICON_FONT.files.map((file) => ({ ...file, sha256: sha(file.entry === 'LICENSE' ? LICENSE : FONT) })),
};
const served = (bytes = ARCHIVE) => async () => new Response(bytes);

function stateRoot(t) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-hud-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function world(t, more = {}) {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-round-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return { home, env: { HOME: home, TMPDIR: home, LITGROK_HUD_STATE_ROOT: stateRoot(t), ...more } };
}

const folderOf = (home) => join(home, '.local/share/fonts');
const fontOf = (home) => join(folderOf(home), 'SymbolsNerdFontMono-Regular.ttf');
// Only the home's own folder counts, whatever fonts the machine running the tests has.
const homeFonts = (env) => hasIconFont(env, { folders: [folderOf(env.HOME)] });

async function install(args, { env, home, fetch = served(), tty = false, platform = 'linux' }) {
  let out = '';
  let err = '';
  const code = await run(args, {
    env, cwd: home, platform, fetch, iconFont: homeFonts, iconFontPins: PINS,
    stdin: { isTTY: tty }, stdout: { isTTY: tty, columns: 80, write: (text) => { out += text; } }, stderr: { write: (text) => { err += text; } },
  });
  return { code, out, err, ends: out.split('\n').filter((line) => line.startsWith('ROUND_ENDS:')), last: out.trimEnd().split('\n').at(-1) };
}

const SURFACE = ['install', '--yes', '--user', '--status-line'];

test('--round adds the pinned font once, and uninstall takes back only its own unchanged files', async (t) => {
  const { home, env } = world(t);
  const preview = await install(['install', '--dry-run', '--round', '--glyphs', 'round'], { env, home, fetch: () => assert.fail('a preview downloads nothing') });
  assert.ok(preview.out.includes(`would add icon font file ${fontOf(home)}\n`));
  assert.match(preview.out, /would save glyphs round in .*litgrok-hud\.json\n/u);
  assert.match(preview.last, /^Nothing was installed: this was a preview \(DRY RUN \/ NON-INTERACTIVE\)\.$/u);
  assert.deepEqual(readdirSync(home), []);

  const first = await install([...SURFACE, '--round'], { env, home });
  assert.equal(first.code, 0, first.err);
  assert.equal(sha(readFileSync(fontOf(home))), sha(FONT));
  assert.equal(readFileSync(join(folderOf(home), 'SymbolsNerdFontMono-LICENSE.txt'), 'utf8'), LICENSE.toString());
  assert.deepEqual(readdirSync(folderOf(home)).sort(), ['SymbolsNerdFontMono-LICENSE.txt', 'SymbolsNerdFontMono-Regular.ttf']);
  assert.match(first.out, /ICON FONT · added .*SymbolsNerdFontMono-Regular\.ttf/u);
  assert.equal(first.last, 'ROUND_ENDS: check (an icon font is here, and this terminal may not use it; show your user the pill from install --agent)');

  const again = await install([...SURFACE, '--round'], { env, home, fetch: () => assert.fail('the font is here') });
  assert.match(again.out, /an icon font is already here; nothing added/u);

  writeFileSync(join(folderOf(home), 'SymbolsNerdFontMono-LICENSE.txt'), 'changed by the user\n');
  const removal = await install(['uninstall', '--user', '--yes'], { env, home });
  assert.equal(removal.code, 0, removal.err);
  assert.match(removal.last, /^Removed the icon font: .*SymbolsNerdFontMono-Regular\.ttf\. Other products may then draw square ends\.$/u);
  assert.deepEqual(readdirSync(folderOf(home)), ['SymbolsNerdFontMono-LICENSE.txt']);
  assert.ok(!existsSync(join(home, '.grok/litgrok-icon-font.json')));
  assert.ok(!existsSync(hudSettingsPath(env)));
  assert.deepEqual(removal.ends, []);
});

test('a font of the user is never replaced or removed, and no link is followed', async (t) => {
  const { home, env } = world(t);
  mkdirSync(folderOf(home), { recursive: true });
  writeFileSync(join(folderOf(home), 'HackNerdFont-Regular.ttf'), 'mine');
  const here = await install([...SURFACE, '--round'], { env, home, fetch: () => assert.fail('a font is here') });
  assert.match(here.out, /an icon font is already here; nothing added/u);
  assert.deepEqual(readdirSync(folderOf(home)), ['HackNerdFont-Regular.ttf']);
  await install(['uninstall', '--user', '--yes'], { env, home });
  assert.deepEqual(readdirSync(folderOf(home)), ['HackNerdFont-Regular.ttf']);

  const linked = world(t);
  const elsewhere = join(linked.home, 'elsewhere');
  mkdirSync(elsewhere);
  mkdirSync(join(linked.home, '.local/share'), { recursive: true });
  symlinkSync(elsewhere, folderOf(linked.home));
  const refused = await install([...SURFACE, '--round'], linked);
  assert.equal(refused.code, 0);
  assert.match(refused.last, /^ROUND_ENDS: square \(font not installed \(.* is a link\); /u);
  assert.deepEqual(readdirSync(elsewhere), []);

  const planted = world(t);
  mkdirSync(folderOf(planted.home), { recursive: true });
  symlinkSync(join(planted.home, 'target'), fontOf(planted.home));
  const kept = await install([...SURFACE, '--round'], planted);
  assert.match(kept.last, /font not installed \(something else is at /u);
  assert.ok(!existsSync(join(planted.home, 'target')));
  assert.ok(lstatSync(fontOf(planted.home)).isSymbolicLink());

  const state = world(t);
  mkdirSync(join(state.home, 'real'));
  symlinkSync(join(state.home, 'real'), join(state.home, '.grok'));
  mkdirSync(join(state.home, 'project'));
  const project = await install(['install', '--yes', '--round'], { ...state, home: join(state.home, 'project') });
  assert.equal(project.code, 0);
  assert.match(project.out, /ICON FONT · not installed: Refusing symbolic link/u);
  assert.deepEqual(readdirSync(join(state.home, 'real')), []);
  assert.equal((await install(['install', '--yes', '--glyphs', 'round'], { ...state, home: join(state.home, 'project') })).code, 1);
});

test('a font that cannot be added never stops the install, and says why', async (t) => {
  const damaged = Buffer.from(ARCHIVE);
  damaged[40] ^= 1;
  const cases = [
    [served(damaged), /the archive does not match its pinned SHA-256/u],
    [async () => new Response('', { status: 404 }), /the download answered HTTP 404/u],
    [async () => { throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }); }, /the download failed: ENOTFOUND/u],
    [served(Buffer.alloc(8 * 1024 * 1024 + 1)), /the download is larger than 8 MiB/u],
  ];
  for (const [fetch, why] of cases) {
    const { home, env } = world(t);
    const result = await install([...SURFACE, '--round'], { env, home, fetch });
    assert.equal(result.code, 0);
    assert.match(result.last, why);
    assert.match(result.last, /^ROUND_ENDS: square \(font not installed \(/u);
    assert.match(result.out, /Status: Ready/u);
    assert.ok(!existsSync(fontOf(home)));
    assert.ok(!existsSync(join(home, '.grok/litgrok-icon-font.json')));
  }
  const { home, env } = world(t);
  const other = { ...PINS, files: PINS.files.map((file) => ({ ...file, sha256: '0'.repeat(64) })) };
  const font = await addIconFont({ env, home, platform: 'linux', iconFont: homeFonts, pins: other, fetchFn: served() });
  assert.deepEqual(font, { state: 'failed', why: 'SymbolsNerdFontMono-Regular.ttf does not match its pinned SHA-256' });
});

test('a linked or odd settings file stops --glyphs before any file is written', async (t) => {
  for (const plant of [(path) => symlinkSync('/nowhere', path), (path) => mkdirSync(path)]) {
    const { home, env } = world(t);
    mkdirSync(join(home, '.grok'));
    plant(hudSettingsPath(env));
    const result = await install([...SURFACE, '--glyphs', 'round'], { env, home });
    assert.equal(result.code, 1);
    assert.match(result.out, /Step: SAFETY/u);
    assert.deepEqual(readdirSync(join(home, '.grok')), ['litgrok-hud.json']);
  }
});

test('a write that fails half way leaves nothing in the font folder', async (t) => {
  const { home, env } = world(t);
  const write = (path, bytes, options) => {
    writeFileSync(path, bytes.subarray(0, 10), options);
    throw new Error('no space left');
  };
  const font = await addIconFont({ env, home, platform: 'linux', iconFont: homeFonts, pins: PINS, fetchFn: served(), write });
  assert.deepEqual(font, { state: 'failed', why: 'no space left' });
  assert.deepEqual(readdirSync(folderOf(home)), []);
});

test('a linked parent of the font folder is refused, before the download and after it', async (t) => {
  for (const part of ['.local', '.local/share']) {
    const { home, env } = world(t);
    mkdirSync(join(home, 'elsewhere'));
    if (part !== '.local') mkdirSync(join(home, '.local'));
    symlinkSync(join(home, 'elsewhere'), join(home, part));
    const font = await addIconFont({ env, home, platform: 'linux', iconFont: homeFonts, pins: PINS, fetchFn: () => assert.fail('refused before the download') });
    assert.equal(font.why, `${join(home, part)} is a link`);
    assert.deepEqual(readdirSync(join(home, 'elsewhere')), []);
  }
  const { home, env } = world(t);
  const meanwhile = async () => {
    mkdirSync(join(home, 'elsewhere'));
    symlinkSync(join(home, 'elsewhere'), join(home, '.local'));
    return new Response(ARCHIVE);
  };
  const font = await addIconFont({ env, home, platform: 'linux', iconFont: homeFonts, pins: PINS, fetchFn: meanwhile });
  assert.equal(font.why, `${join(home, '.local')} is a link`);
  assert.deepEqual(readdirSync(join(home, 'elsewhere')), []);

  const placed = world(t);
  const file = async () => {
    mkdirSync(folderOf(placed.home), { recursive: true });
    writeFileSync(fontOf(placed.home), 'mine');
    return new Response(ARCHIVE);
  };
  const late = await addIconFont({ ...placed, platform: 'linux', iconFont: homeFonts, pins: PINS, fetchFn: file });
  assert.match(late.why, /^something else is at /u);
  assert.deepEqual(readdirSync(folderOf(placed.home)), ['SymbolsNerdFontMono-Regular.ttf']);
  assert.equal(readFileSync(fontOf(placed.home), 'utf8'), 'mine');

  const shared = world(t);
  mkdirSync(join(shared.home, 'elsewhere'));
  symlinkSync(join(shared.home, 'elsewhere'), join(shared.home, 'data'));
  const linked = await addIconFont({ env: { ...shared.env, XDG_DATA_HOME: join(shared.home, 'data') }, home: shared.home, platform: 'linux', iconFont: homeFonts, pins: PINS, fetchFn: served() });
  assert.equal(linked.why, `${join(shared.home, 'data')} is a link`);
});

test('a relative XDG_DATA_HOME counts as not set', (t) => {
  const { home, env } = world(t);
  for (const XDG_DATA_HOME of ['data', './data', '']) {
    assert.equal(planIconFont({ env: { ...env, XDG_DATA_HOME }, home, platform: 'linux', iconFont: () => false }).folder, join(home, '.local', 'share', 'fonts'));
  }
  mkdirSync(folderOf(home), { recursive: true });
  writeFileSync(fontOf(home), 'x');
  assert.equal(hasIconFont({ HOME: home, XDG_DATA_HOME: 'data' }, { platform: 'linux' }), true);
});

test('the download ends at 60 seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { home, env } = world(t);
  let signal;
  const hanging = (_url, options) => new Promise((_resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const pending = addIconFont({ env, home, platform: 'linux', iconFont: homeFonts, pins: PINS, fetchFn: hanging });
  t.mock.timers.tick(59_999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, { state: 'failed', why: 'the download took longer than 60 seconds' });
  assert.ok(!existsSync(folderOf(home)));
});

test('LITGROK_ICON_FONT_ARCHIVE names a local copy of the archive', async (t) => {
  const { home, env } = world(t);
  const copy = join(home, 'copy.zip');
  writeFileSync(copy, ARCHIVE);
  const result = await install([...SURFACE, '--round'], { env: { ...env, LITGROK_ICON_FONT_ARCHIVE: copy }, home, fetch: () => assert.fail('the copy is local') });
  assert.equal(result.code, 0);
  assert.ok(existsSync(fontOf(home)));
  const missing = world(t, { LITGROK_ICON_FONT_ARCHIVE: join(home, 'none.zip') });
  assert.match((await install([...SURFACE, '--round'], missing)).last, /LITGROK_ICON_FONT_ARCHIVE is not a file of at most 8 MiB/u);
});

test('on Linux the font cache is refreshed, on macOS the folder is ~/Library/Fonts and Windows gets no font', async (t) => {
  for (const [platform, folder, calls] of [['linux', '.local/share/fonts', 1], ['darwin', 'Library/Fonts', 0]]) {
    const { home, env } = world(t);
    const spawned = [];
    const font = await addIconFont({ env, home, platform, iconFont: () => false, pins: PINS, fetchFn: served(), spawn: (...call) => spawned.push(call) });
    assert.equal(font.state, 'added');
    assert.ok(existsSync(join(home, folder, 'SymbolsNerdFontMono-Regular.ttf')));
    assert.equal(spawned.length, calls);
    if (calls) assert.deepEqual(spawned[0].slice(0, 2), ['fc-cache', ['-f', join(home, folder)]]);
  }
  const { home, env } = world(t);
  assert.deepEqual(await addIconFont({ env, home, platform: 'win32', iconFont: () => false, pins: PINS, fetchFn: () => assert.fail('no font on Windows') }), { state: 'unsupported' });
  assert.deepEqual(readdirSync(home), []);
});

test('--glyphs saves a choice that plain installs keep, and the order is environment, saved, auto', async (t) => {
  const { home, env } = world(t);
  const round = await install([...SURFACE, '--glyphs', 'round'], { env, home });
  assert.equal(round.last, 'ROUND_ENDS: shown');
  assert.equal(readHudSettings(env).glyphs, 'round');
  assert.equal((await install([...SURFACE], { env, home })).last, 'ROUND_ENDS: shown');
  assert.equal((await install(['install', '--user', '--yes', '--round'], { env, home })).last, 'ROUND_ENDS: shown');
  assert.equal((await install(['doctor'], { env: { ...env, CI: '1', SSH_CONNECTION: 'x' }, home })).last, 'ROUND_ENDS: shown');
  assert.equal(drawsRoundCaps({ ...env, SSH_CONNECTION: 'x' }, () => false), true);

  for (const [setting, choice] of [['auto', 'auto'], ['round', 'round'], ['nerd', 'round'], ['square', 'square'], ['basic', 'square'], ['ascii', 'square']]) {
    assert.deepEqual(glyphChoice({ ...env, LITGROK_HUD_GLYPHS: setting }), { choice, from: 'environment' });
  }
  assert.equal(drawsRoundCaps({ ...env, LITGROK_HUD_GLYPHS: 'auto' }, () => false), false);
  assert.equal(drawsRoundCaps({ ...env, LITGROK_HUD_GLYPHS: 'square' }, () => true), false);
  assert.deepEqual(glyphChoice({ ...env, LITGROK_HUD_GLYPHS: 'no such word' }), { choice: 'round', from: 'saved' });

  assert.equal((await install([...SURFACE, '--glyphs', 'square'], { env, home })).last, 'ROUND_ENDS: square (choice is square; rerun the install with --glyphs auto)');
  assert.equal(drawsRoundCaps(env, () => true), false);
  await install([...SURFACE, '--glyphs', 'auto'], { env, home });
  assert.deepEqual(glyphChoice(env), { choice: 'auto', from: 'auto' });

  for (const bad of [['--glyphs'], ['--glyphs', 'nerd'], ['--glyphs', 'round', '--glyphs', 'square']]) {
    assert.equal((await install(['install', ...bad], { env, home })).code, 1, bad.join(' '));
  }
  for (const bad of [['--glyphs', 'round'], ['--round']]) assert.equal((await install(['uninstall', ...bad], { env, home })).code, 1, bad.join(' '));

  writeFileSync(hudSettingsPath(env), '{"schema":"litgrok.hud/v1","glyphs":"rounder"}');
  assert.equal(glyphChoice(env).choice, 'auto');
  rmSync(hudSettingsPath(env));
  symlinkSync(join(home, 'nowhere'), hudSettingsPath(env));
  assert.equal(glyphChoice(env).choice, 'auto');
});

test('--round drops the remembered font answer, also in another temporary folder', async (t) => {
  const { home, env } = world(t);
  assert.equal(rememberedIconFont(() => false, env), false);
  const other = { ...env, LITGROK_HUD_STATE_ROOT: stateRoot(t) };
  assert.equal(rememberedIconFont(() => false, other, Date.now() - 1000), false);
  await install([...SURFACE, '--round'], { env, home });
  assert.equal(rememberedIconFont(() => true, env), true);
  assert.equal(rememberedIconFont(() => true, other, Date.now(), readHudSettings(env).fontCheckedAt), true);
});

test('the installed status line draws the saved choice, also over SSH', async (t) => {
  const { home, env } = world(t);
  const row = () => spawnSync(process.execPath, [join(home, '.grok/hooks/lit-status-line.mjs')], {
    cwd: home, encoding: 'utf8', input: JSON.stringify({ cwd: home, context_window: { used_percentage: 42 } }),
    env: { PATH: process.env.PATH, ...env, LANG: 'en_US.UTF-8', TERM: 'xterm-256color', COLORTERM: 'truecolor', COLUMNS: '100', SSH_CONNECTION: 'x' },
  }).stdout;
  await install(SURFACE, { env, home });
  assert.doesNotMatch(row(), /[\ue0b4\ue0b6]/u);
  await install([...SURFACE, '--glyphs', 'round'], { env, home });
  assert.match(row(), /\ue0b6/u);
  await install(SURFACE, { env, home });
  assert.match(row(), /\ue0b6/u, 'a plain install keeps the choice');
  await install([...SURFACE, '--glyphs', 'square'], { env, home });
  assert.doesNotMatch(row(), /[\ue0b4\ue0b6]/u);
});

test('ROUND_ENDS says shown, ready, check or square with one reason and one fix', async (t) => {
  const { home, env } = world(t);
  const at = (more = {}, { tty = false, font = false, platform = 'linux', tried = null } = {}) => (
    roundEnds({ env: { ...env, ...more }, home, stdout: { isTTY: tty }, platform, iconFont: () => font, font: tried }));
  assert.match(at(), /^ROUND_ENDS: square \(no surface enabled; install --user --status-line /u);
  saveGlyphs(env, home, 'round');
  assert.match(at(), /no surface enabled/u);
  saveGlyphs(env, home, 'auto');
  writeFileSync(join(home, '.grok/config.toml'), '# lit-status-line.mjs\n');
  assert.equal(statusLineOn(join(home, '.grok')), false);
  writeFileSync(join(home, '.grok/config.toml'), '[ui.status_line]\ncommand = "node /x/.grok/hooks/lit-status-line.mjs"\n');

  for (const own of [{ TERM_PROGRAM: 'ghostty' }, { TERM_PROGRAM: 'vscode' }, { WT_SESSION: '1' }, { TERM: 'xterm-kitty' }, { KITTY_WINDOW_ID: '1' }]) {
    assert.equal(at(own), 'ROUND_ENDS: ready in a dark full-colour terminal');
    assert.equal(at(own, { tty: true }), 'ROUND_ENDS: ready');
  }
  assert.match(at({}, { font: true }), /^ROUND_ENDS: check \(an icon font is here, and this terminal may not use it; show your user the pill /u);
  assert.match(at({}, { font: false }), /^ROUND_ENDS: square \(no icon font; rerun the install with --round\)$/u);
  assert.match(at({ SSH_CONNECTION: 'x' }, { font: true }), /^ROUND_ENDS: square \(SSH; /u);
  assert.match(at({}, { platform: 'win32' }), /^ROUND_ENDS: square \(Windows console; /u);
  assert.match(at({}, { tried: { state: 'failed', why: 'offline' } }), /^ROUND_ENDS: square \(font not installed \(offline\); rerun /u);
  for (const [more, reason] of [[{ NO_COLOR: '' }, 'NO_COLOR is set'], [{ TERM: 'dumb' }, 'TERM=dumb'], [{ LITGROK_HUD_COLOR: '256' }, 'fewer colours'], [{ COLORFGBG: '0;15' }, 'light background']]) {
    assert.ok(at(more, { tty: true, font: true }).startsWith(`ROUND_ENDS: square (${reason}; `), reason);
    assert.match(at(more, { font: true }), /^ROUND_ENDS: check/u, reason);
  }
  assert.match(at({ LITGROK_HUD_GLYPHS: 'square' }), /choice is square; unset LITGROK_HUD_GLYPHS/u);
  assert.match(at({ LITGROK_HUD_GLYPHS: 'round' }), /^ROUND_ENDS: check/u);
  saveGlyphs(env, home, 'round');
  assert.equal(at({ SSH_CONNECTION: 'x' }), 'ROUND_ENDS: shown');
});

test('NO_COLOR with --yes installs without colour; without --yes and with --no-color it is a preview', async (t) => {
  for (const value of ['1', '']) {
    const { home, env } = world(t, { NO_COLOR: value });
    const result = await install(['install', '--yes'], { env, home, tty: true });
    assert.equal(result.code, 0);
    assert.match(result.out, /Status: Ready/u);
    assert.doesNotMatch(result.out, /\u001b/u);
    assert.ok(existsSync(join(home, '.grok/rules/00-litgrok.md')));
  }
  for (const [args, more, reason] of [[['install'], { NO_COLOR: '1' }, 'NO COLOR'], [['install', '--yes', '--no-color'], {}, 'NO COLOR'], [['install', '--yes', '--round'], { CI: '1' }, 'NON-INTERACTIVE'], [['install', '--yes', '--dry-run'], {}, 'DRY RUN']]) {
    const { home, env } = world(t, more);
    const result = await install(args, { env, home, tty: true });
    assert.equal(result.last, `Nothing was installed: this was a preview (${reason}).`);
    assert.deepEqual(result.ends, []);
    assert.deepEqual(readdirSync(home), []);
  }
});

test('an install without grok on PATH says so and still installs', async (t) => {
  const { home, env } = world(t);
  const bin = join(home, 'bin');
  const line = /Host: no grok command on PATH; install Grok Build to use LitGrok/u;
  assert.match((await install(['install', '--yes'], { env: { ...env, PATH: bin }, home })).out, line);
  mkdirSync(bin);
  writeFileSync(join(bin, 'grok'), '');
  assert.equal(grokOnPath({ PATH: bin }, 'linux'), true);
  assert.equal(grokOnPath({ PATH: bin }, 'win32'), false);
  assert.doesNotMatch((await install(['install', '--yes'], { env: { ...env, PATH: bin }, home })).out, /Host:/u);
});
