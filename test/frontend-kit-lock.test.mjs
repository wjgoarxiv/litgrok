import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)));
const skill = join(root, '.grok/skills/frontend-ui-ux');
const scripts = join(skill, 'scripts');

test('design-lock init writes a lock, tokens, components and vendored fonts on a throwaway dir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'litgrok-kit-lock-'));
  try {
    const run = spawnSync(process.execPath, [join(scripts, 'design-lock.mjs'), 'init', '--family', 'landing', '--dir', dir, '--scaffold'], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(run.status, 0, run.stderr);
    const lock = JSON.parse(readFileSync(join(dir, 'design.lock.json'), 'utf8'));
    assert.equal(lock.family, 'landing');
    assert.ok(lock.style, 'a default style is locked');
    assert.ok(existsSync(join(dir, 'ui', 'tokens.css')));
    assert.ok(existsSync(join(dir, 'ui', 'components.css')));
    assert.ok(existsSync(join(dir, 'ui', 'ui.js')));
    assert.ok(existsSync(join(dir, 'index.html')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the five house styles parse with the keys design-lock validates', async () => {
  for (const id of ['field-notes', 'graphite', 'meadow', 'computational-brutalism', 'neo-brutalism']) {
    const pack = JSON.parse(readFileSync(join(skill, 'kit', 'styles', `${id}.json`), 'utf8'));
    assert.equal(pack.schema_id, 'litfamily.frontend-style/v1', id);
    assert.equal(pack.id, id);
    assert.ok(Array.isArray(pack.use_when) && pack.use_when.length > 0, `${id} use_when`);
    for (const key of ['type', 'radius_px', 'fonts', 'color', 'shape']) assert.ok(pack[key] !== undefined, `${id} has ${key}`);
  }
  const fonts = JSON.parse(readFileSync(join(skill, 'kit', 'fonts.json'), 'utf8'));
  assert.equal(fonts.schema_id, 'litfamily.frontend-kit-fonts/v1');
  for (const font of fonts.fonts) {
    const path = join(skill, 'kit', font.source);
    assert.ok(existsSync(path), `${font.family} vendored at ${font.source}`);
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
    assert.equal(hash, font.sha256, `${font.family} matches the recorded hash`);
    assert.equal(createHash('sha256').update(readFileSync(join(skill, 'kit', font.licence.source))).digest('hex'), font.licence.sha256);
  }
});

test('pixel-art renders crisp 8px cells and rejects bad grids', async () => {
  const { pixelSvg } = await import('../.grok/skills/frontend-ui-ux/scripts/pixel-art.mjs');
  const svg = pixelSvg('ia\nai\n', { label: 'test motif' });
  assert.match(svg, /width="16" height="16"/, 'two columns at the default 8px cell');
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /fill: var\(--c-ink\)/);
  assert.throws(() => pixelSvg('ii\n', {}), /--label is required/);
  assert.throws(() => pixelSvg('ii\n', { label: 'x', cell: 5 }), /under 6 px/);
  assert.throws(() => pixelSvg('iz\n', { label: 'x' }), /unknown grid character/);
});

test('the driver adapter maps the Grok browser probe into interface statuses', async () => {
  const { probeBrowserDriver } = await import('../.grok/skills/frontend-ui-ux/scripts/interface-probe-driver.mjs');
  const { BLOCKED_REASON } = await import('../.grok/skills/frontend-ui-ux/scripts/interface-probe-rules.mjs');
  const driver = probeBrowserDriver();
  for (const key of ['status', 'version', 'command', 'blocker']) assert.ok(key in driver, key);
  assert.ok(['available', 'beyond-verified', 'unavailable', 'unverified-identity'].includes(driver.status));
  assert.equal(driver.command, 'agent-browser');
  if (driver.blocker === null) {
    assert.match(driver.version ?? '', /^\d+\.\d+\.\d+$/, 'a ready driver reports a version string');
  } else {
    assert.ok(driver.blocker in BLOCKED_REASON, 'a blocked driver names a BLOCKED_REASON key');
  }
});
