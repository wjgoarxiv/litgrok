import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const PRODUCT_ROOT = fileURLToPath(new URL('..', import.meta.url));

function captureIo({ interactive = true } = {}) {
  let stdout = '';
  let stderr = '';
  return {
    stdin: { isTTY: interactive },
    stdout: {
      isTTY: interactive,
      write(chunk) {
        stdout += String(chunk);
        return true;
      },
    },
    stderr: {
      isTTY: interactive,
      write(chunk) {
        stderr += String(chunk);
        return true;
      },
    },
    read() {
      return { stdout, stderr };
    },
  };
}

function plain(text) {
  return text.replace(/\r\u001b\[2K/g, '').replace(/\u001b\[[0-9;]*m/g, '');
}

function installStepRows(output) {
  const start = output.indexOf('╭─ INSTALL STEPS');
  const end = output.indexOf('  ╰─', start);
  assert.notEqual(start, -1, 'install steps card must be rendered');
  assert.notEqual(end, -1, 'install steps card must close');
  const block = output.slice(start, end);
  return [...block.matchAll(/│\s+(?:✓|✗|\[skip\])\s+([A-Z][A-Z0-9_-]*)\b[^\n]*/gu)].map((match) => ({
    label: match[1],
    row: match[0],
  }));
}

async function importInstaller(tag) {
  return import(`${pathToFileURL(join(PRODUCT_ROOT, 'bin', 'litgrok.mjs')).href}?depth=${tag}`);
}

function isolatedHome(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('--yes is an explicit non-prompting consent path', async () => {
  const home = isolatedHome('litgrok-depth-yes-');
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await importInstaller('yes');
    const io = captureIo();
    const code = await run(['install', '--user', '--yes'], { cwd: home, env, ...io });

    assert.equal(code, 0, io.read().stderr);
    assert.equal(existsSync(join(home, '.grok')), true, 'explicit --yes should install in a real TTY');
    assert.doesNotMatch(io.read().stdout, /Choose|Select|Press Enter to install/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('the receipt reports both host limits without inventing menus or writes', async () => {
  const home = isolatedHome('litgrok-depth-receipt-');
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await importInstaller('receipt');
    const io = captureIo();
    const code = await run(['install', '--user', '--yes'], { cwd: home, env, ...io });
    const stdout = plain(io.read().stdout);

    assert.equal(code, 0, io.read().stderr);
    assert.match(stdout, /Model picker: host limit/u);
    assert.match(stdout, /Output styles: host limit/u);
    assert.match(stdout, /installer writes no model keys/u);
    assert.match(stdout, /installer writes no style keys/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('piped --yes stays prompt-free and installs without a TTY', async () => {
  const home = isolatedHome('litgrok-depth-pipe-');
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await importInstaller('pipe');
    const io = captureIo({ interactive: false });
    const code = await run(['install', '--user', '--yes'], { cwd: home, env, ...io });
    const stdout = plain(io.read().stdout);

    assert.equal(code, 0, io.read().stderr);
    assert.equal(existsSync(join(home, '.grok')), true, '--yes must install despite a piped, non-TTY stdout');
    assert.doesNotMatch(stdout, /NON-INTERACTIVE/u);
    assert.doesNotMatch(stdout, /Choose|Select|Press Enter to install/u);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('every displayed install phase has a measured duration', async () => {
  const home = isolatedHome('litgrok-depth-steps-');
  const env = { ...process.env, HOME: home };
  delete env.CI;
  delete env.NO_COLOR;

  try {
    const { run } = await importInstaller('steps');
    const io = captureIo();
    const code = await run(['install', '--user', '--yes'], { cwd: home, env, ...io });
    const output = plain(io.read().stdout);
    const rows = installStepRows(output);
    const phases = rows.map(({ label }) => label);

    assert.equal(code, 0, io.read().stderr);
    assert.deepEqual(phases, ['PAYLOAD', 'SAFETY', 'OWNERSHIP', 'WRITE']);
    for (const { row } of rows) assert.match(row, /· \d+\.\d+ms$/u, `missing duration: ${row}`);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
