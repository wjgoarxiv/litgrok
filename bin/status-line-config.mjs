import { randomUUID } from 'node:crypto';
import { constants, copyFileSync, lstatSync, linkSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const MARKER = '# litgrok-managed-status-line-v1';
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
  const markers = lines.map((line, index) => rawLineText(line) === MARKER ? index : -1).filter((index) => index >= 0);
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
    headerIndex,
    sectionEnd,
    valueIndexes: [type[0].index, commandValues[0].index, refresh[0].index],
  };
}

function hasStatusLineSetting(text) {
  return splitLines(text).some((line) => /\bstatus_line\b/u.test(lineText(line)));
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

function statusLineBlock(command) {
  return [
    MARKER,
    '[ui.status_line]',
    'type = "command"',
    `command = ${JSON.stringify(command)}`,
    'refresh_interval = 2',
  ].join('\n');
}

function appendBlock(text, block) {
  if (!text) return `${block}\n`;
  const separator = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${separator}${block}\n`;
}

export function installStatusLine(root) {
  const path = join(root, 'config.toml');
  const command = commandValue(root);
  const previous = readConfig(path);
  if (managedBlock(previous.text, command)) return { changed: false, detail: 'already managed by LitGrok' };
  if (previous.text.includes(MARKER)) return { changed: false, detail: 'modified LitGrok status-line config preserved' };
  if (hasStatusLineSetting(previous.text)) return { changed: false, detail: 'existing user status_line preserved' };
  const next = appendBlock(previous.text, statusLineBlock(command));
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
  return lines.filter((_, index) => !remove.has(index)).join('');
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
