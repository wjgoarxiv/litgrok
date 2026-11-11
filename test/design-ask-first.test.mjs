import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Addendum D (2026-10-26 afternoon): every design skill asks the user to choose the
// theme/preset first with the host's question tool — LitGrok: a numbered choice in the
// reply, recommended option first — and skips only when the prompt names it or says
// "you choose". The step must be present in SKILL.md and ordered before the build step.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = (id) => readFileSync(join(root, '.grok/skills', id, 'SKILL.md'), 'utf8');

test('lit-pptx asks for the tonality choice before building', () => {
  const text = skill('lit-pptx');
  const ask = /ask[^.\n]*choice[^.\n]*tonality|numbered choice[^.\n]*tonality/i;
  assert.match(text, ask, 'SKILL.md names the ask-first tonality choice');
  assert.match(text, /recommended first/i, 'the recommended tonality comes first');
  const askAt = text.search(ask);
  const buildAt = text.indexOf('Put `tonality:');
  assert.ok(askAt !== -1 && buildAt !== -1 && askAt < buildAt, 'the choice step precedes the frontmatter build step');
  assert.match(text, /skip[^.\n]*(names|you choose)/i, 'skip only when the prompt names it or says you choose');
});

test('lit-schematic asks for the palette choice before building', () => {
  const text = skill('lit-schematic');
  const ask = /ask[^.\n]*choice[^.\n]*palette|numbered choice[^.\n]*palette/i;
  assert.match(text, ask, 'SKILL.md names the ask-first palette choice');
  assert.match(text, /recommended first/i, 'the recommended palette comes first');
  const askAt = text.search(ask);
  const buildAt = text.indexOf('**Truth first.**');
  assert.ok(askAt !== -1 && buildAt !== -1 && askAt < buildAt, 'the choice step precedes the truth-first build step');
  assert.match(text, /skip[^.\n]*(names|you choose)/i, 'skip only when the prompt names it or says you choose');
});

test('lit-diagram-drawer asks for the type choice before drafting', () => {
  const text = skill('lit-diagram-drawer');
  assert.match(text, /### Choose the design first/u, 'SKILL.md has the design step');
  const askAt = text.indexOf('### Choose the design first');
  const buildAt = text.indexOf('1. **Choose a type.**');
  assert.ok(askAt !== -1 && buildAt !== -1 && askAt < buildAt, 'the choice step precedes the type step');
  assert.match(text, /recommended/i, 'a recommended option is marked');
  assert.match(text, /skip[^.\n]*(names|you choose)/i, 'skip only when the prompt names it or says you choose');
});

