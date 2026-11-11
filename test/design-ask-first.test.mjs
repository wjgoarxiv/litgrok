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

