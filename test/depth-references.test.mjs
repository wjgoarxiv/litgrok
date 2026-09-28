import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const TEST_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_DIRECTORY);
const SKILLS_DIRECTORY = join(PRODUCT_ROOT, '.grok', 'skills');
const SCIENTIFIC_VENDOR_REFERENCES = join(PRODUCT_ROOT, '.grok', 'vendor', 'scientific-visualization', 'references');
const SCIENTIFIC_VENDOR_PREFIX = '../../vendor/scientific-visualization/references';

const REFERENCE_SETS = new Map([
  ['lit-docx', ['frontmatter_schema.md', 'journal_style_spec.md', 'markdown_quality_checklist.md', 'slop_rules.md']],
  ['lit-typographic-motion', ['complete-contract.md', 'craft-loop.md', 'runtime.md', 'scene-contract.md', 'stage.md', 'style-bible.md', 'treatment.md', 'type-craft.md']],
  ['autoresearch', [
    'core-principles.md',
    'family-contract.md',
    'modes/core.md',
    'modes/core/evaluator-contract.md',
    'modes/core/stuck-detection.md',
    'modes/debug.md',
    'modes/debug/investigation-techniques.md',
    'modes/fix.md',
    'modes/learn.md',
    'modes/plan.md',
    'modes/predict.md',
    'modes/predict/persona-templates.md',
    'modes/reason.md',
    'modes/scenario.md',
    'modes/scenario/dimensions.md',
    'modes/security.md',
    'modes/security/owasp-checklist.md',
    'modes/security/stride-model.md',
    'modes/ship.md',
    'modes/ship/type-checklists.md',
    'results-logging.md',
    'visualization-guide.md',
  ]],
  ['autoconference', [
    'agent-prompts.md',
    'conference-protocol.md',
    'core-principles.md',
    'family-contract.md',
    'modes/analyze.md',
    'modes/core.md',
    'modes/core/convergence-guide.md',
    'modes/core/crash-recovery.md',
    'modes/debate.md',
    'modes/plan.md',
    'modes/resume.md',
    'modes/ship.md',
    'modes/survey.md',
    'results-logging.md',
    'visualization-guide.md',
  ]],
  ['lit-code', [
    'permission-sandbox-matrix.md',
    'tool-boundaries.md',
    'worked-cases.md',
    'go/README.md',
    'go/backend-stack.md',
    'go/bootstrap.md',
    'go/bubbletea-v2.md',
    'go/cobra-stack.md',
    'go/concurrency.md',
    'go/data-modeling.md',
    'go/error-handling.md',
    'go/golangci-strict.md',
    'go/grpc-connect.md',
    'go/libraries.md',
    'go/one-liners.md',
    'go/sqlc-pgx.md',
    'go/testing.md',
    'go/type-patterns.md',
    'python/README.md',
    'python/async-anyio.md',
    'python/data-modeling.md',
    'python/data-processing.md',
    'python/error-handling.md',
    'python/fastapi-stack.md',
    'python/httpx2-optimization.md',
    'python/libraries.md',
    'python/one-liners.md',
    'python/orjson-stack.md',
    'python/pydantic-ai.md',
    'python/pyproject-strict.md',
    'python/textual-tui.md',
    'python/type-patterns.md',
    'rust-ub/README.md',
    'rust-ub/miri-sanitizers-loom.md',
    'rust-ub/ub-taxonomy.md',
    'rust/README.md',
    'rust/async-tokio.md',
    'rust/axum-stack.md',
    'rust/cargo-strict.md',
    'rust/clap-stack.md',
    'rust/concurrency.md',
    'rust/libraries.md',
    'rust/one-liners.md',
    'rust/proptest-insta.md',
    'rust/type-state.md',
    'rust/unsafe-discipline.md',
    'rust/zero-cost-safety.md',
    'typescript/README.md',
    'typescript/backend-hono.md',
    'typescript/bootstrap.md',
    'typescript/data-modeling.md',
    'typescript/error-handling.md',
    'typescript/tsconfig-strict.md',
    'typescript/type-patterns.md',
  ]],
  ['debugging', [
    'post-tool-use-failure-taxonomy.md',
    'reproduction-recipes.md',
    'methodology/00-setup.md',
    'methodology/02-investigate.md',
    'methodology/04-oracle-triple.md',
    'methodology/05-escalate.md',
    'methodology/06-fix.md',
    'methodology/08-qa.md',
    'methodology/09-cleanup.md',
    'methodology/partial-runtime-evidence.md',
    'runtimes/bundled-js-binary.md',
    'runtimes/go.md',
    'runtimes/native-binary.md',
    'runtimes/node.md',
    'runtimes/python.md',
    'runtimes/rust.md',
    'tools/ghidra.md',
    'tools/playwright-cli.md',
    'tools/pwndbg.md',
    'tools/pwntools.md',
  ]],
  ['review-work', [
    'behavior-lane-contract.md',
    'test-lane-contract.md',
    'safety-lane-contract.md',
    'integration-lane-contract.md',
    'documentation-lane-contract.md',
    'regression-lane-contract.md',
  ]],
  ['lit-team', [
    'general-purpose-packet.md',
    'explore-packet.md',
    'plan-packet.md',
  ]],
  ['frontend-ui-ux', [
    'production.md',
    'complete-contract.md',
    'adaptive-layout.md',
    'brand-and-imagery.md',
    'composition.md',
    'craft-floor.md',
    'creative-directions.md',
    'evidence-review.md',
    'implementation-platforms.md',
    'inclusive-interface.md',
    'interaction-motion.md',
    'motion-guide.md',
    'operating-lanes.md',
    'performance-delivery.md',
    'product-direction.md',
    'probe-loop.md',
    'redesign-playbook.md',
    'slop-register.md',
    'system-foundations.md',
    'taste-direction.md',
    'visual-language.md',
    'visual-reconstruction.md',
  ]],
  ['visual-qa', [
    'complete-contract.md',
    'capture-playbook.md',
    'verdict-taxonomy.md',
  ]],
  ['readme-studio', ['complete-contract.md', 'production.md', 'facts.md', 'typography.md', 'motion.md', 'decoration-patterns.md']],
  ['lit-comprehend', [
    'artifact-format.md',
    'honesty-ledger-contract.md',
    'worked-explainer.md',
    'artifact-template.md',
    'micro-worlds.md',
  ]],
  ['browser-drive', [
    'snapshot-act-loop.md',
  ]],
  ['lit-humanizer', [
    'code-patterns.md',
    'deliverable-channels.md',
    'en-patterns-checklist.md',
    'en-patterns-content.md',
    'en-patterns-structure.md',
    'en-patterns.md',
    'ko-metrics.md',
    'ko-patterns-a-d.md',
    'ko-patterns-e-j.md',
    'ko-patterns.md',
    'rewrite-playbook.md',
    'taxonomy.md',
  ]],
  ['lit-diagram-drawer', [
    'accessibility.md',
    'export.md',
    'import-drawio.md',
    'import-excalidraw.md',
    'import-mermaid.md',
    'import-schema.md',
    'korean-typography.md',
    'motion.md',
    'office-pptx-docx.md',
    'output-spec.md',
    'primitive-annotation.md',
    'primitive-icons.md',
    'primitive-sketchy.md',
    'primitive-terminal.md',
    'profiles.md',
    'semantic-patterns.md',
    'style-guide.md',
    'type-architecture.md',
    'type-bar.md',
    'type-beeswarm.md',
    'type-bubble.md',
    'type-bump.md',
    'type-data-flow.md',
    'type-datalake.md',
    'type-db-schema.md',
    'type-dependency.md',
    'type-deployment.md',
    'type-dp-integration.md',
    'type-dp-security-matrix.md',
    'type-er.md',
    'type-fishbone.md',
    'type-flowchart.md',
    'type-gantt.md',
    'type-heatmap.md',
    'type-high-level-vertical.md',
    'type-high-level.md',
    'type-import-drawio.md',
    'type-import-excalidraw.md',
    'type-import-mermaid.md',
    'type-it-state.md',
    'type-journey.md',
    'type-kanban.md',
    'type-layers.md',
    'type-line.md',
    'type-loop-terminal.md',
    'type-loop.md',
    'type-marimekko.md',
    'type-medallion.md',
    'type-nested.md',
    'type-org-chart.md',
    'type-paved-road-animated.md',
    'type-polar.md',
    'type-policy-trace-animated.md',
    'type-process.md',
    'type-pyramid.md',
    'type-quadrant-consultant.md',
    'type-quadrant.md',
    'type-queue-animated.md',
    'type-radar.md',
    'type-ridgeline.md',
    'type-sankey.md',
    'type-scatter.md',
    'type-sequence-oauth.md',
    'type-sequence.md',
    'type-slopegraph.md',
    'type-state-lifecycle.md',
    'type-state.md',
    'type-story-map.md',
    'type-streamgraph.md',
    'type-swimlane.md',
    'type-timeline.md',
    'type-tree-block-decomposition.md',
    'type-tree.md',
    'type-treemap.md',
    'type-uml-class.md',
    'type-venn.md',
    'type-wardley.md',
    'type-waterfall.md',
    'verifier-guide.md',
  ]],
  ['litresearch', [
    'source-verdict-taxonomy.md',
    'mcp-tool-use-patterns.md',
  ]],
  ['rules', ['loading-order-contract.md']],
  ['lsp', ['built-in-lsp-contract.md']],
  ['lsp-setup', [
    'bash/README.md',
    'c-cpp/README.md',
    'csharp/README.md',
    'dart/README.md',
    'elixir/README.md',
    'go/README.md',
    'haskell/README.md',
    'java/README.md',
    'julia/README.md',
    'kotlin/README.md',
    'lua/README.md',
    'php/README.md',
    'python/README.md',
    'ruby/README.md',
    'rust/README.md',
    'swift/README.md',
    'terraform/README.md',
    'typescript/README.md',
    'yaml/README.md',
    'zig/README.md',
  ]],
  ['lit-plan', [
    'plan-schema.md',
    'start-work-handoff-contract.md',
  ]],
  ['lit-scientific-visualization', [
    'color_palettes.md',
    'journal_requirements.md',
    'matplotlib_examples.md',
    'mdanalysis_martini_visualization.md',
    'publication_guidelines.md',
    'seaborn_for_publications.md',
  ]],
  ['lit-handoff', [
    'source-pointer.md',
  ]],
  ['wikify', [
    'page-format.md',
    'provenance-contract.md',
  ]],
]);

const SHARED_ENTRY_REFERENCES = new Map([
  ['start-work', [
    '../lit-plan/references/plan-schema.md',
    '../lit-plan/references/start-work-handoff-contract.md',
  ]],
]);

function source(path) {
  assert.ok(existsSync(path), `missing ${relative(PRODUCT_ROOT, path)}`);
  return readFileSync(path, 'utf8');
}

function routePattern(link, skill) {
  if (skill === 'lit-diagram-drawer' && /^references\/type-[\w-]+\.md$/.test(link)) {
    return /Load the selected references\/type-<id>\.md guide when/i;
  }
  const referencePath = link.includes('references/') ? link : `references/${link}`;
  const escapedPath = referencePath
    .split('/')
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\/');
  return new RegExp(`(?:load|read|open)[^\\n]*${escapedPath}[^\\n]*(?:when|for|before)\\b`, 'i');
}

function tableBodyRows(content, heading) {
  const marker = `## ${heading}\n`;
  const start = content.indexOf(marker);
  assert.notEqual(start, -1, `missing table section: ${heading}`);
  const remainder = content.slice(start + marker.length);
  const nextHeading = remainder.search(/^## /m);
  const section = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);
  const rows = section.split('\n').filter((line) => /^\|/.test(line) && !/^\|\s*[-:]+/.test(line));
  return rows.length - 1;
}

test('depth references are reachable from their skill entry points', () => {
  for (const [skill, references] of REFERENCE_SETS) {
    const skillDirectory = join(SKILLS_DIRECTORY, skill);
    const entry = source(join(skillDirectory, 'SKILL.md'));

    for (const filename of references) {
      const link = skill === 'lit-scientific-visualization'
        ? `${SCIENTIFIC_VENDOR_PREFIX}/${filename}`
        : `references/${filename}`;
      const referenceRoot = skill === 'lit-scientific-visualization'
        ? SCIENTIFIC_VENDOR_REFERENCES
        : join(skillDirectory, 'references');
      source(join(referenceRoot, filename));
      assert.match(
        entry,
        routePattern(link, skill),
        `${skill}/SKILL.md must say when to load ${link}`,
      );
    }
  }

  for (const [skill, references] of SHARED_ENTRY_REFERENCES) {
    const skillDirectory = join(SKILLS_DIRECTORY, skill);
    const entry = source(join(skillDirectory, 'SKILL.md'));
    for (const link of references) {
      source(join(skillDirectory, link));
      assert.match(
        entry,
        routePattern(link),
        `${skill}/SKILL.md must say when to load ${link}`,
      );
    }
  }
});

test('motion guide reserves the verified Phase 3 README A/B example format', () => {
  const frontendRoot = join(SKILLS_DIRECTORY, 'frontend-ui-ux');
  const guide = source(join(frontendRoot, 'references', 'motion-guide.md'));
  const example = source(join(frontendRoot, 'examples', 'phase-3-readme-motion-ab.md'));
  assert.match(guide, /examples\/phase-3-readme-motion-ab\.md/);
  assert.match(example, /Run evidence:[^\n]*Phase 3 evidence path/);
  assert.match(example, /### Before[\s\S]*```md[\s\S]*### After[\s\S]*```md/);
  assert.match(example, /### Observed change/);
});

test('every reference file is enumerated by the depth contract', () => {
  const actual = [];
  const skippedFrontendRoots = new Set(['design', 'designpowers', 'perfection', 'ui-ux-db', '_canonical-corpus']);

  function walkReferences(skill, directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      const childRelative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (skill === 'frontend-ui-ux' && prefix === '' && skippedFrontendRoots.has(entry.name)) continue;
        walkReferences(skill, child, childRelative);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        actual.push(`${skill}/${childRelative}`);
      }
    }
  }

  for (const skill of readdirSync(SKILLS_DIRECTORY, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const references = join(SKILLS_DIRECTORY, skill.name, 'references');
    if (!existsSync(references)) continue;
    walkReferences(skill.name, references);
  }
  walkReferences('lit-scientific-visualization', SCIENTIFIC_VENDOR_REFERENCES);

  const declared = [...REFERENCE_SETS].flatMap(([skill, references]) => references.map((name) => `${skill}/${name}`));
  assert.deepEqual(actual.sort(), declared.sort(), 'every packaged reference must be owned by the depth contract');
});

test('programming references contain decision tables and worked input-output cases', () => {
  const directory = join(SKILLS_DIRECTORY, 'lit-code', 'references');
  const matrix = source(join(directory, 'permission-sandbox-matrix.md'));
  const boundaries = source(join(directory, 'tool-boundaries.md'));
  const cases = source(join(directory, 'worked-cases.md'));

  assert.ok(tableBodyRows(matrix, 'Combined decisions') >= 12, 'permission-sandbox matrix needs at least 12 decisions');
  assert.match(matrix, /deny\s*>\s*ask\s*>\s*allow/i);
  assert.match(matrix, /off[\s\S]*workspace[\s\S]*read-only[\s\S]*strict/i);
  assert.ok(tableBodyRows(boundaries, 'Boundary table') >= 10, 'tool-boundary table needs at least 10 tool/action rows');
  assert.match(boundaries, /filesystem/i);
  assert.match(boundaries, /network/i);
  assert.ok((cases.match(/^## Case /gm) ?? []).length >= 4, 'worked cases need at least four cases');
  assert.ok((cases.match(/^### Input$/gm) ?? []).length >= 4, 'each worked case needs real input');
  assert.ok((cases.match(/^### Expected output$/gm) ?? []).length >= 4, 'each worked case needs expected output');
});

test('debugging references provide a PostToolUseFailure taxonomy and reproduction recipes', () => {
  const directory = join(SKILLS_DIRECTORY, 'debugging', 'references');
  const taxonomy = source(join(directory, 'post-tool-use-failure-taxonomy.md'));
  const recipes = source(join(directory, 'reproduction-recipes.md'));

  assert.match(taxonomy, /PostToolUseFailure/);
  assert.ok(tableBodyRows(taxonomy, 'Failure taxonomy') >= 9, 'failure taxonomy needs at least nine named failure classes');
  assert.ok((recipes.match(/^## Recipe /gm) ?? []).length >= 5, 'reproduction guide needs at least five recipes');
  assert.ok((recipes.match(/^### Reproducer$/gm) ?? []).length >= 5, 'each recipe needs a reproducer');
  assert.ok((recipes.match(/^### Expected evidence$/gm) ?? []).length >= 5, 'each recipe needs expected evidence');
});

test('review-work owns one complete pass-fail contract per lane', () => {
  const directory = join(SKILLS_DIRECTORY, 'review-work', 'references');
  for (const filename of REFERENCE_SETS.get('review-work')) {
    const content = source(join(directory, filename));
    for (const heading of ['Scope', 'Contract', 'Pass criteria', 'Fail criteria', 'Evidence packet']) {
      assert.match(content, new RegExp(`^## ${heading}$`, 'm'), `${filename} must include ${heading}`);
    }
  }
});

test('lit-team owns a bounded packet format for every built-in subagent type', () => {
  const directory = join(SKILLS_DIRECTORY, 'lit-team', 'references');
  for (const [type, filename] of [
    ['general-purpose', 'general-purpose-packet.md'],
    ['explore', 'explore-packet.md'],
    ['plan', 'plan-packet.md'],
  ]) {
    const content = source(join(directory, filename));
    assert.match(content, new RegExp(`\\b${type}\\b`));
    for (const field of ['TASK:', 'DELIVERABLE:', 'SCOPE:', 'VERIFY:']) {
      assert.ok(content.includes(field), `${filename} must include ${field}`);
    }
    assert.match(content, /^## Worked packet$/m, `${filename} must include a worked packet`);
    assert.match(content, /^## Invalid packet$/m, `${filename} must include an invalid packet`);
  }
});

test('frontend design references carry the complete contract and focused decision guidance', () => {
  const directory = join(SKILLS_DIRECTORY, 'frontend-ui-ux', 'references');
  const contract = source(join(directory, 'complete-contract.md'));
  const taste = source(join(directory, 'taste-direction.md'));

  assert.match(contract, /## #contract\.output_channels/);
  assert.ok(Buffer.byteLength(contract, 'utf8') >= 15000, 'complete contract must retain the carried depth');
  for (const heading of ['#contract.inputs', '#contract.procedure', '#contract.evidence']) {
    assert.match(contract, new RegExp(`^## ${heading}$`, 'm'));
  }
  for (const field of ['schema_id', 'contract_id', 'source_hash', 'intent', 'direction', 'inventory', 'acceptance_criteria']) {
    assert.match(contract, new RegExp(`\\b${field}\\b`), `complete contract must define ${field}`);
  }
  for (const dial of ['variance', 'motion', 'density']) {
    assert.match(taste, new RegExp(`\\b${dial}\\b`), `taste direction must define ${dial}`);
  }
});

test('visual QA references define capture, evidence, and verdict contracts', () => {
  const directory = join(SKILLS_DIRECTORY, 'visual-qa', 'references');
  const contract = source(join(directory, 'complete-contract.md'));
  const playbook = source(join(directory, 'capture-playbook.md'));
  const taxonomy = source(join(directory, 'verdict-taxonomy.md'));

  assert.match(contract, /## #contract\.output_channels/);
  for (const heading of ['Evidence packet', 'Methodology paragraph', 'Finding record']) {
    assert.match(contract, new RegExp(`^## ${heading}$`, 'm'));
  }
  assert.ok(tableBodyRows(playbook, 'Capture decision table') >= 8, 'capture playbook needs eight decisions');
  assert.ok(tableBodyRows(taxonomy, 'Verdict taxonomy') >= 8, 'verdict taxonomy needs eight outcomes');
});

test('comprehension references define a durable artifact and worked explainers', () => {
  const directory = join(SKILLS_DIRECTORY, 'lit-comprehend', 'references');
  const format = source(join(directory, 'artifact-format.md'));
  const ledger = source(join(directory, 'honesty-ledger-contract.md'));
  const worked = source(join(directory, 'worked-explainer.md'));

  for (const heading of ['Reader question', 'Working source map', 'Explanation', 'Internal claim record']) {
    assert.match(format, new RegExp(`^## ${heading}$`, 'm'));
  }
  assert.match(format, /in the internal work record, not in the reader-facing explainer/i);
  assert.doesNotMatch(format, /^## Honesty ledger$/m);
  assert.ok(tableBodyRows(ledger, 'Ledger decision table') >= 8, 'honesty ledger needs eight decisions');
  assert.ok((worked.match(/^## Case /gm) ?? []).length >= 3, 'worked explainer needs three cases');
  assert.ok((worked.match(/^### Input$/gm) ?? []).length >= 3, 'worked cases need inputs');
  assert.ok((worked.match(/^### Expected artifact excerpt$/gm) ?? []).length >= 3, 'worked cases need outputs');
});

test('research references define source verdicts and documented MCP patterns', () => {
  const directory = join(SKILLS_DIRECTORY, 'litresearch', 'references');
  const taxonomy = source(join(directory, 'source-verdict-taxonomy.md'));
  const patterns = source(join(directory, 'mcp-tool-use-patterns.md'));

  assert.ok(tableBodyRows(taxonomy, 'Source verdict taxonomy') >= 8, 'source taxonomy needs eight verdicts');
  assert.match(patterns, /\[mcp_servers\.filesystem\]/);
  assert.match(patterns, /\[mcp_servers\.linear\]/);
  assert.match(patterns, /\$\{MY_API_KEY\}/);
  const tomlBlocks = [...patterns.matchAll(/```toml\n([\s\S]*?)\n```/g)].map((match) => match[1]);
  assert.equal(tomlBlocks.length, 2, 'MCP guide must contain the two documented TOML examples');
  for (const block of tomlBlocks) {
    const header = block.split('\n')[0];
    assert.match(header, /^\[mcp_servers\.[A-Za-z0-9_-]+\]$/, `invalid concrete MCP table header: ${header}`);
    assert.doesNotMatch(block, /<name>|Bearer token/, 'TOML examples must not contain placeholders or literal-looking secrets');
  }
  assert.match(patterns, /~\/\.grok\/config\.toml/);
  assert.match(patterns, /\.grok\/config\.toml/);
  assert.match(patterns, /<server>__<tool>/);
  assert.ok((patterns.match(/^## Pattern /gm) ?? []).length >= 4, 'MCP guide needs four worked patterns');
});

test('rules and built-in LSP references preserve documented host boundaries', () => {
  const rules = source(join(SKILLS_DIRECTORY, 'rules', 'references', 'loading-order-contract.md'));
  const lsp = source(join(SKILLS_DIRECTORY, 'lsp', 'references', 'built-in-lsp-contract.md'));

  assert.match(rules, /AGENTS\.md/);
  assert.match(rules, /cwd[^\n]*repository root|repository root[^\n]*cwd/i);
  assert.match(rules, /\.grok\/rules\/\*\.md/);
  for (const section of ['mcp_servers', 'plugins', 'permission']) assert.match(rules, new RegExp(`\\[${section}\\]`));
  assert.doesNotMatch(rules, /\[features\]/, 'project config contract must not add unsupported sections');
  assert.match(lsp, /GROK_LSP_TOOLS/);
  assert.match(lsp, /\[features\][\s\S]*lsp_tools/);
  assert.match(lsp, /default[^\n]*off|off[^\n]*default/i);
  assert.match(lsp, /no (?:language )?server ships/i);
});

test('planning references define the plan schema and execution handoff', () => {
  const directory = join(SKILLS_DIRECTORY, 'lit-plan', 'references');
  const schema = source(join(directory, 'plan-schema.md'));
  const handoff = source(join(directory, 'start-work-handoff-contract.md'));

  for (const field of ['objective', 'scope', 'constraints', 'steps', 'verification', 'approval_state']) {
    assert.match(schema, new RegExp(`\\b${field}\\b`), `plan schema must define ${field}`);
  }
  assert.ok(tableBodyRows(handoff, 'Handoff decision table') >= 8, 'handoff needs eight decisions');
  for (const receipt of ['plan', 'baseline', 'implementation', 'verification']) {
    assert.match(handoff, new RegExp(`\\b${receipt} receipt\\b`, 'i'));
  }
});

test('wikify references define page format and provenance decisions', () => {
  const directory = join(SKILLS_DIRECTORY, 'wikify', 'references');
  const format = source(join(directory, 'page-format.md'));
  const provenance = source(join(directory, 'provenance-contract.md'));

  for (const field of ['title', 'summary', 'source', 'status', 'updated']) {
    assert.match(format, new RegExp(`\\b${field}\\b`), `page format must define ${field}`);
  }
  assert.ok(tableBodyRows(provenance, 'Provenance decision table') >= 8, 'provenance contract needs eight decisions');
  assert.match(provenance, /unknown/i);
  assert.match(provenance, /conflict/i);
});
