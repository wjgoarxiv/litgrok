// `motion.mjs styles --out <dir> [--format 16:9|9:16]`: the style gallery. One short demo film, the
// same treatment and the same drawings, rendered as a board round in every house style, so a person
// can see what each style looks like before asking for a film. Each style's board lands in
// `<dir>/<style>/stills/board.png`, and `<dir>/styles.png` puts them side by side. The demo also
// proves the styles and the scaffold pass the board check as shipped.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EXIT } from './constants.mjs';
import { decodePng, encodePng } from './png.mjs';
import { scaffoldHtml } from './scaffold.mjs';
import { renderStage } from './stage.mjs';
import { STYLE_IDS, readStyle, zonesPx } from './styles.mjs';

const COPY = ['작게 시작해서 끝까지', 'One clock for every frame', '한 화면에 한 가지 생각', 'Same house, every film'];

/** The demo treatment for one style: four shots, one of each text layout, 12 s. */
export function demoTreatment(styleId, format = '16:9') {
  const style = readStyle(styleId);
  // The demo renders: the port synth plays the glass bed, so every style demos its glass variant.
  const bed = style.beds.find((b) => b.timbre === 'glass') ?? style.beds[0];
  const hand = (i) => style.transitions[i % style.transitions.length];
  const vertical = format === '9:16' ? ' vertical' : '';
  const beats = [
    { t0: 0, t1: 3, layout: 'title', hero: 'The opening line lands while a ring draws itself behind it.', purpose: 'Open on the promise.', onScreen: 'A ring drawing on behind the opening line.', motion: 'The ring draws on; the line rises in.', sound: 'Pad opens with a hit on the first word.' },
    { t0: 3, t1: 6, layout: 'split', hero: 'Five bars rise in turn beside the line.', purpose: 'Show the system.', onScreen: 'Five bars rising beside one line.', motion: 'Bars rise in stagger.', sound: 'Hit on the cut.' },
    { t0: 6, t1: 9, layout: 'split-alt', hero: 'A dot travels a path from left to right.', purpose: 'Show one idea per screen.', onScreen: 'A dot crossing a drawn path.', motion: 'The dot travels the path.', sound: 'A rise into the close.' },
    { t0: 9, t1: 12, layout: 'stage', hero: 'A grid of squares settles above the closing line.', purpose: 'Close on the house.', onScreen: 'A settling grid of squares over a closing caption.', motion: 'Squares settle in stagger.', sound: 'Closing cadence.' },
  ].map((b, i, all) => ({ ...b, lines: [i], transition: i === all.length - 1 ? 'end' : hand(i) }));
  return {
    // A calibration sheet, not a film: the same simple demo in every style, so the styles compare.
    // Minimal register: four plain shapes are negative space by design, and the board still judges
    // every text rule on them.
    request: `render a 12 s${vertical} simple demo film in the ${styleId} style`,
    register: 'minimal',
    genre: 'other', path: 'stage', pathReason: 'The demo draws shapes beside its type, which the type engine cannot draw.',
    style: styleId,
    idea: 'Four screens, one per layout, so the house style can be judged before a film is made.',
    audience: 'Someone choosing a house style for their films.', channel: 'A gallery sheet viewed before a film is made, played with sound.',
    format, formatReason: format === '9:16' ? 'The gallery shows the vertical layouts.' : 'The gallery shows the landscape layouts.',
    durationSec: 12, beats,
    story: { expect: 'Four screens that each show a new shape.', turn: 'The bars of the second screen become the path the dot travels on the third.', beat: 2, payoff: 'Everything settles into one grid above the closing line.' },
    protagonist: { name: 'the signal mark', kind: 'object', look: "The style's signal colour as a ring, bars, a dot and one accent square.", acts: [{ beat: 0, action: 'Draws itself as a ring.' }, { beat: 1, action: 'Rises as five bars.' }, { beat: 2, action: 'Travels the path as a dot.' }, { beat: 3, action: 'Lands as the accent square of the grid.' }] },
    subject: { name: 'the style demo', source: 'invented', specifics: ['Four screens with a ring, bars, a travelling dot and a grid.', 'Each screen uses one layout of the house grid.'] },
    visualDevices: [{ kind: 'shape', role: 'subject', beats: [0, 1, 2, 3] }, { kind: 'path', role: 'support', beats: [2] }],
    palette: [{ hex: style.palette.ground, role: 'ground' }, { hex: style.palette.ink, role: 'ink' }, { hex: style.palette.signal, role: 'signal' }],
    typePlan: { faces: [style.faces.headline.family, style.faces.body.family], hierarchy: 'One line per screen in the style\u2019s headline or display size.', maxWordsOnScreen: 6 },
    sound: { mode: 'generated', plan: 'The style\u2019s glass bed with a hit on the cuts and a closing cadence.', palette: { ...bed }, events: [{ t: 1.5, on: 'the ring draws itself behind the opening line', kind: 'tap' }, { t: 7.5, on: 'the dot travels the path', kind: 'whoosh' }] },
    copy: { source: 'invented', lines: COPY },
    inventions: ['the style demo (its four screens)', 'all four copy lines'],
    ambition: 'Each screen shows one layout cleanly so the style\u2019s type, colour and motion read at a glance.',
  };
}

// The demo's drawings: generic shapes in the style's own colours, one per shot, posed by the shot's
// own progress so every replay draws the same pixels. Each shot's DRAW also shows its own copy line
// in the type zone and hides the other three, so the board reads one line per shot.
function demoDraw(treatment, style) {
  const zones = zonesPx(treatment.format);
  const pal = style.palette;
  const line = (i) => {
    const z = zones[treatment.beats[i].layout].type;
    return `<p class="lit-headline lit-ink" id="dl${i}" style="position:absolute;left:${z.x}px;top:${z.y}px;width:${z.w}px;opacity:0">${treatment.copy.lines[i]}</p>`;
  };
  const shapes = treatment.beats.map((b, i) => {
    const z = zones[b.layout].subject;
    const cx = z.x + z.w / 2, cy = z.y + z.h / 2;
    if (i === 0) {
      const r = Math.round(Math.min(z.w, z.h) * 0.3);
      return `<div id="dg0" style="position:absolute;left:${cx - r}px;top:${cy - r}px;width:${2 * r}px;height:${2 * r}px;border:10px solid ${pal.signal};border-radius:50%;box-sizing:border-box;opacity:0"></div>`;
    }
    if (i === 1) {
      const w = Math.round(z.w / 9);
      let bars = '';
      for (let k = 0; k < 5; k++) bars += `<div style="position:absolute;left:${k * 2 * w}px;bottom:0;width:${w}px;height:${Math.round(z.h * (0.3 + 0.14 * k))}px;background:${k === 4 ? pal.signal : pal.line}"></div>`;
      return `<div id="dg1" style="position:absolute;left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;opacity:0">${bars}</div>`;
    }
    if (i === 2) {
      const y = cy, w = Math.round(z.w * 0.8), x0 = Math.round(cx - w / 2);
      return `<div id="dg2" style="position:absolute;left:${z.x}px;top:${z.y}px;width:${z.w}px;height:${z.h}px;opacity:0"><div style="position:absolute;left:${x0}px;top:${y}px;width:${w}px;height:6px;background:${pal.line}"></div><div id="dg2dot" style="position:absolute;left:${x0}px;top:${y - 17}px;width:40px;height:40px;border-radius:50%;background:${pal.signal}"></div></div>`;
    }
    const n = 3, gap = 18, cell = Math.min(Math.round((z.w - gap * (n - 1)) / n), Math.round((z.h - gap * (n - 1)) / n));
    let cells = '';
    for (let ky = 0; ky < n; ky++) for (let kx = 0; kx < n; kx++) cells += `<div style="position:absolute;left:${kx * (cell + gap)}px;top:${ky * (cell + gap)}px;width:${cell}px;height:${cell}px;background:${kx === 2 && ky === 2 ? pal.signal : pal.surface};border:2px solid ${pal.line};box-sizing:border-box"></div>`;
    const gw = n * cell + (n - 1) * gap;
    return `<div id="dg3" style="position:absolute;left:${Math.round(cx - gw / 2)}px;top:${Math.round(cy - gw / 2)}px;width:${gw}px;height:${gw}px;opacity:0">${cells}</div>`;
  });
  const fns = treatment.beats.map((b, i) => `    // shot ${i + 1} (${b.layout}): ${b.hero.replace(/\*\//gu, '* /')}
    (s, t) => {
      for (let k = 0; k < ${treatment.beats.length}; k++) {
        document.getElementById('dl' + k).style.opacity = k === ${i} ? '1' : '0';
        document.getElementById('dg' + k).style.opacity = k === ${i} ? '1' : '0';
      }${i === 2 ? "\n      document.getElementById('dg2dot').style.left = (s.p * 100).toFixed(2) + '%';" : ''}
    },`);
  return { lines: treatment.beats.map((_, i) => line(i)).join('\n'), shapes: shapes.join('\n'), fns };
}

/** The demo page: the scaffold with its DRAW stubs replaced by the demo's drawings and copy lines. */
export function demoPage(treatment) {
  const style = readStyle(treatment.style);
  const { lines, shapes, fns } = demoDraw(treatment, style);
  let n = 0;
  return scaffoldHtml(treatment)
    .replace('<body>\n', `<body>\n${lines}\n${shapes}\n`)
    .replace(/    \/\/ shot \d+( \([a-z-]+\))?: [^\n]*\n    \(s, t\) => \{\},/gu, () => fns[n++] ?? '');
}

/** Render the gallery: a board round per style, then one sheet of the boards. */
export async function stylesCommand({ out, format = '16:9', env = process.env, log = () => {} }) {
  if (!['16:9', '9:16'].includes(format)) return { code: EXIT.USAGE, message: '--format is 16:9 or 9:16' };
  mkdirSync(out, { recursive: true });
  const boards = [];
  const verdicts = [];
  for (const id of STYLE_IDS) {
    const dir = path.join(out, id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(path.join(dir, 'stage'), { recursive: true });
    const treatment = demoTreatment(id, format);
    writeFileSync(path.join(dir, 'treatment.json'), `${JSON.stringify(treatment, null, 2)}\n`);
    writeFileSync(path.join(dir, 'stage', 'index.html'), demoPage(treatment));
    log(`styles: rendering the ${id} board`);
    const r = await renderStage({ out: dir, treatment, round: 1, stillsOnly: true, env, log });
    verdicts.push(`${id}: ${r.exitCode === EXIT.OK ? 'board check PASS' : r.message.split(';')[0]}`);
    boards.push(readFileSync(path.join(dir, 'stills', 'board.png')));
  }
  const file = path.join(out, 'styles.png');
  writeFileSync(file, composeBoards(boards));
  const failed = verdicts.filter((v) => !/PASS$/u.test(v));
  return { code: failed.length ? EXIT.GATE_FAIL_QA : EXIT.OK, message: `STYLES: ${file}\n${verdicts.join('\n')}` };
}

/** One sheet of board stills, two columns, at the boards' own size. */
export function composeBoards(pngs) {
  const decoded = pngs.map((buf) => decodePng(buf));
  const w = decoded[0].width, h = decoded[0].height;
  const cols = 2, rows = Math.ceil(decoded.length / cols);
  const sheet = Buffer.alloc(cols * w * rows * h * 4, 0);
  decoded.forEach((b, i) => {
    const dx = (i % cols) * w, dy = Math.floor(i / cols) * h;
    const src = b.channels === 4 ? b.pixels : toRgba(b.pixels, b.channels);
    for (let y = 0; y < Math.min(h, b.height); y++) {
      for (let x = 0; x < Math.min(w, b.width); x++) {
        const from = (y * b.width + x) * 4, to = ((dy + y) * cols * w + dx + x) * 4;
        sheet[to] = src[from]; sheet[to + 1] = src[from + 1]; sheet[to + 2] = src[from + 2]; sheet[to + 3] = src[from + 3];
      }
    }
  });
  return encodePng(sheet, cols * w, rows * h);
}

function toRgba(pixels, channels) {
  const n = pixels.length / channels;
  const out = Buffer.alloc(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = pixels[i * channels];
    out[i * 4 + 1] = pixels[i * channels + (channels >= 3 ? 1 : 0)];
    out[i * 4 + 2] = pixels[i * channels + (channels >= 3 ? 2 : 0)];
    out[i * 4 + 3] = 255;
  }
  return out;
}
