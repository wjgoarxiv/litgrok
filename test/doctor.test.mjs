import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const REGISTRY_URL = 'https://registry.npmjs.org/@litfamily%2flitgrok/latest';
const INSTALL_LINE = 'npm exec --yes --package @litfamily/litgrok@latest -- litgrok install';
const OPT_OUTS = ['NO_UPDATE_NOTIFIER', 'CI', 'LITGROK_NO_UPDATE_CHECK'];

function fakeRegistry(body) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url: String(url), signal: options?.signal });
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetch, calls };
}

async function doctor({ args = [], env = {}, fetch } = {}) {
  const scratch = mkdtempSync(join(tmpdir(), 'litgrok-doctor-'));
  let stdout = '';
  let stderr = '';
  try {
    const code = await run(['doctor', ...args], {
      cwd: scratch,
      env: { HOME: scratch, ...env },
      stdin: { isTTY: false },
      stdout: { isTTY: false, write(value) { stdout += String(value); return true; } },
      stderr: { isTTY: false, write(value) { stderr += String(value); return true; } },
      fetch,
    });
    return { code, stdout, stderr, written: readdirSync(scratch), home: scratch };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

test('doctor prints a notify-only line when the registry has a newer version', async () => {
  const registry = fakeRegistry({ name: '@litfamily/litgrok', version: '99.0.0' });
  const result = await doctor({ fetch: registry.fetch });
  assert.equal(result.code, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `litgrok ${VERSION}\nGROUND: absent ${join(result.home, '.grok', 'rules', '00-litgrok.md')}\nnewer version available: 99.0.0 (run: ${INSTALL_LINE})\n`);
  assert.equal(registry.calls.length, 1);
  assert.equal(registry.calls[0].url, REGISTRY_URL);
  assert.ok(registry.calls[0].signal instanceof AbortSignal, 'the registry request must carry a timeout signal');
  assert.deepEqual(result.written, [], 'doctor never installs or writes anything');
});

test('doctor prints nothing extra when the installed version is current or ahead', async () => {
  for (const version of [VERSION, '0.0.1']) {
    const result = await doctor({ fetch: fakeRegistry({ version }).fetch });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, `litgrok ${VERSION}\nGROUND: absent ${join(result.home, '.grok', 'rules', '00-litgrok.md')}\n`, version);
  }
});

test('doctor prints one quiet line when offline or the registry answer is unusable', async () => {
  const offline = async () => { throw new TypeError('fetch failed'); };
  const prerelease = fakeRegistry({ version: '99.0.0-beta.1' }).fetch;
  const failing = async () => new Response('nope', { status: 503 });
  for (const fetch of [offline, prerelease, failing]) {
    const result = await doctor({ fetch });
    assert.equal(result.code, 0);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, `litgrok ${VERSION}\nGROUND: absent ${join(result.home, '.grok', 'rules', '00-litgrok.md')}\nupdate check unavailable (offline or registry unreachable)\n`);
  }
});

test('doctor gives up on a registry that never answers within the bounded timeout', async () => {
  const hanging = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const started = Date.now();
  const result = await doctor({ fetch: hanging });
  const elapsed = Date.now() - started;
  assert.equal(result.stdout, `litgrok ${VERSION}\nGROUND: absent ${join(result.home, '.grok', 'rules', '00-litgrok.md')}\nupdate check unavailable (offline or registry unreachable)\n`);
  assert.ok(elapsed >= 2500 && elapsed < 6000, `bounded near 3 s, took ${elapsed} ms`);
});

test('doctor skips the registry entirely under each opt-out, even with an empty value', async () => {
  for (const name of OPT_OUTS) {
    const registry = fakeRegistry({ version: '99.0.0' });
    const result = await doctor({ env: { [name]: '' }, fetch: registry.fetch });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, `litgrok ${VERSION}\nGROUND: absent ${join(result.home, '.grok', 'rules', '00-litgrok.md')}\n`, name);
    assert.equal(registry.calls.length, 0, name);
  }
});

test('doctor accepts --no-color and rejects any other argument with the usage text', async () => {
  const colorless = await doctor({ args: ['--no-color'], fetch: fakeRegistry({ version: VERSION }).fetch });
  assert.equal(colorless.code, 0);
  assert.equal(colorless.stdout, `litgrok ${VERSION}\nGROUND: absent ${join(colorless.home, '.grok', 'rules', '00-litgrok.md')}\n`);
  const registry = fakeRegistry({ version: '99.0.0' });
  const rejected = await doctor({ args: ['--yes'], fetch: registry.fetch });
  assert.equal(rejected.code, 1);
  assert.match(rejected.stderr, /litgrok doctor \[--no-color\]/u);
  assert.equal(registry.calls.length, 0);
});
