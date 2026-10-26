// lit-typographic-motion 3D route: the vendored three.js build, its notices, and the /lit/three/
// serve route. The bytes are upstream npm three@0.170.0, verified by hash, never a CDN.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CONTENT_TYPES, THREE_DIR, THREE_HASHES, resolveThree } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage-session.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const skill = join(root, '.grok/skills/lit-typographic-motion');
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('the vendored three.js', () => {
  test('the build and both addons ship unmodified with their licence', () => {
    for (const rel of ['three.module.js', 'addons/environments/RoomEnvironment.js', 'addons/geometries/RoundedBoxGeometry.js', 'LICENSE']) {
      assert.ok(existsSync(join(THREE_DIR, rel)), `${rel} is vendored`);
    }
    assert.match(readFileSync(join(THREE_DIR, 'three.module.js'), 'utf8'), /const REVISION = '170'/u, 'three.js r170');
    assert.match(readFileSync(join(THREE_DIR, 'LICENSE'), 'utf8'), /MIT/u);
  });

  test('the hashes are pinned in code, not just in the notices', () => {
    assert.deepEqual(THREE_HASHES, {
      'three.module.js': 'ce1fa418de16a19495a9f72495580e3015d7745c296d3ce0485897f902ddedfb',
      'addons/environments/RoomEnvironment.js': '85869bdd22f7cf0b22e68dcefe6cb710480af0f5c901a76f7a7764fd07fc8014',
      'addons/geometries/RoundedBoxGeometry.js': 'd20aeaf7077c459a8d952d215738d7b44fba028440bb862d84b622a34f0c80bb',
    });
    for (const [rel, hash] of Object.entries(THREE_HASHES)) {
      assert.equal(sha256(join(THREE_DIR, rel)), hash, `${rel} matches the pinned upstream bytes`);
    }
  });

  test('the notices record the registry source and the file hashes', () => {
    const notices = readFileSync(join(skill, 'THIRD_PARTY_NOTICES'), 'utf8');
    assert.match(notices, /three@0\.170\.0/u);
    assert.match(notices, /registry\.npmjs\.org\/three\/-\/three-0\.170\.0\.tgz/u);
    for (const rel of ['three.module.js', 'addons/environments/RoomEnvironment.js', 'addons/geometries/RoundedBoxGeometry.js']) {
      assert.ok(notices.includes(sha256(join(THREE_DIR, rel))), `${rel} hash is recorded`);
    }
  });
});

describe('the /lit/three/ route', () => {
  test('the build and the addons serve as JavaScript', () => {
    for (const path of ['/lit/three/three.module.js', '/lit/three/addons/environments/RoomEnvironment.js', '/lit/three/addons/geometries/RoundedBoxGeometry.js']) {
      const resolved = resolveThree(path);
      assert.ok(resolved.file, path);
      assert.equal(resolved.type, CONTENT_TYPES['.js']);
      assert.ok(readFileSync(resolved.file, 'utf8').length > 1000);
    }
  });

  test('anything else under /lit/three/ is missing, and traversal is refused', () => {
    assert.ok(resolveThree('/lit/three/other.js').missing);
    assert.ok(resolveThree('/lit/three/three.module.css').missing);
    assert.match(resolveThree('/lit/three/../stage-kit.js').refused, /path traversal/);
    assert.match(resolveThree('/lit/three/..%2fpackage.json').refused, /path traversal/);
  });
});
