import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const deps = require('./deps.cjs');
const directory = dirname(fileURLToPath(import.meta.url));
const [name, ...args] = process.argv.slice(2);
const allowed = new Set(['qa_deck.py', 'validate_pptx.py', 'inventory.py', 'ooxml_integrity.py', 'embed_fonts.py', 'learn_template.py']);

if (name === 'doctor') {
  console.log(`node: ${deps.supportsSlideNode() ? (deps.ready('node') ? 'ready' : 'first-use install needed') : 'Node.js 20.9+ required for slides'}`);
  console.log(`python: ${deps.ready('python') ? 'ready' : 'first-use install needed'}`);
  for (const executable of ['soffice', 'pandoc', 'xelatex']) {
    const result = spawnSync('which', [executable], { encoding: 'utf8' });
    console.log(`${executable}: ${result.status === 0 ? result.stdout.trim() : 'unavailable (optional)'}`);
  }
} else if (allowed.has(name) && existsSync(join(directory, name))) {
  const result = spawnSync(deps.python(), [join(directory, name), ...args], { stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 1);
} else {
  console.error('Usage: node run.mjs doctor | <packaged Python script> [arguments]');
  process.exit(2);
}
