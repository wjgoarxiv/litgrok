import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHEET = readFileSync(join(ROOT, 'test/fixtures/lit-mark/round6.txt'), 'utf8');
const IGNITION_SOURCE = readFileSync(join(ROOT, 'test/fixtures/lit-mark/ignition-b.json'));
const ignition = JSON.parse(IGNITION_SOURCE);
const variants = { A: ignition.standard.map((row) => row.text), D: ignition.banner.map((row) => row.text), G: ignition.micro.map((row) => row.text) };
const glyphs = /^[█▀▄▌▐▖▗▘▝▙▛▜▟▚▞ ]*$/u;
const markPath = join(ROOT, '.grok/hooks/lit-mark.mjs');
async function mark() { assert.ok(existsSync(markPath), 'the shared canonical mark API must be shipped'); return import(markPath); }
function scratch(t) { const root = mkdtempSync(join(tmpdir(), 'litgrok-mark-')); t.after(() => { rmSync(root, { recursive: true, force: true }); assert.equal(existsSync(root), false); }); return root; }
function activationBanner(discipline) { return `🔥 **LIT IGNITED · ${discipline}** 🔥`; }
function hookOptions(root, id = 'session-one', extra = {}) {
  const env = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', TERM: 'xterm-256color', GROK_HOOK_EVENT: 'SessionStart', GROK_HOOK_NAME: 'session-start', GROK_SESSION_ID: id, GROK_WORKSPACE_ROOT: root, ...extra };
  const event = { hookEventName: 'SessionStart', sessionId: id, workspaceRoot: root, cwd: root };
  return { cwd: root, env, input: JSON.stringify(event), encoding: 'utf8' };
}
function hook(root, id, extra) {
  return spawnSync(process.execPath, [join(ROOT, '.grok/hooks/session-start.mjs')], hookOptions(root, id, extra));
}

test('historical round6 fixture remains byte-identical to its original generator output', (t) => {
  const root = scratch(t);
  const source = join(ROOT, 'test/fixtures/lit-mark/litmark6.mjs');
  assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), '9fabce77034a64d7a3d8467711bb87d582b7de905d06417ce19e0493ebf78df7');
  assert.equal(createHash('sha256').update(SHEET).digest('hex'), '50f72e42983776d8e21e8239f6885a8b3a575ecc329fb9f32bfd2ae17d45b6fb');
  assert.equal(execFileSync(process.execPath, [source], { cwd: root, encoding: 'utf8' }), SHEET);
});

test('Ignition B fixture retains the selected source hash and exact cell envelopes', () => {
  assert.equal(createHash('sha256').update(IGNITION_SOURCE).digest('hex'), 'e7f3e2be168bedc5c15836d105ffed570f3bfd8745522502293de8718f503aec');
  for (const [name, width, height] of [['standard', 22, 10], ['banner', 44, 20], ['micro', 16, 5]]) {
    assert.equal(ignition[name].length, height);
    for (const row of ignition[name]) {
      assert.equal(row.text.length, width);
      assert.equal(row.colors.length, width);
      for (const [index, glyph] of [...row.text].entries()) {
        if (glyph === ' ') assert.equal(row.colors[index], null);
        else assert.ok(['#FF6337', '#D7F75B', '#F2EFDF'].includes(row.colors[index]));
      }
    }
  }
});

test('canonical sizes preserve Ignition B rows and the allowed glyph inventory', async () => {
  const { standard, banner, micro, lockup } = await mark();
  for (const [rows, width, height] of [[standard, 22, 10], [banner, 44, 20], [micro, 16, 5]]) {
    assert.equal(rows.length, height);
    for (const row of rows) { assert.equal(row.length, width); assert.match(row, glyphs); }
  }
  assert.deepEqual(standard, variants.A);
  assert.deepEqual(banner, variants.D);
  assert.deepEqual(micro, variants.G);
  assert.equal(lockup('grok').length, 10);
  assert.deepEqual(lockup('grok').map((row) => row.slice(0, 28)), standard.map((row) => row.padEnd(28)));
  assert.equal(lockup('grok')[5], `${standard[5].padEnd(28)}  grok`);
});

test('Ignition B uses exact per-cell truecolor and 256 colors without changing glyphs', async () => {
  const api = await mark();
  const codes = { '#FF6337': ['255;99;55', 203], '#D7F75B': ['215;247;91', 191], '#F2EFDF': ['242;239;223', 230] };
  for (const name of ['standard', 'banner', 'micro']) {
    for (const mode of ['truecolor', '256']) {
      const colored = api.colorize([...api[name]], { mode });
      for (const [index, row] of ignition[name].entries()) {
        const expected = [...row.text].map((glyph, column) => {
          const color = row.colors[column];
          if (color === null) return glyph;
          return `\x1b[38;${mode === '256' ? `5;${codes[color][1]}` : `2;${codes[color][0]}`}m${glyph}\x1b[0m`;
        }).join('');
        assert.equal(colored[index], expected, `${name} ${mode} row ${index}`);
        assert.equal(colored[index].replace(/\x1b\[[0-9;]*m/gu, ''), row.text);
        assert.ok(!colored[index].includes('\x1b[48;'), 'never force a background');
      }
    }
    assert.deepEqual(api.colorize(api[name], { mode: 'none' }), api[name]);
    assert.ok(api.colorize(api[name], { mode: 'none' }).every((row) => !row.includes('\x1b')));
  }
  assert.throws(() => api.colorize(api.standard, { mode: 'invalid' }), /mode/i);
  assert.deepEqual(api.colorize(['█▓'], { mode: 'truecolor' }), ['\x1b[38;2;242;239;223m█\x1b[0m▓'], 'noncanonical rows use ivory without old shadow substitution');
});

test('arbitrary product lockups retain their label and canonical cell colors', async () => {
  const { colorize, lockup, renderMark, standard } = await mark();
  const env = { LANG: 'en_US.UTF-8', TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  for (const productName of ['grok', 'Example 7.2', '연구실 · demo']) {
    const rows = lockup(productName);
    const colored = colorize(rows, { mode: 'truecolor' });
    const standardColor = colorize(standard, { mode: 'truecolor' });
    assert.deepEqual(colored.map((row) => row.replace(/\x1b\[[0-9;]*m/gu, '')), rows);
    for (const [index, row] of colored.entries()) assert.ok(row.startsWith(standardColor[index]));
    assert.deepEqual(renderMark({ productName, env, isTTY: true }), colored);
    for (const size of ['standard', 'banner', 'micro']) {
      const output = renderMark({ size, productName, env, isTTY: true }).join('\n');
      assert.equal(output.split(productName).length, 2);
      assert.ok(output.includes('\x1b[38;2;255;99;55m'));
    }
    assert.deepEqual(renderMark({ productName, env: { LANG: 'C' } }), ['LIT', productName]);
  }
  for (const productName of ['', 'grok\nunsafe', '\x1b[31m']) assert.throws(() => lockup(productName), /product name/);
});

test('terminal mark honors NO_COLOR CI pipes json and non-UTF-8 or dumb fallback', async () => {
  const { renderMark, terminalMode, standard } = await mark();
  const env = { LANG: 'en_US.UTF-8', TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  assert.equal(terminalMode({ env, isTTY: true }), 'truecolor');
  assert.equal(terminalMode({ env: { LANG: env.LANG, TERM: env.TERM }, isTTY: true }), '256');
  for (const options of [{ env: { ...env, NO_COLOR: '' }, isTTY: true }, { env: { ...env, NO_COLOR: '1' }, isTTY: true }, { env: { ...env, CI: '' }, isTTY: true }, { env: { ...env, CI: '1' }, isTTY: true }, { env, isTTY: false }, { env, isTTY: true, args: ['--json'] }, { env, isTTY: true, args: ['--no-color'] }]) {
    assert.equal(terminalMode(options), 'none');
    assert.deepEqual(renderMark(options), standard);
  }
  for (const fallback of [{ ...env, LANG: 'C' }, { ...env, LC_ALL: 'C' }, { ...env, TERM: 'dumb' }, {}]) assert.deepEqual(renderMark({ env: fallback, isTTY: true }), ['LIT']);
});

test('help renders banner and product lockup without discovery or mutation', async (t) => {
  const root = scratch(t); let output = ''; let error = '';
  const code = await run(['--help'], { cwd: root, env: { LANG: 'en_US.UTF-8' }, stdin: { isTTY: false }, stdout: { isTTY: false, write: (text) => { output += text; } }, stderr: { write: (text) => { error += text; } } });
  assert.equal(code, 0, error); assert.ok(output.includes(variants.D[0])); assert.match(output, /grok v\d+\.\d+\.\d+/);
  assert.match(output, /Usage:/); assert.ok(!output.includes('\x1b')); assert.equal(existsSync(join(root, '.grok')), false);
});

test('SessionStart prints standard mark once per session and again for a new session', (t) => {
  const root = scratch(t);
  const first = hook(root); assert.equal(first.status, 0, first.stderr); assert.ok(first.stdout.startsWith(`${variants.A.join('\n')}\n`));
  const second = hook(root); assert.equal(second.status, 0, second.stderr); assert.ok(!second.stdout.includes(variants.A[0]));
  const next = hook(root, 'session-two'); assert.equal(next.status, 0, next.stderr); assert.ok(next.stdout.startsWith(`${variants.A.join('\n')}\n`));
  assert.ok(!first.stdout.includes('\x1b'));
});

test('SessionStart refuses symlinked state without writing through it', (t) => {
  const root = scratch(t); const outside = join(root, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(root, '.grok'), 'dir');
  const result = hook(root);
  assert.notEqual(result.status, 0); assert.ok(!result.stdout.includes(variants.A[0]));
  assert.equal(existsSync(join(outside, 'litgrok')), false);
});

test('concurrent SessionStart processes claim exactly one mark', async (t) => {
  const root = scratch(t);
  const results = await Promise.all(Array.from({ length: 6 }, () => new Promise((resolve, reject) => {
    const options = hookOptions(root);
    const child = spawn(process.execPath, [join(ROOT, '.grok/hooks/session-start.mjs')], options);
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(options.input);
  })));
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  assert.equal(results.filter((result) => result.stdout.startsWith(variants.A[0])).length, 1);
});

test('SessionStart rejects malformed mismatched and oversized events before state creation', (t) => {
  const root = scratch(t);
  for (const input of ['{', 'null', JSON.stringify({ sessionId: 'wrong' }), ' '.repeat(1024 * 1024 + 1)]) {
    const result = spawnSync(process.execPath, [join(ROOT, '.grok/hooks/session-start.mjs')], { ...hookOptions(root), input });
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes(variants.A[0]));
    assert.equal(existsSync(join(root, '.grok')), false);
  }
});

test('SessionStart rejects modified or symlinked ignition markers', (t) => {
  const root = scratch(t);
  assert.equal(hook(root).status, 0);
  const key = createHash('sha256').update('session-one').digest('hex').slice(0, 32);
  const marker = join(root, '.grok/litgrok/session-ledger', `${key}.ignited`);
  writeFileSync(marker, 'modified');
  assert.equal(hook(root).status, 1);
  const outside = join(root, 'untouched'); writeFileSync(outside, 'keep');
  rmSync(marker); symlinkSync(outside, marker);
  assert.equal(hook(root).status, 1);
  assert.equal(readFileSync(outside, 'utf8'), 'keep');
});

for (const skill of ['lit-handoff', 'lit-scientific-visualization', 'autoresearch', 'autoconference', 'litwork']) {
  test(`${skill} declares an advisory one-line activation contract`, () => {
    const text = readFileSync(join(ROOT, '.grok/skills', skill, 'SKILL.md'), 'utf8');
    const expectedBanner = activationBanner(skill);
    assert.ok(text.includes(`activation_banner: "${expectedBanner}"`));
    assert.equal(text.split(/\r?\n/u).filter((line) => line === expectedBanner).length, 1);
    assert.match(text, /Begin[^\n]*response with exactly one(?: model-emitted)? line before anything else/i);
    assert.match(text, /once per request|do not repeat/i);
    assert.ok(!text.includes('LITBURN'));
  });
}

test('litwork declares request, inert-content, and non-routing boundaries', () => {
  const text = readFileSync(join(ROOT, '.grok/skills/litwork/SKILL.md'), 'utf8');
  const activation = text.match(/## #contract\.activation\n([\s\S]*?)(?=\n## |\s*$)/)?.[1] ?? '';
  assert.ok(activation, 'litwork must declare an explicit activation contract');
  assert.match(activation, /explicit(?:ly)?[^\n]*litwork|litwork[^\n]*explicit(?:ly)?/i);
  assert.match(activation, /once per request|one per request/i);
  for (const category of ['quoted', 'code', 'logs', 'retrieved']) {
    assert.match(activation, new RegExp(category, 'i'));
  }
  assert.match(activation, /does not activate|remain inert|inert/i);
  assert.match(activation, /advisory/i);
  assert.match(activation, /bare lit/i);
  assert.match(activation, /(?:no|not)[^\n]*(?:deterministic[^\n]*)?routing/i);
  assert.match(activation, /(?:subsequent|later)[^\n]*(?:repeat|again)/i);
});

test('README heroes preserve all banner rows and product lockup without trailing whitespace', () => {
  for (const name of ['README.md', 'README_ko-KR.md']) {
    const text = readFileSync(join(ROOT, name), 'utf8');
    const hero = text.match(/<details>\n<summary>[^\n]+<\/summary>\n\n```text\n([\s\S]*?)\n```\n\n<\/details>/)[1];
    const displayedRows = variants.D.map((row) => row.trimEnd());
    assert.equal(hero, `${displayedRows.join('\n')}\n\ngrok`);
    assert.equal(hero.split('\n').slice(0, 20).length, 20);
    assert.equal(hero.split('\n')[19], '', 'the twentieth banner row remains present');
    assert.ok(hero.split('\n').every((row) => row === row.trimEnd()));
  }
});
