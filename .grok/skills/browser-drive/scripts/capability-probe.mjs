#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VERIFIED_FLOOR = Object.freeze({ major: 0, minor: 34, patch: 0 });
export const VERIFIED_VERSION = Object.freeze({ major: 0, minor: 38, patch: 1 });
const INSTALL_STEPS = ['npm install -g agent-browser', 'agent-browser install'];

export function parseVersion(output) {
  const match = output.trim().match(/^agent-browser\s+v?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), prerelease: match[4] ?? '' };
}

function compare(left, right) {
  for (const key of ['major', 'minor', 'patch']) if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  if (left.prerelease && !right.prerelease) return -1;
  if (!left.prerelease && right.prerelease) return 1;
  return 0;
}

export function classifyVersion(output) {
  const version = parseVersion(output);
  if (!version) return { available: true, accepted: false, state: 'version-unrecognized', version: null };
  const floor = { ...VERIFIED_FLOOR, prerelease: '' };
  const verified = { ...VERIFIED_VERSION, prerelease: '' };
  if (compare(version, floor) < 0) return { available: true, accepted: false, state: 'below-verified-floor', version };
  if (compare(version, verified) > 0) return { available: true, accepted: true, state: 'beyond-verified', version };
  return { available: true, accepted: true, state: 'supported', version };
}

export function probe(environment = process.env) {
  const result = spawnSync('agent-browser', ['--version'], { encoding: 'utf8', env: environment, timeout: 3000 });
  if (result.error || result.status !== 0) {
    return { available: false, accepted: false, state: 'unavailable', version: null, source: 'https://github.com/vercel-labs/agent-browser', install: INSTALL_STEPS };
  }
  return { ...classifyVersion(result.stdout.trim()), source: 'https://github.com/vercel-labs/agent-browser', install: INSTALL_STEPS };
}

function main() {
  const json = process.argv.includes('--json');
  const result = probe();
  if (json) process.stdout.write(`${JSON.stringify(result)}\n`);
  else if (!result.available) {
    process.stdout.write(`agent-browser is not available. Install it yourself from ${result.source}:\n${result.install.join('\n')}\n`);
  } else if (!result.accepted) process.stdout.write(`agent-browser ${result.state}: ${process.env.PATH ? 'install a supported release' : 'check PATH'}\n`);
  else process.stdout.write(`agent-browser ${result.version.major}.${result.version.minor}.${result.version.patch}: ${result.state}\n`);
  return result.accepted ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
