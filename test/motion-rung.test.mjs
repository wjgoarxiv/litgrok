// lit-typographic-motion rung selection: which treatments ask for the GPU rung, the flag sets for
// each rung, and the report line that names the rung and the renderer the page actually got.
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { stageArgs } from '../.grok/skills/lit-typographic-motion/scripts/lib/chrome.mjs';
import { stageReportText } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage-gate.mjs';
import { stageFlagsUsed, stageRung } from '../.grok/skills/lit-typographic-motion/scripts/lib/stage.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe('the browser rung', () => {
  test('a three.js world asks for the GPU rung; anything else renders on software', () => {
    assert.equal(stageRung({}), 'software');
    assert.equal(stageRung({ depth: '2d' }), 'software');
    assert.equal(stageRung({ depth: '3d' }), 'gpu');
    assert.equal(stageRung({ depth: '3d', render3d: 'blender' }), 'software', 'a Blender plate shows under HTML type');
    assert.equal(stageRung({ render3d: 'blender' }), 'software');
  });

  test('the software rung is SwiftShader with CPU raster; the GPU rung keeps page raster on the CPU', () => {
    const software = stageArgs({ profileDir: '/p', width: 1920, height: 1080 });
    assert.ok(software.includes('--use-angle=swiftshader'));
    assert.ok(!software.some((arg) => /--use-angle=metal|--use-angle=gl|--use-angle=d3d11/.test(arg)), 'no GPU rung on the software path');
    for (const [platform, flag] of [['darwin', '--use-angle=metal'], ['linux', '--use-angle=gl'], ['win32', '--use-angle=d3d11']]) {
      const gpu = stageArgs({ profileDir: '/p', width: 1920, height: 1080, rung: 'gpu', platform });
      assert.ok(gpu.includes(flag), `${platform}: ${flag}`);
      assert.ok(!gpu.includes('--use-angle=swiftshader'), `${platform}: no SwiftShader on the GPU rung`);
      assert.ok(!gpu.includes('--enable-gpu-rasterization'), `${platform}: page raster stays on the CPU`);
    }
    assert.ok(stageFlagsUsed().includes('--use-angle=swiftshader'));
    assert.ok(!stageFlagsUsed('gpu').includes('--enable-gpu-rasterization'));
  });

  test('the report names the rung the page got and its renderer string', () => {
    const out = mkdtempSync(join(tmpdir(), 'lgm-rung-'));
    const manifest = {
      format: '16:9', resolution: [1920, 1080], durationSec: 6, targetDurationSec: 6, fps: 30,
      rung: 'gpu', renderer: 'ANGLE (Apple, ANGLE Metal Renderer) on the gpu rung (stage path)',
      sound: {}, round: 1, warnings: [],
    };
    const report = stageReportText({ manifest, gate: { status: 'PASS', results: [] }, withheld: null, perf: null, outDir: out, treatment: { durationSec: 6 } });
    assert.match(report, /renderer: ANGLE \(Apple, ANGLE Metal Renderer\) on the gpu rung \(stage path\)/);
  });
});
