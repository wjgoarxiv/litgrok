// Cover capture: one stage Chrome (the rung the recipe asks for, every stage flag, so a mismatch is
// always the page's doing) laid out at the cover's CSS size and captured at device scale 2. The
// page is served from <out>/cover/ on the synthetic stage origin through CDP Fetch interception,
// beside the /lit/ routes (fonts, the loop kit, the vendored three.js), and the cover init script
// runs before any page script. The renderer SEEKS: it calls window.renderFrame(t, { mask }) for any
// t in [0, 1) in any order, so the master pass, the replay in a fresh browser, the seek-order pass
// and a window re-render each open their own page here.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlockedError, EXIT, STAGE } from './constants.mjs';
import { COVER_FLAGS, launchStage, resolveChrome } from './chrome.mjs';
import { SKILL_ROOT } from './fonts.mjs';
import { CONTENT_TYPES, resolveStagePath, resolveThree } from './stage-session.mjs';

export const LOOP_KIT_PATH = join(SKILL_ROOT, 'scripts', 'stage', 'loop-kit.js');
export const COVER_INIT_PATH = join(SKILL_ROOT, 'scripts', 'stage', 'cover-init.js');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// Open one cover page and wait for window.ready. `dir` is the folder served as the site root
// (<out>/cover for a render; the sheet's own folder for the contact sheet). A hero-3d cover asks
// for the GPU rung; anything else renders on software, where a mismatch is always the page's doing.
export async function openCover({ dir, fonts, width, height, scale, profileRoot, env = process.env, label = 'c', rung = 'software', log = () => {} }) {
  const executable = resolveChrome(env);
  if (!executable) throw new BlockedError(EXIT.NO_CHROME, 'BLOCKED_NO_CHROME: Chrome/Chromium not found; set CHROME_PATH to a Chrome executable');
  const browser = await launchStage({ executable, profileDir: join(profileRoot, `${label}-${randomBytes(3).toString('hex')}`), width, height, scale, extra: COVER_FLAGS, rung });
  const network = [];
  const refused = [];
  const errors = [];
  const kit = readFileSync(LOOP_KIT_PATH);
  const respond = (requestId, status, body, type) => browser.send('Fetch.fulfillRequest', {
    requestId, responseCode: status,
    responseHeaders: [{ name: 'Content-Type', value: type ?? 'text/plain' }, { name: 'Cache-Control', value: 'no-store' }],
    body: Buffer.from(body ?? '').toString('base64'),
  }).catch((error) => log(`cover serve: ${error.message}`));
  browser.on(async (message) => {
    if (message.sessionId !== browser.sessionId) return;
    if (message.method === 'Runtime.exceptionThrown') { errors.push(message.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? message.params.exceptionDetails?.text ?? 'page error'); return; }
    if (message.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = message.params;
    let url;
    try { url = new URL(request.url); } catch { url = null; }
    if (!url || url.protocol !== 'http:' || url.host !== STAGE.host) {
      network.push(request.url);
      await browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      return;
    }
    if (url.pathname === '/lit/loop-kit.js') { await respond(requestId, 200, kit, CONTENT_TYPES['.js']); return; }
    if (url.pathname.startsWith('/lit/three/')) {
      const resolved = resolveThree(url.pathname);
      if (resolved.refused) { refused.push(resolved.refused); await respond(requestId, 403, 'refused'); return; }
      if (resolved.missing) { await respond(requestId, 404, 'not a vendored three.js file'); return; }
      await respond(requestId, 200, readFileSync(resolved.file), resolved.type);
      return;
    }
    if (url.pathname === '/lit/fonts.css') { await respond(requestId, 200, fonts.css, CONTENT_TYPES['.css']); return; }
    if (url.pathname.startsWith('/lit/fonts/')) {
      const route = fonts.routes.get(url.pathname);
      if (route) await respond(requestId, 200, readFileSync(route.path), route.type); else await respond(requestId, 404, 'no such face');
      return;
    }
    if (url.pathname === '/favicon.ico') { await respond(requestId, 404, ''); return; }
    const resolved = resolveStagePath(dir, url.pathname);
    if (resolved.refused) { refused.push(resolved.refused); await respond(requestId, 403, 'refused'); return; }
    if (resolved.missing) { await respond(requestId, 404, 'not found'); return; }
    await respond(requestId, 200, readFileSync(resolved.file), resolved.type);
  });
  const send = browser.send;
  const evaluate = async (expression, timeoutMs = 120000) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description?.split('\n')[0] ?? result.exceptionDetails.text ?? 'page exception');
    return result.result?.value;
  };
  // Anything a cover page may not do, as the exit it earns.
  const check = async (context) => {
    if (network.length) throw new BlockedError(EXIT.STAGE_NETWORK, `STAGE_NETWORK_REQUEST: the cover page requested ${network[0].slice(0, 160)} (blocked); everything is local`);
    if (refused.length) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: ${refused[0]}`);
    const misuse = await evaluate('window.__litCoverMisuse ? window.__litCoverMisuse() : []').catch(() => []);
    if (misuse.length) throw new BlockedError(EXIT.STAGE_NONDETERMINISTIC, `STAGE_NONDETERMINISTIC: the cover page called ${misuse.join(', ')}${context ? ` ${context}` : ''}; a cover frame is a function of t alone (LitLoop.rng(seed) for layout)`);
  };
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 1 } });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync(COVER_INIT_PATH, 'utf8') });
    await send('Page.navigate', { url: `${STAGE.origin}/index.html` });
    const deadline = Date.now() + 60000;
    for (;;) {
      const state = await evaluate('[document.readyState, window.ready === true, typeof window.renderFrame]').catch(() => ['loading', false, 'undefined']);
      if (errors.length) {
        // A page that throws while loading never recovers into a contract-honouring cover; report it now, not after the 60 s wait.
        await check('while loading');
        throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: the cover page threw while loading; first page error: ${errors[0]}`);
      }
      if (state[0] === 'complete' && state[1]) {
        await check('while loading');
        if (state[2] !== 'function') throw new BlockedError(EXIT.STAGE_CONTRACT, 'STAGE_CONTRACT_ERROR: the cover page set window.ready but defines no window.renderFrame(t)');
        break;
      }
      if (Date.now() > deadline) {
        await check('while loading');
        const why = errors[0] ? `; first page error: ${errors[0]}` : state[0] === 'complete' ? '; it never set window.ready = true' : '';
        throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: the cover page was not ready within 60 s${why}`);
      }
      await sleep(50);
    }
  } catch (error) { await browser.close(); throw error; }

  return {
    width, height, scale,
    rung: browser.rung, renderer: browser.renderer, notice: browser.notice,
    // Draw loop time t (or its title mask), then wait for fonts and two native frames.
    async frame(t, { mask = false } = {}) {
      try {
        await evaluate(`(async () => { await window.renderFrame(${t}, ${JSON.stringify({ mask })}); if (document.fonts) await document.fonts.ready; if (window.__litCoverSettle) await window.__litCoverSettle(); return true; })()`);
      } catch (error) {
        await check(`at t = ${t.toFixed(4)}`);
        throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: renderFrame(${t.toFixed(4)}${mask ? ', { mask: true }' : ''}) threw: ${error.message}`);
      }
      await check(`at t = ${t.toFixed(4)}`);
    },
    // The viewport at device scale: (width x scale) by (height x scale) pixels.
    async capture() {
      const shot = await send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
      return Buffer.from(shot.data, 'base64');
    },
    close: () => browser.close(),
  };
}

// Capture `times` ([index, t] pairs, in the order given) into `dir` as <prefix><index>.png at the
// cover size. Returns Map(index -> SHA-256 of the written PNG).
export async function capturePass({ page, pool, times, dir, prefix = 'f', mask = false, width, height }) {
  const hashes = new Map();
  const jobs = [];
  const expected = `${page.width * page.scale}x${page.height * page.scale}`;
  for (const [index, t] of times) {
    await page.frame(t, { mask });
    const png = await page.capture();
    const job = pool.shrink(png, width, height, join(dir, `${prefix}${String(index).padStart(4, '0')}.png`)).then((result) => {
      if (result.captured !== expected) throw new BlockedError(EXIT.STAGE_CONTRACT, `STAGE_CONTRACT_ERROR: a capture decoded to ${result.captured}, not ${expected} (the page must not resize its viewport)`);
      hashes.set(index, result.sha256);
    });
    job.catch(() => {}); // awaited below; this only keeps an early failure from being unhandled meanwhile
    jobs.push(job);
    if (jobs.length >= pool.workers.length * 3) await Promise.all(jobs.splice(0, pool.workers.length));
  }
  await Promise.all(jobs);
  return hashes;
}
