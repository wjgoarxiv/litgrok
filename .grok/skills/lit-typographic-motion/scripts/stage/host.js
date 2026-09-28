// Stage host: installed with Page.addScriptToEvaluateOnNewDocument before any page script runs.
// It virtualizes time (Date, performance.now, timers, animation frames, idle callbacks, the
// document timeline) and Math.random, guards the forbidden element and API surfaces, keeps the
// canvas text registry, and exposes the per-frame step the renderer drives (brief section 6e).
// __LIT_CFG__ is replaced by the renderer with { seed, fps, epochMs }.
(() => {
  if (window.__litHost) return;
  const CFG = __LIT_CFG__;
  const native = {
    raf: window.requestAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
    getAnimations: document.getAnimations.bind(document),
    MutationObserver: window.MutationObserver,
    createElement: Document.prototype.createElement,
    createElementNS: Document.prototype.createElementNS,
    getContext: HTMLCanvasElement.prototype.getContext,
    fillText: CanvasRenderingContext2D.prototype.fillText,
    strokeText: CanvasRenderingContext2D.prototype.strokeText,
  };
  const state = {
    t: 0, frame: -1, seq: 1, timers: new Map(), rafs: new Map(), nextRaf: 1,
    violations: [], errors: [], webgl: { requested: 0, contexts: 0, failed: null },
    stage: null, birth: new Map(), finished: new WeakSet(), svgBirth: new Map(),
    texts: [], canvasTextCalls: 0,
  };
  const violation = (kind, name) => { if (!state.violations.some((v) => v.kind === kind && v.name === name)) state.violations.push({ kind, name }); };

  // Time. Everything below reads state.t (ms), set only by step().
  const RealDate = Date;
  function VDate(...args) {
    if (!new.target) return new RealDate(CFG.epochMs + state.t).toString();
    return Reflect.construct(RealDate, args.length ? args : [CFG.epochMs + state.t], new.target);
  }
  VDate.prototype = RealDate.prototype;
  Object.setPrototypeOf(VDate, RealDate);
  VDate.now = () => CFG.epochMs + Math.floor(state.t);
  window.Date = VDate;
  Object.defineProperty(performance, 'now', { configurable: true, value: () => state.t });
  try { Object.defineProperty(document.timeline, 'currentTime', { configurable: true, get: () => state.t }); } catch { /* read-only on this build */ }

  const addTimer = (fn, ms, args, repeat) => {
    const id = state.seq++;
    const delay = Math.max(0, Number(ms) || 0);
    state.timers.set(id, { fn: typeof fn === 'function' ? fn : () => (0, eval)(String(fn)), args, due: state.t + delay, order: id, interval: repeat ? Math.max(1, delay) : null });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => addTimer(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => addTimer(fn, ms, args, true);
  window.clearTimeout = (id) => { state.timers.delete(id); };
  window.clearInterval = (id) => { state.timers.delete(id); };
  window.requestAnimationFrame = (cb) => { const id = state.nextRaf++; state.rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { state.rafs.delete(id); };
  window.requestIdleCallback = (cb) => addTimer(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 0, [], false);
  window.cancelIdleCallback = (id) => { state.timers.delete(id); };

  let seed = (CFG.seed >>> 0) || 1;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let x = seed;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };

  // Forbidden APIs throw and are recorded; the renderer turns any record into exit 17.
  // Network APIs (WebSocket, WebTransport, RTCPeerConnection) are recorded as network requests.
  const forbid = (holder, prop, name = prop, kind = 'api') => {
    try {
      Object.defineProperty(holder, prop, { configurable: true, writable: true, value: function forbidden() { violation(kind, name); throw new Error(`lit stage: ${name} is not allowed`); } });
    } catch { violation('api-guard', name); }
  };
  for (const name of ['Audio', 'AudioContext', 'webkitAudioContext', 'OfflineAudioContext', 'Worker', 'SharedWorker']) if (name in window) forbid(window, name);
  for (const name of ['WebSocket', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection']) if (name in window) forbid(window, name, name, 'network');
  if (navigator.serviceWorker) forbid(Object.getPrototypeOf(navigator.serviceWorker), 'register', 'serviceWorker.register');

  const FORBIDDEN_TAGS = new Set(['VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED', 'FRAME', 'FRAMESET']);
  Document.prototype.createElement = function createElement(tag, ...rest) {
    if (FORBIDDEN_TAGS.has(String(tag).toUpperCase())) violation('element', String(tag).toLowerCase());
    return native.createElement.call(this, tag, ...rest);
  };
  Document.prototype.createElementNS = function createElementNS(ns, tag, ...rest) {
    if (FORBIDDEN_TAGS.has(String(tag).split(':').pop().toUpperCase())) violation('element', String(tag).toLowerCase());
    return native.createElementNS.call(this, ns, tag, ...rest);
  };
  const scanNode = (node) => {
    if (node.nodeType !== 1) return;
    if (FORBIDDEN_TAGS.has(node.tagName.toUpperCase())) violation('element', node.tagName.toLowerCase());
    for (const child of node.querySelectorAll?.('video,audio,iframe,object,embed,frame,frameset') ?? []) violation('element', child.tagName.toLowerCase());
  };
  new native.MutationObserver((records) => { for (const record of records) for (const node of record.addedNodes) scanNode(node); })
    .observe(document, { childList: true, subtree: true });

  // Canvas: WebGL requests are recorded (exit 11 only when one is refused) and keep their drawing
  // buffer; 2D text calls are counted so unregistered canvas text can be reported.
  HTMLCanvasElement.prototype.getContext = function getContext(type, attributes) {
    const gl = /webgl/i.test(String(type));
    if (gl) state.webgl.requested += 1;
    const ctx = native.getContext.call(this, type, gl ? { ...(attributes || {}), preserveDrawingBuffer: true } : attributes);
    if (gl) { if (ctx) state.webgl.contexts += 1; else state.webgl.failed = String(type); }
    return ctx;
  };
  CanvasRenderingContext2D.prototype.fillText = function fillText(...args) { state.canvasTextCalls += 1; return native.fillText.apply(this, args); };
  CanvasRenderingContext2D.prototype.strokeText = function strokeText(...args) { state.canvasTextCalls += 1; return native.strokeText.apply(this, args); };

  window.addEventListener('error', (event) => { state.errors.push(String(event.message || event.error || 'error')); });
  window.addEventListener('unhandledrejection', (event) => { state.errors.push(`unhandled rejection: ${String(event.reason && (event.reason.message || event.reason))}`); });

  const microtasks = async () => { for (let i = 0; i < 12; i += 1) await null; };
  const nativeFrames = (n) => new Promise((resolve) => { const tick = (left) => (left <= 0 ? resolve() : native.raf(() => tick(left - 1))); tick(n); });

  function runTimers() {
    for (let guard = 0; guard < 20000; guard += 1) {
      let next = null;
      for (const [id, timer] of state.timers) {
        if (timer.due > state.t + 1e-6) continue;
        if (!next || timer.due < next.timer.due || (timer.due === next.timer.due && timer.order < next.timer.order)) next = { id, timer };
      }
      if (!next) return;
      const { id, timer } = next;
      if (timer.interval) { timer.due += timer.interval; timer.order = state.seq++; } else state.timers.delete(id);
      try { timer.fn(...timer.args); } catch (error) { state.errors.push(`timer: ${error && error.message}`); }
    }
    state.errors.push('timer storm: more than 20000 timer callbacks in one frame');
  }

  function adoptAnimations(t) {
    for (const animation of native.getAnimations()) {
      if (state.birth.has(animation)) continue;
      try { animation.pause(); animation.currentTime = 0; } catch { /* a finished or idle animation */ }
      state.birth.set(animation, t);
    }
    for (const svg of document.querySelectorAll('svg')) {
      if (svg.ownerSVGElement || state.svgBirth.has(svg)) continue;
      state.svgBirth.set(svg, t);
      try { svg.pauseAnimations(); svg.setCurrentTime(0); } catch { /* no SMIL on this node */ }
    }
  }

  const host = {
    state,
    define(spec) { state.stage = spec; return spec; },
    text(entry) { state.texts.push({ ...entry, frame: state.frame }); return entry; },
    contract() {
      const spec = state.stage || window.litStage || null;
      if (!spec) return null;
      state.stage = spec;
      return { width: spec.width, height: spec.height, fps: spec.fps, duration: spec.duration, render: typeof spec.render === 'function' };
    },
    async prepare() {
      for (const img of document.images) img.loading = 'eager';
      const faces = [];
      for (const face of document.fonts) {
        try { await face.load(); faces.push({ family: face.family, weight: face.weight, stretch: face.stretch, status: face.status }); } catch (error) { faces.push({ family: face.family, weight: face.weight, status: 'error', error: String(error) }); }
      }
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode().catch(() => null)));
      return { faces, contract: host.contract() };
    },
    // One frame: t is computed from f, never accumulated (brief section 6e steps 1-7).
    // settle: false (stills-only frames that are not captured) skips the two native frames.
    async step(f, fps, settle = true) {
      const t = f / fps;
      state.frame = f;
      state.t = t * 1000;
      state.texts = state.texts.filter((entry) => entry.frame === -1);
      for (const [animation, birth] of state.birth) {
        if (state.finished.has(animation)) continue;
        let end = Infinity;
        try { end = animation.effect ? animation.effect.getComputedTiming().endTime : Infinity; } catch { /* detached effect */ }
        const local = (t - birth) * 1000;
        try {
          if (Number.isFinite(end) && local >= end) { animation.currentTime = end; animation.finish(); state.finished.add(animation); await microtasks(); }
          else animation.currentTime = Math.max(0, local);
        } catch { state.finished.add(animation); }
      }
      for (const [svg, birth] of state.svgBirth) { try { svg.pauseAnimations(); svg.setCurrentTime(Math.max(0, t - birth)); } catch { /* removed */ } }
      runTimers();
      const callbacks = [...state.rafs.values()];
      state.rafs.clear();
      for (const cb of callbacks) { try { cb(state.t); } catch (error) { state.errors.push(`animation frame: ${error && error.message}`); } }
      let renderError = null;
      if (state.stage && typeof state.stage.render === 'function') {
        try { state.stage.render(t); } catch (error) { renderError = String(error && (error.stack || error.message)); }
      }
      await microtasks();
      getComputedStyle(document.documentElement).opacity;
      adoptAnimations(t);
      document.documentElement.getBoundingClientRect();
      await document.fonts.ready;
      await Promise.all([...document.images].filter((img) => !img.complete).map((img) => img.decode().catch(() => null)));
      if (settle) await nativeFrames(2);
      return { violations: state.violations.length, renderError, webgl: state.webgl, errors: state.errors.length };
    },
    settle: () => nativeFrames(2),
    report() {
      return { violations: state.violations, errors: state.errors.slice(0, 20), webgl: state.webgl, canvasTextCalls: state.canvasTextCalls, texts: state.texts.map(({ content, x, y, w, h, decor }) => ({ content, x, y, w, h, decor: Boolean(decor) })) };
    },
  };
  Object.defineProperty(window, '__litHost', { value: host, enumerable: false, configurable: false, writable: false });
})();
