import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';
import {
  GROUND_MAX_BYTES,
  addedGroundBytes,
  decideGround,
  inspectGround,
  packagedGround,
  removeGround,
  upsertGround,
} from '../bin/ground-rule.mjs';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const RULE = new URL('../.grok/rules/00-litgrok.md', import.meta.url);

function home() {
  return mkdtempSync(join(tmpdir(), 'litgrok-ground-'));
}

function tty() {
  const sink = { isTTY: true, write() { return true; } };
  return { stdin: { isTTY: true }, stdout: sink, stderr: sink };
}

function answering(text) {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.read = () => null;
  stdin.pause = () => {};
  stdin.resume = () => {};
  process.nextTick(() => stdin.emit('data', text));
  return stdin;
}

test('the packaged user rule carries one ground section under the byte cap, at this version', () => {
  const text = readFileSync(RULE, 'utf8');
  const found = inspectGround(text);
  assert.equal(found.state, 'present');
  assert.equal(found.version, VERSION);
  assert.ok(addedGroundBytes(text) <= GROUND_MAX_BYTES, `added ${addedGroundBytes(text)} bytes`);
  const packaged = packagedGround();
  assert.equal(packaged.version, VERSION);
  const removed = removeGround(text);
  assert.equal(Buffer.byteLength(removed.text) + addedGroundBytes(text), Buffer.byteLength(text));
  assert.equal(upsertGround(removed.text, { version: packaged.version, body: packaged.body, created: false }).text, text);
});

test('adding the section and removing it returns the original bytes, including CRLF', () => {
  const original = 'keep this\r\nline\r\n';
  const added = upsertGround(original, { version: '1.0.30', body: 'One line.\r\nStill one.', created: false });
  assert.equal(added.changed, true);
  assert.equal(inspectGround(added.text).state, 'present');
  assert.match(added.text, /\r\n/);
  const removed = removeGround(added.text);
  assert.equal(removed.text, original);
  assert.throws(() => upsertGround('<!-- litfamily:litgrok:start v=1 -->\r\nno end\r\n', { version: '1', body: 'x' }));
  assert.equal(inspectGround('<!-- litfamily:litgrok:start v=1 -->\n<!-- litfamily:litgrok:start v=2 -->\n<!-- litfamily:litgrok:end -->\n').state, 'malformed');
});

test('a user install keeps one section, a second install does not rewrite it, and uninstall removes it', async () => {
  const root = home();
  const rule = join(root, '.grok', 'rules', '00-litgrok.md');
  const env = { HOME: root };
  try {
    assert.equal(await run(['install', '--user', '--yes'], { ...tty(), cwd: root, env }), 0);
    const first = readFileSync(rule);
    assert.equal(inspectGround(first.toString('utf8')).version, VERSION);
    const stamped = new Date('2000-01-01T00:00:00.000Z');
    utimesSync(rule, stamped, stamped);
    assert.equal(await run(['install', '--user', '--yes'], { ...tty(), cwd: root, env }), 0);
    assert.equal(statSync(rule).mtimeMs, stamped.getTime());
    assert.equal(readFileSync(rule).equals(first), true);
    assert.equal(await run(['uninstall', '--user', '--yes'], { ...tty(), cwd: root, env }), 0);
    assert.equal(statSync(rule, { throwIfNoEntry: false }), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ground off removes the section and stays off until ground on or install --yes', async () => {
  const root = home();
  const rule = join(root, '.grok', 'rules', '00-litgrok.md');
  const env = { HOME: root };
  const io = () => ({ stdin: { isTTY: true }, stdout: { isTTY: true, write() { return true; } }, stderr: { isTTY: true, write() { return true; } } });
  try {
    assert.equal(await run(['install', '--user', '--yes'], { ...io(), cwd: root, env }), 0);
    const withSection = readFileSync(rule, 'utf8');
    assert.equal(await run(['ground', 'off'], { ...io(), cwd: root, env }), 0);
    const stripped = readFileSync(rule, 'utf8');
    assert.equal(stripped, removeGround(withSection).text);
    assert.equal(inspectGround(stripped).state, 'absent');
    const status = { out: '' };
    assert.equal(await run(['ground', 'status'], {
      cwd: root,
      env,
      stdin: { isTTY: false },
      stdout: { isTTY: false, write(value) { status.out += String(value); return true; } },
      stderr: { isTTY: false, write() { return true; } },
    }), 0);
    assert.match(status.out, new RegExp(`^GROUND: off ${rule}$`, 'm'));
    assert.equal(await run(['install', '--user', '--yes', '--no-ground'], { ...io(), cwd: root, env }), 0);
    assert.equal(inspectGround(readFileSync(rule, 'utf8')).state, 'absent');
    assert.equal(await run(['install', '--user', '--yes'], { ...io(), cwd: root, env }), 0);
    assert.equal(inspectGround(readFileSync(rule, 'utf8')).version, VERSION);
    const back = { out: '' };
    assert.equal(await run(['doctor', '--no-color'], {
      cwd: root,
      env,
      stdin: { isTTY: false },
      stdout: { isTTY: false, write(value) { back.out += String(value); return true; } },
      stderr: { isTTY: false, write() { return true; } },
      fetch: async () => { throw new Error('offline'); },
    }), 0);
    assert.match(back.out, new RegExp(`GROUND: present v=${VERSION} ${rule}`));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('an interactive no stores off, and a symlink or non-directory destination is refused', async () => {
  const root = home();
  const env = { HOME: root };
  const stdout = { isTTY: true, chunks: '', write(value) { this.chunks += String(value); return true; } };
  const stderr = { isTTY: true, chunks: '', write(value) { this.chunks += String(value); return true; } };
  try {
    const decision = await decideGround({
      scope: 'user',
      yes: false,
      noGround: false,
      env,
      stdin: answering('n\n'),
      stdout,
      home: root,
    });
    assert.equal(decision.include, false);
    assert.equal(decision.afterWrite, 'store-off');
    assert.match(stdout.chunks, /ground rules/i);

    assert.equal(await run(['install', '--user', '--yes'], { stdin: { isTTY: true }, stdout, stderr, cwd: root, env }), 0);
    const rule = join(root, '.grok', 'rules', '00-litgrok.md');
    const linked = `${rule}.link`;
    writeFileSync(linked, readFileSync(rule));
    rmSync(rule);
    symlinkSync(linked, rule);
    const refused = { err: '' };
    assert.equal(await run(['ground', 'off'], {
      cwd: root,
      env,
      stdin: { isTTY: false },
      stdout: { isTTY: false, write() { return true; } },
      stderr: { isTTY: false, write(value) { refused.err += String(value); return true; } },
    }), 1);
    assert.match(refused.err, /symbolic link/i);
    assert.equal(lstatSync(rule).isSymbolicLink(), true);

    const project = mkdtempSync(join(tmpdir(), 'litgrok-ground-project-'));
    mkdirSync(join(project, '.grok'));
    writeFileSync(join(project, '.grok', 'rules'), 'not a directory\n');
    const projectErr = { err: '' };
    assert.equal(await run(['ground', 'project'], {
      cwd: project,
      env,
      stdin: { isTTY: false },
      stdout: { isTTY: false, write() { return true; } },
      stderr: { isTTY: false, write(value) { projectErr.err += String(value); return true; } },
    }), 1);
    assert.match(projectErr.err, /non-directory/i);
    assert.equal(readFileSync(join(project, '.grok', 'rules'), 'utf8'), 'not a directory\n');
    rmSync(project, { recursive: true, force: true });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('ground project writes one owned file, leaves a foreign file alone, and remove deletes only its own', async () => {
  const project = mkdtempSync(join(tmpdir(), 'litgrok-ground-project-'));
  const target = join(project, '.grok', 'rules', '10-litgrok-ground.md');
  const env = { HOME: home() };
  const quiet = {
    stdin: { isTTY: false },
    stdout: { isTTY: false, write() { return true; } },
    stderr: { isTTY: false, write() { return true; } },
  };
  try {
    assert.equal(await run(['ground', 'project'], { ...quiet, cwd: project, env }), 0);
    const first = readFileSync(target);
    assert.equal(inspectGround(first.toString('utf8')).version, VERSION);
    assert.ok(first.length <= GROUND_MAX_BYTES);
    const stamped = new Date('2000-01-01T00:00:00.000Z');
    utimesSync(target, stamped, stamped);
    assert.equal(await run(['ground', 'project'], { ...quiet, cwd: project, env }), 0);
    assert.equal(statSync(target).mtimeMs, stamped.getTime());

    const foreign = mkdtempSync(join(tmpdir(), 'litgrok-ground-foreign-'));
    mkdirSync(join(foreign, '.grok', 'rules'), { recursive: true });
    const foreignFile = join(foreign, '.grok', 'rules', '10-litgrok-ground.md');
    writeFileSync(foreignFile, 'someone else wrote this\n');
    const err = { text: '' };
    assert.equal(await run(['ground', 'project'], {
      cwd: foreign,
      env,
      stdin: { isTTY: false },
      stdout: { isTTY: false, write() { return true; } },
      stderr: { isTTY: false, write(value) { err.text += String(value); return true; } },
    }), 1);
    assert.match(err.text, /refus/i);
    assert.equal(readFileSync(foreignFile, 'utf8'), 'someone else wrote this\n');

    assert.equal(await run(['ground', 'project', '--remove'], { ...quiet, cwd: project, env }), 0);
    assert.equal(statSync(target, { throwIfNoEntry: false }), undefined);
    rmSync(foreign, { recursive: true, force: true });
  } finally {
    rmSync(project, { recursive: true, force: true });
    rmSync(env.HOME, { recursive: true, force: true });
  }
});
