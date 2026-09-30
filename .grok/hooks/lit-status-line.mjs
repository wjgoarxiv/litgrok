#!/usr/bin/env node

import { isAbsolute } from 'node:path';
import { resolveAutoHandoff } from './auto-handoff.mjs';
import { readHudRecordForCwd, writeContextRecord } from './litgrok-hud-state.mjs';

const MAX_INPUT_BYTES = 64 * 1024;
const GRADIENT_STOPS = [[255, 99, 55], [255, 45, 149], [0, 229, 255]];

async function readInput() {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > MAX_INPUT_BYTES) return null;
  }
  try {
    const value = JSON.parse(input);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function plainText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return cleaned || fallback;
}

function contextPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '?';
  return String(Math.round(Math.max(0, Math.min(100, value))));
}

function cellWidth(character) {
  if (/\p{Mark}/u.test(character) || character === '\u200d') return 0;
  return /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u.test(character) ? 2 : 1;
}

function width(text) {
  return [...text].reduce((total, character) => total + cellWidth(character), 0);
}

function clipCells(text, maximum) {
  let result = '';
  let used = 0;
  let truncated = false;
  for (const character of text) {
    const cells = cellWidth(character);
    if (used + cells > maximum || result.length + character.length > 78) {
      truncated = true;
      break;
    }
    result += character;
    used += cells;
  }
  if (truncated && maximum > 0) {
    while (result && (width(result) + 1 > maximum || result.length >= 78)) result = [...result].slice(0, -1).join('');
    result += '…';
  }
  return result;
}

function gradientColor(position) {
  const stop = position <= 0.5 ? 0 : 1;
  const fraction = position <= 0.5 ? position * 2 : (position - 0.5) * 2;
  return GRADIENT_STOPS[stop].map((value, index) => Math.round(value + (GRADIENT_STOPS[stop + 1][index] - value) * fraction));
}

function paintLabel(text) {
  const characters = [...text];
  return characters.map((character, index) => {
    if (character === ' ') return character;
    const position = characters.length === 1 ? 0 : index / (characters.length - 1);
    return `\u001b[1m\u001b[38;2;${gradientColor(position).join(';')}m${character}\u001b[0m`;
  }).join('');
}

function formatRow(discipline, model, context, color) {
  if (discipline) {
    const prefix = '🔥 LIT IGNITED · ';
    const maxDisciplineCells = discipline === 'lit-scientific-visualization' ? 32 : 24;
    const disciplineText = clipCells(discipline, maxDisciplineCells);
    const label = `LIT IGNITED · ${disciplineText}`;
    const middle = ` ${disciplineText} 🔥 │ `;
    const suffix = ` │ ctx ${context}%`;
    const modelText = clipCells(model, Math.max(0, 79 - width(prefix + middle + suffix)));
    return `🔥 ${color ? paintLabel(label) : label} 🔥 │ ${modelText}${suffix}`;
  }
  const prefix = 'LIT · grok │ ';
  const suffix = ` │ ctx ${context}%`;
  const modelText = clipCells(model, Math.max(0, 79 - width(prefix + suffix)));
  const row = `${prefix}${modelText}${suffix}`;
  return color ? `\u001b[1m\u001b[38;2;255;99;55m${row}\u001b[0m` : row;
}

// Automatic handoff needs Grok's context percent, which only the status line receives. Nothing is
// written unless the user turned the feature on and Grok reported a percent.
function recordContextForHandoff(status) {
  const sessionId = status?.session_id;
  const percent = status?.context_window?.used_percentage;
  if (typeof sessionId !== 'string' || sessionId === '' || typeof percent !== 'number' || !Number.isFinite(percent)) return;
  if (typeof status.cwd !== 'string' || !isAbsolute(status.cwd)) return;
  const dirs = [status.workspace?.repo_root, status.workspace?.current_dir, status.cwd];
  if (!resolveAutoHandoff({ env: process.env, dirs }).active) return;
  writeContextRecord({
    env: process.env,
    sessionId,
    cwd: status.cwd,
    usedPercentage: percent,
    autoCompactThresholdPercent: status.context_window.auto_compact_threshold_percent,
  });
}

const input = await readInput();
try {
  recordContextForHandoff(input);
} catch {
  // The row must always render; a failed record only means this refresh adds nothing for the handoff.
}
const cwd = typeof input?.cwd === 'string' ? input.cwd : '';
let record = null;
try {
  record = readHudRecordForCwd(cwd);
} catch {
  record = null;
}
const discipline = record?.discipline ?? null;
const model = plainText(input?.model?.display_name, 'grok');
const context = contextPercent(input?.context_window?.used_percentage);
const color = process.env.LITGROK_HUD_COLOR !== '0' && !Object.hasOwn(process.env, 'NO_COLOR');
const row = formatRow(discipline, model, context, color);
process.stdout.write(`${row}\n`);
