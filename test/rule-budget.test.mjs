import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { run } from '../bin/litgrok.mjs';

// Grok Build loads every installed `.grok/rules/*.md` file in full on every turn, and it discards
// the stdout of an allowing UserPromptSubmit hook. So the per-turn text LitGrok adds is the rule
// file plus nothing from the prompt hook, whatever the prompt says. The ceiling keeps the rule
// from growing back; raise it only together with a measured reason. 15,600 held the Re-entry
// section, which stops a repeated `lit` from reloading and restarting an active mode; 15,800 adds the
// brainstorm route and the `lit review plan|work` spelling (199 bytes), with the depth kept in the skills;
// 15,880 adds the film section's pointer to the README cover loop commands (73 bytes); 15,960 adds
// the line that puts a Markdown report's figures in a table and its decisions in a numbered list (89 bytes);
// 16,160 adds the reader-facing line on when a reply's results belong in a short table (195 bytes);
// 16,840 adds the equipment-drawing route to lit-schematic and the film exclusion that sends such a drawing there (682 bytes);
// 17,516 adds the mechanism-port route to lit-hijack with its triggers, owners and precedence (676 bytes);
// 17,985 adds the brief-over-sessions route to lit-adhd with its triggers and scope (469 bytes);
// 18,073 adds the re-entry line that sends a bare `go` after a saved plan to start-work (88 bytes).
const RULE_BUDGET_BYTES = 18_073;
const ROUTES = {
  'lit, English': 'lit fix the failing date parser',
  'lit, Korean': 'lit 날짜 파서 버그 고쳐줘',
  'lit-loop': 'lit-loop finish the migration',
  'lit-plan': 'lit-plan plan the cache rewrite',
  'lit-brainstorm': 'lit brainstorm a name for my app',
  'lit-schematic': 'lit draw a P&ID of the reactor loop',
  'lit-hijack': 'lit hijack the review-lane technique from this post into my skill',
  'lit-adhd': 'lit adhd brief me on every recent session',
  'plain, English': 'what does this function return?',
  'plain, Korean': '이 함수는 무엇을 반환하나요?',
  'slash': '/lit-plan plan the cache rewrite',
};

function quietTty() {
  const sink = { isTTY: true, write() { return true; } };
  return { stdin: { isTTY: true }, stdout: sink, stderr: sink };
}

test('every route adds at most the rule budget to a turn, and the rule leads with reply rules', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'litgrok-rule-budget-'));
  try {
    const env = { ...process.env, HOME: join(scratch, 'home') };
    delete env.CI;
    delete env.NO_COLOR;
    assert.equal(await run(['install'], { ...quietTty(), cwd: scratch, env }), 0);
    const installed = join(scratch, '.grok');
    const rule = readFileSync(join(installed, 'rules', '00-litgrok.md'));
    assert.ok(rule.length <= RULE_BUDGET_BYTES, `installed rule is ${rule.length} bytes; budget ${RULE_BUDGET_BYTES}`);

    for (const [route, prompt] of Object.entries(ROUTES)) {
      const event = { hookEventName: 'UserPromptSubmit', sessionId: 'session-rule-budget', promptId: route, cwd: scratch, workspaceRoot: scratch, prompt };
      const hook = spawnSync(process.execPath, [join(installed, 'hooks', 'user-prompt-submit.mjs')], {
        cwd: scratch,
        encoding: 'utf8',
        env: { ...env, GROK_HOOK_EVENT: 'UserPromptSubmit', GROK_HOOK_NAME: 'user-prompt-submit', GROK_SESSION_ID: event.sessionId, GROK_WORKSPACE_ROOT: scratch },
        input: `${JSON.stringify(event)}\n`,
      });
      assert.equal(hook.status, 0, `${route}: ${hook.stderr}`);
      assert.equal(Buffer.byteLength(hook.stdout) + rule.length <= RULE_BUDGET_BYTES, true, `${route} adds ${hook.stdout.length} hook bytes`);
    }

    const text = rule.toString('utf8');
    const at = (heading) => {
      const index = text.indexOf(`\n## ${heading}\n`);
      assert.ok(index > 0, `missing section ${heading}`);
      return index;
    };
    for (const replyRule of ['Output channels', 'Reader-facing communication', 'Enforcement boundary', 'Prose review']) {
      for (const routing of ['New film selection', 'Office output selection', 'Interface modes', 'One-release invocation aliases']) {
        assert.ok(at(replyRule) < at(routing), `${replyRule} must come before ${routing}`);
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
