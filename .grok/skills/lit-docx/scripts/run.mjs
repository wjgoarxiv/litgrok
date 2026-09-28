import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const directory = dirname(fileURLToPath(import.meta.url));
const deps = require('../../lit-pptx/scripts/deps.cjs');
const [name, ...args] = process.argv.slice(2);
const allowed = new Set(['convert_md_to_docx.py', 'convert_md_to_pdf.py', 'convert_pdf.py', 'edit_docx.py', 'clean_markdown.py', 'embed_images.py', 'slop_lint.py', 'visual_audit.py', 'generate_docx_templates.py']);

if (name === 'doctor') {
  console.log(`python: ${deps.ready('python') ? 'ready' : 'first-use install needed'}`);
  for (const executable of ['pandoc', 'xelatex', 'soffice']) {
    const result = spawnSync('which', [executable], { encoding: 'utf8' });
    console.log(`${executable}: ${result.status === 0 ? result.stdout.trim() : 'unavailable (optional)'}`);
  }
} else if (allowed.has(name)) {
  const result = spawnSync(deps.python(), [join(directory, name), ...args], { stdio: 'inherit', env: process.env });
  process.exit(result.status ?? 1);
} else {
  console.error('Usage: node run.mjs doctor | <packaged Python script> [arguments]');
  process.exit(2);
}
