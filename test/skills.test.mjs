import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const SKILLS_DIRECTORY = join(PRODUCT_ROOT, '.grok', 'skills');
const OUTPUT_CHANNELS = new Map([
  ['client_deliverable', 'reply'],
  ['audit_report', 'methodology_paragraph'],
  ['internal_analysis', new Set(['designated_section', 'reply'])],
  ['working_note', new Set(['inline', 'reply'])],
  ['no_artifact', 'reply'],
]);
const REFERENCE_CONTRACT_SKILLS = new Set(['frontend-ui-ux', 'visual-qa', 'readme-studio', 'lit-typographic-motion']);

function topLevelYamlValues(source, label) {
  const values = new Map();
  for (const [index, line] of source.split('\n').entries()) {
    if (line.trim() === '' || line.trimStart().startsWith('#') || /^\s/.test(line)) continue;
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/);
    assert.ok(match, `${label}:${index + 1} is not a supported top-level YAML field`);
    assert.ok(match[2], `${label}:${index + 1} must have a scalar value`);
    values.set(match[1], match[2]);
  }
  return values;
}

function unquote(value) {
  const match = value.match(/^(['"])(.*)\1$/);
  return match ? match[2] : value;
}

test('every packaged skill has valid Grok frontmatter and an output-channel contract', () => {
  const skillDirectories = readdirSync(SKILLS_DIRECTORY, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  assert.ok(skillDirectories.length > 0, 'expected at least one packaged skill');

  for (const directory of skillDirectories) {
    const filePath = join(SKILLS_DIRECTORY, directory.name, 'SKILL.md');
    const label = relative(PRODUCT_ROOT, filePath);
    const content = readFileSync(filePath, 'utf8');
    const frontmatter = content.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
    assert.ok(frontmatter, `${label} must start with YAML frontmatter`);

    const fields = topLevelYamlValues(frontmatter[1], `${label} frontmatter`);
    assert.equal(unquote(fields.get('name') ?? ''), directory.name, `${label} name must match its directory`);
    assert.ok(unquote(fields.get('description') ?? '').trim(), `${label} must have a description`);
    assert.equal(fields.get('user-invocable'), 'true', `${label} user-invocable must be the literal true`);

    const inlineContract = content.match(/## #contract\.output_channels\s*\n+```ya?ml\s*\n([\s\S]*?)\n```/i);
    if (REFERENCE_CONTRACT_SKILLS.has(directory.name)) {
      assert.equal(inlineContract, null, `${label} must keep its activation-budget contract out of SKILL.md`);
      assert.ok(Buffer.byteLength(content, 'utf8') <= 4096, `${label} must stay within the 4096-byte activation budget`);
    }
    const contractSource = REFERENCE_CONTRACT_SKILLS.has(directory.name)
      ? readFileSync(join(SKILLS_DIRECTORY, directory.name, 'references', 'complete-contract.md'), 'utf8')
      : content;
    const contract = contractSource.match(/## #contract\.output_channels\s*\n+```ya?ml\s*\n([\s\S]*?)\n```/i);
    assert.ok(contract, `${label} must have a YAML #contract.output_channels block`);
    const output = topLevelYamlValues(contract[1], `${label} output contract`);
    const genre = unquote(output.get('artifact_genre') ?? '');
    assert.ok(OUTPUT_CHANNELS.has(genre), `${label} has an invalid artifact_genre`);
    const expectedChannel = OUTPUT_CHANNELS.get(genre);
    const actualChannel = unquote(output.get('limitations_channel') ?? '');
    assert.ok(
      expectedChannel instanceof Set ? expectedChannel.has(actualChannel) : actualChannel === expectedChannel,
      `${label} limitations_channel must match its artifact_genre`,
    );
  }
});
