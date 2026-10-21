import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const directory = dirname(fileURLToPath(import.meta.url));
const deps = require('../../lit-pptx/scripts/deps.cjs');
const proc = require('../../lit-pptx/scripts/proc.cjs');
const [name, ...args] = process.argv.slice(2);
const allowed = new Set(['convert_md_to_docx.py', 'convert_md_to_pdf.py', 'convert_pdf.py', 'edit_docx.py', 'clean_markdown.py', 'embed_images.py', 'slop_lint.py', 'visual_audit.py', 'generate_docx_templates.py', 'docx_gate.py']);

if (name === 'doctor') {
  console.log(`python: ${deps.ready('python') ? 'ready' : 'first-use install needed'}`);
  for (const executable of ['pandoc', 'xelatex', 'soffice']) {
    console.log(`${executable}: ${proc.which(executable) ?? 'unavailable (optional)'}`);
  }
} else if (allowed.has(name)) {
  // The installed skill folder stays free of bytecode caches.
  process.exit(proc.runScript(deps.python(), join(directory, name), args));
} else {
  console.error('Usage: node run.mjs doctor | <packaged Python script> [arguments]');
  process.exit(2);
}
