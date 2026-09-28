import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const GROK_ROOT = join(PRODUCT_ROOT, '.grok');

function filesBelow(root) {
  if (!existsSync(root)) return [];
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesBelow(path));
    if (entry.isFile()) files.push(path);
  }
  return files;
}

function isManifestPinnedMirror(filePath) {
  const skillsRoot = join(GROK_ROOT, 'skills');
  const relativeSkillPath = relative(skillsRoot, filePath);
  const [skillName, firstSegment] = relativeSkillPath.split(sep);
  if (!skillName || firstSegment !== 'references') return false;

  const referencesRoot = join(skillsRoot, skillName, 'references');
  const manifestPath = join(referencesRoot, '_canonical-corpus', 'manifest.json');
  if (filePath === manifestPath) return true;
  if (!existsSync(manifestPath)) return false;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return false;
  }

  const referencePath = relative(referencesRoot, filePath).split(sep).join('/');
  return [manifest.files, manifest.legal].some((entries) =>
    Array.isArray(entries) && entries.some((entry) => entry && entry.path === referencePath),
  );
}

test('ships only the pinned custom agent definitions', () => {
  const agentsRoot = join(GROK_ROOT, 'agents');
  const agentFiles = filesBelow(agentsRoot).map((filePath) => relative(GROK_ROOT, filePath)).sort();
  assert.deepEqual(agentFiles, [
    'agents/litgrok-executor.md',
    'agents/litgrok-korean-prose-editor.md',
    'agents/litgrok-korean-style-analyzer.md',
    'agents/litgrok-librarian-researcher.md',
    'agents/litgrok-meaning-preservation-auditor.md',
    'agents/litgrok-native-flow-reviewer.md',
    'agents/litgrok-verifier.md',
    'agents/litgrok-polish-orchestrator.md',
    'agents/litgrok-planner.md',
    'agents/litgrok-qa-runner.md',
    'agents/litgrok-quality-reviewer.md',
  ].sort());

  const packageJson = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'package.json'), 'utf8'));
  assert.equal(packageJson.files.includes('.grok/agents'), true);
});

test('ships no plugin-supplied LSP server configuration', () => {
  const files = filesBelow(GROK_ROOT);
  const prohibitedPaths = files
    .map((filePath) => relative(GROK_ROOT, filePath))
    .filter((path) => /^(?:plugins|lsp)(?:\/|$)/i.test(path) || /(?:^|\/)lsp\.(?:json|toml|ya?ml)$/i.test(path));
  assert.deepEqual(prohibitedPaths, [], `undocumented LSP configuration found: ${prohibitedPaths.join(', ')}`);

  const configPath = join(GROK_ROOT, 'config.toml');
  if (existsSync(configPath)) {
    assert.doesNotMatch(readFileSync(configPath, 'utf8'), /^\s*\[(?:lsp|lsp_servers)(?:[.\]])/im);
  }
});

test('shipped prose stays Grok-native', () => {
  const proseFiles = filesBelow(GROK_ROOT).filter((filePath) => /\.(?:md|json|toml|mjs|sh)$/i.test(filePath));
  for (const filePath of proseFiles) {
    if (isManifestPinnedMirror(filePath)) continue;
    assert.doesNotMatch(readFileSync(filePath, 'utf8'), /Claude Code|Codex|OpenCode/i, relative(PRODUCT_ROOT, filePath));
  }
});
