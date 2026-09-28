#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('..', import.meta.url));
if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Usage: generate-lit-mark.mjs [--check]');
const check = process.argv.includes('--check');
const fixture = readFileSync(join(root, 'test/fixtures/lit-mark/ignition-b.json'));
if (createHash('sha256').update(fixture).digest('hex') !== 'e7f3e2be168bedc5c15836d105ffed570f3bfd8745522502293de8718f503aec') throw new Error('LIT_MARK_SOURCE_CHANGED');
const variants = JSON.parse(fixture);
const palette = { '#FF6337': 'O', '#D7F75B': 'L', '#F2EFDF': 'I' };
for (const [name, width, height] of [['standard', 22, 10], ['banner', 44, 20], ['micro', 16, 5]]) {
  if (variants[name]?.length !== height) throw new Error(`LIT_MARK_HEIGHT: ${name}`);
  for (const row of variants[name]) {
    if (row.text.length !== width || row.colors.length !== width || !/^[█▀▄▌▐▖▗▘▝▙▛▜▟▚▞ ]*$/u.test(row.text)) throw new Error(`LIT_MARK_ROWS: ${name}`);
    if (row.colors.some((color, index) => row.text[index] === ' ' ? color !== null : !Object.hasOwn(palette, color))) throw new Error(`LIT_MARK_COLORS: ${name}`);
  }
}
function update(path, transform) {
  const target = join(root, path); const source = readFileSync(target, 'utf8'); const next = transform(source);
  if (source === next) return;
  if (check) throw new Error(`LIT_MARK_STALE: ${path}`);
  writeFileSync(target, next);
}
const arrays = Object.fromEntries(Object.entries(variants).map(([name, rows]) => [name, rows.map((row) => row.text)]));
const displayedRows = [...arrays.banner.map((row) => row.trimEnd()), '', 'grok'];
const vector = readFileSync(join(root, 'docs/assets/readme/ascii-readme.svg'), 'utf8');
if (createHash('sha256').update(vector).digest('hex') !== '045cf463570953c300e6c34ea89c674e0d0a47d8cf2a3b643fc887d9cc517f22') throw new Error('LIT_MARK_README_VECTOR_CHANGED');
if (JSON.stringify([...vector.matchAll(/<g aria-label="([^"]*)">/gu)].map((match) => match[1])) !== JSON.stringify(displayedRows)) throw new Error('LIT_MARK_README_VECTOR_ROWS');
const generatedRows = Object.entries(arrays).map(([name, rows]) => `export const ${name} = Object.freeze(${JSON.stringify(rows, null, 2)});`).join('\n\n');
const generatedColors = Object.entries(variants).map(([name, rows]) => `  ${name}: Object.freeze(${JSON.stringify(rows.map((row) => row.colors.map((color) => palette[color] ?? '.').join('')), null, 2).replaceAll('\n', '\n  ')}),`).join('\n');
const generated = `${generatedRows}\n\nconst COLOR_KEYS = Object.freeze({\n${generatedColors}\n});`;
update('.grok/hooks/lit-mark.mjs', (source) => {
  const region = /\/\/ BEGIN CANONICAL ROWS\n[\s\S]*?\/\/ END CANONICAL ROWS/u;
  if (!region.test(source)) throw new Error('LIT_MARK_GENERATED_REGION_MISSING');
  return source.replace(region, `// BEGIN CANONICAL ROWS\n${generated}\n// END CANONICAL ROWS`);
});
for (const readme of ['README.md', 'README_ko-KR.md']) update(readme, (source) => {
  const hero = /(<details>\n<summary>[^\n]+<\/summary>\n\n)```text\n[\s\S]*?\n```(\n\n<\/details>)/gu;
  if ([...source.matchAll(hero)].length !== 1) throw new Error(`LIT_MARK_HERO_MISSING: ${readme}`);
  return source.replace(hero, (_match, opening, closing) => `${opening}\x60\x60\x60text\n${displayedRows.join('\n')}\n\x60\x60\x60${closing}`);
});
process.stdout.write('LIT_MARK_GENERATED: standard=22x10 banner=44x20 micro=16x5 readmes=2\n');
