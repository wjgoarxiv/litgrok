"use strict";

const { createHash } = require('node:crypto');
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const proc = require('./proc.cjs');

const skill = path.resolve(__dirname, '..');
const pythonLock = path.join(skill, 'requirements.lock');
const nodeLock = path.join(skill, 'package-lock.json');
const digest = createHash('sha256').update(readFileSync(nodeLock)).update(readFileSync(pythonLock)).digest('hex').slice(0, 16);
const base = process.env.LITGROK_OFFICE_CACHE || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'litgrok', 'office-docs');
if (!path.isAbsolute(base)) throw new Error('LITGROK_OFFICE_CACHE must be absolute');
const root = path.join(base, digest);
// The minors every pinned package in requirements.lock has wheels for, newest first.
const OFFICE_PYTHON_MINORS = [14, 13, 12, 11, 10];
function supportsSlideNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  return major > 20 || (major === 20 && minor >= 9);
}

// npm and the interpreter run through the shared helper, which handles Windows .cmd shims. stderr is
// piped so a failure names its exit code and the child's own last line instead of a bare status.
function command(executable, args, env = process.env) {
  const result = executable === 'npm'
    ? proc.runNpm(args, { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8', env })
    : proc.run(executable, args, { stdio: ['ignore', 'inherit', 'pipe'], encoding: 'utf8', env });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error || result.status !== 0) throw new Error(`${executable} ${args.slice(0, 2).join(' ')} failed (${proc.describeFailure(result)})`);
}

function install(kind) {
  const target = path.join(root, kind);
  const marker = path.join(target, '.ready');
  if (existsSync(marker)) return target;
  if (existsSync(target)) throw new Error(`Office cache target exists without a ready marker: ${target}`);
  mkdirSync(root, { recursive: true });
  const staging = mkdtempSync(path.join(root, `${kind}-`));
  try {
    if (kind === 'node') {
      copyFileSync(path.join(skill, 'package.json'), path.join(staging, 'package.json'));
      copyFileSync(nodeLock, path.join(staging, 'package-lock.json'));
      command('npm', ['ci', '--prefix', staging, '--ignore-scripts', '--no-audit', '--no-fund']);
    } else {
      const system = proc.pickPython(OFFICE_PYTHON_MINORS);
      if (!system.command) throw new Error(`LitGrok office needs Python 3.10 to 3.14 for its pinned packages; none found on PATH (tried ${system.tried.join(', ') || 'nothing'}). Install Python 3.14 or any of 3.10 to 3.13.`);
      command(system.command, [...system.args, '-m', 'venv', staging]);
      command(proc.venvPython(staging), ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', pythonLock]);
    }
    writeFileSync(path.join(staging, '.ready'), digest);
    if (existsSync(target)) {
      if (existsSync(marker)) return target;
      throw new Error(`Office cache target appeared during install: ${target}`);
    }
    renameSync(staging, target);
  } finally {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  }
  return target;
}

function ready(kind) { return existsSync(path.join(root, kind, '.ready')); }

function node() {
  if (!supportsSlideNode()) throw new Error('LitGrok slide runtime requires Node.js 20.9 or newer (sharp 0.35.5)');
  if (!ready('node')) process.stderr.write('LitGrok office: installing pinned Node dependencies in cache\n');
  const target = install('node');
  process.env.NODE_PATH = [path.join(target, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
  return target;
}

function python() {
  if (!ready('python')) process.stderr.write('LitGrok office: installing pinned Python dependencies in cache\n');
  const target = install('python');
  const interpreter = proc.venvPython(target);
  process.env.PATH = [path.dirname(interpreter), process.env.PATH].join(path.delimiter);
  return interpreter;
}

module.exports = { command, node, python, ready, root, supportsSlideNode };
