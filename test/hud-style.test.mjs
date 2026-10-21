import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { writeHudRecords } from '../.grok/hooks/litgrok-hud-state.mjs';
import { updateWorkflowState } from '../.grok/hooks/workflow-stage.mjs';

// The LitFamily status-line style: the bold [🔥LIT v…] mark with L, I and T on pink, violet and cyan; one
// LitGrok accent (flame orange, 255 99 55) for all ordinary text and separators; `|` after the mark and `│`
// between segments; bracketed gauges in the order model [effort] │ ctx [..] n%/size; yellow at 70% and red
// at 90%; the pink 🔥 LIT chip, an accent chip for the current stage and dim stages around it.

const HOOKS = join(dirname(dirname(fileURLToPath(import.meta.url))), '.grok', 'hooks');
const SESSION = 'style-session';
const ACCENT = '38;2;255;99;55';
const ENV_KEYS = ['CI', 'NO_COLOR', 'COLUMNS', 'LITGROK_HUD_COLOR', 'LITGROK_HUD_LINES', 'LITGROK_HUD_GLYPHS', 'LITGROK_AUTO_HANDOFF', 'LITGROK_AUTO_HANDOFF_PERCENT'];

// An installed copy (hooks beside a manifest) so the mark carries a version.
function sandbox(t, { discipline = 'litwork', stage = null } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-hud-style-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sb = { root, home: join(root, 'home'), workspace: join(root, 'workspace'), stateRoot: join(root, 'state'), grok: join(root, 'installed', '.grok') };
  for (const dir of [sb.home, sb.workspace, join(sb.grok, 'hooks')]) mkdirSync(dir, { recursive: true });
  for (const name of readdirSync(HOOKS)) if (name.endsWith('.mjs')) writeFileSync(join(sb.grok, 'hooks', name), readFileSync(join(HOOKS, name)));
  writeFileSync(join(sb.grok, '.litgrok-install-manifest.json'), '{"version":"1.0.24"}\n');
  if (discipline) writeHudRecords({ env: { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot }, sessionId: SESSION, cwd: sb.workspace, workspaceRoot: sb.workspace, discipline });
  if (stage) {
    const ledger = join(sb.workspace, '.grok', 'litgrok', 'session-ledger', `${createHash('sha256').update(SESSION).digest('hex').slice(0, 32)}.jsonl`);
    mkdirSync(dirname(ledger), { recursive: true });
    for (const patch of stage) updateWorkflowState(ledger, SESSION, patch);
  }
  return sb;
}

function run(sb, { env = {}, percent = 42, extra = {} } = {}) {
  const input = { cwd: sb.workspace, session_id: SESSION, workspace: { current_dir: sb.workspace, branch: 'main' }, model: { display_name: 'Grok 4.5' }, effort: { level: 'high' }, context_window: { used_percentage: percent, context_window_size: 2000000 }, cost: { total_cost_usd: 1.87 }, ...extra };
  const base = { ...process.env, HOME: sb.home, LITGROK_HUD_STATE_ROOT: sb.stateRoot };
  for (const key of ENV_KEYS) delete base[key];
  const result = spawnSync(process.execPath, [join(sb.grok, 'hooks', 'lit-status-line.mjs')], { cwd: sb.workspace, encoding: 'utf8', env: { ...base, COLUMNS: '140', ...env }, input: `${JSON.stringify(input)}\n` });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.slice(0, -1).split('\n');
  return { lines, plain: lines.map((line) => stripVTControlCharacters(line)) };
}

// Every coloured run of a line as [sgr, text].
const runs = (line) => [...line.matchAll(/((?:\u001b\[[0-9;]*m)+)([^\u001b]+)/gu)].map((match) => [match[1], match[2]]);

test('the mark is the bold family [🔥LIT v…] with L, I and T on pink, violet and cyan, and simpler marks in fewer colours', (t) => {
  const sb = sandbox(t, { discipline: null });
  const { lines, plain } = run(sb);
  assert.ok(lines[0].startsWith('\u001b[0m\u001b[1m[🔥\u001b[38;2;255;45;149mL\u001b[38;2;128;137;202mI\u001b[38;2;0;229;255mT\u001b[38;2;0;229;255m v1.0.24]\u001b[0m'), lines[0]);
  assert.equal(plain[0], '[🔥LIT v1.0.24] | Grok 4.5 [high] │ ctx [█▎░] 42%/2m │ $1.87 │ git main');
  assert.ok(run(sb, { env: { LITGROK_HUD_COLOR: '256' } }).lines[0].startsWith('\u001b[0m\u001b[1m\u001b[38;5;201m[🔥LIT v1.0.24]\u001b[0m'));
  assert.ok(run(sb, { env: { LITGROK_HUD_COLOR: '16' } }).lines[0].startsWith('\u001b[0m\u001b[1m\u001b[36m[🔥LIT v1.0.24]\u001b[0m'));
});

test('one accent carries every ordinary segment and separator, | after the mark and │ between the rest', (t) => {
  const sb = sandbox(t, { discipline: null });
  const line = run(sb).lines[0];
  const afterMark = line.slice(line.indexOf('v1.0.24]\u001b[0m') + 'v1.0.24]\u001b[0m'.length);
  const colours = new Set(runs(afterMark).filter(([, text]) => text.trim() && !/^░+$/u.test(text)).map(([sgr]) => sgr.match(/38;[25];[\d;]+/u)?.[0]));
  assert.deepEqual([...colours], [ACCENT], 'below the bands, everything after the mark is the accent (the gauge\'s empty cells are grey)');
  assert.match(line, new RegExp(`\\u001b\\[${ACCENT}m \\| \\u001b\\[0m`, 'u'), 'a | follows the mark');
  assert.equal([...line.matchAll(new RegExp(`\\u001b\\[${ACCENT}m │ \\u001b\\[0m`, 'gu'))].length, 3, '│ separates the segments');
});

test('the gauge is bracketed, in the accent below 70%, yellow from 70% and red from 90%, never green', (t) => {
  const sb = sandbox(t, { discipline: null });
  const gauge = (percent, extra) => {
    const line = run(sb, { percent, extra }).lines[0];
    return /ctx \[\u001b\[0m\u001b\[(38;2;[\d;]+)m[█▏▎▍▌▋▊▉]/u.exec(line)?.[1] ?? /ctx \[\u001b\[0m(?:\u001b\[38;2;68;68;68m)/u.exec(line)?.[0];
  };
  assert.equal(gauge(42), ACCENT);
  assert.equal(gauge(69), ACCENT);
  assert.equal(gauge(70), '38;2;215;175;0');
  assert.equal(gauge(89), '38;2;215;175;0');
  assert.equal(gauge(90), '38;2;215;95;95');
  assert.equal(gauge(62, { context_window: { used_percentage: 62, context_window_size: 2000000, auto_compact_threshold_percent: 70 } }), ACCENT, 'the bands are the family\'s, not the compaction point');
  assert.doesNotMatch(run(sb, { percent: 12 }).lines[0], /38;2;(?:95;175;95|107;219;143)m/u, 'no green on an ordinary row');
});

test('the card: the mark, the pink 🔥 LIT chip and the discipline in the accent; the corner states', (t) => {
  const sb = sandbox(t, { stage: [{ stage: 'plan' }, { ended: true }, { stage: 'work', plan: { done: 3, total: 7, next: '4. d' } }] });
  const { lines, plain } = run(sb);
  assert.match(plain[0], /^▎ \[🔥LIT v1\.0\.24\] \| {2}🔥 LIT {2}· litwork +idle$/u);
  assert.match(lines[0], /\u001b\[48;2;255;45;149m\u001b\[38;2;11;15;20m\u001b\[1m 🔥 LIT \u001b\[0m/u, 'the brand chip is pink with dark text');
  assert.match(lines[0], new RegExp(`\\u001b\\[1m\\u001b\\[${ACCENT}mlitwork`, 'u'), 'the discipline is the bold accent');
  assert.match(lines[0], new RegExp(`^\\u001b\\[${ACCENT}m▎`, 'u'), 'the card edge is the accent');
  assert.equal(plain.at(-1), '▎ Grok 4.5 [high] │ ctx [█▎░] 42%/2m │ $1.87 │ git main', 'the figures keep the family order');
});

test('the stage map uses LitGrok\'s own stages as the family card draws them', (t) => {
  const sb = sandbox(t, { stage: [{ stage: 'interview' }, { stage: 'plan' }, { stage: 'work', plan: { done: 3, total: 7 } }] });
  const { lines, plain } = run(sb, { env: { LITGROK_HUD_COLOR: '0' } });
  assert.equal(plain[1], 'interview ✓ ━━━━ plan ✓ ━━━━ [work 3/7] ━━━━ review · ──── done ·');
  const map = run(sb).lines[1];
  assert.match(map, /\u001b\[48;2;255;99;55m\u001b\[38;2;11;15;20m\u001b\[1m work 3\/7 \u001b\[0m/u, 'the current stage is an accent chip with dark text');
  assert.match(map, /\u001b\[38;2;138;138;138minterview ✓\u001b\[0m/u, 'a passed stage is dim with a tick');
  assert.match(map, /\u001b\[38;2;138;138;138mreview ·\u001b\[0m/u, 'a stage ahead is dim with a dot');
  assert.match(map, new RegExp(`\\u001b\\[${ACCENT}m━`, 'u'), 'rails into the current stage are the accent');
  assert.match(map, /\u001b\[38;2;70;80;92m━/u, 'the rail leaving it is grey');
  assert.match(map, /\u001b\[38;2;70;80;92m─/u, 'rails further on are grey dashes');
  assert.equal(lines.length, 4);
});

test('the one-line row keeps the family order and lights the ignition mark after the gauge', (t) => {
  const sb = sandbox(t);
  const { lines, plain } = run(sb, { env: { LITGROK_HUD_LINES: '1' } });
  assert.equal(plain[0], '[🔥LIT v1.0.24] | Grok 4.5 [high] │ ctx [█▎░] 42%/2m │  🔥 LIT  IGNITED · litwork 🔥 │ $1.87 │ git main');
  assert.match(lines[0], new RegExp(`\\u001b\\[48;2;255;45;149m\\u001b\\[38;2;11;15;20m\\u001b\\[1m 🔥 LIT \\u001b\\[0m\\u001b\\[1m\\u001b\\[${ACCENT}m IGNITED · litwork 🔥`, 'u'));
  assert.equal(run(sb, { env: { LITGROK_HUD_LINES: '1', LITGROK_HUD_COLOR: '0' } }).plain[0], '[🔥LIT v1.0.24] | Grok 4.5 [high] │ ctx [█▎░] 42%/2m │ 🔥 LIT IGNITED · litwork 🔥 │ $1.87 │ git main');
});
