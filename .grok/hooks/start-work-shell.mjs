// How the start-work run guard reads one shell command. Grok Build hands the `PreToolUse` hook the
// shell tool's `command` string (tool `run_terminal_command`); this module decides, without running
// anything, whether the call may run now, is parked for the wrap-up list (tier B: local and undoable,
// tier X: everything else), is held (parked but never replayed, because the word reader cannot follow
// it), or is refused outright (a secret, a host home, Git internals or the run's own state).
//
// The reader is deliberately small: it splits on `&&`, follows `cd` across the segments, removes
// quotes, and holds anything it does not model (expansions, escapes, globs, braces, redirects,
// subshells, prefixes that run another verb). Tier B is an allowlist; every other parked step is X.

import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { homedir, tmpdir, userInfo } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const CASE_FOLD = process.platform === 'darwin' || process.platform === 'win32';
const fold = (value) => (CASE_FOLD ? value.toLowerCase() : value);

const READERS = new Set(['cat', 'head', 'tail', 'wc', 'grep', 'rg', 'ls', 'stat', 'file', 'diff', 'sort', 'uniq', 'cut', 'pwd', 'echo', 'true', 'jq', 'find']);
// A reader in one of these forms writes a file, runs a program or reads a path list the guard cannot see (C-3).
const READER_WRITE_FLAGS = {
  any: /^(?:--output(?:=.*)?|--files0-from(?:=.*)?|--in-place(?:=.*)?)$/u,
  sort: /^(?:-o.*|-[a-zA-Z]*o.*|--compress-program(?:=.*)?|-T.*|--temporary-directory(?:=.*)?)$/u,
  find: /^(?:-exec|-execdir|-ok|-okdir|-delete|-fprint\w*|-fls)$/u,
  rg: /^(?:--pre(?:-glob)?(?:=.*)?|-z|--search-zip|--hostname-bin(?:=.*)?)$/u,
  file: /^(?:-C|--compile|-m.*|--magic-file(?:=.*)?)$/u,
};
const JQ_FLAGS = /^(?:-[rcensSjaMC]+|--(?:raw-output|compact-output|exit-status|null-input|slurp|sort-keys|join-output|ascii-output|monochrome-output|color-output|tab))$/u;
const JQ_UNSAFE = /\$|\b(?:env|input|inputs|input_filename|input_line_number|import|include|getpath|halt|halt_error|debug|stderr|error)\b/u;
// GNU tools take any unique prefix of a long option (`--out` is `--output`) and bundle short ones (`-uo F`), so a
// flag is read by prefix and by letter, not by its full spelling only (R5-1).
const WRITE_LONG = {
  any: ['output', 'files0-from', 'in-place'],
  sort: ['compress-program', 'temporary-directory'],
  rg: ['pre', 'pre-glob', 'search-zip', 'hostname-bin'],
  file: ['compile', 'magic-file'],
  git: ['output', 'ext-diff', 'textconv', 'open-files-in-pager'],
};
const WRITE_SHORT = { sort: 'oT', rg: 'z', file: 'Cm', git: 'oO' };
export function writingFlag(verb, word) {
  if (word.startsWith('--')) {
    const name = word.slice(2).split('=')[0];
    // `rg --files` is its own option, not a short form of `--files0-from`.
    if (verb === 'rg' && name === 'files') return false;
    return name !== '' && [...WRITE_LONG.any, ...(WRITE_LONG[verb] ?? [])].some((long) => long.startsWith(name));
  }
  // find's single-dash words are predicates, not bundles; its actions are listed in READER_WRITE_FLAGS.
  if (verb === 'find') return false;
  const cluster = /^-([a-zA-Z]+)/u.exec(word)?.[1] ?? '';
  return [...(WRITE_SHORT[verb] ?? '')].some((letter) => cluster.includes(letter));
}
const readerWrites = (verb, args) => args.some((word) => writingFlag(verb, word) || READER_WRITE_FLAGS[verb]?.test(word));
const GIT_READS = new Set(['status', 'diff', 'log', 'show', 'blame', 'ls-files', 'rev-parse']);
// Verbs that run another verb, move the shell, or change how the line is read: the guard cannot follow them.
const PREFIXES = new Set(['time', 'nice', 'nohup', 'timeout', 'stdbuf', 'ionice', 'chroot', 'doas', 'sudo', 'env', 'command',
  'builtin', 'exec', 'eval', 'source', '.', 'xargs', 'pushd', 'popd', 'alias', 'unalias', 'set', 'shopt', 'trap', 'enable', '!', 'export', 'unset']);
const NESTED_SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish']);
const DECODERS = [['base64', /^(?:-d|--decode|-D)$/u], ['xxd', /^-r$/u], ['openssl', /^(?:enc|base64)$/u]];
const NODE_FLAGS = new Set(['--test', '--check', '--no-warnings']);
// The project's own test and check commands run now (C-1); every other package script parks as X.
const PACKAGE_MANAGERS = new Set(['npm', 'pnpm', 'yarn']);
const PACKAGE_CHECK = /^(?:test|run (?:test|check|lint|build|typecheck)(?::[\w-]+)?)$/u;
const NODE_WRITE_ARGS = /^(?:--write|-w|--out|-o|--output|--fix|--update|-u)(?:=.*)?$/u;
const SCRIPT_EXTENSIONS = /\.(?:mjs|cjs|js)$/u;

// Network, package-script, delete and privilege verbs: a parked step that uses one may reach outside the
// project or cannot be undone, so it keeps a finished run open in wrap-up.
const OUTWARD_VERBS = new Set(['npm', 'pnpm', 'yarn', 'bun', 'npx', 'bunx', 'make', 'gh', 'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync',
  'docker', 'podman', 'aws', 'gcloud', 'az', 'kubectl', 'helm', 'terraform', 'rm', 'rmdir', 'unlink', 'shred', 'truncate', 'dd', 'sudo',
  'doas', 'chroot', 'nc', 'ncat', 'telnet', 'ftp', 'open', 'osascript', 'launchctl', 'crontab', 'kill', 'pkill', 'killall', 'brew', 'pip', 'pip3', 'cargo', 'go']);
const LOCAL_VERBS = new Set([...READERS, 'cd', 'touch', 'mkdir', 'cp', 'mv', 'node', 'python', 'python3', 'deno', 'perl', 'ruby', 'time', 'pushd', 'popd',
  'shasum', 'sha256sum', 'md5', 'md5sum', 'basename', 'dirname', 'realpath', 'printf', 'date', 'tr', 'sed', 'tree', 'du', 'which', 'type', 'git']);
// Git subcommands that touch only this clone; anything else (push, fetch, remote, an alias) may reach outside.
const GIT_LOCAL = new Set(['add', 'commit', ...GIT_READS, 'branch', 'checkout', 'switch', 'restore', 'stash', 'mv', 'rm', 'merge', 'rebase',
  'cherry-pick', 'grep', 'describe', 'shortlog', 'reflog', 'revert', 'apply', 'init']);

// Verbs that move, remove, relink or rewrite the paths they name; one that names a folder holding the run state is refused.
const MUTATORS = new Set(['rm', 'rmdir', 'unlink', 'mv', 'cp', 'ln', 'shred', 'truncate', 'chmod', 'chown', 'chgrp', 'chflags', 'dd', 'tar',
  'rsync', 'install', 'patch']);
const GIT_MUTATORS = new Set(['rm', 'mv', 'clean']);

/** Grok Build's shell tool, with the display names other surfaces use for it. */
export const SHELL_TOOL = /^(?:run_terminal_command|bash|Bash|shell)$/u;

class Unreadable extends Error {}
class RefusedError extends Error {}

/** Realpath of the nearest existing ancestor plus the rest; null when a link on the way dangles. */
export function realish(path) {
  let current = resolve(path);
  const rest = [];
  for (;;) {
    let status;
    try {
      status = lstatSync(current, { throwIfNoEntry: false });
    } catch {
      status = undefined;
    }
    if (status) {
      try {
        return join(realpathSync(current), ...rest.reverse());
      } catch {
        return null;
      }
    }
    const parent = dirname(current);
    if (parent === current) return join(current, ...rest.reverse());
    rest.push(basename(current));
    current = parent;
  }
}

/** The homes whose secrets and host folders are never read or written, including the account's real home. */
export function protectedHomes(env = process.env) {
  const homes = new Set();
  let account = null;
  try {
    account = userInfo().homedir;
  } catch {
    account = null;
  }
  for (const value of [homedir(), env.HOME, account]) {
    if (typeof value === 'string' && isAbsolute(value)) homes.add(realish(value) ?? value);
  }
  return [...homes];
}

const HOME_SECRETS = ['.ssh', '.aws', '.gnupg', '.npmrc', '.netrc', '.pypirc', '.docker', '.kube', '.config', '.local/share/keyrings',
  'Library/Keychains', '.zshrc', '.zshenv', '.zprofile', '.zlogin', '.bashrc', '.bash_profile', '.bash_login', '.profile', '.claude',
  '.claude.json', '.grok', '.hermes', '.gemini', '.cursor', '.agents', '.git-credentials', '.gitconfig'];
const SECRET_NAME = /^(?:\.env(?:\..+)?|\.envrc|\.mcp\.json|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|.*\.(?:pem|key|p12|pfx))$/iu;
const SAFE_ENV_NAME = /^\.env\.(?:example|sample|template)$/iu;

const inside = (child, parent) => {
  const a = fold(child);
  const b = fold(parent);
  return a === b || a.startsWith(b.endsWith(sep) ? b : `${b}${sep}`);
};

const LINK_HOPS = 16;

/**
 * Every place a path passes through while its links resolve, hop by hop (C-5): the path as written, each link's
 * target in turn (parents resolved at each hop), and the final real path. A dangling last target is still listed,
 * so a link into a protected folder that does not exist yet is caught. `loop` is true past LINK_HOPS hops.
 */
export function linkChain(path) {
  const paths = [resolve(path)];
  let current = resolve(path);
  for (let hop = 0; hop <= LINK_HOPS; hop += 1) {
    const parent = realish(dirname(current)) ?? dirname(current);
    current = join(parent, basename(current));
    paths.push(current);
    let status;
    try {
      status = lstatSync(current, { throwIfNoEntry: false });
    } catch {
      return { paths, loop: false };
    }
    if (!status?.isSymbolicLink()) return { paths, loop: false };
    let target;
    try {
      target = readlinkSync(current);
    } catch {
      return { paths, loop: false };
    }
    current = resolve(dirname(current), target);
  }
  return { paths, loop: true };
}

/**
 * Why a path is never touched by a run, or null. Checked after links resolve and, on macOS and Windows, case-folded.
 * The project root and the session read roots stay usable when they sit inside a hidden home folder; the named
 * secret folders and secret file names are refused everywhere.
 */
export function protectedReason(path, { homes, extraRoots = [], projectReal = null, readRoots = [] }) {
  const chain = linkChain(path);
  if (chain.loop) return 'a link loop';
  const real = realish(path) ?? resolve(path);
  for (const candidate of new Set([...chain.paths, real])) {
    if (SECRET_NAME.test(basename(candidate)) && !SAFE_ENV_NAME.test(basename(candidate))) return `a secret file (${basename(candidate)})`;
    for (const home of homes) {
      for (const name of HOME_SECRETS) if (inside(candidate, join(home, name))) return `a protected home folder (~/${name})`;
      // Every other hidden entry at the top of a home holds some tool's settings or credentials, other agent hosts' included.
      const first = inside(candidate, home) ? relative(home, candidate).split(sep)[0] : '';
      if (first.startsWith('.') && first !== '..') {
        const hidden = join(home, first);
        const usable = [projectReal, ...readRoots].filter((root) => root && inside(root, hidden));
        if (!usable.some((root) => inside(candidate, root))) return `a hidden home folder (~/${first})`;
      }
    }
    for (const root of extraRoots) if (root && inside(candidate, root)) return 'a protected host folder';
  }
  return null;
}

/** Splits a command into operator-separated parts, keeping quotes. Throws Unreadable for unpaired quotes. */
function splitOperators(command) {
  const parts = [];
  const operators = [];
  let current = '';
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    const two = command.slice(index, index + 2);
    if (two === '&&' || two === '||') {
      parts.push(current);
      operators.push(two);
      current = '';
      index += 1;
      continue;
    }
    if (char === ';' || char === '|' || char === '\n' || (char === '&' && command[index + 1] !== '>' && command[index - 1] !== '>')) {
      parts.push(current);
      operators.push(char === '\n' ? ';' : char);
      current = '';
      continue;
    }
    current += char;
  }
  if (quote) throw new Unreadable('its quotes do not pair');
  parts.push(current);
  return { parts, operators };
}

/** Words of one part with quotes removed. Throws Unreadable for anything the reader does not model. */
export function words(part) {
  const out = [];
  let word = null;
  let quote = null;
  const push = () => {
    if (word !== null) out.push(word);
    word = null;
  };
  for (let index = 0; index < part.length; index += 1) {
    const char = part[index];
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
      continue;
    }
    if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === '$' || char === '`' || char === '\\') throw new Unreadable('it expands or escapes inside double quotes');
      else word += char;
      continue;
    }
    if (char === ' ' || char === '\t') {
      push();
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      word ??= '';
      continue;
    }
    if (char === '$' || char === '`') throw new Unreadable('it expands a variable or a command');
    if (char === '\\') throw new Unreadable('it uses an escape');
    if ('*?['.includes(char)) throw new Unreadable('it uses a glob');
    if ('{}'.includes(char)) throw new Unreadable('it uses braces');
    if ('<>'.includes(char)) throw new Unreadable('it redirects input or output');
    if ('()'.includes(char)) throw new Unreadable('it opens a subshell');
    if (char === '#' && word === null) throw new Unreadable('it carries a comment');
    if (char === '~' && word === null) {
      const next = part[index + 1];
      if (next !== undefined && next !== '/' && next !== ' ' && next !== '\t') throw new RefusedError('it names another account home (~user)');
      throw new Unreadable('it uses ~');
    }
    if (/[\u0000-\u001f\u007f]/u.test(char)) throw new Unreadable('it carries a control character');
    word = (word ?? '') + char;
  }
  if (quote) throw new Unreadable('its quotes do not pair');
  push();
  return out;
}

const isFlag = (word) => word.startsWith('-') && word !== '-';

function pathCheck(word, cwd, ctx) {
  const abs = resolve(cwd, word);
  const reason = protectedReason(abs, ctx);
  if (reason) throw new RefusedError(`it names ${reason}`);
  return abs;
}

function gitInternals(abs, ctx) {
  const real = realish(abs);
  for (const candidate of [...linkChain(abs).paths, real].filter(Boolean)) {
    const rel = relative(ctx.projectReal, candidate);
    if (rel.split(sep).some((name) => name.toLowerCase() === '.git')) return true;
    if (ctx.stateDir && inside(candidate, ctx.stateDir)) return true;
  }
  return false;
}

// Where a new or existing local path really lands: { ok } inside the project, or a reason it is X or refused.
function localTarget(abs, ctx) {
  if (gitInternals(abs, ctx)) throw new RefusedError('it writes inside .git or the run state');
  const real = realish(abs);
  if (real === null) return { ok: false, reason: 'a link on its path dangles' };
  if (!inside(real, ctx.projectReal)) return { ok: false, reason: 'its path leaves the project' };
  if (gitInternals(real, ctx)) throw new RefusedError('it writes inside .git or the run state');
  return { ok: true, real };
}

const exists = (abs) => lstatSync(abs, { throwIfNoEntry: false }) !== undefined;

function tierBSegment(verb, args, cwd, ctx) {
  const fail = (reason) => ({ kind: 'x', reason });
  const paths = args.filter((word) => !isFlag(word));
  const flags = args.filter(isFlag);
  for (const word of paths) pathCheck(word, cwd, ctx);
  if (verb === 'touch' || verb === 'mkdir') {
    if (flags.some((flag) => !(verb === 'mkdir' && flag === '-p'))) return fail(`${verb} uses a flag outside the allowlist`);
    if (paths.length === 0) return fail(`${verb} names no path`);
    for (const word of paths) {
      const target = localTarget(resolve(cwd, word), ctx);
      if (!target.ok) return fail(target.reason);
    }
    return { kind: 'b' };
  }
  if (verb === 'cp' || verb === 'mv') {
    const allowed = verb === 'cp' ? new Set(['-r', '-R', '-p']) : new Set();
    if (flags.some((flag) => !allowed.has(flag))) return fail(`${verb} uses a flag outside the allowlist`);
    if (paths.length < 2) return fail(`${verb} needs a source and a destination`);
    const sources = paths.slice(0, -1).map((word) => resolve(cwd, word));
    const destination = resolve(cwd, paths.at(-1));
    for (const source of sources) {
      const target = localTarget(source, ctx);
      if (!target.ok || !exists(source)) return fail(target.ok ? 'a source does not exist' : target.reason);
    }
    const status = lstatSync(destination, { throwIfNoEntry: false });
    if (status && status.isDirectory() && !status.isSymbolicLink()) {
      const target = localTarget(destination, ctx);
      if (!target.ok) return fail(target.reason);
      for (const source of sources) {
        if (exists(join(destination, basename(source)))) return fail('it would overwrite a file');
        const inner = localTarget(join(destination, basename(source)), ctx);
        if (!inner.ok) return fail(inner.reason);
      }
      return { kind: 'b' };
    }
    if (status) {
      const target = localTarget(destination, ctx);
      if (!target.ok) return fail(target.reason);
      return fail('it would overwrite a file');
    }
    if (sources.length > 1) return fail('several sources need an existing folder');
    const target = localTarget(destination, ctx);
    return target.ok ? { kind: 'b' } : fail(target.reason);
  }
  return fail(`${verb} is not on the local allowlist`);
}

function gitAddSegment(args, cwd, ctx) {
  if (args.length === 0 || args.some((word) => isFlag(word) || word === '.' || word === '*')) return { kind: 'x', reason: 'git add must name its files' };
  for (const word of args) {
    const abs = pathCheck(word, cwd, ctx);
    const target = localTarget(abs, ctx);
    if (!target.ok) return { kind: 'x', reason: target.reason };
    const status = lstatSync(abs, { throwIfNoEntry: false });
    if (!status || !status.isFile()) return { kind: 'x', reason: 'git add must name existing files' };
  }
  return { kind: 'b', gitAdd: true };
}

/** Whether a reader walks folders: find and rg always, grep and ls only with their recursive flags. */
function recursiveRead(verb, args) {
  if (verb === 'find' || verb === 'rg') return true;
  const letter = verb === 'grep' ? /[rR]/u : verb === 'ls' ? /R/u : null;
  if (!letter) return false;
  // grep also recurses with `-d recurse` or `--directories=recurse`.
  const directories = (word, index) => (word === '-d' || longPrefix(word, 'directories', 3)) && (/=(.*)$/u.exec(word)?.[1] ?? args[index + 1]) === 'recurse';
  if (verb === 'grep' && args.some(directories)) return true;
  return args.some((word) => {
    if (word.startsWith('--')) {
      const name = word.slice(2).split('=')[0];
      return name !== '' && ['recursive', 'dereference-recursive'].some((long) => long.startsWith(name));
    }
    const cluster = /^-([a-zA-Z]+)/u.exec(word)?.[1];
    return cluster !== undefined && letter.test(cluster);
  });
}

/** Whether a folder holds a home or a protected host root inside it (or is one). */
function holdsProtected(abs, ctx) {
  return [...ctx.homes, ...(ctx.extraRoots ?? [])].some((root) => root && inside(root, abs));
}

function readerAllowed(abs, ctx) {
  return ctx.readRoots.some((root) => inside(realish(abs) ?? abs, root));
}

// A long option written as any unique prefix of its full name (`--incl` for `--include-untracked`).
const longPrefix = (word, full, least = 1) => {
  const body = /^--([^=]+)/u.exec(word)?.[1];
  return body !== undefined && body.length >= least && full.startsWith(body);
};

// grep and rg operands. The pattern is the first plain word unless `-e`/`--regexp` or `-f`/`--file` gives it, and then
// every plain word is a path (a pattern list file is a path too).
function grepOperands(args) {
  const operands = [];
  const lists = [];
  let given = false;
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (word === '--') {
      operands.push(...args.slice(index + 1));
      break;
    }
    if (!isFlag(word)) {
      operands.push(word);
      continue;
    }
    // `rg --files` lists files and takes no pattern; grep's `-d ACTION` takes a value.
    if (word === '--files') {
      given = true;
      continue;
    }
    if (word === '-d' || (longPrefix(word, 'directories', 3) && !word.includes('='))) {
      index += 1;
      continue;
    }
    const short = /^-([a-zA-Z0-9]+)$/u.exec(word)?.[1];
    if (short !== undefined) {
      const at = short.search(/[ef]/u);
      if (at === -1) continue;
      given = true;
      if (at < short.length - 1) {
        if (short[at] === 'f') lists.push(short.slice(at + 1));
      } else if (index + 1 < args.length) {
        index += 1;
        if (short[at] === 'f') lists.push(args[index]);
      }
      continue;
    }
    const value = /^--[^=]+=(.*)$/u.exec(word)?.[1];
    if (longPrefix(word, 'regexp', 3)) {
      given = true;
      if (value === undefined) index += 1;
    } else if (/^--fi(?:le?)?(?:=|$)/u.test(word)) {
      given = true;
      if (value !== undefined) lists.push(value);
      else if (index + 1 < args.length) lists.push(args[(index += 1)]);
    }
  }
  return { operands: given ? operands : operands.slice(1), lists };
}

function readerSegment(verb, args, cwd, ctx) {
  if (readerWrites(verb, args)) return { kind: 'x', reason: `${verb} uses a flag that writes or runs` };
  const paths = args.filter((word) => !isFlag(word));
  // jq's filter is a program: it can read the environment, more input, modules and argument lists (H3). Only a
  // plain filter with output flags reads like a reader.
  if (verb === 'jq') {
    if (args.some((word) => isFlag(word) && !JQ_FLAGS.test(word))) return { kind: 'x', reason: 'jq uses a flag that reads files, modules or arguments' };
    if (paths.length > 0 && JQ_UNSAFE.test(paths[0])) return { kind: 'x', reason: 'the jq filter reads the environment, more input or a module' };
  }
  // A recursive read of a folder that holds a protected one (a home, `/`) would read the secrets inside it (R5-4).
  const recursive = recursiveRead(verb, args);
  if (verb === 'grep' || verb === 'rg') {
    // With no path, rg and a recursive grep search the folder they run in.
    const { operands, lists } = grepOperands(args);
    const targets = operands.length > 0 ? operands : recursive ? ['.'] : [];
    for (const word of targets) {
      const abs = realish(resolve(cwd, word)) ?? resolve(cwd, word);
      if (recursive && holdsProtected(abs, ctx)) throw new RefusedError('it reads a folder that holds a protected home folder');
    }
    for (const word of [...targets, ...lists]) {
      if (!readerAllowed(pathCheck(word, cwd, ctx), ctx)) return { kind: 'x', reason: 'it reads outside the project' };
    }
    return { kind: 'read' };
  }
  if (recursive) {
    for (const word of paths) {
      const abs = realish(resolve(cwd, word)) ?? resolve(cwd, word);
      if (holdsProtected(abs, ctx)) throw new RefusedError('it reads a folder that holds a protected home folder');
    }
  }
  // uniq writes its second operand.
  if (verb === 'uniq' && paths.length > 1) return { kind: 'x', reason: 'uniq writes its second operand' };
  for (const word of paths) {
    const abs = pathCheck(word, cwd, ctx);
    if (verb !== 'echo' && verb !== 'jq' && !readerAllowed(abs, ctx)) return { kind: 'x', reason: 'it reads outside the project' };
  }
  // jq takes a filter first; every later word is a path.
  if (verb === 'jq' && paths.slice(1).some((word) => !readerAllowed(resolve(cwd, word), ctx))) {
    return { kind: 'x', reason: 'it reads outside the project' };
  }
  if ((verb === 'pwd' || verb === 'ls' || verb === 'find') && paths.length === 0 && !readerAllowed(cwd, ctx)) {
    return { kind: 'x', reason: 'it reads outside the project' };
  }
  return { kind: 'read' };
}

function nodeSegment(args, cwd, ctx) {
  let index = 0;
  while (index < args.length && NODE_FLAGS.has(args[index])) index += 1;
  if (index < args.length && isFlag(args[index])) return { kind: 'x', reason: 'node runs inline code or an unknown flag' };
  if (index === args.length) return args.includes('--test') && readerAllowed(cwd, ctx) ? { kind: 'node' } : { kind: 'x', reason: 'node names no script' };
  const script = pathCheck(args[index], cwd, ctx);
  const real = realish(script);
  if (!SCRIPT_EXTENSIONS.test(script) || real === null || !inside(real, ctx.projectReal) || gitInternals(real, ctx)) return { kind: 'x', reason: 'node runs a script outside the project' };
  if (!exists(script)) return { kind: 'x', reason: 'node names a missing script' };
  for (const word of args.slice(index + 1)) {
    if (NODE_WRITE_ARGS.test(word)) return { kind: 'x', reason: 'the script is asked to write' };
    if (!isFlag(word)) pathCheck(word, cwd, ctx);
  }
  return { kind: 'node' };
}

// `python3 <script.py inside the project> [plain args]` runs like `node <script>`; a flag (-c, -m) or an outside
// script parks as X.
function pythonSegment(args, cwd, ctx) {
  if (args.length === 0 || isFlag(args[0])) return { kind: 'x', reason: 'python runs inline code, a module or a flag' };
  const script = pathCheck(args[0], cwd, ctx);
  const real = realish(script);
  if (!/\.py$/u.test(script) || real === null || !inside(real, ctx.projectReal) || gitInternals(real, ctx)) return { kind: 'x', reason: 'python runs a script outside the project' };
  if (!exists(script)) return { kind: 'x', reason: 'python names a missing script' };
  if (args.slice(1).some((word) => NODE_WRITE_ARGS.test(word))) return { kind: 'x', reason: 'the script is asked to write' };
  return { kind: 'node' };
}

/** The repository a folder belongs to and its checked-out branch, read from `.git` at call time. */
export function gitHead(cwd) {
  let current = realish(cwd);
  while (current) {
    const dotGit = join(current, '.git');
    const status = lstatSync(dotGit, { throwIfNoEntry: false });
    if (status) {
      let gitDir = dotGit;
      if (status.isFile()) {
        const pointer = /^gitdir:\s*(.+)\s*$/mu.exec(readFileSync(dotGit, 'utf8'));
        if (!pointer) return null;
        gitDir = resolve(current, pointer[1]);
      }
      try {
        const head = /^ref: refs\/heads\/(.+)\s*$/u.exec(readFileSync(join(gitDir, 'HEAD'), 'utf8'));
        return { repo: current, branch: head ? head[1] : null };
      } catch {
        return null;
      }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

const COMMIT_FLAGS = new Set(['-a', '-q', '--quiet', '--all']);

function commitSegment(args, cwd, ctx) {
  const charter = ctx.charter;
  if (!charter) return { kind: 'x', reason: 'no run charter grants commits' };
  for (let index = 0; index < args.length; index += 1) {
    const word = args[index];
    if (word === '-m' || word === '-F') {
      index += 1;
      if (args[index] === undefined) return { kind: 'x', reason: 'git commit names no message' };
      if (word === '-F') pathCheck(args[index], cwd, ctx);
      continue;
    }
    if (!COMMIT_FLAGS.has(word)) return { kind: 'x', reason: `git commit ${word} is not granted by the charter` };
  }
  if (!args.includes('-m') && !args.includes('-F')) return { kind: 'x', reason: 'git commit names no message' };
  const head = gitHead(cwd);
  if (!head || !charter.some((grant) => fold(grant.repo) === fold(head.repo) && grant.branch === head.branch)) {
    return { kind: 'x', reason: `the charter does not cover ${head?.branch ?? 'this branch'} in this repository` };
  }
  return { kind: 'commit' };
}

function segmentKind(list, cwd, ctx) {
  const [verb, ...args] = list;
  if (verb === undefined) throw new Unreadable('it has an empty step');
  if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(verb)) throw new Unreadable('an assignment comes before the verb');
  if (PREFIXES.has(verb)) throw new Unreadable(`\`${verb}\` runs or moves something the guard cannot follow`);
  if (NESTED_SHELLS.has(verb) && args.length === 0) throw new Unreadable('it pipes into a nested shell');
  if (NESTED_SHELLS.has(verb) && args.some((word) => /^-\w*c/u.test(word))) throw new Unreadable('it runs a nested shell');
  for (const [name, flag] of DECODERS) if (verb === name && args.some((word) => flag.test(word))) throw new Unreadable('it decodes bytes');
  if (verb === 'cd') {
    if (args.length === 0) throw new RefusedError('a bare cd moves to the home folder');
    if (args[0] === '-') throw new Unreadable('cd - goes to a folder the guard cannot see');
    if (args.length > 1) return { kind: 'x', reason: 'cd takes one folder', cwd };
    const target = pathCheck(args[0], cwd, ctx);
    const status = lstatSync(target, { throwIfNoEntry: false });
    const next = realish(target);
    if (!status || next === null) return { kind: 'x', reason: 'cd names a missing folder', cwd: target };
    if (ctx.homes.some((home) => inside(home, next))) return { kind: 'x', reason: 'cd moves into a home folder', cwd: next };
    if (!inside(next, ctx.projectReal)) return { kind: 'x', reason: 'cd leaves the project', cwd: next };
    if (gitInternals(next, ctx)) throw new RefusedError('cd moves into .git');
    return { kind: 'cd', cwd: next };
  }
  const mutates = MUTATORS.has(verb) || (verb === 'git' && GIT_MUTATORS.has(args[0])) || (verb === 'find' && args.some((word) => READER_WRITE_FLAGS.find.test(word)));
  for (const word of args) {
    // The value after `=` in `name=value` or `--flag=value` is checked as a path too (C-3), and so is the path in
    // git's `rev:path`; naming `.git` or the run state in any verb is refused, never parked (C-4).
    const value = /^[^=/]+=(.+)$/u.exec(word)?.[1];
    const revPath = verb === 'git' ? /^[^:/\s]*:(?!\/\/)(.+)$/u.exec(word)?.[1] : undefined;
    for (const candidate of [isFlag(word) ? null : word, value, revPath].filter(Boolean)) {
      const abs = pathCheck(candidate, cwd, ctx);
      if (gitInternals(abs, ctx)) throw new RefusedError('it names .git or the run state');
      // Moving, removing or rewriting a folder that holds the run state would take the guard with it.
      if (mutates && ctx.stateDir && inside(ctx.stateDir, realish(abs) ?? abs)) throw new RefusedError('it would move or remove the run state');
    }
  }
  if (verb === 'git') {
    // `-C <dir>` and `-c k=v` come before the subcommand; the clean and stash refusals below look past them.
    let at = 0;
    while (args[at] === '-C' || args[at] === '-c') at += 2;
    const [sub, ...rest] = args.slice(at);
    if (sub === undefined || isFlag(sub)) return { kind: 'x', reason: 'git runs with a global flag' };
    // These remove untracked or ignored files, and the run state is one of them, so approving one would end the guard.
    const dryRun = rest.some((word) => /^-[a-zA-Z]*n[a-zA-Z]*$/u.test(word) || longPrefix(word, 'dry-run'));
    if (sub === 'clean' && !dryRun) throw new RefusedError('git clean would remove the run state');
    const untracked = rest.some((word) => /^-[a-zA-Z]*[ua]/u.test(word) || longPrefix(word, 'all') || longPrefix(word, 'include-untracked', 2));
    if (sub === 'stash' && untracked) throw new RefusedError('a stash of untracked files would remove the run state');
    if (at > 0) return { kind: 'x', reason: 'git runs with a global flag' };
    if (GIT_READS.has(sub) && !rest.some((word) => writingFlag('git', word))) {
      return readerSegment('git', rest, cwd, ctx).kind === 'read' ? { kind: 'read' } : { kind: 'x', reason: 'git reads outside the project' };
    }
    if (sub === 'add') return gitAddSegment(rest, cwd, ctx);
    if (sub === 'commit') return commitSegment(rest, cwd, ctx);
    return { kind: 'x', reason: `git ${sub} is not local and undoable` };
  }
  if (READERS.has(verb)) return readerSegment(verb, args, cwd, ctx);
  if (verb === 'node') return nodeSegment(args, cwd, ctx);
  if (verb === 'python3' || verb === 'python') return pythonSegment(args, cwd, ctx);
  if (PACKAGE_MANAGERS.has(verb) && PACKAGE_CHECK.test(args.join(' '))) {
    const here = realish(cwd);
    return here && inside(here, ctx.projectReal) && exists(join(here, 'package.json'))
      ? { kind: 'node' }
      : { kind: 'x', reason: `${verb} runs outside the project or with no package.json` };
  }
  if (['touch', 'mkdir', 'cp', 'mv'].includes(verb)) return tierBSegment(verb, args, cwd, ctx);
  return { kind: 'x', reason: `\`${verb}\` is not on the local allowlist` };
}

/**
 * Decides one shell call: { decision: 'allow' } | { decision: 'park', tier: 'B'|'X', reason }
 * | { decision: 'hold', reason } | { decision: 'refuse', reason } | { decision: 'split', parts }.
 * input: { cwd, projectRoot, homes, extraRoots, readRoots, stateDir, check, charter, consentCurrent, denied }.
 */
export function classifyCommand(command, input) {
  const projectReal = realish(input.projectRoot) ?? resolve(input.projectRoot);
  const ctx = {
    ...input,
    projectReal,
    homes: input.homes ?? protectedHomes(),
    readRoots: [projectReal, ...(input.readRoots ?? []).map((root) => realish(root) ?? root)],
  };
  if (typeof command !== 'string' || command.trim() === '') return { decision: 'hold', reason: 'cannot check this command: it is empty' };
  if (ctx.denied?.has(command)) return { decision: 'refuse', reason: 'the user denied this exact command for this run' };
  if (ctx.check && command.trim() === ctx.check) return { decision: 'allow' };
  const redirected = redirectRefusal(command, ctx) ?? tildeRefusal(command, ctx);
  if (redirected) return { decision: 'refuse', reason: redirected };
  let split;
  try {
    split = splitOperators(command);
  } catch (error) {
    return error instanceof Unreadable ? { decision: 'hold', reason: `cannot check this command: ${error.message}` } : { decision: 'refuse', reason: error.message };
  }
  const { parts, operators } = split;
  const shaped = operators.some((operator) => operator !== '&&');
  const kinds = [];
  let cwd = realish(ctx.cwd) ?? ctx.cwd;
  let held = null;
  for (const part of parts) {
    try {
      const list = words(part);
      if (list.length === 0) throw new Unreadable('it has an empty step');
      const kind = segmentKind(list, cwd, ctx);
      if (kind.cwd) cwd = kind.cwd;
      kinds.push({ ...kind, text: part.trim() });
    } catch (error) {
      if (error instanceof RefusedError) return { decision: 'refuse', reason: error.message };
      // Any other failure (a path the file system rejects, say) holds the step: the guard fails closed.
      const reason = error instanceof Unreadable ? error.message : `a path could not be checked (${error?.code ?? 'error'})`;
      held ??= `cannot check this command: ${reason}`;
      kinds.push({ kind: 'held', text: part.trim(), reason });
    }
  }
  if (shaped) {
    const hint = splitHint(parts, kinds, ctx);
    if (hint) return { decision: 'split', parts: hint };
  }
  if (held) return { decision: 'hold', reason: held };
  if (shaped) return { decision: 'park', tier: 'X', reason: 'it chains with ;, ||, | or &' };
  const direct = new Set(['read', 'node', 'commit', 'cd']);
  const commits = kinds.some(({ kind }) => kind === 'commit');
  if (kinds.every(({ kind, gitAdd }) => direct.has(kind) || (commits && gitAdd))) {
    return commits && !ctx.consentCurrent
      ? { decision: 'park', tier: 'X', reason: 'the plan changed after the approval, so the charter grants no commits' }
      : { decision: 'allow' };
  }
  if (kinds.every(({ kind }) => kind === 'b' || kind === 'read' || kind === 'cd')) return { decision: 'park', tier: 'B', reason: 'a local step that waits for `lit approve`' };
  return { decision: 'park', tier: 'X', reason: kinds.find(({ kind }) => kind === 'x')?.reason ?? 'it is not on the local allowlist' };
}

// A redirect is never run (the word reader holds it), but one aimed at the run state, `.git` or a protected
// home is refused outright and not stored (C-4). Quotes are read loosely here, which only widens the net.
function redirectRefusal(command, ctx) {
  const cwd = realish(ctx.cwd) ?? ctx.cwd;
  for (const match of command.matchAll(/[0-9&]?>{1,2}\|?[ \t]*(["']?)([^\s;&|<>"'()]+)\1/gu)) {
    const target = match[2];
    if (target.startsWith('&')) continue;
    const home = ctx.homes[0];
    const abs = target.startsWith('~') && home ? join(home, target.replace(/^~[/]?/u, '')) : resolve(cwd, target);
    const reason = protectedReason(abs, ctx);
    if (reason) return `it redirects into ${reason}`;
    if (gitInternals(abs, ctx)) return 'it redirects into .git or the run state';
  }
  return null;
}

// The word reader holds `~`, but a `~/…` path into a protected home folder is refused outright, in every home.
function tildeRefusal(command, ctx) {
  for (const match of command.matchAll(/(?:^|[\s=;&|(:])["']?~(\/[^\s;&|<>"'()]*)?(?=$|[\s;&|<>"'()])/gu)) {
    const rest = (match[1] ?? '').replace(/^\/+/u, '');
    // The words of the step this `~` sits in, read loosely, to see whether it walks folders (R5-4).
    const before = command.slice(0, match.index + match[0].indexOf('~'));
    const step = `${before.slice(Math.max(...[';', '&', '|', '\n'].map((mark) => before.lastIndexOf(mark))) + 1)}${command.slice(before.length).split(/[;&|\n]/u)[0]}`;
    const [verb, ...args] = step.trim().split(/\s+/u);
    for (const home of ctx.homes) {
      const reason = protectedReason(join(home, rest), ctx);
      if (reason) return `it names ${reason}`;
      if (recursiveRead(verb, args) && holdsProtected(join(home, rest), ctx)) return 'it reads a folder that holds a protected home folder';
    }
  }
  return null;
}

/** Why an edit tool may not write `path` during a run (a protected path, `.git` or the run state), or null. */
export function editRefusal(path, input) {
  const projectReal = realish(input.projectRoot) ?? resolve(input.projectRoot);
  const ctx = { ...input, projectReal, homes: input.homes ?? protectedHomes(), readRoots: [projectReal, ...(input.readRoots ?? [])] };
  const abs = resolve(projectReal, path);
  const reason = protectedReason(abs, ctx);
  if (reason) return `it names ${reason}`;
  if (gitInternals(abs, ctx)) return 'it writes inside .git or the run state';
  return null;
}

// A self-check refused only for its shape: every part is a reader, `true`, an `echo` of the exit status,
// or the Done-when check. The hint names each part to run as its own call instead of parking anything.
function splitHint(parts, kinds, ctx) {
  const useful = [];
  for (const [index, part] of parts.entries()) {
    const text = part.trim();
    const bare = text.replace(/\s*2>&1\s*$/u, '').trim();
    if (bare === 'true' || /^echo\s+["']?[\w =:.-]*\$\?["']?$/u.test(bare)) continue;
    if (ctx.check && bare === ctx.check) {
      useful.push(bare);
      continue;
    }
    let kind = kinds[index]?.kind;
    if (bare !== text) {
      try {
        kind = segmentKind(words(bare), realish(ctx.cwd) ?? ctx.cwd, ctx).kind;
      } catch {
        return null;
      }
    }
    if (kind !== 'read' && kind !== 'node') return null;
    useful.push(bare);
  }
  return useful.length > 0 ? useful : null;
}

/** Whether a parked step may reach outside the machine or the project, or cannot be undone. */
export function isOutward(command, { cwd, projectRoot }) {
  const projectReal = realish(projectRoot) ?? resolve(projectRoot);
  // Discarding output reaches nothing.
  const text = command.replace(/\d?>&?[ \t]*\/dev\/null(?=$|[\s;&|])/gu, ' ');
  let parts;
  try {
    parts = splitOperators(text).parts;
  } catch {
    parts = text.split(/&&|\|\||[;|&\n]/u);
  }
  for (const part of parts) {
    const list = part.trim().replace(/["']/gu, '').split(/\s+/u).filter(Boolean);
    const verb = list[0]?.replace(/^.*\//u, '');
    if (!verb) continue;
    if (OUTWARD_VERBS.has(verb)) return true;
    // A bare `git remote`, `-v` or `get-url` only reads the config; `show`, `update`, `prune` and the rest may reach the remote.
    if (verb === 'git' && list[1] === 'remote' && (list.length === 2 || ['-v', '--verbose', 'get-url'].includes(list[2]))) continue;
    if (verb === 'git' && !GIT_LOCAL.has(list[1] ?? '')) return true;
    if (verb === 'find' && list.some((word) => /^-(?:delete|exec|execdir|ok)$/u.test(word))) return true;
    if (!LOCAL_VERBS.has(verb) && !/^\.\/[\w./-]+$/u.test(list[0]) && !/^[A-Za-z_]\w*=/u.test(verb)) return true;
    for (const word of list.slice(1)) {
      if (word.startsWith('~')) return true;
      if (word.startsWith('/') || word.startsWith('..')) {
        const real = realish(resolve(cwd, word));
        if (real === null || !inside(real, projectReal)) return true;
      }
    }
  }
  return false;
}

/** Extra roots a run never touches: an explicit `GROK_HOME`, besides `~/.grok` in every protected home. */
export function hostRoots(env = process.env) {
  return [env.GROK_HOME].filter((value) => typeof value === 'string' && isAbsolute(value)).map((value) => realish(value) ?? value);
}

/** Folders the session may read without parking: its transcript folder, plugin data and the system temp root. */
export function sessionReadRoots(event, env = process.env) {
  const roots = [tmpdir()];
  if (typeof event?.transcriptPath === 'string' && isAbsolute(event.transcriptPath)) roots.push(dirname(event.transcriptPath));
  if (typeof env.GROK_PLUGIN_DATA === 'string' && isAbsolute(env.GROK_PLUGIN_DATA)) roots.push(env.GROK_PLUGIN_DATA);
  return roots;
}
