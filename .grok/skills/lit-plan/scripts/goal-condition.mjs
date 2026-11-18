// goal-condition.mjs: a plan's `## Done when` block, compiled into one checkable goal condition.
//
// lit-plan's goal-propose.mjs and the package hooks share this module. Everything is data in, data out,
// except `falsify`, which runs the plan's own check once, time-boxed, with no shell. The state lives under
// `<project>/.grok/litgrok/goal/`:
//
//   consent.json  written by goal-propose.mjs: the plan, the condition (or why there is none), the hash
//   owner.json    written by the UserPromptSubmit hook after the user typed exactly yes: start-work
//                 started on the plan, and the goal armed when there is one
//   answer.json   the one status line for that yes, which the model prints as written
//
// Grok Build has a native `/goal`, but only the user can type it: no hook or skill can issue a slash
// command. So LitGrok never sets or clears a Grok goal. It arms its own record, hands the user the exact
// `/goal` line to paste, and the Stop hook runs the same check at turn end as an advisory driver.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const GOAL_DIR = ['.grok', 'litgrok', 'goal'];
export const GOAL_MAX_CHARS = 500;
export const CONSENT_TTL_MS = 30 * 60 * 1000;
export const FALSIFY_TIMEOUT_MS = 120_000;

// The fixed status lines. The model prints them as written; nothing else announces a goal.
export const GOAL_STATUS = Object.freeze({
  asked: (condition) => `Approve plan, start work and set goal: /goal ${condition}? (yes / edit / no)`,
  askedStart: 'Approve plan and start work? (yes / no)',
  skipped: (reason) => `No goal set: ${reason}`,
  started: (plan, id, condition) => `Plan approved; start-work is running ${plan}. LitGrok goal armed [lit:${id}]. Grok Build takes /goal only from you; paste: /goal ${condition}`,
  startedNoGoal: (plan, reason) => `Plan approved; start-work is running ${plan}. No goal set: ${reason}`,
  refused: (why) => `Not started, no goal set: ${why}`,
  yours: 'Your own goal is active; LitGrok left it alone.',
  notConfirmed: (plan) => `Not started: the approval was not recorded. Type /start-work ${plan} to run it.`,
  met: (id) => `Goal met and cleared [lit:${id}]`,
  cleared: (id, why) => `LitGrok goal cleared (${why}) [lit:${id}]`,
});

const JUDGMENT_WORDS = [
  /\bworks?\b/iu, /\bworking\b/iu, /\blooks? (?:good|fine|right|ok|okay|great)\b/iu, /\bseems?\b/iu, /\bproperly\b/iu,
  /\bcorrectly\b/iu, /\bclean(?:ly)?\b/iu, /\bas expected\b/iu, /\bgood enough\b/iu, /\bshould (?:work|pass)\b/iu,
  /잘\s*(?:동작|작동|돌아|된다|되면|돼)/u, /괜찮/u, /깔끔/u, /제대로/u, /문제\s*없/u, /완벽/u,
];
// Success that is only an outward act proves nothing about the work and cannot be taken back.
const OUTWARD_ONLY = /^\s*(?:git\s+(?:push|tag)|(?:npm|pnpm|yarn)\s+publish|gh\s+(?:release|pr\s+merge))\b/iu;
// The commands a dry run may start. Anything else is refused before it runs.
const CHECK_ALLOWLIST = [
  /^npm (?:test|run [\w:.-]+)(?: --[\w-]+)*$/u,
  /^node --test(?: [\w./*-]+)*$/u,
  /^node [\w./-]+\.m?js(?: [\w./=-]+)*$/u,
  /^(?:pnpm|yarn) (?:test|run [\w:.-]+)$/u,
  /^(?:pytest|python3? -m pytest)(?: [\w./:-]+)*$/u,
  /^cargo test(?: [\w-]+)*$/u,
  /^go test(?: [\w./-]+)*$/u,
  /^make (?:test|check|verify)$/u,
  /^(?:bash|sh) scripts\/[\w./-]+\.sh$/u,
];
const ROW = /^- \[([ xX])\] (?:\d+|F\d+)\. .+$/u;

export const conditionHash = (condition) => createHash('sha256').update(String(condition)).digest('hex').slice(0, 16);
export const goalId = (plan, check) => createHash('sha256').update(`${plan}\u0000${check}`).digest('hex').slice(0, 8);

/** Column-zero task rows outside fences, each with its tick. */
export function planRows(text) {
  const rows = [];
  let fence = null;
  for (const line of String(text ?? '').split(/\r?\n/u)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const match = ROW.exec(line);
    if (match) rows.push({ checked: match[1] !== ' ' });
  }
  return rows;
}

/** The `## Done when` block: one `check: \`<command>\`` line. */
export function parseDoneWhen(planText) {
  const lines = String(planText ?? '').split(/\r?\n/u);
  const start = lines.findIndex((line) => /^##\s+Done when\s*$/iu.test(line));
  if (start === -1) return { ok: false, reason: 'the plan has no `## Done when` block' };
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/u.test(line)) break;
    const match = /^\s*(?:[-*]\s+)?check:\s*`([^`\n]+)`\s*$/u.exec(line);
    if (!match) continue;
    const check = match[1].trim();
    if (/<[^>]*>/u.test(check)) return { ok: false, reason: 'the `## Done when` check is still a placeholder' };
    return { ok: true, check };
  }
  return { ok: false, reason: 'the `## Done when` block names no `check:` command' };
}

/** `Every row in plans/<f>.md is ticked and \`<cmd>\` exits 0 [lit:<id>]`, or why it cannot be built. */
export function compileCondition({ plan, check }) {
  const id = goalId(plan, check);
  const condition = `Every row in ${plan} is ticked and \`${check}\` exits 0 [lit:${id}]`;
  if (condition.length > GOAL_MAX_CHARS) return { ok: false, reason: `the condition is over ${GOAL_MAX_CHARS} characters; point the check at one script` };
  return { ok: true, condition, id };
}

/** Judgment words, outward-only success, a command off the allowlist and an over-long condition all fail. */
export function lintCondition(condition, check) {
  const reasons = [];
  if (String(condition).length > GOAL_MAX_CHARS) reasons.push(`over ${GOAL_MAX_CHARS} characters`);
  const words = JUDGMENT_WORDS.filter((pattern) => pattern.test(String(check))).map((pattern) => String(check).match(pattern)[0]);
  if (words.length) reasons.push(`judgment words cannot be checked (${words.join(', ')})`);
  if (OUTWARD_ONLY.test(String(check))) reasons.push('a push, publish or release is not a check of the work');
  else if (!CHECK_ALLOWLIST.some((pattern) => pattern.test(String(check)))) reasons.push(`\`${check}\` is not an allowlisted test command`);
  return { ok: reasons.length === 0, reasons };
}

/**
 * The falsifier: a goal that is already true would be met on its first check, so the condition must be
 * false now. Unticked rows already make it false, but the check still runs once so a command that hangs
 * or cannot start is caught before it becomes a goal.
 */
export function falsify({ cwd, plan, planText, check, timeoutMs = FALSIFY_TIMEOUT_MS, run = spawnSync }) {
  const open = planRows(planText).filter((row) => !row.checked).length;
  const [command, ...args] = check.split(/\s+/u);
  const result = run(command, args, { cwd, encoding: 'utf8', timeout: timeoutMs, stdio: ['ignore', 'ignore', 'ignore'], shell: false });
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') return { ok: false, reason: `\`${check}\` did not finish within ${Math.round(timeoutMs / 1000)} s` };
  // A check script that the plan itself creates does not exist until the work runs: false now, not broken.
  const plannedScript = ['bash', 'sh'].includes(command) && args.length === 1 && String(planText).includes(`${args[0]}`) && open > 0;
  if (result.error || (result.status === 127 && !plannedScript)) return { ok: false, reason: `\`${check}\` cannot run here` };
  if (result.status === 0 && open === 0) return { ok: false, reason: `the goal is already true (${plan} is all ticked and \`${check}\` exits 0)` };
  return { ok: true, open, exit: result.status };
}

/** The user's whole prompt as a consent answer: exactly yes, edit or no, in any case. */
export function consentAnswer(prompt) {
  const text = String(prompt ?? '').trim().toLowerCase();
  return ['yes', 'edit', 'no'].includes(text) ? text : null;
}

/** What a consent or owner hash covers: the goal condition, or the plan alone when no goal could be set. */
export function consentKey(record) {
  if (record && typeof record.condition === 'string') return record.condition;
  return record && typeof record.plan === 'string' ? `start ${record.plan}` : null;
}

/** The consent record is intact, fresh, and the one being answered. */
export function consentIsLive(consent, now) {
  const key = consentKey(consent);
  return Boolean(key && typeof consent.plan === 'string'
    && consent.hash === conditionHash(key) && Number.isFinite(Date.parse(consent.askedAt))
    && now - Date.parse(consent.askedAt) <= CONSENT_TTL_MS);
}
