import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS_ROOT = join(PRODUCT_ROOT, '.grok', 'skills');

const CORPORA = {
  autoresearch: [
    'assets/report_template.md',
    'assets/research_template.md',
    'assets/results_template.tsv',
    'references/core-principles.md',
    'references/family-contract.md',
    'references/modes/core.md',
    'references/modes/core/evaluator-contract.md',
    'references/modes/core/stuck-detection.md',
    'references/modes/debug.md',
    'references/modes/debug/investigation-techniques.md',
    'references/modes/fix.md',
    'references/modes/learn.md',
    'references/modes/plan.md',
    'references/modes/predict.md',
    'references/modes/predict/persona-templates.md',
    'references/modes/reason.md',
    'references/modes/scenario.md',
    'references/modes/scenario/dimensions.md',
    'references/modes/security.md',
    'references/modes/security/owasp-checklist.md',
    'references/modes/security/stride-model.md',
    'references/modes/ship.md',
    'references/modes/ship/type-checklists.md',
    'references/results-logging.md',
    'references/visualization-guide.md',
    'scripts/init_research.py',
    'scripts/style_presets.py',
  ],
  autoconference: [
    'assets/conference_template.md',
    'assets/report_template.md',
    'assets/synthesis_template.md',
    'references/agent-prompts.md',
    'references/conference-protocol.md',
    'references/core-principles.md',
    'references/family-contract.md',
    'references/modes/analyze.md',
    'references/modes/core.md',
    'references/modes/core/convergence-guide.md',
    'references/modes/core/crash-recovery.md',
    'references/modes/debate.md',
    'references/modes/plan.md',
    'references/modes/resume.md',
    'references/modes/ship.md',
    'references/modes/survey.md',
    'references/results-logging.md',
    'references/visualization-guide.md',
    'scripts/init_conference.py',
    'templates/code-performance.md',
    'templates/debate-mode.md',
    'templates/prompt-optimization.md',
    'templates/quick-conference.md',
    'templates/research-synthesis.md',
    'templates/survey-mode.md',
  ],
};

function escapeRegex(value) {
  return value.replace(/[\\^$.*+?()[\\]{}|]/g, '\\$&');
}

function skillRoot(skill) {
  return join(SKILLS_ROOT, skill);
}

function runVerifier(skill, root = skillRoot(skill)) {
  const verifier = join(skillRoot(skill), 'scripts', 'verify-canonical-corpus.mjs');
  return spawnSync(process.execPath, [verifier, '--root', root], {
    cwd: PRODUCT_ROOT,
    encoding: 'utf8',
  });
}

function temporaryCopy(skill) {
  const root = mkdtempSync(join(tmpdir(), 'litgrok-' + skill + '-corpus-'));
  const copy = join(root, skill);
  cpSync(skillRoot(skill), copy, { recursive: true });
  test.after(() => rmSync(root, { recursive: true, force: true }));
  return copy;
}

for (const skill of Object.keys(CORPORA)) {
  test(skill + ' verifier accepts the complete packaged corpus', () => {
    const result = runVerifier(skill);
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.match(result.stdout, new RegExp('^PASS canonical-' + skill + '-corpus files=\\d+ bytes=\\d+ sha256='));
  });

  test(skill + ' adapter names every packaged resource in Grok terms', () => {
    const entry = readFileSync(join(skillRoot(skill), 'SKILL.md'), 'utf8');
    for (const file of CORPORA[skill]) {
      assert.match(entry, new RegExp(escapeRegex(file)), skill + ' adapter must name ' + file);
    }
    assert.match(entry, /static documentation for Grok Build/i);
    assert.doesNotMatch(entry, /Claude Code|Codex CLI|OpenCode|CODEX_HOME|\\$litcodex/iu);
  });

  test(skill + ' verifier names a missing corpus resource', () => {
    const copy = temporaryCopy(skill);
    const missing = join(copy, CORPORA[skill][0]);
    unlinkSync(missing);
    const result = runVerifier(skill, copy);
    assert.equal(result.status, 1, result.stderr || result.error?.message);
    assert.match(result.stdout + '\\n' + result.stderr, new RegExp(escapeRegex(CORPORA[skill][0])));
  });
}
