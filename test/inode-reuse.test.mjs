import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CONFERENCE_SCRIPT = join(PRODUCT_ROOT, '.grok', 'skills', 'autoconference', 'scripts', 'init_conference.py');
const RESEARCH_SCRIPT = join(PRODUCT_ROOT, '.grok', 'skills', 'autoresearch', 'scripts', 'init_research.py');

function temporaryDirectory(label) {
  const root = mkdtempSync(join(realpathSync(tmpdir()), `litgrok-inode-${label}-`));
  test.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

const PYTHON_RACE_HARNESS = String.raw`
import importlib.util
import os
import shutil
import sys
import tempfile
from pathlib import Path

script_path = sys.argv[1]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("target_script", script_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

root = Path(os.path.realpath(tempfile.mkdtemp(prefix="litgrok-python-inode-")))
parent = root / "parent"
child = parent / "child"
parent.mkdir()
child.mkdir()
parent_info = os.stat(parent, follow_symlinks=False)
child_info = os.stat(child, follow_symlinks=False)
replacement_fd = None
swapped = False
real_os = os

class FakeStat:
    def __init__(self, actual, dev, ino):
        self._actual = actual
        self.st_dev = dev
        self.st_ino = ino
        self.st_ctime_ns = actual.st_ctime_ns
        self.st_mode = actual.st_mode
        self.st_uid = actual.st_uid

    def __getattr__(self, name):
        return getattr(self._actual, name)

class OsProxy:
    def __init__(self, original):
        self.original = original

    def __getattr__(self, name):
        return getattr(self.original, name)

    def stat(self, path, *args, **kwargs):
        actual = self.original.stat(path, *args, **kwargs)
        if swapped and (str(path) == child.name or str(path) == str(child)):
            return FakeStat(actual, child_info.st_dev, child_info.st_ino)
        return actual

    def open(self, path, flags, mode=0o777, *, dir_fd=None):
        global replacement_fd, swapped
        if not swapped and path == child.name and dir_fd is not None:
            parent_now = self.original.fstat(dir_fd)
            if (parent_now.st_dev, parent_now.st_ino) == (parent_info.st_dev, parent_info.st_ino):
                self.original.rename(child, root / "original-child")
                self.original.mkdir(child, 0o755)
                swapped = True
        fd = self.original.open(path, flags, mode, dir_fd=dir_fd)
        if swapped and path == child.name and dir_fd is not None:
            replacement_fd = fd
        return fd

    def fstat(self, fd):
        actual = self.original.fstat(fd)
        if fd == replacement_fd:
            return FakeStat(actual, child_info.st_dev, child_info.st_ino)
        return actual

module.os = OsProxy(real_os)
try:
    fd, _ = module.open_safe_directory(child)
except SystemExit as error:
    print(f"rejected:{error.code}")
else:
    real_os.close(fd)
    print("accepted")
finally:
    shutil.rmtree(root, ignore_errors=True)
`;

for (const [name, script] of [['autoconference', CONFERENCE_SCRIPT], ['autoresearch', RESEARCH_SCRIPT]]) {
  test(`${name} rejects a same-inode child-directory replacement during open`, () => {
    const result = spawnSync('python3', ['-c', PYTHON_RACE_HARNESS, script], {
      cwd: PRODUCT_ROOT,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.match(result.stdout, /rejected:1/u, `${name} must reject the simulated child replacement`);
    assert.match(result.stderr, /UNSAFE_OUTPUT_SWAP/u);
  });
}

function runPython(script, args) {
  return spawnSync('python3', [script, ...args], { cwd: PRODUCT_ROOT, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' }, encoding: 'utf8' });
}

test('authorized autoconference output rotation remains accepted', () => {
  const root = temporaryDirectory('conference-rotation');
  const output = join(root, 'conference');
  const args = [
    '--goal', 'Measure one bounded conference',
    '--metric', 'score',
    '--direction', 'maximize',
    '--target', '> 0',
    '--researchers', '1',
    '--iterations-per-round', '1',
    '--max-rounds', '1',
    '--output', output,
  ];
  const first = runPython(CONFERENCE_SCRIPT, args);
  assert.equal(first.status, 0, first.stderr);
  const rotated = runPython(CONFERENCE_SCRIPT, [...args, '--force']);
  assert.equal(rotated.status, 0, rotated.stderr);
  assert.match(rotated.stdout, /Conference project scaffolded/u);
});

test('authorized autoresearch output rotation remains accepted', () => {
  const root = temporaryDirectory('research-rotation');
  const output = join(root, 'research');
  const args = [
    '--goal', 'Measure one bounded experiment',
    '--metric', 'score',
    '--direction', 'maximize',
    '--target', '> 0',
    '--max-iterations', '1',
    '--output', output,
  ];
  const first = runPython(RESEARCH_SCRIPT, args);
  assert.equal(first.status, 0, first.stderr);
  const rotated = runPython(RESEARCH_SCRIPT, [...args, '--force']);
  assert.equal(rotated.status, 0, rotated.stderr);
  assert.match(rotated.stdout, /Research project scaffolded/u);
});
