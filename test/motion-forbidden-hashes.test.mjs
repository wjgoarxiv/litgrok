import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { cacheRoot } from '../.grok/skills/lit-typographic-motion/scripts/lib/fonts.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_FILE = join(root, 'test/motion-forbidden-hashes.json');
const data = JSON.parse(readFileSync(DATA_FILE, 'utf8'));
const forbidden = new Map([...data.referenceHashes, ...data.methodOnly, ...data.hershey].map((row) => [row.sha256, row.path]));
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

// Hashing follows symlinks: statSync and readFileSync resolve a link to the bytes it points at.
function scanTree(start, { skip = () => false } = {}) {
  const hits = [];
  const walk = (path) => {
    if (skip(path) || !existsSync(path)) return;
    const stat = statSync(path);
    if (stat.isDirectory()) { for (const entry of readdirSync(path)) walk(join(path, entry)); return; }
    if (!stat.isFile()) return;
    const digest = sha(path);
    if (forbidden.has(digest)) hits.push(`${relative(start, path)} = ${forbidden.get(digest)}`);
  };
  walk(start);
  return hits;
}

test('the guard data is the spec table: 61 rows, 2 method-only files, the Hershey trio', () => {
  assert.equal(data.referenceHashes.length, 61);
  assert.equal(new Set(data.referenceHashes.map((row) => row.sha256)).size, 61);
  assert.equal(data.methodOnly.length, 2);
  assert.equal(data.hershey.length, 3);
  for (const digest of forbidden.keys()) assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(forbidden.size, 66);
});

test('tracked files contain no forbidden bytes, following symlinks', () => {
  const result = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root });
  assert.equal(result.status, 0, result.stderr.toString());
  const hits = [];
  for (const name of result.stdout.toString().split('\0').filter(Boolean)) {
    const path = join(root, name);
    if (!existsSync(path) || !statSync(path).isFile()) continue;
    const digest = sha(path);
    if (forbidden.has(digest)) hits.push(`${name} = ${forbidden.get(digest)}`);
  }
  assert.deepEqual(hits, []);
});

test('the scanner follows a symlink to a forbidden file (negative control)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'litgrok-motion-guard-'));
  try {
    const target = join(dir, 'outside.bin');
    writeFileSync(target, 'control');
    mkdirSync(join(dir, 'tree'));
    symlinkSync(target, join(dir, 'tree', 'link'));
    forbidden.set(sha(target), 'negative control');
    assert.deepEqual(scanTree(join(dir, 'tree')), ['link = negative control']);
  } finally {
    forbidden.delete(createHash('sha256').update('control').digest('hex'));
    rmSync(dir, { recursive: true, force: true });
  }
});

test('shipped engine files never carry the method-only timeline scene ids', () => {
  const engineRoot = join(root, '.grok/skills/lit-typographic-motion');
  const offenders = [];
  const walk = (path) => {
    const stat = statSync(path);
    if (stat.isDirectory()) { for (const entry of readdirSync(path)) walk(join(path, entry)); return; }
    if (path === DATA_FILE || /\.(ttf|otf)$/.test(path)) return;
    const text = readFileSync(path, 'utf8').toLowerCase();
    for (const id of data.timelineSceneIds) if (new RegExp(`\\b${id}\\b`).test(text)) offenders.push(`${relative(root, path)}: ${id}`);
  };
  walk(engineRoot);
  assert.deepEqual(offenders, []);
});

test('the extracted npm pack contains no forbidden bytes and no guard data', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'litgrok-motion-pack-'));
  try {
    const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--pack-destination', scratch], { cwd: root, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    const file = join(scratch, packed.stdout.trim().split('\n').at(-1));
    assert.equal(spawnSync('tar', ['-xzf', file, '-C', scratch]).status, 0);
    assert.deepEqual(scanTree(join(scratch, 'package')), []);
    assert.equal(existsSync(join(scratch, 'package', 'test', 'motion-forbidden-hashes.json')), false);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});

test('a test-installed pre-warm cache contains no forbidden bytes', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'litgrok-motion-guard-cache-'));
  try {
    const env = { ...process.env, LITGROK_MOTION_CACHE: base, npm_config_offline: 'true' };
    mkdirSync(cacheRoot(env), { recursive: true });
    const { installDeps } = await import('../.grok/skills/lit-typographic-motion/scripts/prewarm.mjs');
    try { await installDeps(env); } catch (error) { t.skip(`npm cache lacks the pinned deps offline (${error.message})`); return; }
    assert.ok(existsSync(join(cacheRoot(env), 'node', 'node_modules', 'opentype.js')));
    assert.deepEqual(scanTree(base), []);
  } finally { rmSync(base, { recursive: true, force: true }); }
});
