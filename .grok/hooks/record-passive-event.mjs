import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { writeHudRecords } from './litgrok-hud-state.mjs';
import { entryFromPrompt, readWorkflowState, testVerdict, updateWorkflowState, workflowStatePath } from './workflow-stage.mjs';

const MAX_EVENT_BYTES = 1024 * 1024;
// A ledger past this size moves aside as a numbered segment and a fresh one starts.
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
// Identity is checked on the first record only, so appending never rereads the whole ledger.
const FIRST_RECORD_PROBE_BYTES = 64 * 1024;
const KEPT_SEGMENTS = 2;
const ROTATION_LOCK_STALE_MS = 30 * 1000;
const TOOL_EVENTS = new Set(['PostToolUse', 'PostToolUseFailure']);
const RECORD_SCHEMA = 'litgrok.hook-event/v1';
// A finished call by one of these tools cannot have changed a plan file, so it skips the plan reread.
const READ_ONLY_TOOLS = /^(?:read_file|grep|list_dir|glob|todo_write|web_search|web_fetch|read|ls)$/iu;
const HUD_DISCIPLINE_PATTERN = /(?:^|[\s/])(lit-scientific-visualization|lit-handoff|lit-brainstorm|lit-adhd|lit-rewind|autoconference|autoresearch|lit-plan|litwork|review-work|lit)(?=$|[^\w-])/iu;
// The skill also runs from bare words, the rule and the catalog, where no prompt names it. Its
// collector starting is the run, so that call switches the card to the rewind look. The command
// text is only inspected, never stored: the ledger keeps the tool name alone.
const ADHD_COLLECTOR_SCRIPT = /lit-adhd\/scripts\/rewind\.mjs/u;
const ADHD_COLLECTOR_RUN = /(?:^|[\s"'])(?:--brief|--json)(?:$|[\s"'=])/u;

function maskCode(text) {
  return text.replace(/[^\r\n]/gu, '\u0000');
}

function maskInlineCode(text) {
  const runs = [...text.matchAll(/`+/gu)].map((match) => ({ index: match.index, text: match[0] }));
  const nextRunByLength = new Array(runs.length).fill(-1);
  const nextByLength = new Map();
  for (let index = runs.length - 1; index >= 0; index -= 1) {
    const run = runs[index];
    nextRunByLength[index] = nextByLength.get(run.text.length) ?? -1;
    nextByLength.set(run.text.length, index);
  }

  let output = '';
  let cursor = 0;
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index];
    if (run.index < cursor) continue;
    const closeIndex = nextRunByLength[index];
    const openEnd = run.index + run.text.length;
    if (closeIndex < 0) {
      output += text.slice(cursor, openEnd);
      cursor = openEnd;
      continue;
    }
    const close = runs[closeIndex];
    const closeEnd = close.index + close.text.length;
    output += text.slice(cursor, run.index) + maskCode(text.slice(run.index, closeEnd));
    cursor = closeEnd;
    index = closeIndex;
  }
  return output + text.slice(cursor);
}

function visiblePromptText(prompt) {
  let fence = null;
  const lines = prompt.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  const withoutFences = lines.map((line) => {
    if (fence !== null) {
      const close = line.match(/^[\t ]{0,3}(`+|~+)[\t ]*(?:\r?\n)?$/u)?.[1];
      if (close && close[0] === fence.marker && close.length >= fence.length) fence = null;
      return maskCode(line);
    }
    const open = line.match(/^[\t ]{0,3}(`{3,}|~{3,})/u)?.[1];
    if (open !== undefined) {
      fence = { marker: open[0], length: open.length };
      return maskCode(line);
    }
    return line;
  }).join('');
  return maskInlineCode(withoutFences);
}

function hudDisciplineFromPrompt(prompt) {
  if (typeof prompt !== 'string') return null;
  const match = HUD_DISCIPLINE_PATTERN.exec(visiblePromptText(prompt));
  if (!match) return null;
  const token = match[1].toLowerCase();
  if (token === 'lit') return 'litwork';
  if (token === 'lit-rewind') return 'lit-adhd';
  return token;
}

class RecorderError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function requireString(value, code) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) throw new RecorderError(code);
  return value;
}

function normalizedEventName(value) {
  return requireString(value, 'EVENT_NAME_MISSING').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

async function readEvent() {
  // Decode once: a multi-byte character can straddle two pipe chunks.
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_EVENT_BYTES) throw new RecorderError('EVENT_TOO_LARGE');
    chunks.push(chunk);
  }
  try {
    const event = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error();
    return event;
  } catch {
    throw new RecorderError('EVENT_INVALID_JSON');
  }
}

function verifiedEnvironment(event, expectedEvent) {
  const environmentHookEvent = process.env.GROK_HOOK_EVENT;
  const stdinHookEvent = event.hookEventName;
  const hookEvent = requireString(environmentHookEvent || stdinHookEvent, 'EVENT_NAME_MISSING');
  const hookName = requireString(process.env.GROK_HOOK_NAME, 'ENV_HOOK_NAME_MISSING');
  let sessionId;
  if (expectedEvent === 'UserPromptSubmit') {
    const environmentSessionId = process.env.GROK_SESSION_ID === undefined
      ? null
      : requireString(process.env.GROK_SESSION_ID, 'ENV_SESSION_ID_MISSING');
    const stdinSessionId = event.sessionId === undefined || event.sessionId === null
      ? null
      : requireString(event.sessionId, 'SESSION_ID_MISSING');
    if (environmentSessionId !== null && stdinSessionId !== null && environmentSessionId !== stdinSessionId) {
      throw new RecorderError('SESSION_ID_MISMATCH');
    }
    sessionId = environmentSessionId ?? stdinSessionId;
  } else {
    sessionId = requireString(process.env.GROK_SESSION_ID, 'ENV_SESSION_ID_MISSING');
    if (event.sessionId !== sessionId) throw new RecorderError('SESSION_ID_MISMATCH');
  }
  const workspaceRoot = requireString(process.env.GROK_WORKSPACE_ROOT, 'ENV_WORKSPACE_ROOT_MISSING');

  if (normalizedEventName(hookEvent) !== normalizedEventName(expectedEvent)) throw new RecorderError('EVENT_NAME_MISMATCH');
  if (environmentHookEvent && stdinHookEvent && normalizedEventName(environmentHookEvent) !== normalizedEventName(stdinHookEvent)) {
    throw new RecorderError('EVENT_NAME_MISMATCH');
  }
  if (event.workspaceRoot !== workspaceRoot) throw new RecorderError('WORKSPACE_ROOT_MISMATCH');
  if (!isAbsolute(workspaceRoot)) throw new RecorderError('WORKSPACE_ROOT_NOT_ABSOLUTE');

  const eventCwd = requireString(event.cwd, 'EVENT_CWD_MISSING');
  if (!isAbsolute(eventCwd)) throw new RecorderError('EVENT_CWD_NOT_ABSOLUTE');

  let realWorkspaceRoot;
  try {
    realWorkspaceRoot = realpathSync(workspaceRoot);
  } catch {
    throw new RecorderError('WORKSPACE_ROOT_UNAVAILABLE');
  }

  return { eventCwd, hookName, realWorkspaceRoot, sessionId, workspaceRoot };
}

function ensureDirectory(path) {
  if (!existsSync(path)) {
    try {
      mkdirSync(path, { mode: 0o700 });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  const status = lstatSync(path);
  if (!status.isDirectory() || status.isSymbolicLink()) throw new RecorderError('LEDGER_DIRECTORY_UNSAFE');
}

// .grok/litgrok/ holds only runtime state (session ids, cwd, tool names, the auto-handoff choice), never
// the payload a project commits, so it ignores itself in Git. An existing file is the user's and is kept.
export function ignoreStateDirectory(productDirectory) {
  try {
    writeFileSync(join(productDirectory, '.gitignore'), '*\n', { flag: 'wx', mode: 0o644 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
}

function ledgerPath(realWorkspaceRoot, sessionId) {
  const grokDirectory = join(realWorkspaceRoot, '.grok');
  const productDirectory = join(grokDirectory, 'litgrok');
  const ledgerDirectory = join(productDirectory, 'session-ledger');
  for (const path of [grokDirectory, productDirectory, ledgerDirectory]) ensureDirectory(path);
  ignoreStateDirectory(productDirectory);
  const sessionKey = createHash('sha256').update(sessionId).digest('hex').slice(0, 32);
  return join(ledgerDirectory, `${sessionKey}.jsonl`);
}

export function claimSessionIgnition(event) {
  const environment = verifiedEnvironment(event, 'SessionStart');
  if (environment.sessionId.length > 512) throw new RecorderError('SESSION_ID_INVALID');
  const path = ledgerPath(environment.realWorkspaceRoot, environment.sessionId).replace(/\.jsonl$/u, '.ignited');
  const noFollow = constants.O_NOFOLLOW ?? 0;
  try {
    // An empty exclusive marker claims this session atomically, including replays.
    closeSync(openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600));
    return true;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const status = lstatSync(path);
    if (!status.isFile() || status.isSymbolicLink() || status.size !== 0) throw new RecorderError('IGNITION_MARKER_UNSAFE');
    return false;
  }
}

function readAt(descriptor, length, position) {
  const buffer = Buffer.alloc(length);
  const read = readSync(descriptor, buffer, 0, length, position);
  return buffer.subarray(0, read);
}

function segmentPattern(path) {
  return new RegExp(`^${basename(path, '.jsonl')}\\.(\\d+)\\.jsonl$`, 'u');
}

function segmentNumbers(path) {
  const pattern = segmentPattern(path);
  return readdirSync(dirname(path)).flatMap((name) => {
    const match = pattern.exec(name);
    return match ? [Number(match[1])] : [];
  });
}

// Only one hook rotates at a time. The lock is an exclusive empty file; one left by a crashed hook is
// taken over once it is older than ROTATION_LOCK_STALE_MS.
function takeRotationLock(path) {
  const lock = `${path}.rotate.lock`;
  const noFollow = constants.O_NOFOLLOW ?? 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      closeSync(openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600));
      return lock;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const status = lstatSync(lock, { throwIfNoEntry: false });
      if (!status || Date.now() - status.mtimeMs <= ROTATION_LOCK_STALE_MS) return null;
      try {
        unlinkSync(lock);
      } catch (removeError) {
        if (removeError?.code !== 'ENOENT') throw removeError;
      }
    }
  }
  return null;
}

// Moves the measured ledger aside as the next numbered segment and keeps only the newest
// KEPT_SEGMENTS segments. Returns false when another hook holds the rotation lock; true when the
// ledger was rotated here or had already been rotated, so the caller reopens the live name.
function rotateLedger(path, measured) {
  const lock = takeRotationLock(path);
  if (lock === null) return false;
  try {
    const live = lstatSync(path, { throwIfNoEntry: false });
    if (!live || live.ino !== measured.ino || live.dev !== measured.dev) return true;
    let number = Math.max(0, ...segmentNumbers(path)) + 1;
    for (;;) {
      try {
        linkSync(path, join(dirname(path), `${basename(path, '.jsonl')}.${number}.jsonl`));
        break;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        number += 1;
      }
    }
    unlinkSync(path);
    for (const old of segmentNumbers(path).sort((left, right) => right - left).slice(KEPT_SEGMENTS)) {
      try {
        unlinkSync(join(dirname(path), `${basename(path, '.jsonl')}.${old}.jsonl`));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    return true;
  } finally {
    try {
      unlinkSync(lock);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

// Checks identity on the first record before anything else, so an oversized foreign file is refused,
// never rotated. Returns { prefix } with a newline when the last record was torn (it stays one skipped
// line instead of swallowing the new record), plus rotate: 'full' past the size cap or 'torn' when the
// only record never got its newline.
function checkOpenLedger(descriptor, sessionId) {
  const status = fstatSync(descriptor);
  if (!status.isFile()) throw new RecorderError('LEDGER_FILE_UNSAFE');
  if (status.size === 0) return { prefix: '' };
  const oversized = status.size > MAX_LEDGER_BYTES;
  const refusal = oversized ? 'LEDGER_FILE_UNSAFE' : 'LEDGER_IDENTITY_MISMATCH';
  const head = readAt(descriptor, Math.min(status.size, FIRST_RECORD_PROBE_BYTES), 0);
  const end = head.indexOf(0x0a);
  if (end < 0) {
    if (status.size <= FIRST_RECORD_PROBE_BYTES) return { rotate: 'torn', prefix: '\n' };
    throw new RecorderError(refusal);
  }
  try {
    const record = JSON.parse(head.subarray(0, end).toString('utf8'));
    if (record.schema !== RECORD_SCHEMA || record.sessionId !== sessionId) throw new Error();
  } catch {
    throw new RecorderError(refusal);
  }
  const prefix = readAt(descriptor, 1, status.size - 1)[0] === 0x0a ? '' : '\n';
  return oversized ? { rotate: 'full', prefix } : { prefix };
}

// Records of one session, oldest first: the newest rotated segment and then the live ledger. Lines
// that do not parse (a torn write) or belong to another session are skipped.
export function readLedgerRecords(ledgerFile, sessionId) {
  const files = [];
  const numbers = existsSync(dirname(ledgerFile)) ? segmentNumbers(ledgerFile) : [];
  if (numbers.length > 0) files.push(join(dirname(ledgerFile), `${basename(ledgerFile, '.jsonl')}.${Math.max(...numbers)}.jsonl`));
  files.push(ledgerFile);
  const records = [];
  for (const file of files) {
    const status = lstatSync(file, { throwIfNoEntry: false });
    if (!status?.isFile()) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        if (record?.sessionId === sessionId) records.push(record);
      } catch {
        // A torn line is skipped.
      }
    }
  }
  return records;
}

function toolRecord(event, expectedEvent) {
  // A call that is starting keeps only its tool name, for the status line's live step.
  if (expectedEvent === 'PreToolUse') return { name: requireString(event.toolName, 'TOOL_NAME_MISSING') };
  if (!TOOL_EVENTS.has(expectedEvent)) return undefined;
  const name = requireString(event.toolName, 'TOOL_NAME_MISSING');
  if (!Object.hasOwn(event, 'toolInput')) throw new RecorderError('TOOL_INPUT_MISSING');
  return {
    name,
    inputSha256: createHash('sha256').update(JSON.stringify(event.toolInput)).digest('hex'),
  };
}

function openLedger(path) {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  try {
    return openSync(path, constants.O_RDWR | constants.O_APPEND | constants.O_CREAT | noFollow, 0o600);
  } catch (error) {
    if (error?.code === 'ELOOP' || error?.code === 'EISDIR') throw new RecorderError('LEDGER_FILE_UNSAFE');
    throw error;
  }
}

function appendRecord(path, record) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const descriptor = openLedger(path);
    try {
      const check = checkOpenLedger(descriptor, record.sessionId);
      if (check.rotate && rotateLedger(path, fstatSync(descriptor))) continue;
      // Another hook is moving a torn ledger aside; reopen. A full one can take this record meanwhile.
      if (check.rotate === 'torn') continue;
      writeSync(descriptor, `${check.prefix}${JSON.stringify(record)}\n`);
      fsyncSync(descriptor);
      return;
    } finally {
      closeSync(descriptor);
    }
  }
  throw new RecorderError('LEDGER_FILE_UNSAFE');
}

// The workflow snapshot is display state for the status line: a failure leaves the ledger record in
// place, says so on stderr and lets the hook succeed. The plan reader loads only here, because the
// status line imports this module and must not depend on the lit-plan skill's files.
async function noteWorkflow(ledgerFile, environment, expectedEvent, record, entry, active) {
  if (!['UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure'].includes(expectedEvent)) return;
  try {
    const readsPlan = expectedEvent !== 'PostToolUseFailure' && !READ_ONLY_TOOLS.test(record.tool?.name ?? '');
    const plan = readsPlan ? (await import('./plan-progress.mjs')).planProgress(environment.realWorkspaceRoot) : undefined;
    updateWorkflowState(ledgerFile, environment.sessionId, {
      stage: record.stage,
      entry,
      active,
      plan,
      test: record.test,
    });
  } catch (error) {
    process.stderr.write(`LitGrok workflow state: ${error?.message ?? 'WORKFLOW_STATE_FAILED'}\n`);
  }
}

export function appendSessionRecord(ledgerFile, baseRecord, fields) {
  appendRecord(ledgerFile, { ...baseRecord, ...fields, recordedAt: new Date().toISOString() });
}

export async function recordPassiveEvent(expectedEvent) {
  try {
    const event = await readEvent();
    const environment = verifiedEnvironment(event, expectedEvent);
    if (environment.sessionId !== null && environment.sessionId.length > 512) throw new RecorderError('SESSION_ID_INVALID');
    const record = {
      schema: RECORD_SCHEMA,
      event: expectedEvent,
      sessionId: environment.sessionId,
      cwd: environment.eventCwd,
      workspaceRoot: environment.workspaceRoot,
      hookName: environment.hookName,
      recordedAt: new Date().toISOString(),
    };
    const tool = toolRecord(event, expectedEvent);
    if (tool) record.tool = tool;
    if (typeof event.promptId === 'string') record.promptId = event.promptId;
    const entry = expectedEvent === 'UserPromptSubmit' && typeof event.prompt === 'string' ? entryFromPrompt(visiblePromptText(event.prompt)) : null;
    const ledgerFile = environment.sessionId === null ? null : ledgerPath(environment.realWorkspaceRoot, environment.sessionId);
    // A bare `lit` continues the discipline the last explicit switch selected, and with it that discipline's gate.
    const continued = entry?.entry === 'continue' && ledgerFile !== null
      ? readWorkflowState(workflowStatePath(ledgerFile), environment.sessionId)?.active ?? null
      : null;
    const selected = entry === null || entry.entry === 'continue' ? undefined
      : entry.discipline === 'lit-brainstorm' ? 'lit-brainstorm' : entry.stage === 'plan' ? 'lit-plan' : null;
    const discipline = expectedEvent === 'UserPromptSubmit' && typeof event.prompt === 'string'
      && (/(?:^|[\s/])lit-plan(?:$|[^\w-])/iu.test(event.prompt) || entry?.discipline === 'lit-plan' || continued === 'lit-plan') ? 'lit-plan' : null;
    let hudDiscipline = null;
    if (expectedEvent === 'UserPromptSubmit') {
      hudDiscipline = continued ?? (entry?.discipline !== undefined ? entry.discipline : hudDisciplineFromPrompt(event.prompt));
    }
    if (expectedEvent === 'PreToolUse') {
      const command = event?.toolInput?.command ?? event?.toolInput?.cmd;
      if (typeof command === 'string' && ADHD_COLLECTOR_SCRIPT.test(command) && ADHD_COLLECTOR_RUN.test(command)) {
        writeHudRecords({
          env: process.env,
          sessionId: environment.sessionId,
          cwd: environment.eventCwd,
          workspaceRoot: environment.realWorkspaceRoot,
          discipline: 'lit-adhd',
        });
      }
    }
    if (discipline !== null) record.discipline = discipline;
    if (entry?.stage && continued !== 'lit-brainstorm') record.stage = entry.stage;
    // Only the verdict and one count of a test run are kept, never the command or its output.
    const test = TOOL_EVENTS.has(expectedEvent) ? testVerdict(event, expectedEvent === 'PostToolUseFailure') : null;
    if (test !== null) record.test = test;
    if (expectedEvent === 'Stop') record.signal = 'turn-ended';
    if (ledgerFile !== null) {
      appendRecord(ledgerFile, record);
      await noteWorkflow(ledgerFile, environment, expectedEvent, record, entry?.entry, selected);
    }
    if (expectedEvent === 'UserPromptSubmit') {
      writeHudRecords({
        env: process.env,
        sessionId: environment.sessionId,
        cwd: environment.eventCwd,
        workspaceRoot: environment.realWorkspaceRoot,
        discipline: hudDiscipline,
      });
    }
    return { environment, event, ledgerFile, record };
  } catch (error) {
    const code = error instanceof RecorderError ? error.code : error?.code?.startsWith?.('HUD_') ? error.code : 'RECORDER_FAILED';
    process.stderr.write(`LitGrok passive hook recorder: ${code}\n`);
    process.exitCode = 1;
    return null;
  }
}
