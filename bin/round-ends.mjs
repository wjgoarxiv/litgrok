// The opt-in part of an install that makes the status row's ends round: `--round` adds one small icon font when none
// is here, `--glyphs` saves the user's choice, and ROUND_ENDS says what to expect. Beside the `.grok` tree these are the
// installer's only writes: two font files in the user's own font folder, and the manifest and the choice in `~/.grok`.

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, linkSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, delimiter, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { HUD_SETTINGS_SCHEMA, drawsOwnCaps, glyphChoice, hasIconFont, hudSettingsPath, readHudSettings } from '../.grok/hooks/lit-caps.mjs';
import { forgetIconFont } from '../.grok/hooks/litgrok-hud-state.mjs';
import { statusLineOn } from './status-line-config.mjs';

export const ICON_FONT = Object.freeze({
  release: 'v3.5.1',
  url: 'https://github.com/ryanoasis/nerd-fonts/releases/download/v3.5.1/NerdFontsSymbolsOnly.zip',
  archiveSha256: 'fdca3682534f6f65e1ccb2345b0362ccf67d9b8eca7c8025330946e93e2473bc',
  files: Object.freeze([
    Object.freeze({ entry: 'SymbolsNerdFontMono-Regular.ttf', name: 'SymbolsNerdFontMono-Regular.ttf', sha256: 'fe471e538392f51910faab985fa8e192a39dd3426125edd15b71b3680df0e749' }),
    Object.freeze({ entry: 'LICENSE', name: 'SymbolsNerdFontMono-LICENSE.txt', sha256: '84a7a98c82140fb12c37fe42b93805baa16024cb3e5acc599b7ffe612c55d847' }),
  ]),
});
// A local copy of the pinned archive, for offline installs. It has to match the same SHA-256.
export const ARCHIVE_VARIABLE = 'LITGROK_ICON_FONT_ARCHIVE';
const ARCHIVE_LIMIT = 8 * 1024 * 1024;
const DOWNLOAD_MS = 60_000;
const ENTRY_LIMIT = 32 * 1024 * 1024;
const MANIFEST_SCHEMA = 'litgrok.icon-font/v1';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestPath = (home) => join(home, '.grok', 'litgrok-icon-font.json');

function statusOf(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

/** Why `~/.grok` cannot hold LitGrok's own files, or null. */
export function unsafeStateFolder(home) {
  const folder = join(home, '.grok');
  const status = statusOf(folder);
  if (status?.isSymbolicLink()) return `Refusing symbolic link: ${folder}`;
  if (status && !status.isDirectory()) return `Refusing non-directory path: ${folder}`;
  return null;
}

function writeState(home, path, value) {
  const unsafe = unsafeStateFolder(home);
  if (unsafe) throw new Error(unsafe);
  const status = statusOf(path);
  if (status && !status.isFile()) throw new Error(`Refusing to replace ${path}`);
  mkdirSync(dirname(path), { recursive: true });
  const staging = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(staging, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(staging, path);
  } finally {
    rmSync(staging, { force: true });
  }
}

function saveSettings(env, home, change) {
  const { glyphs, fontCheckedAt } = { ...readHudSettings({ ...env, HOME: home }), ...change };
  writeState(home, hudSettingsPath({ ...env, HOME: home }), { schema: HUD_SETTINGS_SCHEMA, glyphs, ...(fontCheckedAt ? { fontCheckedAt } : {}) });
}

/** Why the choice of ends cannot be saved, or null. Asked before an install writes its first file. */
export function unsafeSettings(env, home) {
  const unsafe = unsafeStateFolder(home);
  if (unsafe) return unsafe;
  const path = hudSettingsPath({ ...env, HOME: home });
  const status = statusOf(path);
  return status && !status.isFile() ? `Refusing to replace ${path}` : null;
}

export function saveGlyphs(env, home, glyphs) {
  saveSettings(env, home, { glyphs });
}

function userFontFolder({ env, home, platform }) {
  if (platform === 'win32') return null;
  if (platform === 'darwin') return join(home, 'Library', 'Fonts');
  // The XDG rule: a relative folder there counts as not set.
  return join(isAbsolute(env.XDG_DATA_HOME ?? '') ? env.XDG_DATA_HOME : join(home, '.local', 'share'), 'fonts');
}

/** What `--round` would do here: nothing ('here', 'unsupported'), or add these files. Reads names only. */
export function planIconFont({ env, home, platform = process.platform, iconFont = hasIconFont, pins = ICON_FONT }) {
  const folder = userFontFolder({ env, home, platform });
  if (folder === null) return { state: 'unsupported' };
  if (iconFont({ ...env, HOME: home }, { platform })) return { state: 'here' };
  return { state: 'add', folder, paths: pins.files.map(({ name }) => join(folder, name)), manifest: manifestPath(home) };
}

// The wanted files of a zip archive (stored or deflated), found through its central directory.
function unpack(archive, wanted) {
  let end = archive.length - 22;
  while (end >= 0 && archive.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error('the archive is not a zip file');
  const files = new Map();
  let at = archive.readUInt32LE(end + 16);
  for (let left = archive.readUInt16LE(end + 10); left > 0; left -= 1) {
    if (archive.readUInt32LE(at) !== 0x02014b50) throw new Error('the archive is damaged');
    const nameEnd = at + 46 + archive.readUInt16LE(at + 28);
    const name = archive.toString('utf8', at + 46, nameEnd);
    if (wanted.includes(name)) {
      const local = archive.readUInt32LE(at + 42);
      const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
      const bytes = archive.subarray(start, start + archive.readUInt32LE(at + 20));
      const method = archive.readUInt16LE(at + 10);
      if (method !== 0 && method !== 8) throw new Error(`${name} is packed in an unknown way`);
      files.set(name, method === 0 ? bytes : inflateRawSync(bytes, { maxOutputLength: ENTRY_LIMIT }));
    }
    at = nameEnd + archive.readUInt16LE(at + 30) + archive.readUInt16LE(at + 32);
  }
  return files;
}

async function download(url, fetchFn) {
  const controller = new AbortController();
  const late = new Error('the download took longer than 60 seconds');
  const timer = setTimeout(() => controller.abort(late), DOWNLOAD_MS);
  try {
    const response = await fetchFn(url, { redirect: 'follow', signal: controller.signal });
    if (!response.ok) throw new Error(`the download answered HTTP ${response.status}`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > ARCHIVE_LIMIT) throw new Error('the download is larger than 8 MiB');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    if (controller.signal.aborted) throw late;
    throw /^the download /u.test(error?.message ?? '') ? error : new Error(`the download failed: ${error?.cause?.code ?? error?.message ?? error}`);
  } finally {
    clearTimeout(timer);
  }
}

async function pinnedFiles({ env, pins, fetchFn }) {
  const local = env[ARCHIVE_VARIABLE];
  let archive;
  if (local) {
    const status = statusOf(local);
    if (!status?.isFile() || status.size > ARCHIVE_LIMIT) throw new Error(`${ARCHIVE_VARIABLE} is not a file of at most 8 MiB`);
    archive = readFileSync(local);
  } else {
    archive = await download(pins.url, fetchFn);
  }
  if (digest(archive) !== pins.archiveSha256) throw new Error('the archive does not match its pinned SHA-256');
  const files = unpack(archive, pins.files.map(({ entry }) => entry));
  for (const { entry, sha256 } of pins.files) {
    if (!files.has(entry) || digest(files.get(entry)) !== sha256) throw new Error(`${entry} does not match its pinned SHA-256`);
  }
  return files;
}

function ownedFiles(home, pins = ICON_FONT) {
  try {
    const path = manifestPath(home);
    if (!lstatSync(path).isFile()) return [];
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    if (manifest?.schema !== MANIFEST_SCHEMA || !Array.isArray(manifest.files)) return [];
    const names = new Set(pins.files.map(({ name }) => name));
    return manifest.files.filter(({ path: file, sha256 } = {}) => typeof file === 'string' && isAbsolute(file) && names.has(basename(file)) && typeof sha256 === 'string');
  } catch {
    return [];
  }
}

function holds(path, sha256) {
  const status = statusOf(path);
  return Boolean(status?.isFile()) && digest(readFileSync(path)) === sha256;
}

// A hard link claims the name, so a file that appears meanwhile is never replaced and a link is never written through.
function claim(path, bytes, write) {
  const staging = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    write(staging, bytes, { flag: 'wx', mode: 0o644 });
    linkSync(staging, path);
  } finally {
    rmSync(staging, { force: true });
  }
}

// Throws for a link or a non-folder on the way to the font folder, below the home folder or from the XDG data folder on.
function refuseUnsafeTarget({ folder, paths }, home) {
  const unsafe = unsafeStateFolder(home);
  if (unsafe) throw new Error(unsafe);
  const target = resolve(folder);
  const stop = target.startsWith(`${resolve(home)}${sep}`) ? resolve(home) : dirname(dirname(target));
  for (let path = target; path !== stop; path = dirname(path)) {
    const status = statusOf(path);
    if (status && !status.isDirectory()) throw new Error(`${path} is ${status.isSymbolicLink() ? 'a link' : 'not a folder'}`);
  }
  if (statusOf(paths[0])) throw new Error(`something else is at ${paths[0]}`);
}

/** Adds the pinned font when no icon font is here. Never throws: a failure is `{ state: 'failed', why }`. */
export async function addIconFont({ env, home, platform = process.platform, iconFont = hasIconFont, pins = ICON_FONT, fetchFn = globalThis.fetch, spawn = spawnSync, write = writeFileSync, now = () => new Date() }) {
  const added = [];
  let recorded = false;
  try {
    const plan = planIconFont({ env, home, platform, iconFont, pins });
    if (plan.state === 'add') {
      refuseUnsafeTarget(plan, home);
      const files = await pinnedFiles({ env, pins, fetchFn });
      // The download takes time, and the folders can have changed meanwhile.
      refuseUnsafeTarget(plan, home);
      const owned = ownedFiles(home, pins);
      mkdirSync(plan.folder, { recursive: true });
      const record = owned.filter(({ path }) => !plan.paths.includes(path));
      for (const { entry, name, sha256 } of pins.files) {
        const path = join(plan.folder, name);
        if (statusOf(path) === null) {
          claim(path, files.get(entry), write);
          added.push(path);
          record.push({ path, sha256 });
        } else if (owned.some((file) => file.path === path && file.sha256 === sha256) && holds(path, sha256)) record.push({ path, sha256 });
      }
      writeState(home, manifestPath(home), { schema: MANIFEST_SCHEMA, release: pins.release, files: record });
      recorded = true;
      if (platform !== 'darwin') spawn('fc-cache', ['-f', plan.folder], { env, stdio: 'ignore', timeout: DOWNLOAD_MS });
    }
    forgetIconFont({ ...env, HOME: home });
    if (plan.state !== 'unsupported') saveSettings(env, home, { fontCheckedAt: now().toISOString() });
    return plan.state === 'add' ? { state: 'added', paths: added } : { state: plan.state };
  } catch (error) {
    if (recorded) return { state: 'added', paths: added };
    // A font the manifest does not name could never be removed again.
    for (const path of added) rmSync(path, { force: true });
    return { state: 'failed', why: error instanceof Error ? error.message : String(error) };
  }
}

/** The font files the manifest owns and nobody changed. */
export function removableFont(home) {
  if (unsafeStateFolder(home)) return [];
  return ownedFiles(home).filter(({ path, sha256 }) => holds(path, sha256)).map(({ path }) => path);
}

export function removeIconFont(env, home) {
  if (unsafeStateFolder(home)) return [];
  const removed = removableFont(home);
  for (const path of removed) unlinkSync(path);
  if (statusOf(manifestPath(home))?.isFile()) unlinkSync(manifestPath(home));
  if (removed.length > 0) forgetIconFont({ ...env, HOME: home });
  return removed;
}

export function removeHudSettings(env, home) {
  const path = hudSettingsPath({ ...env, HOME: home });
  if (statusOf(path)?.isFile()) unlinkSync(path);
}

/** What the user can expect, and the one thing to do about it. `font` is what `--round` did in this run, if it ran. */
export function roundEnds({ env, home, stdout, platform = process.platform, iconFont = hasIconFont, font = null }) {
  const terminal = Boolean(stdout?.isTTY);
  const square = (reason, fix) => `ROUND_ENDS: square (${reason}; ${fix})`;
  const look = { ...env, HOME: home };
  if (!statusLineOn(join(home, '.grok'))) return square('no surface enabled', 'install --user --status-line adds the LIT status row');
  const { choice, from } = glyphChoice(look);
  if (choice === 'square') return square('choice is square', from === 'environment' ? 'unset LITGROK_HUD_GLYPHS' : 'rerun the install with --glyphs auto');
  // An agent's shell says nothing about the window its user looks at.
  if (terminal) {
    if (Object.hasOwn(env, 'NO_COLOR')) return square('NO_COLOR is set', 'unset it where Grok Build starts');
    if (/^dumb$/iu.test(env.TERM ?? '')) return square('TERM=dumb', 'use a full terminal');
    if (['0', '16', '256'].includes(env.LITGROK_HUD_COLOR)) return square('fewer colours', 'unset LITGROK_HUD_COLOR');
    if (/(?:^|;)(?:7|15)$/u.test(env.COLORFGBG ?? '')) return square('light background', 'use a dark terminal theme');
  }
  if (choice === 'round') {
    return from === 'saved' ? 'ROUND_ENDS: shown' : 'ROUND_ENDS: check (LITGROK_HUD_GLYPHS says round; show your user the pill from install --agent)';
  }
  if (drawsOwnCaps(env)) return `ROUND_ENDS: ready${terminal ? '' : ' in a dark full-colour terminal'}`;
  if (env.SSH_CONNECTION) return square('SSH', 'rerun the install with --glyphs round if the pill from install --agent looks round');
  if (iconFont(look, { platform })) return 'ROUND_ENDS: check (an icon font is here, and this terminal may not use it; show your user the pill from install --agent)';
  if (platform === 'win32') return square('Windows console', 'open Grok Build in Windows Terminal');
  if (font?.state === 'failed') return square(`font not installed (${font.why})`, 'rerun the install with --round');
  return square('no icon font', 'rerun the install with --round');
}

/** Whether a `grok` command is on PATH. Nothing is started. */
export function grokOnPath(env, platform = process.platform) {
  const names = platform === 'win32' ? ['grok.exe', 'grok.cmd', 'grok.bat', 'grok.ps1'] : ['grok'];
  return (env.PATH ?? env.Path ?? '').split(delimiter).some((folder) => folder !== '' && names.some((name) => existsSync(join(folder, name))));
}
