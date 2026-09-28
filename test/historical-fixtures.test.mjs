import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { restoreHistoricalFixture } from './fixtures/historical-installs/restore.mjs';

const FIXTURES = fileURLToPath(new URL('./fixtures/historical-installs', import.meta.url));
const manifest = JSON.parse(readFileSync(join(FIXTURES, 'manifest.json'), 'utf8'));

function filesBelow(root, relative = '') {
  return readdirSync(join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    const path = join(relative, entry.name);
    return entry.isDirectory() ? filesBelow(root, path) : [path];
  }).sort();
}

for (const [id, payloadOnly] of [['pre-manifest', false], ['pre-manifest', true], ['before-renames', true]]) {
  test(`historical fixture restores exact ${id} bytes and executable modes with payloadOnly=${payloadOnly}`, () => {
    const destination = mkdtempSync(join(tmpdir(), 'litgrok-fixture-restore-'));
    try {
      restoreHistoricalFixture(id, destination, { payloadOnly });
      const expected = manifest.fixtures[id].files.filter((file) => !payloadOnly || file.path.startsWith('.grok/'));
      assert.deepEqual(filesBelow(destination), expected.map((file) => file.path).sort());
      for (const file of expected) {
        const path = join(destination, file.path);
        const stat = lstatSync(path);
        assert.ok(stat.isFile(), file.path);
        assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), file.sha256, file.path);
        assert.equal(stat.mode & 0o111, file.gitMode === '100755' ? 0o111 : 0, file.path);
      }
    } finally {
      rmSync(destination, { recursive: true, force: true });
    }
  });
}

for (const corruption of ['archive', 'manifest', 'missing', 'symlink']) {
  test(`historical fixture refuses ${corruption} before extracting any files`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'litgrok-fixture-refusal-'));
    try {
      const copy = join(root, 'fixtures');
      cpSync(FIXTURES, copy, { recursive: true });
      const archive = join(copy, 'pre-manifest.tar.gz');
      if (corruption === 'archive') {
        const bytes = readFileSync(archive);
        bytes[4] ^= 1; // A gzip timestamp change still decompresses, but breaks exact fixture integrity.
        writeFileSync(archive, bytes);
      }
      if (corruption === 'manifest') writeFileSync(join(copy, 'manifest.json'), `${readFileSync(join(copy, 'manifest.json'), 'utf8')}\n`);
      if (corruption === 'missing') rmSync(archive);
      if (corruption === 'symlink') {
        rmSync(archive);
        symlinkSync(join(FIXTURES, 'pre-manifest.tar.gz'), archive);
      }
      const destination = join(root, 'destination');
      mkdirSync(destination);
      const copied = await import(pathToFileURL(join(copy, 'restore.mjs')).href);
      assert.throws(() => copied.restoreHistoricalFixture('pre-manifest', destination), /Historical fixture/);
      assert.deepEqual(readdirSync(destination), []);
    } finally {
      rmSync(root, { recursive: true, force: true });
      assert.equal(existsSync(root), false);
    }
  });
}

test('historical fixture refuses an unknown snapshot without writing', () => {
  const destination = mkdtempSync(join(tmpdir(), 'litgrok-fixture-unknown-'));
  try {
    assert.throws(() => restoreHistoricalFixture('__proto__', destination), /Unknown historical fixture/);
    assert.deepEqual(readdirSync(destination), []);
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
});

test('historical fixture preserves a nonempty destination', () => {
  const destination = mkdtempSync(join(tmpdir(), 'litgrok-fixture-nonempty-'));
  try {
    writeFileSync(join(destination, 'keep.txt'), 'user file\n');
    assert.throws(() => restoreHistoricalFixture('pre-manifest', destination), /empty regular directory/);
    assert.deepEqual(readdirSync(destination), ['keep.txt']);
    assert.equal(readFileSync(join(destination, 'keep.txt'), 'utf8'), 'user file\n');
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
});
