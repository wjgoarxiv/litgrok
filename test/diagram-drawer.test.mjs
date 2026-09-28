import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { deflateRawSync, deflateSync } from 'node:zlib';
import test from 'node:test';
import { visualQuality } from '../.grok/skills/lit-diagram-drawer/scripts/visual-quality.mjs';
import { checkBoundaryMembership, parseBrief } from '../.grok/skills/lit-diagram-drawer/scripts/brief-contract.mjs';

const TEST_ROOT = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = dirname(TEST_ROOT);
const SKILL_ROOT = join(PRODUCT_ROOT, '.grok', 'skills', 'lit-diagram-drawer');
const SCRIPTS = join(SKILL_ROOT, 'scripts');

function run(script, args = [], options = {}) {
  return spawnSync(process.execPath, [join(SCRIPTS, script), ...args], {
    cwd: options.cwd ?? PRODUCT_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
  });
}

function tempDir(prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  test.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('registers one Grok skill root and the exact marketplace skill entry', () => {
  const plugin = JSON.parse(readFileSync(join(PRODUCT_ROOT, 'plugin.json'), 'utf8'));
  const marketplace = JSON.parse(readFileSync(join(PRODUCT_ROOT, '.grok-plugin', 'plugin.json'), 'utf8'));
  const skill = readFileSync(join(SKILL_ROOT, 'SKILL.md'), 'utf8');
  assert.equal(plugin.skills, './.grok/skills');
  assert.ok(marketplace.skills.includes('./.grok/skills/lit-diagram-drawer'));
  assert.match(skill, /^---\nname: lit-diagram-drawer\n/);
  assert.match(skill, /^user-invocable: true$/m);
  assert.match(skill, /## #contract\.output_channels/);
  assert.match(skill, /\/lit-diagram-drawer <brief>/);
  assert.match(skill, /live-host route.*unverified|route.*host-dependent/is);
  assert.match(readFileSync(join(PRODUCT_ROOT, '.grok/skills/frontend-ui-ux/SKILL.md'), 'utf8'), /lit-diagram-drawer/);
  assert.match(readFileSync(join(PRODUCT_ROOT, '.grok/skills/lit-scientific-visualization/SKILL.md'), 'utf8'), /lit-diagram-drawer/);
});

test('ships every catalog guide and all light, dark, and full templates with local font provenance', () => {
  const catalog = JSON.parse(readFileSync(join(SKILL_ROOT, 'references/type-catalog.json'), 'utf8'));
  assert.equal(catalog.entries.length, 61);
  assert.deepEqual(catalog.variants, ['light', 'dark', 'full']);
  for (const entry of catalog.entries) {
    assert.ok(existsSync(join(SKILL_ROOT, 'references', entry.reference)), entry.reference);
    for (const variant of catalog.variants) {
      assert.ok(existsSync(join(SKILL_ROOT, 'assets/examples', 'type-' + entry.id + '-' + variant + '.html')), entry.id + '/' + variant);
    }
  }
  const font = join(SKILL_ROOT, 'assets/fonts/PretendardVariable.woff2');
  const provenance = JSON.parse(readFileSync(join(SKILL_ROOT, 'assets/fonts/provenance.json'), 'utf8'));
  const record = provenance.files.find((item) => item.file === 'PretendardVariable.woff2');
  assert.ok(record);
  assert.equal(createHash('sha256').update(readFileSync(font)).digest('hex'), record.sha256);
  assert.ok(statSync(font).size <= 2 * 1024 * 1024);
  assert.ok(existsSync(join(SKILL_ROOT, 'assets/fonts/OFL.txt')));
  for (const license of ['devicon-MIT.txt', 'diagram-design-MIT.txt', 'log-z-MIT.txt', 'simple-icons-CC0.md', 'tabler-MIT.txt']) {
    assert.ok(existsSync(join(SKILL_ROOT, 'assets/licenses', license)), license);
  }
});

test('keeps the installed diagram skill closed over local files and out of evaluation or QA payloads', () => {
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  }
  walk(SKILL_ROOT);
  assert.ok(files.length > 250);
  for (const file of files) {
    const name = relative(SKILL_ROOT, file).split('\\').join('/');
    assert.doesNotMatch(name, /(?:^|\/)(?:ab|_refs|evidence)(?:\/|$)|REPORT\.md$|office-proof\.py$|\.png$/i, name);
    assert.doesNotMatch(name, /\.py$/i, name);
    if (!/\.(?:md|mjs|json|html|txt|svg)$/i.test(name)) continue;
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\/Users\/[^ \n]*27_LITFAMILY|plans\/lit-diagram-canonical|_refs\/|\.worktrees\//i, name);
    const base = /\.[^.]+$/.test(name) ? dirname(file) : file;
    for (const match of source.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)) {
      const raw = match[1].split(/[?#]/, 1)[0];
      if (!raw || raw.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(raw)) continue;
      const target = resolve(base, decodeURIComponent(raw));
      assert.ok(existsSync(target), name + ' -> ' + raw);
    }
  }
});

test('the aggregate checks accept every packaged template and after example and reject every naive foil', () => {
  const coverage = run('verify-coverage.mjs');
  assert.equal(coverage.status, 0, coverage.stderr || coverage.stdout);
  assert.match(coverage.stdout, /COVERAGE_PASS core=41 gallery=61 variants=183 references=61/);
  const aggregate = run('verify-all.mjs');
  assert.equal(aggregate.status, 0, aggregate.stderr || aggregate.stdout);
  const result = JSON.parse(aggregate.stdout);
  assert.deepEqual(result, { templates: 183, afterExamples: 8, foilsChecked: 8, failures: [] });
  const type = run('verify-type.mjs', ['--type=deployment', join(SKILL_ROOT, 'examples/07-deployment-boundary/after.html')]);
  assert.equal(type.status, 0, type.stderr || type.stdout);
  const brief = run('verify-brief.mjs');
  assert.equal(brief.status, 0, brief.stderr || brief.stdout);
});

test('visual quality rejects a correctly routed edge label that overlaps a node', () => {
  const source = '<svg viewBox="0 0 400 240"><rect data-node-id="Public edge" x="100" y="100" width="80" height="40"/><rect data-node-id="Web tier" x="240" y="100" width="80" height="40"/><path d="M180 120 H240" data-from="Public edge" data-to="Web tier" data-label="request"/><text x="184" y="110" text-anchor="middle" font-size="14" data-role="edge" data-edge-for="Public edge|Web tier">request</text></svg>';
  const result = visualQuality(source);
  assert.ok(result.issues.includes('EDGE_LABEL_NODE_COLLISION request overlaps Public edge'), result.issues.join('\n'));
});

test('visual quality reports geometric crossings between opposite edges of the same node pair', () => {
  const crossing = '<svg viewBox="0 0 400 240"><path d="M100 100 L300 300" data-from="A" data-to="B"/><path d="M300 300 L100 300 L300 100 L100 100" data-from="B" data-to="A"/></svg>';
  const result = visualQuality(crossing);
  assert.ok(result.issues.some((issue) => issue.startsWith('ROUTE_CROSSING A->B / B->A at 200.0,200.0')), result.issues.join('\n'));

  const parallel = '<svg viewBox="0 0 400 240"><path d="M100 100 L300 300" data-from="A" data-to="B"/><path d="M100 120 L300 320" data-from="B" data-to="A"/></svg>';
  assert.ok(!visualQuality(parallel).issues.some((issue) => issue.startsWith('ROUTE_CROSSING')), 'parallel opposite routes stay clear');
});

test('brief boundary membership rejects the F5 outside internal-node defect', () => {
  const brief = parseBrief('- Trust boundary internal nodes: 작업 소비자; 재고 서비스\n- Trust boundary external nodes: 모바일 앱');
  const defective = '<svg><rect x="195" y="100" width="710" height="300" data-trust-boundary="internal"/><rect x="910" y="140" width="64" height="50" data-node-id="작업 소비자"/><rect x="910" y="210" width="64" height="50" data-node-id="재고 서비스"/><rect x="20" y="140" width="64" height="50" data-node-id="모바일 앱"/></svg>';
  const failed = checkBoundaryMembership(defective, brief.boundaryMembership);
  assert.deepEqual(failed.issues, [
    'BOUNDARY_NODE_NOT_INTERNAL name=작업 소비자',
    'BOUNDARY_NODE_NOT_INTERNAL name=재고 서비스',
  ]);

  const corrected = defective.replaceAll('x="910"', 'x="740"');
  assert.deepEqual(checkBoundaryMembership(corrected, brief.boundaryMembership).issues, []);
});

test('arrow tips touch target edges and meet the scaled head-size floor', () => {
  const template = (endpoint, marker) => `<svg viewBox="0 0 1080 640"><defs>${marker}</defs><rect x="40" y="240" width="150" height="80" data-node-id="A"/><rect x="400" y="240" width="150" height="80" data-node-id="B"/><path d="M190 280 H${endpoint}" stroke-width="2.2" marker-end="url(#arrow)" data-from="A" data-to="B"/></svg>`;
  const small = '<marker id="arrow" markerWidth="7" markerHeight="6" refX="6" refY="3" markerUnits="userSpaceOnUse"><path d="M0 0 L0 6 L6 3 z"/></marker>';
  const detached = visualQuality(template(397, small));
  assert.ok(detached.issues.some((issue) => issue.startsWith('ARROWHEAD_TIP_MISSED_TARGET A->B gap=3.0px')), detached.issues.join('\n'));
  assert.ok(detached.issues.some((issue) => issue.startsWith('ARROWHEAD_SIZE_FLOOR A->B end=6.0px min=12.0px')), detached.issues.join('\n'));

  const full = '<marker id="arrow" markerWidth="14" markerHeight="12" refX="13" refY="6" markerUnits="userSpaceOnUse"><path d="M0 0 L0 12 L13 6 z"/></marker>';
  assert.deepEqual(visualQuality(template(400, full)).issues, [], 'a 13px head at 1080 canvas width touches the target edge');
});

test('decision nodes must carry every declared outgoing outcome', () => {
  const node = '<rect x="100" y="100" width="160" height="80" data-node-id="검증 통과?" data-node-type="decision" data-outcomes="예|아니오"/>';
  const targets = '<rect x="500" y="100" width="160" height="80" data-node-id="승인"/><rect x="500" y="300" width="160" height="80" data-node-id="변경 제출"/>';
  const one = visualQuality(`<svg viewBox="0 0 1080 640">${node}${targets}<path d="M260 140 H500" data-from="검증 통과?" data-to="승인" data-label="예"/></svg>`);
  assert.ok(one.issues.includes('DECISION_OUTCOME_MISSING 검증 통과? 아니오'), one.issues.join('\n'));
  const both = visualQuality(`<svg viewBox="0 0 1080 640">${node}${targets}<path d="M260 140 H500" data-from="검증 통과?" data-to="승인" data-label="예"/><path d="M180 180 V340 H500" data-from="검증 통과?" data-to="변경 제출" data-label="아니오"/></svg>`);
  assert.ok(!both.issues.some((issue) => issue.startsWith('DECISION_')), both.issues.join('\n'));
});

test('visible text checks call the installed LitGrok humanizer detector', () => {
  const directory = tempDir('litgrok-diagram-humanizer-');
  const blockFile = join(directory, 'blocked.html');
  writeFileSync(blockFile, '<svg><title>Diagram</title><desc>Small test</desc><text>I hope this helps.</text></svg>');
  const result = run('check-visible-text.mjs', [blockFile]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /"block":1/);
  assert.doesNotMatch(result.stdout + result.stderr, /lit-humanizer-canonical|plans\//);
});

test('each local importer emits the shared inert-data shape and rejects executable labels', () => {
  const directory = tempDir('litgrok-diagram-import-');
  const cases = [
    {
      script: 'mermaid-extract.mjs',
      extension: '.mmd',
      source: 'flowchart LR\n A[Client] -->|request| B[API]\n',
      hostile: 'flowchart LR\n A[<script>alert(1)</script>] --> B\n',
    },
    {
      script: 'excalidraw-extract.mjs',
      extension: '.excalidraw',
      source: JSON.stringify({ type: 'excalidraw', elements: [
        { id: 'box-1', type: 'rectangle', isDeleted: false, x: 0, y: 0, width: 100, height: 80 },
        { id: 'text-1', type: 'text', isDeleted: false, text: 'API', containerId: 'box-1' },
      ] }),
      hostile: JSON.stringify({ type: 'excalidraw', elements: [
        { id: 'box-1', type: 'text', isDeleted: false, text: '<script>alert(1)</script>' },
      ] }),
    },
    {
      script: 'drawio-extract.mjs',
      extension: '.drawio',
      source: '<mxfile><diagram name="Flow"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Client" vertex="1" parent="1"/><mxCell id="b" value="API" vertex="1" parent="1"/><mxCell id="e" value="request" edge="1" source="a" target="b"/></root></mxGraphModel></diagram></mxfile>',
      hostile: '<mxGraphModel><root><mxCell id="0"/><mxCell id="a" value="&lt;script&gt;alert(1)&lt;/script&gt;" vertex="1"/></root></mxGraphModel>',
    },
  ];
  for (const [index, item] of cases.entries()) {
    const input = join(directory, 'source-' + index + item.extension);
    writeFileSync(input, item.source);
    const parsed = run(item.script, [input]);
    assert.equal(parsed.status, 0, parsed.stderr || parsed.stdout);
    const result = JSON.parse(parsed.stdout);
    assert.equal(result.schemaVersion, 1);
    assert.match(result.sourceDigest, /^[0-9a-f]{64}$/);
    assert.ok(result.nodes.length > 0);
    assert.ok(Array.isArray(result.relationships));
    assert.ok(Array.isArray(result.warnings));
    const unsafe = join(directory, 'unsafe-' + index + item.extension);
    writeFileSync(unsafe, item.hostile);
    const rejected = run(item.script, [unsafe]);
    assert.equal(rejected.status, 2, rejected.stdout + rejected.stderr);
    assert.match(rejected.stderr, /unsupported|executable|active/i);
  }
});

test('Mermaid importer selects a requested Markdown block and preserves sequence content', () => {
  const directory = tempDir('litgrok-diagram-mermaid-block-');
  const input = join(directory, 'notes.md');
  writeFileSync(input, [
    '# Source notes',
    '~~~mermaid',
    'flowchart LR',
    'A --> B',
    '~~~',
    '',
    '```mermaid',
    'sequenceDiagram',
    'participant A as Alice',
    'participant B as Bob',
    'A->>B: request',
    '```',
  ].join('\n'));
  const result = run('mermaid-extract.mjs', [input, '--diagram', '1']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.suggestedType, 'sequence');
  assert.deepEqual(parsed.nodes.map((node) => node.label), ['Alice', 'Bob']);
  assert.deepEqual(parsed.relationships, [{ from: 'A', to: 'B', label: 'request', kind: 'message', direction: 'forward' }]);
});

test('draw.io importer reads compressed XML pages and draw.io metadata embedded in SVG and PNG', () => {
  const directory = tempDir('litgrok-diagram-drawio-formats-');
  const model = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Client" vertex="1" parent="1"/><mxCell id="b" value="API" vertex="1" parent="1"/><mxCell id="e" edge="1" source="a" target="b" style="endArrow=classic;"/></root></mxGraphModel>';
  const encoded = encodeURIComponent(model);
  const compressed = deflateRawSync(Buffer.from(encoded)).toString('base64');
  const drawio = join(directory, 'compressed.drawio');
  writeFileSync(drawio, '<mxfile><diagram name="Compressed">' + compressed + '</diagram></mxfile>');
  const page = run('drawio-extract.mjs', [drawio, '--page', '0']);
  assert.equal(page.status, 0, page.stderr || page.stdout);
  assert.equal(JSON.parse(page.stdout).title, 'Compressed');

  const escaped = model.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const svg = join(directory, 'embedded.svg');
  writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" content="' + escaped + '"></svg>');
  const fromSvg = run('drawio-extract.mjs', [svg]);
  assert.equal(fromSvg.status, 0, fromSvg.stderr || fromSvg.stdout);
  assert.equal(JSON.parse(fromSvg.stdout).nodes.length, 2);

  function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  function chunk(type, payload) {
    const name = Buffer.from(type);
    const body = Buffer.concat([name, payload]);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(payload.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([header, body, checksum]);
  }
  const png = join(directory, 'embedded.png');
  const text = Buffer.concat([Buffer.from('mxfile\0\0'), deflateSync(Buffer.from(encodeURIComponent(model)))]);
  const image = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('zTXt', text), chunk('IEND', Buffer.alloc(0))]);
  writeFileSync(png, image);
  const fromPng = run('drawio-extract.mjs', [png]);
  assert.equal(fromPng.status, 0, fromPng.stderr || fromPng.stdout);
  assert.equal(JSON.parse(fromPng.stdout).relationships[0].direction, 'forward');
  image[8 + 8 + text.length + 3] ^= 1;
  const corrupt = join(directory, 'corrupt.png');
  writeFileSync(corrupt, image);
  const rejected = run('drawio-extract.mjs', [corrupt]);
  assert.equal(rejected.status, 2);
  assert.match(rejected.stderr, /CRC/);
});

test('exporter gives a user-run setup step when the optional renderer is absent', () => {
  const directory = tempDir('litgrok-diagram-export-');
  const output = join(directory, 'out');
  const source = join(SKILL_ROOT, 'examples/07-deployment-boundary/after.html');
  const result = run('export.mjs', ['--input', source, '--out', output, '--scale', '2'], {
    env: { ...process.env, PATH: '' },
  });
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /RENDERER_REQUIRED|CHROME_REQUIRED/);
  assert.equal(existsSync(output), false, 'failed preflight must not leave partial output');
});
