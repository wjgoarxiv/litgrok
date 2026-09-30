// Automatic handoff settings shared by the `litgrok auto-handoff` command, the status line and the Stop hook.
//
// The feature is OFF until the user turns it on. The percent always comes from the user (command or
// environment); `on` without a number reuses the last value, and there is no built-in default.

import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { readNewestContextRecord } from './litgrok-hud-state.mjs';

export const ENABLE_VARIABLE = 'LITGROK_AUTO_HANDOFF';
export const PERCENT_VARIABLE = 'LITGROK_AUTO_HANDOFF_PERCENT';
export const CONFIG_FILE = '.grok/litgrok/auto-handoff.json';
const MAX_CONFIG_BYTES = 4096;
const PERCENT_PATTERN = /^[1-9]\d?$/u;
const USAGE = 'Usage: litgrok auto-handoff on [percent]|off|status\n';

export function parsePercent(text) {
  return typeof text === 'string' && PERCENT_PATTERN.test(text) ? Number(text) : null;
}

function configPath(directory) {
  return join(directory, ...CONFIG_FILE.split('/'));
}

// Returns { found: false } or { found: true, valid, enabled, percent, reason }.
export function readAutoHandoffFile(directory) {
  const path = configPath(directory);
  let status;
  try {
    status = lstatSync(path);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return { found: false };
    return { found: true, valid: false, reason: 'cannot be read' };
  }
  if (!status.isFile() || status.isSymbolicLink() || status.size > MAX_CONFIG_BYTES) {
    return { found: true, valid: false, reason: 'is not a small regular file' };
  }
  let value;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { found: true, valid: false, reason: 'is not valid JSON' };
  }
  const plain = value !== null && typeof value === 'object' && !Array.isArray(value);
  const percentOk = plain && (value.percent === null || (Number.isInteger(value.percent) && value.percent >= 1 && value.percent <= 99));
  if (!plain || typeof value.enabled !== 'boolean' || !percentOk) {
    return { found: true, valid: false, reason: 'needs "enabled" as true or false and "percent" as null or a whole number from 1 to 99' };
  }
  return { found: true, valid: true, enabled: value.enabled, percent: value.percent };
}

// Merges the project file with the environment. The environment wins; any invalid value means OFF.
export function resolveAutoHandoff({ env = process.env, dirs = [] } = {}) {
  const warnings = [];
  let invalid = false;
  let file = { found: false };
  let directory = null;
  for (const candidate of dirs) {
    if (typeof candidate !== 'string' || !isAbsolute(candidate)) continue;
    const read = readAutoHandoffFile(candidate);
    if (!read.found) continue;
    file = read;
    directory = candidate;
    break;
  }
  if (file.found && !file.valid) {
    invalid = true;
    warnings.push(`${CONFIG_FILE} ${file.reason}, so automatic handoff is OFF. Run litgrok auto-handoff on <percent> to rewrite it.`);
  }

  let flag;
  const rawFlag = env[ENABLE_VARIABLE];
  if (rawFlag === '1') flag = true;
  else if (rawFlag === '0') flag = false;
  else if (rawFlag !== undefined && rawFlag !== '') {
    invalid = true;
    warnings.push(`${ENABLE_VARIABLE} must be 1 or 0, so automatic handoff is OFF.`);
  }

  let envPercent = null;
  const rawPercent = env[PERCENT_VARIABLE];
  if (rawPercent !== undefined && rawPercent !== '') {
    envPercent = parsePercent(rawPercent);
    if (envPercent === null) {
      invalid = true;
      warnings.push(`${PERCENT_VARIABLE} must be a whole number from 1 to 99, so automatic handoff is OFF.`);
    }
  }

  const filePercent = file.found && file.valid ? file.percent : null;
  const percent = envPercent ?? filePercent;
  const enabled = !invalid && (flag ?? (file.found && file.valid ? file.enabled : false));
  if (enabled && percent === null) {
    warnings.push('Automatic handoff is ON but no percent is set, so nothing happens. Run litgrok auto-handoff on <percent>.');
  }
  return {
    enabled,
    percent,
    filePercent,
    directory,
    active: enabled && percent !== null,
    invalid,
    warnings,
    source: {
      enable: flag !== undefined ? ENABLE_VARIABLE : (file.found && file.valid ? CONFIG_FILE : 'default'),
      percent: envPercent !== null ? PERCENT_VARIABLE : (filePercent !== null ? CONFIG_FILE : 'unset'),
      envOverridesFile: flag !== undefined && file.found && file.valid && file.enabled !== flag,
    },
  };
}

function ensureDirectory(path) {
  try {
    mkdirSync(path);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const status = lstatSync(path);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    const refusal = new Error(`Refusing a symbolic link or non-directory at ${path}`);
    refusal.code = 'AUTO_HANDOFF_PATH_UNSAFE';
    throw refusal;
  }
}

export function writeAutoHandoffFile(directory, settings) {
  ensureDirectory(join(directory, '.grok'));
  ensureDirectory(join(directory, '.grok', 'litgrok'));
  const target = configPath(directory);
  try {
    const existing = lstatSync(target);
    if (!existing.isFile() || existing.isSymbolicLink()) {
      const refusal = new Error(`Refusing a symbolic link or non-file at ${target}`);
      refusal.code = 'AUTO_HANDOFF_PATH_UNSAFE';
      throw refusal;
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const temporary = join(directory, '.grok', 'litgrok', `.auto-handoff-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, `${JSON.stringify({ enabled: settings.enabled, percent: settings.percent })}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, target);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function hostWarning(percent, env) {
  const host = readNewestContextRecord(env)?.autoCompactThresholdPercent ?? null;
  if (host === null) return { host, warning: null };
  const warning = percent !== null && percent >= host
    ? `Warning: ${percent} percent is at or above Grok's own auto-compact point of ${host} percent, so Grok compacts first and the handoff may not be written in time. Choose a lower percent.`
    : null;
  return { host, warning };
}

function describe(resolved, env) {
  const lines = [];
  lines.push(resolved.enabled && resolved.percent !== null
    ? `Automatic handoff: ON at ${resolved.percent} percent`
    : 'Automatic handoff: OFF');
  lines.push(`Set by: ${resolved.source.enable === 'default' ? 'nothing yet (OFF is the default)' : resolved.source.enable}`);
  lines.push(`Percent: ${resolved.percent === null ? 'not set' : `${resolved.percent}, from ${resolved.source.percent}`}`);
  if (resolved.source.envOverridesFile) lines.push(`${ENABLE_VARIABLE} in this environment overrides ${CONFIG_FILE}.`);
  const { host, warning } = hostWarning(resolved.percent, env);
  lines.push(host === null
    ? "Grok's own auto-compact point: not reported yet (the status line reports it while automatic handoff is ON; Grok's documented default is 85 percent)"
    : `Grok's own auto-compact point: ${host} percent (reported by the status line)`);
  lines.push('It needs the LitGrok status line (litgrok install --user --status-line) to see how full the context is. Without it, nothing happens.');
  for (const text of resolved.warnings) lines.push(`Warning: ${text}`);
  if (warning) lines.push(warning);
  return lines;
}

export async function runAutoHandoff(args, { env = process.env, stdout = process.stdout, stderr = process.stderr, cwd = process.cwd() } = {}) {
  const [action, value, ...rest] = args;
  const fail = (text) => {
    stderr.write(`${text}\n`);
    return 1;
  };
  if (rest.length > 0 || !['on', 'off', 'status'].includes(action) || (action !== 'on' && value !== undefined)) {
    stderr.write(USAGE);
    return 1;
  }

  const resolved = resolveAutoHandoff({ env, dirs: [cwd] });
  if (action === 'status') {
    stdout.write(`${describe(resolved, env).join('\n')}\n`);
    return 0;
  }

  const stored = readAutoHandoffFile(cwd);
  const previous = stored.found && stored.valid ? stored.percent : null;
  let next;
  if (action === 'off') {
    next = { enabled: false, percent: previous };
  } else if (value !== undefined) {
    const percent = parsePercent(value);
    if (percent === null) return fail(`"${value}" is not a usable percent. Use a whole number between 1 and 99, for example: litgrok auto-handoff on 60`);
    next = { enabled: true, percent };
  } else {
    const percent = previous ?? resolved.percent;
    if (percent === null) return fail('Which percent should trigger the handoff (1-99)? Run: litgrok auto-handoff on <percent>');
    next = { enabled: true, percent };
  }

  try {
    writeAutoHandoffFile(cwd, next);
  } catch (error) {
    return fail(`litgrok auto-handoff: ${error instanceof Error ? error.message : String(error)}`);
  }

  const after = resolveAutoHandoff({ env, dirs: [cwd] });
  const lines = [];
  if (action === 'off') {
    lines.push('Automatic handoff is OFF for this project.');
    if (next.percent !== null) lines.push(`${next.percent} percent is remembered for the next "on".`);
  } else {
    lines.push(`Automatic handoff is ON at ${next.percent} percent for this project.`);
    lines.push('When a turn ends with the context at or above that percent, the model is asked to write a handoff and then to tell you to run /compact.');
  }
  if (after.enabled !== next.enabled) lines.push(`Warning: ${ENABLE_VARIABLE} is set in this shell, so sessions started from here stay ${after.enabled ? 'ON' : 'OFF'}.`);
  const { warning } = hostWarning(next.enabled ? next.percent : null, env);
  if (warning) lines.push(warning);
  stdout.write(`${lines.join('\n')}\n`);
  return 0;
}
