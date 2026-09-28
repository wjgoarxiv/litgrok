// The global post chain, applied once per output frame to the averaged linear-HDR composite, in the
// fixed order: bloom + halation -> chromatic aberration -> tone shoulder -> film grain -> vignette ->
// flash -> shake/zoom -> invert, with the sRGB transfer applied once at the very end (MO-A-29).
// Pyramid bloom and the shoulder curve are adapted from pdoom-video app/src/engine/post.ts (MIT,
// see NOTICE); the override vocabulary follows MO-A-58.
const POST_NEUTRAL = Object.freeze({ exposure: 1, bloom: 0, bloomThreshold: 0.85, bloomKnee: 0, bloomRadius: 0, halation: 0, ca: 0, grain: 0, vignette: 0, fade: 1, flash: 0, shake: [0, 0], zoom: 1, invert: false });
const POST_KEYS = Object.keys(POST_NEUTRAL);
const BLOOM_LEVELS = 5;

const Post = {
  init() {
    const W = GL.W, H = GL.H;
    this.mips = [];
    this.ups = [];
    let w = W >> 1, h = H >> 1;
    for (let i = 0; i < BLOOM_LEVELS; i += 1) {
      const a = makeTarget(Math.max(2, w), Math.max(2, h));
      const b = makeTarget(Math.max(2, w), Math.max(2, h));
      a.logical = false; b.logical = false;
      this.mips.push(a); this.ups.push(b);
      w >>= 1; h >>= 1;
    }
    this.graded = makeTarget(GL.PW, GL.PH);
    this.prefilter = makeProgram('post-prefilter', `
      uniform sampler2D u_src; uniform vec2 u_texel; uniform float u_threshold, u_knee;
      void main() {
        vec3 c = texture(u_src, vUv + u_texel * vec2(-1.0, -1.0)).rgb + texture(u_src, vUv + u_texel * vec2(1.0, -1.0)).rgb
          + texture(u_src, vUv + u_texel * vec2(-1.0, 1.0)).rgb + texture(u_src, vUv + u_texel * vec2(1.0, 1.0)).rgb;
        c = min(c * 0.25, vec3(40.0));
        float l = max(c.r, max(c.g, c.b));
        float k = max(u_knee, 1e-4);
        float soft = clamp(l - u_threshold + k, 0.0, 2.0 * k);
        soft = soft * soft / (4.0 * k + 1e-5);
        fragColor = vec4(c * max(soft, l - u_threshold) / max(l, 1e-5), 1.0);
      }`);
    this.down = makeProgram('post-down', `
      uniform sampler2D u_src; uniform vec2 u_texel;
      void main() {
        vec3 a = texture(u_src, vUv + u_texel * vec2(-1.0, -1.0)).rgb, b = texture(u_src, vUv + u_texel * vec2(1.0, -1.0)).rgb;
        vec3 c = texture(u_src, vUv + u_texel * vec2(-1.0, 1.0)).rgb, d = texture(u_src, vUv + u_texel * vec2(1.0, 1.0)).rgb;
        vec3 e = texture(u_src, vUv).rgb;
        fragColor = vec4((a + b + c + d) * 0.125 + e * 0.5, 1.0);
      }`);
    this.up = makeProgram('post-up', `
      uniform sampler2D u_src; uniform sampler2D u_prev; uniform vec2 u_texel; uniform float u_radius;
      void main() {
        vec2 o = u_texel * u_radius;
        vec3 s = texture(u_src, vUv - o).rgb + 2.0 * texture(u_src, vUv + vec2(0.0, -o.y)).rgb + texture(u_src, vUv + vec2(o.x, -o.y)).rgb
          + 2.0 * texture(u_src, vUv + vec2(-o.x, 0.0)).rgb + 4.0 * texture(u_src, vUv).rgb + 2.0 * texture(u_src, vUv + vec2(o.x, 0.0)).rgb
          + texture(u_src, vUv + vec2(-o.x, o.y)).rgb + 2.0 * texture(u_src, vUv + vec2(0.0, o.y)).rgb + texture(u_src, vUv + o).rgb;
        fragColor = vec4(texture(u_prev, vUv).rgb + s / 16.0, 1.0);
      }`);
    this.grade = makeProgram('post-grade', `
      uniform sampler2D u_src; uniform sampler2D u_bloom; uniform sampler2D u_halo;
      uniform float u_exposure, u_bloomMix, u_halation, u_ca, u_grain, u_vignette, u_flash, u_fade, u_grainTime;
      uniform vec3 u_flashColor; uniform vec2 u_res;
      vec3 shoulder(vec3 x) {
        const float k = 0.72;
        vec3 y = mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x));
        float over = max(max(x.r, x.g), x.b);
        return mix(y, vec3(1.0), smoothstep(2.0, 12.0, over) * 0.85);
      }
      vec3 bloomed(vec2 uv) { return texture(u_src, uv).rgb + texture(u_bloom, uv).rgb * u_bloomMix + vec3(1.0, 0.25, 0.08) * luma(texture(u_halo, uv).rgb) * u_halation; }
      void main() {
        vec2 dc = vUv - 0.5;
        float r2 = dot(dc * vec2(u_res.x / u_res.y, 1.0), dc * vec2(u_res.x / u_res.y, 1.0));
        vec2 off = dc * r2 * u_ca / u_res.x * 4.0;
        vec3 col = vec3(bloomed(vUv + off).r, bloomed(vUv).g, bloomed(vUv - off).b);
        col = shoulder(col * u_exposure);
        if (u_grain > 0.0) {
          vec3 s = toSRGB(col);
          float g1 = hash12(FRAG_PX + fract(u_grainTime * 13.37) * 1000.0) - 0.5;
          float g2 = hash12(floor(FRAG_PX / 2.0) + fract(u_grainTime * 7.13) * 1000.0) - 0.5;
          float lm = luma(s);
          s += (g1 * 0.6 + g2 * 0.4) * u_grain * (0.55 + 1.2 * lm * (1.0 - lm));
          col = toLinear(sat(s));
        }
        float v = smoothstep(0.95, 0.25, length(dc * vec2(1.0, 0.8)));
        col *= mix(1.0, v, u_vignette);
        col += u_flashColor * u_flash;
        col *= u_fade;
        fragColor = vec4(col, 1.0);
      }`);
    this.output = makeProgram('post-output', `
      uniform sampler2D u_src; uniform vec2 u_shake; uniform float u_zoom; uniform float u_invert; uniform float u_outDither; uniform float u_grainTime; uniform vec2 u_res;
      void main() {
        vec2 uvTop = vec2(vUv.x, 1.0 - vUv.y);
        vec2 uv = (uvTop - 0.5) / u_zoom + 0.5 - vec2(u_shake.x, -u_shake.y) / u_res;
        vec3 col = (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ? vec3(0.0) : texture(u_src, uv).rgb;
        vec3 s = toSRGB(col);
        if (u_invert > 0.5) s = vec3(1.0) - sat(s);
        s += (hash12(FRAG_PX * 1.37 + u_grainTime) - 0.5) / 255.0 * u_outDither;
        fragColor = vec4(sat(s), 1.0);
      }`);
  },

  // Returns the physical 8-bit output target (rows top-to-bottom for readPixels).
  render(source, output, params, grainTime, stillOverride) {
    const p = { ...POST_NEUTRAL, ...params };
    const grain = stillOverride ? 0 : p.grain;
    if (p.bloom > 0 || p.halation > 0) {
      drawFullscreen(this.prefilter, this.mips[0], { u_texel: ['v2', [1 / GL.PW, 1 / GL.PH]], u_threshold: ['f', p.bloomThreshold], u_knee: ['f', p.bloomKnee] }, { u_src: source.texture });
      for (let i = 1; i < BLOOM_LEVELS; i += 1) {
        const s = this.mips[i - 1];
        drawFullscreen(this.down, this.mips[i], { u_texel: ['v2', [1 / s.width, 1 / s.height]] }, { u_src: s.texture });
      }
      let previous = this.mips[BLOOM_LEVELS - 1].texture;
      for (let i = BLOOM_LEVELS - 2; i >= 0; i -= 1) {
        const small = i === BLOOM_LEVELS - 2 ? this.mips[BLOOM_LEVELS - 1] : this.ups[i + 1];
        drawFullscreen(this.up, this.ups[i], { u_texel: ['v2', [1 / small.width, 1 / small.height]], u_radius: ['f', 0.5 + p.bloomRadius] }, { u_src: previous, u_prev: this.mips[i].texture });
        previous = this.ups[i].texture;
      }
    } else {
      clearTarget(this.ups[0], [0, 0, 0]);
      clearTarget(this.ups[Math.min(3, BLOOM_LEVELS - 1)], [0, 0, 0]);
    }
    drawFullscreen(this.grade, this.graded, {
      u_exposure: ['f', p.exposure], u_bloomMix: ['f', p.bloom / 3], u_halation: ['f', p.halation], u_ca: ['f', p.ca],
      u_grain: ['f', grain], u_vignette: ['f', p.vignette], u_flash: ['f', p.flash], u_fade: ['f', p.fade],
      u_grainTime: ['f', grainTime], u_flashColor: ['v3', Engine.preset.flashLinear], u_res: ['v2', [GL.W, GL.H]],
    }, { u_src: source.texture, u_bloom: this.ups[0].texture, u_halo: this.ups[Math.min(3, BLOOM_LEVELS - 1)].texture });
    drawFullscreen(this.output, output, {
      u_shake: ['v2', p.shake], u_zoom: ['f', p.zoom], u_invert: ['f', p.invert ? 1 : 0], u_outDither: ['f', stillOverride ? 0 : 1], u_grainTime: ['f', grainTime], u_res: ['v2', [GL.W, GL.H]],
    }, { u_src: this.graded.texture });
    return p;
  },
};
