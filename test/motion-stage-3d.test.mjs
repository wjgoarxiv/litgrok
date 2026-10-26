// lit-typographic-motion depth 3d: a scaffolded three.js world renders a full film on the rung the
// treatment asks for, the determinism replay matches on that rung, the QA reads the DOM copy over
// the canvas, and the protagonist is drawn pixels, not a promise.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveChrome } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';
import { decodePng } from '../.grok/skills/lit-typographic-motion/scripts/lib/png.mjs';
import { scaffoldHtml } from '../.grok/skills/lit-typographic-motion/scripts/lib/scaffold.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const motion = join(root, '.grok/skills/lit-typographic-motion/scripts/motion.mjs');
const CHROME = resolveChrome(process.env);
const NO_TOOLS = CHROME && (() => { try { return spawnSync('ffmpeg', ['-version']).status === 0; } catch { return false; } })() ? false : 'Chrome and ffmpeg are needed for the 3D film render';

const temps = [];
after(() => { for (const dir of temps) rmSync(dir, { recursive: true, force: true }); });
const temp = (prefix) => { const dir = mkdtempSync(join(tmpdir(), prefix)); temps.push(dir); return dir; };

const treatment = () => ({
  request: '"네모가 돌아서서" "앞을 보여준다" 이 문장으로 둥근 도형이 움직이는 영상 만들어줘, 소리 없이 lit',
  register: 'minimal',
  genre: 'other', path: 'stage', pathReason: 'The film draws shapes that move, not only words.',
  idea: 'A teal block turns above two lines until it settles.',
  audience: 'Test viewers', channel: 'Local playback',
  format: '16:9', formatReason: 'Local playback is landscape.', durationSec: 4, fps: 30,
  story: { expect: 'Viewers expect a clock face that simply runs.', turn: 'A block turns above the lines instead of ticking.', beat: 1, payoff: 'The block settles facing front.' },
  protagonist: { name: '도형', kind: 'object', look: 'A teal block, fist-sized in frame, turning above two lines.', acts: [{ beat: 0, action: 'Starts turned away.' }, { beat: 1, action: 'Turns to face front.' }, { beat: 2, action: 'Settles facing front.' }] },
  subject: { name: '도형', source: 'user', specifics: [] },
  beats: [[0, 1.33], [1.33, 2.66], [2.66, 4]].map(([t0, t1], i) => ({ t0, t1, purpose: ['open', 'develop', 'land'][i], onScreen: 'the block and a line', motion: 'turning', sound: 'none' })),
  visualDevices: [{ kind: 'depth3d', role: 'subject', beats: [0, 1, 2] }, { kind: 'shape', role: 'support', beats: [0, 1, 2] }],
  depth: '3d',
  palette: [{ hex: '#101418', role: 'ground' }, { hex: '#f4f1ea', role: 'ink' }, { hex: '#2bb3a3', role: 'signal' }],
  typePlan: { faces: ['Archivo', 'Pretendard'], hierarchy: 'One line at a time.', maxWordsOnScreen: 6 },
  sound: { mode: 'generated', plan: 'A glass pulse under the turning block.', palette: { key: 'A', mode: 'minor', tempo: 104, timbre: 'glass' }, events: [{ t: 1.5, on: 'the block turns to face front', kind: 'tap' }, { t: 2.8, on: 'the block settles', kind: 'chime' }] },
  copy: { source: 'user', lines: ['네모가 돌아서서', '앞을 보여준다'] },
  inventions: [],
  ambition: 'The block reads as one object from every angle of its turn.',
});

const POSE = `(s, hero, cam, t) => { if (!hero.children.length) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0x2BB3A3, roughness: 0.4 })); m.position.y = 0.8; m.castShadow = true; hero.add(m); } hero.rotation.y = t * 0.8; },`;

/** The scaffold page with its WORLD stubs posed and the copy set as DOM text over the canvas. */
function page(treatment) {
  return scaffoldHtml(treatment)
    .replaceAll('(s, hero, cam, t) => {},', POSE)
    .replace('<body>\n', `<body>
<style>html,body{background:#101418}.line{position:absolute;left:200px;margin:0;font-size:84px;font-weight:700;font-family:Archivo,Pretendard;color:#f4f1ea}</style>
<h1 class="line" style="top:800px">네모가 돌아서서</h1>
<h1 class="line" style="top:895px">앞을 보여준다</h1>
`);
}

describe('a depth-3d film', { skip: NO_TOOLS }, () => {
  test('renders on its rung, replays identically, and draws its protagonist', { timeout: 280000 }, () => {
    const out = temp('lgm-stage-3d-');
    const cache = temp('lgm-stage-3d-cache-');
    const t = treatment();
    mkdirSync(join(out, 'stage'), { recursive: true });
    writeFileSync(join(out, 'treatment.json'), `${JSON.stringify(t, null, 2)}\n`);
    writeFileSync(join(out, 'stage', 'index.html'), page(t));
    const result = spawnSync(process.execPath, [motion, 'stage', '--out', out, '--round', '1'], {
      encoding: 'utf8', env: { ...process.env, LITGROK_MOTION_CACHE: cache, CHROME_PATH: CHROME, PATH: process.env.PATH }, timeout: 270000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const manifest = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
    assert.ok(['gpu', 'software'].includes(manifest.rung), `rung recorded, got ${manifest.rung}`);
    const index = JSON.parse(readFileSync(join(out, 'stills', 'index.json'), 'utf8'));
    assert.ok(index.stills.some((s) => s.file === 'stills/board.png' && s.kind === 'board'), 'the final render ships its storyboard');
    assert.match(manifest.renderer, new RegExp(`on the ${manifest.rung} rung \\(stage path\\)`), 'the report names the rung and the renderer');
    const report = readFileSync(join(out, 'gate-report.txt'), 'utf8');
    assert.match(report, /QA gate: PASS/, 'the text, fill and presence rules pass over the canvas');
    // The protagonist is drawn pixels: the mid-shot still is more than a dark frame with words.
    const still = decodePng(readFileSync(join(out, 'stills', 'beat-02-mid.png')));
    let drawn = 0;
    for (let i = 0; i < still.pixels.length; i += 4 * 997) {
      const [r, g, b] = [still.pixels[i], still.pixels[i + 1], still.pixels[i + 2]];
      if (Math.abs(r - 16) + Math.abs(g - 20) + Math.abs(b - 24) > 36) drawn += 1;
    }
    const share = drawn / (still.pixels.length / 4 / 997);
    assert.ok(share > 0.01, `the hero covers ${share.toFixed(3)} of the sampled frame`);
  });
});
