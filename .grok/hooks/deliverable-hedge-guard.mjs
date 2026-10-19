#!/usr/bin/env node

// Host contract: PreToolUse exits 2 to deny. PostToolUse findings are advisory.
// Errors fail open and emit one visible line to stderr.
import { lstatSync, readFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRules, scanText } from '../skills/lit-humanizer/scripts/core.mjs';
import { extractTextForFile } from '../skills/lit-humanizer/scripts/extract.mjs';

const MAX_EVENT_BYTES = 1024 * 1024;
const RULES_PATH = fileURLToPath(new URL('../skills/lit-humanizer/rules.json', import.meta.url));
const READER_EXTENSIONS = new Set(['.adoc', '.asciidoc', '.htm', '.html', '.markdown', '.md', '.mdx', '.org', '.rst', '.rtf', '.tex', '.txt']);
const OFFICE_EXTENSIONS = new Set(['.docx', '.pptx', '.pdf']);
const PATH_KEY = /^(?:file_?path|filename|path|output_?path|artifact_?path)$/i;
const CONTENT_KEY = /^(?:content|new_?string|patch|replacement|text)$/i;
const OLD_KEY = /^(?:old_?string|old_?content)$/i;
const PROMPT_KEY = /^(?:user_?prompt|user_?message|prompt_?text)$/i;
const READER_BASENAMES = /^(?:authors|changelog|license|notice|readme)$/i;

const allow = (note) => {
  process.stdout.write('{"decision":"allow"}\n');
  if (note) process.stderr.write(`lit-humanizer: ${note}\n`);
};

function stringLeaves(value, key = '', depth = 0, leaves = []) {
  if (depth > 12) return leaves;
  if (typeof value === 'string') leaves.push({ key, value });
  else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) stringLeaves(child, childKey, depth + 1, leaves);
  }
  return leaves;
}

function field(value, pattern) {
  return stringLeaves(value).find(({ key }) => pattern.test(key))?.value;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;

// Line-level diff of an Edit: the 1-based lines of `after` that differ from `before`.
function changedLines(before, after, offset) {
  const old = before.split('\n');
  const next = after.split('\n');
  let head = 0;
  while (head < old.length && head < next.length && old[head] === next[head]) head += 1;
  let tail = 0;
  while (tail < old.length - head && tail < next.length - head && old[old.length - 1 - tail] === next[next.length - 1 - tail]) tail += 1;
  let first = head;
  let end = next.length - tail;
  // A pure deletion can join its two neighbours into one paragraph.
  if (end <= first) { first = Math.max(0, head - 1); end = Math.min(next.length, head + 1); }
  const lines = new Set();
  for (let index = first; index < end; index += 1) lines.add(offset + index + 1);
  return lines;
}

function readCurrent(file, cwd) {
  try {
    const target = resolve(cwd, file);
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
    return readFileSync(target, 'utf8');
  } catch { return null; }
}

// Rebuild what a patch's hunks show: context and added lines in order, a blank line at every
// hunk or file break, removed lines dropped. The added lines are the changed ones.
function patchView(patch) {
  const rows = [];
  const changed = new Set();
  const gap = () => { if (rows.length && rows[rows.length - 1] !== '') rows.push(''); };
  for (const line of patch.split(/\r?\n/)) {
    if (/^(?:\+\+\+|---) |^\*\*\*|^@@|^diff |^index /.test(line)) gap();
    else if (line.startsWith('+')) { rows.push(line.slice(1)); changed.add(rows.length); }
    else if (line.startsWith(' ')) rows.push(line.slice(1));
    else if (line === '') rows.push('');
    else if (!line.startsWith('-') && !line.startsWith('\\')) gap();
  }
  return { text: rows.join('\n'), changed };
}

// The text to scan and the 1-based lines of it that this write changes. An Edit is applied to the
// current file so fences, quotes and paragraph breaks keep their context; without a readable file
// the new_string is scanned whole with its own fence state.
function writeView(input, cwd) {
  const before = field(input, OLD_KEY);
  const after = field(input, /^new_?string$/i);
  if (before !== undefined && after !== undefined) {
    const file = field(input, PATH_KEY);
    const current = file && before ? readCurrent(file, cwd) : null;
    const at = current === null ? -1 : current.indexOf(before);
    if (at < 0) return { text: after, changed: changedLines(before, after, 0) };
    const text = current.slice(0, at) + after + current.slice(at + before.length);
    return { text, changed: changedLines(before, after, current.slice(0, at).split('\n').length - 1) };
  }
  const leaves = stringLeaves(input).filter(({ key }) => CONTENT_KEY.test(key) && !OLD_KEY.test(key));
  const patch = leaves.find(({ key }) => /^patch$/i.test(key))?.value;
  if (patch) return patchView(patch);
  // A Write over a readable file is judged on the lines it changes; a new file is judged whole.
  const text = leaves.map(({ value }) => value).join('\n');
  const file = field(input, PATH_KEY);
  const current = file ? readCurrent(file, cwd) : null;
  return { text, changed: current === null ? null : changedLines(current, text, 0) };
}

// The 1-based lines a finding covers. A counted rule reads a whole paragraph, so its finding covers it.
// A document-scope match covers the lines where it starts and ends (its first and last occurrence),
// not the lines between them.
function findingLines(finding, lines, counted, documentScope) {
  if (documentScope && !counted) return [...new Set([finding.line, finding.endLine ?? finding.line])];
  let first = finding.line;
  let last = finding.line;
  if (counted) {
    const prose = (number) => number >= 1 && number <= lines.length && lines[number - 1].trim() && !FENCE.test(lines[number - 1]);
    while (prose(first - 1)) first -= 1;
    while (prose(last + 1)) last += 1;
  }
  const covered = [];
  for (let number = first; number <= last; number += 1) covered.push(number);
  return covered;
}

function readerFacing(file) {
  return READER_EXTENSIONS.has(extname(file).toLowerCase()) || READER_BASENAMES.test(basename(file));
}

function removeQuotedPrompt(text, event) {
  for (const { key, value } of stringLeaves(event).filter(({ key }) => PROMPT_KEY.test(key))) {
    // Keep the line breaks so changed-line numbers still match.
    if (value.length > 0) text = text.split(value).join(value.replace(/[^\n]+/g, ' '));
  }
  return text;
}

function writeTarget(event) {
  const file = field(event.toolInput, PATH_KEY);
  if (!file || file.includes('\n') || !readerFacing(file)) return null;
  const view = writeView(event.toolInput, event.cwd || process.cwd());
  const text = removeQuotedPrompt(view.text, event);
  return text.trim() ? { file, text, changed: view.changed } : null;
}

function postTargets(event) {
  const candidates = [];
  const add = (value) => {
    if (typeof value === 'string' && OFFICE_EXTENSIONS.has(extname(value).toLowerCase())) candidates.push(value);
  };
  for (const source of [event.toolInput, event.toolResponse, event.toolOutput, event.result]) {
    for (const leaf of stringLeaves(source)) {
      if (PATH_KEY.test(leaf.key)) add(leaf.value);
      if (/^(?:command|cmd)$/i.test(leaf.key)) {
        const matcher = /(?:"([^"]+\.(?:docx|pptx|pdf))"|'([^']+\.(?:docx|pptx|pdf))'|(?:^|\s)([^\s"'`]+\.(?:docx|pptx|pdf))(?=$|\s))/gi;
        for (const match of leaf.value.matchAll(matcher)) add(match[1] ?? match[2] ?? match[3]);
      }
    }
  }
  return [...new Set(candidates)];
}

function blockNote(file, finding) {
  return `block-tier ${finding.rule} in ${file}; fix and rebuild before delivery`;
}

function loadRules() {
  return parseRules(readFileSync(RULES_PATH, 'utf8'));
}

async function readEvent() {
  // Decode once: a multi-byte character can straddle two pipe chunks.
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes <= MAX_EVENT_BYTES) chunks.push(chunk);
  }
  if (bytes > MAX_EVENT_BYTES) throw new Error('event exceeded the size limit; write left unchanged');
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('event could not be parsed; write left unchanged'); }
}

try {
  const event = await readEvent();
  if (event?.hookEventName === 'PreToolUse') {
    const target = writeTarget(event);
    if (!target) allow();
    else {
      const rules = loadRules();
      const lines = target.text.split('\n');
      const counted = new Set(rules.filter((rule) => rule.threshold !== undefined).map((rule) => rule.id));
      const documentScope = new Set(rules.filter((rule) => rule.scope === 'document').map((rule) => rule.id));
      const findings = scanText(target.text, rules, target.file).filter((item) => {
        if (!target.changed) return true;
        return findingLines(item, lines, counted.has(item.rule), documentScope.has(item.rule)).some((number) => target.changed.has(number));
      });
      const finding = findings.find((item) => item.severity === 'block');
      const advice = rules.find((rule) => rule.id === 'negation-cluster')?.message;
      if (!finding) {
        const warning = findings.find((item) => item.severity === 'warn');
        const message = advice && findings.some((item) => item.rule === 'negation-cluster');
        allow(warning ? `advisory ${warning.rule} in ${target.file}; review wording${message ? `: ${advice}` : ''}` : undefined);
      }
      else {
        // The deny reason carries the rewrite advice when a negation cluster is what blocks.
        const message = advice && findings.some((item) => item.rule === 'negation-cluster' && item.severity === 'block');
        const reason = `lit-humanizer ${blockNote(target.file, finding)}${message ? `: ${advice}` : ''}`;
        process.stdout.write(`${JSON.stringify({ decision: 'deny', reason })}\n`);
        // Grok Build reads the JSON reason; its first stderr line is the fallback reason on exit 2.
        process.stderr.write(`${reason.replace(/\s*\n\s*/g, ' ')}\n`);
        process.exitCode = 2;
      }
    }
  } else if (event?.hookEventName === 'PostToolUse') {
    const rules = loadRules();
    const notes = [];
    for (const file of postTargets(event)) {
      const target = resolve(event.cwd || process.cwd(), file);
      try {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('output is not a regular file');
        const findings = scanText(extractTextForFile(target), rules, target);
        const finding = findings.find((item) => item.severity === 'block') ?? findings.find((item) => item.severity === 'warn');
        if (finding) notes.push(finding.severity === 'block' ? blockNote(target, finding) : `advisory ${finding.rule} in ${target}; review before delivery`);
      } catch (error) {
        notes.push(`could not inspect ${target}; output left unchanged (${error instanceof Error ? error.message : String(error)})`);
      }
    }
    allow(notes[0]);
  } else allow();
} catch (error) {
  allow(error instanceof Error ? `${error.message}; fail-open` : 'guard failed; fail-open');
}
