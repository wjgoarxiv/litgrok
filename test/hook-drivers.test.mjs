import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const HOOKS_DIRECTORY = join(PRODUCT_ROOT, '.grok', 'hooks');
const SESSION_CONFIG = join(HOOKS_DIRECTORY, 'session-start.json');
const SESSION_COMMAND = join(HOOKS_DIRECTORY, 'session-start.mjs');
const HEDGE_CONFIG = join(HOOKS_DIRECTORY, 'deliverable-hedge-guard.json');
const HEDGE_COMMAND = join(HOOKS_DIRECTORY, 'deliverable-hedge-guard.mjs');
const PASSIVE_HOOKS = [
  ['UserPromptSubmit', 'user-prompt-submit'],
  ['PreToolUse', 'pre-tool-use'],
  ['PostToolUse', 'post-tool-use'],
  ['PostToolUseFailure', 'post-tool-use-failure'],
  ['Stop', 'stop'],
  ['StopFailure', 'stop-failure'],
  ['SubagentStart', 'subagent-start'],
  ['SubagentStop', 'subagent-stop'],
  ['PreCompact', 'pre-compact'],
  ['PostCompact', 'post-compact'],
];

const sessionEvent = {
  hookEventName: 'SessionStart',
  sessionId: 'session-litgrok-driver',
  cwd: '/tmp/litgrok-driver',
  workspaceRoot: '/tmp/litgrok-driver',
};

function writeEvent(content, path = 'deliverables/report.md') {
  return {
    hookEventName: 'PreToolUse',
    sessionId: 'session-litgrok-driver',
    cwd: '/tmp/litgrok-driver',
    workspaceRoot: '/tmp/litgrok-driver',
    toolName: 'Edit',
    toolInput: { path, content },
  };
}

function runHook(command, event, environment = {}, unsetEnvironment = []) {
  assert.ok(existsSync(command), `hook command must exist: ${command}`);
  const childEnvironment = { ...process.env, ...environment };
  for (const name of unsetEnvironment) delete childEnvironment[name];
  const isolatedHudRoot = command.endsWith('user-prompt-submit.mjs') && !childEnvironment.LITGROK_HUD_STATE_ROOT
    ? mkdtempSync(join(tmpdir(), 'litgrok-hud-hook-test-'))
    : null;
  if (isolatedHudRoot) childEnvironment.LITGROK_HUD_STATE_ROOT = join(isolatedHudRoot, 'state');
  try {
    return spawnSync(command, [], {
      cwd: PRODUCT_ROOT,
      encoding: 'utf8',
      env: childEnvironment,
      input: `${JSON.stringify(event)}\n`,
    });
  } finally {
    if (isolatedHudRoot) rmSync(isolatedHudRoot, { recursive: true, force: true });
  }
}

function passiveEvent(eventName, workspaceRoot) {
  const event = {
    hookEventName: eventName,
    sessionId: `session-${eventName.toLowerCase()}`,
    cwd: workspaceRoot,
    workspaceRoot,
  };
  if (eventName === 'PreToolUse' || eventName === 'PostToolUse' || eventName === 'PostToolUseFailure') {
    event.toolName = 'Edit';
    event.toolInput = {};
  }
  return event;
}

function passiveEnvironment(event, hookName) {
  return {
    GROK_HOOK_EVENT: event.hookEventName,
    GROK_HOOK_NAME: hookName,
    GROK_SESSION_ID: event.sessionId,
    GROK_WORKSPACE_ROOT: event.workspaceRoot,
  };
}

function minimalPdf(text) {
  const content = `BT /F1 12 Tf 72 720 Td (${text.replace(/[\\()]/g, '\\$&')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

function readOnlyLedgerRecord(workspaceRoot) {
  const ledgerDirectory = join(workspaceRoot, '.grok', 'litgrok', 'session-ledger');
  const entries = readdirSync(ledgerDirectory);
  assert.equal(entries.length, 1, 'one session ledger file must be written');
  const lines = readFileSync(join(ledgerDirectory, entries[0]), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1, 'one event must produce one ledger record');
  return JSON.parse(lines[0]);
}

test('hook configs use the nested documented shape and package-owned commands', () => {
  const configPaths = [
    SESSION_CONFIG,
    HEDGE_CONFIG,
    ...PASSIVE_HOOKS.map(([, stem]) => join(HOOKS_DIRECTORY, `${stem}.json`)),
  ];
  for (const path of configPaths) {
    assert.ok(existsSync(path), `hook config must exist: ${path}`);
  }

  const session = JSON.parse(readFileSync(SESSION_CONFIG, 'utf8'));
  assert.deepEqual(session, {
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: 'session-start.mjs',
              timeout: 5,
            },
          ],
        },
      ],
    },
  });

  const hedge = JSON.parse(readFileSync(HEDGE_CONFIG, 'utf8'));
  assert.deepEqual(hedge, {
    hooks: {
      PreToolUse: [
        {
          matcher: '^(Edit|edit|Write|write)$',
          hooks: [
            {
              type: 'command',
              command: 'deliverable-hedge-guard.mjs',
              timeout: 5,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: '^(Bash|bash|Edit|edit|Write|write)$',
          hooks: [
            {
              type: 'command',
              command: 'deliverable-hedge-guard.mjs',
              timeout: 5,
            },
          ],
        },
      ],
    },
  });

  for (const [eventName, stem] of PASSIVE_HOOKS) {
    const config = JSON.parse(readFileSync(join(HOOKS_DIRECTORY, `${stem}.json`), 'utf8'));
    const registration = {
      hooks: [
        {
          type: 'command',
          command: `${stem}.mjs`,
          timeout: 5,
        },
      ],
    };
    assert.deepEqual(config, { hooks: { [eventName]: [registration] } });
  }

  for (const path of configPaths) {
    const config = JSON.parse(readFileSync(path, 'utf8'));
    const event = Object.keys(config.hooks)[0];
    const command = config.hooks[event][0].hooks[0].command;
    assert.ok(existsSync(join(dirname(path), command)), `hook command must resolve from its config directory: ${command}`);
  }
});

test('deliverable hedge guard documents the host fail-open boundary', () => {
  const source = readFileSync(HEDGE_COMMAND, 'utf8');
  assert.match(source, /fail-open/i);
  assert.match(source, /PreToolUse exits 2 to deny/i);
  assert.match(source, /PostToolUse findings are advisory/i);
  assert.match(source, /emit one visible line to stderr/i);
});

for (const [eventName, stem] of PASSIVE_HOOKS) {
  test(`${eventName} records one bounded package-owned ledger event`, () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), `litgrok-${stem}-`));
    const event = passiveEvent(eventName, workspaceRoot);

    try {
      const result = runHook(
        join(HOOKS_DIRECTORY, `${stem}.mjs`),
        event,
        passiveEnvironment(event, stem),
      );

      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '', 'passive hook stdout is ignored and must stay empty');
      assert.equal(result.stderr, '');
      const record = readOnlyLedgerRecord(workspaceRoot);
      assert.equal(record.schema, 'litgrok.hook-event/v1');
      assert.equal(record.event, eventName);
      assert.equal(record.sessionId, event.sessionId);
      assert.equal(record.cwd, event.cwd);
      assert.equal(record.workspaceRoot, event.workspaceRoot);
      assert.equal(record.hookName, stem);
      if (eventName === 'PreToolUse') {
        assert.deepEqual(record.tool, { name: event.toolName }, 'a starting call keeps its tool name only');
      } else if (event.toolName) {
        assert.deepEqual(record.tool, {
          name: event.toolName,
          inputSha256: '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
        });
      } else {
        assert.equal('tool' in record, false);
      }
    } finally {
      rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
}

test('passive recorder falls back to stdin when GROK_HOOK_EVENT is absent', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'litgrok-event-fallback-'));
  const event = passiveEvent('UserPromptSubmit', workspaceRoot);
  const environment = passiveEnvironment(event, 'user-prompt-submit');
  delete environment.GROK_HOOK_EVENT;

  try {
    const result = runHook(
      join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'),
      event,
      environment,
      ['GROK_HOOK_EVENT'],
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.equal(readOnlyLedgerRecord(workspaceRoot).event, 'UserPromptSubmit');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('passive recorder accepts the host environment event casing for canonical stdin events', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'litgrok-event-casing-'));
  const event = passiveEvent('UserPromptSubmit', workspaceRoot);
  const environment = passiveEnvironment(event, 'user-prompt-submit');
  environment.GROK_HOOK_EVENT = 'user_prompt_submit';

  try {
    const result = runHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), event, environment);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readOnlyLedgerRecord(workspaceRoot).event, 'UserPromptSubmit');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('passive recorder fails when both environment and stdin event names are absent', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'litgrok-event-missing-'));
  const event = passiveEvent('UserPromptSubmit', workspaceRoot);
  const environment = passiveEnvironment(event, 'user-prompt-submit');
  delete event.hookEventName;
  delete environment.GROK_HOOK_EVENT;

  try {
    const result = runHook(
      join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'),
      event,
      environment,
      ['GROK_HOOK_EVENT'],
    );

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /EVENT_NAME_MISSING/);
    assert.equal(existsSync(join(workspaceRoot, '.grok')), false, 'missing event identity must not write state');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('passive recorder rejects disagreement between environment and stdin event names', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'litgrok-event-mismatch-'));
  const event = passiveEvent('UserPromptSubmit', workspaceRoot);
  const environment = passiveEnvironment(event, 'user-prompt-submit');
  environment.GROK_HOOK_EVENT = 'Stop';

  try {
    const result = runHook(
      join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'),
      event,
      environment,
    );

    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /EVENT_NAME_MISMATCH/);
    assert.equal(existsSync(join(workspaceRoot, '.grok')), false, 'event disagreement must not write state');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('PreToolUse matcher covers every documented edit and write casing', () => {
  const config = JSON.parse(readFileSync(HEDGE_CONFIG, 'utf8'));
  const matcher = new RegExp(config.hooks.PreToolUse[0].matcher);

  for (const toolName of ['Edit', 'edit', 'Write', 'write']) {
    assert.equal(matcher.test(toolName), true, `matcher must cover documented tool name ${toolName}`);
  }
  for (const toolName of ['Read', 'Bash']) {
    assert.equal(matcher.test(toolName), false, `matcher must not enroll non-writing tool ${toolName}`);
  }
});

test('SessionStart announces the installed LitGrok surfaces and exits successfully', () => {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-session-start-'));
  try {
    const event = { ...sessionEvent, cwd: root, workspaceRoot: root };
    const result = runHook(SESSION_COMMAND, event, { ...passiveEnvironment(event, 'session-start'), LANG: 'C', LC_ALL: 'C' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, 'LIT\nLitGrok payload present: skills, project rules, hooks, and the npx installer.\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Stop source records only the documented turn event and has no skill-review scheduler', () => {
  const source = readFileSync(join(HOOKS_DIRECTORY, 'stop.mjs'), 'utf8');
  assert.match(source, /recordPassiveEvent\('Stop'\)/);
  assert.doesNotMatch(source, /skill-observer|skill-loop|recordTurnEnded/);
});

test('PreToolUse allows hedge-free reader-facing prose', () => {
  const result = runHook(HEDGE_COMMAND, writeEvent('검토 결과는 관찰값과 계산 절차를 명확하게 설명합니다.'));

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'allow' });
});

test('PreToolUse denies every canonical block-tier positive fixture', () => {
  const humanizer = join(PRODUCT_ROOT, '.grok', 'skills', 'lit-humanizer');
  const rules = JSON.parse(readFileSync(join(humanizer, 'rules.json'), 'utf8')).rules;
  const fixtures = JSON.parse(readFileSync(join(humanizer, 'fixtures', 'rule-cases.json'), 'utf8'));
  for (const rule of rules.filter((item) => item.severity === 'block')) {
    const result = runHook(HEDGE_COMMAND, writeEvent(fixtures.positive[rule.id]));
    assert.equal(result.status, 2, `${rule.id} must deny: ${result.stderr}`);
    assert.equal(JSON.parse(result.stdout).decision, 'deny');
  }
});

test('PreToolUse does not confuse factual API absence with an evidence hedge', () => {
  const factualAbsence = [
    '이 API는 반환값이 없습니다.',
    '이 함수는 부작용이 없습니다.',
    '이 형식에는 헤더가 없습니다.',
    '검증되지 않은 입력은 요청 단계에서 거부됩니다.',
    '확인되지 않은 연결은 자동으로 종료됩니다.',
  ];

  for (const sentence of factualAbsence) {
    const result = runHook(HEDGE_COMMAND, writeEvent(sentence));
    assert.equal(result.status, 0, `factual specification must not be flagged: ${sentence}`);
    assert.deepEqual(JSON.parse(result.stdout), { decision: 'allow' });
  }
});

test('PreToolUse treats measured factual-absence false positives as subject facts', () => {
  const subjectFacts = [
    '이 응답에는 데이터 필드가 없습니다.',
    '캐시 데이터가 없어서 원격 저장소를 조회합니다.',
    '관찰 기록이 없어서 새 세션을 생성합니다.',
    '이 응답에는 수치 데이터가 없습니다.',
    '표본이 없어도 함수는 정상 동작합니다.',
    'API 응답에 정보가 제공되지 않았습니다.',
    '샘플 파일은 패키지에 주어지지 않습니다.',
  ];

  for (const sentence of subjectFacts) {
    const result = runHook(HEDGE_COMMAND, writeEvent(sentence));
    assert.equal(result.status, 0, `subject fact must not be treated as author-evidence hedge: ${sentence}`);
    assert.deepEqual(JSON.parse(result.stdout), { decision: 'allow' });
  }
});

test('PreToolUse leaves warning-tier prose advisory and allows plain scoped findings', () => {
  const warning = runHook(HEDGE_COMMAND, writeEvent('Not a workaround, but a permanent fix.'));
  assert.equal(warning.status, 0, warning.stderr);
  assert.deepEqual(JSON.parse(warning.stdout), { decision: 'allow' });
  assert.match(warning.stderr, /lit-humanizer: advisory .*review wording/i);

  for (const sentence of [
    'This result is limited to the provided evidence.',
    '접근성은 관련 측정값과 사용자 관찰 기록이 없어 판단할 수 없다.',
  ]) {
    const result = runHook(HEDGE_COMMAND, writeEvent(sentence));
    assert.equal(result.status, 0, `plain scoped prose must not be denied: ${sentence}`);
    assert.equal(JSON.parse(result.stdout).decision, 'allow');
  }
});

test('PreToolUse skips fenced and quoted user text while still checking new prose', () => {
  const fenced = runHook(HEDGE_COMMAND, writeEvent('```md\n**Evidence:** example\n```'));
  assert.equal(fenced.status, 0, fenced.stderr);
  assert.deepEqual(JSON.parse(fenced.stdout), { decision: 'allow' });

  const prompt = '**Evidence:** wording supplied by the user';
  const event = writeEvent(`The requested phrase was ${prompt}.\n\n**Evidence:** newly added label`);
  event.user_prompt = prompt;
  const result = runHook(HEDGE_COMMAND, event);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'deny');
});

test('PreToolUse does not scan source-code targets as reader-facing artifacts', () => {
  const result = runHook(HEDGE_COMMAND, writeEvent('const note = "아직 근거가 없습니다";', 'src/report.mjs'));

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'allow' });
});

test('PreToolUse applies block-tier rules to reader prose beyond the previous hedge list', () => {
  const event = writeEvent('**Evidence:** checked output and logs', 'deliverables/report.rst');
  event.toolName = 'Write';
  const result = runHook(HEDGE_COMMAND, event);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'deny');
});

test('PreToolUse scans only the added portion of an edit', () => {
  const event = writeEvent('', 'deliverables/report.md');
  event.toolInput = {
    path: 'deliverables/report.md',
    old_string: 'This is for reference only.',
    new_string: 'This is for reference only. The guide is complete.',
  };
  const result = runHook(HEDGE_COMMAND, event);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { decision: 'allow' });
});

test('PreToolUse ignores internal paths', () => {
  for (const path of ['plans/review.md', 'evidence/run.md', 'HANDOFF_task.md', '.litclaude/log.md', '.hermes/state.md', '.grok/state.md', 'ledgers/review.md']) {
    const internal = runHook(HEDGE_COMMAND, writeEvent('**Evidence:** checked output and logs', path));
    assert.equal(internal.status, 0, `internal path should not be blocked: ${path}`);
    assert.deepEqual(JSON.parse(internal.stdout), { decision: 'allow' });
  }
});

test('PostToolUse scans created DOCX, PPTX, and PDF files and reports a rebuild advisory', (t) => {
  const pdfVersion = spawnSync('pdftotext', ['-v'], { encoding: 'utf8' });
  if (pdfVersion.error || pdfVersion.status !== 0) {
    t.skip('pdftotext is unavailable; the product reports this inspection boundary');
    return;
  }
  const output = mkdtempSync(join(tmpdir(), 'litgrok-humanizer-docx-'));
  try {
    const office = join(PRODUCT_ROOT, '.grok', 'skills', 'lit-humanizer', 'fixtures', 'office');
    const files = [
      ['report.docx', readFileSync(join(office, 'minimal.docx'))],
      ['slides.pptx', readFileSync(join(office, 'minimal.pptx'))],
      ['report.pdf', minimalPdf('**Evidence:** checked output and logs')],
    ];
    for (const [name, bytes] of files) {
      const document = join(output, name);
      writeFileSync(document, bytes);
      const event = {
        hookEventName: 'PostToolUse', sessionId: 'session-litgrok-driver', cwd: output, workspaceRoot: output,
        toolName: 'Bash', toolInput: { file_path: document }, toolResponse: { file_path: document },
      };
      const result = runHook(HEDGE_COMMAND, event);
      assert.equal(result.status, 0, `${name}: ${result.stderr}`);
      assert.match(`${result.stdout}\n${result.stderr}`, /lit-humanizer[\s\S]*(?:block|rebuild)/i, name);
    }
  } finally { rmSync(output, { recursive: true, force: true }); }
});

function planGateWorkspace(label) {
  const workspaceRoot = mkdtempSync(join(tmpdir(), `litgrok-plan-gate-${label}-`));
  test.after(() => rmSync(workspaceRoot, { recursive: true, force: true }));
  return workspaceRoot;
}

function turnEvent(eventName, workspaceRoot, extra = {}) {
  return {
    ...passiveEvent(eventName, workspaceRoot),
    sessionId: 'session-plan-gate',
    promptId: 'prompt-1',
    permissionMode: 'default',
    ...extra,
  };
}

function runTurn(workspaceRoot, { promptExtra = {}, stopExtra = {}, beforeStop = () => {} } = {}) {
  const prompt = turnEvent('UserPromptSubmit', workspaceRoot, promptExtra);
  const started = runHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), prompt, passiveEnvironment(prompt, 'user-prompt-submit'));
  assert.equal(started.status, 0, started.stderr);
  beforeStop();
  const stop = turnEvent('Stop', workspaceRoot, { reason: 'end_turn', ...stopExtra });
  return runHook(join(HOOKS_DIRECTORY, 'stop.mjs'), stop, passiveEnvironment(stop, 'stop'));
}

function writePlan(workspaceRoot, name, content) {
  const planPath = join(workspaceRoot, 'plans', name);
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, content);
  const future = new Date(Date.now() + 5_000);
  utimesSync(planPath, future, future);
}

test('Stop blocks a plan-mode turn that ends without a plans/<slug>.md carrying checkbox rows', () => {
  const workspaceRoot = planGateWorkspace('missing');
  const result = runTurn(workspaceRoot, { stopExtra: { permissionMode: 'plan' } });

  assert.equal(result.status, 0, result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'block');
  assert.match(decision.reason, /plans\/<slug>\.md/);
  assert.match(decision.reason, /scaffold-plan\.mjs/);
});

test('Stop allows a plan-mode turn that wrote a plan with a column-zero checkbox row', () => {
  const workspaceRoot = planGateWorkspace('written');
  const result = runTurn(workspaceRoot, {
    stopExtra: { permissionMode: 'plan' },
    beforeStop: () => writePlan(workspaceRoot, 'demo.md', '# demo\n\n## Todos\n- [ ] 1. First task\n'),
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', 'a persisted plan must not be blocked');
});

test('Stop blocks a plan written this turn with zero implementation rows in any permission mode', () => {
  const workspaceRoot = planGateWorkspace('empty');
  const result = runTurn(workspaceRoot, {
    beforeStop: () => writePlan(workspaceRoot, 'demo.md', '# demo\n\n## Todos\n(no rows)\n'),
  });

  assert.equal(result.status, 0, result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'block');
  assert.match(decision.reason, /- \[ \] 1\./);
});

test('Stop blocks a lit-plan prompt turn that ends without a plan file, in any permission mode', () => {
  const workspaceRoot = planGateWorkspace('prompt-marker');
  const result = runTurn(workspaceRoot, { promptExtra: { prompt: 'Use /lit-plan to plan the refactor.' } });

  assert.equal(result.status, 0, result.stderr);
  const decision = JSON.parse(result.stdout);
  assert.equal(decision.decision, 'block');
  assert.match(decision.reason, /scaffold-plan\.mjs/);

  const ledgerDirectory = join(workspaceRoot, '.grok', 'litgrok', 'session-ledger');
  const records = readFileSync(join(ledgerDirectory, readdirSync(ledgerDirectory)[0]), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(records[0].discipline, 'lit-plan', 'the ledger carries only the discipline marker');
  assert.equal(JSON.stringify(records).includes('refactor'), false, 'prompt text is never persisted');
});

test('bare lit and litwork do not add ledger discipline or arm the lit-plan Stop gate', () => {
  const workspaceRoot = planGateWorkspace('bare-lit-discipline');
  for (const promptText of ['Check out the litgrok install. lit', 'litwork']) {
    const result = runTurn(workspaceRoot, { promptExtra: { prompt: promptText } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '', `${promptText} must not arm the plan gate`);
  }

  const ledgerDirectory = join(workspaceRoot, '.grok', 'litgrok', 'session-ledger');
  const ledgerPath = join(ledgerDirectory, readdirSync(ledgerDirectory)[0]);
  const promptRecords = readFileSync(ledgerPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((record) => record.event === 'UserPromptSubmit');
  assert.equal(promptRecords.length, 2);
  assert.ok(promptRecords.every((record) => !Object.hasOwn(record, 'discipline')));

  const planTurn = runTurn(workspaceRoot, { promptExtra: { prompt: 'lit-plan' } });
  assert.equal(planTurn.status, 0, planTurn.stderr);
  assert.equal(JSON.parse(planTurn.stdout).decision, 'block', 'lit-plan must remain the ledger and gate discipline');
  const allPromptRecords = readFileSync(ledgerPath, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .filter((record) => record.event === 'UserPromptSubmit');
  assert.equal(allPromptRecords.at(-1).discipline, 'lit-plan');
});

test('Stop plan gate stays out of the way outside plan mode and for session-end or subagent fires', () => {
  const workspaceRoot = planGateWorkspace('inert');
  assert.equal(runTurn(workspaceRoot).stdout, '', 'default mode with no plan write must pass');
  assert.equal(runTurn(workspaceRoot, { promptExtra: { prompt: 'Explain the lit-planning of crops.' } }).stdout, '', 'a non-invoking mention must not arm the gate');
  assert.equal(runTurn(workspaceRoot, { stopExtra: { permissionMode: 'plan', reason: 'channel_closed' } }).stdout, '');
  assert.equal(runTurn(workspaceRoot, { stopExtra: { permissionMode: 'plan', subagentType: 'explore' } }).stdout, '');
});

test('Stop plan gate blocks at most twice per session, then passes with a warning', () => {
  const workspaceRoot = planGateWorkspace('cap');
  const first = runTurn(workspaceRoot, { stopExtra: { permissionMode: 'plan' } });
  const second = runTurn(workspaceRoot, { stopExtra: { permissionMode: 'plan', stopHookActive: true } });
  const third = runTurn(workspaceRoot, { stopExtra: { permissionMode: 'plan', stopHookActive: true } });

  assert.equal(JSON.parse(first.stdout).decision, 'block');
  assert.equal(JSON.parse(second.stdout).decision, 'block');
  assert.equal(third.status, 0);
  assert.equal(third.stdout, '');
  assert.match(third.stderr, /plan gate/i);

  const ledgerDirectory = join(workspaceRoot, '.grok', 'litgrok', 'session-ledger');
  const lines = readFileSync(join(ledgerDirectory, readdirSync(ledgerDirectory)[0]), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.filter((record) => record.signal === 'plan-gate-block').length, 2);
});

// Pipe reads arrive in 64 KiB chunks, so a 300 KB Korean event splits multi-byte characters at each seam.
const KOREAN_BULK = '가'.repeat(100_000);

test('hooks decode stdin once, so Korean text split across pipe chunks stays intact', () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'litgrok-stdin-utf8-'));
  try {
    const event = passiveEvent('PostToolUse', workspaceRoot);
    event.toolInput = { content: KOREAN_BULK };
    const result = runHook(join(HOOKS_DIRECTORY, 'post-tool-use.mjs'), event, passiveEnvironment(event, 'post-tool-use'));
    assert.equal(result.status, 0, result.stderr);
    const expected = createHash('sha256').update(JSON.stringify(event.toolInput)).digest('hex');
    assert.equal(readOnlyLedgerRecord(workspaceRoot).tool.inputSha256, expected, 'the recorder must hash the text Grok sent');
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }

  // Unchanged existing prose after a chunk seam must not look newly added to the edit guard.
  const shared = `${KOREAN_BULK}\n\nAs an AI language model, I cannot access live market data.\n`;
  const edit = writeEvent('', 'deliverables/report.md');
  edit.toolInput = { path: 'deliverables/report.md', old_string: shared, new_string: `${shared}검토를 마쳤습니다.` };
  const guard = runHook(HEDGE_COMMAND, edit);
  assert.equal(guard.status, 0, guard.stdout + guard.stderr);
  assert.deepEqual(JSON.parse(guard.stdout), { decision: 'allow' });

  for (const name of ['deliverable-hedge-guard.mjs', 'record-passive-event.mjs', 'session-start.mjs', 'lit-status-line.mjs']) {
    assert.doesNotMatch(readFileSync(join(HOOKS_DIRECTORY, name), 'utf8'), /input \+= chunk/u, `${name} must not decode stdin chunk by chunk`);
  }
});

function ledgerFileFor(workspaceRoot, sessionId) {
  return join(workspaceRoot, '.grok', 'litgrok', 'session-ledger', `${createHash('sha256').update(sessionId).digest('hex').slice(0, 32)}.jsonl`);
}

function seedLedger(workspaceRoot, sessionId, text) {
  const file = ledgerFileFor(workspaceRoot, sessionId);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
}

function seedRecord(sessionId, extra = {}) {
  return `${JSON.stringify({ schema: 'litgrok.hook-event/v1', event: 'UserPromptSubmit', sessionId, recordedAt: new Date(Date.now() - 60_000).toISOString(), ...extra })}\n`;
}

const parsedLines = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
  try { return [JSON.parse(line)]; } catch { return []; }
});

test('a torn last line in the session ledger never stops later hooks or the Stop plan gate', () => {
  const workspaceRoot = planGateWorkspace('torn-ledger');
  const file = seedLedger(workspaceRoot, 'session-plan-gate', `${seedRecord('session-plan-gate')}{"schema":"litgrok.hook-ev`);
  const result = runTurn(workspaceRoot, { stopExtra: { permissionMode: 'plan' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'block', 'the plan gate must still run');
  const records = parsedLines(file);
  assert.deepEqual(
    records.map((record) => record.signal ?? record.event),
    ['UserPromptSubmit', 'UserPromptSubmit', 'turn-ended', 'plan-gate-block'],
    'the torn line is skipped and every new record stays whole',
  );
});

test('a ledger past the size cap rotates to a numbered segment instead of failing every hook', () => {
  const workspaceRoot = planGateWorkspace('rotate');
  const sessionId = 'session-plan-gate';
  const prompt = turnEvent('UserPromptSubmit', workspaceRoot, { prompt: 'lit-plan' });
  const started = runHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), prompt, passiveEnvironment(prompt, 'user-prompt-submit'));
  assert.equal(started.status, 0, started.stderr);
  const file = ledgerFileFor(workspaceRoot, sessionId);
  const filler = `${JSON.stringify({ schema: 'litgrok.hook-event/v1', event: 'PostToolUse', sessionId, pad: 'x'.repeat(4000) })}\n`;
  appendFileSync(file, filler.repeat(Math.ceil((8 * 1024 * 1024) / filler.length) + 1));

  const stop = turnEvent('Stop', workspaceRoot, { reason: 'end_turn' });
  const result = runHook(join(HOOKS_DIRECTORY, 'stop.mjs'), stop, passiveEnvironment(stop, 'stop'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'block', 'the lit-plan turn recorded before rotation still arms the gate');

  const directory = dirname(file);
  const segments = readdirSync(directory).filter((name) => /^[0-9a-f]{32}\.\d+\.jsonl$/u.test(name));
  assert.equal(segments.length, 1, 'the full ledger moves aside as one numbered segment');
  const current = parsedLines(file);
  assert.equal(current[0].event, 'Stop', 'a fresh ledger starts with the new record');
  assert.ok(readFileSync(file).length < 64 * 1024);
});

test('the ledger still refuses a foreign first record and a symbolic link', () => {
  const workspaceRoot = planGateWorkspace('foreign');
  seedLedger(workspaceRoot, 'session-plan-gate', seedRecord('another-session'));
  const prompt = turnEvent('UserPromptSubmit', workspaceRoot);
  const foreign = runHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), prompt, passiveEnvironment(prompt, 'user-prompt-submit'));
  assert.equal(foreign.status, 1);
  assert.match(foreign.stderr, /LEDGER_IDENTITY_MISMATCH/u);

  const linked = planGateWorkspace('symlink');
  const target = join(linked, 'elsewhere.jsonl');
  writeFileSync(target, '');
  const file = ledgerFileFor(linked, 'session-plan-gate');
  mkdirSync(dirname(file), { recursive: true });
  symlinkSync(target, file);
  const linkedPrompt = turnEvent('UserPromptSubmit', linked);
  const refused = runHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), linkedPrompt, passiveEnvironment(linkedPrompt, 'user-prompt-submit'));
  assert.equal(refused.status, 1);
  assert.equal(readFileSync(target, 'utf8'), '', 'nothing is written through the link');
});

test('runtime state folders ignore themselves in Git; the committed payload never gets an ignore file', () => {
  const workspaceRoot = planGateWorkspace('state-ignore');
  mkdirSync(join(workspaceRoot, '.grok', 'skills'), { recursive: true });
  const prompt = turnEvent('UserPromptSubmit', workspaceRoot);
  const result = runHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), prompt, passiveEnvironment(prompt, 'user-prompt-submit'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(workspaceRoot, '.grok', 'litgrok', '.gitignore'), 'utf8'), '*\n');
  assert.equal(existsSync(join(workspaceRoot, '.grok', '.gitignore')), false, 'the .grok payload root stays committable');
  assert.equal(existsSync(join(workspaceRoot, '.grok', 'skills', '.gitignore')), false);

  writeFileSync(join(workspaceRoot, '.grok', 'litgrok', '.gitignore'), 'session-ledger/\n');
  assert.equal(runHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), prompt, passiveEnvironment(prompt, 'user-prompt-submit')).status, 0);
  assert.equal(readFileSync(join(workspaceRoot, '.grok', 'litgrok', '.gitignore'), 'utf8'), 'session-ledger/\n', 'a user-edited ignore file is kept');
});

function bigFiller(sessionId) {
  const filler = `${JSON.stringify({ schema: 'litgrok.hook-event/v1', event: 'PostToolUse', sessionId, pad: 'x'.repeat(4000) })}\n`;
  return filler.repeat(Math.ceil((8 * 1024 * 1024) / filler.length) + 1);
}

test('an oversized ledger whose first record is foreign is refused, never rotated', () => {
  const workspaceRoot = planGateWorkspace('foreign-oversized');
  const file = seedLedger(workspaceRoot, 'session-plan-gate', `${seedRecord('another-session')}${bigFiller('another-session')}`);
  const prompt = turnEvent('UserPromptSubmit', workspaceRoot);
  const result = runHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), prompt, passiveEnvironment(prompt, 'user-prompt-submit'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /LEDGER_FILE_UNSAFE/u);
  assert.deepEqual(readdirSync(dirname(file)).filter((name) => name.endsWith('.jsonl')), [basename(file)], 'the foreign file stays where it is');
});

test('rotation keeps only the two newest segments', () => {
  const workspaceRoot = planGateWorkspace('prune');
  const sessionId = 'session-plan-gate';
  const file = seedLedger(workspaceRoot, sessionId, `${seedRecord(sessionId)}${bigFiller(sessionId)}`);
  for (const number of [1, 2, 3]) writeFileSync(file.replace(/\.jsonl$/u, `.${number}.jsonl`), seedRecord(sessionId));
  const prompt = turnEvent('UserPromptSubmit', workspaceRoot);
  const result = runHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), prompt, passiveEnvironment(prompt, 'user-prompt-submit'));
  assert.equal(result.status, 0, result.stderr);
  const segments = readdirSync(dirname(file)).filter((name) => /\.\d+\.jsonl$/u.test(name)).map((name) => Number(name.split('.')[1])).sort();
  assert.deepEqual(segments, [3, 4]);
});

function spawnHook(command, event, environment) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [command], { cwd: PRODUCT_ROOT, env: { ...process.env, ...environment }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolveRun({ status, stderr }));
    child.stdin.end(`${JSON.stringify(event)}\n`);
  });
}

test('concurrent appenders rotate once, keep every record once and never hard-link a segment twice', async () => {
  for (let round = 0; round < 8; round += 1) {
    const workspaceRoot = planGateWorkspace(`concurrent-${round}`);
    const sessionId = 'session-plan-gate';
    const file = seedLedger(workspaceRoot, sessionId, `${seedRecord(sessionId)}${bigFiller(sessionId)}`);
    const hudRoot = mkdtempSync(join(tmpdir(), 'litgrok-hud-concurrent-'));
    try {
      const runs = await Promise.all(Array.from({ length: 48 }, (_, index) => {
        const prompt = turnEvent('UserPromptSubmit', workspaceRoot, { promptId: `concurrent-${index}` });
        return spawnHook(join(HOOKS_DIRECTORY, 'user-prompt-submit.mjs'), prompt, {
          ...passiveEnvironment(prompt, 'user-prompt-submit'),
          LITGROK_HUD_STATE_ROOT: join(hudRoot, 'state'),
        });
      }));
      assert.deepEqual(runs.filter((run) => run.status !== 0).map((run) => run.stderr), [], `round ${round}`);
    } finally {
      rmSync(hudRoot, { recursive: true, force: true });
    }
    const directory = dirname(file);
    const ledgers = readdirSync(directory).filter((name) => name.endsWith('.jsonl'));
    const inodes = ledgers.map((name) => statSync(join(directory, name)).ino);
    assert.equal(new Set(inodes).size, inodes.length, `round ${round}: one name per ledger file (${ledgers.join(', ')})`);
    const ids = ledgers.flatMap((name) => parsedLines(join(directory, name))).map((record) => record.promptId).filter((id) => id?.startsWith('concurrent-'));
    assert.equal(ids.length, 48, `round ${round}: every record once`);
    assert.equal(new Set(ids).size, 48);
  }
});
