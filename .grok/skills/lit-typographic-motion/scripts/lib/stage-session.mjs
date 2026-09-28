// One stage Chrome: the page is served from the synthetic origin http://lit.stage/ through CDP
// Fetch interception (no listening socket), the host script virtualizes time before any page
// script, and the renderer drives frames with step() + capture() (brief sections 6c-6e).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';
import { STAGE } from './constants.mjs';
import { launchStage } from './chrome.mjs';
import { SKILL_ROOT } from './fonts.mjs';

export const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.json': 'application/json',
});

export const EPOCH_MS = Date.UTC(2026, 0, 1);
export const KIT_PATH = join(SKILL_ROOT, 'scripts', 'stage', 'stage-kit.js');
const HOST_PATH = join(SKILL_ROOT, 'scripts', 'stage', 'host.js');

export function hostScript({ seed, fps }) {
  return readFileSync(HOST_PATH, 'utf8').replace('const CFG = __LIT_CFG__;', `const CFG = ${JSON.stringify({ seed: seed >>> 0, fps, epochMs: EPOCH_MS })};`);
}

// Resolve one request path against the stage directory. Returns { file } or { refused } — a
// refusal (".." or a symlink whose real path escapes the directory) is a stage contract error.
export function resolveStagePath(stageDir, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return { refused: `undecodable path ${pathname}` }; }
  const parts = decoded.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part.includes('\\'))) return { refused: `path traversal ${decoded}` };
  const rel = parts.join('/') || 'index.html';
  const candidate = join(stageDir, rel);
  if (!existsSync(candidate)) return { missing: rel };
  const root = realpathSync(stageDir);
  const real = realpathSync(candidate);
  if (real !== root && !real.startsWith(`${root}${sep}`)) return { refused: `symlink escapes the stage directory: ${rel}` };
  if (!statSync(real).isFile()) return { missing: rel };
  const type = CONTENT_TYPES[extname(real).toLowerCase()];
  if (!type) return { refused: `file type not served: ${rel}` };
  return { file: real, type };
}

export async function openStage({ executable, outDir, stageDir, width, height, fps, seed, fonts, label = 'm', log = () => {} }) {
  const profileDir = join(outDir, '.run', `s${label}-${randomBytes(3).toString('hex')}`);
  const browser = await launchStage({ executable, profileDir, width, height });
  const network = [];
  const refused = [];
  const served = new Set();
  const kit = existsSync(KIT_PATH) ? readFileSync(KIT_PATH) : Buffer.from('/* stage kit missing */');
  const respond = (requestId, status, body, type) => browser.send('Fetch.fulfillRequest', {
    requestId, responseCode: status,
    responseHeaders: [{ name: 'Content-Type', value: type ?? 'text/plain' }, { name: 'Cache-Control', value: 'no-store' }],
    body: Buffer.from(body ?? '').toString('base64'),
  }).catch(() => {});
  browser.on(async (message) => {
    if (message.method !== 'Fetch.requestPaused' || message.sessionId !== browser.sessionId) return;
    const { requestId, request } = message.params;
    let url;
    try { url = new URL(request.url); } catch { url = null; }
    if (!url || url.protocol !== 'http:' || url.host !== STAGE.host) {
      network.push(request.url);
      await browser.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      return;
    }
    if (url.pathname === '/lit/stage-kit.js') { served.add('/lit/stage-kit.js'); await respond(requestId, 200, kit, CONTENT_TYPES['.js']); return; }
    if (url.pathname === '/lit/fonts.css') { served.add('/lit/fonts.css'); await respond(requestId, 200, fonts.css, CONTENT_TYPES['.css']); return; }
    if (url.pathname.startsWith('/lit/fonts/')) {
      const route = fonts.routes.get(url.pathname);
      if (route) { served.add(url.pathname); await respond(requestId, 200, readFileSync(route.path), route.type); } else await respond(requestId, 404, 'no such face');
      return;
    }
    if (url.pathname === '/favicon.ico') { await respond(requestId, 404, ''); return; }
    const resolved = resolveStagePath(stageDir, url.pathname);
    if (resolved.refused) { refused.push(resolved.refused); await respond(requestId, 403, 'refused'); return; }
    if (resolved.missing) { await respond(requestId, 404, 'not found'); return; }
    served.add(url.pathname);
    await respond(requestId, 200, readFileSync(resolved.file), resolved.type);
  });
  const send = browser.send;
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 1 } });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: hostScript({ seed, fps }) });
  } catch (error) { await browser.close(); throw error; }

  const evaluate = async (expression, timeoutMs = 600000) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'page exception');
    return result.result?.value;
  };

  return {
    network, refused, served, args: browser.args, send, evaluate,
    async load() {
      const loaded = new Promise((resolve) => browser.on((message) => { if (message.method === 'Page.loadEventFired' && message.sessionId === browser.sessionId) resolve(); }));
      await send('Page.navigate', { url: `${STAGE.origin}/index.html` });
      let timer;
      try {
        await Promise.race([loaded, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('stage page did not finish loading within 60 s')), 60000); })]);
      } finally { clearTimeout(timer); }
      return evaluate('window.__litHost.prepare()');
    },
    step: (f, frameFps, settle = true) => evaluate(`window.__litHost.step(${f}, ${frameFps}, ${settle})`),
    report: () => evaluate('window.__litHost.report()'),
    async capture() {
      const shot = await send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, captureBeyondViewport: false, fromSurface: true, clip: { x: 0, y: 0, width, height, scale: 1 } });
      return Buffer.from(shot.data, 'base64');
    },
    close: () => browser.close(),
  };
}
