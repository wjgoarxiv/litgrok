import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';
import { CHROME, PLAIN_LINE, sampleStops, synthwaveRows, synthwaveSize } from '../.grok/hooks/lit-synthwave.mjs';
import { MONO_ROWS, PIXEL_ROWS, SHARED_COLOURS, SPEC_DIGEST } from '../.grok/hooks/lit-synthwave-rows.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// The digest the LitFamily synthwave spec published for these rows.
const PUBLISHED_DIGEST = 'f063a0cefb969db40c0fc436742240912d895d43c3013d35782320befc0a2b86';
const SIZES = ['B-L', 'B-M', 'B-S'];
const cells = (row) => [...stripVTControlCharacters(row)].length;

function capture({ args = ['--help'], env = { LANG: 'en_US.UTF-8' }, isTTY = false, columns, cwd } = {}) {
  let stdout = '';
  let stderr = '';
  const io = {
    cwd: cwd ?? tmpdir(),
    env,
    stdin: { isTTY },
    stdout: { isTTY, columns, write: (text) => { stdout += text; return true; } },
    stderr: { write: (text) => { stderr += text; return true; } },
  };
  return run(args, io).then((code) => ({ code, stdout, stderr }));
}

test('the generated rows recompute to the pinned spec digest', () => {
  const block = (rows) => SIZES.map((size) => rows[size].join('\n')).join('\n--\n');
  const digest = createHash('sha256').update(block(PIXEL_ROWS)).update(JSON.stringify(SHARED_COLOURS)).update(block(MONO_ROWS)).digest('hex');
  assert.equal(digest, SPEC_DIGEST);
  assert.equal(SPEC_DIGEST, PUBLISHED_DIGEST);
});

test('the size ladder follows the terminal width, and an unknown width counts as 80', () => {
  for (const [columns, size] of [[20, null], [23, null], [24, 'B-S'], [43, 'B-S'], [44, 'B-M'], [75, 'B-M'], [76, 'B-L'], [80, 'B-L'], [200, 'B-L'], [undefined, 'B-L'], [Number.NaN, 'B-L'], [0, 'B-L']]) {
    assert.equal(synthwaveSize(columns), size, `${columns} columns`);
  }
  assert.deepEqual(synthwaveRows({ columns: 20, mode: 'truecolor' }), ['LIT · grok build']);
  assert.deepEqual(synthwaveRows({ columns: 80, mode: 'plain' }), [PLAIN_LINE]);
  for (const [columns, size] of [[24, 'B-S'], [44, 'B-M'], [76, 'B-L'], [80, 'B-L'], [200, 'B-L']]) {
    const rows = synthwaveRows({ columns, mode: 'mono' });
    assert.deepEqual(rows.slice(0, -1), MONO_ROWS[size], `${columns} columns print the ${size} glyph scene as given`);
    assert.equal(rows.at(-1).trim(), PLAIN_LINE);
    assert.equal(synthwaveRows({ columns, mode: 'truecolor' }).length, PIXEL_ROWS[size].length / 2 + 1);
  }
});

test('no row is wider than the terminal at any width from 20 to 200', () => {
  for (let columns = 20; columns <= 200; columns += 1) {
    for (const mode of ['truecolor', '256', 'mono', 'plain']) {
      for (const row of synthwaveRows({ columns, mode })) assert.ok(cells(row) <= columns, `${mode} at ${columns}: ${cells(row)} cells`);
    }
  }
});

test('the glyph scene and the plain line carry no escape byte', () => {
  for (let columns = 20; columns <= 200; columns += 1) {
    for (const mode of ['mono', 'plain']) assert.ok(synthwaveRows({ columns, mode }).every((row) => !row.includes('\u001b')), `${mode} at ${columns}`);
  }
});

test('painted pixels follow the two-pixel cell encoding and the LitGrok chrome', () => {
  assert.deepEqual(sampleStops(CHROME, 0), [0xf5, 0xe8, 0xff]);
  assert.deepEqual(sampleStops(CHROME, 1), [0x5b, 0x21, 0xb6]);
  assert.deepEqual(sampleStops(CHROME, 0.6), [0xff, 0xff, 0xff], 't = 0.6 lands on the white fourth stop');
  const truecolor = synthwaveRows({ columns: 24, mode: 'truecolor' });
  // B-S cell row 0 starts with two '!' pixels (one colour): a space on that background. Cell row 2 pairs
  // '&' (#111133) over ')' (#221133): an upper-half block, the upper pixel as ink, the lower as paper.
  assert.ok(truecolor[0].startsWith('\u001b[48;2;17;17;34m \u001b[0m'));
  assert.ok(truecolor[2].startsWith('\u001b[38;2;17;17;51;48;2;34;17;51m▀'), 'upper pixel is ink, lower pixel is paper');
  assert.ok(truecolor.some((row) => row.includes('48;2;255;255;255m ')), 'equal edge pixels draw a space on that background');
  const indexed = synthwaveRows({ columns: 24, mode: '256' });
  assert.ok(indexed.every((row) => !/[34]8;2;/u.test(row)), '256 colours never send 24-bit codes');
  assert.ok(indexed[2].startsWith('\u001b[38;5;17;48;5;53m▀'), 'the xterm cube index 16+36r+6g+b');
  const tagline = truecolor.at(-1);
  assert.equal(stripVTControlCharacters(tagline).trim(), PLAIN_LINE);
  assert.ok(tagline.includes('\u001b[38;2;139;233;253mL'), 'the tagline gradient starts on its first stop');
  assert.ok(tagline.includes('\u001b[38;2;255;210;63md'), 'and ends on its last');
});

test('help draws the mark by width and colour depth, and the plain line where block glyphs fail', async () => {
  const truecolor = { LANG: 'en_US.UTF-8', TERM: 'xterm-256color', COLORTERM: 'truecolor' };
  const painted = await capture({ env: truecolor, isTTY: true, columns: 44 });
  assert.equal(painted.code, 0, painted.stderr);
  assert.match(painted.stdout, /\u001b\[38;2;/u);
  const rows = painted.stdout.split('\n');
  assert.equal(stripVTControlCharacters(rows[PIXEL_ROWS['B-M'].length / 2]).trim(), PLAIN_LINE, 'B-M at 44 columns, then the tagline');
  const indexed = await capture({ env: { LANG: 'en_US.UTF-8', TERM: 'xterm-256color' }, isTTY: true, columns: 80 });
  assert.match(indexed.stdout, /\u001b\[38;5;\d+;48;5;\d+m▀/u);
  assert.doesNotMatch(indexed.stdout, /[34]8;2;/u);
  const narrow = await capture({ env: { LANG: 'en_US.UTF-8', COLUMNS: '30', NO_COLOR: '1' }, isTTY: true });
  assert.ok(narrow.stdout.startsWith(`${MONO_ROWS['B-S'].join('\n')}\n`), 'COLUMNS picks the size when the stream has no width');
  const mono = await capture({ env: { LANG: 'en_US.UTF-8', NO_COLOR: '1', COLORTERM: 'truecolor' }, isTTY: true });
  assert.ok(!mono.stdout.includes('\u001b'), 'NO_COLOR in a terminal sends no escape');
  assert.ok(mono.stdout.startsWith(`${MONO_ROWS['B-L'].join('\n')}\n`), 'and draws the glyph scene');
  const plain = await capture({ env: { LANG: 'C' }, isTTY: true });
  assert.ok(plain.stdout.startsWith(`${PLAIN_LINE}\nlitgrok v`));
  const tiny = await capture({ env: { LANG: 'en_US.UTF-8' }, isTTY: true, columns: 22 });
  assert.ok(tiny.stdout.startsWith(`${PLAIN_LINE}\n`));
});

test('a pipe gets only the plain line and the version, whatever the colour and width', async () => {
  for (const env of [{ LANG: 'en_US.UTF-8', COLORTERM: 'truecolor', COLUMNS: '200' }, { LANG: 'en_US.UTF-8', NO_COLOR: '1' }, { LANG: 'en_US.UTF-8', TERM: 'xterm-256color' }]) {
    for (const columns of [undefined, 44, 120]) {
      const piped = await capture({ env, isTTY: false, columns });
      assert.equal(piped.code, 0, piped.stderr);
      assert.match(piped.stdout, /^LIT · grok build\nlitgrok v\d+\.\d+\.\d+\n\n/u);
      assert.doesNotMatch(piped.stdout, /[█▀▄░\u001b]/u, 'no art, no colour, no glyph scene');
    }
  }
});

test('a dry run in a project draws the glyph scene, names that project and writes nothing', async (t) => {
  const project = mkdtempSync(join(tmpdir(), 'litgrok-synthwave-'));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const result = await capture({ args: ['install', '--dry-run'], cwd: project, env: { HOME: project, LANG: 'en_US.UTF-8', COLORTERM: 'truecolor' }, isTTY: true, columns: 60 });
  assert.equal(result.code, 0, result.stderr);
  assert.ok(!result.stdout.includes('\u001b'), 'a dry run stays escape-free');
  assert.ok(result.stdout.includes(`${MONO_ROWS['B-M'].join('\n')}\n`));
  assert.ok(result.stdout.includes(`Scope      project scope → ${join(project, '.grok')}`));
  for (const row of result.stdout.split('\n').slice(0, MONO_ROWS['B-M'].length + 3)) assert.ok(cells(row) <= 60, row);
  assert.deepEqual(readdirSync(project), []);
});

test('the mark stays out of every hook: only the installer and the status pill read the synthwave module', () => {
  const hooks = join(ROOT, '.grok/hooks');
  const readers = readdirSync(hooks).filter((name) => name.endsWith('.mjs') && !name.startsWith('lit-synthwave') && readFileSync(join(hooks, name), 'utf8').includes('lit-synthwave'));
  assert.deepEqual(readers, ['lit-status-line.mjs']);
  assert.match(readFileSync(join(hooks, 'lit-status-line.mjs'), 'utf8'), /^import \{ CHROME \} from '\.\/lit-synthwave\.mjs';$/mu, 'the status line takes only the chrome stops');
  assert.ok(existsSync(join(ROOT, 'bin/litgrok.mjs')) && readFileSync(join(ROOT, 'bin/litgrok.mjs'), 'utf8').includes("from '../.grok/hooks/lit-synthwave.mjs'"));
  for (const name of readdirSync(hooks).filter((entry) => entry.endsWith('.mjs') && !entry.startsWith('lit-synthwave'))) {
    assert.ok(!readFileSync(join(hooks, name), 'utf8').includes(MONO_ROWS['B-S'][1]), `${name} carries no art`);
  }
});
