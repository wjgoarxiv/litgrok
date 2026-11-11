import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';
import { restoreHistoricalFixture } from './fixtures/historical-installs/restore.mjs';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LEGACY_RELATIVE = '.grok/vendor/045_scientific-visualization';

function digest(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function snapshot(root, relative = '') {
  const result = {};
  for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
    const childRelative = relative ? join(relative, entry.name) : entry.name;
    const child = join(root, childRelative);
    const stat = lstatSync(child);
    const mode = stat.mode & 0o777;
    if (stat.isSymbolicLink()) result[childRelative] = { type: 'symlink', target: readFileSync(child, 'utf8') };
    else if (stat.isDirectory()) {
      result[childRelative] = { type: 'directory', mode };
      Object.assign(result, snapshot(root, childRelative));
    } else if (stat.isFile()) result[childRelative] = { type: 'file', mode, sha256: digest(child) };
    else result[childRelative] = { type: 'nonregular', mode };
  }
  return result;
}

function captureIo() {
  let stdout = '';
  let stderr = '';
  const stream = { isTTY: true, write(chunk) { stdout += String(chunk); return true; } };
  return {
    stdin: stream,
    stdout: stream,
    stderr: { isTTY: true, write(chunk) { stderr += String(chunk); return true; } },
    read: () => ({ stdout, stderr }),
  };
}

function seedLegacyInstall() {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-vendor-legacy-'));
  restoreHistoricalFixture('before-renames', home, { payloadOnly: true });
  const files = Object.fromEntries(
    Object.entries(snapshot(join(home, '.grok')))
      .filter(([, entry]) => entry.type === 'file')
      .map(([path, entry]) => [path, entry.sha256]),
  );
  writeFileSync(
    join(home, '.grok/.litgrok-install-manifest.json'),
    `${JSON.stringify({ schema: 'litgrok.install-manifest/v1', package: 'litgrok-ai', version: 'previous', files }, null, 2)}\n`,
  );
  return home;
}

async function install(home) {
  const io = captureIo();
  const env = { HOME: home };
  const code = await run(['install', '--user'], { cwd: home, env, ...io });
  return { code, ...io.read() };
}

// The scientific-visualization source moved to wjgoarxiv-skills with its skill, so no release ships
// `.grok/vendor/` any more. An install that still holds the old numbered vendor tree loses it on upgrade the way
// any other no-longer-shipped file goes: removed while it matches the manifest, refused when the user changed it.
test('an upgrade removes the old numbered vendor tree, which this release no longer ships', async () => {
  const home = seedLegacyInstall();
  try {
    assert.equal(existsSync(join(home, LEGACY_RELATIVE)), true, 'the seed holds the numbered vendor tree');
    assert.equal(existsSync(join(PRODUCT_ROOT, '.grok', 'vendor')), false, 'the payload ships no vendor tree');
    const result = await install(home);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(existsSync(join(home, '.grok', 'vendor')), false, 'the emptied vendor folders are pruned');
    const manifest = JSON.parse(readFileSync(join(home, '.grok/.litgrok-install-manifest.json'), 'utf8'));
    assert.deepEqual(Object.keys(manifest.files).filter((path) => path.startsWith('vendor/')), []);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('an upgrade keeps a numbered vendor file the user changed and writes nothing', async () => {
  const home = seedLegacyInstall();
  try {
    const changed = Object.keys(snapshot(join(home, LEGACY_RELATIVE))).find((path) => path.endsWith('.md'));
    const target = join(home, LEGACY_RELATIVE, changed);
    writeFileSync(target, 'my own notes\n');
    const manifest = join(home, '.grok/.litgrok-install-manifest.json');
    const beforeManifest = readFileSync(manifest);
    const result = await install(home);
    assert.equal(result.code, 1, result.stdout);
    assert.match(result.stderr, /no longer ships/u);
    assert.equal(readFileSync(target, 'utf8'), 'my own notes\n');
    assert.deepEqual(readFileSync(manifest), beforeManifest);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
