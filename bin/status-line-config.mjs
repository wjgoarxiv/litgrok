import { randomUUID } from 'node:crypto';
import { constants, copyFileSync, lstatSync, linkSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const MARKER = '# litgrok-managed-status-line-v1';
// Written when the config did not end with a newline, so removal can take back the one LitGrok added.
const MARKER_ADDED_NEWLINE = `${MARKER} added-final-newline`;
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

function tableHeader(line) {
  return /^\[\s*ui\s*\.\s*status_line\s*\]$/u.test(lineText(line));
}

function managedBlock(text, command) {
  const lines = splitLines(text);
  const markers = lines.map((line, index) => [MARKER, MARKER_ADDED_NEWLINE].includes(rawLineText(line)) ? index : -1).filter((index) => index >= 0);
  if (markers.length !== 1) return null;
  const markerIndex = markers[0];
  let headerIndex = markerIndex + 1;
  while (headerIndex < lines.length && lineText(lines[headerIndex]) === '') headerIndex += 1;
  if (!tableHeader(lines[headerIndex] ?? '')) return null;
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
  const type = values.get('type') ?? [];
  const commandValues = values.get('command') ?? [];
  const refresh = values.get('refresh_interval') ?? [];
  if (type.length !== 1 || type[0].value !== '"command"'
    || commandValues.length !== 1 || commandValues[0].value !== JSON.stringify(command)
    || refresh.length !== 1 || refresh[0].value !== '2') return null;
  return {
    markerIndex,
    addedNewline: rawLineText(lines[markerIndex]) === MARKER_ADDED_NEWLINE,
    headerIndex,
    sectionEnd,
    valueIndexes: [type[0].index, commandValues[0].index, refresh[0].index],
  };
}

function hasStatusLineSetting(text) {
  return splitLines(text).some((line) => /\bstatus_line\b/u.test(lineText(line)));
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

function commandValue(root) {
  const script = resolve(root, 'hooks', 'lit-status-line.mjs');
  return `node ${shellQuote(script)}`;
}

function backup(path) {
  const target = `${path}.litgrok-backup-${randomUUID()}`;
  copyFileSync(path, target, constants.COPYFILE_EXCL);
  return target;
}

function writeConfig(path, previous, next) {
  const directory = dirname(path);
  const temporary = join(directory, `.${basename(path)}.${randomUUID()}.tmp`);
  if (previous.exists) backup(path);
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

function statusLineBlock(command, marker) {
  return [
    marker,
    '[ui.status_line]',
    'type = "command"',
    `command = ${JSON.stringify(command)}`,
    'refresh_interval = 2',
  ].join('\n');
}

// No separator line is added, so removing the block gives back the original bytes.
function appendBlock(text, command) {
  if (!text || text.endsWith('\n')) return `${text}${statusLineBlock(command, MARKER)}\n`;
  return `${text}\n${statusLineBlock(command, MARKER_ADDED_NEWLINE)}\n`;
}

export function installStatusLine(root) {
  const path = join(root, 'config.toml');
  const command = commandValue(root);
  const previous = readConfig(path);
  if (managedBlock(previous.text, command)) return { changed: false, detail: 'already managed by LitGrok' };
  if (previous.text.includes(MARKER)) return { changed: false, detail: 'modified LitGrok status-line config preserved' };
  if (hasStatusLineSetting(previous.text)) return { changed: false, detail: 'existing user status_line preserved' };
  const conflict = conflictingUi(previous.text);
  if (conflict) {
    return {
      changed: false,
      detail: `status line not configured: ${path} sets ${conflict} at the top level, which a [ui.status_line] table cannot extend; add status_line inside your ui setting yourself`,
    };
  }
  const next = appendBlock(previous.text, command);
  writeConfig(path, previous, next);
  return { changed: true, detail: 'user status line configured' };
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

export function removeStatusLine(root) {
  const path = join(root, 'config.toml');
  const command = commandValue(root);
  const previous = readConfig(path);
  if (!previous.exists) return { changed: false, detail: 'no user config found' };
  const block = managedBlock(previous.text, command);
  if (!block) return { changed: false, detail: 'no unchanged LitGrok status-line value found' };
  const next = removeManagedBlock(previous.text, block);
  if (next === previous.text) return { changed: false, detail: 'no LitGrok status-line value removed' };
  writeConfig(path, previous, next);
  return { changed: true, detail: 'LitGrok status-line value removed' };
}
