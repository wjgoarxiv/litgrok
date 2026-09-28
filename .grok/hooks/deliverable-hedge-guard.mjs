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

function changedText(input) {
  const before = field(input, OLD_KEY);
  const after = field(input, /^new_?string$/i);
  if (before !== undefined && after !== undefined) {
    let start = 0;
    while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
    let endBefore = before.length;
    let endAfter = after.length;
    while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) { endBefore -= 1; endAfter -= 1; }
    return after.slice(start, endAfter);
  }
  const leaves = stringLeaves(input).filter(({ key }) => CONTENT_KEY.test(key) && !OLD_KEY.test(key));
  const patch = leaves.find(({ key }) => /^patch$/i.test(key))?.value;
  if (patch) return patch.split(/\r?\n/).filter((line) => /^\+(?!\+\+)/.test(line)).map((line) => line.slice(1)).join('\n');
  return leaves.map(({ value }) => value).join('\n');
}

function readerFacing(file) {
  return READER_EXTENSIONS.has(extname(file).toLowerCase()) || READER_BASENAMES.test(basename(file));
}

function removeQuotedPrompt(text, event) {
  for (const { key, value } of stringLeaves(event).filter(({ key }) => PROMPT_KEY.test(key))) {
    if (value.length > 0) text = text.split(value).join(' ');
  }
  return text;
}

function writeTarget(event) {
  const file = field(event.toolInput, PATH_KEY);
  if (!file || file.includes('\n') || !readerFacing(file)) return null;
  const text = removeQuotedPrompt(changedText(event.toolInput), event);
  return text.trim() ? { file, text } : null;
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
  let input = '';
  let oversized = false;
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > MAX_EVENT_BYTES) { input = ''; oversized = true; }
  }
  if (oversized) throw new Error('event exceeded the size limit; write left unchanged');
  try { return JSON.parse(input); } catch { throw new Error('event could not be parsed; write left unchanged'); }
}

try {
  const event = await readEvent();
  if (event?.hookEventName === 'PreToolUse') {
    const target = writeTarget(event);
    if (!target) allow();
    else {
      const findings = scanText(target.text, loadRules(), target.file);
      const finding = findings.find((item) => item.severity === 'block');
      if (!finding) {
        const warning = findings.find((item) => item.severity === 'warn');
        allow(warning ? `advisory ${warning.rule} in ${target.file}; review wording` : undefined);
      }
      else {
        process.stdout.write(`${JSON.stringify({ decision: 'deny', reason: `lit-humanizer ${blockNote(target.file, finding)}` })}\n`);
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
