import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const deps = require('./deps.cjs');
const proc = require('./proc.cjs');
const directory = dirname(fileURLToPath(import.meta.url));
const [name, ...args] = process.argv.slice(2);
const allowed = new Set(['qa_deck.py', 'validate_pptx.py', 'inventory.py', 'ooxml_integrity.py', 'embed_fonts.py', 'learn_template.py', 'deck_output.py', 'craft_extras.py']);

if (name === 'doctor') {
  console.log(`node: ${deps.supportsSlideNode() ? (deps.ready('node') ? 'ready' : 'first-use install needed') : 'Node.js 20.9+ required for slides'}`);
  console.log(`python: ${deps.ready('python') ? 'ready' : 'first-use install needed'}`);
  for (const executable of ['soffice', 'pandoc', 'xelatex']) {
    console.log(`${executable}: ${proc.which(executable) ?? 'unavailable (optional)'}`);
  }
} else if (allowed.has(name) && existsSync(join(directory, name))) {
  // The installed skill folder stays free of bytecode caches.
  process.exit(proc.runScript(deps.python(), join(directory, name), args));
} else {
  console.error('Usage: node run.mjs doctor | <packaged Python script> [arguments]');
  process.exit(2);
}
