// Brief -> timeline. Tier 1 paces every unit at 1.25x its reading floor and snaps each cut forward
// to the beat grid (MO-A-09..16). Tier 2 swaps the fixed-BPM grid for an analysed beat list. The
// anchor-and-snap method is re-implemented from pdoom-video's timeline idea against this brief's
// own text; no upstream timeline content is used.
import { FRAME, RENDER, TIMING } from './constants.mjs';
import { eojeol, isHangul, plain, readingFloor, scriptOf, smart } from './text.mjs';

const SCENES = Object.freeze(['title-slam', 'karaoke-line', 'kinetic-list', 'number-counter', 'stroke-signature', 'end-card']);
export const STARTER_SCENES = SCENES;

const hasHangul = (text) => Array.from(String(text)).some(isHangul);
const cleanText = (value) => (typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : '');

// A brief is JSON (title, lines, list, counter, signature, end, style, prompt, bpm, seed, audio,
// shots) or plain text (first line = title, the rest = lines). Brief text is data, never commands.
export function normalizeBrief(raw) {
  const brief = typeof raw === 'string' ? briefFromText(raw) : { ...raw };
  const out = {
    title: cleanText(brief.title),
    lines: (Array.isArray(brief.lines) ? brief.lines : []).map(cleanText).filter(Boolean),
    list: (Array.isArray(brief.list) ? brief.list : []).map(cleanText).filter(Boolean),
    counter: brief.counter && Number.isFinite(Number(brief.counter.value)) ? { value: Math.round(Number(brief.counter.value)), label: cleanText(brief.counter.label) } : null,
    signature: cleanText(brief.signature),
    end: brief.end ? { title: cleanText(brief.end.title), note: cleanText(brief.end.note) } : null,
    style: brief.style ? String(brief.style) : null,
    prompt: cleanText(brief.prompt),
    bpm: brief.bpm === undefined ? null : Number(brief.bpm),
    seed: brief.seed === undefined ? RENDER.defaultSeed : Number(brief.seed) >>> 0,
    audio: brief.audio ? String(brief.audio) : null,
    annotations: brief.annotations === true,
    shots: Array.isArray(brief.shots) ? brief.shots : null,
  };
  if (out.bpm !== null && !(out.bpm >= 40 && out.bpm <= 220)) throw new Error('brief bpm must be between 40 and 220');
  if (!out.title && out.lines.length === 0 && !out.shots) throw new Error('brief needs a title, lines, or shots');
  if (out.counter && Math.abs(out.counter.value) > 9_999_999) throw new Error('counter value must stay within 7 digits');
  return out;
}

function briefFromText(text) {
  const rows = String(text).split(/\r?\n/u).map((row) => row.trim()).filter(Boolean);
  return { title: rows[0] ?? '', lines: rows.slice(1) };
}

// Default shot list: title slam, one karaoke line per line, optional list, counter and signature,
// then an end card. An explicit `shots` array (scene + text) overrides the default order.
export function shotSpecs(brief) {
  if (brief.shots) {
    return brief.shots.map((shot, index) => {
      const scene = String(shot.scene ?? '');
      if (!SCENES.includes(scene)) throw new Error(`shots[${index}].scene must be one of ${SCENES.join(', ')}`);
      return { scene, text: cleanText(shot.text), items: (shot.items ?? []).map(cleanText).filter(Boolean), value: shot.value, label: cleanText(shot.label), note: cleanText(shot.note) };
    });
  }
  const specs = [];
  if (brief.title) specs.push({ scene: 'title-slam', text: brief.title });
  for (const line of brief.lines) specs.push({ scene: 'karaoke-line', text: line });
  if (brief.list.length >= 2) specs.push({ scene: 'kinetic-list', items: brief.list.slice(0, 5) });
  if (brief.counter) specs.push({ scene: 'number-counter', value: brief.counter.value, label: brief.counter.label });
  if (brief.signature) specs.push({ scene: hasHangul(brief.signature) ? 'karaoke-line' : 'stroke-signature', text: brief.signature });
  const end = brief.end ?? { title: brief.title || brief.lines.at(-1), note: '' };
  specs.push({ scene: 'end-card', text: end.title, note: end.note });
  return specs;
}

// Voices per preset (MO-B-01..03) and per script run. Terminal Hangul lines use Galmuri for the
// whole line so Galmuri and VT323 never share a line (MO-FT-07); long Hangul running text falls
// back to the body face (MO-FT-05 legibility).
export function voiceFonts(preset, voice, text) {
  const hangul = hasHangul(text);
  if (voice === 'machine') return { latin: 'meslo', hangul: 'hangul-400' };
  if (voice === 'chrome') return { latin: 'silkscreen-400', hangul: 'hangul-400' };
  if (voice === 'stroke') return { latin: preset === 'tidal' ? 'ems-allure' : preset === 'terminalcore' ? 'ems-tech' : 'ems-readability', hangul: null };
  if (preset === 'terminalcore') {
    if (!hangul) return { latin: 'vt323', hangul: null };
    const long = Array.from(text).length > 24 || eojeol(text).length > 6;
    return long ? { latin: 'archivo-100-400', hangul: 'hangul-400' } : { latin: 'galmuri9', hangul: 'galmuri9' };
  }
  if (voice === 'display') return { latin: 'archivo-100-900', hangul: 'hangul-700' };
  return { latin: preset === 'tidal' ? 'archivo-100-400' : 'archivo-100-700', hangul: preset === 'tidal' ? 'hangul-400' : 'hangul-700' };
}

function textForVoice(preset, voice, text) {
  const value = smart(text);
  return preset === 'terminalcore' || voice === 'machine' ? plain(value) : value;
}

// Beat grid: fixed BPM (Tier 1) or analysed beats (Tier 2). indexAtOrAfter never moves a cut
// earlier than the reading floor wants (MO-A-15: snap forward only).
export function beatGrid({ bpm, beats }) {
  if (beats && beats.length >= 2) {
    const sorted = [...beats].filter((beat) => Number.isFinite(beat) && beat >= 0).sort((a, b) => a - b);
    const lastGap = sorted.at(-1) - sorted.at(-2);
    return {
      kind: 'beats',
      beats: sorted,
      beatAt(index) { return index < sorted.length ? sorted[index] : sorted.at(-1) + (index - sorted.length + 1) * lastGap; },
      indexAtOrAfter(time) { let i = 0; while (this.beatAt(i) < time - 1e-9) i += 1; return i; },
    };
  }
  const beat = 60 / bpm;
  return {
    kind: 'bpm',
    bpm,
    beatAt(index) { return index * beat; },
    indexAtOrAfter(time) { return Math.max(0, Math.ceil(time / beat - 1e-9)); },
  };
}

const toFrame = (seconds, fps) => Math.round(seconds * fps);

export function buildTimeline(brief, { fps = FRAME.fps, preset, beats = null, holdScale = 1 } = {}) {
  const bpm = brief.bpm ?? RENDER.defaultBpm;
  const grid = beatGrid({ bpm, beats });
  const specs = shotSpecs(brief);
  const shotCounts = new Map();
  const timeline = [];
  const shots = [];
  let beatIndex = 0;
  for (const [index, spec] of specs.entries()) {
    const shotIndex = shotCounts.get(spec.scene) ?? 0;
    shotCounts.set(spec.scene, shotIndex + 1);
    // The film always opens at 0; every later shot starts on a beat (a late first beat never
    // leaves empty frames at the head).
    const start = index === 0 ? 0 : grid.beatAt(beatIndex);
    const shot = planShot(spec, { preset, start, index, count: specs.length, annotations: brief.annotations });
    // Hold = max(1.25 x floor, 2 beats, what the reveals need), scaled up toward the treatment's
    // duration target (never below the floor); the end snaps forward to a beat.
    const minEndIndex = beatIndex + Math.max(TIMING.minSceneBeats, shot.minBeats ?? 0);
    let endIndex = Math.max(minEndIndex, grid.indexAtOrAfter(start + shot.needSec * holdScale));
    const end = grid.beatAt(endIndex);
    const startFrame = toFrame(start, fps);
    const endFrame = toFrame(end, fps);
    shot.id = shotIndex === 0 ? spec.scene : `${spec.scene}-${shotIndex}`;
    Object.assign(shot, { sceneId: spec.scene, shotIndex, start: startFrame / fps, end: endFrame / fps, beatSec: start, startFrame, endFrame });
    timeline.push({ id: shot.id, sceneId: spec.scene, shotIndex, start: shot.start, end: shot.end, holdSec: round6(shot.end - shot.start), kind: 'line', text: shot.text, script: scriptOf(shot.text), beatSec: round6(start) });
    for (const [stepIndex, step] of shot.steps.entries()) {
      const stepStartFrame = startFrame + toFrame(step.offset, fps);
      const next = shot.steps[stepIndex + 1];
      const stepEndFrame = next ? startFrame + toFrame(next.offset, fps) : endFrame;
      step.startFrame = stepStartFrame;
      step.endFrame = stepEndFrame;
      timeline.push({ id: `${shot.id}/r${stepIndex}`, sceneId: spec.scene, shotIndex, start: stepStartFrame / fps, end: stepEndFrame / fps, holdSec: round6((stepEndFrame - stepStartFrame) / fps), kind: 'reveal', text: step.text, script: scriptOf(step.text), beatSec: round6(start) });
    }
    shots.push(shot);
    beatIndex = endIndex;
  }
  const last = shots.at(-1);
  return {
    audioTier: grid.kind === 'beats' ? 'librosa-beat-grid' : 'text-reading-time',
    bpm: grid.kind === 'bpm' ? bpm : null,
    beatGrid: grid.kind === 'beats' ? grid.beats.filter((beat) => beat <= last.end + 1e-6) : null,
    fps,
    durationSec: last.end,
    totalFrames: last.endFrame,
    timeline,
    shots,
  };
}

const round6 = (value) => Math.round(value * 1e6) / 1e6;
const pace = (text, kind) => TIMING.generatorPace * readingFloor(text, kind);
const stepPace = (text) => Math.max(TIMING.generatorPace * TIMING.revealFloor, pace(text, 'word'));

function planShot(spec, { preset, index, count, annotations }) {
  const indexLabel = `${String(index + 1).padStart(2, '0')} — ${String(count).padStart(2, '0')}`;
  const base = { preset, annotation: annotations && preset !== 'terminalcore' ? indexLabel : null, steps: [] };
  if (spec.scene === 'title-slam') {
    const text = textForVoice(preset, 'display', spec.text);
    return { ...base, text, voice: 'display', fonts: voiceFonts(preset, 'display', text), needSec: Math.max(pace(text, 'line'), 2.4), minBeats: 4 };
  }
  if (spec.scene === 'karaoke-line' || spec.scene === 'stroke-signature') {
    const stroke = spec.scene === 'stroke-signature';
    const text = textForVoice(preset, stroke ? 'stroke' : 'body', spec.text);
    const words = eojeol(text);
    let offset = 0;
    const steps = stroke ? [] : words.map((word) => { const step = { text: word, offset }; offset += stepPace(word); return step; });
    const revealSec = stroke ? pace(text, 'line') * 0.8 : offset;
    return { ...base, text, voice: stroke ? 'stroke' : 'body', fonts: voiceFonts(preset, stroke ? 'stroke' : 'body', text), steps, revealSec, needSec: Math.max(pace(text, 'line'), revealSec + 0.9), minBeats: 3 };
  }
  if (spec.scene === 'kinetic-list') {
    const items = spec.items.map((item) => textForVoice(preset, 'body', item));
    const text = items.join(' / ');
    const longest = items.reduce((a, b) => (Array.from(b).length > Array.from(a).length ? b : a), '');
    let offset = 0;
    const steps = items.map((item) => { const step = { text: item, offset }; offset += Math.max(stepPace(item), 0.6); return step; });
    const fonts = voiceFonts(preset, 'body', items.some((item) => /[가-힣]/u.test(item)) ? `${longest} 가` : longest);
    return { ...base, text, items, voice: 'body', fonts, steps, needSec: Math.max(pace(text, 'line'), offset + 1.0), minBeats: 4 };
  }
  if (spec.scene === 'number-counter') {
    const label = textForVoice(preset, 'body', spec.label ?? '');
    const digits = String(spec.value);
    const text = label ? `${digits} ${label}` : digits;
    return { ...base, text, value: Number(spec.value), label, voice: 'machine', fonts: { number: voiceFonts(preset, 'machine', digits), label: voiceFonts(preset, 'body', label) }, needSec: Math.max(pace(text, 'line'), 2.4), minBeats: 4 };
  }
  const title = textForVoice(preset, 'display', spec.text ?? '');
  const note = textForVoice(preset, 'machine', spec.note ?? '');
  const text = note ? `${title} ${note}` : title;
  return { ...base, text, title, note, voice: 'display', fonts: { title: voiceFonts(preset, 'display', title), note: voiceFonts(preset, 'machine', note) }, needSec: Math.max(pace(text, 'line'), 2.4), minBeats: 4 };
}

// Every font key the plan will draw with; the pre-flight gate checks exactly these.
export function fontKeysForPlan(plan) {
  const keys = new Set();
  const addPair = (pair, text) => {
    if (!pair || !text) return;
    const script = scriptOf(text);
    if (pair.latin && script !== 'hangul') keys.add(pair.latin);
    if (script !== 'latin') keys.add(pair.hangul ?? pair.latin);
    if (script === 'hangul' && /[0-9A-Za-z]/u.test(text) && pair.latin) keys.add(pair.latin);
  };
  for (const shot of plan.shots) {
    if (shot.sceneId === 'number-counter') { addPair(shot.fonts.number, String(shot.value)); addPair(shot.fonts.label, shot.label); }
    else if (shot.sceneId === 'end-card') { addPair(shot.fonts.title, shot.title); addPair(shot.fonts.note, shot.note); }
    else addPair(shot.fonts, shot.text);
    if (shot.annotation) keys.add('meslo');
    if (shot.preset === 'terminalcore') { keys.add('silkscreen-400'); keys.add('meslo'); }
    if (shot.preset === 'swiss-signal' || shot.preset === 'tidal') {
      if (shot.voice === 'display' && scriptOf(shot.text) !== 'hangul') for (const width of [75, 100, 125]) keys.add(`archivo-${width}-900`);
    }
  }
  keys.delete(null);
  return [...keys].sort();
}
