import { randomUUID } from 'node:crypto';
import { constants, copyFileSync, lstatSync, linkSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, win32 } from 'node:path';

const MARKER = '# litgrok-managed-status-line-v1';
const NOTIFY_MARKER = '# litgrok-managed-notifications-v1';
// The finish alert: Grok's own terminal notification for a finished turn, an approval request or an
// error, raised even while the terminal has focus (Grok's default fires only when it does not).
const NOTIFY_VALUES = [['condition', '"always"'], ['events', '["turn_complete", "approval_required", "agent_error"]']];
const MAX_CONFIG_BYTES = 1024 * 1024;

function configError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function readConfig(path) {
  try {
    const status = lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size > MAX_CONFIG_BYTES) throw configError('STATUS_CONFIG_UNSAFE');
    return { exists: true, mode: status.mode & 0o777, text: readFileSync(path, 'utf8') };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, mode: 0o600, text: '' };
    throw error;
  }
}

function withoutComment(line) {
  let quote = '';
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote) {
      if (quote === '"' && character === '\\' && !escaped) escaped = true;
      else {
        if (character === quote && !escaped) quote = '';
        escaped = false;
      }
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '#') return line.slice(0, index);
  }
  return line;
}

function lineText(line) {
  return withoutComment(line.replace(/\r?\n$/u, '').replace(/^\uFEFF/u, '')).trim();
}

function rawLineText(line) {
  return line.replace(/\r?\n$/u, '').replace(/^\uFEFF/u, '').trim();
}

function splitLines(text) {
  return text.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
}

const STATUS_LINE_HEADER = /^\[\s*ui\s*\.\s*status_line\s*\]$/u;
const NOTIFY_HEADER = /^\[\s*ui\s*\.\s*notifications\s*\]$/u;

function statusLineValues(command) {
  return [['type', '"command"'], ['command', JSON.stringify(command)], ['refresh_interval', '2']];
}

// One table LitGrok added after its marker, found only while its values are exactly as written.
function managedBlock(text, { marker, header, values: expected }) {
  const lines = splitLines(text);
  const markers = lines.map((line, index) => [marker, `${marker} added-final-newline`].includes(rawLineText(line)) ? index : -1).filter((index) => index >= 0);
  if (markers.length !== 1) return null;
  const markerIndex = markers[0];
  let headerIndex = markerIndex + 1;
  while (headerIndex < lines.length && lineText(lines[headerIndex]) === '') headerIndex += 1;
  if (!header.test(lineText(lines[headerIndex] ?? ''))) return null;
  let sectionEnd = headerIndex + 1;
  while (sectionEnd < lines.length && !/^\s*\[\[?[^\]]+\]\]?\s*$/u.test(lines[sectionEnd].replace(/\r?\n$/u, ''))) sectionEnd += 1;

  const values = new Map();
  for (let index = headerIndex + 1; index < sectionEnd; index += 1) {
    const code = lineText(lines[index]);
    const assignment = code.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*?)\s*$/u);
    if (!assignment) continue;
    const entries = values.get(assignment[1]) ?? [];
    entries.push({ index, value: assignment[2] });
    values.set(assignment[1], entries);
  }
  const found = expected.map(([key]) => values.get(key) ?? []);
  if (found.some((entries, index) => entries.length !== 1 || entries[0].value !== expected[index][1])) return null;
  return {
    markerIndex,
    addedNewline: rawLineText(lines[markerIndex]) === `${marker} added-final-newline`,
    headerIndex,
    sectionEnd,
    valueIndexes: found.map((entries) => entries[0].index),
  };
}

function hasSetting(text, key) {
  return splitLines(text).some((line) => new RegExp(`\\b${key}\\b`, 'u').test(lineText(line)));
}

// The lines that start a TOML statement: lines inside a multi-line string, array or inline table are
// skipped, so `[1, 2]` closing an array or `[x]` inside a string is never taken for a table header.
function statements(text) {
  const found = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    if (depth === 0 && quote === null) {
      const code = lineText(text.slice(start, end));
      if (code.startsWith('[')) {
        found.push({ code, header: true });
        start = end + 1;
        continue;
      }
      if (code) found.push({ code, header: false });
    }
    for (let index = start; index < end; index += 1) {
      const character = text[index];
      if (quote !== null) {
        if (character === '\\' && (quote === '"' || quote === '"""')) index += 1;
        else if (text.startsWith(quote, index)) {
          index += quote.length - 1;
          quote = null;
        }
      } else if (character === '#') break;
      else if (text.startsWith('"""', index) || text.startsWith("'''", index)) {
        quote = text.slice(index, index + 3);
        index += 2;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === '[' || character === '{') depth += 1;
      else if ((character === ']' || character === '}') && depth > 0) depth -= 1;
    }
    if (quote === '"' || quote === "'") quote = null;
    start = end + 1;
  }
  return found;
}

// A [ui.status_line] header cannot extend a top-level `ui = ...` value or inline table (TOML rejects the
// file), and after [[ui]] it would attach to an array element.
function conflictingUi(text) {
  let topLevel = true;
  for (const { code, header } of statements(text)) {
    if (header) {
      if (/^\[\[\s*(?:ui|"ui"|'ui')\s*\]\]$/u.test(code)) return '[[ui]]';
      topLevel = false;
    } else if (topLevel && /^(?:ui|"ui"|'ui')\s*=/u.test(code)) return 'ui = ...';
  }
  return null;
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./-]+$/u.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

// The shell Grok runs the command in is cmd.exe or PowerShell on Windows, where single quotes do not
// quote; forward slashes keep the path valid in both and in a POSIX-style shell.
export function statusLineCommand(root, platform = process.platform) {
  if (platform === 'win32') {
    const script = win32.resolve(root, 'hooks', 'lit-status-line.mjs').replaceAll('\\', '/');
    return /^[A-Za-z0-9_./:-]+$/u.test(script) ? `node ${script}` : `node "${script}"`;
  }
  return `node ${shellQuote(resolve(root, 'hooks', 'lit-status-line.mjs'))}`;
}

function commandValue(root) {
  return statusLineCommand(root);
}

function backup(path) {
  const target = `${path}.litgrok-backup-${randomUUID()}`;
  copyFileSync(path, target, constants.COPYFILE_EXCL);
  return target;
}

// `afterBackup` is a test seam: it runs between the backup and the replace, where a concurrent edit
// must make the write fail rather than be overwritten.
function writeConfig(path, previous, next, { afterBackup } = {}) {
  const directory = dirname(path);
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  if (previous.exists) backup(path);
  afterBackup?.();
  try {
    writeFileSync(temporary, next, { flag: 'wx', mode: previous.mode });
    if (previous.exists) {
      if (readFileSync(path, 'utf8') !== previous.text) throw configError('STATUS_CONFIG_CHANGED');
      renameSync(temporary, path);
    } else {
      linkSync(temporary, path);
      unlinkSync(temporary);
    }
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function blockText(marker, table, values) {
  return [marker, table, ...values.map(([key, value]) => `${key} = ${value}`)].join('\n');
}

// No separator line is added, so removing the block gives back the original bytes. A config that did
// not end with a newline gets the marker's added-final-newline form, so removal can take that one back.
function appendBlock(text, marker, table, values) {
  if (!text || text.endsWith('\n')) return `${text}${blockText(marker, table, values)}\n`;
  return `${text}\n${blockText(`${marker} added-final-newline`, table, values)}\n`;
}

function statusLineSpec(root) {
  return { marker: MARKER, header: STATUS_LINE_HEADER, values: statusLineValues(commandValue(root)) };
}

function notifySpec() {
  return { marker: NOTIFY_MARKER, header: NOTIFY_HEADER, values: NOTIFY_VALUES };
}

export function installStatusLine(root, options = {}) {
  const path = join(root, 'config.toml');
  const spec = statusLineSpec(root);
  const previous = readConfig(path);
  if (managedBlock(previous.text, spec)) return { changed: false, detail: 'already managed by LitGrok' };
  if (previous.text.includes(MARKER)) return { changed: false, detail: 'modified LitGrok status-line config preserved' };
  if (hasSetting(previous.text, 'status_line')) return { changed: false, detail: 'existing user status_line preserved' };
  const conflict = conflictingUi(previous.text);
  if (conflict) {
    return {
      changed: false,
      detail: `status line not configured: ${path} sets ${conflict} at the top level, which a [ui.status_line] table cannot extend; add status_line inside your ui setting yourself`,
    };
  }
  const next = appendBlock(previous.text, MARKER, '[ui.status_line]', spec.values);
  writeConfig(path, previous, next, options);
  return { changed: true, detail: 'user status line configured' };
}

// The opt-in finish alert. Any notification setting of the user's own is left as it is.
export function installNotifications(root, options = {}) {
  const path = join(root, 'config.toml');
  const spec = notifySpec();
  const previous = readConfig(path);
  if (managedBlock(previous.text, spec)) return { changed: false, detail: 'finish notification already managed by LitGrok' };
  if (previous.text.includes(NOTIFY_MARKER)) return { changed: false, detail: 'modified LitGrok notification config preserved' };
  if (hasSetting(previous.text, 'notifications')) return { changed: false, detail: 'existing user notifications preserved' };
  const conflict = conflictingUi(previous.text);
  if (conflict) {
    return {
      changed: false,
      detail: `finish notification not configured: ${path} sets ${conflict} at the top level, which a [ui.notifications] table cannot extend; add notifications inside your ui setting yourself`,
    };
  }
  writeConfig(path, previous, appendBlock(previous.text, NOTIFY_MARKER, '[ui.notifications]', NOTIFY_VALUES), options);
  return { changed: true, detail: 'finish notification configured' };
}

function removeManagedBlock(text, block) {
  const lines = splitLines(text);
  const remove = new Set([block.markerIndex, ...block.valueIndexes]);
  const remaining = [];
  for (let index = block.headerIndex + 1; index < block.sectionEnd; index += 1) {
    if (!remove.has(index) && lineText(lines[index]) !== '') remaining.push(index);
  }
  if (remaining.length === 0) remove.add(block.headerIndex);
  const kept = lines.map((line, index) => (remove.has(index) ? null : line));
  // Take back the final newline LitGrok added, but only while nothing follows the user's last line.
  const before = block.markerIndex - 1;
  if (block.addedNewline && before >= 0 && kept.slice(before + 1).every((line) => line === null) && kept[before].endsWith('\n')) {
    kept[before] = kept[before].slice(0, -1);
  }
  return kept.filter((line) => line !== null).join('');
}

function removeBlock(root, spec, name, options) {
  const path = join(root, 'config.toml');
  const previous = readConfig(path);
  if (!previous.exists) return { changed: false, detail: 'no user config found' };
  const found = managedBlock(previous.text, spec);
  if (!found) return { changed: false, detail: `no unchanged LitGrok ${name} value found` };
  const next = removeManagedBlock(previous.text, found);
  if (next === previous.text) return { changed: false, detail: `no LitGrok ${name} value removed` };
  writeConfig(path, previous, next, options);
  return { changed: true, detail: `LitGrok ${name} value removed` };
}

export function removeStatusLine(root, options = {}) {
  return removeBlock(root, statusLineSpec(root), 'status-line', options);
}

export function removeNotifications(root, options = {}) {
  return removeBlock(root, notifySpec(), 'notification', options);
}
