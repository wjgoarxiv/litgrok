"use strict";

const { createHash } = require('node:crypto');
const { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Module = require('node:module');

const skill = path.resolve(__dirname, '..');
const pythonLock = path.join(skill, 'requirements.lock');
const nodeLock = path.join(skill, 'package-lock.json');
const digest = createHash('sha256').update(readFileSync(nodeLock)).update(readFileSync(pythonLock)).digest('hex').slice(0, 16);
const base = process.env.LITGROK_OFFICE_CACHE || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'litgrok', 'office-docs');
if (!path.isAbsolute(base)) throw new Error('LITGROK_OFFICE_CACHE must be absolute');
const root = path.join(base, digest);
function supportsSlideNode(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  return major > 20 || (major === 20 && minor >= 9);
}

function command(executable, args, env = process.env) {
  const result = spawnSync(executable, args, { stdio: 'inherit', env });
  if (result.error || result.status !== 0) throw new Error(`${executable} failed: ${result.error?.message || result.status}`);
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
      command('python3', ['-m', 'venv', staging]);
      command(path.join(staging, 'bin', 'python'), ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', pythonLock]);
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
  if (!supportsSlideNode()) throw new Error('LitGrok slide runtime requires Node.js 20.9 or newer (sharp 0.35.4)');
  if (!ready('node')) process.stderr.write('LitGrok office: installing pinned Node dependencies in cache\n');
  const target = install('node');
  process.env.NODE_PATH = [path.join(target, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
  Module._initPaths();
  return target;
}

function python() {
  if (!ready('python')) process.stderr.write('LitGrok office: installing pinned Python dependencies in cache\n');
  const target = install('python');
  process.env.PATH = [path.join(target, 'bin'), process.env.PATH].join(path.delimiter);
  return path.join(target, 'bin', 'python');
}

module.exports = { node, python, ready, root, supportsSlideNode };
