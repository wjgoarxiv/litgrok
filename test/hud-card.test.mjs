import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { drawsRoundCaps, hasIconFont } from '../.grok/hooks/lit-caps.mjs';
import { gauge, pill } from '../.grok/hooks/lit-card.mjs';
import { MAX_LINE_CHARACTERS, cellWidth, layoutLine, segment } from '../.grok/hooks/lit-layout.mjs';
import { paintSunset } from '../.grok/hooks/lit-sunset.mjs';
import { rememberedIconFont, writeHudRecords } from '../.grok/hooks/litgrok-hud-state.mjs';
import { writeLiveness } from '../.grok/hooks/session-liveness.mjs';
import { updateWorkflowState } from '../.grok/hooks/workflow-stage.mjs';

// The status line's card: one round frame around every row on a dark truecolor terminal, every pill and gauge in one
// form, inside Grok's five lines and 1024 characters.

const SCRIPT = join(dirname(dirname(fileURLToPath(import.meta.url))), '.grok', 'hooks', 'lit-status-line.mjs');
const SESSION = 'card-session';
const NOW = Math.floor(Date.now() / 9000) * 9000 + 3000;
const ENV_KEYS = ['CI', 'NO_COLOR', 'COLUMNS', 'LINES', 'LITGROK_HUD_COLOR', 'LITGROK_HUD_LINES', 'LITGROK_HUD_GLYPHS', 'LITGROK_HUD_MOTION', 'COLORFGBG', 'TERM_PROGRAM', 'WT_SESSION', 'KITTY_WINDOW_ID', 'LITGROK_AUTO_HANDOFF', 'LITGROK_AUTO_HANDOFF_PERCENT', 'NODE_OPTIONS'];
const ROUND = { LITGROK_HUD_GLYPHS: 'round' };
const SQUARE = { LITGROK_HUD_GLYPHS: 'basic' };
const CAPS = /[\ue0b4\ue0b6]/u;
const cells = (text) => [...text].reduce((total, character) => total + cellWidth(character), 0);
const keyOf = (session) => createHash('sha256').update(session).digest('hex').slice(0, 32);

const WORK = [{ stage: 'plan' }, { ended: true }, { stage: 'work', plan: { done: 3, total: 7, next: '4. Document the flag' } }, { test: { verdict: 'pass', count: 12 } }];
const TURN = [['UserPromptSubmit', 100, { promptId: 'p1' }], ['PostToolUse', 90, { tool: { name: 'read' } }], ['SubagentStart', 60], ['SubagentStart', 59], ['PreToolUse', 12, { tool: { name: 'run_terminal_command' } }]];
const STATES = {
  ready: { discipline: null, stage: null, running: false },
  'running without a skill': { discipline: null, stage: null, ledger: TURN },
  working: { ledger: TURN },
  skill: { stage: null, ledger: TURN, discipline: 'lit-brainstorm' },
  'your turn': { ledger: [...TURN.slice(0, 2), ['PreToolUse', 3, { tool: { name: 'ask_user_question' } }]] },
  review: { discipline: 'review-work', stage: [...WORK, { stage: 'review' }], ledger: TURN },
  done: { discipline: 'review-work', stage: [...WORK, { stage: 'review', plan: { done: 7, total: 7 } }, { ended: true }], ledger: [...TURN, ['Stop', 5]], running: false },
  idle: { ledger: [...TURN, ['Stop', 60]], running: false },
  error: { ledger: [...TURN, ['StopFailure', 60]], running: false },
  rewind: { discipline: 'lit-adhd', ledger: TURN },
  warning: { ledger: TURN, env: { LITGROK_AUTO_HANDOFF: '1', LITGROK_AUTO_HANDOFF_PERCENT: '50' } },
  sessions: { ledger: TURN, others: 4 },
  'ready with sessions': { discipline: null, stage: null, running: false, others: 4 },
};

function sandbox(t, { discipline = 'litwork', stage = WORK, ledger = [], others = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-card-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sb = { root, home: join(root, 'home'), workspace: join(root, 'workspace'), stateRoot: join(root, 'state') };
  mkdirSync(sb.home);
  mkdirSync(sb.workspace);
  if (discipline) writeHudRecords({ env: { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot }, sessionId: SESSION, cwd: sb.workspace, workspaceRoot: sb.workspace, discipline });
  const file = (session) => join(sb.workspace, '.grok', 'litgrok', 'session-ledger', `${keyOf(session)}.jsonl`);
  mkdirSync(dirname(file(SESSION)), { recursive: true });
  for (const patch of stage ?? []) updateWorkflowState(file(SESSION), SESSION, patch);
  writeFileSync(file(SESSION), ledger.map(([event, secondsAgo, extra = {}]) => `${JSON.stringify({ schema: 'litgrok.hook-event/v1', event, sessionId: SESSION, cwd: sb.workspace, recordedAt: new Date(NOW - secondsAgo * 1000).toISOString(), ...extra })}\n`).join(''));
  for (let at = 0; at < others; at += 1) {
    updateWorkflowState(file(`other-${at}`), `other-${at}`, { stage: 'plan', active: `lit-plan-${at}` });
    writeLiveness({ ledgerFile: file(`other-${at}`), sessionId: `other-${at}`, cwd: sb.workspace, state: 'alive', env: {}, now: NOW });
  }
  return sb;
}

function run(sb, { env = {}, later = 0, running = true, columns = 120, extra = {} } = {}) {
  const base = { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot, TERM: 'xterm-256color', SSH_CONNECTION: 'test' };
  for (const key of ENV_KEYS) delete base[key];
  const input = { cwd: sb.workspace, session_id: SESSION, workspace: { current_dir: sb.workspace, branch: 'main' }, model: { display_name: 'Grok 4.5' }, effort: { level: 'high' }, context_window: { used_percentage: 42, context_window_size: 2000000 }, cost: { total_cost_usd: 0.43 }, ...(running ? { prompt_id: 'p1', turn: { started_at_ms: NOW - 100_000 } } : {}), ...extra };
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,Date.now=()=>${NOW + later}`, SCRIPT], {
    cwd: sb.workspace, encoding: 'utf8', env: { ...base, COLUMNS: String(columns), ...env }, input: `${JSON.stringify(input)}\n`,
  });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.slice(0, -1).split('\n');
  return { lines, plain: lines.map((line) => stripVTControlCharacters(line)) };
}

function assertFramed({ lines, plain }, columns, label) {
  const last = plain.length - 1;
  const wide = Math.min(columns - 1, 200);
  assert.ok(plain.length >= 3 && plain.length <= 5, `${label}: ${plain.length} lines`);
  plain.forEach((line, row) => {
    const [open, close] = row === 0 ? ['╭', '╮'] : row === last ? ['╰', '╯'] : ['│', '│'];
    assert.equal(line[0], open, `${label}: "${line}"`);
    assert.equal(line.at(-1), close, `${label}: "${line}"`);
    assert.equal(cells(line), wide, `${label}: "${line}"`);
    assert.ok(lines[row].length <= 1024, `${label}: ${lines[row].length} characters`);
  });
}

// A colour is open over the cells around every cap: no fill ends in a square edge, and no cap stands alone.
function assertRound({ lines }, label) {
  const text = lines.join('\n');
  assert.doesNotMatch(stripVTControlCharacters(text), /[▯▮░▒▓▌▐]|ctx \[/u, `${label}: a square or textured gauge`);
  assert.equal((text.match(/\ue0b6/gu) ?? []).length, (text.match(/\ue0b4/gu) ?? []).length, `${label}: caps come in pairs`);
  // The sun's slits are the only fill without caps.
  const bodies = text.replace(/\u001b\[48;2;26;16;48m[^\n]*?\u001b\[0m/gu, '');
  for (const [, before, after] of bodies.matchAll(/(.|^)\u001b\[0?m?(?:\u001b\[[\d;]*m)*\u001b\[[\d;]*48;2;[\d;]+m[^\u001b]*(?:\u001b\[(?:38|48);2;[\d;]+m[^\u001b]*)*\u001b\[0m(?:\u001b\[[\d;]+m)?(.)/gu)) {
    assert.ok(before === '\ue0b6' && after === '\ue0b4', `${label}: a fill between "${before}" and "${after}"`);
  }
}

test('every state is one framed card in both forms, at every width', (t) => {
  for (const [name, state] of Object.entries(STATES)) {
    const sb = sandbox(t, state);
    for (const columns of [36, 48, 60, 80, 100, 120, 180, 400]) {
      const options = { columns, running: state.running ?? true };
      const round = run(sb, { ...options, env: { ...state.env, ...ROUND } });
      const square = run(sb, { ...options, env: { ...state.env, ...SQUARE } });
      assertFramed(round, columns, `${name} ${columns} round`);
      assertFramed(square, columns, `${name} ${columns} square`);
      assertRound(round, `${name} ${columns}`);
      assert.doesNotMatch(square.plain.join('\n'), CAPS, `${name} ${columns}: no cap in the square form`);
      const words = (result) => result.plain.map((line) => line.match(/[\p{L}\p{N}$%@]+/gu)?.join(' '));
      assert.deepEqual(words(round), words(square), `${name} ${columns}: the same words in the same order`);
      assert.equal(round.plain.length, state.discipline === null ? (state.others ? 5 : 4) : 5, `${name} ${columns}`);
    }
  }
});

test('the anatomy: title and state on the top edge, map, task, skills, and the context on the bottom edge', (t) => {
  const { plain } = run(sandbox(t, STATES.working), { env: ROUND, columns: 120 });
  assert.match(plain[0], /^╭─ \ue0b6🔥 LIT\ue0b4 · litwork 1m40s ─+ 1 tool · ●● 2 agents · WORK ● ─╮$/u);
  assert.match(plain[1], /^│ plan ✓ ━━ \ue0b6work 3\/7\ue0b4 ━━ review · ── done · .*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] Bash · 0:12 │$/u);
  assert.match(plain[2], /^│ └ task 3\/7 \ue0b6██▋ {3}\ue0b4 · next ▸ 4\. Document the flag /u);
  assert.match(plain[3], /^│ skills \ue0b6litwork\ue0b4 · tests ✓ 12 /u);
  assert.match(plain[4], /^╰─ ctx 42% \ue0b6██▏ {2}\ue0b4 2m · Grok 4\.5 \[high\] · \$0\.43 · git main ─+╯$/u);
  assert.equal(plain.join('\n').match(/LIT/gu).length, 1, 'one brand pill');
  for (const row of plain.slice(1, 4)) assert.match(row, /[▁▂▃▄▅▆▇]/u, 'the sun stands over the three rows');
});

test('each state names itself on the top edge', (t) => {
  const word = (name, options = {}) => {
    const state = STATES[name];
    return run(sandbox(t, state), { env: { ...state.env, ...ROUND }, running: state.running ?? true, ...options }).plain[0];
  };
  assert.match(word('ready'), /· ready ─+ IDLE ○ ─╮$/u);
  assert.match(word('running without a skill'), /· session 1m40s ─+ .*RUNNING ● ─╮$/u);
  assert.match(word('your turn'), /YOUR TURN · question ● ─╮$/u);
  assert.match(word('your turn', { columns: 40 }), /YOUR TURN ● ─╮$/u);
  assert.match(word('review'), /REVIEW ● ─╮$/u);
  assert.match(word('done'), /DONE ★ ─╮$/u);
  assert.match(word('idle'), /· litwork ─+ IDLE ○ ─╮$/u);
  assert.match(word('error'), /ERROR ✗ ─╮$/u);
  assert.match(word('rewind'), /· ✺ REWIND lit-adhd .*REWIND ● ─╮$/u);
  assert.match(word('warning'), /⚠ handoff|⚠ ctx 42%→handoff|⚠ ctx 42%→50%/u);
});

test('other sessions and the review lanes keep their words inside the card', (t) => {
  const ready = run(sandbox(t, STATES['ready with sessions']), { running: false, columns: 160 }).plain.join('\n');
  for (let at = 0; at < 4; at += 1) assert.match(ready, new RegExp(`● lit-plan-${at} running`, 'u'));
  assert.match(run(sandbox(t, STATES.sessions), { columns: 200 }).plain[3], /● lit-plan-\d running · ● lit-plan-\d running · ● lit-plan-\d running · ● lit-plan-\d running/u);
  const review = run(sandbox(t, STATES.review), { columns: 120 }).plain[3];
  assert.match(review, /lanes behavior · test ✓ 12 · safety · integration · documentation · regression/u);
  assert.match(run(sandbox(t, STATES.review), { columns: 60 }).plain[3], /lanes 1\/6/u);
});

test('wide, combining, joined and hostile text never moves the frame', (t) => {
  const hostile = ['한국어 모델 이름 아주 길게 길게', '👩‍👩‍👧‍👦 family 👍🏽', '🇰🇷🇰🇷 flag', 'é́́ Z̶͑a̸l̵g̶o̸', '‮right to left‬', '⚡✅⭐ ❤️ ☀️', '各﷽ ｆｕｌｌ', '\u001b[31mred\u001b[0m\u0007\r\n\ttab', '한 jamo', 'x'.repeat(400), '​‍﻿ zero', '🔥'.repeat(80)];
  for (const text of hostile) {
    const sb = sandbox(t, { stage: [{ stage: 'work', plan: { done: 1, total: 3, next: [...text.replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')].slice(0, 60).join('') } }], ledger: [...TURN.slice(0, 2), ['PreToolUse', 3, { tool: { name: text } }]], others: 1 });
    for (const columns of [36, 61, 80, 133, 220]) {
      for (const env of [ROUND, SQUARE]) {
        assertFramed(run(sb, { columns, env, extra: { model: { display_name: text }, workspace: { current_dir: sb.workspace, branch: text, git_worktree: text } } }), columns, `${JSON.stringify(text)} ${columns}`);
      }
    }
  }
});

test('no line passes 1024 characters: the rainbow with a long task in every width, and the cut itself to the character', (t) => {
  assert.equal(MAX_LINE_CHARACTERS, 1024, 'Grok cuts the 1025th character');
  const long = '한국어 an unusually long task title that fills its sixty cells';
  const stage = [...WORK.slice(0, 2), { stage: 'work', plan: { done: 99, total: 100, next: long.slice(0, 60) } }, WORK[3]];
  const extra = { model: { display_name: `Grok ${long}` }, workspace: { branch: long, git_worktree: long }, cost: { total_cost_usd: 98765.43 } };
  const env = { ...ROUND, LITGROK_AUTO_HANDOFF: '1', LITGROK_AUTO_HANDOFF_PERCENT: '50' };
  let longest = 0;
  for (const state of [{ discipline: 'lit-adhd', ledger: TURN, stage }, { discipline: 'review-work', ledger: TURN, stage: [...stage, { stage: 'review' }], others: 3 }]) {
    const sb = sandbox(t, state);
    for (let columns = 36; columns <= 212; columns += 8) {
      for (const later of [0, 700]) {
        const card = run(sb, { columns, env, later, extra: { ...extra, workspace: { current_dir: sb.workspace, ...extra.workspace } } });
        assertFramed(card, columns, `${state.discipline} ${columns}`);
        longest = Math.max(longest, ...card.lines.map((line) => line.length));
      }
    }
  }
  assert.ok(longest > 900, `the worst case is a full one (${longest})`);
  // Padding a line by one character at a time meets the cut exactly: 1024 is drawn, 1025 never is.
  const padded = (count) => segment('row', () => `\u001b[${'0'.repeat(count)}mrow`, {});
  const last = segment('last', (text) => text, { drop: 1 });
  const laid = (count) => layoutLine({ left: [padded(count)], right: [last], separator: { plain: ' ', painted: ' ' }, rail: { plain: '', painted: '' }, maxCells: 40, ellipsis: '…' });
  const lengths = Array.from({ length: 80 }, (_, at) => laid(940 + at).length);
  assert.equal(Math.max(...lengths), 1024);
  const drawn = Array.from({ length: 400 }, (_, at) => paintSunset([`\u001b[${'0'.repeat(at + 300)}mword\u001b[0m${' '.repeat(60)}`], { maxCells: 100, cellWidth, seconds: 3 })[0].length);
  assert.equal(Math.max(...drawn), 1024);
});

test('with no workflow the card is four lines under a sun of two rows, or three where Grok shows three', (t) => {
  const sb = sandbox(t, STATES.ready);
  for (const columns of [60, 80, 100, 160]) {
    const { plain } = run(sb, { running: false, columns, env: ROUND });
    assert.equal(plain.length, 4, `${columns}`);
    assert.match(plain[1], /[▃▅▇█]{8}/u, `${columns}: the dome`);
    assert.match(plain[2], /▆▇+▆/u, `${columns}: the waterline`);
  }
  const short = run(sb, { running: false, env: { ...ROUND, LINES: '3' } });
  assert.match(short.plain[2], /^╰.*╯$/u);
  assert.equal(short.plain[3], ' ', 'and the blank line lets it grow back');
});

test('done and review keep a sun at 80 columns', (t) => {
  for (const name of ['done', 'review']) {
    const sb = sandbox(t, STATES[name]);
    assert.match(run(sb, { columns: 80, env: ROUND, running: STATES[name].running ?? true }).plain.join('\n'), /[▂▃▄▅▆▇█]{8}/u, name);
  }
});

test('on a terminal that shows fewer lines the frame stays closed, and the card grows back', (t) => {
  const sb = sandbox(t, STATES.working);
  for (const shown of [2, 3, 4]) {
    const { lines, plain } = run(sb, { env: { ...ROUND, LINES: String(shown) } });
    assert.equal(lines.length, 5, 'the blank lines let Grok say when it has room again');
    assert.match(plain[0], /^╭/u);
    assert.match(plain[shown - 1], /^╰.*╯$/u, `${shown} lines end in the bottom edge`);
    assert.deepEqual(plain.slice(shown), Array(5 - shown).fill(' '));
  }
  for (const shown of ['1', '5', '', 'x']) assert.match(run(sb, { env: { LINES: shown } }).plain[4], /^╰/u, `LINES=${shown} draws the whole card`);
});

test('the frame keeps its height and its words still between turns, and only light moves in one', (t) => {
  const idle = sandbox(t, STATES.idle);
  assert.deepEqual(run(idle, { running: false }).lines, run(idle, { running: false, later: 4321 }).lines);
  const working = sandbox(t, STATES.working);
  assert.notDeepEqual(run(working).lines, run(working, { later: 300 }).lines);
  assert.equal(run(working).lines.length, run(idle, { running: false }).lines.length);
});

test('the context gauge keeps the family bands, and YOUR TURN turns the card amber', (t) => {
  const sb = sandbox(t, STATES.working);
  const band = (percent) => /ctx \u001b\[0m\u001b\[1;38;2;([\d;]+)m/u.exec(run(sb, { env: ROUND, extra: { context_window: { used_percentage: percent } } }).lines[4])[1];
  assert.deepEqual([0, 69, 70, 89, 90, 100].map(band), ['255;99;55', '255;99;55', '215;175;0', '215;175;0', '215;95;95', '215;95;95']);
  assert.match(run(sb, { extra: { context_window: {} } }).plain[4], /ctx \? · Grok/u, 'an unknown context has no gauge');
  const amber = run(sandbox(t, STATES['your turn']));
  for (const line of amber.lines.slice(1, 4)) assert.match(line, /^\u001b\[38;2;255;154;60m│.*\u001b\[38;2;2\d\d;1\d\d;[6-9]?\d?\d?m│\u001b\[0m$/u);
});

test('pills and gauges keep their width in both forms, and a gauge is never empty or full by rounding', () => {
  const plain = (text) => stripVTControlCharacters(text);
  const stops = [[255, 154, 60], [255, 45, 149]];
  for (const text of ['a', '🔥 LIT', 'work 3/7', '한국']) assert.equal(cells(plain(pill(text, stops, true))), cells(plain(pill(text, stops, false))));
  for (const percent of [0, 0.1, 1, 33, 50, 99, 99.9, 100]) {
    for (const round of [true, false]) {
      const bar = plain(gauge(percent, 7, [255, 99, 55], round));
      assert.equal(cells(bar), 7);
      assert.equal(/[█▏▎▍▌▋▊▉]/u.test(bar), percent > 0, `${percent} ${round}`);
      assert.equal(!/[ ▏▎▍▌▋▊▉]/u.test(bar), percent === 100, `${percent} ${round}`);
    }
  }
});

test('a narrow row, a light background, fewer colours and one-line mode stay without a frame and without caps', (t) => {
  const sb = sandbox(t, STATES.working);
  for (const env of [{ COLORFGBG: '0;15' }, { LITGROK_HUD_COLOR: '256' }, { LITGROK_HUD_COLOR: '16' }, { NO_COLOR: '' }, { LITGROK_HUD_GLYPHS: 'ascii' }]) {
    for (const glyphs of env.LITGROK_HUD_GLYPHS ? [{}] : [ROUND, { LITGROK_HUD_GLYPHS: 'nerd' }]) {
      const { plain } = run(sb, { env: { ...env, ...glyphs } });
      assert.doesNotMatch(plain.join('\n'), /[╭╮╰╯\ue0b4\ue0b6]/u, JSON.stringify(env));
    }
  }
  for (const options of [{ columns: 30 }, { env: { LITGROK_HUD_LINES: '1' } }]) {
    const round = run(sb, { ...options, env: { ...options.env, ...ROUND } });
    assertRound(round, JSON.stringify(options));
    assert.match(round.plain.join('\n'), CAPS);
    assert.doesNotMatch(run(sb, { ...options, env: { ...options.env, ...SQUARE } }).plain.join('\n'), CAPS);
  }
});

test('the round rule: the setting, then the terminal, then SSH, then an installed font', () => {
  const never = () => assert.fail('the fonts were searched');
  const yes = () => true;
  for (const setting of ['nerd', 'round']) assert.equal(drawsRoundCaps({ LITGROK_HUD_GLYPHS: setting, SSH_CONNECTION: 'x' }, never), true);
  for (const setting of ['basic', 'ascii']) assert.equal(drawsRoundCaps({ LITGROK_HUD_GLYPHS: setting, WT_SESSION: 'x' }, never), false);
  for (const env of [{ WT_SESSION: 'x' }, { TERM_PROGRAM: 'vscode' }, { TERM_PROGRAM: 'WezTerm' }, { TERM_PROGRAM: 'ghostty' }, { TERM: 'xterm-kitty' }, { KITTY_WINDOW_ID: '1' }]) {
    assert.equal(drawsRoundCaps(env, never), true, JSON.stringify(env));
    assert.equal(drawsRoundCaps({ ...env, SSH_CONNECTION: 'x' }, never), true, `${JSON.stringify(env)} over SSH`);
  }
  assert.equal(drawsRoundCaps({ SSH_CONNECTION: 'x', TERM_PROGRAM: 'Apple_Terminal' }, never), false);
  for (const env of [{}, { TERM_PROGRAM: 'Apple_Terminal' }, { LITGROK_HUD_GLYPHS: 'fancy' }]) {
    assert.equal(drawsRoundCaps(env, yes), true, JSON.stringify(env));
    assert.equal(drawsRoundCaps(env, () => false), false, JSON.stringify(env));
  }
});

test('the font search reads names only, a bounded number of them, and no deeper than three folders', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-fonts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (...path) => {
    const file = join(root, ...path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, '');
  };
  const found = (name, limit) => hasIconFont({}, { folders: [join(root, name), join(root, 'missing')], limit });
  for (const [name, expected] of Object.entries({ 'JetBrainsMonoNerdFont-Regular.ttf': true, 'Hack Nerd Font Mono.otf': true, 'MesloLGS NF Regular.ttf': true, 'CaskaydiaCoveNFM-Bold.ttf': true, 'Inter-Regular.ttf': false, 'Conf.ttf': false, 'NerdFont.txt': false })) {
    const folder = `f-${name}`;
    put(folder, name);
    assert.equal(found(folder), expected, name);
  }
  put('deep', 'a', 'b', 'c', 'XNerdFont.ttf');
  assert.equal(found('deep'), true);
  put('deeper', 'a', 'b', 'c', 'd', 'XNerdFont.ttf');
  assert.equal(found('deeper'), false);
  for (let at = 0; at < 20; at += 1) put('many', `a${String(at).padStart(2, '0')}.ttf`);
  put('many', 'zNerdFont.ttf');
  assert.equal(found('many', 5), false, 'it stops at the limit');
  assert.equal(found('many'), true);
});

test('the answer about fonts is kept for a day in the HUD state folder', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-font-answer-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { HOME: join(root, 'home'), LITGROK_HUD_STATE_ROOT: join(root, 'state') };
  mkdirSync(env.HOME);
  let looks = 0;
  const look = () => {
    looks += 1;
    return true;
  };
  for (let at = 0; at < 3; at += 1) assert.equal(rememberedIconFont(look, env, NOW), true);
  assert.equal(looks, 1);
  const file = join(env.LITGROK_HUD_STATE_ROOT, 'icon-font.json');
  assert.equal(statSync(file).mode & 0o077, 0, 'only the user reads it');
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(file, 'utf8'))), ['found', 'at'], 'it holds no font name');
  rememberedIconFont(look, env, NOW + 25 * 60 * 60 * 1000);
  assert.equal(looks, 2, 'a day later it looks again');
  writeFileSync(file, '{"found":"yes"}');
  utimesSync(file, NOW / 1000, NOW / 1000);
  assert.equal(rememberedIconFont(() => false, env, NOW), false, 'a broken answer is not trusted');
  assert.equal(rememberedIconFont(look, { HOME: root, LITGROK_HUD_STATE_ROOT: join(root, 'inside-home') }, NOW), true, 'an unsafe state folder still gives an answer');
});
