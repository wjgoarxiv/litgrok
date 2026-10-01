import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';
import * as hudState from '../.grok/hooks/litgrok-hud-state.mjs';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOKS = join(PRODUCT_ROOT, '.grok', 'hooks');
const STOP = join(HOOKS, 'stop.mjs');
const POST_COMPACT = join(HOOKS, 'post-compact.mjs');
const STATUS_SCRIPT = join(HOOKS, 'lit-status-line.mjs');
const SKILL = join(PRODUCT_ROOT, '.grok', 'skills', 'lit-handoff', 'SKILL.md');
const SESSION = 'session-auto-handoff';
const SAVED_LINE = 'Handoff saved. Run /compact now.';
const CLEARED = ['CI', 'NO_COLOR', 'FORCE_COLOR', 'LITGROK_AUTO_HANDOFF', 'LITGROK_AUTO_HANDOFF_PERCENT'];

function sandbox(t) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-auto-handoff-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'workspace');
  const home = join(root, 'home');
  mkdirSync(workspace);
  mkdirSync(home);
  return { root, workspace, home, stateRoot: join(root, 'state') };
}

function environment(sb, extra = {}) {
  const env = { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot };
  for (const name of CLEARED) delete env[name];
  return { ...env, ...extra };
}

async function cli(sb, args, extraEnv = {}) {
  let stdout = '';
  let stderr = '';
  const code = await run(['auto-handoff', ...args], {
    cwd: sb.workspace,
    env: environment(sb, extraEnv),
    stdin: { isTTY: false },
    stdout: { isTTY: false, write(value) { stdout += String(value); return true; } },
    stderr: { isTTY: false, write(value) { stderr += String(value); return true; } },
  });
  return { code, stdout, stderr };
}

function configPath(sb) {
  return join(sb.workspace, '.grok', 'litgrok', 'auto-handoff.json');
}

function readConfig(sb) {
  return JSON.parse(readFileSync(configPath(sb), 'utf8'));
}

function writeConfig(sb, text) {
  mkdirSync(dirname(configPath(sb)), { recursive: true });
  writeFileSync(configPath(sb), typeof text === 'string' ? text : JSON.stringify(text));
}

function statusLine(sb, { percent, threshold, sessionId = SESSION, extraEnv = {} } = {}) {
  const contextWindow = {};
  if (percent !== undefined) contextWindow.used_percentage = percent;
  if (threshold !== undefined) contextWindow.auto_compact_threshold_percent = threshold;
  const input = {
    cwd: sb.workspace,
    session_id: sessionId,
    workspace: { current_dir: sb.workspace },
    model: { display_name: 'grok-4' },
    context_window: contextWindow,
  };
  const result = spawnSync(process.execPath, [STATUS_SCRIPT], {
    cwd: sb.workspace,
    encoding: 'utf8',
    env: environment(sb, { LITGROK_HUD_COLOR: '0', ...extraEnv }),
    input: `${JSON.stringify(input)}\n`,
  });
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function runHook(sb, script, eventName, hookName, eventExtra = {}, extraEnv = {}) {
  const event = {
    hookEventName: eventName,
    sessionId: SESSION,
    cwd: sb.workspace,
    workspaceRoot: sb.workspace,
    promptId: 'prompt-1',
    permissionMode: 'default',
    ...eventExtra,
  };
  return spawnSync(process.execPath, [script], {
    cwd: sb.workspace,
    encoding: 'utf8',
    env: environment(sb, {
      GROK_HOOK_EVENT: eventName,
      GROK_HOOK_NAME: hookName,
      GROK_SESSION_ID: SESSION,
      GROK_WORKSPACE_ROOT: sb.workspace,
      ...extraEnv,
    }),
    input: `${JSON.stringify(event)}\n`,
  });
}

function stop(sb, eventExtra = {}, extraEnv = {}) {
  const result = runHook(sb, STOP, 'Stop', 'stop', { reason: 'end_turn', ...eventExtra }, extraEnv);
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function postCompact(sb) {
  const result = runHook(sb, POST_COMPACT, 'PostCompact', 'post-compact');
  assert.equal(result.status, 0, result.stderr);
}

function ledger(sb) {
  const directory = join(sb.workspace, '.grok', 'litgrok', 'session-ledger');
  if (!existsSync(directory)) return [];
  const [file] = readdirSync(directory).filter((name) => name.endsWith('.jsonl'));
  if (!file) return [];
  return readFileSync(join(directory, file), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const directives = (sb) => ledger(sb).filter((record) => record.signal === 'auto-handoff-directive');
const reloads = (sb) => ledger(sb).filter((record) => record.signal === 'auto-handoff-reload');

function contextFiles(sb) {
  return existsSync(sb.stateRoot) ? readdirSync(sb.stateRoot).filter((name) => name.startsWith('context-')) : [];
}

async function marker(sessionId = SESSION) {
  const gate = await import('../.grok/hooks/auto-handoff-gate.mjs');
  return gate.handoffMarker(sessionId);
}

async function writeHandoff(sb, { withMarker = true, sessionId = SESSION, offsetMs = 5000, path = '.handoff/HANDOFF.md' } = {}) {
  const target = join(sb.workspace, path);
  mkdirSync(dirname(target), { recursive: true });
  const line = withMarker ? await marker(sessionId) : '';
  writeFileSync(target, `# Handoff\n\n## Task\nFinish the demo page.\n\n## Next Steps\n1. Run the demo tests.\n\n## Context for Continuation\n${line}\n`);
  const directive = directives(sb).at(-1);
  const base = directive ? Date.parse(directive.recordedAt) : Date.now();
  const when = new Date(base + offsetMs);
  utimesSync(target, when, when);
  return target;
}

async function armed(sb, percent = 60) {
  const result = await cli(sb, ['on', String(percent)]);
  assert.equal(result.code, 0, result.stderr);
}

test('automatic handoff is OFF by default and leaves no trace', (t) => {
  const sb = sandbox(t);
  statusLine(sb, { percent: 99 });
  const result = stop(sb);

  assert.equal(result.stdout, '', 'nothing may block while the feature is off');
  assert.deepEqual(contextFiles(sb), [], 'the status line records nothing while the feature is off');
  assert.equal(existsSync(configPath(sb)), false, 'no config file appears on its own');
  assert.equal(directives(sb).length, 0);
});

test('on, off and on again reuse the percent the user chose last', async (t) => {
  const sb = sandbox(t);
  const first = await cli(sb, ['on', '60']);
  assert.equal(first.code, 0, first.stderr);
  assert.deepEqual(readConfig(sb), { enabled: true, percent: 60 });
  assert.match(first.stdout, /ON at 60 percent/u);

  const off = await cli(sb, ['off']);
  assert.equal(off.code, 0, off.stderr);
  assert.deepEqual(readConfig(sb), { enabled: false, percent: 60 }, 'turning off keeps the last percent');
  assert.match(off.stdout, /OFF/u);

  const again = await cli(sb, ['on']);
  assert.equal(again.code, 0, again.stderr);
  assert.deepEqual(readConfig(sb), { enabled: true, percent: 60 });

  const changed = await cli(sb, ['on', '45']);
  assert.equal(changed.code, 0, changed.stderr);
  assert.deepEqual(readConfig(sb), { enabled: true, percent: 45 });
});

test('on without a number asks for one when none was ever set', async (t) => {
  const sb = sandbox(t);
  const result = await cli(sb, ['on']);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Which percent/u);
  assert.match(result.stderr, /litgrok auto-handoff on <percent>/u);
  assert.equal(existsSync(configPath(sb)), false, 'nothing is written without a percent');
});

test('an invalid percent is refused and never written', async (t) => {
  const sb = sandbox(t);
  for (const bad of ['0', '100', 'abc', '5.5', '-3', '05', ' 60', '60%', '']) {
    const result = await cli(sb, ['on', bad]);
    assert.equal(result.code, 1, `percent ${JSON.stringify(bad)} must be refused`);
    assert.match(result.stderr, /1 and 99/u);
    assert.equal(existsSync(configPath(sb)), false);
  }
  const unknown = await cli(sb, ['later']);
  assert.equal(unknown.code, 1);
  assert.match(unknown.stderr, /Usage/u);
});

test('status reports the state, its source and warnings', async (t) => {
  const sb = sandbox(t);
  const fresh = await cli(sb, ['status']);
  assert.equal(fresh.code, 0, fresh.stderr);
  assert.match(fresh.stdout, /Automatic handoff: OFF/u);

  await armed(sb, 60);
  const on = await cli(sb, ['status']);
  assert.match(on.stdout, /Automatic handoff: ON at 60 percent/u);
  assert.match(on.stdout, /status line/u, 'the status line requirement is stated');

  const forced = await cli(sb, ['status'], { LITGROK_AUTO_HANDOFF: '0' });
  assert.match(forced.stdout, /Automatic handoff: OFF/u);
  assert.match(forced.stdout, /LITGROK_AUTO_HANDOFF/u, 'the environment override is named');
});

test('the environment variables turn it on without a file and override the file', (t) => {
  const sb = sandbox(t);
  const env = { LITGROK_AUTO_HANDOFF: '1', LITGROK_AUTO_HANDOFF_PERCENT: '70' };
  statusLine(sb, { percent: 75, extraEnv: env });
  const blocked = stop(sb, {}, env);
  assert.equal(JSON.parse(blocked.stdout).decision, 'block');
  assert.equal(directives(sb)[0].percent, 70);

  const off = sandbox(t);
  writeConfig(off, { enabled: true, percent: 50 });
  statusLine(off, { percent: 99, extraEnv: { LITGROK_AUTO_HANDOFF: '0' } });
  assert.equal(stop(off, {}, { LITGROK_AUTO_HANDOFF: '0' }).stdout, '', 'LITGROK_AUTO_HANDOFF=0 wins over an enabled file');
});

test('an invalid percent or file means OFF with a warning in status', async (t) => {
  for (const bad of ['abc', '0', '100', '7.5']) {
    const sb = sandbox(t);
    const env = { LITGROK_AUTO_HANDOFF: '1', LITGROK_AUTO_HANDOFF_PERCENT: bad };
    statusLine(sb, { percent: 99, extraEnv: env });
    assert.equal(stop(sb, {}, env).stdout, '', `env percent ${bad} must mean OFF`);
    const report = await cli(sb, ['status'], env);
    assert.match(report.stdout, /Automatic handoff: OFF/u);
    assert.match(report.stdout, /Warning: .*LITGROK_AUTO_HANDOFF_PERCENT/u);
  }
  for (const bad of ['{', JSON.stringify({ enabled: true, percent: '60' }), JSON.stringify({ enabled: true, percent: 100 })]) {
    const sb = sandbox(t);
    writeConfig(sb, bad);
    statusLine(sb, { percent: 99 });
    assert.equal(stop(sb).stdout, '', 'an unreadable or invalid file must mean OFF');
    assert.deepEqual(contextFiles(sb), []);
    const report = await cli(sb, ['status']);
    assert.match(report.stdout, /Automatic handoff: OFF/u);
    assert.match(report.stdout, /Warning: .*auto-handoff\.json/u);
  }
});

test('ON without a percent does nothing and says so', async (t) => {
  const sb = sandbox(t);
  writeConfig(sb, { enabled: true, percent: null });
  statusLine(sb, { percent: 99 });
  assert.equal(stop(sb).stdout, '');
  assert.deepEqual(contextFiles(sb), []);
  const report = await cli(sb, ['status']);
  assert.match(report.stdout, /Warning: .*no percent/iu);
});

test('the status line records the context percent only while active, and only when Grok reports one', async (t) => {
  const sb = sandbox(t);
  await armed(sb, 60);
  statusLine(sb, { percent: undefined });
  assert.deepEqual(contextFiles(sb), [], 'an unknown percent is never guessed');

  const row = statusLine(sb, { percent: 42, threshold: 85 });
  assert.match(row.stdout, /ctx 42%/u, 'the row itself is unchanged');
  const files = contextFiles(sb);
  assert.equal(files.length, 1);
  const record = JSON.parse(readFileSync(join(sb.stateRoot, files[0]), 'utf8'));
  assert.equal(record.sessionId, SESSION);
  assert.equal(record.usedPercentage, 42);
  assert.equal(record.autoCompactThresholdPercent, 85);
});

test('crossing the percent blocks exactly once and never loops', async (t) => {
  const sb = sandbox(t);
  await armed(sb, 60);

  statusLine(sb, { percent: 59 });
  assert.equal(stop(sb).stdout, '', 'below the percent nothing happens');

  statusLine(sb, { percent: 60 });
  const first = stop(sb);
  const decision = JSON.parse(first.stdout);
  assert.equal(decision.decision, 'block');
  assert.ok(decision.reason.includes(SKILL), 'the directive points at the handoff procedure file');
  assert.ok(decision.reason.includes(await marker()), 'the directive asks for the session marker');
  assert.ok(decision.reason.includes(SAVED_LINE), 'the directive asks for the one plain line');
  assert.match(decision.reason, /60 percent/u);
  assert.equal(directives(sb).length, 1);

  assert.equal(stop(sb, { stopHookActive: true }).stdout, '', 'the continuation round never blocks again');
  statusLine(sb, { percent: 75 });
  assert.equal(stop(sb).stdout, '', 'the same crossing never fires twice');
  assert.equal(directives(sb).length, 1);
});

test('a foreign or stale context record never triggers', async (t) => {
  const sb = sandbox(t);
  await armed(sb, 60);
  statusLine(sb, { percent: 99, sessionId: 'another-session' });
  assert.equal(stop(sb).stdout, '', 'another session percent is ignored');

  hudState.writeContextRecord({
    env: environment(sb),
    sessionId: SESSION,
    cwd: sb.workspace,
    usedPercentage: 99,
    now: new Date(Date.now() - 60 * 60 * 1000),
  });
  assert.equal(stop(sb).stdout, '', 'an hour-old percent is ignored');
  assert.equal(directives(sb).length, 0);
});

test('subagent stops and session-end fires never trigger', async (t) => {
  const sb = sandbox(t);
  await armed(sb, 60);
  statusLine(sb, { percent: 99 });
  assert.equal(stop(sb, { subagentType: 'explore' }).stdout, '');
  assert.equal(stop(sb, { reason: 'channel_closed' }).stdout, '');
  assert.equal(directives(sb).length, 0);
});

test('after a compaction the fresh handoff of this session comes back once', async (t) => {
  const sb = sandbox(t);
  await armed(sb, 60);
  statusLine(sb, { percent: 70 });
  assert.equal(JSON.parse(stop(sb).stdout).decision, 'block');

  await writeHandoff(sb);
  postCompact(sb);
  const reload = JSON.parse(stop(sb).stdout);
  assert.equal(reload.decision, 'block');
  assert.ok(reload.reason.includes('.handoff/HANDOFF.md'), 'the reload names the file');
  assert.match(reload.reason, /Finish the demo page/u, 'a bounded digest rides along');
  assert.match(reload.reason, /inert data/u);
  assert.equal(reloads(sb).length, 1);
  assert.equal(reloads(sb)[0].outcome, 'loaded');

  assert.equal(stop(sb).stdout, '', 'the reload happens once; the pre-compaction percent never re-fires');
  assert.equal(directives(sb).length, 1);
});

test('the session marker is recognised inside a list item or a sentence', async (t) => {
  const sb = sandbox(t);
  await armed(sb, 60);
  statusLine(sb, { percent: 70 });
  stop(sb);
  const target = await writeHandoff(sb);
  writeFileSync(target, `# Handoff\n\n## Context for Continuation\n- Session marker (${await marker()}) recorded.\n`);
  const later = new Date(Date.now() + 5000);
  utimesSync(target, later, later);
  postCompact(sb);

  assert.equal(JSON.parse(stop(sb).stdout).decision, 'block');
  assert.equal(reloads(sb)[0].outcome, 'loaded');
});

async function reloadAfter(t, content, { offsetMs = 5000 } = {}) {
  const sb = sandbox(t);
  await armed(sb, 60);
  statusLine(sb, { percent: 70 });
  stop(sb);
  const target = await writeHandoff(sb, { offsetMs });
  writeFileSync(target, content);
  const directive = directives(sb).at(-1);
  const when = new Date(Date.parse(directive.recordedAt) + offsetMs);
  utimesSync(target, when, when);
  postCompact(sb);
  const out = stop(sb).stdout;
  return { sb, out, reload: out ? JSON.parse(out) : null };
}

const digestOf = (sessionId) => createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
const LABEL = 'litgrok-auto-handoff';

const DECORATIONS = {
  'dash bullet': (h) => `- ${LABEL}: ${h}`,
  'star bullet': (h) => `* ${LABEL}: ${h}`,
  'plus bullet': (h) => `+ ${LABEL}: ${h}`,
  'numbered item': (h) => `1. ${LABEL}: ${h}`,
  'blockquote': (h) => `> ${LABEL}: ${h}`,
  'bold label': (h) => `**${LABEL}:** ${h}`,
  'bold label with the colon outside': (h) => `**${LABEL}**: ${h}`,
  'bold value': (h) => `${LABEL}: **${h}**`,
  'italic label': (h) => `*${LABEL}:* ${h}`,
  'italic value': (h) => `${LABEL}: _${h}_`,
  'underscore bold label': (h) => `__${LABEL}:__ ${h}`,
  'backticked label': (h) => `\`${LABEL}\`: ${h}`,
  'backticked value': (h) => `${LABEL}: \`${h}\``,
  'backticked whole marker': (h) => `\`${LABEL}: ${h}\``,
  'bullet, bold label and backticked value': (h) => `- **${LABEL}:** \`${h}\``,
  'a leading label before the real marker': (h) => `Auto-handoff marker: ${LABEL}: ${h}`,
  'a bullet, a leading label and a backticked marker': (h) => `- Auto-handoff marker: \`${LABEL}: ${h}\``,
  'extra spaces': (h) => `-   ${LABEL}:     ${h}   `,
  'HTML comment': (h) => `<!-- ${LABEL}: ${h} -->`,
  'bullet and HTML comment': (h) => `- <!-- ${LABEL}: ${h} -->`,
};

for (const [name, decorate] of Object.entries(DECORATIONS)) {
  test(`a marker line dressed up as ${name} is recognised`, async (t) => {
    const { reload, sb } = await reloadAfter(t, `# Handoff\n\n## Context for Continuation\n${decorate(digestOf(SESSION))}\n`);
    assert.equal(reload?.decision, 'block', 'the handoff must be found');
    assert.equal(reloads(sb)[0].outcome, 'loaded');
  });
}

test('the handoff shape that failed a live session is found', async (t) => {
  const hash = (await marker()).split(': ')[1];
  const body = [
    '# HANDOFF: Finish full-content display for `ref/a.md`',
    '',
    '## What Was Done',
    '',
    '### Successful Approaches',
    '',
    '- Created [notes.md](../notes.md) with 5 bullets for each source, then read it back.',
    `- Auto-handoff marker: \`litgrok-auto-handoff: ${hash}\``,
    '',
    '### Dead Ends',
    '',
    '- A direct `cat ref/a.md` response exceeded the tool output limit.',
    '',
  ].join('\n');
  const { reload, sb } = await reloadAfter(t, body);
  assert.equal(reload?.decision, 'block');
  assert.equal(reloads(sb)[0].outcome, 'loaded');
  assert.match(reload.reason, /Dead Ends/u);
  assert.equal(reload.reason.includes(hash), false, 'the marker line stays out of the digest');
});

test('a decorated marker line never reaches the digest', async (t) => {
  const hash = (await marker()).split(': ')[1];
  const label = 'litgrok-auto-handoff';
  const lines = [
    `${label}: ${hash}`,
    `**${label}:** ${hash}`,
    `- ${label}: \`${hash}\``,
    `> *${label}:* ${hash}`,
    `<!-- ${label}: ${hash} -->`,
  ];
  const { reload } = await reloadAfter(t, `# Handoff\n\nFinish the demo page.\n\n${lines.join('\n')}\n\nAfter the markers.\n`);
  assert.equal(reload?.decision, 'block');
  assert.match(reload.reason, /Finish the demo page/u);
  assert.match(reload.reason, /After the markers/u);
  assert.equal(reload.reason.includes(hash), false, 'no marker line is echoed');
});

const own = digestOf(SESSION);
const WIDENING = {
  'another session, bullet and backticks': [`- **${LABEL}:** \`${digestOf('another-session')}\``, 'foreign', 5000],
  'another session, bare': [`${LABEL}: ${digestOf('another-session')}`, 'foreign', 5000],
  'this hash with one more hex character': [`- ${LABEL}: \`${own}a\``, 'foreign', 5000],
  'this hash with one more digit, bold': [`**${LABEL}:** ${own}0`, 'foreign', 5000],
  'this hash with one more hex character, bare': [`${LABEL}: ${own}a`, 'foreign', 5000],
  'this hash with one more digit, in a bullet': [`- ${LABEL}: ${own}0`, 'foreign', 5000],
  'this hash cut short': [`- ${LABEL}: ${own.slice(0, 31)}`, 'foreign', 5000],
  'the hash without its label': [`- \`${own}\``, 'foreign', 5000],
  'a different label': [`- other-marker: ${own}`, 'foreign', 5000],
  'the right decorated marker but older than the trigger': [`- **${LABEL}:** \`${own}\``, 'stale', -60_000],
};

for (const [name, [line, reason, offsetMs]] of Object.entries(WIDENING)) {
  test(`decorating never widens what counts as this session: ${name}`, async (t) => {
    const { out, sb } = await reloadAfter(t, `# Handoff\n\n${line}\n`, { offsetMs });
    assert.equal(out, '', 'nothing may be reloaded');
    assert.equal(reloads(sb)[0].outcome, 'refused');
    assert.equal(reloads(sb)[0].reason, reason);
  });
}

test('a marker inside a fenced code block is accepted, as it was before', async (t) => {
  const hash = (await marker()).split(': ')[1];
  const { reload } = await reloadAfter(t, `# Handoff\n\n\`\`\`text\nlitgrok-auto-handoff: ${hash}\n\`\`\`\n`);
  assert.equal(reload?.decision, 'block');
});

test('a stale, foreign or missing handoff is refused and consumed', async (t) => {
  const cases = [
    ['stale', { offsetMs: -60_000 }],
    ['foreign', { withMarker: false }],
    ['foreign', { sessionId: 'another-session' }],
    ['missing', null],
  ];
  for (const [reason, options] of cases) {
    const sb = sandbox(t);
    await armed(sb, 60);
    statusLine(sb, { percent: 70 });
    stop(sb);
    if (options) await writeHandoff(sb, options);
    postCompact(sb);

    assert.equal(stop(sb).stdout, '', `${reason}: nothing may be reloaded`);
    assert.equal(reloads(sb).length, 1);
    assert.equal(reloads(sb)[0].outcome, 'refused');
    assert.equal(reloads(sb)[0].reason, reason);
    assert.equal(stop(sb).stdout, '', `${reason}: the refusal is not retried`);
  }
});

test('a new crossing after a compaction fires again', async (t) => {
  const sb = sandbox(t);
  await armed(sb, 60);
  statusLine(sb, { percent: 70 });
  stop(sb);
  await writeHandoff(sb);
  postCompact(sb);
  stop(sb);

  statusLine(sb, { percent: 20 });
  assert.equal(stop(sb).stdout, '');
  statusLine(sb, { percent: 65 });
  assert.equal(JSON.parse(stop(sb).stdout).decision, 'block');
  assert.equal(directives(sb).length, 2);
});

test('turning it off stops every hook action', async (t) => {
  const sb = sandbox(t);
  await armed(sb, 60);
  statusLine(sb, { percent: 99 });
  await cli(sb, ['off']);
  assert.equal(stop(sb).stdout, '');
  assert.equal(directives(sb).length, 0);
});

test('status warns when the percent is at or above Grok own auto-compact point', async (t) => {
  const sb = sandbox(t);
  await armed(sb, 60);
  statusLine(sb, { percent: 50, threshold: 85 });

  const quiet = await cli(sb, ['status']);
  assert.match(quiet.stdout, /85 percent/u);
  assert.doesNotMatch(quiet.stdout, /Warning/u);

  const high = await cli(sb, ['on', '90']);
  assert.equal(high.code, 0, high.stderr);
  assert.match(high.stdout, /Warning: .*85 percent/u);
  const report = await cli(sb, ['status']);
  assert.match(report.stdout, /Warning: .*85 percent/u);
});

test('the pieces are wired into the package surfaces a user touches', () => {
  const usage = spawnSync(process.execPath, [join(PRODUCT_ROOT, 'bin', 'litgrok.mjs'), '--help', '--no-color'], { encoding: 'utf8', env: environment({ home: tmpdir(), stateRoot: join(tmpdir(), 'unused') }) });
  assert.match(usage.stdout, /litgrok auto-handoff on \[percent\]\|off\|status/u);

  assert.match(readFileSync(STOP, 'utf8'), /auto-handoff-gate\.mjs/u, 'Stop evaluates the gate');
  assert.match(readFileSync(STATUS_SCRIPT, 'utf8'), /auto-handoff\.mjs/u, 'the status line reads the same toggle');
  const packaged = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8')).files;
  assert.ok(packaged.includes('.grok/hooks'), 'the hooks tree, including the new modules, ships');
  for (const name of ['auto-handoff.mjs', 'auto-handoff-gate.mjs']) assert.ok(existsSync(join(HOOKS, name)), name);

  const privacy = readFileSync(join(PRODUCT_ROOT, 'docs', 'privacy.md'), 'utf8');
  assert.match(privacy, /auto-handoff\.json/u);
});

test('both READMEs describe the feature and label what is automatic on this host', () => {
  const required = [
    ['README.md', /^## Automatic handoff$/mu],
    ['README_ko-KR.md', /^## 자동 핸드오프$/mu],
  ];
  for (const [file, heading] of required) {
    const text = readFileSync(join(PRODUCT_ROOT, file), 'utf8');
    assert.match(text, heading, file);
    for (const needle of ['litgrok auto-handoff on', 'LITGROK_AUTO_HANDOFF_PERCENT', SAVED_LINE, '--status-line', '/hooks-trust']) {
      assert.ok(text.includes(needle), `${file} must mention ${needle}`);
    }
  }
});

test('the marker is a stable digest of the session id, not the id itself', async () => {
  const gate = await import('../.grok/hooks/auto-handoff-gate.mjs');
  const key = createHash('sha256').update(SESSION).digest('hex').slice(0, 32);
  assert.equal(gate.handoffMarker(SESSION), `litgrok-auto-handoff: ${key}`);
  assert.equal(gate.handoffMarker(SESSION).includes(SESSION), false);
});
