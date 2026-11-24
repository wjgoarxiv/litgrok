import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { inspectGround } from '../bin/ground-rule.mjs';
import { cardTerminal, createCards, wrapCells } from '../bin/install-cards.mjs';
import { run } from '../bin/litgrok.mjs';

const BIN = fileURLToPath(new URL('../bin/litgrok.mjs', import.meta.url));
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const ENV = Object.freeze({ LANG: 'en_US.UTF-8', TERM: 'xterm-256color', COLORTERM: 'truecolor' });
const RIGHT = '\u001b[C';
const LEFT = '\u001b[D';

const plain = (text) => text.replace(/\u001b\[[0-9;?]*[a-zA-Z]/gu, '').replace(/\r/gu, '');
const cells = (text) => [...text].length;

function terminal({ columns = 80, rows = 40 } = {}) {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.raw = [];
  stdin.setRawMode = (on) => stdin.raw.push(on);
  const stdout = new EventEmitter();
  Object.assign(stdout, {
    isTTY: true,
    columns,
    rows,
    frames: [],
    write(chunk) {
      stdout.frames.push(String(chunk));
      return true;
    },
    text: () => plain(stdout.frames.join('')),
    raw: () => stdout.frames.join(''),
    // The rows of the last card drawn.
    card: () => plain(stdout.frames.filter((frame) => /Ctrl\+C stop/u.test(frame)).at(-1) ?? '').split('\n').filter((row) => row !== ''),
  });
  return { stdin, stdout };
}

function fakeHost(platform = 'linux') {
  const host = new EventEmitter();
  Object.assign(host, { pid: 4242, platform, sent: [], kill: (pid, signal) => host.sent.push([pid, signal]) });
  return host;
}

const QUESTION = { tag: 'LIT 1/1', title: 'Ground rules', note: 'Adds a short section; No leaves it out.', initial: false, yesText: 'add them', noText: 'leave them out' };

async function ask(keys, { question = QUESTION, env = ENV, size, host = fakeHost() } = {}) {
  const io = terminal(size);
  const cards = createCards({ ...io, env, host, settleMs: 5 });
  const pending = cards.confirm(question).then((value) => ({ value }), (error) => ({ error }));
  await delay(20);
  for (const key of keys) {
    if (typeof key === 'function') key(io, host);
    else io.stdin.write(key);
    await delay(5);
  }
  return { ...io, host, pending };
}

async function answerOf(keys, options) {
  const asked = await ask(keys, options);
  const result = await Promise.race([asked.pending, delay(1500, { pendingStill: true })]);
  return { ...asked, ...result };
}

test('the card names the step, the question, the default and the keys, and y, n and Enter answer it', async () => {
  for (const [keys, expected] of [
    [['y'], true], [['Y'], true], [['n'], false], [['\r'], false], [[LEFT, '\r'], true], [[RIGHT, '\r'], true],
    [['\t', '\r'], true], [['\t', '\t', '\r'], false], [['x', ' ', '\r'], false],
  ]) {
    const { value, stdout, stdin } = await answerOf(keys);
    assert.equal(value, expected, JSON.stringify(keys));
    const first = plain(stdout.frames.find((frame) => frame.includes('Ctrl+C stop')));
    assert.match(first, /LIT 1\/1 +Ground rules \[y\/N\]/u);
    assert.match(first, /❯ No \(default\)/u);
    assert.match(first, /Enter = No/u);
    assert.match(stdout.text(), expected ? /✓ Ground rules +add them\n$/u : /✓ Ground rules +leave them out\n$/u, 'the card folds to one row');
    assert.deepEqual(stdin.raw, [true, false], 'raw mode is given back');
    assert.ok(stdout.raw().lastIndexOf('\u001b[?25h') > stdout.raw().lastIndexOf('\u001b[?25l'), 'the cursor is shown again');
    assert.equal(stdin.isPaused(), true, 'a paused terminal lets the process end');
  }
});

test('the highlight, the Enter hint and a Yes default follow the keys', async () => {
  const moved = await ask([LEFT]);
  assert.match(moved.stdout.card().join('\n'), /❯ Yes/u);
  assert.match(moved.stdout.card().join('\n'), /Enter = Yes/u);
  assert.match(moved.stdout.card().join('\n'), / {2}No \(default\)/u, 'the default keeps its name');
  moved.stdin.write('\r');
  assert.deepEqual(await moved.pending, { value: true });
  const yes = await answerOf(['\r'], { question: { ...QUESTION, initial: true } });
  assert.equal(yes.value, true);
  assert.match(yes.stdout.card().join('\n'), /Ground rules \[Y\/n\][\s\S]*❯ Yes \(default\)/u);
});

test('Esc, unknown keys and keys typed before the card is drawn never answer', async () => {
  const io = terminal();
  const cards = createCards({ ...io, env: ENV, host: fakeHost(), settleMs: 40 });
  const pending = cards.confirm(QUESTION);
  io.stdin.write('y\r');
  await delay(80);
  io.stdin.write('\u001b');
  await delay(700);
  io.stdin.write('q');
  assert.equal(await Promise.race([pending, delay(60, 'open')]), 'open');
  io.stdin.write('n');
  assert.equal(await pending, false);
});

test('Ctrl+C gives the terminal back, then stops the whole job; Ctrl+D and a closed terminal reject', async () => {
  const stopped = await answerOf(['\u0003']);
  assert.match(stopped.error.message, /nothing was changed/u);
  assert.deepEqual(stopped.host.sent, [[0, 'SIGINT']]);
  assert.deepEqual(stopped.stdin.raw, [true, false]);
  assert.match(stopped.stdout.text(), /✗ Ground rules +stopped\n$/u);
  assert.equal(stopped.host.eventNames().length, 0, 'no listener is left on the process');
  for (const key of ['\u0004', (io) => io.stdin.end()]) {
    const { error, host, stdin } = await answerOf([key]);
    assert.match(error.message, /nothing was changed/u);
    assert.deepEqual(host.sent, []);
    assert.deepEqual(stdin.raw, [true, false]);
  }
});

test('a signal restores the terminal and is passed on; Ctrl+Z suspends and fg draws the card again', async () => {
  const signalled = await ask([(io, host) => host.emit('SIGTERM', 'SIGTERM')]);
  assert.deepEqual(signalled.host.sent, [[4242, 'SIGTERM']]);
  assert.deepEqual(signalled.stdin.raw, [true, false]);
  const paused = await ask(['\u001a']);
  assert.deepEqual(paused.host.sent, [[0, 'SIGTSTP']]);
  const before = paused.stdout.frames.length;
  paused.host.emit('SIGCONT');
  assert.ok(paused.stdout.frames.slice(before).some((frame) => frame.includes('Ctrl+C stop')));
  paused.stdin.write('y');
  assert.deepEqual(await paused.pending, { value: true });
  assert.deepEqual(paused.stdin.raw, [true, false, true, false]);
});

test('every card row fits the window from 40 to 120 columns and in short windows, and a resize draws it anew', async () => {
  for (const columns of [40, 41, 47, 60, 80, 110, 120, 200]) {
    for (const rows of [12, 16, 24, 50]) {
      const asked = await ask([], { size: { columns, rows } });
      const card = asked.stdout.card();
      assert.ok(card.length < rows, `${columns}x${rows}: ${card.length} rows`);
      for (const row of card) assert.ok(cells(row) < columns, `${columns}x${rows}: ${row}`);
      assert.equal(new Set(card.map(cells)).size, 1, `${columns}x${rows}: the right edge is straight`);
      assert.match(card.join('\n'), /Yes[\s\S]*No/u);
      assert.match(card.join('\n'), /default/u);
      asked.stdin.write('n');
      assert.deepEqual(await asked.pending, { value: false });
    }
  }
  const resized = await ask([(io) => {
    io.stdout.columns = 44;
    io.stdout.emit('resize');
  }], { size: { columns: 100, rows: 30 } });
  for (const row of resized.stdout.card()) assert.ok(cells(row) < 44, row);
  resized.stdin.write('n');
  await resized.pending;
});

test('colour follows the terminal: 24-bit, 256, 16, none with ASCII borders', async () => {
  const shown = async (env) => (await answerOf(['n'], { env })).stdout.raw();
  assert.match(await shown(ENV), /\u001b\[38;2;255;45;149m[\s\S]*\u001b\[38;2;255;99;55m/u, 'pink runs to LitGrok orange');
  const indexed = await shown({ ...ENV, COLORTERM: '' });
  assert.match(indexed, /\u001b\[38;5;\d+m/u);
  assert.doesNotMatch(indexed, /[34]8;2;/u);
  const basic = await shown({ LANG: 'C.UTF-8', TERM: 'xterm' });
  assert.match(basic, /\u001b\[95m/u);
  assert.doesNotMatch(basic, /[34]8;[25];/u);
  const bare = await shown({ LC_ALL: 'C', TERM: 'xterm-256color' });
  assert.doesNotMatch(bare, /\u001b\[[0-9;]*m/u);
  assert.match(plain(bare), /\+-\[LIT 1\/1\] Ground rules \[y\/N\] -+\+/u);
  assert.match(plain(bare), /# > No \(default\) +#/u);
  assert.match(plain(bare), /^[\x20-\x7e\n]*$/u, 'nothing but ASCII');
});

test('cards need a person: two terminals, raw mode, no CI, no dumb terminal, no preset answer, room to draw', () => {
  const ok = { ...terminal(), env: ENV };
  assert.equal(cardTerminal(ok), true);
  assert.equal(cardTerminal({ ...ok, stdin: { isTTY: true } }), false, 'no raw mode');
  assert.equal(cardTerminal({ ...ok, stdin: Object.assign(new PassThrough(), { setRawMode() {} }) }), false);
  assert.equal(cardTerminal({ ...ok, stdout: { isTTY: false } }), false);
  for (const env of [{ CI: '' }, { TERM: 'dumb' }, { LITGROK_GROUND: 'on' }]) assert.equal(cardTerminal({ ...ok, env: { ...ENV, ...env } }), false, JSON.stringify(env));
  assert.equal(cardTerminal({ ...terminal({ columns: 39 }), env: ENV }), false);
  assert.equal(cardTerminal({ ...terminal({ rows: 11 }), env: ENV }), false);
});

test('wrapping drops nothing and counts wide characters', () => {
  const path = '/very/long/폴더/with/한글/and/more/segments/than/fit';
  const lines = wrapCells(`Scope is ${path}`, 12);
  assert.equal(lines.join('').replace('Scope is', ''), path);
  for (const line of lines) assert.ok([...line].reduce((sum, ch) => sum + (/[가-힣]/u.test(ch) ? 2 : 1), 0) <= 12, line);
});

function project() {
  const home = mkdtempSync(join(tmpdir(), 'litgrok-cards-'));
  return { home, env: { ...ENV, HOME: home } };
}

async function install(args, key, { home, env }, size = { columns: 80, rows: 40 }) {
  const { stdin, stdout } = terminal(size);
  let stderr = '';
  const pending = run(args, { cwd: home, env, stdin, stdout, stderr: { isTTY: true, write: (chunk) => { stderr += chunk; return true; } } });
  if (key) {
    while (!stdout.text().includes('Ctrl+C stop')) await delay(10);
    stdin.write(key);
  }
  return { code: await pending, out: stdout.text(), stderr };
}

test('a user install at a terminal asks in a card and closes with a card; the stored answer is the same as before', async () => {
  const box = project();
  try {
    const yes = await install(['install', '--user'], 'y', box);
    assert.equal(yes.code, 0, yes.stderr);
    assert.match(yes.out, /✓ Ground rules +add them\n/u);
    for (const label of ['Payload', 'Safety', 'Ownership', 'Write']) assert.match(yes.out, new RegExp(`✓ ${label} `, 'u'));
    assert.match(yes.out, new RegExp(`LIT +LitGrok ${VERSION.replaceAll('.', '\\.')} is ready`, 'u'));
    assert.match(yes.out, /Hooks +project hooks require trust from a Git project root/u);
    assert.match(yes.out, /Installer never runs git init or changes trust/u);
    assert.match(yes.out, /restart Grok Build/u);
    assert.match(yes.out, /LitFamily extensions\n/u);
    assert.doesNotMatch(yes.out, /INSTALL RECEIPT|INSTALL STEPS|MODEL ROUTE/u);
    assert.equal(inspectGround(readFileSync(join(box.home, '.grok/rules/00-litgrok.md'), 'utf8')).state, 'present');
    const again = await install(['install', '--user'], 'n', box);
    assert.equal(again.code, 0, again.stderr);
    assert.match(again.out, /Ground rules +left out \(litgrok ground on adds them\)/u);
    assert.equal(JSON.parse(readFileSync(join(box.home, '.grok/litgrok-ground.json'), 'utf8')).mode, 'off');
    const quiet = await install(['install', '--user'], null, box);
    assert.doesNotMatch(quiet.out, /Ctrl\+C stop/u, 'a stored no is not asked again');
    assert.match(quiet.out, /was already current/u);
    const gone = await install(['uninstall', '--user'], null, box);
    assert.equal(gone.code, 0, gone.stderr);
    assert.match(gone.out, /LitGrok is removed/u);
  } finally {
    rmSync(box.home, { recursive: true, force: true });
  }
});

test('a refused install names the file on stderr and closes with a failure card', async () => {
  const box = project();
  try {
    const target = join(box.home, '.grok', 'skills', 'lit-plan', 'SKILL.md');
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, 'mine\n');
    const refused = await install(['install'], null, box);
    assert.equal(refused.code, 1);
    assert.ok(refused.stderr.includes(`Refusing to overwrite different existing file: ${target}`));
    assert.match(refused.out, /✗ Ownership[\s\S]*LitGrok install failed[\s\S]*✗ Step +OWNERSHIP/u);
    assert.equal(readFileSync(target, 'utf8'), 'mine\n');
  } finally {
    rmSync(box.home, { recursive: true, force: true });
  }
});

test('--yes, previews and a preset answer keep the plain text on a terminal', async () => {
  for (const [args, env] of [
    [['install', '--user', '--yes'], {}], [['install', '--user', '--dry-run'], {}], [['install', '--user'], { NO_COLOR: '1' }],
    [['install', '--user'], { LITGROK_GROUND: 'on' }], [['install'], { TERM: 'dumb' }],
  ]) {
    const box = project();
    try {
      const { code, out } = await install(args, null, { home: box.home, env: { ...box.env, ...env } });
      assert.equal(code, 0);
      assert.match(out, /╭─ MODEL ROUTE/u, JSON.stringify([args, env]));
      assert.doesNotMatch(out, /LIT 1\/1|is ready/u);
    } finally {
      rmSync(box.home, { recursive: true, force: true });
    }
  }
});

test('the plain question lets go of the terminal, so the process can end', async () => {
  const box = project();
  const { stdout } = terminal();
  const stdin = new PassThrough();
  stdin.isTTY = true;
  try {
    const pending = run(['install', '--user'], { cwd: box.home, env: box.env, stdin, stdout, stderr: stdout });
    while (!stdout.text().includes('[y/N] ')) await delay(10);
    stdin.write('n\n');
    assert.equal(await pending, 0);
    assert.equal(stdin.isPaused(), true);
  } finally {
    rmSync(box.home, { recursive: true, force: true });
  }
});

const tmuxMissing = process.platform === 'win32' || spawnSync('tmux', ['-V']).status !== 0;

test('the real installer answers keys in a real terminal and then ends', { skip: tmuxMissing && 'tmux is not installed' }, async () => {
  const box = project();
  const socket = `litgrok-cards-${process.pid}`;
  const tmux = (...args) => spawnSync('tmux', ['-u', '-L', socket, ...args], { encoding: 'utf8' });
  const screen = () => tmux('capture-pane', '-p', '-S', '-').stdout ?? '';
  const until = async (pattern) => {
    const stop = Date.now() + 30_000;
    while (!pattern.test(screen()) && Date.now() < stop) await delay(100);
    assert.match(screen(), pattern);
  };
  try {
    const quoted = [process.execPath, BIN].map((part) => `'${part.replaceAll("'", "'\\''")}'`).join(' ');
    const command = `cd '${box.home}' && env -i PATH=/usr/bin:/bin HOME='${box.home}' TERM=xterm-256color COLORTERM=truecolor LANG=en_US.UTF-8 ${quoted} install --user; echo "ENDED $?"; sleep 30`;
    assert.equal(tmux('-f', '/dev/null', 'new-session', '-d', '-x', '80', '-y', '30', command).status, 0);
    await until(/❯ No \(default\)/u);
    tmux('send-keys', 'Left');
    await until(/❯ Yes/u);
    tmux('send-keys', 'Enter');
    await until(/ENDED 0/u);
    assert.match(screen(), /✓ Ground rules +add them/u);
    assert.doesNotMatch(screen(), /Ctrl\+C stop/u, 'the card folded away');
    assert.equal(existsSync(join(box.home, '.grok/skills/lit-plan/SKILL.md')), true);
  } finally {
    tmux('kill-server');
    rmSync(box.home, { recursive: true, force: true });
  }
});
