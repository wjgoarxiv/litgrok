import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { writeHudRecords } from '../.grok/hooks/litgrok-hud-state.mjs';
import { paintSunset, sunShape } from '../.grok/hooks/lit-sunset.mjs';
import { updateWorkflowState } from '../.grok/hooks/workflow-stage.mjs';

// The sunset in the status line's free cells: it never covers or moves a word, never changes a row's count or
// grows a row past its columns or Grok's 1024-character cut, moves only while a turn runs, and needs truecolor.

const HOOKS = join(dirname(dirname(fileURLToPath(import.meta.url))), '.grok', 'hooks');
const SESSION = 'sunset-session';
const ENV_KEYS = ['CI', 'NO_COLOR', 'COLUMNS', 'LITGROK_HUD_COLOR', 'LITGROK_HUD_LINES', 'LITGROK_HUD_GLYPHS', 'LITGROK_HUD_MOTION', 'COLORFGBG', 'TERM_PROGRAM', 'WT_SESSION', 'KITTY_WINDOW_ID', 'LITGROK_AUTO_HANDOFF', 'LITGROK_AUTO_HANDOFF_PERCENT', 'NODE_OPTIONS'];
const LIGHT = { COLORFGBG: '0;15' };
const SUN = /[▁▂▃▄▅▆▇]/u;
const cellWidth = (character) => (/[가-힣\u{1f300}-\u{1faff}]/u.test(character) ? 2 : 1);
const cellCount = (text) => [...text].reduce((total, character) => total + cellWidth(character), 0);
// A fixed clock a whole number of nine-second shooting-star rounds after the epoch.
const NOW = Math.floor(Date.now() / 9000) * 9000 + 3000;

// Every cell of a line as [character, the escapes open over it].
function styledCells(line) {
  const out = [];
  let open = '';
  for (const [, escape, character] of line.matchAll(/(\u001b\[[0-9;]*m)|(.)/gsu)) {
    if (escape) open = escape === '\u001b[0m' ? '' : `${open}${escape}`;
    else out.push([character, open], ...(cellWidth(character) === 2 ? [null] : []));
  }
  return out;
}

function assertWordsKept(before, after, label) {
  const old = styledCells(before);
  const now = styledCells(after);
  old.forEach((cell, at) => {
    if (cell === null || (cell[0] === ' ' && cell[1] === '')) return;
    assert.deepEqual(now[at], cell, `${label}: cell ${at} of "${stripVTControlCharacters(before)}"`);
  });
}

const orange = (text) => `\u001b[38;2;255;99;55m${text}\u001b[0m`;
const CARD = [
  `${orange('▎')} 제목 ${orange('lit-plan')}`,
  `${orange('▎')} plan ✓ ${orange('━━━━')} work`,
  `${orange('▎')} └ task 3/7 · 다음 문서 쓰기`,
  `${orange('▎')} Grok 4.5 ${orange(' │ ')}ctx 42%`,
];

test('the scene paints free cells only, inside the width and the cut, at every size and moment', () => {
  for (let maxCells = 19; maxCells <= 240; maxCells += 1) {
    for (const lines of [CARD, [...CARD.slice(0, 3), `${CARD[3]} \u001b[48;2;1;2;3m${' '.repeat(60)}\u001b[0m`], CARD.slice(0, 3), CARD.slice(0, 2), CARD.slice(-1)]) {
      for (const seconds of [null, 0.4, 5.3, 1234.5]) {
        const out = paintSunset(lines, { maxCells, cellWidth, seconds });
        assert.equal(out.length, lines.length);
        out.forEach((line, row) => {
          assertWordsKept(lines[row], line, `${maxCells} cells at ${seconds}`);
          assert.ok(line.length <= 1024, `${line.length} characters`);
          assert.ok(cellCount(stripVTControlCharacters(line)) <= Math.max(maxCells, cellCount(stripVTControlCharacters(lines[row]))), `${maxCells} cells`);
          if (line !== lines[row]) assert.ok(line.endsWith('\u001b[0m'), 'a painted line closes its colour');
        });
      }
    }
  }
});

test('the sun is three rows over eighteen cells with two dark slits, and smaller on fewer rows', () => {
  assert.deepEqual(sunShape(3).map((row) => row.map((cell) => cell?.glyph ?? ' ').join('')), [
    '  ▁▃▅▆▇████▇▆▅▃▁  ', ' ▅▇▇▇▇▇▇▇▇▇▇▇▇▇▇▅ ', '▆'.repeat(18)]);
  assert.deepEqual(sunShape(3).map((row) => row.some((cell) => cell?.slit)), [false, true, true]);
  assert.deepEqual([sunShape(2)[0].length, sunShape(1)[0].length], [12, 8]);
  const art = paintSunset(CARD, { maxCells: 119, cellWidth, seconds: 1 }).map(stripVTControlCharacters);
  assert.doesNotMatch(art[0], SUN, 'the title keeps its row to itself');
  for (const row of art.slice(1)) assert.match(row, SUN);
});

test('the light moves by colour and by ASCII; every other glyph stays where it was', () => {
  const frames = [2, 2.3, 2.6, 5, 7.7].map((seconds) => paintSunset(CARD, { maxCells: 119, cellWidth, seconds }));
  assert.equal(new Set(frames.map((lines) => lines.join('\n'))).size, frames.length, 'each frame differs');
  const shapes = frames.map((lines) => lines.map((line) => stripVTControlCharacters(line).replace(/[\x20-\x7e]/gu, ' ').trimEnd()).join('\n'));
  assert.equal(new Set(shapes).size, 1, 'only ASCII cells change their mark');
  const sun = (lines) => /\u001b\[48;2;26;16;48m(\u001b\[38;2;[\d;]+m)▆/u.exec(lines[3])[1];
  assert.ok(new Set(frames.map(sun)).size > 1, 'the sun changes its colour');
  assert.match(stripVTControlCharacters(paintSunset(CARD, { maxCells: 119, cellWidth, seconds: 9.5 })[1]), /\*--\./u, 'a shooting star every nine seconds');
  assert.doesNotMatch(stripVTControlCharacters(paintSunset(CARD, { maxCells: 119, cellWidth, seconds: 5 })[1]), /\*--\./u);
});

test('between turns the scene is faded', () => {
  const sun = (dim) => /\u001b\[48;2;26;16;48m\u001b\[38;2;(\d+);/u.exec(paintSunset(CARD, { maxCells: 119, cellWidth, dim })[3])[1];
  assert.equal(sun(false), '255');
  assert.ok(Number(sun(true)) < 160);
});

test('the sun hides where a word stands in its cells, where the row is narrow and where the cut is near', () => {
  const long = [...CARD.slice(0, 3), `${CARD[3]} ${'x'.repeat(100)}`];
  assert.ok(paintSunset(long, { maxCells: 119, cellWidth }).every((line) => !SUN.test(line)));
  assert.deepEqual(paintSunset(CARD, { maxCells: 30, cellWidth }), CARD, 'still and with no room, nothing is added');
  const heavy = (marks) => paintSunset([...CARD.slice(0, 3), `${CARD[3]}${orange('!').repeat(marks)}`], { maxCells: 200, cellWidth, seconds: 3 });
  for (let marks = 20; marks <= 40; marks += 1) assert.equal(new Set(heavy(marks).slice(1).map((line) => SUN.test(line))).size, 1, `${marks}: the sun is whole or away`);
  assert.match(heavy(28)[3], SUN, 'a full row keeps the sun and gives up the far light');
  assert.ok(heavy(28)[3].length <= 1024 && heavy(28)[3].length > 900);
  assert.ok(heavy(40).every((line) => !SUN.test(line) && line.length <= 1024), 'a row fuller still keeps the sun away');
  const beside = [CARD[0], CARD[1], `${CARD[2]} ${'y'.repeat(90)}`, CARD[3]];
  assert.ok(paintSunset(beside, { maxCells: 119, cellWidth }).slice(0, 3).every((line) => !SUN.test(line)), 'a long row sends the sun down');
  assert.match(paintSunset(beside, { maxCells: 119, cellWidth })[3], SUN, 'to one row on the horizon');
});

function sandbox(t, { discipline = 'litwork', stage = [{ stage: 'plan' }, { stage: 'work', plan: { done: 3, total: 7, next: '4. d' } }], ledger = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-sunset-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sb = { home: join(root, 'home'), workspace: join(root, 'workspace'), stateRoot: join(root, 'state') };
  mkdirSync(sb.home);
  mkdirSync(sb.workspace);
  if (discipline) writeHudRecords({ env: { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot }, sessionId: SESSION, cwd: sb.workspace, workspaceRoot: sb.workspace, discipline });
  const file = join(sb.workspace, '.grok', 'litgrok', 'session-ledger', `${createHash('sha256').update(SESSION).digest('hex').slice(0, 32)}.jsonl`);
  mkdirSync(dirname(file), { recursive: true });
  for (const patch of stage ?? []) updateWorkflowState(file, SESSION, patch);
  writeFileSync(file, ledger.map(([event, secondsAgo, extra = {}]) => `${JSON.stringify({ schema: 'litgrok.hook-event/v1', event, sessionId: SESSION, cwd: sb.workspace, recordedAt: new Date(NOW - secondsAgo * 1000).toISOString(), ...extra })}\n`).join(''));
  return sb;
}

const TURN = [['UserPromptSubmit', 100, { promptId: 'p1' }], ['PostToolUse', 90, { tool: { name: 'read' } }], ['PreToolUse', 12, { tool: { name: 'run_terminal_command' } }]];

// The real script fed Grok's payload, with its clock held at `NOW` plus `later` milliseconds.
function run(sb, { env = {}, later = 0, running = true, columns = 120, extra = {}, hooks = HOOKS } = {}) {
  const base = { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot, TERM: 'xterm-256color', SSH_CONNECTION: 'test' };
  for (const key of ENV_KEYS) delete base[key];
  const input = { cwd: sb.workspace, session_id: SESSION, workspace: { current_dir: sb.workspace, branch: 'main' }, model: { display_name: 'Grok 4.5' }, effort: { level: 'high' }, context_window: { used_percentage: 42, context_window_size: 2000000 }, ...(running ? { prompt_id: 'p1', turn: { started_at_ms: NOW - 100_000 } } : {}), ...extra };
  const result = spawnSync(process.execPath, ['--import', `data:text/javascript,Date.now=()=>${NOW + later}`, join(hooks, 'lit-status-line.mjs')], {
    cwd: sb.workspace, encoding: 'utf8', env: { ...base, COLUMNS: String(columns), ...env }, input: `${JSON.stringify(input)}\n`,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.slice(0, -1).split('\n');
}

test('the card keeps every word and column whatever the scene does, and the one-line row keeps its own', (t) => {
  for (const [name, options] of Object.entries({ work: { ledger: TURN }, quiet: { discipline: null, stage: null }, skill: { stage: null, ledger: TURN }, review: { discipline: 'review-work', ledger: TURN }, rewind: { discipline: 'lit-adhd', ledger: TURN } })) {
    const sb = sandbox(t, options);
    for (const columns of [36, 40, 60, 80, 100, 120, 160, 260, 400]) {
      const frames = [0, 300, 2600, 6200, 9400].map((later) => run(sb, { columns, later }));
      for (const lines of frames) {
        assert.equal(lines.length, frames[0].length, `${name} ${columns}: the same rows`);
        for (const line of lines) assert.ok(line.length <= 1024 && cellCount(stripVTControlCharacters(line)) === Math.min(columns - 1, 200), `${name} ${columns}`);
      }
      const letters = (lines) => lines.map((line) => stripVTControlCharacters(line).replace(/[^\p{L}\p{N}│╭╮╰╯]/gu, ' ')).join('\n').replace(/\d/gu, '0');
      assert.equal(new Set(frames.map(letters)).size, 1, `${name} ${columns}: no word moves`);
    }
    for (const columns of [20, 30, 60, 120, 400]) {
      const env = { LITGROK_HUD_LINES: '1' };
      const [scene] = run(sb, { columns, env });
      const [bare] = run(sb, { columns, env: { ...env, ...LIGHT } });
      const [now, old] = [scene, bare].map((text) => styledCells(text));
      old.forEach((cell, at) => {
        if (cell && cell[0] !== ' ') assert.equal(now[at]?.[0], cell[0], `${name} ${columns}: "${stripVTControlCharacters(bare)}"`);
      });
      assert.ok(scene.length <= 1024 && now.length <= columns - 1, `${name} ${columns}`);
    }
  }
});

test('a running turn moves the scene; a still clock, an idle session and reduced motion hold it', (t) => {
  const sb = sandbox(t, { ledger: TURN });
  const figures = (options) => run(sb, options).at(-2);
  assert.equal(SUN.test(figures({})), true);
  assert.notEqual(figures({}), figures({ later: 300 }), 'the next redraw shows the next step');
  for (const motion of ['off', 'subtle']) {
    const env = { LITGROK_HUD_MOTION: motion };
    assert.match(figures({ env }), SUN);
    assert.equal(figures({ env }), figures({ env, later: 4321 }), `${motion}: the scene stands still`);
  }
  const idle = sandbox(t, { ledger: [...TURN, ['Stop', 60]] });
  const still = run(idle, { running: false });
  assert.match(still.at(-2), SUN);
  assert.deepEqual(run(idle, { running: false, later: 4321 }), still, 'between turns every row stands still');
  assert.equal(run(sb, {}).length, still.length, 'the card is as tall at rest as at work');
});

test('fewer colours, no colour, ASCII glyphs, and a light background have no scene', (t) => {
  const sb = sandbox(t, { ledger: TURN });
  for (const env of [{ NO_COLOR: '' }, { LITGROK_HUD_COLOR: '0' }, { LITGROK_HUD_COLOR: '256' }, { LITGROK_HUD_COLOR: '16' }, { LITGROK_HUD_GLYPHS: 'ascii' }, LIGHT]) {
    const text = stripVTControlCharacters(run(sb, { env }).join('\n'));
    assert.doesNotMatch(text, /[▁▂▃▄▅▆▇~]/u, JSON.stringify(env));
  }
  const done = run(sandbox(t, { ledger: [...TURN, ['Stop', 5]] }), { running: false });
  assert.match(done.join('\n'), SUN, 'a finished turn keeps its sun, standing still');
});

test('the first session shows the extensions row inside the card and adds no line for it', (t) => {
  for (const [name, options] of [['card', { ledger: TURN }], ['quiet', { discipline: null, stage: null }]]) {
    const sb = sandbox(t, options);
    // An installed copy that has shown its extensions row to no session yet.
    const hooks = join(dirname(sb.home), 'installed', '.grok', 'hooks');
    mkdirSync(hooks, { recursive: true });
    for (const file of readdirSync(HOOKS)) if (file.endsWith('.mjs')) copyFileSync(join(HOOKS, file), join(hooks, file));
    writeFileSync(join(dirname(hooks), '.litgrok-install-manifest.json'), '{"version":"1.2.3"}\n');
    for (const columns of [120, 190]) {
      const lines = run(sb, { hooks, columns, running: name === 'card' });
      assert.equal(lines.length, name === 'card' ? 5 : 4);
      const row = stripVTControlCharacters(lines.at(-2));
      assert.match(row, /^│ LitFamily extensions · github\.com\/wjgoarxiv\/wjgoarxiv-skills · litgrok extensions install <skill>/u, `${name} ${columns}`);
      assert.match(row, /│$/u);
      assert.ok(lines.at(-2).length <= 1024);
    }
  }
});

test('YOUR TURN turns the sun amber and lit-adhd gives it the rewind wheel', (t) => {
  const pink = /\u001b\[48;2;26;16;48m\u001b\[38;2;255;(?:4\d|5\d|6\d|7\d|8\d|9\d|10\d);1[34]\dm▆/u;
  assert.match(run(sandbox(t, { ledger: TURN })).at(-2), pink);
  const ask = run(sandbox(t, { ledger: [...TURN.slice(0, 2), ['PreToolUse', 3, { tool: { name: 'ask_user_question' } }]] })).at(-2);
  assert.match(ask, SUN);
  assert.doesNotMatch(ask, pink);
  const rewind = run(sandbox(t, { discipline: 'lit-adhd', ledger: TURN })).at(-2);
  assert.match(rewind, SUN);
  assert.doesNotMatch(rewind, pink);
  assert.doesNotMatch(stripVTControlCharacters(rewind), /~/u, 'and keeps its own colours with no sea');
});
