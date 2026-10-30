// The short ground-rules section inside the owned user rule, and the project file lit-init asks for.
// Only the bytes between the markers are rewritten. A symlink, a non-file, or a broken marker pair is refused.

import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, constants, copyFileSync, lstatSync, mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GROUND_MAX_BYTES = 1200;
export const GROUND_RULE = 'rules/00-litgrok.md';
export const PROJECT_RULE = '10-litgrok-ground.md';

const START_PREFIX = '<!-- litfamily:litgrok:start';
const END_MARKER = '<!-- litfamily:litgrok:end -->';
const START_LINE = /^<!-- litfamily:litgrok:start v=(\S+)((?: [a-z]+=[0-9a-f]*)*) -->/u;
const SETTING = 'litgrok-ground.json';
const SETTING_SCHEMA = 'litgrok.ground/v1';
const MANIFEST = '.litgrok-install-manifest.json';
const MANIFEST_SCHEMA = 'litgrok.install-manifest/v1';
const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GROUND_USAGE = 'Usage: litgrok ground on|off|status\n       litgrok ground project [--dir <path>] [--remove] [--dry-run]\n';

const PROJECT_BODY = `## LitGrok project rules

This repo is worked with LitGrok: lit-plan, start-work and review-work.

- Plans live in \`plans/\`. The session handoff lives in \`.handoff/HANDOFF.md\`, or in \`HANDOFF.md\` outside a Git repo. Run notes stay in \`.grok/litgrok/\` and out of commits. Read the handoff and the active plan before resuming.
- Never push, publish, tag or bump a version unless the user explicitly says yes to that action.
- Pair a behavior change with a test that failed first, and check the changed surface for real before calling work done.`;

export function packageVersion() {
  const version = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
  return typeof version === 'string' && version.length > 0 ? version : '0.0.0';
}

function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

function occurrences(text, needle) {
  const found = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) found.push(at);
  return found;
}

class GroundMarkError extends Error {}

function locate(text) {
  const starts = occurrences(text, START_PREFIX);
  const ends = occurrences(text, END_MARKER);
  if (starts.length === 0 && ends.length === 0) return null;
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) throw new GroundMarkError('malformed ground-rule markers');
  const head = START_LINE.exec(text.slice(starts[0]));
  if (!head || head.index !== 0) throw new GroundMarkError('malformed ground-rule markers');
  const end = ends[0] + END_MARKER.length;
  const attrs = Object.fromEntries(head[2].trim().split(' ').filter(Boolean).map((pair) => pair.split('=')));
  return {
    start: starts[0],
    end,
    version: head[1],
    pre: attrs.pre ? Buffer.from(attrs.pre, 'hex').toString('utf8') : '',
    created: attrs.new === '1',
  };
}

function render({ version, body }, eol, { pre, created }) {
  const preAttr = pre ? ` pre=${Buffer.from(pre, 'utf8').toString('hex')}` : '';
  const newAttr = created ? ' new=1' : '';
  return [
    `${START_PREFIX} v=${version}${preAttr}${newAttr} -->`,
    ...String(body).replace(/\r?\n$/u, '').split(/\r?\n/u),
    END_MARKER,
  ].join(eol);
}

export function inspectGround(text) {
  try {
    const span = locate(text);
    return span
      ? { state: 'present', version: span.version, created: span.created }
      : { state: 'absent', version: null, created: false };
  } catch {
    return { state: 'malformed', version: null, created: false };
  }
}

export function upsertGround(text, { version, body, created = false }) {
  const eol = eolOf(text);
  const span = locate(text);
  if (span) {
    const rendered = render({ version, body }, eol, span);
    const next = `${text.slice(0, span.start)}${rendered}${text.slice(span.end)}`;
    return { text: next, changed: next !== text };
  }
  const pre = text === '' ? '' : `${text.endsWith('\n') || text.endsWith('\r\n') ? '' : eol}${eol}`;
  return { text: `${text}${pre}${render({ version, body }, eol, { pre, created })}${eol}`, changed: true };
}

export function removeGround(text) {
  const span = locate(text);
  if (!span) return { text, changed: false, created: false };
  let before = text.slice(0, span.start);
  let after = text.slice(span.end);
  const eol = after.startsWith('\r\n') ? '\r\n' : after.startsWith('\n') ? '\n' : '';
  after = after.slice(eol.length);
  if (span.pre && before.endsWith(span.pre)) before = before.slice(0, -span.pre.length);
  return { text: `${before}${after}`, changed: true, created: span.created };
}

function extractBody(text, span) {
  const eol = eolOf(text.slice(span.start, span.end));
  const lines = text.slice(span.start, span.end).split(eol);
  return lines.slice(1, -1).join(eol);
}

export function packagedGround() {
  const text = readFileSync(join(PACKAGE_ROOT, '.grok', 'rules', '00-litgrok.md'), 'utf8');
  const span = locate(text);
  if (!span) throw new GroundMarkError('packaged user rule has no ground section');
  return { version: span.version, body: extractBody(text, span) };
}

export function addedGroundBytes(text) {
  const removed = removeGround(text);
  if (!removed.changed) return 0;
  return Buffer.byteLength(text) - Buffer.byteLength(removed.text);
}

function readUtf8(path) {
  const bytes = readFileSync(path);
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}

function writeAtomic(path, text) {
  let mode = null;
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${path}`);
    if (!stat.isFile()) throw new Error(`Refusing non-directory path: ${path}`);
    mode = stat.mode & 0o777;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const staging = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(staging, text, { flag: 'wx' });
    if (mode !== null) chmodSync(staging, mode);
    renameSync(staging, path);
  } finally {
    try {
      unlinkSync(staging);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function requireRealDirectory(path, { create }) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${path}`);
    if (!stat.isDirectory()) throw new Error(`Refusing non-directory path: ${path}`);
    return 'exists';
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (!create) throw new Error(`Refusing missing directory: ${path}`);
    return 'missing';
  }
}

function ensureDirectory(path) {
  if (requireRealDirectory(path, { create: true }) === 'missing') {
    requireRealDirectory(dirname(path), { create: false });
    mkdirSync(path);
  }
}

export function backupOnce(target) {
  const backup = `${target}.litgrok-backup`;
  try {
    const stat = lstatSync(backup);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refusing symbolic link: ${backup}`);
    return backup;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  copyFileSync(target, backup, constants.COPYFILE_EXCL);
  return backup;
}

export function backupIfSectionAbsent(target) {
  let stat;
  try {
    stat = lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return null;
  const text = readUtf8(target);
  if (text === null || inspectGround(text).state !== 'absent') return null;
  return backupOnce(target);
}

function settingPath(home) {
  return join(home, '.grok', SETTING);
}

function rulePath(home) {
  return join(home, '.grok', 'rules', '00-litgrok.md');
}

export function readGroundMode(home) {
  const root = join(home, '.grok');
  try {
    const rootStat = lstatSync(root);
    if (rootStat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${root}`);
    if (!rootStat.isDirectory()) throw new Error(`Refusing non-directory path: ${root}`);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  const path = settingPath(home);
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${path}`);
  if (!stat.isFile()) throw new Error(`Refusing non-directory path: ${path}`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Refusing to use ${SETTING}: file is not valid JSON`);
  }
  if (!parsed || parsed.schema !== SETTING_SCHEMA || parsed.mode !== 'off') {
    throw new Error(`Refusing to use ${SETTING}: schema is invalid`);
  }
  return 'off';
}

function writeGroundMode(home, mode) {
  ensureDirectory(join(home, '.grok'));
  const path = settingPath(home);
  if (mode === null) {
    try {
      const stat = lstatSync(path);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refusing symbolic link: ${path}`);
      unlinkSync(path);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    return;
  }
  writeAtomic(path, `${JSON.stringify({ schema: SETTING_SCHEMA, mode }, null, 2)}\n`);
}

export function applyStoredGround(home, afterWrite) {
  if (afterWrite === 'store-off') writeGroundMode(home, 'off');
  else if (afterWrite === 'clear-off') writeGroundMode(home, null);
}

function manifestPath(home) {
  return join(home, '.grok', MANIFEST);
}

function recordRuleHash(home, bytes) {
  const path = manifestPath(home);
  let stat;
  try {
    stat = lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Refusing symbolic link: ${path}`);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Refusing to use ${MANIFEST}: file is not valid JSON`);
  }
  if (!parsed || parsed.schema !== MANIFEST_SCHEMA || !parsed.files || Array.isArray(parsed.files)) {
    throw new Error(`Refusing to use ${MANIFEST}: schema is invalid`);
  }
  parsed.files[GROUND_RULE] = createHash('sha256').update(bytes).digest('hex');
  parsed.files = Object.fromEntries(Object.entries(parsed.files).sort(([left], [right]) => left.localeCompare(right)));
  writeAtomic(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

export function describeGround({ home }) {
  const rule = rulePath(home);
  let mode;
  try {
    mode = readGroundMode(home);
  } catch (error) {
    return { status: 'malformed', path: error.message.includes(SETTING) ? settingPath(home) : join(home, '.grok'), version: null };
  }
  let kind = 'missing';
  try {
    const stat = lstatSync(rule);
    if (stat.isSymbolicLink() || !stat.isFile()) return { status: 'malformed', path: rule, version: null };
    kind = 'file';
  } catch (error) {
    if (error?.code !== 'ENOENT') return { status: 'malformed', path: rule, version: null };
  }
  if (kind === 'missing') return { status: mode === 'off' ? 'off' : 'absent', path: rule, version: null };
  const text = readUtf8(rule);
  if (text === null) return { status: 'malformed', path: rule, version: null };
  const found = inspectGround(text);
  if (found.state === 'malformed') return { status: 'malformed', path: rule, version: null };
  if (found.state === 'present') {
    return { status: found.version === packageVersion() ? 'present' : 'stale', path: rule, version: found.version };
  }
  return { status: mode === 'off' ? 'off' : 'absent', path: rule, version: null };
}

export function formatGround(result) {
  if (result.status === 'present' || result.status === 'stale') return `GROUND: ${result.status} v=${result.version} ${result.path}`;
  return `GROUND: ${result.status} ${result.path}`;
}

export function groundReport(env) {
  const home = env.HOME || env.USERPROFILE || homedir();
  return formatGround(describeGround({ home }));
}

function ask(stdin, stdout) {
  stdout.write('Add LitGrok ground rules to the user rule (~/.grok/rules/00-litgrok.md)? [y/N] ');
  return new Promise((resolvePromise) => {
    let line = '';
    const onData = (chunk) => {
      line += String(chunk);
      if (!line.includes('\n')) return;
      stdin.off('data', onData);
      resolvePromise(/^\s*y(es)?\s*$/iu.test(line));
    };
    if (typeof stdin.resume === 'function') stdin.resume();
    stdin.on('data', onData);
  });
}

export async function decideGround({ scope, yes, noGround, env, stdin, stdout, home }) {
  const override = String(env.LITGROK_GROUND ?? '').trim().toLowerCase();
  if (override === 'on' || override === 'off') return { include: override === 'on', afterWrite: null };
  if (noGround) return { include: false, afterWrite: null };
  const stored = scope === 'user' ? readGroundMode(home) : null;
  if (yes) return { include: true, afterWrite: stored === 'off' && scope === 'user' ? 'clear-off' : null };
  if (stored === 'off') return { include: false, afterWrite: null };
  if (scope === 'user' && stdin?.isTTY && typeof stdin.on === 'function') {
    const accepted = await ask(stdin, stdout);
    if (!accepted) return { include: false, afterWrite: 'store-off' };
  }
  return { include: true, afterWrite: null };
}

export function ruleSourceForInstall(files) {
  const index = files.findIndex((file) => file.relativePath.split(sep).join('/') === GROUND_RULE);
  if (index < 0) return { files, cleanup() {} };
  const text = removeGround(readFileSync(files[index].source, 'utf8')).text;
  const temp = join(tmpdir(), `litgrok-rule-${randomUUID()}.md`);
  writeFileSync(temp, text, { flag: 'wx' });
  const next = files.slice();
  next[index] = { ...files[index], source: temp };
  return {
    files: next,
    cleanup() {
      try {
        unlinkSync(temp);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    },
  };
}

function entryKind(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return 'symlink';
    if (stat.isFile()) return 'file';
    return 'other';
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    throw error;
  }
}

function fail(stderr, error) {
  stderr.write(`litgrok: ${error instanceof Error ? error.message : String(error)}\n`);
  return 1;
}

function turn(home, mode, stdout, stderr) {
  const rule = rulePath(home);
  try {
    readGroundMode(home);
    const kind = entryKind(rule);
    if (kind === 'symlink') throw new Error(`Refusing symbolic link: ${rule}`);
    if (kind === 'other') throw new Error(`Refusing non-directory path: ${rule}`);
    const packaged = packagedGround();
    if (kind === 'file') {
      const text = readUtf8(rule);
      if (text === null) throw new Error(`Refusing to rewrite a non-UTF-8 file: ${rule}`);
      const found = inspectGround(text);
      if (found.state === 'malformed') throw new Error(`Refusing malformed ground-rule markers: ${rule}`);
      if (mode === 'off') {
        const removed = removeGround(text);
        if (removed.changed) {
          if (removed.text === '' && removed.created) unlinkSync(rule);
          else {
            writeAtomic(rule, removed.text);
            recordRuleHash(home, removed.text);
          }
        }
      } else if (found.state === 'absent') {
        backupOnce(rule);
        const next = upsertGround(text, { version: packaged.version, body: packaged.body, created: false });
        writeAtomic(rule, next.text);
        recordRuleHash(home, next.text);
      } else {
        const next = upsertGround(text, { version: packaged.version, body: packaged.body });
        if (next.changed) {
          writeAtomic(rule, next.text);
          recordRuleHash(home, next.text);
        }
      }
    } else if (mode === 'on') {
      ensureDirectory(join(home, '.grok', 'rules'));
      const created = upsertGround('', { version: packaged.version, body: packaged.body, created: true });
      writeAtomic(rule, created.text);
    }
    writeGroundMode(home, mode === 'off' ? 'off' : null);
    stdout.write(`${formatGround(describeGround({ home }))}\n`);
    return 0;
  } catch (error) {
    return fail(stderr, error);
  }
}

function removeEmpty(path) {
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return;
    rmdirSync(path);
  } catch (error) {
    if (['ENOTEMPTY', 'ENOENT', 'ENOTDIR'].includes(error?.code)) return;
    throw error;
  }
}

function projectCommand(rest, { cwd, stdout, stderr }) {
  let dir = cwd;
  let action = 'install';
  let dryRun = false;
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--remove') {
      action = 'remove';
      continue;
    }
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--dir' && rest[index + 1]) {
      dir = resolve(cwd, rest[index + 1]);
      index += 1;
      continue;
    }
    stderr.write(GROUND_USAGE);
    return 1;
  }
  const target = join(dir, '.grok', 'rules', PROJECT_RULE);
  try {
    const dirStat = lstatSync(dir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) throw new Error(`Refusing non-directory path: ${dir}`);
    if (dryRun) {
      stdout.write(`would ${action === 'remove' ? 'remove' : 'write'} ${target}\n`);
      return 0;
    }
    const rulesDir = join(dir, '.grok', 'rules');
    for (const ancestor of [join(dir, '.grok'), rulesDir]) {
      try {
        const stat = lstatSync(ancestor);
        if (stat.isSymbolicLink()) throw new Error(`Refusing symbolic link: ${ancestor}`);
        if (!stat.isDirectory()) throw new Error(`Refusing non-directory path: ${ancestor}`);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    const version = packageVersion();
    const kind = entryKind(target);
    if (kind === 'symlink') throw new Error(`Refusing symbolic link: ${target}`);
    if (kind === 'other') throw new Error(`Refusing non-directory path: ${target}`);
    if (action === 'remove') {
      if (kind === 'missing') {
        stdout.write(`${formatGround({ status: 'absent', path: target, version: null })}\n`);
        return 0;
      }
      const text = readUtf8(target);
      if (text === null) throw new Error(`Refusing to rewrite a non-UTF-8 file: ${target}`);
      const found = inspectGround(text);
      if (found.state === 'malformed') throw new Error(`Refusing malformed ground-rule markers: ${target}`);
      if (found.state === 'absent') throw new Error(`Refusing to overwrite different existing file: ${target}`);
      const removed = removeGround(text);
      if (removed.text !== '') throw new Error(`Refusing to overwrite different existing file: ${target}`);
      unlinkSync(target);
      removeEmpty(dirname(target));
      removeEmpty(dirname(dirname(target)));
      stdout.write(`${formatGround({ status: 'absent', path: target, version: null })}\n`);
      return 0;
    }
    ensureDirectory(join(dir, '.grok'));
    ensureDirectory(join(dir, '.grok', 'rules'));
    if (kind === 'missing') {
      const created = upsertGround('', { version, body: PROJECT_BODY, created: true });
      if (Buffer.byteLength(created.text) > GROUND_MAX_BYTES) throw new Error('Refusing ground-rule body over 1200 bytes');
      writeAtomic(target, created.text);
    } else {
      const text = readUtf8(target);
      if (text === null) throw new Error(`Refusing to rewrite a non-UTF-8 file: ${target}`);
      const found = inspectGround(text);
      if (found.state !== 'present') throw new Error(`Refusing to overwrite different existing file: ${target}`);
      const removed = removeGround(text);
      if (removed.text !== '') throw new Error(`Refusing to overwrite different existing file: ${target}`);
      const next = upsertGround(text, { version, body: PROJECT_BODY });
      if (!next.changed) {
        stdout.write(`${formatGround({ status: 'present', path: target, version })}\n`);
        return 0;
      }
      backupOnce(target);
      writeAtomic(target, next.text);
    }
    stdout.write(`${formatGround(describeGroundFile(target))}\n`);
    return 0;
  } catch (error) {
    return fail(stderr, error);
  }
}

function describeGroundFile(path) {
  const text = readUtf8(path);
  const found = text === null ? { state: 'malformed', version: null } : inspectGround(text);
  if (found.state !== 'present') return { status: found.state === 'absent' ? 'absent' : 'malformed', path, version: null };
  return { status: found.version === packageVersion() ? 'present' : 'stale', path, version: found.version };
}

export async function runGround(args, context = {}) {
  const stdout = context.stdout ?? process.stdout;
  const stderr = context.stderr ?? process.stderr;
  const env = context.env ?? process.env;
  const cwd = context.cwd ?? process.cwd();
  const home = env.HOME || env.USERPROFILE || homedir();
  const [sub, ...rest] = args;
  if (sub === 'status' && rest.length === 0) {
    stdout.write(`${formatGround(describeGround({ home }))}\n`);
    return 0;
  }
  if ((sub === 'on' || sub === 'off') && rest.length === 0) return turn(home, sub, stdout, stderr);
  if (sub === 'project') return projectCommand(rest, { cwd, stdout, stderr });
  stderr.write(GROUND_USAGE);
  return 1;
}
