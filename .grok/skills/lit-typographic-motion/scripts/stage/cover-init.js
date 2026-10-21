// Cover init: installed with Page.addScriptToEvaluateOnNewDocument before any cover page script.
// A cover frame is a function of t alone and the renderer seeks frames out of order, so nothing a
// page could read to tell one capture from another may answer: Math.random, Date.now, new Date()
// with no arguments, performance.now, requestAnimationFrame, setInterval and
// crypto.getRandomValues all throw. Each refused call is kept by name so the renderer can name it
// (exit 18) even when the page caught the error. CSS animations and transitions would run on the
// wall clock, so they are switched off. (The film path's host.js virtualizes time instead; a cover
// has no time to virtualize.) The renderer alone keeps the native animation frame, to let two
// frames settle after each renderFrame(t) so a capture never races the rasterizer.
(() => {
  'use strict';
  if (window.__litCoverMisuse) return;
  const refused = [];
  const refuse = (name, fix) => function refusedCall() {
    if (!refused.includes(name)) refused.push(name);
    throw new Error(`${name} is not available in a cover page; ${fix}`);
  };
  const FROM_T = 'draw every frame from t';
  const nativeFrame = window.requestAnimationFrame.bind(window);
  Object.defineProperty(window, '__litCoverSettle', { value: () => new Promise((done) => nativeFrame(() => nativeFrame(done))) });
  Math.random = refuse('Math.random', 'use LitLoop.rng(seed) for layout and t for motion');
  const RealDate = Date;
  function CoverDate(...args) {
    if (!new.target || args.length === 0) return refuse('Date', FROM_T)();
    return Reflect.construct(RealDate, args, new.target);
  }
  CoverDate.prototype = RealDate.prototype;
  CoverDate.now = refuse('Date.now', FROM_T);
  CoverDate.parse = RealDate.parse;
  CoverDate.UTC = RealDate.UTC;
  Object.defineProperty(window, 'Date', { configurable: true, writable: true, value: CoverDate });
  Object.defineProperty(Performance.prototype, 'now', { configurable: true, writable: true, value: refuse('performance.now', FROM_T) });
  window.requestAnimationFrame = refuse('requestAnimationFrame', 'the renderer calls renderFrame(t); run no loop of your own');
  window.setInterval = refuse('setInterval', 'the renderer calls renderFrame(t); run no loop of your own');
  if (window.crypto) Object.defineProperty(window.crypto, 'getRandomValues', { configurable: true, value: refuse('crypto.getRandomValues', 'use LitLoop.rng(seed)') });
  const freeze = () => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.documentElement) freeze();
  else document.addEventListener('readystatechange', freeze, { once: true });
  window.__litCoverMisuse = () => refused.slice();
})();
