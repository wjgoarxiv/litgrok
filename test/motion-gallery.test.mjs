// lit-typographic-motion styles: the demo treatment validates in every house style and format,
// the demo page carries the scaffold's words and drawings, and the gallery renders every board.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveChrome } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';
import { composeBoards, demoPage, demoTreatment } from '../.grok/skills/lit-typographic-motion/scripts/lib/gallery.mjs';
import { decodePng, encodePng } from '../.grok/skills/lit-typographic-motion/scripts/lib/png.mjs';
import { STYLE_IDS } from '../.grok/skills/lit-typographic-motion/scripts/lib/styles.mjs';
import { validateTreatment } from '../.grok/skills/lit-typographic-motion/scripts/lib/treatment.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const motion = join(root, '.grok/skills/lit-typographic-motion/scripts/motion.mjs');
const CHROME = resolveChrome(process.env);
const NO_CHROME = CHROME ? false : 'Chrome is needed for the gallery render';

const temps = [];
after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });
const temp = (prefix) => { const dir = mkdtempSync(join(tmpdir(), prefix)); temps.push(dir); return dir; };

describe('the style demo', () => {
  test('the same demo validates in every house style, landscape and vertical', () => {
    for (const id of STYLE_IDS) {
      for (const format of ['16:9', '9:16']) {
        const t = demoTreatment(id, format);
        assert.equal(validateTreatment(t).ok, true, `${id} ${format}: ${validateTreatment(t).message}`);
      }
    }
  });

  test('the demo page shows one copy line per shot inside its type zone', () => {
    const t = demoTreatment('swiss-signal');
    const html = demoPage(t);
    assert.equal((html.match(/id="dl\d"/gu) ?? []).length, 4, 'four copy lines');
    assert.equal((html.match(/\(s, t\) => \{/gu) ?? []).length, 4, 'four DRAW functions, one per shot');
    assert.ok(html.includes('const SHOTS = [[0,3],[3,6],[6,9],[9,12]]'), 'the shot map');
    for (const line of t.copy.lines) assert.ok(html.includes(`>${line}</p>`), line);
    assert.doesNotMatch(html, /importmap|WORLD/, 'the flat demo has no 3D world');
  });

  test('boards compose into one sheet at their own size', () => {
    const a = encodePng(Buffer.alloc(4 * 4 * 4, 200), 4, 4);
    const sheet = composeBoards([a, a, a]);
    assert.deepEqual([decodePng(sheet).width, decodePng(sheet).height], [8, 8], 'two columns, two rows');
  });
});

describe('the styles command', { skip: NO_CHROME }, () => {
  test('every house style passes its board check and lands on the sheet', { timeout: 280000 }, async () => {
    const out = temp('lgm-styles-');
    const cache = temp('lgm-styles-cache-');
    const result = spawnSync(process.execPath, [motion, 'styles', '--out', out], {
      encoding: 'utf8',
      env: { ...process.env, LITGROK_MOTION_CACHE: cache, CHROME_PATH: CHROME, PATH: process.env.PATH },
      timeout: 270000,
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /STYLES:/);
    for (const id of STYLE_IDS) {
      assert.match(result.stdout, new RegExp(`${id}: board check PASS`), result.stdout);
      assert.ok(existsSync(join(out, id, 'stills', 'board.png')), id);
    }
    const sheet = decodePng(readFileSync(join(out, 'styles.png')));
    assert.deepEqual([sheet.width, sheet.height], [3840, 2160]);
  });
});
