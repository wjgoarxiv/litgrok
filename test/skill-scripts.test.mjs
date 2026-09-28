import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const SKILLS_ROOT = join(PRODUCT_ROOT, '.grok', 'skills');

const SCRIPTS = [
  ['readme-studio', 'scripts/validate-facts.mjs'],
  ['rules', 'scripts/resolve-guidance.mjs'],
  ['lit-plan', 'scripts/validate-plan.mjs'],
  ['lit-plan', 'scripts/scaffold-plan.mjs'],
  ['visual-qa', 'scripts/verify-evidence-manifest.mjs'],
  ['review-work', 'scripts/check-lanes.mjs'],
  ['frontend-ui-ux', 'scripts/verify-canonical-corpus.mjs'],
  ['lit-scientific-visualization', 'scripts/verify-canonical-corpus.mjs'],
  ['lit-handoff', 'scripts/verify-canonical-corpus.mjs'],
  ['autoresearch', 'scripts/verify-canonical-corpus.mjs'],
  ['autoconference', 'scripts/verify-canonical-corpus.mjs'],
  ['frontend-ui-ux', 'scripts/validate-design-contract.mjs'],
  ['frontend-ui-ux', 'scripts/query-design-intelligence.mjs'],
  ['frontend-ui-ux', 'scripts/import-design-intelligence.mjs'],
  ['lit-diagram-drawer', 'scripts/verify-diagram.mjs'],
  ['lit-diagram-drawer', 'scripts/verify-type.mjs'],
  ['lit-diagram-drawer', 'scripts/verify-brief.mjs'],
  ['lit-diagram-drawer', 'scripts/verify-all.mjs'],
  ['lit-diagram-drawer', 'scripts/verify-coverage.mjs'],
  ['lit-diagram-drawer', 'scripts/verify-motion.mjs'],
  ['lit-diagram-drawer', 'scripts/visual-quality.mjs'],
  ['lit-diagram-drawer', 'scripts/check-visible-text.mjs'],
  ['lit-diagram-drawer', 'scripts/doctor.mjs'],
  ['lit-diagram-drawer', 'scripts/export.mjs'],
  ['lit-diagram-drawer', 'scripts/drawio-extract.mjs'],
  ['lit-diagram-drawer', 'scripts/mermaid-extract.mjs'],
  ['lit-diagram-drawer', 'scripts/excalidraw-extract.mjs'],
  ['lsp-setup', 'scripts/detect-lsp.mjs'],
  ['lsp-setup', 'scripts/verify-lsp.mjs'],
  ['lsp-setup', 'scripts/lsp-server-table.mjs'],
];

function temporaryDirectory(label) {
  const directory = mkdtempSync(join(tmpdir(), `litgrok-${label}-`));
  test.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function run(skill, script, args, options = {}) {
  return spawnSync(process.execPath, [join(SKILLS_ROOT, skill, script), ...args], {
    cwd: options.cwd ?? PRODUCT_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
  });
}

function planRecord(overrides = {}) {
  return {
    objective: 'Ship one deterministic checker',
    scope: { included: ['scripts/check.mjs'], excluded: ['registry publish'] },
    constraints: ['standard library only'],
    evidence: { baseline: ['focused RED receipt'], unknowns: [] },
    steps: [
      {
        id: 'checker',
        outcome: 'Checker returns deterministic status',
        paths: ['scripts/check.mjs'],
        method: 'Validate a JSON record',
        dependencies: [],
        verification: ['node --test test/checker.test.mjs'],
        rollback: 'Remove the new script and test',
      },
    ],
    verification: {
      focused: ['node --test test/checker.test.mjs'],
      full: ['npm test'],
      real_surface: ['run the packaged script'],
    },
    approval_state: 'approved',
    ...overrides,
  };
}

test('every skill script is executable and routed from each owning entry point', () => {
  for (const [skill, relativeScript] of SCRIPTS) {
    const script = join(SKILLS_ROOT, skill, relativeScript);
    assert.ok((statSync(script).mode & 0o111) !== 0, `${skill}/${relativeScript} must be executable`);
    const entry = readFileSync(join(SKILLS_ROOT, skill, 'SKILL.md'), 'utf8');
    assert.match(entry, new RegExp(`(?:run|execute)[^\\n]*${relativeScript.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*(?:when|before|to)`, 'i'));
  }

  const startWork = readFileSync(join(SKILLS_ROOT, 'start-work', 'SKILL.md'), 'utf8');
  assert.match(startWork, /(?:run|execute)[^\n]*\.\.\/lit-plan\/scripts\/validate-plan\.mjs[^\n]*(?:when|before|to)/i);
});

test('frontend canonical corpus verifier accepts the pinned corpus', () => {
  const result = run('frontend-ui-ux', 'scripts/verify-canonical-corpus.mjs', []);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /^PASS\b/m);
});

test('frontend canonical corpus verifier rejects a tampered corpus copy', () => {
  const root = temporaryDirectory('frontend-corpus-tamper');
  const copiedSkill = join(root, 'frontend-ui-ux');
  cpSync(join(SKILLS_ROOT, 'frontend-ui-ux'), copiedSkill, { recursive: true });
  appendFileSync(join(copiedSkill, 'references', 'design', 'ollama.md'), '\n');

  const result = run('frontend-ui-ux', 'scripts/verify-canonical-corpus.mjs', ['--root', copiedSkill]);
  assert.equal(result.status, 1, result.stderr || result.error?.message);
  assert.match(`${result.stdout}${result.stderr}`, /FAIL/);
});

test('rules resolver reports guidance in scope order and allowed project config sections', () => {
  const root = temporaryDirectory('rules-pass');
  const cwd = join(root, 'packages', 'app');
  mkdirSync(join(root, '.git'));
  mkdirSync(cwd, { recursive: true });
  write(join(root, 'AGENTS.md'), '# root guidance\n');
  write(join(root, '.grok', 'rules', 'safety.md'), '# safety\n');
  write(join(cwd, 'AGENT.md'), '# app guidance\n');
  write(join(cwd, '.grok', 'config.toml'), '[mcp_servers.docs]\ncommand = "node"\n\n[plugins]\n\n[permission]\n');

  const result = run('rules', 'scripts/resolve-guidance.mjs', [cwd], {
    cwd,
    env: { ...process.env, HOME: join(root, 'home') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS guidance=3 configs=1/);
  assert.ok(result.stdout.indexOf('AGENTS.md') < result.stdout.indexOf('AGENT.md'), result.stdout);
  assert.match(result.stdout, /CONFIG_SECTIONS .*mcp_servers,permission,plugins/);
});

test('rules resolver rejects a disallowed project config section', () => {
  const root = temporaryDirectory('rules-fail');
  mkdirSync(join(root, '.git'));
  write(join(root, '.grok', 'config.toml'), '[features]\nlsp_tools = true\n');

  const result = run('rules', 'scripts/resolve-guidance.mjs', [root], {
    cwd: root,
    env: { ...process.env, HOME: join(root, 'home') },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL DISALLOWED_CONFIG_SECTION: features/);
});

test('rules resolver rejects a quoted disallowed project config section', () => {
  const root = temporaryDirectory('rules-quoted-section-fail');
  mkdirSync(join(root, '.git'));
  write(join(root, '.grok', 'config.toml'), '["features"]\nlsp_tools = true\n');

  const result = run('rules', 'scripts/resolve-guidance.mjs', [root], {
    cwd: root,
    env: { ...process.env, HOME: join(root, 'home') },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL DISALLOWED_CONFIG_SECTION: features/);
});

test('rules resolver rejects a disallowed top-level dotted assignment', () => {
  const root = temporaryDirectory('rules-dotted-assignment-fail');
  mkdirSync(join(root, '.git'));
  write(join(root, '.grok', 'config.toml'), 'features.lsp_tools = true\n');

  const result = run('rules', 'scripts/resolve-guidance.mjs', [root], {
    cwd: root,
    env: { ...process.env, HOME: join(root, 'home') },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL DISALLOWED_CONFIG_SECTION: features/);
});

test('rules resolver rejects a disallowed top-level inline table', () => {
  const root = temporaryDirectory('rules-inline-table-fail');
  mkdirSync(join(root, '.git'));
  write(join(root, '.grok', 'config.toml'), 'features = { lsp_tools = true }\n');

  const result = run('rules', 'scripts/resolve-guidance.mjs', [root], {
    cwd: root,
    env: { ...process.env, HOME: join(root, 'home') },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL DISALLOWED_CONFIG_SECTION: features/);
});

test('rules resolver reports an allowed top-level dotted assignment', () => {
  const root = temporaryDirectory('rules-dotted-assignment-pass');
  mkdirSync(join(root, '.git'));
  write(join(root, '.grok', 'config.toml'), 'mcp_servers.docs.command = "node"\n');

  const result = run('rules', 'scripts/resolve-guidance.mjs', [root], {
    cwd: root,
    env: { ...process.env, HOME: join(root, 'home') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CONFIG_SECTIONS .* mcp_servers/);
  assert.match(result.stdout, /PASS guidance=0 configs=1/);
});

test('rules resolver applies root-matching double-star ignore patterns', () => {
  const root = temporaryDirectory('rules-double-star-ignore');
  mkdirSync(join(root, '.git'));
  write(join(root, '.gitignore'), '**/AGENTS.md\n');
  write(join(root, 'AGENTS.md'), '# ignored guidance\n');

  const result = run('rules', 'scripts/resolve-guidance.mjs', [root], {
    cwd: root,
    env: { ...process.env, HOME: join(root, 'home') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS guidance=0 configs=0/);
  assert.doesNotMatch(result.stdout, /GUIDANCE .*AGENTS\.md/);
});

test('rules resolver canonicalizes a symlinked cwd before finding the repository scope', () => {
  const root = temporaryDirectory('rules-symlink-root');
  const outside = temporaryDirectory('rules-symlink-outside');
  mkdirSync(join(root, '.git'));
  mkdirSync(join(outside, '.git'));
  write(join(root, 'AGENTS.md'), '# must not control the outside target\n');
  write(join(outside, 'AGENT.md'), '# outside cwd guidance\n');
  symlinkSync(outside, join(root, 'linked-cwd'), 'dir');

  const result = run('rules', 'scripts/resolve-guidance.mjs', [join(root, 'linked-cwd')], {
    cwd: root,
    env: { ...process.env, HOME: join(root, 'home') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`GUIDANCE project:0 ${escapeRegex(realpathSync(outside))}[/\\\\]AGENT\\.md`));
  assert.doesNotMatch(result.stdout, new RegExp(`${escapeRegex(realpathSync(root))}[/\\\\]AGENTS\\.md`));
});

test('rules resolver uses locale-independent code-point order within a scope', () => {
  const root = temporaryDirectory('rules-code-point-order');
  mkdirSync(join(root, '.git'));
  write(join(root, '.grok', 'rules', 'Z.md'), '# upper\n');
  write(join(root, '.grok', 'rules', 'a.md'), '# lower\n');

  const result = run('rules', 'scripts/resolve-guidance.mjs', [root], {
    cwd: root,
    env: { ...process.env, HOME: join(root, 'home') },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.indexOf('Z.md') < result.stdout.indexOf('a.md'), result.stdout);
});

test('plan checker accepts the documented LitGrok plan record', () => {
  const root = temporaryDirectory('plan-pass');
  const plan = join(root, 'plan.json');
  write(plan, `${JSON.stringify(planRecord(), null, 2)}\n`);

  const result = run('lit-plan', 'scripts/validate-plan.mjs', [plan]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS plan steps=1 approval_state=approved/);
});

test('plan checker rejects a dependency cycle', () => {
  const root = temporaryDirectory('plan-fail');
  const plan = join(root, 'plan.json');
  const record = planRecord();
  record.steps.push({
    id: 'verify',
    outcome: 'Verify checker',
    paths: ['test/checker.test.mjs'],
    method: 'Run the focused test',
    dependencies: ['checker'],
    verification: ['node --test test/checker.test.mjs'],
    rollback: 'Remove the test',
  });
  record.steps[0].dependencies = ['verify'];
  write(plan, `${JSON.stringify(record, null, 2)}\n`);

  const result = run('lit-plan', 'scripts/validate-plan.mjs', [plan]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL DEPENDENCY_CYCLE: checker -> verify -> checker/);
});

test('visual evidence verifier accepts a complete manifest with reachable evidence', () => {
  const root = temporaryDirectory('visual-pass');
  write(join(root, 'captures', 'ready.png'), 'fixture image bytes\n');
  const manifest = {
    artifact: { id: 'search-editor', revision: 'working-tree' },
    methodology: 'Captured one deterministic ready state at the required viewport.',
    evidence: [{
      id: 'E1',
      target: '/saved-search/editor',
      dimensions: '1440x900',
      state: 'ready',
      fixture: 'saved-search-long-name',
      capture_method: 'authorized screenshot capture',
      captured_at: '2026-08-27T12:00:00Z',
      path: 'captures/ready.png',
      criterion: 'Primary action is visible with the saved search identity.',
      observation: 'Identity and primary action are visible without clipping.',
      automated_checks: ['route fixture test'],
      visual_judgments: ['hierarchy inspected at final scale'],
    }],
    findings: [],
    verdict: 'pass',
  };
  const path = join(root, 'evidence.json');
  write(path, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = run('visual-qa', 'scripts/verify-evidence-manifest.mjs', [path]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS evidence=1 findings=0 verdict=pass/);
});

test('visual evidence verifier rejects a missing evidence artifact', () => {
  const root = temporaryDirectory('visual-fail');
  const manifest = {
    artifact: { id: 'search-editor', revision: 'working-tree' },
    methodology: 'Capture path is intentionally missing.',
    evidence: [{
      id: 'E1', target: '/editor', dimensions: '1440x900', state: 'ready', fixture: 'default',
      capture_method: 'screenshot', captured_at: '2026-08-27T12:00:00Z', path: 'captures/missing.png',
      criterion: 'Ready state is visible.', observation: 'Recorded without an artifact.', automated_checks: [], visual_judgments: [],
    }],
    findings: [],
    verdict: 'pass',
  };
  const path = join(root, 'evidence.json');
  write(path, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = run('visual-qa', 'scripts/verify-evidence-manifest.mjs', [path]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL EVIDENCE_FILE_MISSING: E1 captures\/missing\.png/);
});

test('visual evidence verifier rejects a symlink that escapes the manifest directory', () => {
  const root = temporaryDirectory('visual-symlink-fail');
  const outside = temporaryDirectory('visual-symlink-outside');
  write(join(outside, 'external.png'), 'external evidence\n');
  mkdirSync(join(root, 'captures'), { recursive: true });
  symlinkSync(join(outside, 'external.png'), join(root, 'captures', 'external.png'));
  const manifest = {
    artifact: { id: 'search-editor', revision: 'working-tree' },
    methodology: 'The apparent local path resolves outside the packet.',
    evidence: [{
      id: 'E1', target: '/editor', dimensions: '1440x900', state: 'ready', fixture: 'default',
      capture_method: 'screenshot', captured_at: '2026-08-27T12:00:00Z', path: 'captures/external.png',
      criterion: 'Evidence remains inside the packet.', observation: 'Path is a symlink.', automated_checks: [], visual_judgments: [],
    }],
    findings: [],
    verdict: 'pass',
  };
  const path = join(root, 'evidence.json');
  write(path, `${JSON.stringify(manifest, null, 2)}\n`);

  const result = run('visual-qa', 'scripts/verify-evidence-manifest.mjs', [path]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL EVIDENCE_PATH_UNSAFE: E1 captures\/external\.png/);
});

test('visual evidence verifier rejects a non-object manifest deterministically', () => {
  const root = temporaryDirectory('visual-null-fail');
  const path = join(root, 'evidence.json');
  write(path, 'null\n');

  const result = run('visual-qa', 'scripts/verify-evidence-manifest.mjs', [path]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL MANIFEST_INVALID: top level must be an object/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});

function reviewPacket(lanes) {
  return {
    objective: 'Review the skill script lane',
    scope: ['.grok/skills', 'test/skill-scripts.test.mjs'],
    lanes: Object.fromEntries(lanes.map((lane) => [lane, {
      verdict: 'PASS',
      confidence: 'HIGH',
      summary: `${lane} contract satisfied`,
      evidence: [`${lane} evidence receipt`],
      findings: [],
      limitations: [],
    }])),
  };
}

test('review lane checker accepts all six complete lane packets', () => {
  const root = temporaryDirectory('review-pass');
  const path = join(root, 'review.json');
  write(path, `${JSON.stringify(reviewPacket(['behavior', 'test', 'safety', 'integration', 'documentation', 'regression']), null, 2)}\n`);

  const result = run('review-work', 'scripts/check-lanes.mjs', [path]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS lanes=6 findings=0/);
});

test('review lane checker rejects a missing contract lane', () => {
  const root = temporaryDirectory('review-fail');
  const path = join(root, 'review.json');
  write(path, `${JSON.stringify(reviewPacket(['behavior', 'test', 'safety', 'integration', 'documentation']), null, 2)}\n`);

  const result = run('review-work', 'scripts/check-lanes.mjs', [path]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL LANE_MISSING: regression/);
});

test('review lane checker rejects a non-object packet deterministically', () => {
  const root = temporaryDirectory('review-null-fail');
  const path = join(root, 'review.json');
  write(path, 'null\n');

  const result = run('review-work', 'scripts/check-lanes.mjs', [path]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL PACKET_INVALID: top level must be an object/);
  assert.doesNotMatch(result.stderr, /TypeError/);
});
