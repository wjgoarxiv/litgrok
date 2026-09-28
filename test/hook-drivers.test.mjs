import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
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
  if (eventName === 'PostToolUse' || eventName === 'PostToolUseFailure') {
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
    if (eventName === 'PostToolUse') registration.matcher = '^(Edit|edit|Write|write)$';
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
      if (event.toolName) {
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
