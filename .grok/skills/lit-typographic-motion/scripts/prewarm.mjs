#!/usr/bin/env node
// `litgrok-ai motion-runtime install|status [--audio] [--word-timing]` (MO-A-42/44/53/54/55).
// install is the only step that touches the network: pinned npm deps via `npm ci`, pinned fonts and
// licence files by URL + sha256, and (opt-in) the hash-pinned librosa venv. `litgrok-ai install`
// stays copy-only; a render never installs, fetches or repairs anything.
import { spawnSync } from 'node:child_process';
import { closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cacheRoot, fontPath, fontState, licencePath, lockHash, LOCKFILE, PINS, sha256, SKILL_ROOT } from './lib/fonts.mjs';
import { AUDIO_REQUIREMENTS, audioState, audioVenvDir, depsDir, depsState, PREWARM_COMMAND, WORD_TIMING_MODELS, wordTimingState } from './lib/cache.mjs';
import { isSoftwareRenderer, openRenderer, resolveChrome, UNKNOWN_RENDERER } from './lib/chrome.mjs';
import { findTool, previewRung } from './lib/render.mjs';

export const RUNTIME_USAGE = `Usage: litgrok-ai motion-runtime install|status [--audio] [--word-timing]
  install        npm ci the pinned engine deps and fetch the pinned fonts into the motion cache
  install --audio        also build the hash-pinned librosa venv (Tier 2 beat grid)
  install --word-timing  state the model sizes and pins; fails closed while a pin is unverified
  status         print the five pre-render probes (Chrome, ffmpeg, WebGL2, software GL, pre-warm)
Cache: \${XDG_CACHE_HOME:-~/.cache}/litgrok/motion-runtime (LITGROK_MOTION_CACHE overrides)
`;

// Fetch source: the pinned URL, or a local mirror directory/URL (LITGROK_MOTION_FONT_MIRROR) that
// serves the same files by name. The sha256 pin is checked either way before anything is kept.
async function fetchPinned(url, name, expected, env) {
  const mirror = env.LITGROK_MOTION_FONT_MIRROR;
  const source = mirror ? (/^[a-z]+:\/\//i.test(mirror) ? `${mirror.replace(/\/$/, '')}/${name}` : pathToFileURL(join(mirror, name)).href) : url;
  let bytes;
  if (source.startsWith('file:')) {
    const path = fileURLToPath(source);
    if (!existsSync(path)) throw new Error(`${name}: not in mirror ${mirror}`);
    bytes = readFileSync(path);
  } else {
    const response = await fetch(source, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status} from ${source}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${name}: sha256 ${actual} does not match pin ${expected}; nothing written`);
  return bytes;
}

function writeAtomic(target, bytes) {
  writeFileSync(`${target}.partial`, bytes);
  renameSync(`${target}.partial`, target);
}

function withLock(root, action) {
  mkdirSync(root, { recursive: true });
  const lock = join(root, 'install.lock');
  let fd;
  try { fd = openSync(lock, 'wx'); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`another motion-runtime install holds ${lock}; wait for it, or remove the lock if no install is running`);
    throw error;
  }
  const release = () => { closeSync(fd); rmSync(lock, { force: true }); };
  return action().finally(release);
}

export async function installDeps(env, out = []) {
  const state = depsState(env);
  if (state.state === 'ready') { out.push(`deps: ready (${state.dir})`); return; }
  const root = cacheRoot(env);
  const staging = mkdtempSync(join(root, 'node-'));
  try {
    copyFileSync(join(SKILL_ROOT, 'package.json'), join(staging, 'package.json'));
    copyFileSync(LOCKFILE, join(staging, 'package-lock.json'));
    const npm = spawnSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', staging], { encoding: 'utf8', env: { ...env, npm_config_update_notifier: 'false' }, timeout: 300000 });
    if (npm.error || npm.status !== 0) throw new Error(`npm ci failed: ${(npm.stderr || npm.error?.message || '').trim().split('\n').filter(Boolean).at(-1) ?? npm.status}`);
    writeFileSync(join(staging, '.ready'), lockHash());
    rmSync(depsDir(env), { recursive: true, force: true });
    renameSync(staging, depsDir(env));
    out.push(`deps: installed opentype.js and ws from the pinned lockfile (${depsDir(env)})`);
  } finally { rmSync(staging, { recursive: true, force: true }); }
}

async function installFonts(env, out) {
  const dir = join(cacheRoot(env), 'fonts');
  mkdirSync(dir, { recursive: true });
  for (const [key, pin] of Object.entries(PINS.fonts)) {
    if (pin.source !== 'fetched') continue;
    if (pin.onlyWhenMissing && pin.onlyWhenMissing.every((reused) => existsSync(fontPath(reused, env)))) continue;
    const target = fontPath(key, env);
    if (!(existsSync(target) && sha256(readFileSync(target)) === pin.sha256)) writeAtomic(target, await fetchPinned(pin.url, pin.file, pin.sha256, env));
    for (const licence of pin.licence) {
      const file = licencePath(licence, pin, env);
      if (!(existsSync(file) && sha256(readFileSync(file)) === licence.sha256)) writeAtomic(file, await fetchPinned(licence.url, licence.file, licence.sha256, env));
    }
    out.push(`font: ${pin.family} ready (${pin.file}, sha256 verified, licence cached)`);
  }
}

function venvPython(env) {
  for (const candidate of ['python3.12', 'python3.13', 'python3.11']) {
    const found = findTool(candidate, env);
    if (found) return { command: found, args: ['-m', 'venv'] };
  }
  return null;
}

async function installAudio(env, out) {
  const state = audioState(env);
  if (state.state === 'ready') { out.push(`audio venv: ready (${state.dir})`); return; }
  const dir = audioVenvDir(env);
  rmSync(dir, { recursive: true, force: true });
  const uv = findTool('uv', env);
  const python = venvPython(env);
  let created;
  if (uv) created = spawnSync(uv, ['venv', '--seed', '--python', '3.12', dir], { encoding: 'utf8', env });
  else if (python) created = spawnSync(python.command, [...python.args, dir], { encoding: 'utf8' });
  else throw new Error('no uv and no python3.11-3.13 found to create the audio venv');
  if (created.status !== 0) throw new Error(`venv creation failed: ${(created.stderr || '').trim().split('\n').at(-1)}`);
  const pip = spawnSync(join(dir, 'bin', 'python'), ['-m', 'pip', 'install', '--disable-pip-version-check', '--require-hashes', '--only-binary=:all:', '-r', AUDIO_REQUIREMENTS], { encoding: 'utf8', timeout: 900000 });
  if (pip.status !== 0) { rmSync(dir, { recursive: true, force: true }); throw new Error(`pip install --require-hashes failed: ${(pip.stderr || '').trim().split('\n').filter(Boolean).at(-1)}`); }
  const version = spawnSync(join(dir, 'bin', 'python'), ['-c', 'import platform; print(platform.python_version())'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(join(dir, '.ready'), JSON.stringify({ requirements: sha256(readFileSync(AUDIO_REQUIREMENTS)), python: version }));
  out.push(`audio venv: librosa installed from ${AUDIO_REQUIREMENTS} with --require-hashes (${dir})`);
}

function wordTimingStatement() {
  const lines = ['word-timing models (Tier 3, opt-in):'];
  for (const model of WORD_TIMING_MODELS) {
    lines.push(`  ${model.role}: id ${model.id ?? 'UNPINNED'}, revision ${model.revision ?? 'UNPINNED'}, licence ${model.licence ?? 'UNVERIFIED'}, download ${model.sizeMB ? `${model.sizeMB} MB` : 'size not pinned'}`);
  }
  return lines;
}

export async function install(args, env = process.env, stdout = process.stdout) {
  const out = [];
  if (args.includes('--word-timing')) {
    for (const line of wordTimingStatement()) stdout.write(`${line}\n`);
    const unpinned = WORD_TIMING_MODELS.filter((model) => !model.id || !model.revision || !model.licence || /non-?commercial|nc\b/i.test(model.licence ?? ''));
    if (unpinned.length) {
      stdout.write(`word-timing: FAILED CLOSED before any download — ${unpinned.length} model pin(s) lack a verified id, revision or commercial-use licence (${unpinned.map((m) => m.role).join('; ')}). Tier 3 stays unavailable; renders requesting --word-timing exit 14.\n`);
      return 14;
    }
  }
  const root = cacheRoot(env);
  await withLock(root, async () => {
    await installDeps(env, out);
    await installFonts(env, out);
    if (args.includes('--audio')) await installAudio(env, out);
  });
  for (const line of out) stdout.write(`${line}\n`);
  stdout.write(`motion-runtime ready: ${root}\n`);
  return 0;
}

// MO-A-44: five probes on every run, in the installer's receipt-line style.
export async function status(args, env = process.env, stdout = process.stdout) {
  const lines = ['  ╭─ MOTION RUNTIME'];
  const chrome = resolveChrome(env);
  const version = chrome ? (spawnSync(chrome, ['--version'], { encoding: 'utf8', timeout: 15000 }).stdout || '').trim() : '';
  lines.push(`  │ Chrome: ${chrome ? `${chrome} (${version || 'version unreadable'})` : 'not found on PATH / not installed (set CHROME_PATH)'}`);
  const ffmpeg = findTool('ffmpeg', env);
  const ffmpegVersion = ffmpeg ? (spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' }).stdout || '').split('\n')[0] : '';
  const rung = previewRung(env);
  lines.push(`  │ ffmpeg: ${ffmpeg ? `${ffmpeg} — ${ffmpegVersion}; preview encoder ${rung}` : `not found on PATH (stills and sheet still work${rung === 'img2webp' ? '; img2webp present' : ''})`}`);
  let renderer = null;
  let probeError = null;
  if (chrome) {
    const profileDir = mkdtempSync(join(tmpdir(), 'litgrok-motion-probe-'));
    try {
      const probe = await openRenderer({ executable: chrome, profileDir });
      renderer = probe.renderer;
      lines.push(`  │ WebGL2 renderer: ${renderer} (flags: ${probe.flags.slice(0, 1).join(' ')})`);
      await probe.close();
    } catch (error) { probeError = error.message; lines.push(`  │ WebGL2 renderer: no WebGL2 context obtainable (${error.message})`); }
    finally { rmSync(profileDir, { recursive: true, force: true }); }
  } else lines.push('  │ WebGL2 renderer: no WebGL2 context obtainable (not even software): Chrome not found');
  if (renderer === UNKNOWN_RENDERER) lines.push('  │ Software GL: renderer type unknown — debug-info extension unavailable');
  else if (renderer && isSoftwareRenderer(renderer)) lines.push(`  │ Software GL: software GL detected (${renderer}); renders will be slower, --samples lowered automatically`);
  else lines.push(`  │ Software GL: ${renderer ? 'none (real GPU)' : `unknown (${probeError ?? 'no renderer'})`}`);
  const deps = depsState(env);
  const fonts = Object.keys(PINS.fonts).filter((key) => !PINS.fonts[key].onlyWhenMissing).map((key) => fontState(key, env)).filter((font) => font.state !== 'ready');
  const audio = audioState(env);
  const words = wordTimingState(env);
  const missing = [...(deps.state === 'ready' ? [] : [`deps ${deps.missing.join(', ')} (${deps.state})`]), ...fonts.map((font) => `${PINS.fonts[font.resolved].family} (${font.state})`)];
  lines.push(`  │ Pre-warm: ${missing.length ? `MISSING ${missing.join('; ')} — fix: ${PREWARM_COMMAND}` : `ready (lock ${lockHash().slice(0, 16)}, ${cacheRoot(env)})`}`);
  lines.push(`  │ Audio tier: ${audio.state === 'ready' ? 'librosa venv ready' : `venv ${audio.state}${audio.detail ? ` (${audio.detail})` : ''} — Tier 2 degrades to Tier 1; fix: ${PREWARM_COMMAND} --audio`}`);
  lines.push(`  │ Word timing: ${words.state === 'ready' ? 'models ready' : `models absent — ${PREWARM_COMMAND} --word-timing (fails closed while a pin is unverified)`}`);
  lines.push('  ╰─');
  stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

export async function runMotionRuntime(args, { env = process.env, stdout = process.stdout, stderr = process.stderr } = {}) {
  const [command, ...flags] = args;
  if (!command || command === '--help' || command === '-h') { stdout.write(RUNTIME_USAGE); return command ? 0 : 2; }
  if (flags.some((flag) => !['--audio', '--word-timing'].includes(flag)) || !['install', 'status'].includes(command)) { stderr.write(RUNTIME_USAGE); return 2; }
  try {
    return command === 'install' ? await install(flags, env, stdout) : await status(flags, env, stdout);
  } catch (error) {
    stderr.write(`motion-runtime ${command} failed: ${error.message}\n`);
    return 1;
  }
}

const invoked = process.argv[1] ? (() => { try { return realpathSync(process.argv[1]); } catch { return null; } })() : null;
if (invoked && invoked === realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = await runMotionRuntime(process.argv.slice(2));
}
