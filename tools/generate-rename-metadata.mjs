#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureProduct } from './check-payload-substance.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Usage: generate-rename-metadata.mjs [--check]');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
function save(path, content) {
  if (read(path) === content) return;
  if (check) throw new Error(`RENAME_METADATA_STALE: ${path}`);
  writeFileSync(join(ROOT, path), content);
}

// Historical ownership bytes never come from the renamed working tree.
const historical = '975f05b';
const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', historical, '--', '.grok'], { cwd: ROOT }).toString().split('\0').filter(Boolean);
const changed = {};
const retired = {};
for (const path of paths.sort()) {
  const old = execFileSync('git', ['show', `${historical}:${path}`], { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 });
  const relative = path.slice('.grok/'.length);
  if (!existsSync(join(ROOT, path))) retired[relative] = sha256(old);
  else if (sha256(readFileSync(join(ROOT, path))) !== sha256(old)) changed[relative] = sha256(old);
}
// lit-korean shipped after the locked pre-manifest snapshot above, so retain
// its last shipped bytes as the ownership receipt for older installs.
const laterRetiredBaselines = { 'skills/lit-korean/SKILL.md': 'b4c3cf6' };
for (const [relative, revision] of Object.entries(laterRetiredBaselines)) {
  const path = `.grok/${relative}`;
  if (existsSync(join(ROOT, path))) continue;
  const old = execFileSync('git', ['show', `${revision}:${path}`], { cwd: ROOT, maxBuffer: 10 * 1024 * 1024 });
  retired[relative] = sha256(old);
}
let installer = read('bin/litgrok.mjs');
for (const [name, hashes] of [['PRE_MANIFEST_PAYLOAD_HASHES', changed], ['PRE_MANIFEST_LEGACY_PAYLOAD_HASHES', retired]]) {
  const rows = Object.entries(hashes).map(([path, hash]) => `  '${path}': '${hash}',`).join('\n');
  installer = installer.replace(new RegExp(`const ${name} = Object\\.freeze\\(\\{[\\s\\S]*?\\n\\}\\);`), `const ${name} = Object.freeze({\n${rows}\n});`);
}
save('bin/litgrok.mjs', installer);

// Translate the locked family snapshot; measure this repository only. A family
// freshness audit still requires an explicit --family-root after all lanes finish.
const renames = {
  hyperplan: 'lit-crucible', 'init-deep': 'lit-init', 'git-master': 'lit-commit',
  teammode: 'lit-team', 'remove-ai-slops': 'lit-burnoff', 'ai-slop-remover': 'lit-burnoff-file',
  'text-naturalization': 'lit-humanizer', 'lit-korean': 'lit-humanizer',
  'korean-ai-slop-remover': 'lit-humanizer',
  programming: 'lit-code',
};
const canonical = (name) => renames[name] ?? name;
const manifestPath = 'tools/payload-substance-parity.json';
const manifest = JSON.parse(read(manifestPath));
manifest.renameMigration ??= {
  date: '2026-09-05',
  siblingSnapshotDate: manifest.generatedAt,
  note: 'Sibling counts are the recorded snapshot translated through the locked rename table; only p33 is remeasured locally. Cross-repository freshness remains a separate explicit audit.',
};
manifest.generatedAt = '2026-09-05';
for (const product of Object.values(manifest.products)) {
  product.skills = product.skills.map(canonical).sort();
  if (new Set(product.skills).size !== product.skills.length) throw new Error('RENAME_INVENTORY_COLLISION');
  product.inventory = { count: product.skills.length, sha256: sha256(JSON.stringify(product.skills)) };
}
const merged = {};
for (const [name, entry] of Object.entries(manifest.skills)) {
  const key = canonical(name);
  merged[key] ??= { closures: {} };
  for (const [product, closure] of Object.entries(entry.closures)) {
    if (Object.hasOwn(merged[key].closures, product)) throw new Error(`RENAME_CLOSURE_COLLISION: ${key}/${product}`);
    merged[key].closures[product] = closure;
  }
}
const local = measureProduct(ROOT, { id: 'p33', packageRelative: [], skillRootRelative: '.grok/skills', packPrefix: '.grok/skills' });
const names = [...local.skills.keys()].sort();
manifest.products.p33 = { skills: names, inventory: { count: names.length, sha256: sha256(JSON.stringify(names)) } };
manifest.skills = Object.fromEntries(Object.entries(merged).sort(([left], [right]) => left.localeCompare(right)).map(([name, entry]) => {
  if (Object.hasOwn(entry.closures, 'p33')) {
    if (!local.skills.has(name)) throw new Error(`RENAME_SKILL_MISSING: ${name}`);
    entry.closures.p33 = local.skills.get(name).closure;
  }
  const closures = Object.fromEntries(Object.entries(entry.closures).sort());
  const values = Object.values(closures).sort((left, right) => left - right);
  return [name, { median: values[Math.floor(values.length / 2)], closures }];
}));
save(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`RENAME_METADATA_PASS: historicalChanged=${Object.keys(changed).length} historicalRetired=${Object.keys(retired).length} skills=${names.length} parityRows=${Object.keys(manifest.skills).length}\n`);
