// Read-only views of the pre-warmed motion cache. Nothing here installs, fetches or repairs: a
// render only checks what `litgrok-ai motion-runtime install` wrote (MO-A-42/43).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { cacheRoot, lockHash, sha256, SKILL_ROOT } from './fonts.mjs';

export const PREWARM_COMMAND = 'litgrok-ai motion-runtime install';
export const REQUIRED_DEPS = Object.freeze(['opentype.js', 'ws']);

export function depsDir(env = process.env) { return join(cacheRoot(env), 'node'); }

export function depsState(env = process.env) {
  const dir = depsDir(env);
  const marker = join(dir, '.ready');
  if (!existsSync(marker)) return { state: 'missing', dir, missing: [...REQUIRED_DEPS] };
  if (readFileSync(marker, 'utf8').trim() !== lockHash()) return { state: 'lock mismatch', dir, missing: [...REQUIRED_DEPS] };
  const missing = REQUIRED_DEPS.filter((name) => !existsSync(join(dir, 'node_modules', name, 'package.json')));
  return { state: missing.length ? 'incomplete' : 'ready', dir, missing };
}

export function requireDep(name, env = process.env) {
  return createRequire(join(depsDir(env), 'package.json'))(name);
}

export function opentypeSource(env = process.env) {
  return readFileSync(join(depsDir(env), 'node_modules', 'opentype.js', 'dist', 'opentype.min.js'), 'utf8');
}

// Tier 2 venv (MO-A-54): pinned by the requirements file shipped in the skill. A venv whose
// installed distributions no longer match the pins is reported and never repaired in session.
export const AUDIO_REQUIREMENTS = join(SKILL_ROOT, 'requirements-audio.txt');
// Pins that apply to the venv's interpreter: `python_full_version >= 'X.Y'` and
// `implementation_name != 'PyPy'` are the only markers uv emits for this file.
export function audioPins(pythonVersion = '3.12.0') {
  const pins = new Map();
  const [major, minor] = pythonVersion.split('.').map(Number);
  for (const line of readFileSync(AUDIO_REQUIREMENTS, 'utf8').split('\n')) {
    const match = line.match(/^([A-Za-z0-9_.-]+)==([^\s;\\]+)\s*(?:;\s*(.*?))?\s*\\?$/);
    if (!match) continue;
    const marker = match[3] ?? '';
    const floor = marker.match(/python_full_version >= '(\d+)\.(\d+)'/);
    if (floor && (major < Number(floor[1]) || (major === Number(floor[1]) && minor < Number(floor[2])))) continue;
    pins.set(match[1].toLowerCase().replace(/[-_.]+/g, '-'), match[2]);
  }
  return pins;
}
export function audioVenvDir(env = process.env) { return join(cacheRoot(env), 'audio-venv'); }
export function audioPython(env = process.env) {
  const dir = audioVenvDir(env);
  return process.platform === 'win32' ? join(dir, 'Scripts', 'python.exe') : join(dir, 'bin', 'python');
}

function sitePackages(dir) {
  const lib = join(dir, 'lib');
  if (existsSync(join(dir, 'Lib', 'site-packages'))) return join(dir, 'Lib', 'site-packages');
  if (!existsSync(lib)) return null;
  const python = readdirSync(lib).find((name) => name.startsWith('python'));
  return python ? join(lib, python, 'site-packages') : null;
}

export function audioState(env = process.env) {
  const dir = audioVenvDir(env);
  if (!existsSync(join(dir, '.ready'))) return { state: 'absent', dir };
  let marker;
  try { marker = JSON.parse(readFileSync(join(dir, '.ready'), 'utf8')); } catch { return { state: 'pin mismatch', dir, detail: 'unreadable ready marker' }; }
  if (marker.requirements !== sha256(readFileSync(AUDIO_REQUIREMENTS))) return { state: 'pin mismatch', dir, detail: 'requirements file changed since the venv was built' };
  const site = sitePackages(dir);
  if (!site || !existsSync(audioPython(env))) return { state: 'pin mismatch', dir, detail: 'venv interpreter or site-packages missing' };
  const installed = new Map();
  for (const entry of readdirSync(site)) {
    const match = entry.match(/^(.+?)-([^-]+)\.dist-info$/);
    if (match) installed.set(match[1].toLowerCase().replace(/[-_.]+/g, '-'), match[2]);
  }
  const drift = [...audioPins(marker.python)].filter(([name, version]) => installed.get(name) !== version).map(([name, version]) => `${name}==${version} (found ${installed.get(name) ?? 'none'})`);
  return drift.length ? { state: 'pin mismatch', dir, detail: drift.slice(0, 4).join(', ') } : { state: 'ready', dir };
}

// Tier 3 (MO-A-21): the pinned model table. A model without a verified revision and a
// commercial-use licence is not installable; the install fails closed before any download.
export const WORD_TIMING_MODELS = Object.freeze([
  { role: 'multilingual transcription (Korean-capable)', id: 'openai/whisper-small', revision: null, licence: null, sizeMB: null },
  { role: 'Korean forced alignment', id: null, revision: null, licence: null, sizeMB: null },
]);
export function wordTimingDir(env = process.env) { return join(cacheRoot(env), 'word-timing'); }
export function wordTimingState(env = process.env) {
  const ready = existsSync(join(wordTimingDir(env), '.ready'));
  return ready ? { state: 'ready' } : { state: 'absent' };
}
