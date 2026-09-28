import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const MAX_TEXT = 2_000;
const URL_PATTERN = /\b(?:https?|ftp|file|javascript|data):[^\s<>"']+/gi;
const ACTIVE_PATTERN = /<\s*(?:script|iframe|object|embed)\b|\bon[a-z]+\s*=/i;

export class ImportFailure extends Error {}

export function reject(message) {
  throw new ImportFailure(message);
}

export function readBounded(path, maxBytes, label) {
  let data;
  try {
    data = readFileSync(path);
  } catch (error) {
    reject('cannot read input: ' + (error instanceof Error ? error.message : String(error)));
  }
  if (data.byteLength > maxBytes) reject('input exceeds the ' + label + ' limit');
  return data;
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

export function safeId(raw, used, label = 'element') {
  if (!raw) reject('diagram contains an element without an id');
  const candidate = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(raw)
    ? raw
    : 'n-' + sha256(Buffer.from(raw)).slice(0, 16);
  if (used.has(candidate)) reject(label + ' contains duplicate or colliding ids');
  used.add(candidate);
  return candidate;
}

export function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity) => {
    const key = entity.toLowerCase();
    if (key === 'amp') return '&';
    if (key === 'lt') return '<';
    if (key === 'gt') return '>';
    if (key === 'quot') return '"';
    if (key === 'apos') return "'";
    const hex = key.startsWith('#x');
    const point = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isInteger(point) || point < 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) reject('invalid character reference');
    return String.fromCodePoint(point);
  });
}

export function cleanLabel(raw, { html = false, breaks = false } = {}) {
  const decoded = decodeEntities(String(raw));
  if (ACTIVE_PATTERN.test(decoded)) reject('executable markup or event attributes in labels are unsupported');
  const urls = [...decoded.matchAll(URL_PATTERN)].length;
  let text = decoded.replace(URL_PATTERN, '').replace(/\u00a0/g, ' ');
  if (breaks) text = text.replace(/<br\s*\/?>|<\/(?:p|div)\s*>/gi, '\n');
  if (html) text = text.replace(/<[^>]*>/g, '');
  text = text.replace(/\r\n?/g, '\n');
  const lines = text.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
  return { text: lines.join('\n').slice(0, MAX_TEXT), urls };
}

export function writeJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}
