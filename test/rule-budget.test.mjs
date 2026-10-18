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
// from growing back; raise it only together with a measured reason.
const RULE_BUDGET_BYTES = 15_500;
const ROUTES = {
  'lit, English': 'lit fix the failing date parser',
  'lit, Korean': 'lit 날짜 파서 버그 고쳐줘',
  'lit-loop': 'lit-loop finish the migration',
  'lit-plan': 'lit-plan plan the cache rewrite',
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
