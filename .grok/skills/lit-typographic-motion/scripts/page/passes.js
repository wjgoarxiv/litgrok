// The six look-library passes (MO-SH-05..11), original GLSL written for this engine. Every uniform
// write goes through drawFullscreen/LineBatch, so each pass leaves a per-frame render-log line with
// its draw count. Seeds arrive as uint (MO-SH-01); hit and surge schedules are precomputed per shot
// on the Node side, never re-rolled per frame.
const Passes = {
  init() {
    this.tidal = makeProgram('tidal-gradient', `
      uniform float u_time; uniform uint u_seed; uniform vec3 u_stop0, u_stop1, u_stop2; uniform int u_stopCount;
      uniform float u_flowSpeed, u_warpAmount, u_curlStrength; uniform int u_octaves; uniform float u_surge;
      uniform int u_bandingSteps; uniform float u_ditherAmount; uniform vec2 u_origin; uniform float u_grainTime;
      vec3 ramp(float x) {
        if (u_stopCount < 3) return mix(u_stop0, u_stop1, x);
        return x < 0.5 ? mix(u_stop0, u_stop1, x * 2.0) : mix(u_stop1, u_stop2, x * 2.0 - 1.0);
      }
      void main() {
        vec2 p = vec2(vUv.x * 1.7778, vUv.y) * 1.35 + u_origin;
        float t = u_time * u_flowSpeed;
        vec2 q = vec2(fbm(p + vec2(t, 0.3 * t), u_octaves), fbm(p + vec2(5.2, 1.3) - vec2(0.7 * t, t), u_octaves));
        q += curl2(p * 0.45, t * 0.5) * u_curlStrength * 0.12;
        float warp = u_warpAmount * (1.0 + 0.6 * u_surge);
        float f = fbm(p + warp * 2.0 * q, u_octaves);
        float x = sat(0.5 + 0.55 * f + 0.06 * u_surge);
        if (u_bandingSteps > 0) x = floor(x * float(u_bandingSteps) + 0.5) / float(u_bandingSteps);
        vec3 col = ramp(x);
        if (u_ditherAmount > 0.0) {
          vec3 s = toSRGB(col) + (hashU(u_seed, FRAG_PX + fract(u_grainTime * 3.17) * 911.0) - 0.5) * u_ditherAmount;
          col = toLinear(sat(s));
        }
        fragColor = vec4(col, 1.0);
      }`);
    this.crt = makeProgram('crt', `
      uniform sampler2D u_src; uniform sampler2D u_prev; uniform float u_time; uniform uint u_seed;
      uniform float u_scanlineFreqPerFrame, u_scanlineDepth, u_phosphorPersistence, u_bloomAmount, u_curvature, u_vignette, u_triadMaskAmount, u_flickerAmp, u_flickerFreqHz;
      uniform float u_persistenceOn;
      void main() {
        vec2 cc = vUv - 0.5;
        vec2 uv = 0.5 + cc * (1.0 + u_curvature * dot(cc, cc));
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        vec3 col = texture(u_src, uv).rgb;
        vec2 px = 1.5 / vec2(1920.0, 1080.0);
        vec3 glow = (texture(u_src, uv + vec2(px.x, 0.0)).rgb + texture(u_src, uv - vec2(px.x, 0.0)).rgb + texture(u_src, uv + vec2(0.0, px.y)).rgb + texture(u_src, uv - vec2(0.0, px.y)).rgb) * 0.25;
        col += glow * u_bloomAmount;
        float scan = 1.0 - u_scanlineDepth * (0.5 + 0.5 * cos(TAU * uv.y * u_scanlineFreqPerFrame));
        float column = mod(floor(FRAG_PX.x), 3.0);
        vec3 triad = vec3(column == 0.0 ? 1.0 : 0.82, column == 1.0 ? 1.0 : 0.82, column == 2.0 ? 1.0 : 0.82);
        float grain = hashU(u_seed, floor(FRAG_PX / 2.0)) - 0.5;
        vec3 mask = mix(vec3(1.0), triad * (1.0 + 0.1 * grain), u_triadMaskAmount);
        float vig = mix(1.0, smoothstep(0.95, 0.3, length(cc * vec2(1.0, 0.86))), u_vignette);
        float flicker = 1.0 + 0.5 * u_flickerAmp * sin(TAU * u_flickerFreqHz * u_time);
        col = col * scan * mask * vig * flicker;
        if (u_persistenceOn > 0.5) col = max(col, texture(u_prev, vUv).rgb * u_phosphorPersistence);
        fragColor = vec4(col, 1.0);
      }`);
    this.dither = makeProgram('dither', `
      uniform sampler2D u_src; uniform int u_ditherMode; uniform int u_paletteSize; uniform int u_pixelScale; uniform float u_ditherStrength; uniform uint u_seed;
      float bayer(vec2 p, int n) {
        ivec2 q = ivec2(mod(p, float(n)));
        if (n == 2) { int m[4] = int[4](0, 2, 3, 1); return (float(m[q.y * 2 + q.x]) + 0.5) / 4.0; }
        if (n == 4) { int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5); return (float(m[q.y * 4 + q.x]) + 0.5) / 16.0; }
        int v = 0; ivec2 r = q;
        for (int bit = 0; bit < 3; bit++) { int x = (r.x >> bit) & 1; int y = (r.y >> bit) & 1; v = (v << 2) | ((x ^ y) << 1) | y; }
        return (float(v) + 0.5) / 64.0;
      }
      void main() {
        float cell = float(max(u_pixelScale, 1));
        vec2 cellPx = floor(FRAG_PX / cell);
        vec2 uv = (cellPx + 0.5) * cell / vec2(1920.0, 1080.0);
        vec3 s = toSRGB(texture(u_src, u_pixelScale > 1 ? uv : vUv).rgb);
        float threshold = u_ditherMode == 3 ? hashU(u_seed, cellPx) : bayer(cellPx, u_ditherMode == 0 ? 2 : u_ditherMode == 1 ? 4 : 8);
        float levels = u_paletteSize > 1 ? float(u_paletteSize - 1) : 63.0;
        s = floor(s * levels + 0.5 + (threshold - 0.5) * u_ditherStrength) / levels;
        fragColor = vec4(toLinear(sat(s)), 1.0);
      }`);
    this.glitch = makeProgram('glitch', `
      uniform sampler2D u_src; uniform float u_time; uniform uint u_seed; uniform float u_intensity; uniform int u_sliceCount;
      uniform float u_maxOffsetPx, u_rgbSplitPx; uniform float u_hitActive; uniform vec4 u_slices[12]; uniform vec4 u_blocks[6]; uniform vec4 u_blockShift[6];
      vec3 grab(vec2 uv, float split) {
        vec2 s = vec2(split / 1920.0, 0.0);
        return vec3(texture(u_src, uv + s).r, texture(u_src, uv).g, texture(u_src, uv - s).b);
      }
      void main() {
        vec3 col = texture(u_src, vUv).rgb;
        if (u_hitActive > 0.5) {
          float y = 1080.0 - FRAG_PX.y;
          for (int i = 0; i < 12; i++) {
            if (i >= u_sliceCount) break;
            vec4 band = u_slices[i];
            if (y >= band.x && y < band.y) col = grab(vUv - vec2(band.z * u_intensity / 1920.0, 0.0), band.w);
          }
          for (int i = 0; i < 6; i++) {
            vec4 b = u_blocks[i];
            if (b.z <= 0.0) continue;
            if (FRAG_PX.x >= b.x && FRAG_PX.x < b.x + b.z && y >= b.y && y < b.y + b.w) {
              vec3 c = texture(u_src, vUv + u_blockShift[i].xy / vec2(1920.0, 1080.0)).rgb;
              float total = c.r + c.g + c.b;
              if (total > 0.0 && c.r / total >= 0.75) c = vec3(luma(c));
              col = c;
            }
          }
        }
        fragColor = vec4(col, 1.0);
      }`);
    this.composite = makeProgram('layer-composite', `
      uniform sampler2D u_layer; uniform float u_opacity;
      void main() {
        vec4 c = texture(u_layer, vUv);
        vec3 straight = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
        fragColor = vec4(toLinear(straight) * c.a, c.a) * u_opacity;
      }`);
    this.lines = new LineBatch(4096);
  },
};

// Pass application. `ctx`: { src, dst, shot, pass (plan entry), t, grainTime, logUniforms, prev }.
function applyTidal(ctx) {
  const p = ctx.pass.params;
  drawFullscreen(Passes.tidal, ctx.dst, {
    u_time: ['f', ctx.t], u_seed: ['u', ctx.pass.seed], u_stop0: ['v3', ctx.pass.stopsLinear[0]], u_stop1: ['v3', ctx.pass.stopsLinear[1]],
    u_stop2: ['v3', ctx.pass.stopsLinear[2] ?? ctx.pass.stopsLinear[1]], u_stopCount: ['i', ctx.pass.stopsLinear.length],
    u_flowSpeed: ['f', p.flowSpeed], u_warpAmount: ['f', p.warpAmount], u_curlStrength: ['f', p.curlStrength], u_octaves: ['i', p.octaves],
    u_surge: ['f', surgeEnvelope(ctx.pass, ctx.t) * p.surgeOnHit], u_bandingSteps: ['i', p.bandingSteps],
    u_ditherAmount: ['f', ctx.stillOverride ? 0 : p.ditherAmount], u_origin: ['v2', ctx.pass.origin], u_grainTime: ['f', ctx.grainTime],
    u_surgeAttackSec: ['f', p.surgeAttackSec], u_surgeDecaySec: ['f', p.surgeDecaySec], u_surgeCapPerSec: ['f', p.surgeCapPerSec],
  }, {}, { pass: 'tidal-gradient', logUniforms: ctx.logUniforms });
}

// Surge envelope: attack and decay each >= 0.1 s (MO-SH-06); a pure function of t and the schedule.
function surgeEnvelope(pass, t) {
  let value = 0;
  const attack = pass.params.surgeAttackSec, decay = pass.params.surgeDecaySec;
  for (const at of pass.schedule) {
    if (t < at - attack || t > at + decay) continue;
    value = Math.max(value, t < at ? smoothstep(at - attack, at, t) : 1 - smoothstep(at, at + decay, t));
  }
  return value;
}

function applyCrt(ctx) {
  const p = ctx.pass.params;
  drawFullscreen(Passes.crt, ctx.dst, {
    u_time: ['f', ctx.t], u_seed: ['u', ctx.pass.seed], u_scanlineFreqPerFrame: ['f', p.scanlineFreq], u_scanlineDepth: ['f', p.scanlineDepth],
    u_phosphorPersistence: ['f', p.phosphorPersistence], u_bloomAmount: ['f', p.bloomAmount], u_curvature: ['f', p.curvature], u_vignette: ['f', p.vignette],
    u_triadMaskAmount: ['f', p.triadMaskAmount], u_flickerAmp: ['f', flickerAmp(ctx.pass, ctx.t)], u_flickerFreqHz: ['f', p.flickerFreqHz],
    u_persistenceOn: ['f', p.persistenceEnabled && ctx.prev ? 1 : 0],
  }, { u_src: ctx.src.texture, u_prev: (ctx.prev ?? ctx.src).texture }, { pass: 'crt', logUniforms: ctx.logUniforms });
}

// A boot-flicker burst raises the flicker amplitude inside its 250 ms window, still bounded by the
// crt cap (MO-B-02: never a separate, uncapped flicker).
function flickerAmp(pass, t) {
  const base = pass.params.flickerAmp;
  const boot = pass.bootFlicker ?? [];
  const inBurst = boot.some((at) => t >= at && t < at + 0.25);
  return Math.min(PASS_LIMITS.crtFlicker, inBurst ? base * 2 : base);
}

function applyDither(ctx) {
  const p = ctx.pass.params;
  drawFullscreen(Passes.dither, ctx.dst, {
    u_ditherMode: ['i', ctx.stillOverride && p.mode === 3 ? 1 : p.mode], u_paletteSize: ['i', p.paletteSize], u_pixelScale: ['i', p.pixelScale],
    u_ditherStrength: ['f', p.ditherStrength], u_seed: ['u', ctx.pass.seed],
  }, { u_src: ctx.src.texture }, { pass: 'dither', logUniforms: ctx.logUniforms });
}

function glitchHitAt(pass, frame) {
  return pass.schedule.find((hit) => frame >= hit.frame && frame < hit.frame + hit.holdFrames) ?? null;
}

function applyGlitch(ctx) {
  const p = ctx.pass.params;
  const hit = glitchHitAt(ctx.pass, ctx.frame);
  const slices = new Float32Array(48);
  const blocks = new Float32Array(24);
  const shifts = new Float32Array(24);
  if (hit) {
    hit.slices.forEach((s, i) => slices.set([s.y0, s.y1, s.offsetPx, s.splitPx], i * 4));
    hit.blocks.forEach((b, i) => { blocks.set([b.x, b.y, b.w, b.h], i * 4); shifts.set([b.dx, b.dy, 0, 0], i * 4); });
  }
  drawFullscreen(Passes.glitch, ctx.dst, {
    u_time: ['f', ctx.t], u_seed: ['u', ctx.pass.seed], u_intensity: ['f', p.intensity], u_sliceCount: ['i', hit ? hit.slices.length : 0],
    u_maxOffsetPx: ['f', p.maxOffsetPx], u_rgbSplitPx: ['f', p.rgbSplitPx], u_hitActive: ['f', hit ? 1 : 0],
    u_slices: ['v4v', slices], u_blocks: ['v4v', blocks], u_blockShift: ['v4v', shifts],
    u_holdFrames: ['i', p.holdFrames], u_hitRatePerSec: ['f', p.hitRatePerSec], u_areaCapPct: ['f', p.areaCapPct],
  }, { u_src: ctx.src.texture }, { pass: 'glitch', logUniforms: ctx.logUniforms });
}

// swiss-grid: hairline rules as real GPU line draws; column guides only when showGuides (never in
// an export, MO-SH-10). No seed.
function applySwissGrid(ctx, rules) {
  const p = ctx.pass.params;
  const lines = Passes.lines;
  lines.clear();
  for (const rule of rules) lines.segment(rule.x0, rule.y0, rule.x1, rule.y1, rule.width ?? p.hairlineWidthPx, rule.linear, rule.alpha ?? 1);
  if (p.showGuides) {
    const inner = GL.W - 2 * p.marginPx;
    const column = (inner - (p.columns - 1) * p.gutterPx) / p.columns;
    for (let i = 0; i < p.columns; i += 1) {
      const x = p.marginPx + i * (column + p.gutterPx);
      lines.segment(x, 0, x, GL.H, 1, Engine.preset.signalLinear, 0.35);
      lines.segment(x + column, 0, x + column, GL.H, 1, Engine.preset.signalLinear, 0.35);
    }
  }
  const logged = { u_columns: p.columns, u_gutterPx: p.gutterPx, u_marginPx: p.marginPx, u_baselinePx: p.baselinePx, u_moduleSnap: p.moduleSnap, u_showGuides: p.showGuides, u_hairlineWidthPx: p.hairlineWidthPx };
  const drew = lines.draw(ctx.dst, 'swiss-grid', ctx.logUniforms, logged);
  if (!drew) FrameLog.entry('swiss-grid');
}

function compositeLayer(layer, dst, pass, logUniforms, extra = {}) {
  if (!layer.drawn) return;
  drawFullscreen(Passes.composite, dst, { u_opacity: ['f', 1], ...extra }, { u_layer: layer.upload() }, { pass, logUniforms, blend: 'over' });
}
