// The page engine: renders output frame n as a pure function of (n, run params) (MO-A-01/05).
// Sub-samples are averaged in linear HDR before the post chain, which runs once with the middle
// sample's overrides (MO-A-28). A seek re-integrates stateful passes from the shot start
// (MO-A-05/25). Adapted from pdoom-video app/src/engine/engine.ts and scene.ts (MIT, see NOTICE).
const Engine = {
  config: null,
  preset: null,
  lastFrame: -2,
  socket: null,
  lastBytes: null,

  async init(config) {
    this.config = config;
    initGL(config.scale);
    this.preset = config.preset;
    this.preset.flashLinear = hexToLinear(config.preset.palette.fg);
    this.preset.signalLinear = hexToLinear(config.preset.palette.signal);
    this.scriptRuns = scriptRuns;
    const W = GL.PW, H = GL.PH;
    this.accum = makeTarget(W, H);
    this.sceneA = makeTarget(W, H);
    this.sceneB = makeTarget(W, H);
    this.history = makeTarget(W, H);
    this.historyNext = makeTarget(W, H);
    this.output = makeTarget(W, H, 'rgba8', 'nearest');
    this.mask = makeTarget(W, H, 'r8', 'nearest');
    this.typeLayer = new Layer2D();
    this.gfxLayer = new Layer2D();
    Post.init();
    Passes.init();
    this.accumulate = makeProgram('accumulate', `uniform sampler2D u_src; uniform float u_weight; void main() { fragColor = vec4(texture(u_src, vUv).rgb * u_weight, 1.0); }`);
    this.copy = makeProgram('copy', `uniform sampler2D u_src; void main() { fragColor = texture(u_src, vUv); }`);
    this.maskProgram = makeProgram('glyph-mask', `
      uniform sampler2D u_layer; uniform vec2 u_shake; uniform float u_zoom; uniform vec2 u_res; uniform float u_curvature;
      void main() {
        vec2 uvTop = vec2(vUv.x, 1.0 - vUv.y);
        vec2 uv = (uvTop - 0.5) / u_zoom + 0.5 - vec2(u_shake.x, -u_shake.y) / u_res;
        vec2 cc = uv - 0.5;
        uv = 0.5 + cc * (1.0 + u_curvature * dot(cc, cc));
        float a = (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? 0.0 : texture(u_layer, uv).a;
        fragColor = vec4(a, 0.0, 0.0, 1.0);
      }`);
    const gl = GL.gl;
    this.pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, W * H * 4, gl.STREAM_READ);
    this.maskPbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.maskPbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, W * H * 4, gl.STREAM_READ);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.mask.framebuffer);
    this.maskReadFormat = gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_FORMAT) === gl.RED && gl.getParameter(gl.IMPLEMENTATION_COLOR_READ_TYPE) === gl.UNSIGNED_BYTE ? 'red' : 'rgba';
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.states = config.shots.map((shot) => {
      const kind = SceneKinds[shot.sceneId];
      if (!kind) throw new Error(`unknown scene ${shot.sceneId}`);
      return kind.create(shot, this.preset);
    });
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown (debug-info extension unavailable)', maskReadFormat: this.maskReadFormat };
  },

  shotIndexAt(t) {
    const shots = this.config.shots;
    for (let i = 0; i < shots.length; i += 1) if (t < shots[i].end - 1e-9) return i;
    return shots.length - 1;
  },

  // Composite everything active at time t into an HDR target (no post). Returns the target and the
  // frame record when `record` is set (the middle sub-sample).
  composite(t, frame, { logUniforms, record, stillOverride, persistenceSource }) {
    const shotIndex = this.shotIndexAt(t);
    const shot = this.config.shots[shotIndex];
    const scene = SceneKinds[shot.sceneId];
    const palette = this.preset.palette;
    const f = {
      t, frame, fps: this.config.fps, lt: t - shot.start, dur: shot.end - shot.start, p: clamp((t - shot.start) / (shot.end - shot.start)),
      beat: 60 / (this.config.bpm || 100), accentOn: shot.accent ? frame >= shot.accent.startFrame && frame < shot.accent.endFrame : false,
    };
    this.typeLayer.clear();
    this.gfxLayer.clear();
    const collected = { textBoxes: [], graphics: [], fills: [], blocks: [], rules: [] };
    const api = this.api(collected, shot);
    const overrides = scene.render(f, api, shot, this.states[shotIndex], this.preset) || {};
    let current = this.sceneA, spare = this.sceneB;
    clearTarget(current, hexToLinear(palette.bg));
    const passes = shot.passes;
    const ctxFor = (pass) => ({ src: current, dst: spare, shot, pass, t, frame, grainTime: frame / this.config.fps, logUniforms, stillOverride, prev: persistenceSource });
    let typeDrawn = false;
    const drawType = () => {
      if (typeDrawn) return;
      typeDrawn = true;
      if (!passes.some((p) => p.pass === 'terminal-ui')) compositeLayer(this.gfxLayer, current, null, false);
      compositeLayer(this.typeLayer, current, null, false);
    };
    for (const pass of passes) {
      if (pass.pass === 'tidal-gradient') {
        applyTidal({ ...ctxFor(pass), dst: current });
        continue;
      }
      if (pass.pass === 'terminal-ui') {
        compositeLayer(this.gfxLayer, current, 'terminal-ui', logUniforms, {});
        if (logUniforms) Object.assign(FrameLog.entry('terminal-ui').uniforms, pass.logUniforms);
        continue;
      }
      drawType();
      if (pass.pass === 'swiss-grid') { applySwissGrid({ ...ctxFor(pass), dst: current }, collected.rules); continue; }
      const ctx = ctxFor(pass);
      if (pass.pass === 'crt') applyCrt(ctx);
      else if (pass.pass === 'dither') applyDither(ctx);
      else if (pass.pass === 'glitch') applyGlitch(ctx);
      else throw new Error(`unknown pass ${pass.pass}`);
      [current, spare] = [spare, current];
    }
    drawType();
    return { target: current, overrides, collected, shot, typeTexture: this.typeLayer.texture };
  },

  api(collected, shot) {
    const typeLayer = this.typeLayer, gfxLayer = this.gfxLayer;
    return {
      text(elementId, line, x, y, options) {
        collected.textBoxes.push(...Type.draw(typeLayer, line, x, y, { elementId, ...options, weight: undefined }));
      },
      strokeText(elementId, layout, x, y, length, { hex, width, fontKey, text }) {
        const bbox = Stroke.draw(typeLayer, layout, x, y, length, { stroke: hex, width });
        if (bbox) collected.textBoxes.push({ elementId, text, voice: 'stroke', fontFile: Stroke.fonts.get(fontKey).meta.file, fontSizePx: layout.size, capHeightPx: Math.round(layout.capHeight * 100) / 100, weight: 400, fill: hex, bbox: bbox.map((v) => Math.round(v * 100) / 100), script: 'latin', trackingEm: 0, opacity: 1, fontKey });
      },
      rule(x0, y0, x1, y1, { hex, width = 1, alpha = 1 }) {
        collected.rules.push({ x0, y0, x1, y1, width, linear: hexToLinear(hex), alpha });
        const pad = width / 2 + 1;
        collected.graphics.push({ elementId: 'rule', kind: 'rule', bbox: [Math.min(x0, x1) - pad, Math.min(y0, y1) - pad, Math.max(x0, x1) + pad, Math.max(y0, y1) + pad] });
      },
      rect(elementId, x, y, w, h, { hex, fill = false, stroke = 0, alpha = 1, accent = false }) {
        if (w <= 0 || h <= 0) return;
        const c = gfxLayer.ctx;
        c.save();
        c.globalAlpha = alpha;
        if (stroke > 0) { c.strokeStyle = hex; c.lineWidth = stroke; c.strokeRect(x + stroke / 2, y + stroke / 2, w - stroke, h - stroke); }
        else { c.fillStyle = hex; c.fillRect(x, y, w, h); }
        c.restore();
        gfxLayer.drawn = true;
        collected.graphics.push({ elementId, kind: stroke > 0 ? 'stroke' : 'fill', bbox: [x, y, x + w, y + h] });
        if (!stroke && w >= 24 && h >= 24) collected.fills.push({ elementId, hex, area: w * h, accent });
      },
      block(elementId, lines, lineHeight, script, paragraph = null) {
        collected.blocks.push({ elementId, lines, lineHeight, script, ...(paragraph ? { paragraph } : {}) });
      },
    };
  },

  // Stateful crt persistence: P(n) = the crt output of frame n's middle sub-sample. A seek re-runs
  // the middle sub-sample of every earlier frame of the same shot, so seeked and sequential
  // renders take the identical path (MO-A-25).
  statefulPass(shot) {
    return shot.passes.find((pass) => pass.pass === 'crt' && pass.params.persistenceEnabled) ?? null;
  },

  prerollTo(frame, samples, shutter) {
    const t = frame / this.config.fps;
    const shot = this.config.shots[this.shotIndexAt(t)];
    clearTarget(this.history, [0, 0, 0]);
    if (!this.statefulPass(shot)) return;
    for (let k = shot.startFrame; k < frame; k += 1) {
      const mid = Math.floor(samples / 2);
      const ts = subSampleTime(k, mid, samples, this.config.fps, shutter);
      const { target } = this.composite(ts, k, { logUniforms: false, record: false, stillOverride: false, persistenceSource: this.history });
      drawFullscreen(this.copy, this.history, {}, { u_src: target.texture });
    }
  },

  async frame(n, options) {
    const { samples, shutter, stillOverride = false, wantMask = false, egress = 'none' } = options;
    const fps = this.config.fps;
    const t = n / fps;
    const shotIndex = this.shotIndexAt(t);
    const shot = this.config.shots[shotIndex];
    const stateful = this.statefulPass(shot);
    if (stateful) {
      const sequential = this.lastFrame === n - 1 && this.lastSamples === samples && this.config.shots[this.shotIndexAt((n - 1) / fps)] === shot;
      if (!sequential) this.prerollTo(n, samples, shutter);
    }
    FrameLog.begin();
    clearTarget(this.accum, [0, 0, 0]);
    const mid = Math.floor(samples / 2);
    let record = null;
    for (let i = 0; i < samples; i += 1) {
      const ts = subSampleTime(n, i, samples, fps, shutter);
      const result = this.composite(ts, n, { logUniforms: i === mid, record: i === mid, stillOverride, persistenceSource: stateful ? this.history : null });
      drawFullscreen(this.accumulate, this.accum, { u_weight: ['f', 1 / samples] }, { u_src: result.target.texture }, { blend: 'add' });
      if (i === mid) {
        record = result;
        const post = { ...POST_NEUTRAL, ...this.preset.post, ...(stillOverride ? { grain: 0 } : {}), ...result.overrides };
        const crt = shot.passes.find((pass) => pass.pass === 'crt');
        drawFullscreen(this.maskProgram, this.mask, { u_shake: ['v2', post.shake], u_zoom: ['f', post.zoom], u_res: ['v2', [GL.W, GL.H]], u_curvature: ['f', crt ? crt.params.curvature : 0] }, { u_layer: result.typeTexture });
        record.post = post;
        if (stateful) drawFullscreen(this.copy, this.historyNext, {}, { u_src: result.target.texture });
      }
    }
    if (stateful) [this.history, this.historyNext] = [this.historyNext, this.history];
    const post = Post.render(this.accum, this.output, record.post, n / fps, stillOverride);
    this.lastFrame = n;
    this.lastSamples = samples;
    const bytes = await this.readback(this.output, this.pbo, 'rgba');
    const maskBytes = await this.readback(this.mask, this.maskPbo, this.maskReadFormat);
    const stride = this.maskReadFormat === 'red' ? 1 : 4;
    let ink = 0;
    for (let i = 0; i < maskBytes.length; i += stride) if (maskBytes[i] >= 128) ink += 1;
    const transform = (box) => transformBox(box, post);
    const passLines = [...FrameLog.passes.entries()].map(([pass, entry]) => ({ pass, draws: entry.draws, uniforms: entry.uniforms }));
    const meta = {
      frame: n, shotIndex, ink,
      textBoxes: record.collected.textBoxes.map((box) => ({ ...box, bbox: transform(box.bbox) })),
      graphics: record.collected.graphics.map((g) => ({ ...g, bbox: transform(g.bbox) })),
      fills: record.collected.fills,
      blocks: record.collected.blocks,
      post: { flash: post.flash, invert: post.invert, shake: post.shake, zoom: post.zoom, grain: post.grain, fade: post.fade },
      passes: passLines,
    };
    if (wantMask) {
      const plain = new Uint8Array(GL.PW * GL.PH);
      for (let i = 0, j = 0; i < plain.length; i += 1, j += stride) plain[i] = maskBytes[j];
      meta.maskBase64 = await toBase64(plain);
    }
    if (egress === 'ws') this.socket.send(bytes);
    else this.lastBytes = bytes;
    return meta;
  },

  async readback(target, pbo, format) {
    const gl = GL.gl;
    const size = target.width * target.height * (format === 'red' ? 1 : 4);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.framebuffer);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.readPixels(0, 0, target.width, target.height, format === 'red' ? gl.RED : gl.RGBA, gl.UNSIGNED_BYTE, 0);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    for (;;) {
      const status = gl.clientWaitSync(sync, 0, 0);
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) break;
      if (status === gl.WAIT_FAILED) throw new Error('GPU readback wait failed');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    gl.deleteSync(sync);
    const out = new Uint8Array(size);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, out);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    return out;
  },

  async connect(url) {
    this.socket = new WebSocket(url);
    this.socket.binaryType = 'arraybuffer';
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(new Error(`frame socket could not connect to ${url}`));
    });
    return true;
  },

  async pull() {
    const bytes = this.lastBytes;
    this.lastBytes = null;
    return bytes ? toBase64(bytes) : null;
  },

  // MO-D-02: wall time from the frame call to readback complete, at --samples 1. Preroll for a
  // stateful shot runs before the clock starts; it is seek overhead, not per-frame cost.
  async perf(frames) {
    const times = [];
    for (const n of frames) {
      const shot = this.config.shots[this.shotIndexAt(n / this.config.fps)];
      if (this.statefulPass(shot)) {
        this.prerollTo(n, 1, 0.5);
        // Drain the preroll's queued GPU work so it is not billed to the timed frame.
        const gl = GL.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.history.framebuffer);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, new Float32Array(4));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }
      this.lastFrame = n - 1;
      this.lastSamples = 1;
      const started = performance.now();
      await this.frame(n, { samples: 1, shutter: 0.5, egress: 'none' });
      times.push(performance.now() - started);
    }
    this.lastBytes = null;
    return times;
  },

  // Contact sheet: thumbnails of the requested frames with a time label under each.
  async sheet(frames, columns, samples, shutter) {
    const cellW = 480, cellH = 270, pad = 6, label = 22;
    const rows = Math.ceil(frames.length / columns);
    const canvas = document.createElement('canvas');
    canvas.width = columns * (cellW + pad) + pad;
    canvas.height = rows * (cellH + label + pad) + pad;
    const c = canvas.getContext('2d');
    c.fillStyle = '#1c1c1c';
    c.fillRect(0, 0, canvas.width, canvas.height);
    for (const [i, n] of frames.entries()) {
      await this.frame(n, { samples, shutter, egress: 'none' });
      const bytes = this.lastBytes;
      this.lastBytes = null;
      const image = new ImageData(new Uint8ClampedArray(bytes.buffer), GL.PW, GL.PH);
      const bitmap = await createImageBitmap(image);
      const x = pad + (i % columns) * (cellW + pad), y = pad + Math.floor(i / columns) * (cellH + label + pad);
      c.drawImage(bitmap, x, y + label, cellW, cellH);
      c.fillStyle = '#dddddd';
      c.font = '14px monospace';
      c.fillText(`${(n / this.config.fps).toFixed(3)}s  f${n}`, x + 2, y + 16);
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    return toBase64(new Uint8Array(await blob.arrayBuffer()));
  },
};

function transformBox(box, post) {
  const zoom = post.zoom ?? 1, sx = post.shake?.[0] ?? 0, sy = post.shake?.[1] ?? 0;
  if (zoom === 1 && sx === 0 && sy === 0) return box;
  const map = (x, y) => [(x - 960) * zoom + 960 + sx, (y - 540) * zoom + 540 + sy];
  const a = map(box[0], box[1]), b = map(box[2], box[3]);
  return [a[0], a[1], b[0], b[1]].map((v) => Math.round(v * 100) / 100);
}

async function toBase64(bytes) {
  const blob = new Blob([bytes]);
  const url = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
  return String(url).slice(String(url).indexOf(',') + 1);
}

globalThis.__lm = {
  engine: Engine,
  addFont(key, base64, meta) { Type.register(key, base64, meta); return true; },
  addStroke(key, svg, meta) { Stroke.register(key, svg, meta); return true; },
  init: (config) => Engine.init(config),
  connect: (url) => Engine.connect(url),
  frame: (n, options) => Engine.frame(n, options),
  pull: () => Engine.pull(),
  perf: (frames) => Engine.perf(frames),
  sheet: (frames, columns, samples, shutter) => Engine.sheet(frames, columns, samples, shutter),
  seek() { Engine.lastFrame = -2; return true; },
};
