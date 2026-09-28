import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';
import { restoreHistoricalFixture } from './fixtures/historical-installs/restore.mjs';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LEGACY_RELATIVE = '.grok/vendor/045_scientific-visualization';
const CANONICAL_RELATIVE = '.grok/vendor/scientific-visualization';
const LEGACY_ROOT = join(PRODUCT_ROOT, LEGACY_RELATIVE);
const CANONICAL_ROOT = join(PRODUCT_ROOT, CANONICAL_RELATIVE);

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

test('the scientific vendor tree uses the canonical unnumbered path in active surfaces', () => {
  assert.equal(existsSync(CANONICAL_ROOT), true);
  assert.equal(existsSync(LEGACY_ROOT), false);
  const activeFiles = [
    '.grok/skills/lit-scientific-visualization/SKILL.md',
    '.grok/skills/lit-scientific-visualization/scripts/verify-canonical-corpus.mjs',
    '.grok/vendor/NOTICE.md',
    '.grok/vendor/provenance/045_scientific-visualization.md',
    'test/depth-references.test.mjs',
    'test/canonical-scientific-corpus.test.mjs',
    'test/scientific-provenance.test.mjs',
  ];
  for (const relative of activeFiles) {
    const content = readFileSync(join(PRODUCT_ROOT, relative), 'utf8');
    assert.match(content, /scientific-visualization/iu);
    if (!relative.includes('provenance') && !relative.endsWith('NOTICE.md')) {
      assert.doesNotMatch(content, /vendor\/045_scientific-visualization/iu, relative);
    }
  }
});

test('a pristine manifest-owned numbered vendor install migrates without byte or mode loss', async () => {
  const home = seedLegacyInstall();
  try {
    const before = snapshot(join(home, '.grok'));
    const result = await install(home);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(existsSync(join(home, CANONICAL_RELATIVE)), true);
    assert.equal(existsSync(join(home, LEGACY_RELATIVE)), false);
    for (const [path, entry] of Object.entries(before)) {
      if (!path.startsWith(`${LEGACY_RELATIVE}/`) || entry.type !== 'file') continue;
      const canonical = `${CANONICAL_RELATIVE}${path.slice(LEGACY_RELATIVE.length)}`;
      const actual = snapshot(join(home, '.grok'))[canonical];
      assert.deepEqual(actual, entry, canonical);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

for (const kind of ['modified', 'foreign', 'symlink', 'nonregular', 'unsupported']) {
  test(`legacy vendor migration refuses ${kind} before any write`, async () => {
    const home = seedLegacyInstall();
    const legacy = join(home, LEGACY_RELATIVE);
    const manifest = join(home, '.grok/.litgrok-install-manifest.json');
    const beforeManifest = readFileSync(manifest);
    try {
      if (kind === 'modified') writeFileSync(join(legacy, 'assets/nature.mplstyle'), `${readFileSync(join(legacy, 'assets/nature.mplstyle'), 'utf8')}\nuser edit\n`);
      if (kind === 'foreign') writeFileSync(join(legacy, 'foreign.txt'), 'user-owned\n');
      if (kind === 'symlink') {
        const outside = join(home, 'outside-vendor');
        mkdirSync(outside);
        writeFileSync(join(outside, 'foreign.txt'), 'outside\n');
        rmSync(legacy, { recursive: true, force: true });
        symlinkSync(outside, legacy, 'dir');
      }
      if (kind === 'nonregular') {
        const fifo = join(legacy, 'assets/nature.mplstyle');
        rmSync(fifo);
        const made = spawnSync('/usr/bin/mkfifo', [fifo]);
        assert.equal(made.status, 0, made.stderr?.toString());
      }
      if (kind === 'unsupported') {
        rmSync(legacy, { recursive: true, force: true });
        writeFileSync(legacy, 'legacy vendor root is not a directory\n');
      }
      const result = await install(home);
      assert.equal(result.code, 1, result.stdout);
      assert.equal(existsSync(join(home, CANONICAL_RELATIVE)), false);
      assert.deepEqual(readFileSync(manifest), beforeManifest);
      if (kind === 'symlink') assert.equal(lstatSync(legacy).isSymbolicLink(), true);
      if (kind === 'unsupported') assert.equal(lstatSync(legacy).isFile(), true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
}
