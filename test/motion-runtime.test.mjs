import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveChrome } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';
import { cacheRoot, PINS, sha256 } from '../.grok/skills/lit-typographic-motion/scripts/lib/fonts.mjs';
import { AUDIO_REQUIREMENTS, audioPins } from '../.grok/skills/lit-typographic-motion/scripts/lib/cache.mjs';

// A Chrome helper can flush its profile for a moment after the browser exits; teardown retries and
// never masks the test's own assertion.
const cleanup = (dir) => { try { rmSync(dir, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 }); } catch { /* reported by the leak check */ } };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = join(root, '.grok/skills/lit-typographic-motion');
const motion = join(skill, 'scripts/motion.mjs');
const bin = join(root, 'bin/litgrok.mjs');
const CHROME = resolveChrome(process.env);
const NO_CHROME = CHROME ? false : 'Chrome/Chromium not found on this host; set CHROME_PATH to run the browser checks';
const BANNER = /lit-typographic-motion \(LitGrok\) — film director: treatment first, then the type or stage path/;
const BRIEF = { title: 'Pulse Check', end: { title: 'Pulse Check' }, annotations: false, bpm: 200, seed: 11 };

const scratch = (label) => mkdtempSync(join(tmpdir(), `litgrok-motion-${label}-`));
function writeBrief(dir, brief = BRIEF) {
  const path = join(dir, 'brief.json');
  writeFileSync(path, JSON.stringify(brief));
  return path;
}
// Every render reads <out>/treatment.json first (exit 16 otherwise). These runtime checks render
// type-path briefs, so each gets a valid type-led treatment whose copy is the brief's own text.
function treatmentFor(briefPath) {
  const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
  const lines = [...new Set([brief.title, ...(brief.lines ?? []), brief.end?.title].filter(Boolean))];
  const durationSec = Math.max(4, lines.length * 2);
  const step = durationSec / lines.length;
  return {
    request: `${lines.map((line) => `"${line}"`).join(' ')} 이 문장으로 키네틱 타이포 영상 만들어줘, 소리 없이 lit`,
    genre: 'type-led', path: 'type', pathReason: 'The user supplied the words and asked for kinetic type.',
    idea: 'Each supplied phrase gets its own breath on a steady pulse.', audience: 'Test viewers', channel: 'Local playback',
    format: '16:9', formatReason: 'Local playback is landscape.', durationSec,
    beats: lines.map((line, i) => ({ t0: i * step, t1: (i + 1) * step, purpose: `breath ${i + 1}`, onScreen: 'the supplied phrase', motion: 'reveal word by word', sound: 'none' })),
    subject: { name: lines[0], source: 'user', specifics: [] }, visualDevices: [],
    typePlan: { faces: ['Archivo', 'Pretendard'], hierarchy: 'one phrase at a time', maxWordsOnScreen: 6, ...(brief.annotations ? { index: true } : {}) },
    palette: [{ hex: '#111111', role: 'ground' }, { hex: '#EEEEEE', role: 'type' }, { hex: '#2BB3A3', role: 'accent' }],
    sound: brief.audio ? { mode: 'supplied', file: join(dirname(briefPath), brief.audio), plan: 'the supplied track' } : { mode: 'none', plan: 'silent by request' },
    copy: { source: 'user', lines }, inventions: [], ambition: 'Clean, readable holds on the pulse.',
  };
}
function withTreatment(args) {
  const out = args[args.indexOf('--out') + 1];
  const brief = args.includes('--brief') ? args[args.indexOf('--brief') + 1] : null;
  if (out && brief && existsSync(brief)) {
    mkdirSync(out, { recursive: true });
    if (!existsSync(join(out, 'treatment.json'))) writeFileSync(join(out, 'treatment.json'), JSON.stringify(treatmentFor(brief)));
  }
  return args;
}
function cli(args, env, options = {}) {
  return spawnSync(process.execPath, [motion, ...withTreatment(args)], { encoding: 'utf8', env, timeout: 300000, ...options });
}

// An offline test cache: the pinned engine deps come from npm's local cache (`npm ci --offline`);
// fonts stay absent unless a test places them. The suite never touches the real network.
let warmed = null;
async function warmCache() {
  if (warmed) return warmed;
  const base = scratch('cache');
  const env = { ...process.env, LITGROK_MOTION_CACHE: base, npm_config_offline: 'true' };
  mkdirSync(cacheRoot(env), { recursive: true });
  const { installDeps } = await import('../.grok/skills/lit-typographic-motion/scripts/prewarm.mjs');
  try {
    await installDeps(env);
    warmed = { base, env };
  } catch (error) {
    warmed = { skip: `npm cache lacks the pinned engine deps for an offline install (${error.message}); run litgrok-ai motion-runtime install once with network` };
  }
  return warmed;
}

test('status on an empty cache prints the five probes and names every missing item', () => {
  const base = scratch('status');
  try {
    const result = spawnSync(process.execPath, [bin, 'motion-runtime', 'status'], { encoding: 'utf8', env: { ...process.env, LITGROK_MOTION_CACHE: base } });
    assert.equal(result.status, 0, result.stderr);
    for (const probe of ['Chrome:', 'ffmpeg:', 'WebGL2 renderer:', 'Software GL:', 'Pre-warm:']) assert.match(result.stdout, new RegExp(`│ ${probe}`));
    assert.match(result.stdout, /Pre-warm: MISSING deps opentype\.js, ws \(missing\); Galmuri9 \(missing\); MesloLGS NF \(missing\) — fix: litgrok-ai motion-runtime install/);
    assert.match(result.stdout, /Audio tier: venv absent/);
    assert.deepEqual(readdirSync(base), [], 'status never writes the cache');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('every Chrome launch carries the mock keychain and the basic password store', async () => {
  const { HOUSEKEEPING, openRenderer } = await import('../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs');
  assert.ok(HOUSEKEEPING.includes('--use-mock-keychain'));
  assert.ok(HOUSEKEEPING.includes('--password-store=basic'));
  const dir = scratch('keychain');
  try {
    const argvLog = join(dir, 'argv.txt');
    const fake = join(dir, 'fake-chrome');
    writeFileSync(fake, `#!/bin/sh\nfor a in "$@"; do printf '%s\\n' "$a" >> "${argvLog}"; done\nexit 1\n`);
    chmodSync(fake, 0o755);
    await assert.rejects(openRenderer({ executable: fake, profileDir: join(dir, 'p'), timeoutMs: 5000 }), /BLOCKED_NO_CHROME/);
    const launches = readFileSync(argvLog, 'utf8').split('\n');
    const rungs = launches.filter((arg) => arg.startsWith('--use-angle=')).length;
    assert.ok(rungs >= 2, 'every ladder rung was launched');
    assert.equal(launches.filter((arg) => arg === '--use-mock-keychain').length, rungs);
    assert.equal(launches.filter((arg) => arg === '--password-store=basic').length, rungs);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unwarmed cache exits 14 before any frame and writes nothing to the cache', () => {
  const base = scratch('unwarmed');
  const work = scratch('unwarmed-work');
  try {
    const result = cli(['make', '--brief', writeBrief(work), '--out', join(work, 'out')], { ...process.env, LITGROK_MOTION_CACHE: base, HTTPS_PROXY: 'http://127.0.0.1:9', npm_config_offline: 'true' });
    assert.equal(result.status, 14, result.stderr);
    assert.match(result.stderr, /BLOCKED_DEPS_NOT_PREWARMED[^\n]*litgrok-ai motion-runtime install/);
    assert.deepEqual(readdirSync(base), []);
  } finally { rmSync(base, { recursive: true, force: true }); cleanup(work); }
});

test('a tampered or missing pinned font exits 15', async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  const work = scratch('font15');
  try {
    const fonts = join(cacheRoot(cache.env), 'fonts');
    mkdirSync(fonts, { recursive: true });
    writeFileSync(join(fonts, PINS.fonts.meslo.file), 'not the pinned bytes');
    const result = cli(['make', '--brief', writeBrief(work, { ...BRIEF, annotations: true }), '--out', join(work, 'out')], cache.env);
    assert.equal(result.status, 15, result.stderr);
    assert.match(result.stderr, /BLOCKED_FONT_FETCH: MesloLGS NF \(hash mismatch\)/);
    rmSync(join(fonts, PINS.fonts.meslo.file));
    const missing = cli(['make', '--brief', writeBrief(work, { ...BRIEF, annotations: true }), '--out', join(work, 'out')], cache.env);
    assert.equal(missing.status, 15);
    assert.match(missing.stderr, /MesloLGS NF \(missing\)/);
  } finally { cleanup(work); }
});

test('no Chrome exits 10; Chrome without WebGL2 exits 11 with the launch message', { skip: NO_CHROME }, async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  const work = scratch('chrome');
  try {
    const none = cli(['make', '--brief', writeBrief(work), '--out', join(work, 'a'), '--stills-only'], { ...cache.env, CHROME_PATH: join(work, 'no-such-chrome') });
    assert.equal(none.status, 10, none.stderr);
    assert.match(none.stderr, /BLOCKED_NO_CHROME/);
    const wrapper = join(work, 'chrome-no-webgl');
    writeFileSync(wrapper, `#!/bin/sh\nexec "${CHROME}" "$@" --disable-webgl --disable-3d-apis\n`);
    chmodSync(wrapper, 0o755);
    const noGl = cli(['make', '--brief', writeBrief(work), '--out', join(work, 'b'), '--stills-only'], { ...cache.env, CHROME_PATH: wrapper });
    assert.equal(noGl.status, 11, noGl.stderr);
    assert.match(noGl.stderr, /BLOCKED_NO_WEBGL2: Chrome started but no WebGL2 context/);
  } finally { cleanup(work); }
});

test('a refused listen takes the CDP pull of the same readback buffer, byte for byte', { skip: NO_CHROME }, async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  const work = scratch('egress');
  try {
    const { main } = await import('../.grok/skills/lit-typographic-motion/scripts/motion.mjs');
    const brief = writeBrief(work);
    const sink = () => { let text = ''; return { write: (chunk) => { text += chunk; return true; }, text: () => text }; };
    const errWs = sink(), errPull = sink();
    const ws = await main(withTreatment(['make', '--brief', brief, '--out', join(work, 'ws'), '--stills-only']), { env: cache.env, stdout: sink(), stderr: errWs });
    assert.equal(ws, 0, errWs.text());
    const refuse = () => { throw Object.assign(new Error('listen EPERM: operation not permitted 127.0.0.1'), { code: 'EPERM' }); };
    const pulled = await main(withTreatment(['make', '--brief', brief, '--out', join(work, 'pull'), '--stills-only']), { env: cache.env, stdout: sink(), stderr: errPull, listenImpl: refuse });
    assert.equal(pulled, 0, errPull.text());
    assert.match(errPull.text(), /frame socket unavailable \(EPERM listen EPERM[^)]*\); using the per-frame CDP pull/);
    const hashes = (dir) => readFileSync(join(dir, 'stills', 'stills.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((line) => line.pass === null).map((line) => line.rgbaSha256);
    assert.deepEqual(hashes(join(work, 'pull')), hashes(join(work, 'ws')));
  } finally { cleanup(work); }
});

test('video without ffmpeg exits 12 while stills and the sheet still exit 0', { skip: NO_CHROME }, async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  const work = scratch('ffmpeg');
  const emptyPath = join(work, 'bin');
  mkdirSync(emptyPath);
  try {
    const env = { ...cache.env, PATH: emptyPath };
    const video = cli(['make', '--brief', writeBrief(work), '--out', join(work, 'v')], env);
    assert.equal(video.status, 12, video.stderr);
    assert.match(video.stderr, /BLOCKED_NO_FFMPEG_FOR_VIDEO[^\n]*--stills-only/);
    const stills = cli(['make', '--brief', writeBrief(work), '--out', join(work, 's'), '--stills-only'], env);
    assert.equal(stills.status, 0, stills.stderr);
    assert.ok(existsSync(join(work, 's', 'sheet', 'cuts.png')));
    assert.ok(readdirSync(join(work, 's', 'stills')).filter((name) => name.endsWith('.png')).length >= 2);
  } finally { cleanup(work); }
});

test('Tier 2: an absent or drifted venv falls back to Tier 1 with the warning; a ready one supplies the beats', { skip: NO_CHROME }, async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  const work = scratch('audio');
  const venv = join(cacheRoot(cache.env), 'audio-venv');
  try {
    writeFileSync(join(work, 'track.wav'), 'fixture audio bytes');
    const brief = writeBrief(work, { ...BRIEF, audio: 'track.wav' });
    const runRecord = (out) => JSON.parse(readFileSync(join(out, '.run', 'run.json'), 'utf8'));
    const absent = cli(['make', '--brief', brief, '--out', join(work, 'a'), '--stills-only'], cache.env);
    assert.equal(absent.status, 0, absent.stderr);
    assert.match(absent.stderr, /audio analysis not prewarmed: run litgrok-ai motion-runtime install --audio/);
    assert.equal(runRecord(join(work, 'a')).audioTier, 'text-reading-time');

    const site = join(venv, 'lib', 'python3.12', 'site-packages');
    mkdirSync(join(venv, 'bin'), { recursive: true });
    mkdirSync(site, { recursive: true });
    for (const [name, version] of audioPins('3.12.9')) mkdirSync(join(site, `${name.replace(/-/g, '_')}-${version}.dist-info`));
    const beats = Array.from({ length: 40 }, (_, i) => Math.round(i * 0.52 * 1000) / 1000);
    writeFileSync(join(venv, 'bin', 'python'), `#!/bin/sh\nprintf '%s' '${JSON.stringify({ bpm: 115.4, beats, onsets: [], durationSec: 20 })}' > "$3"\n`);
    chmodSync(join(venv, 'bin', 'python'), 0o755);
    writeFileSync(join(venv, '.ready'), JSON.stringify({ requirements: sha256(readFileSync(AUDIO_REQUIREMENTS)), python: '3.12.9' }));
    const ready = cli(['make', '--brief', brief, '--out', join(work, 'b'), '--stills-only'], cache.env);
    assert.equal(ready.status, 0, ready.stderr);
    assert.equal(runRecord(join(work, 'b')).audioTier, 'librosa-beat-grid');

    rmSync(join(site, readdirSync(site).find((name) => name.startsWith('numpy'))), { recursive: true });
    const drifted = cli(['make', '--brief', brief, '--out', join(work, 'c'), '--stills-only'], cache.env);
    assert.equal(drifted.status, 0, drifted.stderr);
    assert.match(drifted.stderr, /venv pin mismatch: numpy==2\.5\.3 \(found none\)/);
    assert.equal(runRecord(join(work, 'c')).audioTier, 'text-reading-time');
  } finally { rmSync(venv, { recursive: true, force: true }); cleanup(work); }
});

test('Tier 3: --word-timing without models exits 14; install states the pins and fails closed first', async () => {
  const base = scratch('words');
  const work = scratch('words-work');
  try {
    const env = { ...process.env, LITGROK_MOTION_CACHE: base, HTTPS_PROXY: 'http://127.0.0.1:9' };
    const render = cli(['make', '--brief', writeBrief(work), '--out', join(work, 'o'), '--word-timing'], env);
    assert.equal(render.status, 14, render.stderr);
    assert.match(render.stderr, /litgrok-ai motion-runtime install --word-timing/);
    const install = spawnSync(process.execPath, [bin, 'motion-runtime', 'install', '--word-timing'], { encoding: 'utf8', env });
    assert.equal(install.status, 14);
    const statement = install.stdout.indexOf('word-timing models');
    const closed = install.stdout.indexOf('FAILED CLOSED before any download');
    assert.ok(statement >= 0 && closed > statement, install.stdout);
    assert.match(install.stdout, /Korean forced alignment: id UNPINNED, revision UNPINNED, licence UNVERIFIED/);
    assert.deepEqual(readdirSync(base), [], 'nothing downloaded');
  } finally { rmSync(base, { recursive: true, force: true }); cleanup(work); }
});

test('pre-warm fetches only from pinned sources and keeps nothing whose sha256 is wrong', async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  const mirror = scratch('mirror');
  try {
    writeFileSync(join(mirror, PINS.fonts.galmuri9.file), 'impostor bytes');
    const result = spawnSync(process.execPath, [bin, 'motion-runtime', 'install'], { encoding: 'utf8', env: { ...cache.env, LITGROK_MOTION_FONT_MIRROR: mirror } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Galmuri9\.ttf: sha256 [0-9a-f]{64} does not match pin 5cb68052[0-9a-f]+; nothing written/);
    assert.equal(existsSync(join(cacheRoot(cache.env), 'fonts', PINS.fonts.galmuri9.file)), false);
    assert.equal(existsSync(join(cacheRoot(cache.env), 'install.lock')), false, 'the lock is released on failure');
  } finally { rmSync(mirror, { recursive: true, force: true }); }
});

async function installInto(project, home, env = {}) {
  const { run } = await import(`../bin/litgrok.mjs?motion=${Date.now()}`);
  let stdout = '', stderr = '';
  const code = await run(['install', '--yes'], {
    cwd: project, env: { HOME: home, LANG: 'en_US.UTF-8', ...env }, stdin: { isTTY: true },
    stdout: { isTTY: false, write: (chunk) => { stdout += chunk; return true; } }, stderr: { write: (chunk) => { stderr += chunk; return true; } },
  });
  return { code, stdout, stderr };
}

test('the installer stays copy-only offline and its receipt names the motion pre-warm', async () => {
  const home = scratch('install-home');
  const project = scratch('install-project');
  try {
    const result = await installInto(project, home, { HTTPS_PROXY: 'http://127.0.0.1:9', npm_config_offline: 'true' });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Motion runtime: install stays copy-only; pre-warm lit-typographic-motion with litgrok-ai motion-runtime install/);
    assert.ok(existsSync(join(project, '.grok/skills/lit-typographic-motion/scripts/motion.mjs')));
    assert.equal(existsSync(join(home, '.cache', 'litgrok', 'motion-runtime')), false, 'install never pre-warms by itself');
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('the installed rule names a command that resolves inside the installed skill and prints its banner', async () => {
  const home = scratch('route-home');
  const project = scratch('route-project');
  try {
    assert.equal((await installInto(project, home)).code, 0);
    const rule = readFileSync(join(project, '.grok/rules/00-litgrok.md'), 'utf8');
    const section = rule.slice(rule.indexOf('## New film selection'), rule.indexOf('## Office output selection'));
    const skillRoot = section.match(/`(\.grok\/skills\/lit-typographic-motion)\/`/)[1];
    const commands = [...section.matchAll(/`node (scripts\/motion\.mjs)`/g)];
    assert.equal(commands.length, 1, 'the installed script is named once');
    for (const sub of ['make', 'stage', 'sound', 'look', 'gate', 'verify']) assert.match(section, new RegExp(`\`${sub}\``), `${sub} is listed`);
    const installedSkill = realpathSync(join(project, skillRoot));
    const skillText = readFileSync(join(installedSkill, 'SKILL.md'), 'utf8');
    assert.match(skillText, /treatment\.json/);
    assert.match(skillText, /stage --out <dir> --stills-only/);
    for (const [, script] of commands) {
      const resolved = realpathSync(join(installedSkill, script));
      assert.ok(resolved.startsWith(`${installedSkill}/`), `${resolved} is outside the installed skill`);
      const help = spawnSync(process.execPath, [resolved, '--help'], { encoding: 'utf8', cwd: installedSkill });
      assert.equal(help.status, 0);
      assert.match(help.stdout, BANNER);
    }
    const runtime = spawnSync(process.execPath, [bin, 'motion-runtime', '--help'], { encoding: 'utf8' });
    assert.equal(runtime.status, 0);
    assert.match(runtime.stdout, /Usage: litgrok-ai motion-runtime install\|status/);
  } finally { rmSync(home, { recursive: true, force: true }); rmSync(project, { recursive: true, force: true }); }
});

test('every CLI launched through a symlinked directory prints real output, never a silent exit 0', () => {
  const dir = scratch('symlink');
  try {
    symlinkSync(join(skill, 'scripts'), join(dir, 'linked-scripts'));
    symlinkSync(join(root, 'bin'), join(dir, 'linked-bin'));
    const run = (file, args) => spawnSync(process.execPath, [join(dir, file), ...args], { encoding: 'utf8' });
    const help = run('linked-scripts/motion.mjs', ['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, BANNER);
    const bare = run('linked-scripts/motion.mjs', []);
    assert.equal(bare.status, 2, 'no arguments is a usage exit');
    assert.match(bare.stdout, BANNER);
    const prewarm = run('linked-scripts/prewarm.mjs', ['--help']);
    assert.equal(prewarm.status, 0);
    assert.match(prewarm.stdout, /Usage: litgrok-ai motion-runtime/);
    const installer = run('linked-bin/litgrok.mjs', ['motion-runtime', '--help']);
    assert.equal(installer.status, 0);
    assert.match(installer.stdout, /Usage: litgrok-ai motion-runtime/);
    const beat = spawnSync('python3', [join(dir, 'linked-scripts/beat_grid.py')], { encoding: 'utf8' });
    if (!beat.error) { assert.equal(beat.status, 2); assert.match(beat.stderr, /usage: beat_grid\.py/); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('determinism: two independent processes on the SwiftShader rung give equal rgbaSha256 (MO-C-09)', { skip: NO_CHROME }, async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  const work = scratch('determinism');
  try {
    const brief = writeBrief(work, { title: 'Twice the same', lines: ['같은 순간 같은 픽셀'], annotations: false, bpm: 200, seed: 5 });
    const hashes = [];
    for (const out of ['one', 'two']) {
      const result = cli(['make', '--brief', brief, '--out', join(work, out), '--stills-only', '--swiftshader'], cache.env);
      assert.equal(result.status, 0, result.stderr);
      hashes.push(readFileSync(join(work, out, 'stills', 'stills.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((line) => line.pass === null).map((line) => line.rgbaSha256));
    }
    assert.ok(hashes[0].length >= 3);
    assert.deepEqual(hashes[1], hashes[0]);
  } finally { cleanup(work); }
});

test('a seeked still equals the sequential frame, including a stateful CRT shot (MO-A-25)', { skip: NO_CHROME }, async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  const work = scratch('seek');
  try {
    const { planRender } = await import('../.grok/skills/lit-typographic-motion/scripts/lib/render.mjs');
    const { openSession } = await import('../.grok/skills/lit-typographic-motion/scripts/lib/session.mjs');
    const { PRESETS } = await import('../.grok/skills/lit-typographic-motion/scripts/lib/presets.mjs');
    const plan = planRender({ title: 'Afterglow', lines: ['a trail that stays'], annotations: false, bpm: 200, seed: 3 }, { software: false });
    const crt = { pass: 'crt', seed: 99, params: { scanlineFreq: 540, scanlineDepth: 0.22, phosphorPersistence: 0.6, bloomAmount: 0.2, curvature: 0.04, vignette: 0.18, triadMaskAmount: 0.12, flickerAmp: 0.03, flickerFreqHz: 8, persistenceEnabled: true, sceneStateful: true }, schedule: [], bootFlicker: [] };
    const preset = PRESETS['swiss-signal'];
    const config = { scale: 1, fps: 60, bpm: plan.bpm, preset: { id: preset.id, palette: preset.palette, post: preset.post }, shots: plan.shots.map((shot) => ({ ...shot, passes: [...shot.passes.map((p) => ({ pass: p.pass, seed: p.seed, params: p.params, schedule: p.schedule ?? [], origin: p.origin, stopsLinear: p.stopsLinear })), crt] })) };
    const second = plan.shots[1];
    const target = second.startFrame + 20;
    const env = cache.env;
    const sequential = await openSession({ outDir: work, fontKeys: plan.fontKeys, env, softwareOnly: true, log: () => {} });
    let expected;
    try {
      await sequential.init(config);
      for (let n = second.startFrame; n <= target; n += 1) {
        const { bytes } = await sequential.frame(n, { samples: 2, shutter: 0.5 });
        if (n === target) expected = sha256(bytes);
      }
      const stateless = await sequential.frame(5, { samples: 2, shutter: 0.5 });
      expected = { stateful: expected, stateless: sha256(stateless.bytes) };
    } finally { await sequential.close(); }
    const seeked = await openSession({ outDir: work, fontKeys: plan.fontKeys, env, softwareOnly: true, log: () => {} });
    try {
      await seeked.init(config);
      await seeked.seek();
      assert.equal(sha256((await seeked.frame(target, { samples: 2, shutter: 0.5 })).bytes), expected.stateful, 'stateful shot: seek re-integrates from the shot start');
      await seeked.seek();
      assert.equal(sha256((await seeked.frame(5, { samples: 2, shutter: 0.5 })).bytes), expected.stateless);
    } finally { await seeked.close(); }
  } finally { cleanup(work); }
});

test('the packed tarball installs into an isolated HOME and renders from the installed skill', { skip: NO_CHROME }, async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  const work = scratch('pack');
  try {
    const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--pack-destination', work], { cwd: root, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
    const tarball = join(work, packed.stdout.trim().split('\n').at(-1));
    mkdirSync(join(work, 'x'));
    assert.equal(spawnSync('tar', ['-xzf', tarball, '-C', join(work, 'x')]).status, 0);
    const home = join(work, 'home'), project = join(work, 'project');
    mkdirSync(home); mkdirSync(project);
    const packageBin = join(work, 'x', 'package', 'bin', 'litgrok.mjs');
    const installEnv = { ...process.env, HOME: home };
    delete installEnv.CI;
    const install = spawnSync(process.execPath, [packageBin, 'install', '--yes'], { cwd: project, encoding: 'utf8', env: installEnv });
    assert.equal(install.status, 0, install.stderr);
    assert.ok(existsSync(join(project, '.grok/skills/lit-typographic-motion/SKILL.md')), install.stdout);
    const installedMotion = join(project, '.grok/skills/lit-typographic-motion/scripts/motion.mjs');
    const brief = writeBrief(work);
    const result = spawnSync(process.execPath, [installedMotion, ...withTreatment(['make', '--brief', brief, '--out', join(work, 'out'), '--stills-only'])], { cwd: dirname(dirname(installedMotion)), encoding: 'utf8', env: { ...cache.env, HOME: home }, timeout: 300000 });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(work, 'out', 'sheet', 'cuts.png')));
    const status = spawnSync(process.execPath, [packageBin, 'motion-runtime', 'status'], { encoding: 'utf8', env: { ...cache.env, HOME: home } });
    assert.equal(status.status, 0);
    assert.match(status.stdout, /Pre-warm: MISSING[^\n]*Galmuri9/);
  } finally { cleanup(work); }
});

test('type path: a short supplied WAV is muxed and padded with the librosa tier absent; the video keeps its length', { skip: NO_CHROME }, async (t) => {
  const cache = await warmCache();
  if (cache.skip) { t.skip(cache.skip); return; }
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { t.skip('ffmpeg is needed to mux'); return; }
  const work = scratch('supplied');
  try {
    const rate = 48000;
    const tone = Float32Array.from({ length: rate }, (_, i) => 0.2 * Math.sin((2 * Math.PI * 440 * i) / rate));
    const { encodeWav } = await import('../.grok/skills/lit-typographic-motion/scripts/lib/sound.mjs');
    writeFileSync(join(work, 'short.wav'), encodeWav([tone, tone], rate));
    const brief = writeBrief(work, { ...BRIEF, audio: 'short.wav' });
    const out = join(work, 'out');
    mkdirSync(out, { recursive: true });
    const treatment = treatmentFor(brief);
    treatment.request = '"Pulse Check" 이 문장으로 키네틱 타이포 영상 만들어줘, 이 음악으로 lit';
    treatment.sound = { mode: 'supplied', file: join(work, 'short.wav'), plan: 'the supplied one-second track' };
    writeFileSync(join(out, 'treatment.json'), JSON.stringify(treatment));
    const result = cli(['make', '--brief', brief, '--out', out, '--round', '3'], { ...cache.env, LITGROK_MOTION_CACHE: cache.base });
    assert.ok([0, 13].includes(result.status), result.stdout + result.stderr);
    assert.match(result.stderr, /audio analysis not prewarmed[^\n]*/, 'the librosa tier is absent');
    const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', join(out, 'film.mp4')], { encoding: 'utf8' }).stdout);
    const video = probe.streams.find((s) => s.codec_type === 'video');
    const audio = probe.streams.find((s) => s.codec_type === 'audio');
    assert.ok(audio, 'the supplied track is muxed');
    assert.ok(Number(video.duration) >= 3.9, `the video keeps its ${video.duration} s length`);
    assert.ok(Math.abs(Number(audio.duration) - Number(video.duration)) <= 0.1, `audio ${audio.duration} s is padded to the video's ${video.duration} s`);
    assert.match(readFileSync(join(out, 'gate-report.txt'), 'utf8'), /SOUND:\s+WARN\s+\(supplied track[^)]*quiet opening/, 'a padded one-second track only WARNs about its silent tail');
    assert.equal(JSON.parse(readFileSync(join(out, '.run', 'checks.json'), 'utf8')).sound.stats.padded, true);
  } finally { cleanup(work); }
});

test.after(() => { if (warmed?.base) rmSync(warmed.base, { recursive: true, force: true }); });
