import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const PRODUCT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const AGENTS_ROOT = join(PRODUCT_ROOT, '.grok', 'agents');

const EXPECTED_AGENTS = {
  'litgrok-executor.md': ['start-work', 'lit-code'],
  'litgrok-korean-prose-editor.md': ['lit-humanizer', 'rules'],
  'litgrok-korean-style-analyzer.md': ['lit-humanizer', 'rules'],
  'litgrok-librarian-researcher.md': ['litresearch', 'rules'],
  'litgrok-meaning-preservation-auditor.md': ['lit-humanizer', 'review-work', 'rules'],
  'litgrok-native-flow-reviewer.md': ['lit-humanizer', 'review-work', 'rules'],
  'litgrok-verifier.md': ['review-work', 'visual-qa', 'rules'],
  'litgrok-polish-orchestrator.md': ['lit-humanizer', 'review-work', 'rules'],
  'litgrok-planner.md': ['lit-plan', 'rules'],
  'litgrok-qa-runner.md': ['start-work', 'review-work'],
  'litgrok-quality-reviewer.md': ['review-work', 'lit-code', 'visual-qa'],
};

function parseFrontmatter(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(match, 'agent must start with YAML frontmatter');
  const fields = {};
  let activeList;
  for (const line of match[1].split('\n')) {
    const scalar = line.match(/^([a-z_]+):\s*(.*)$/);
    if (scalar) {
      activeList = undefined;
      fields[scalar[1]] = scalar[2].replace(/^['"]|['"]$/g, '');
      continue;
    }
    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem) {
      if (!activeList) {
        activeList = [];
        fields.skills = activeList;
      }
      activeList.push(listItem[1].replace(/^['"]|['"]$/g, ''));
    }
  }
  return { fields, body: source.slice(match[0].length) };
}

test('ships the pinned Grok-native agent inventory and skill bindings', () => {
  assert.ok(existsSync(AGENTS_ROOT), 'the packaged agent directory must exist');
  const files = readdirSync(AGENTS_ROOT).filter((name) => name.endsWith('.md')).sort();
  assert.deepEqual(files, Object.keys(EXPECTED_AGENTS).sort());

  for (const [fileName, expectedSkills] of Object.entries(EXPECTED_AGENTS)) {
    const source = readFileSync(join(AGENTS_ROOT, fileName), 'utf8');
    const { fields, body } = parseFrontmatter(source);
    assert.match(fields.name, /^litgrok-[a-z0-9-]+$/);
    assert.ok(fields.description.length >= 24, `${fileName} needs a useful description`);
    assert.ok(['plan', 'default', 'acceptEdits'].includes(fields.permission_mode));
    assert.deepEqual(fields.skills, expectedSkills, `${fileName} skill bindings drifted`);
    assert.ok(body.trim().length >= 240, `${fileName} needs a substantive prompt`);
    assert.doesNotMatch(source, /Claude Code|Codex|OpenCode/i, fileName);
    for (const skill of fields.skills) {
      assert.ok(existsSync(join(PRODUCT_ROOT, '.grok', 'skills', skill, 'SKILL.md')), `${fileName} points at missing skill ${skill}`);
    }
  }
});
