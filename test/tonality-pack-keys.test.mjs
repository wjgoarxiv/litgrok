import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// A deck look (lit-pptx pack.yaml) or a document look (lit-docx tonality yaml) promises what its keys
// say, so every key it sets must be read by the engine. Each key path below is paired with the engine
// expression that reads it: a key with no entry fails, and an entry whose expression left the engine
// fails too. `*` stands for every key of that map. Keys that only label the file are listed apart,
// with the reason, and never change a page.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const pptx = join(root, '.grok/skills/lit-pptx');
const docx = join(root, '.grok/skills/lit-docx');

const DECK_READS = {
  id: ['lib/template-registry.js', /name: pack\.id,/],
  name: ['lib/template-registry.js', /name: pack\.name,/],
  version: ['lib/template-registry.js', /version: pack\.version,/],
  intent: ['compile-deck.js', /\$\{p\.intent\}/],
  canvas: ['lib/template-registry.js', /options\.canvas \|\| pack\.canvas\[0\]/],
  'faces.*': ['lib/render-pack.js', /G\.faceWidth\(pack\.faces\[role\]\)/],
  'palette.*': ['lib/render-pack.js', (role) => new RegExp(`"${role}"|P\\.${role}\\b|P\\["${role}"\\]`)],
  ramp: ['lib/template-registry.js', /densityTokens\(density, pack\.ramp\)/],
  hero: ['lib/render-pack.js', /S\.pack\.hero \?/],
  'type-voice.title-tracking': ['lib/render-pack.js', /voice\["title-tracking"\]/],
  'type-voice.display-tracking': ['lib/render-pack.js', /voice\["display-tracking"\]/],
  density: ['lib/template-registry.js', /options\.density : pack\.density/],
  variance: ['lib/template-registry.js', /options\.variance : pack\.variance/],
  radius: ['lib/render-pack.js', /radius: S\.pack\.radius/],
  edge: ['lib/render-pack.js', /S\.pack\.edge/],
  treatments: ['lib/grid-resolver.js', /pack\.treatments\.filter/],
  'role-defaults.*': ['lib/grid-resolver.js', /pack\["role-defaults"\]\[role\]/],
  'structure.*': ['lib/grid-resolver.js', /\(pack\.structure \|\| \{\}\)\[family\]/],
  rail: ['lib/layout-resolver.js', /rail: pack\.rail/],
  decoration: ['lib/render-pack.js', /new Set\(pack\.decoration \|\| \[\]\)/],
  'layout-families': ['lib/layout-resolver.js', /pack\["layout-families"\]/],
  'display.cover': ['lib/render-pack.js', /\(S\.pack\.display \|\| \{\}\)\.cover/],
  'display.statement': ['lib/render-pack.js', /\(S\.pack\.display \|\| \{\}\)\.statement/],
  'display.number': ['lib/render-pack.js', /S\.pack\.display\.number/],
  'display.closing': ['lib/render-pack.js', /\(S\.pack\.display \|\| \{\}\)\.closing/],
  'display.index': ['lib/render-pack.js', /\(S\.pack\.display \|\| \{\}\)\.index/],
  covers: ['lib/layout-resolver.js', /kind === "cover" \? "covers"/],
  sections: ['lib/layout-resolver.js', /kind === "section" \? "sections"/],
  closings: ['lib/layout-resolver.js', /: "closings"\]/],
  'table.header': ['lib/render-pack.js', /t\.header && t\.header !== "none"/],
  'table.header-ink': ['lib/render-pack.js', /t\["header-ink"\]/],
  'table.rules': ['lib/render-pack.js', /switch \(t\.rules\)/],
  'table.banding': ['lib/render-pack.js', /t\.banding && t\.banding !== "none"/],
  'table.totals': ['lib/render-pack.js', /t\.totals === "bold"/],
  'table.protagonist': ['lib/render-pack.js', /S\.colour\(t\.protagonist\)/],
  'chart.gridlines': ['lib/render-pack.js', /chart\.gridlines !== "none"/],
  'chart.labels': ['lib/render-pack.js', /chart\.labels === "direct"/],
  'chart.highlight': ['lib/render-pack.js', /chart\.highlight === "accent-on-muted"/],
  'image.frame': ['lib/render-pack.js', /S\.pack\.image\.frame === "hairline"/],
  'fill-order': ['lib/render-pack.js', /S\.pack\["fill-order"\]/],
};

const DOC_READS = {
  'dials.density': ['docx_design.py', /self\.dials\["density"\]/],
  'dials.variance': ['docx_design.py', /self\.dials\["variance"\]/],
  'docx.page.size': ['docx_design.py', /\(T\.docx\.get\("page"\) or \{\}\)\.get\("size"/],
  'docx.font.latin': ['docx_design.py', /f\.get\("latin"/],
  'docx.font.hangul': ['docx_design.py', /f\.get\("hangul"/],
  'docx.font.heading': ['docx_design.py', /f\.get\("heading"/],
  'docx.font.body_pt_ko': ['docx_design.py', /else "body_pt_ko"/],
  'docx.font.body_pt_en': ['docx_design.py', /font\.get\("body_pt_en"/],
  'design.ramp.*': ['docx_design.py', (step) => new RegExp(`ramp\\.get\\("${step}"`)],
  'design.numbering': ['docx_design.py', /self\.design\.get\("numbering"\)/],
  'design.numbering.*': ['docx_design.py', /n\.get\(self\.locale\)/],
  'design.h1_rule': ['docx_design.py', /T\.design\.get\("h1_rule"\) == "above"/],
  'design.title_block': ['docx_design.py', /self\.design\.get\("title_block"\)/],
  'design.contents': ['docx_design.py', /T\.design\.get\("contents"\)/],
  'design.summary_form': ['docx_design.py', /T\.design\.get\("summary_form"\)/],
  'design.conclusion_first': ['docx_design.py', /T\.design\.get\("conclusion_first"\)/],
  'design.running_head.*': ['docx_design.py', (where) => new RegExp(`rh\\.get\\("${where}"`)],
  'design.justify': ['docx_design.py', /self\.design\.get\("justify"/],
  'design.palette.*': ['docx_design.py', (role) => new RegExp(`pal\\.get\\("${role}"`)],
  'design.accent_on': ['docx_design.py', /self\.design\.get\("accent_on"\)/],
  'design.page_geometry.columns': ['docx_design.py', /\.get\("columns", 1\)/],
  'design.page_geometry.column_gap_cm': ['docx_design.py', /\.get\("column_gap_cm"/],
  'design.components.allowed': ['docx_design.py', /self\.components\.get\("allowed"\)/],
  'design.components.callout_max': ['docx_design.py', /T\.components\.get\("callout_max"\)/],
  'design.components.keyfigures.per_row': ['docx_design.py', /cfg\.get\("per_row"/],
  'design.components.sidebar.default_width': ['docx_design.py', /cfg\.get\("default_width"/],
  'design.components.sidebar.float': ['docx_design.py', /cfg\.get\("float"/],
  'design.figure_style.max_height_ratio': ['docx_design.py', /\.get\("max_height_ratio"/],
  'design.spacing': ['docx_design.py', /self\.design\.get\("spacing"\) == "tight"/],
};
// Labels of the file itself: the engine finds a look by its file name and never reads these.
const DOC_LABELS = {
  schema_version: 'the version of the file layout',
  tonality: 'the display name; the look is found by its file name',
  summary: 'one line for a reader choosing a look',
};

function flatten(value, prefix, depth, out = []) {
  for (const [key, inner] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (inner && typeof inner === 'object' && !Array.isArray(inner) && depth > 1) flatten(inner, path, depth - 1, out);
    else out.push(path);
  }
  return out;
}

function unread(files, reads, labels, scriptDir) {
  const problems = [];
  for (const [file, value] of files) {
    for (const path of flatten(value, '', reads.depth)) {
      if (labels[path]) continue;
      const wildcard = path.includes('.') ? `${path.slice(0, path.lastIndexOf('.'))}.*` : null;
      const entry = reads.map[path] || (wildcard && reads.map[wildcard]);
      if (!entry) { problems.push(`${file}: ${path} is read nowhere in the engine`); continue; }
      const [script, expression] = entry;
      const pattern = typeof expression === 'function' ? expression(path.slice(path.lastIndexOf('.') + 1)) : expression;
      if (!pattern.test(readFileSync(join(scriptDir, script), 'utf8'))) problems.push(`${file}: ${path} lost its reader in ${script} (${pattern})`);
    }
  }
  return problems;
}

test('every key a deck look sets is read by the engine', () => {
  const registry = require(join(pptx, 'scripts/lib/template-registry.js'));
  const ids = registry.listTonalities();
  assert.equal(ids.length, 8);
  const packs = ids.map((id) => [`${id}/pack.yaml`, registry.loadPack(id)]);
  assert.deepEqual(unread(packs, { map: DECK_READS, depth: 2 }, {}, join(pptx, 'scripts')), []);
});

test('every key a document look sets is read by the engine', () => {
  const dir = join(docx, 'templates/tonalities');
  const names = readdirSync(dir).filter((name) => name.endsWith('.yaml')).sort();
  assert.equal(names.length, 6);
  const python = require(join(pptx, 'scripts/deps.cjs')).python();
  const parsed = spawnSync(python, ['-c', 'import json,sys,yaml\nprint(json.dumps([yaml.safe_load(open(f, encoding="utf-8")) for f in sys.argv[1:]]))', ...names.map((name) => join(dir, name))], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(parsed.status, 0, parsed.stderr);
  const looks = JSON.parse(parsed.stdout).map((look, i) => [names[i], look]);
  assert.deepEqual(unread(looks, { map: DOC_READS, depth: Infinity }, DOC_LABELS, join(docx, 'scripts')), []);
});
