import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILL_ROOT = join(PRODUCT_ROOT, '.grok', 'skills', 'lit-scientific-visualization');
const CORPUS_ROOT = join(PRODUCT_ROOT, '.grok', 'vendor', 'scientific-visualization');
const VERIFIER = join(SKILL_ROOT, 'scripts', 'verify-canonical-corpus.mjs');
const EXPECTED_FILES = [
  'assets/color_palettes.py',
  'assets/nature.mplstyle',
  'assets/presentation.mplstyle',
  'assets/publication.mplstyle',
  'evals/evals.json',
  'references/color_palettes.md',
  'references/journal_requirements.md',
  'references/matplotlib_examples.md',
  'references/mdanalysis_martini_visualization.md',
  'references/publication_guidelines.md',
  'references/seaborn_for_publications.md',
  'scripts/figure_export.py',
  'scripts/style_presets.py',
  'tests/test_figure_export.py',
  'tests/test_style_presets.py',
];

function runVerifier(root = CORPUS_ROOT) {
  return spawnSync(process.execPath, [VERIFIER, '--root', root], { encoding: 'utf8' });
}

test('scientific corpus verifier accepts the complete Grok payload', () => {
  const result = runVerifier();
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /^PASS canonical-scientific-corpus files=15 bytes=114577 sha256=/u);
});

test('scientific corpus verifier fails closed when a style resource is changed', () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'litgrok-scientific-corpus-'));
  try {
    const copiedSkill = join(temporaryRoot, 'lit-scientific-visualization');
    cpSync(CORPUS_ROOT, copiedSkill, { recursive: true });
    appendFileSync(join(copiedSkill, 'assets', 'nature.mplstyle'), '\n# tampered\n');
    const result = runVerifier(copiedSkill);
    assert.equal(result.status, 1, result.stderr || result.error?.message);
    assert.match(`${result.stdout}${result.stderr}`, /FAIL/iu);
    assert.match(`${result.stdout}${result.stderr}`, /nature\.mplstyle/iu);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('adapter names every package-local resource and the load-bearing plotting rules', () => {
  const adapter = readFileSync(join(SKILL_ROOT, 'SKILL.md'), 'utf8');
  for (const file of EXPECTED_FILES) {
    if (file === 'evals/evals.json' || file.startsWith('tests/')) continue;
    const resourcePath = `../../vendor/scientific-visualization/${file}`;
    assert.match(adapter, new RegExp(resourcePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), resourcePath);
  }
  for (const required of [
    'verify-canonical-corpus.mjs',
    'rcparams()',
    'ensure_zero_origin_ticks()',
    'style_legend()',
    'layout="constrained"',
    'scatter-only',
    'save_publication_figure()',
    'save_for_journal()',
    'DPI must exceed 500',
  ]) assert.match(adapter, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), required);
  assert.doesNotMatch(adapter, /Claude Code|Codex|OpenCode/iu);
});
