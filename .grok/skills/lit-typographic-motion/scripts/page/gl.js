// WebGL2 plumbing: half-float HDR targets, fullscreen passes, Canvas2D layers as textures, GPU
// line batches, and the one uniform-setter wrapper every look pass routes through (MO-SH-00a).
// Mechanism adapted from pdoom-video app/src/engine/gl.ts and lines.ts (MIT, see NOTICE),
// re-expressed on raw WebGL2 without three.js.
const GL = { gl: null, scale: 1, W: 1920, H: 1080, PW: 1920, PH: 1080, quad: null, programs: new Map() };

// Shared GLSL ES 3.0 header. The simplex noise is Ashima Arts / Stefan Gustavson (MIT), as carried
// by pdoom-video's glsl/common.ts; everything else is written for this engine.
const GLSL_COMMON = `
#define PI 3.14159265359
#define TAU 6.28318530718
uniform float u_pxScale;
#define FRAG_PX (gl_FragCoord.xy / u_pxScale)
float sat(float x) { return clamp(x, 0.0, 1.0); }
vec3 sat(vec3 x) { return clamp(x, 0.0, 1.0); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 toSRGB(vec3 c) { c = max(c, vec3(0.0)); return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hashU(uint seed, vec2 p) { return hash12(p + vec2(float(seed & 0xffffu), float((seed >> 16u) & 0xffffu)) * 0.0137); }
vec3 _mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 _mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 _mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 _permute(vec3 x) { return _mod289(((x * 34.0) + 10.0) * x); }
vec4 _permute(vec4 x) { return _mod289(((x * 34.0) + 10.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy)); vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = _mod289(i);
  vec3 p = _permute(_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g; g.x = a0.x * x0.x + h.x * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0); const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy)); vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz); vec3 l = 1.0 - g; vec3 i1 = min(g.xyz, l.zxy); vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx; vec3 x2 = x0 - i2 + C.yyy; vec3 x3 = x0 - D.yyy;
  i = _mod289(i);
  vec4 p = _permute(_permute(_permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857; vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z); vec4 x_ = floor(j * ns.z); vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy; vec4 y = y_ * ns.x + ns.yyyy; vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy); vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0; vec4 s1 = floor(b1) * 2.0 + 1.0; vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy; vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x); vec3 p1 = vec3(a0.zw, h.y); vec3 p2 = vec3(a1.xy, h.z); vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = 1.79284291400159 - 0.85373472095314 * vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0); m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float fbm(vec2 p, int octaves) { float sum = 0.0, amp = 0.5; for (int i = 0; i < 6; i++) { if (i >= octaves) break; sum += amp * snoise(p); p = rot2(0.6) * p * 2.03 + 11.7; amp *= 0.5; } return sum; }
vec2 curl2(vec2 p, float t) {
  float e = 0.01;
  float n1 = snoise(vec3(p + vec2(0.0, e), t)), n2 = snoise(vec3(p - vec2(0.0, e), t));
  float n3 = snoise(vec3(p + vec2(e, 0.0), t)), n4 = snoise(vec3(p - vec2(e, 0.0), t));
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}
`;

const FS_VERT = `#version 300 es
precision highp float;
in vec2 a_pos;
out vec2 vUv;
void main() { vUv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

function initGL(scale) {
  GL.scale = scale;
  GL.PW = GL.W * scale;
  GL.PH = GL.H * scale;
  const canvas = document.createElement('canvas');
  canvas.width = GL.PW;
  canvas.height = GL.PH;
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 context unavailable');
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('WebGL2 half-float render targets (EXT_color_buffer_float) unavailable');
  GL.gl = gl;
  GL.canvas = canvas;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  GL.quad = vao;
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);
  return gl;
}

function compile(type, source) {
  const gl = GL.gl;
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`shader compile: ${gl.getShaderInfoLog(shader)}`);
  return shader;
}

function makeProgram(name, fragmentBody, vertex = FS_VERT) {
  const gl = GL.gl;
  const fragment = `#version 300 es\nprecision highp float;\nprecision highp int;\nin vec2 vUv;\nout vec4 fragColor;\n${GLSL_COMMON}\n${fragmentBody}`;
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
  gl.bindAttribLocation(program, 0, 'a_pos');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`program ${name}: ${gl.getProgramInfoLog(program)}`);
  const locations = new Map();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    const key = info.name.replace(/\[0\]$/, '');
    locations.set(key, gl.getUniformLocation(program, info.name));
  }
  const record = { name, program, locations };
  GL.programs.set(name, record);
  return record;
}

// Render targets are allocated at physical size; scenes and passes work in logical px.
function makeTarget(width, height, kind = 'hdr', filter = 'linear') {
  const gl = GL.gl;
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  const formats = { hdr: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT], rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE], r8: [gl.R8, gl.RED, gl.UNSIGNED_BYTE] };
  const [internal, format, type] = formats[kind];
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, null);
  const mode = filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mode);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mode);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer ${kind} ${width}x${height} incomplete (${status})`);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, width, height, kind };
}

function clearTarget(target, rgb, alpha = 1) {
  const gl = GL.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
  gl.clearColor(rgb[0], rgb[1], rgb[2], alpha);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

// The uniform-setter wrapper. A pass's uniform writes and draws are counted per output frame and
// become the MO-SH-00a render-log lines; nothing a pass draws can bypass this log.
const FrameLog = {
  active: false,
  passes: new Map(),
  begin() { this.passes = new Map(); },
  entry(pass) {
    if (!this.passes.has(pass)) this.passes.set(pass, { draws: 0, uniforms: {} });
    return this.passes.get(pass);
  },
};

function setUniform(record, name, spec) {
  const gl = GL.gl;
  const location = record.locations.get(name);
  if (location === undefined || location === null) return;
  const [type, value] = spec;
  if (type === 'f') gl.uniform1f(location, value);
  else if (type === 'i') gl.uniform1i(location, value);
  else if (type === 'u') gl.uniform1ui(location, value >>> 0);
  else if (type === 'v2') gl.uniform2f(location, value[0], value[1]);
  else if (type === 'v3') gl.uniform3f(location, value[0], value[1], value[2]);
  else if (type === 'v4') gl.uniform4f(location, value[0], value[1], value[2], value[3]);
  else if (type === 'fv') gl.uniform1fv(location, value);
  else if (type === 'v4v') gl.uniform4fv(location, value);
  else throw new Error(`uniform type ${type}`);
}

function loggable(spec) {
  const value = spec[1];
  if (Array.isArray(value)) return value.map((v) => Math.round(v * 1e5) / 1e5);
  if (value instanceof Float32Array) return `[${value.length} values]`;
  return typeof value === 'number' ? Math.round(value * 1e5) / 1e5 : value;
}

// Draw a fullscreen pass. `pass` names the look-library pass this draw belongs to (null for engine
// plumbing such as the post chain). `logUniforms` is true on the sub-sample the frame line reports.
function drawFullscreen(record, target, uniforms, textures, { pass = null, logUniforms = false, blend = null } = {}) {
  const gl = GL.gl;
  gl.useProgram(record.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
  gl.viewport(0, 0, target ? target.width : GL.PW, target ? target.height : GL.PH);
  setUniform(record, 'u_pxScale', ['f', target && target.logical === false ? 1 : GL.scale]);
  const entry = pass ? FrameLog.entry(pass) : null;
  for (const [name, spec] of Object.entries(uniforms)) {
    setUniform(record, name, spec);
    if (entry && logUniforms) entry.uniforms[name] = loggable(spec);
  }
  let unit = 0;
  for (const [name, texture] of Object.entries(textures)) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    setUniform(record, name, ['i', unit]);
    unit += 1;
  }
  if (blend === 'add') { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); }
  else if (blend === 'over') { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); }
  gl.bindVertexArray(GL.quad);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (blend) gl.disable(gl.BLEND);
  if (entry) entry.draws += 1;
}

// A logical 1920x1080 Canvas2D surface uploaded as a texture (premultiplied, sRGB-encoded bytes).
class Layer2D {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = GL.PW;
    this.canvas.height = GL.PH;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false });
    const gl = GL.gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.drawn = false;
  }
  clear() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(GL.scale, 0, 0, GL.scale, 0, 0);
    this.drawn = false;
  }
  upload() {
    const gl = GL.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return this.texture;
  }
}

// GPU-instanced anti-aliased capsules in logical px (x right, y down). Adapted from pdoom-video
// lines.ts (MIT): one draw call per batch, coverage from a capsule SDF.
const LINE_VERT = `#version 300 es
precision highp float;
in vec2 a_corner;
in vec4 a_seg;
in vec4 a_color;
in float a_width;
uniform vec2 u_res;
uniform float u_scaleOut;
out vec2 vLocal; out float vLen; out float vHalf; out vec4 vColor;
void main() {
  vec2 a = a_seg.xy * u_scaleOut, b = a_seg.zw * u_scaleOut;
  float w = a_width * u_scaleOut;
  float hw = max(w * 0.5, 0.35) + 1.0;
  vec2 d = b - a; float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float along = mix(-hw, len + hw, a_corner.x);
  vec2 p = a + dir * along + nrm * a_corner.y * hw;
  vec2 res = u_res * u_scaleOut;
  gl_Position = vec4(p.x / res.x * 2.0 - 1.0, 1.0 - p.y / res.y * 2.0, 0.0, 1.0);
  vLocal = vec2(along, a_corner.y * hw); vLen = len; vHalf = max(w * 0.5, 0.35);
  vColor = a_color * vec4(1.0, 1.0, 1.0, min(1.0, w / 0.7));
}`;
const LINE_FRAG = `#version 300 es
precision highp float;
in vec2 vLocal; in float vLen; in float vHalf; in vec4 vColor;
out vec4 fragColor;
void main() {
  float x = clamp(vLocal.x, 0.0, vLen);
  float d = length(vec2(vLocal.x - x, vLocal.y)) - vHalf;
  float a = clamp(0.5 - d, 0.0, 1.0) * vColor.a;
  if (a <= 0.0) discard;
  fragColor = vec4(vColor.rgb * a, a);
}`;

class LineBatch {
  constructor(capacity = 4096) {
    const gl = GL.gl;
    this.capacity = capacity;
    this.segments = new Float32Array(capacity * 4);
    this.colors = new Float32Array(capacity * 4);
    this.widths = new Float32Array(capacity);
    this.count = 0;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, LINE_VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, LINE_FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`line program: ${gl.getProgramInfoLog(program)}`);
    this.program = program;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 1, 1, 0, -1, 1, 1, 0, 1]), gl.STATIC_DRAW);
    const loc = (name) => gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc('a_corner'));
    gl.vertexAttribPointer(loc('a_corner'), 2, gl.FLOAT, false, 0, 0);
    const instanced = (name, size, data) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(loc(name));
      gl.vertexAttribPointer(loc(name), size, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(loc(name), 1);
      return buffer;
    };
    this.segBuffer = instanced('a_seg', 4, this.segments);
    this.colorBuffer = instanced('a_color', 4, this.colors);
    this.widthBuffer = instanced('a_width', 1, this.widths);
    gl.bindVertexArray(null);
  }
  clear() { this.count = 0; }
  segment(x0, y0, x1, y1, width, linearRgb, alpha = 1) {
    if (this.count >= this.capacity) return;
    const i = this.count++;
    this.segments.set([x0, y0, x1, y1], i * 4);
    this.colors.set([linearRgb[0], linearRgb[1], linearRgb[2], alpha], i * 4);
    this.widths[i] = width;
  }
  draw(target, pass, logUniforms, uniformsForLog) {
    if (this.count === 0) return 0;
    const gl = GL.gl;
    gl.useProgram(this.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.viewport(0, 0, target.width, target.height);
    gl.uniform2f(gl.getUniformLocation(this.program, 'u_res'), GL.W, GL.H);
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_scaleOut'), GL.scale);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.segBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.segments, 0, this.count * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors, 0, this.count * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.widthBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.widths, 0, this.count);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
    const entry = FrameLog.entry(pass);
    entry.draws += 1;
    if (logUniforms) Object.assign(entry.uniforms, uniformsForLog, { segments: this.count });
    return 1;
  }
}
