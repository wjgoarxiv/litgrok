#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_FILES = 50_000;
const MAX_FILES = 100_000;
const MAX_OUTPUT_BYTES = 1_024 * 1_024;
const MAX_INSPECTION_ENTRIES = 64;
const MAX_INSPECTION_KEYS = 64;
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.grok',
  '.hg',
  '.svn',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'vendor',
]);

export class LspSetupError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'LspSetupError';
    this.code = code;
  }
}

function fail(code, detail = '') {
  throw new LspSetupError(code, detail);
}

function safeString(value, maximum) {
  return typeof value === 'string' && value.length <= maximum && !value.includes('\0') ? value : undefined;
}

function numericOption(value, fallback, maximum, label) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    fail('CLI_ARGUMENT_INVALID', `${label} must be a positive integer`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed > maximum) {
    fail('CLI_ARGUMENT_INVALID', `${label} exceeds its bound`);
  }
  return parsed;
}

export function parseOptions(argv, { positional = 0, maxFiles = false } = {}) {
  const options = { json: false, project: undefined, grokBin: undefined, timeout: DEFAULT_TIMEOUT_MS };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--project' || argument.startsWith('--project=')) {
      const value = argument === '--project' ? argv[++index] : argument.slice('--project='.length);
      if (!safeString(value, 4_096) || value.startsWith('-')) fail('CLI_ARGUMENT_INVALID', '--project requires a path');
      options.project = value;
      continue;
    }
    if (argument === '--grok-bin' || argument.startsWith('--grok-bin=')) {
      const value = argument === '--grok-bin' ? argv[++index] : argument.slice('--grok-bin='.length);
      if (!safeString(value, 4_096) || value.startsWith('-')) fail('CLI_ARGUMENT_INVALID', '--grok-bin requires a path');
      options.grokBin = value;
      continue;
    }
    if (argument === '--timeout' || argument.startsWith('--timeout=')) {
      const value = argument === '--timeout' ? argv[++index] : argument.slice('--timeout='.length);
      options.timeout = numericOption(value, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, '--timeout');
      continue;
    }
    if (maxFiles && (argument === '--max-files' || argument.startsWith('--max-files='))) {
      const value = argument === '--max-files' ? argv[++index] : argument.slice('--max-files='.length);
      options.maxFiles = numericOption(value, DEFAULT_MAX_FILES, MAX_FILES, '--max-files');
      continue;
    }
    if (argument.startsWith('-')) fail('CLI_ARGUMENT_INVALID', `unknown argument ${argument}`);
    positionals.push(argument);
  }
  if (positionals.length !== positional) {
    fail('CLI_ARGUMENT_INVALID', `expected ${positional} positional path${positional === 1 ? '' : 's'}`);
  }
  return { ...options, positionals };
}

export function assertProjectDirectory(input = process.cwd()) {
  const candidate = resolve(input);
  let status;
  try {
    status = lstatSync(candidate);
  } catch (error) {
    fail('GROK_PROJECT_INVALID', `${candidate} (${error?.code ?? 'unreadable'})`);
  }
  if (!status.isDirectory() || status.isSymbolicLink()) fail('GROK_PROJECT_INVALID', candidate);
  try {
    return realpathSync(candidate);
  } catch (error) {
    fail('GROK_PROJECT_INVALID', `${candidate} (${error?.code ?? 'unreadable'})`);
  }
}

export function assertRegularFile(input) {
  const candidate = resolve(input);
  let status;
  try {
    status = lstatSync(candidate);
  } catch (error) {
    fail('GROK_FILE_INVALID', `${candidate} (${error?.code ?? 'unreadable'})`);
  }
  if (!status.isFile() || status.isSymbolicLink()) fail('GROK_FILE_INVALID', candidate);
  try {
    return realpathSync(candidate);
  } catch (error) {
    fail('GROK_FILE_INVALID', `${candidate} (${error?.code ?? 'unreadable'})`);
  }
}

function childEntries(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  } catch (error) {
    fail('GROK_PROJECT_SCAN_FAILED', `${directory} (${error?.code ?? 'unreadable'})`);
  }
}

export function collectExtensions(project, maxFiles = DEFAULT_MAX_FILES) {
  const counts = new Map();
  let fileCount = 0;
  function visit(directory) {
    for (const entry of childEntries(directory)) {
      if (entry.isSymbolicLink()) continue;
      const child = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) visit(child);
        continue;
      }
      if (!entry.isFile()) continue;
      fileCount += 1;
      if (fileCount > maxFiles) fail('GROK_PROJECT_TOO_LARGE', `more than ${maxFiles} files`);
      const extension = extname(entry.name).toLowerCase();
      if (extension) counts.set(extension, (counts.get(extension) ?? 0) + 1);
    }
  }
  visit(project);
  return [...counts.entries()]
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([extension, files]) => ({ extension, files }));
}

function boundedOutput(value) {
  return typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= MAX_OUTPUT_BYTES ? value : undefined;
}

function inspectBinary(options, env) {
  return options.grokBin ?? env.GROK_BIN ?? env.LITGROK_GROK_BIN ?? 'grok';
}

function runGrokInspect(project, options = {}) {
  const env = options.env ?? process.env;
  const result = spawnSync(inspectBinary(options, env), ['inspect', '--json'], {
    cwd: project,
    encoding: 'utf8',
    env,
    maxBuffer: MAX_OUTPUT_BYTES,
    timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
    windowsHide: true,
  });
  const stdout = boundedOutput(result.stdout);
  const stderr = boundedOutput(result.stderr);
  if (result.error || result.status !== 0 || stdout === undefined) {
    return {
      ok: false,
      status: result.status,
      signal: result.signal,
      errorCode: result.error?.code ?? (stdout === undefined ? 'OUTPUT_TOO_LARGE' : 'EXIT_NONZERO'),
      timedOut: result.error?.code === 'ETIMEDOUT',
      stdoutBytes: typeof result.stdout === 'string' ? Buffer.byteLength(result.stdout, 'utf8') : 0,
      stderrBytes: typeof result.stderr === 'string' ? Buffer.byteLength(result.stderr, 'utf8') : 0,
    };
  }
  return {
    ok: true,
    stdout,
    stderr,
    status: result.status,
    signal: result.signal,
  };
}

function parseInspection(result) {
  if (!result.ok) {
    const detail = result.timedOut
      ? 'inspect timed out'
      : `${result.errorCode ?? 'failed'} status=${result.status ?? 'null'} signal=${result.signal ?? 'none'}`;
    fail('GROK_INSPECT_FAILED', detail);
  }
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    fail('GROK_INSPECT_FAILED', 'inspect returned invalid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('GROK_INSPECT_FAILED', 'inspect returned a non-object');
  }
  return value;
}

export function summarizeInspection(value) {
  const hasInventory = Array.isArray(value.lspServers);
  const status = hasInventory
    ? (value.lspServers.length === 0 ? 'unconfigured' : 'opaque')
    : 'not-exposed';
  const summary = {
    status,
    lspServerCount: hasInventory ? value.lspServers.length : null,
    entries: hasInventory
      ? value.lspServers.slice(0, MAX_INSPECTION_ENTRIES).map((entry, index) => ({
        index,
        keys: entry && typeof entry === 'object' && !Array.isArray(entry)
          ? Object.keys(entry).sort().slice(0, MAX_INSPECTION_KEYS)
          : [],
      }))
      : [],
  };
  if (typeof value.grokVersion === 'string' && value.grokVersion.length <= 128) summary.grokVersion = value.grokVersion;
  if (typeof value.projectRoot === 'string' && value.projectRoot.length <= 4_096) summary.projectRoot = value.projectRoot;
  if (value.projectRoot === null) summary.projectRoot = null;
  if (typeof value.projectTrusted === 'boolean') summary.projectTrusted = value.projectTrusted;
  return summary;
}

export function inspectProject(project, options = {}) {
  const result = runGrokInspect(project, options);
  return summarizeInspection(parseInspection(result));
}

export function hostStatusMessage(summary) {
  if (summary.status === 'unconfigured') {
    return 'Grok Build reported no language-server entries; no direct diagnostics transport is exposed; use compiler, linter, or tests.';
  }
  if (summary.status === 'opaque') {
    return 'Grok Build reported opaque host language-server entries, but no documented diagnostic transport is exposed.';
  }
  if (summary.status === 'not-exposed') {
    return 'Grok Build does not expose a language-server inventory; use compiler, linter, or tests.';
  }
  return 'Grok Build language-server inspection failed; no diagnostics were attempted.';
}

export function coverageForExtensions(extensions, summary) {
  return extensions.map(({ extension, files }) => ({
    extension,
    files,
    status: summary.status,
    message: hostStatusMessage(summary),
  }));
}

export function ensureFileInProject(file, project) {
  const suffix = relative(project, file);
  const parentPrefix = `..${sep}`;
  if (!suffix || isAbsolute(suffix) || suffix === '..' || suffix.startsWith(parentPrefix)) {
    fail('GROK_FILE_OUTSIDE_PROJECT', `${file} is not below ${project}`);
  }
  return file;
}

export function cliExitCode(error, fallback = 1) {
  if (error?.code === 'CLI_ARGUMENT_INVALID' || error?.code === 'GROK_PROJECT_INVALID'
    || error?.code === 'GROK_FILE_INVALID' || error?.code === 'GROK_FILE_OUTSIDE_PROJECT') return 2;
  return fallback;
}

export function isDirectInvocation(moduleUrl = import.meta.url) {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(moduleUrl) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
}

function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    const project = assertProjectDirectory(options.project ?? process.cwd());
    const summary = inspectProject(project, options);
    const report = { ...summary, message: hostStatusMessage(summary) };
    if (options.json) process.stdout.write(`${JSON.stringify(report)}\n`);
    else process.stdout.write(`PASS status=${summary.status} lspServers=${summary.lspServerCount ?? 'not-exposed'}\n${report.message}\n`);
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`${error?.code ?? 'GROK_INSPECT_FAILED'}: ${error?.message ?? String(error)}\n`);
    process.exitCode = cliExitCode(error);
  }
}

if (isDirectInvocation()) main();
