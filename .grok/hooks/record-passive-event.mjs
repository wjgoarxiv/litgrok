import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { writeHudRecords } from './litgrok-hud-state.mjs';

const MAX_EVENT_BYTES = 1024 * 1024;
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
const TOOL_EVENTS = new Set(['PostToolUse', 'PostToolUseFailure']);
const RECORD_SCHEMA = 'litgrok.hook-event/v1';
const HUD_DISCIPLINE_PATTERN = /(?:^|[\s/])(lit-scientific-visualization|lit-handoff|autoconference|autoresearch|lit-plan|litwork|lit)(?=$|[^\w-])/iu;

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
  return token === 'lit' ? 'litwork' : token;
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
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > MAX_EVENT_BYTES) throw new RecorderError('EVENT_TOO_LARGE');
  }
  try {
    const event = JSON.parse(input);
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

function ledgerPath(realWorkspaceRoot, sessionId) {
  const grokDirectory = join(realWorkspaceRoot, '.grok');
  const productDirectory = join(grokDirectory, 'litgrok');
  const ledgerDirectory = join(productDirectory, 'session-ledger');
  for (const path of [grokDirectory, productDirectory, ledgerDirectory]) ensureDirectory(path);
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

function validateExistingLedger(path, sessionId) {
  if (!existsSync(path)) return;
  const status = lstatSync(path);
  if (!status.isFile() || status.isSymbolicLink() || status.size > MAX_LEDGER_BYTES) {
    throw new RecorderError('LEDGER_FILE_UNSAFE');
  }
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    try {
      const record = JSON.parse(line);
      if (record.schema !== RECORD_SCHEMA || record.sessionId !== sessionId) throw new Error();
    } catch {
      throw new RecorderError('LEDGER_IDENTITY_MISMATCH');
    }
  }
}

function toolRecord(event, expectedEvent) {
  if (!TOOL_EVENTS.has(expectedEvent)) return undefined;
  const name = requireString(event.toolName, 'TOOL_NAME_MISSING');
  if (!Object.hasOwn(event, 'toolInput')) throw new RecorderError('TOOL_INPUT_MISSING');
  return {
    name,
    inputSha256: createHash('sha256').update(JSON.stringify(event.toolInput)).digest('hex'),
  };
}

function appendRecord(path, record) {
  validateExistingLedger(path, record.sessionId);
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const descriptor = openSync(
    path,
    constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | noFollow,
    0o600,
  );
  try {
    if (!fstatSync(descriptor).isFile()) throw new RecorderError('LEDGER_FILE_UNSAFE');
    writeSync(descriptor, `${JSON.stringify(record)}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
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
    const discipline = expectedEvent === 'UserPromptSubmit' && typeof event.prompt === 'string'
      && /(?:^|[\s/])lit-plan(?:$|[^\w-])/iu.test(event.prompt) ? 'lit-plan' : null;
    const hudDiscipline = expectedEvent === 'UserPromptSubmit' ? hudDisciplineFromPrompt(event.prompt) : null;
    if (discipline !== null) record.discipline = discipline;
    if (expectedEvent === 'Stop') record.signal = 'turn-ended';
    const ledgerFile = environment.sessionId === null ? null : ledgerPath(environment.realWorkspaceRoot, environment.sessionId);
    if (ledgerFile !== null) appendRecord(ledgerFile, record);
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
