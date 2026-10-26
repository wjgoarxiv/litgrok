import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadTreatment, requestUrls, shippedExamples, typeLedCue, validateTreatment } from '../.grok/skills/lit-typographic-motion/scripts/lib/treatment.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skillRoot = join(root, '.grok/skills/lit-typographic-motion');
const fixture = (name) => JSON.parse(readFileSync(join(root, 'test/fixtures/motion', name), 'utf8'));
const stage = () => fixture('treatment-stage.json');
const type = () => fixture('treatment-type.json');

function expectField(treatment, field, why) {
  const result = validateTreatment(treatment);
  assert.equal(result.ok, false, `${why}: expected exit 16 on ${field}`);
  assert.equal(result.field, field, `${why}: ${result.message}`);
}

test('the two fixture treatments are valid', () => {
  for (const t of [stage(), type()]) {
    const result = validateTreatment(t);
    assert.equal(result.ok, true, result.message);
  }
});

test('each missing top-level field exits 16 with its name', () => {
  const fields = ['request', 'genre', 'path', 'pathReason', 'idea', 'audience', 'channel', 'format', 'formatReason', 'durationSec', 'beats', 'subject', 'visualDevices', 'typePlan', 'palette', 'sound', 'copy', 'inventions', 'ambition', 'story'];
  for (const field of fields) {
    const t = stage();
    delete t[field];
    expectField(t, field, `missing ${field}`);
  }
});

test('placeholder values from an example never validate', () => {
  const t = stage();
  t.idea = '<one sentence>';
  expectField(t, 'idea', 'placeholder idea');
  const u = stage();
  u.beats[2].onScreen = '<what is on screen>';
  expectField(u, 'beats[2].onScreen', 'placeholder beat field');
  for (const example of shippedExamples()) assert.equal(validateTreatment(example).ok, false, 'a shipped example must never validate as-is');
});

test('a treatment copied from a shipped example exits copiedExample', () => {
  const [example] = shippedExamples();
  assert.ok(example, 'references/treatment.md ships a placeholder example');
  const unbracket = (value) => (typeof value === 'string' ? value.replace(/[<>]/g, '') : value);
  const t = stage();
  t.idea = unbracket(example.idea);
  t.audience = unbracket(example.audience);
  t.channel = unbracket(example.channel);
  t.ambition = unbracket(example.ambition);
  t.beats = t.beats.map((beat, i) => {
    const source = example.beats[i % example.beats.length];
    return { ...beat, purpose: unbracket(source.purpose), onScreen: unbracket(source.onScreen), motion: unbracket(source.motion), sound: unbracket(source.sound) };
  });
  t.palette = t.palette.map((entry, i) => ({ ...entry, role: unbracket(example.palette[i % example.palette.length].role) }));
  expectField(t, 'copiedExample', 'half the free text equals the example');
});

test('an idea or invented copy that restates the request exits 16', () => {
  const t = stage();
  t.idea = '비가 어떻게 만들어지는지 보여주는 영상이다.';
  expectField(t, 'idea', 'idea restates the request');
  const u = stage();
  u.copy.lines[0] = '비가 어떻게 만들어지는지 보여주는 영상';
  expectField(u, 'copy.lines', 'invented copy restates the request');
});

test('a user copy line must come from the request, quoted spans included', () => {
  const t = type();
  t.copy.lines = ['오늘의 걸음이', '모레의 길이 된다'];
  expectField(t, 'copy.lines', 'user line not in the request');
});

test('the stage path needs a drawn subject device and two counting kinds', () => {
  const t = stage();
  t.visualDevices = t.visualDevices.map((device) => (device.role === 'subject' ? { ...device, role: 'support' } : device));
  expectField(t, 'visualDevices', 'no subject device');
  const u = stage();
  u.visualDevices = [{ kind: 'gradient', role: 'texture', beats: [0, 1, 2, 3, 4] }, { kind: 'particles', role: 'texture', beats: [0, 1] }];
  expectField(u, 'visualDevices', 'only texture kinds');
  const v = stage();
  v.visualDevices = [{ kind: 'illustration', role: 'subject', beats: [0] }, { kind: 'diagram', role: 'support', beats: [1] }];
  expectField(v, 'visualDevices', 'subject covers under half the film');
});

test('the type path needs user copy or a type-led cue, and 16:9', () => {
  const t = stage();
  t.path = 'type';
  expectField(t, 'path', 'type path with invented copy and no cue');
  const u = type();
  u.format = '9:16';
  expectField(u, 'path', 'type path at 9:16');
});

test('beats follow the genre arc and the 1.2 s floor', () => {
  const t = stage();
  t.beats = t.beats.slice(0, 3);
  t.beats[2].t1 = 24;
  t.visualDevices = [{ kind: 'illustration', role: 'subject', beats: [0, 1, 2] }, { kind: 'diagram', role: 'support', beats: [1] }];
  expectField(t, 'beats', 'explainer needs four beats');
  const u = stage();
  u.beats[1] = { ...u.beats[1], t0: 4, t1: 5 };
  u.beats[2] = { ...u.beats[2], t0: 5 };
  expectField(u, 'beats', 'a beat of 1.0 s');
  const v = stage();
  v.beats[3].t0 = 16;
  expectField(v, 'beats', 'a gap over 0.25 s');
});

test('inventions must list the invented subject name', () => {
  const t = stage();
  t.inventions = ['all five copy lines'];
  expectField(t, 'inventions', 'subject name missing');
  const u = stage();
  u.inventions = [];
  expectField(u, 'inventions', 'empty inventions with invented copy');
});

test('genre floors, silent sound and unknown faces are refused', () => {
  const t = stage();
  t.durationSec = 8;
  t.beats = [0, 2, 4, 6].map((t0) => ({ ...stage().beats[0], t0, t1: t0 + 2 }));
  t.visualDevices = [{ kind: 'illustration', role: 'subject', beats: [0, 1, 2, 3] }, { kind: 'diagram', role: 'support', beats: [1] }];
  expectField(t, 'durationSec', 'an explainer under 10 s with no asked length');
  const u = stage();
  u.sound = { mode: 'none', plan: 'silence', palette: 'glass' };
  expectField(u, 'sound.mode', 'none without a silence request');
  const v = stage();
  v.typePlan.faces = ['Helvetica'];
  expectField(v, 'typePlan.faces', 'a face outside the verified set');
});

test('type-led cue detection: compounds and quoted spans of two or more words', () => {
  assert.equal(typeLedCue('"오늘의 걸음이 내일의 길이 된다" 이 문장으로 영상 만들어줘 lit'), '"오늘의 걸음이 내일의 길이 된다"');
  assert.ok(typeLedCue('가사 영상 하나 만들어줘 lit'));
  assert.ok(typeLedCue('make a lyric video for this chorus lit'));
  assert.ok(typeLedCue('「작은 불빛들」로 타이틀 시퀀스 만들어줘 lit'));
  assert.equal(typeLedCue('"단어" 하나로 영상 만들어줘 lit'), null, 'a one-word quote is not a cue');
  assert.equal(typeLedCue('비가 어떻게 만들어지는지 보여주는 영상 만들어줘 lit'), null);
  assert.equal(typeLedCue("it's the teacher's day video lit"), null, 'apostrophes are not quotes');
});

test('the CLI refuses a type render with no treatment and names the field (exit 16)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lgm-t-'));
  try {
    writeFileSync(join(dir, 'brief.json'), JSON.stringify({ lines: ['오늘의 걸음이'] }));
    const result = spawnSync(process.execPath, [join(skillRoot, 'scripts/motion.mjs'), 'make', '--brief', join(dir, 'brief.json'), '--out', join(dir, 'out'), '--stills-only'], { encoding: 'utf8', env: { ...process.env, CHROME_PATH: '' } });
    assert.equal(result.status, 16, result.stdout + result.stderr);
    assert.match(result.stdout, /BLOCKED_TREATMENT_INVALID/);
    assert.match(result.stderr, /treatment\.json/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('request links are found and normalized', () => {
  assert.deepEqual(requestUrls('저장소: https://github.com/Org/Repo/ 보고 만들어줘'), ['https://github.com/org/repo']);
  assert.deepEqual(requestUrls('no link here'), []);
});

test('every film names its story turn and where it lands', () => {
  const t = stage();
  assert.equal(validateTreatment(t).ok, true);
  const none = stage();
  delete none.story;
  expectField(none, 'story', 'story is required');
  const flat = stage();
  flat.story.turn = flat.story.expect;
  expectField(flat, 'story.turn', 'a turn equal to the expectation is no turn');
  const early = stage();
  early.story.beat = 0;
  expectField(early, 'story.beat', 'the turn never lands on the opening shot');
  const late = stage();
  late.story.beat = late.beats.length;
  expectField(late, 'story.beat', 'the turn lands before the end');
  const typeNone = type();
  delete typeNone.story;
  expectField(typeNone, 'story', 'the type path has a story too');
  const wordy = stage();
  wordy.story.payoff = 'First it ends. Then it ends again. Then it really ends this time.';
  expectField(wordy, 'story.payoff', 'a payoff is at most 2 sentences');
});

test('a stage film has a protagonist that acts for half the film at the turn', () => {
  const none = stage();
  delete none.protagonist;
  expectField(none, 'protagonist', 'the stage path needs a protagonist');
  const kind = stage();
  kind.protagonist.kind = 'logo';
  expectField(kind, 'protagonist.kind', 'kind is character or object');
  const brief = stage();
  brief.protagonist.acts = [{ beat: 3, action: 'Falls with the rain.' }];
  expectField(brief, 'protagonist.acts', 'one shot is not a protagonist');
  const missesTurn = stage();
  missesTurn.protagonist.acts = missesTurn.protagonist.acts.filter((a) => a.beat !== 2);
  expectField(missesTurn, 'protagonist.acts', 'the protagonist acts where the turn lands');
  const twice = stage();
  twice.protagonist.acts.push({ beat: 0, action: 'Blinks twice.' });
  expectField(twice, 'protagonist.acts[5].beat', 'one act per shot');
  assert.equal(validateTreatment(type()).ok, true, 'the type path needs no protagonist');
});

test('a request with a link needs its product, with that link and real files', () => {
  const withUrl = () => {
    const t = stage();
    t.request = `${t.request} https://github.com/example-org/seedshelf`;
    return t;
  };
  expectField(withUrl(), 'product', 'the linked product must be listed');
  const wrong = withUrl();
  wrong.product = { name: 'Seedshelf', url: 'https://example.org', assets: [] };
  expectField(wrong, 'product.url', 'the product url is the request link');
  const empty = withUrl();
  empty.product = { name: 'Seedshelf', url: 'https://github.com/example-org/seedshelf/', assets: [] };
  expectField(empty, 'product.assets', 'a product without files is unreachable or nothing');
  const badPath = withUrl();
  badPath.product = { name: 'Seedshelf', url: 'https://github.com/example-org/seedshelf', assets: [{ path: 'logo.png', role: 'logo', source: 'fetched', sha256: 'a'.repeat(64) }] };
  expectField(badPath, 'product.assets[0].path', 'assets live under stage/assets/');
  const badRole = withUrl();
  badRole.product = { name: 'Seedshelf', url: 'https://github.com/example-org/seedshelf', assets: [{ path: 'stage/assets/logo.png', role: 'mural', source: 'fetched', sha256: 'a'.repeat(64) }] };
  expectField(badRole, 'product.assets[0].role', 'asset roles are closed');
  const badSource = withUrl();
  badSource.product = { name: 'Seedshelf', url: 'https://github.com/example-org/seedshelf', assets: [{ path: 'stage/assets/logo.png', role: 'logo', source: 'drawn', sha256: 'a'.repeat(64) }] };
  expectField(badSource, 'product.assets[0].source', 'assets are fetched or user-supplied');
  const badHash = withUrl();
  badHash.product = { name: 'Seedshelf', url: 'https://github.com/example-org/seedshelf', assets: [{ path: 'stage/assets/logo.png', role: 'logo', source: 'fetched', sha256: 'xyz' }] };
  expectField(badHash, 'product.assets[0].sha256', 'assets carry their SHA-256');
  const invented = withUrl();
  invented.product = { name: 'Seedshelf', url: 'https://github.com/example-org/seedshelf', assets: [{ path: 'stage/assets/logo.png', role: 'logo', source: 'fetched', sha256: 'a'.repeat(64) }] };
  expectField(invented, 'subject.source', 'the product is real, so the subject is not invented');
  const ok = withUrl();
  ok.subject = { name: 'Seedshelf', source: 'user', specifics: [] };
  ok.product = { name: 'Seedshelf', url: 'https://github.com/example-org/seedshelf', assets: [{ path: 'stage/assets/logo.png', role: 'logo', source: 'fetched', sha256: 'a'.repeat(64) }] };
  assert.equal(validateTreatment(ok).ok, true, validateTreatment(ok).message);
  const unreachable = withUrl();
  unreachable.product = { name: 'Seedshelf', url: 'https://github.com/example-org/seedshelf', unreachable: 'The repository returns 404.' };
  assert.equal(validateTreatment(unreachable).ok, true, 'an unreachable product validates; loading it stops');
});

test('a product screen shows a listed screenshot, UI or README image', () => {
  const shot = stage();
  shot.request = `${shot.request} https://example.org/seedshelf`;
  shot.subject = { name: 'Seedshelf', source: 'user', specifics: [] };
  shot.product = { name: 'Seedshelf', url: 'https://example.org/seedshelf', assets: [{ path: 'stage/assets/logo.png', role: 'logo', source: 'fetched', sha256: 'a'.repeat(64) }] };
  shot.visualDevices.push({ kind: 'screen', role: 'support', beats: [2], asset: 'stage/assets/logo.png' });
  expectField(shot, 'visualDevices[3].asset', 'a logo is not a screenshot');
  shot.visualDevices[3].asset = 'stage/assets/screen.png';
  expectField(shot, 'visualDevices[3].asset', 'the asset must be listed');
  shot.product.assets.push({ path: 'stage/assets/screen.png', role: 'screenshot', source: 'user', sha256: 'b'.repeat(64) });
  assert.equal(validateTreatment(shot).ok, true, validateTreatment(shot).message);
  const naked = stage();
  naked.visualDevices.push({ kind: 'screen', role: 'support', beats: [2] });
  expectField(naked, 'visualDevices[3].asset', 'no product, no product screen');
});

test('loading a product checks every file and its hash (22 missing or unreachable, 17 tampered)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lgm-product-'));
  try {
    const t = stage();
    t.request = `${t.request} https://github.com/example-org/seedshelf`;
    t.subject = { name: 'Seedshelf', source: 'user', specifics: [] };
    const bytes = Buffer.from('not really a png');
    t.product = { name: 'Seedshelf', url: 'https://github.com/example-org/seedshelf', assets: [{ path: 'stage/assets/logo.png', role: 'logo', source: 'fetched', sha256: createHash('sha256').update(bytes).digest('hex') }] };
    writeFileSync(join(dir, 'treatment.json'), JSON.stringify(t));
    assert.throws(() => loadTreatment(dir), (error) => error.code === 22 && /is listed in product\.assets and missing/u.test(error.message));
    mkdirSync(join(dir, 'stage', 'assets'), { recursive: true });
    writeFileSync(join(dir, 'stage', 'assets', 'logo.png'), Buffer.from('changed'));
    assert.throws(() => loadTreatment(dir), (error) => error.code === 17 && /does not match its sha256/u.test(error.message));
    writeFileSync(join(dir, 'stage', 'assets', 'logo.png'), bytes);
    assert.equal(loadTreatment(dir).product.name, 'Seedshelf');
    t.product = { name: 'Seedshelf', url: t.product.url, unreachable: 'The repository returns 404.' };
    writeFileSync(join(dir, 'treatment.json'), JSON.stringify(t));
    assert.throws(() => loadTreatment(dir), (error) => error.code === 22 && /ask the user for its logo/u.test(error.message));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a 3D subject takes the 3D route, and the 3D route needs a 3D subject', () => {
  const solid = stage();
  solid.visualDevices[0] = { kind: 'depth3d', role: 'subject', beats: [0, 1, 2, 3, 4] };
  expectField(solid, 'depth', 'a depth3d subject sets depth 3d');
  solid.depth = '3d';
  assert.equal(validateTreatment(solid).ok, true, validateTreatment(solid).message);
  const flat2d = stage();
  assert.equal(validateTreatment(flat2d).ok, true, 'depth defaults to 2d');
  const bad = stage();
  bad.depth = '4d';
  expectField(bad, 'depth', 'depth is 2d or 3d');
  const flat = type();
  flat.depth = '3d';
  expectField(flat, 'depth', '3d is a stage-path route');
  const blender = stage();
  blender.visualDevices[0] = { kind: 'depth3d', role: 'subject', beats: [0, 1, 2, 3, 4] };
  blender.depth = '3d';
  blender.render3d = 'cycles';
  expectField(blender, 'render3d', 'the rungs are three or blender');
  blender.render3d = 'blender';
  assert.equal(validateTreatment(blender).ok, true, validateTreatment(blender).message);
  const flatBlender = type();
  flatBlender.render3d = 'blender';
  expectField(flatBlender, 'render3d', 'the Blender rung renders a 3D world');
});

test('a rich stage film plans its world; a minimal one skips it', () => {
  const none = stage();
  delete none.world;
  expectField(none, 'world', 'a rich stage film plans its world');
  const thin = stage();
  thin.world.layers = thin.world.layers.filter((_, i) => i > 0);
  expectField(thin, 'world.layers', 'at least 3 depth layers');
  const few = stage();
  few.world.labels = few.world.labels.slice(0, 2);
  expectField(few, 'world.labels', 'at least 6 labelled parts');
  const long = stage();
  long.world.labels = [...long.world.labels.slice(0, 5), 'a label far too long for the frame'];
  expectField(long, 'world.labels[5]', 'a label is at most 4 words');
  const locked = stage();
  locked.world.camera = [{ beat: 0, move: 'locked' }];
  expectField(locked, 'world.camera[0].move', 'a locked shot is not a camera move');
  const still = stage();
  still.world.camera = [{ beat: 1, move: 'slow push-in' }];
  expectField(still, 'world.camera', 'the camera moves in at least half the shots');
  const calm = stage();
  delete calm.world;
  calm.register = 'minimal';
  assert.equal(validateTreatment(calm).ok, true, 'a minimal film takes negative space instead');
});
