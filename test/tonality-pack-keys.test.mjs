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

const DECK_READS = {
  id: ['lib/template-registry.js', /name: pack\.id,/],
  name: ['lib/template-registry.js', /name: pack\.name,/],
  version: ['lib/template-registry.js', /version: pack\.version,/],
  intent: ['compile-deck.js', /\$\{p\.intent\}/],
  canvas: ['lib/template-registry.js', /options\.canvas \|\| pack\.canvas\[0\]/],
  'faces.*': ['lib/template-registry.js', /FACES\[faceMap\[role\]\]/],
  'faces-a2z.*': ['lib/template-registry.js', /pack\["faces-a2z"\]/],
  'palette.*': ['lib/render-pack.js', /S\.colour\(/],
  ramp: ['lib/template-registry.js', /pack\.register === "bold" \? pack\.ramp/],
  register: ['lib/template-registry.js', /pack\.register === "bold"/],
  hero: ['lib/render-pack.js', /S\.pack\.hero \?/],
  'edge-weight': ['lib/render-pack.js', /S\.pack\["edge-weight"\]/],
  'edge-colour': ['lib/render-pack.js', /S\.pack\["edge-colour"\]/],
  'shadow.*': ['lib/render-pack.js', /S\.pack\.shadow/],
  'qa.*': ['craft_extras.py', /pack_allowances/],
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

// Labels of the file itself: the engine finds a look by its file name and never reads these.
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

const DECK_LABELS = {
  // Writer guidance on the sheet; the gate enforces the craft floor, not the avoid list.
  avoid: 'the pitfalls a writer checks a deck against; the tonality sheet repeats them under "Avoid"',
};
test('every key a deck look sets is read by the engine', () => {
  const registry = require(join(pptx, 'scripts/lib/template-registry.js'));
  const ids = registry.listTonalities();
  assert.equal(ids.length, 13);
  const packs = ids.map((id) => [`${id}/pack.yaml`, registry.loadPack(id)]);
  assert.deepEqual(unread(packs, { map: DECK_READS, depth: 2 }, DECK_LABELS, join(pptx, 'scripts')), []);
});

