import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// `litgrok extensions` manages the nine LitFamily extensions through Grok Build's own plugin store. Each extension
// is a one-skill plugin folder, `variants/litgrok/<id>/`, of the wjgoarxiv-skills shelf. LitGrok writes no receipt
// of its own: Grok Build's `plugin list --json` and `installed-plugins/registry.json` record the source, the store
// copy and the install time. On Grok Build 1.0.13 a second install of the same folder stops with
// `already installed`, `grok plugin update` copies nothing for a local folder, and each `grok plugin uninstall <id>`
// removes one copy, so install and update go through uninstall plus install, after a backup of each store copy.
export const SHELF_URL = 'https://github.com/wjgoarxiv/wjgoarxiv-skills';
export const EXTENSION_IDS = Object.freeze(['lit-pptx', 'lit-docx', 'lit-scientific-visualization', 'lit-diagram-drawer', 'lit-schematic', 'frontend-ui-ux', 'visual-qa', 'readme-studio', 'lit-typographic-motion']);
const FAMILIES = Object.freeze({
  decks: ['lit-pptx'],
  documents: ['lit-docx'],
  figures: ['lit-diagram-drawer', 'lit-schematic', 'lit-scientific-visualization'],
  design: ['frontend-ui-ux', 'visual-qa'],
  'video-covers': ['lit-typographic-motion', 'readme-studio'],
});
// The eight skills folders Grok Build reads, project first. A same-name skill in one of them takes the bare /<id>.
const SKILL_ROOTS = ['.grok', '.agents', '.claude', '.cursor'];
const VARIANT = join('variants', 'litgrok');
const HOST_TIMEOUT_MS = 120_000;
// doctor only reads the plugin list; a slow host must not hold it for two minutes.
const DOCTOR_TIMEOUT_MS = 5_000;
const FETCH_TIMEOUT_MS = 300_000;

export const EXTENSIONS_USAGE = [
  'Usage: litgrok extensions list [--json]',
  '       litgrok extensions check [--json]',
  '       litgrok extensions install <id...>|--family <name>|--all [--from <clone>] [--allow-shadow] [--yes]',
  '       litgrok extensions update [<id...>|--all] [--from <clone>] [--yes]',
  '       litgrok extensions remove <id...> [--yes]',
  '       litgrok extensions prune-backups [--older-than <days>] [--yes]',
  `Extensions: ${EXTENSION_IDS.join(', ')}`,
  `Families: ${Object.keys(FAMILIES).join(', ')}`,
  'Every verb that changes something prints its plan and changes nothing until you add --yes.',
  '',
].join('\n');

class ExtensionsError extends Error {}

function parse(args) {
  const verbs = ['list', 'check', 'install', 'update', 'remove', 'prune-backups'];
  const options = { verb: args[0], ids: [], all: false, family: null, from: null, yes: false, dryRun: false, json: false, allowShadow: false, olderThan: null };
  if (!verbs.includes(options.verb)) return null;
  const flags = {
    list: ['--json'],
    check: ['--json'],
    install: ['--all', '--family', '--from', '--allow-shadow', '--yes', '--dry-run'],
    update: ['--all', '--from', '--yes', '--dry-run'],
    remove: ['--yes', '--dry-run'],
    'prune-backups': ['--older-than', '--yes', '--dry-run'],
  }[options.verb];
  const rest = args.slice(1);
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--no-color') continue;
    if (argument.startsWith('--')) {
      if (!flags.includes(argument)) return null;
      if (['--family', '--from', '--older-than'].includes(argument)) {
        const value = rest[index + 1];
        if (value === undefined || value.startsWith('--')) return null;
        index += 1;
        if (argument === '--family') options.family = value;
        if (argument === '--from') options.from = value;
        if (argument === '--older-than') {
          if (!/^\d+$/u.test(value)) return null;
          options.olderThan = Number(value);
        }
      } else if (argument === '--all') options.all = true;
      else if (argument === '--yes') options.yes = true;
      else if (argument === '--dry-run') options.dryRun = true;
      else if (argument === '--json') options.json = true;
      else if (argument === '--allow-shadow') options.allowShadow = true;
      continue;
    }
    if (!['install', 'update', 'remove'].includes(options.verb) || !EXTENSION_IDS.includes(argument)) return null;
    if (!options.ids.includes(argument)) options.ids.push(argument);
  }
  if (options.family !== null) {
    if (!Object.hasOwn(FAMILIES, options.family)) return null;
    for (const id of FAMILIES[options.family]) if (!options.ids.includes(id)) options.ids.push(id);
  }
  if (options.all) {
    if (options.ids.length > 0) return null;
    options.ids = [...EXTENSION_IDS];
  }
  if (['install', 'remove'].includes(options.verb) && options.ids.length === 0) return null;
  return options;
}

function paths(env, cwd) {
  const home = env.HOME || env.USERPROFILE;
  if (!home) throw new ExtensionsError('HOME is not set, so the Grok Build folders cannot be found.');
  const cacheHome = typeof env.XDG_CACHE_HOME === 'string' && isAbsolute(env.XDG_CACHE_HOME) ? env.XDG_CACHE_HOME : join(home, '.cache');
  return {
    home,
    cwd,
    backups: join(home, '.grok', 'extension-backups'),
    cache: join(cacheHome, 'litgrok', 'extensions-src'),
  };
}

function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

function tool(command, args, { env, cwd, timeout = HOST_TIMEOUT_MS }) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout });
  if (result.error?.code === 'ENOENT') return { missing: true, status: null, stdout: '', stderr: '' };
  if (result.error?.code === 'ETIMEDOUT') return { missing: false, timedOut: true, status: null, stdout: '', stderr: `no answer within ${Math.round(timeout / 1000)} s` };
  if (result.error) return { missing: false, status: null, stdout: result.stdout ?? '', stderr: String(result.error.message) };
  return { missing: false, status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function grok(args, context) {
  const result = tool('grok', args, context);
  if (result.missing) throw new ExtensionsError('grok was not found on PATH. Install Grok Build, or put its grok command on PATH, and run this again.');
  return result;
}

function registryTimes(path) {
  try {
    const registry = JSON.parse(readFileSync(join(dirname(path), 'registry.json'), 'utf8'));
    for (const repo of Object.values(registry?.repos ?? {})) {
      if (repo?.path === path) return { installed_at: repo.installed_at ?? null, updated_at: repo.updated_at ?? null };
    }
  } catch {
    // The registry is Grok Build's file; when it is missing or unreadable the times stay unknown.
  }
  return { installed_at: null, updated_at: null };
}

function installedPlugins(context) {
  const result = grok(['plugin', 'list', '--json'], { ...context, timeout: context.hostTimeout ?? HOST_TIMEOUT_MS });
  if (result.timedOut) throw new ExtensionsError(`grok plugin list --json gave ${result.stderr}`, { cause: 'timeout' });
  if (result.status !== 0) throw new ExtensionsError(`grok plugin list --json failed: ${(result.stderr || result.stdout).trim()}`);
  let rows;
  try {
    rows = JSON.parse(result.stdout);
  } catch {
    throw new ExtensionsError('grok plugin list --json printed something that is not JSON; nothing was changed.');
  }
  if (!Array.isArray(rows)) throw new ExtensionsError('grok plugin list --json did not print a list; nothing was changed.');
  return rows.filter((row) => EXTENSION_IDS.includes(row?.name)).map((row) => {
    const source = typeof row.source === 'string' ? row.source : null;
    return {
      name: row.name,
      repo_key: row.repo_key ?? null,
      version: row.version ?? null,
      path: typeof row.path === 'string' ? row.path : null,
      source,
      managed: source !== null && source.endsWith(`${sep}${join(VARIANT, row.name)}`),
      source_exists: source !== null && lstatOrNull(source) !== null,
      ...(typeof row.path === 'string' ? registryTimes(row.path) : { installed_at: null, updated_at: null }),
    };
  });
}

function isLitGrokNote(skillFile, id) {
  try {
    const head = readFileSync(skillFile, 'utf8').slice(0, 4096);
    return head.split('\n').some((line) => line.startsWith(`description: "Moved: ${id} `));
  } catch {
    return false;
  }
}

function competingCopies(id, { cwd, home }) {
  const found = [];
  const seen = new Set();
  for (const [base, scope] of [[cwd, 'project'], [home, 'user']]) {
    for (const folder of SKILL_ROOTS) {
      const path = resolve(base, folder, 'skills', id);
      if (seen.has(path)) continue;
      seen.add(path);
      if (lstatOrNull(join(path, 'SKILL.md')) === null || isLitGrokNote(join(path, 'SKILL.md'), id)) continue;
      const oldLitGrok = folder === '.grok' && lstatOrNull(join(base, '.grok', '.litgrok-install-manifest.json')) !== null;
      found.push({ path, scope, kind: oldLitGrok ? 'old-litgrok' : 'personal' });
    }
  }
  return found;
}

function moveAsideLine(path, backups) {
  return `mkdir -p "${backups}" && mv "${path}" "$(mktemp -d "${backups}/$(date +%Y%m%d-%H%M%S)-XXXXXX")/"`;
}

function competingFix(copy, backups) {
  if (copy.kind === 'old-litgrok') return `litgrok install --${copy.scope} (an earlier LitGrok copy; the install turns it into the note)`;
  return moveAsideLine(copy.path, backups);
}

// A digest of a folder tree: relative paths, file bytes and link targets. The store copy is a plain copy of the
// source folder, so equal digests mean the installed plugin is current.
function treeDigest(root) {
  const hash = createHash('sha256');
  const visit = (folder) => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name);
      const status = lstatSync(path);
      const rel = relative(root, path).split(sep).join('/');
      if (status.isSymbolicLink()) hash.update(`L ${rel} ${readlinkSync(path)}\n`);
      else if (status.isDirectory()) {
        hash.update(`D ${rel}\n`);
        visit(path);
      } else if (status.isFile()) hash.update(`F ${rel} ${createHash('sha256').update(readFileSync(path)).digest('hex')}\n`);
    }
  };
  visit(root);
  return hash.digest('hex');
}

function sourceFolder(root, id) {
  return join(root, VARIANT, id);
}

function usableShelf(root) {
  const status = lstatOrNull(join(root, VARIANT));
  return status !== null && status.isDirectory();
}

function fetchHint(cache) {
  return `Clone ${SHELF_URL} yourself and pass --from "<path to your wjgoarxiv-skills clone>", or retry when online. LitGrok keeps its own copy at ${cache}.`;
}

// Where the extension folders come from: --from names a clone the user keeps; otherwise LitGrok keeps a shallow,
// sparse clone of variants/litgrok/ in its own cache folder. `refresh` fetches or pulls it; without it, nothing is
// fetched and a missing cache is reported as not fetched yet.
function resolveSource(options, context, { refresh }) {
  if (options.from !== null) {
    const root = resolve(context.cwd, options.from);
    if (!usableShelf(root)) throw new ExtensionsError(`${root} has no variants/litgrok folder. Pass --from the root of a wjgoarxiv-skills clone.`);
    return { root, kind: 'from', ready: true, note: refresh ? `using ${root} as it is; pull it yourself to get newer extensions` : null };
  }
  const { cache } = context.paths;
  const own = lstatOrNull(dirname(cache));
  if (own !== null && (own.isSymbolicLink() || !own.isDirectory())) throw new ExtensionsError(`Refusing ${dirname(cache)}: it is not a plain folder. Move it out of the way, or pass --from.`);
  const status = lstatOrNull(cache);
  if (status !== null) {
    if (status.isSymbolicLink() || !status.isDirectory() || lstatOrNull(join(cache, '.git')) === null || !usableShelf(cache)) {
      throw new ExtensionsError(`Refusing ${cache}: it is not the clone LitGrok keeps (a link, a file, or a folder without .git and variants/litgrok). Move it out of the way, or pass --from.`);
    }
    if (refresh === 'pull' && context.write) {
      const pulled = tool('git', ['-C', cache, 'pull', '--ff-only'], { ...context, timeout: FETCH_TIMEOUT_MS });
      if (pulled.missing) throw new ExtensionsError(`git was not found on PATH, so the extensions could not be fetched. ${fetchHint(cache)}`);
      if (pulled.status !== 0) throw new ExtensionsError(`could not fetch the extensions: ${(pulled.stderr || pulled.stdout).trim()}\n${fetchHint(cache)}`);
      return { root: cache, kind: 'cache', ready: true, note: `pulled ${cache}` };
    }
    return { root: cache, kind: 'cache', ready: true, note: refresh === 'pull' ? `compared with the cached copy in ${cache}; --yes pulls it first, so the result may differ` : null };
  }
  if (!refresh) return { root: cache, kind: 'cache', ready: false, note: null };
  if (!context.write) return { root: cache, kind: 'cache', ready: false, note: `would clone ${SHELF_URL} (variants/litgrok only) into ${cache}; installed extensions are compared with it after the fetch` };
  const parent = dirname(cache);
  mkdirSync(parent, { recursive: true });
  const staging = mkdtempSync(join(parent, '.extensions-src-'));
  const target = join(staging, 'repo');
  const fail = (message) => {
    rmSync(staging, { recursive: true, force: true });
    throw new ExtensionsError(message);
  };
  const cloned = tool('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse', SHELF_URL, target], { ...context, timeout: FETCH_TIMEOUT_MS });
  if (cloned.missing) fail(`git was not found on PATH, so the extensions could not be fetched. ${fetchHint(cache)}`);
  if (cloned.status !== 0) fail(`could not fetch the extensions: ${(cloned.stderr || cloned.stdout).trim()}\n${fetchHint(cache)}`);
  const sparse = tool('git', ['-C', target, 'sparse-checkout', 'set', VARIANT.split(sep).join('/')], context);
  if (sparse.status !== 0 || !usableShelf(target)) fail(`the fetched shelf has no variants/litgrok folder. ${fetchHint(cache)}`);
  renameSync(target, cache);
  rmSync(staging, { recursive: true, force: true });
  return { root: cache, kind: 'cache', ready: true, note: `fetched ${SHELF_URL} (variants/litgrok only) into ${cache}` };
}

function stamp(now) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-`;
}

// Copies each store copy into one dated folder under ~/.grok/extension-backups, which Grok Build does not scan.
// Grok Build's uninstall deletes the store copy, so the copy is made first and nothing is lost.
function backUp(copies, context) {
  const { backups } = context.paths;
  const status = lstatOrNull(backups);
  if (status !== null && (status.isSymbolicLink() || !status.isDirectory())) throw new ExtensionsError(`Refusing ${backups}: it is not a plain folder.`);
  mkdirSync(backups, { recursive: true });
  const dated = mkdtempSync(join(backups, stamp(context.now())));
  const used = new Map();
  for (const copy of copies) {
    const store = lstatOrNull(copy.path);
    if (store === null) continue;
    if (store.isSymbolicLink() || !store.isDirectory()) throw new ExtensionsError(`Refusing the plugin store copy ${copy.path}: it is not a plain folder.`);
    const count = (used.get(copy.name) ?? 0) + 1;
    used.set(copy.name, count);
    cpSync(copy.path, join(dated, count === 1 ? copy.name : `${copy.name}-${count}`), { recursive: true, verbatimSymlinks: true, errorOnExist: true, force: false });
  }
  return dated;
}

function uninstallCopies(id, count, context) {
  for (let index = 0; index < count; index += 1) {
    const result = grok(['plugin', 'uninstall', id], context);
    if (result.status !== 0) throw new ExtensionsError(`grok plugin uninstall ${id} failed: ${(result.stderr || result.stdout).trim()}`);
  }
}

function installFolder(id, folder, context) {
  const result = grok(['plugin', 'install', folder, '--trust'], context);
  if (result.status !== 0) throw new ExtensionsError(`grok plugin install "${folder}" --trust failed: ${(result.stderr || result.stdout).trim()}`);
}

function copiesWord(count) {
  return count === 1 ? '1 copy' : `${count} copies`;
}

function previewBanner(stdout) {
  stdout.write('DRY RUN — nothing changed. Add --yes to do this:\n');
}

// install and update share one plan: an extension whose single store copy matches its source folder is current;
// any other state (no copy, an older copy, several copies) becomes backup, uninstall each copy, install once.
function planReplace(id, copies, source) {
  const folder = sourceFolder(source.root, id);
  if (source.ready && lstatOrNull(folder) === null) throw new ExtensionsError(`${folder} is missing from the extensions source; nothing was changed.`);
  const current = source.ready && copies.length === 1 && copies[0].path !== null && lstatOrNull(copies[0].path) !== null && treeDigest(copies[0].path) === treeDigest(folder);
  return { id, folder, copies, current };
}

function describeReplace(plan, stdout, verb) {
  if (plan.copies.length === 0) {
    stdout.write(`${plan.id}: would ${verb} from ${plan.folder}\n  grok plugin install "${plan.folder}" --trust\n`);
    return;
  }
  stdout.write(`${plan.id}: would ${verb}: back up ${copiesWord(plan.copies.length)} from the plugin store (${plan.copies.map(({ path }) => path).join(', ')}), run grok plugin uninstall ${plan.id} ${plan.copies.length === 1 ? 'once' : `${plan.copies.length} times`}, then install from ${plan.folder}\n  grok plugin install "${plan.folder}" --trust\n`);
}

function applyReplace(plan, context) {
  const backup = plan.copies.length > 0 ? backUp(plan.copies, context) : null;
  uninstallCopies(plan.id, plan.copies.length, context);
  try {
    installFolder(plan.id, plan.folder, context);
  } catch (error) {
    if (backup) error.message += `\nThe earlier copy is saved in ${backup}.`;
    throw error;
  }
  return backup;
}

function userManagedLine(id, { path, source }, verb) {
  return `${id}: a user-managed plugin of this name is installed from ${source ?? 'an unknown source'} (${path}); ${verb} leaves it alone. If the shelf copy should replace it, remove it yourself with grok plugin uninstall ${id} (its source folder stays), then rerun.`;
}

function runInstallOrUpdate(options, context) {
  const { stdout, stderr } = context;
  const update = options.verb === 'update';
  const plugins = installedPlugins(context);
  // A bare update or --all collects the ids itself, so a user-managed plugin among them is skipped, not refused.
  const collected = update && (options.ids.length === 0 || options.all);
  const ids = update && options.ids.length === 0 ? EXTENSION_IDS.filter((id) => plugins.some(({ name }) => name === id)) : options.ids;
  const blocked = [];
  const wanted = [];
  const skipped = [];
  for (const id of ids) {
    const copies = plugins.filter(({ name }) => name === id);
    if (update && copies.length === 0) {
      skipped.push(`${id}: not installed, left alone (litgrok extensions install ${id})`);
      continue;
    }
    const foreign = copies.filter(({ managed }) => !managed);
    if (foreign.length > 0) {
      const lines = foreign.map((copy) => userManagedLine(id, copy, options.verb));
      if (collected) skipped.push(...lines);
      else blocked.push({ id, kind: 'user-managed', lines });
      continue;
    }
    const competing = competingCopies(id, context.paths);
    if (competing.length > 0) {
      const lines = competing.map((copy) => `${id}: a same-name skill at ${copy.path} takes the bare /${id} name. ${copy.kind === 'old-litgrok' ? 'Fix' : 'Move it aside'}: ${competingFix(copy, context.paths.backups)}`);
      if (!options.allowShadow && !update) {
        blocked.push({ id, kind: 'competing', lines });
        continue;
      }
      for (const line of lines) stderr.write(`Warning: ${line}\n`);
    }
    wanted.push({ id, copies });
  }
  if (blocked.length > 0) {
    for (const { lines } of blocked) for (const line of lines) stderr.write(`${line}\n`);
    if (update) stderr.write('Nothing was updated.\n');
    else if (blocked.some(({ kind }) => kind === 'competing')) stderr.write('Nothing was installed. Move the copies named above, or rerun with --allow-shadow to install beside them; LitGrok never moves them itself.\n');
    else stderr.write('Nothing was installed.\n');
    return 1;
  }
  // The source is fetched only once nothing blocks the run.
  const source = resolveSource(options, context, { refresh: update ? 'pull' : 'fetch' });
  const plans = wanted.map(({ id, copies }) => planReplace(id, copies, source));
  if (!context.write) {
    previewBanner(stdout);
    if (source.note) stdout.write(`${source.note}\n`);
    for (const line of skipped) stdout.write(`${line}\n`);
    for (const plan of plans) {
      if (plan.current) stdout.write(`${plan.id}: current (${plan.copies[0].path})\n`);
      else if (!source.ready && plan.copies.length > 0) stdout.write(`${plan.id}: installed (${plan.copies.map(({ path }) => path).join(', ')}); compared after the fetch, and reinstalled only if it differs\n`);
      else describeReplace(plan, stdout, update ? 'update' : 'install');
    }
    return 0;
  }
  if (source.note) stdout.write(`${source.note}\n`);
  for (const line of skipped) stdout.write(`${line}\n`);
  let changed = 0;
  for (const plan of plans) {
    if (plan.current) {
      stdout.write(`${plan.id}: current (${plan.copies[0].path})\n`);
      continue;
    }
    const backup = applyReplace(plan, context);
    changed += 1;
    const word = update ? 'updated' : 'installed';
    stdout.write(`${plan.id}: ${word} from ${plan.folder}${backup ? `; the earlier ${copiesWord(plan.copies.length)} saved in ${backup}` : ''}\n`);
  }
  if (changed > 0) stdout.write('Start a new Grok Build session (or press r in the Plugins tab) to load the change.\n');
  return 0;
}

function runRemove(options, context) {
  const { stdout, stderr } = context;
  const plugins = installedPlugins(context);
  const plans = [];
  const refused = [];
  for (const id of options.ids) {
    const copies = plugins.filter(({ name }) => name === id);
    if (copies.length === 0) {
      plans.push({ id, copies });
      continue;
    }
    const foreign = copies.filter(({ managed }) => !managed);
    if (foreign.length > 0) refused.push(...foreign.map(({ path, source }) => `${id}: refusing a user-managed plugin installed from ${source ?? 'an unknown source'} (${path}); it does not come from a wjgoarxiv-skills variants/litgrok folder. Remove it yourself with grok plugin uninstall ${id} if you mean to.`));
    else plans.push({ id, copies });
  }
  if (refused.length > 0) {
    for (const line of refused) stderr.write(`${line}\n`);
    stderr.write('Nothing was removed.\n');
    return 1;
  }
  if (!context.write) previewBanner(stdout);
  for (const { id, copies } of plans) {
    if (copies.length === 0) {
      stdout.write(`${id}: not installed\n`);
      continue;
    }
    if (!context.write) {
      stdout.write(`${id}: would back up ${copiesWord(copies.length)} (${copies.map(({ path }) => path).join(', ')}) to ${context.paths.backups}, then run grok plugin uninstall ${id}${copies.length > 1 ? ` ${copies.length} times` : ''}\n`);
      continue;
    }
    const backup = backUp(copies, context);
    uninstallCopies(id, copies.length, context);
    stdout.write(`${id}: removed; the store copy is saved in ${backup}\n`);
  }
  if (context.write && plans.some(({ copies }) => copies.length > 0)) stdout.write('LitGrok keeps its note under each name, so /<skill> answers again with the install line.\n');
  return 0;
}

function folderBytes(path) {
  const status = lstatSync(path);
  if (!status.isDirectory()) return status.size;
  return readdirSync(path).reduce((total, name) => total + folderBytes(join(path, name)), 0);
}

function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function listBackups(context) {
  const { backups } = context.paths;
  const status = lstatOrNull(backups);
  if (status === null) return [];
  if (status.isSymbolicLink() || !status.isDirectory()) throw new ExtensionsError(`Refusing ${backups}: it is not a plain folder.`);
  return readdirSync(backups).sort().map((name) => {
    const path = join(backups, name);
    const entry = lstatSync(path);
    return { path, link: entry.isSymbolicLink(), bytes: entry.isSymbolicLink() ? 0 : folderBytes(path), modified: entry.mtime };
  });
}

function runPrune(options, context) {
  const { stdout } = context;
  const all = listBackups(context);
  if (all.length === 0) {
    stdout.write(`No backups in ${context.paths.backups}.\n`);
    return 0;
  }
  const cutoff = options.olderThan === null ? null : context.now().getTime() - options.olderThan * 86_400_000;
  const chosen = all.filter(({ modified }) => cutoff === null || modified.getTime() < cutoff);
  const total = chosen.reduce((sum, { bytes }) => sum + bytes, 0);
  if (!context.write) {
    previewBanner(stdout);
    if (chosen.length > 0) stdout.write(`A backup may also hold your own skill: check and the extension notes suggest moving a same-name personal skill into ${context.paths.backups}. Look inside before --yes.\n`);
  }
  for (const backup of all) {
    const picked = chosen.includes(backup);
    if (backup.link) stdout.write(`skip ${backup.path} (a link, never followed)\n`);
    else stdout.write(`${picked ? (context.write ? 'delete' : 'would delete') : 'keep'} ${backup.path} ${humanBytes(backup.bytes)}\n`);
  }
  if (context.write) {
    for (const backup of chosen) {
      if (backup.link || dirname(backup.path) !== context.paths.backups) continue;
      rmSync(backup.path, { recursive: true });
    }
  }
  stdout.write(`${context.write ? 'Deleted' : 'Would delete'} ${chosen.filter(({ link }) => !link).length} of ${all.length} backups, ${humanBytes(total)}.\n`);
  if (chosen.length === 0) stdout.write('Nothing matched; --older-than <days> picks by age.\n');
  return 0;
}

// The read-only survey that list, check and doctor share. A missing grok is reported, not thrown.
function survey(context, { withPlugins = true } = {}) {
  let plugins = [];
  let hostError = null;
  let hostTimedOut = false;
  if (withPlugins) {
    try {
      plugins = installedPlugins(context);
    } catch (error) {
      if (!(error instanceof ExtensionsError)) throw error;
      hostError = error.message;
      hostTimedOut = error.cause === 'timeout';
    }
  }
  const extensions = EXTENSION_IDS.map((id) => {
    const copies = plugins.filter(({ name }) => name === id);
    let status = 'not-installed';
    if (copies.length > 0) status = copies.every(({ managed }) => managed) ? 'installed' : 'user-managed';
    return { id, family: Object.keys(FAMILIES).find((name) => FAMILIES[name].includes(id)), status, plugins: copies, competing: competingCopies(id, context.paths) };
  });
  return { extensions, hostError, hostTimedOut };
}

function findings(context, report) {
  const { backups } = context.paths;
  const items = [];
  if (report.hostError) items.push({ kind: 'host', id: null, action: true, message: `plugin copies not checked: ${report.hostError}`, fix: 'put grok on PATH, then rerun litgrok extensions check' });
  for (const extension of report.extensions) {
    const { id, plugins } = extension;
    if (plugins.length > 1) items.push({ kind: 'duplicate', id, action: true, message: `${id}: ${plugins.length} plugin copies (${plugins.map(({ source }) => source).join(', ')})`, fix: plugins.some(({ managed }) => !managed) ? `grok plugin uninstall ${id} once per copy (${plugins.length} times; each source folder stays), then reinstall the one you want, e.g. litgrok extensions install ${id} --yes` : `litgrok extensions update ${id} --yes` });
    for (const plugin of plugins) {
      if (!plugin.managed) items.push({ kind: 'user-managed', id, action: false, message: `${id}: a user-managed plugin from ${plugin.source}; LitGrok leaves it alone`, fix: null });
      else if (!plugin.source_exists) items.push({ kind: 'source-missing', id, action: true, message: `${id}: its source ${plugin.source} no longer exists, so a later update cannot copy from it`, fix: `litgrok extensions update ${id} --yes` });
    }
    for (const copy of extension.competing) {
      items.push({ kind: copy.kind === 'old-litgrok' ? 'old-litgrok-copy' : 'competing', id, action: true, message: `${id}: ${copy.kind === 'old-litgrok' ? 'an earlier LitGrok copy' : 'a same-name skill'} at ${copy.path} takes the bare /${id} name`, fix: competingFix(copy, backups) });
    }
  }
  const saved = listBackups(context);
  if (saved.length > 0) {
    const bytes = saved.reduce((sum, { bytes: size }) => sum + size, 0);
    items.push({ kind: 'backups', id: null, action: false, message: `${saved.length} backup${saved.length === 1 ? '' : 's'} in ${backups}, ${humanBytes(bytes)}`, fix: 'litgrok extensions prune-backups' });
  }
  return items;
}

function runList(options, context) {
  const { stdout } = context;
  const report = survey(context);
  const source = resolveSource({ from: null }, context, { refresh: false });
  if (options.json) {
    stdout.write(`${JSON.stringify({ source: { path: source.root, fetched: source.ready }, host_error: report.hostError, extensions: report.extensions }, null, 2)}\n`);
    return 0;
  }
  stdout.write(`LitFamily extensions for Grok Build (shelf ${SHELF_URL}; LitGrok's copy ${source.ready ? source.root : 'not fetched yet'})\n`);
  if (report.hostError) stdout.write(`plugin copies not checked: ${report.hostError}\n`);
  const width = Math.max(...EXTENSION_IDS.map((id) => id.length));
  for (const extension of report.extensions) {
    const label = { 'not-installed': 'not installed', installed: 'installed', 'user-managed': 'user-managed' }[extension.status];
    const detail = extension.plugins.map((plugin) => `${plugin.source}${plugin.installed_at ? ` · ${plugin.installed_at}` : ''}`).join('; ');
    stdout.write(`  ${extension.id.padEnd(width)}  ${label}${extension.plugins.length > 1 ? ` ×${extension.plugins.length}` : ''}${detail ? ` · ${detail}` : ''}\n`);
    for (const copy of extension.competing) stdout.write(`  ${''.padEnd(width)}  competing: ${copy.path}\n`);
  }
  stdout.write('Install with: litgrok extensions install <id> (add --yes to do it). Problems and fixes: litgrok extensions check\n');
  return 0;
}

function runCheck(options, context) {
  const { stdout } = context;
  const items = findings(context, survey(context));
  const clean = !items.some(({ action }) => action);
  if (options.json) {
    stdout.write(`${JSON.stringify({ clean, findings: items }, null, 2)}\n`);
    return clean ? 0 : 1;
  }
  for (const item of items) stdout.write(`${item.action ? 'FIX' : 'note'} ${item.message}${item.fix ? `\n     ${item.fix}` : ''}\n`);
  stdout.write(clean ? 'Extensions: clean, nothing needs action.\n' : `Extensions: ${items.filter(({ action }) => action).length} to fix; run the line under each FIX.\n`);
  return clean ? 0 : 1;
}

function contextFrom({ env, cwd, stdout, stderr, now }, write) {
  return { env, cwd, stdout, stderr, write, now: now ?? (() => new Date()), paths: paths(env, cwd) };
}

// One line for `litgrok doctor`: the check logic, summarised.
export function extensionsDoctorLine({ env, cwd }) {
  try {
    const context = { ...contextFrom({ env, cwd }, false), hostTimeout: DOCTOR_TIMEOUT_MS };
    const report = survey(context);
    const items = findings(context, report);
    const installed = report.extensions.filter(({ status }) => status !== 'not-installed').length;
    const toFix = items.filter(({ action }) => action).length;
    if (report.hostTimedOut) return `EXTENSIONS: host listing unavailable (${report.hostError}) · run: litgrok extensions check`;
    if (report.hostError) return `EXTENSIONS: grok not checked · ${toFix} to fix (run: litgrok extensions check)`;
    return toFix === 0
      ? `EXTENSIONS: ${installed} of ${EXTENSION_IDS.length} installed · nothing to fix (litgrok extensions list)`
      : `EXTENSIONS: ${installed} of ${EXTENSION_IDS.length} installed · ${toFix} to fix (run: litgrok extensions check)`;
  } catch (error) {
    return `EXTENSIONS: not checked (${error instanceof Error ? error.message : String(error)})`;
  }
}

// For the install card: the file-system half of check (no grok call), so an install never starts Grok Build.
export function competingSummary({ env, cwd }) {
  try {
    const context = contextFrom({ env, cwd }, false);
    return EXTENSION_IDS.flatMap((id) => competingCopies(id, context.paths).map(({ path }) => path));
  } catch {
    return [];
  }
}

export async function runExtensions(args, { env, cwd, stdout, stderr, now }) {
  if (args.length > 0 && args.every((argument) => ['--help', '-h', '--no-color'].includes(argument)) && args.some((argument) => argument !== '--no-color')) {
    stdout.write(EXTENSIONS_USAGE);
    return 0;
  }
  const options = parse(args);
  if (!options) {
    stderr.write(EXTENSIONS_USAGE);
    return 1;
  }
  try {
    const context = contextFrom({ env, cwd, stdout, stderr, now }, options.yes && !options.dryRun);
    if (options.verb === 'list') return runList(options, context);
    if (options.verb === 'check') return runCheck(options, context);
    if (options.verb === 'remove') return runRemove(options, context);
    if (options.verb === 'prune-backups') return runPrune(options, context);
    return runInstallOrUpdate(options, context);
  } catch (error) {
    if (!(error instanceof ExtensionsError)) throw error;
    stderr.write(`litgrok extensions: ${error.message}\n`);
    return 1;
  }
}
