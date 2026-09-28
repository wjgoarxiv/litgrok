// Assemble the page program: the page sources in dependency order, plus the Node-side text and
// seed functions injected by source so both sides classify scripts and pin sub-samples identically.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_ROOT } from './fonts.mjs';
import { subSampleTime } from './seed.mjs';
import { isHangul, scriptRuns } from './text.mjs';
import { PASS_CAPS } from './constants.mjs';

const ORDER = ['util.js', 'gl.js', 'post.js', 'passes.js', 'type.js', 'stroke.js', 'scenes.js', 'engine.js'];

export function pageProgram() {
  const shared = [
    `const PASS_LIMITS = Object.freeze(${JSON.stringify({ crtFlicker: PASS_CAPS.crtFlicker })});`,
    isHangul.toString(),
    'const isLatinLetter = (char) => /\\p{Script=Latin}/u.test(char);',
    `function charClass(char) { if (isHangul(char)) return 'hangul'; if (isLatinLetter(char)) return 'latin'; return null; }`,
    scriptRuns.toString(),
    subSampleTime.toString(),
  ].join('\n');
  const sources = ORDER.map((name) => `// ---- ${name}\n${readFileSync(join(SKILL_ROOT, 'scripts', 'page', name), 'utf8')}`);
  return `(() => {\n'use strict';\n${shared}\n${sources.join('\n')}\n})();\ntrue;`;
}
