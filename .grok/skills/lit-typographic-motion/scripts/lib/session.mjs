// One render session: a headless Chrome with the engine loaded and frames coming back as the exact
// RGBA bytes of the readback buffer. Egress is a WebSocket on 127.0.0.1:0 (MO-A-02 option 1); when
// the host refuses `listen`, the same buffer is pulled over the DevTools pipe instead (the sanctioned
// per-frame CDP-pull variant). Either way the bytes that are hashed, audited and encoded are identical.
import { randomBytes } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openRenderer, resolveChrome } from './chrome.mjs';
import { opentypeSource, requireDep } from './cache.mjs';
import { fontPath, PINS, resolveFontKey } from './fonts.mjs';
import { pageProgram } from './bundle.mjs';

function listenFrameSocket(env, listenImpl) {
  const { WebSocketServer } = requireDep('ws', env);
  return new Promise((resolve, reject) => {
    let server;
    try {
      if (listenImpl) listenImpl();
      server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 1 << 30, perMessageDeflate: false });
    } catch (error) { reject(error); return; }
    server.once('error', reject);
    server.once('listening', () => resolve(server));
  });
}

export async function openSession({ outDir, fontKeys, env = process.env, softwareOnly = false, listenImpl = null, log = () => {} }) {
  const profileDir = join(outDir, '.run', `p-${randomBytes(3).toString('hex')}`);
  const executable = resolveChrome(env);
  const browser = await openRenderer({ executable, profileDir, softwareOnly });
  let server = null;
  let egress = 'ws';
  let listenError = null;
  const queue = [];
  const waiters = [];
  const cleanup = async () => {
    if (server) {
      for (const client of server.clients) client.terminate();
      await new Promise((resolve) => server.close(() => resolve()));
    }
    await browser.close();
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  };
  try {
    const page = browser.page;
    await page.evaluate(`${opentypeSource(env)}\n;typeof opentype === 'object'`);
    await page.evaluate(pageProgram());
    for (const key of fontKeys) {
      const resolved = resolveFontKey(key, env);
      const pin = PINS.fonts[resolved];
      const bytes = readFileSync(fontPath(resolved, env));
      if (pin.kind === 'stroke') await page.evaluate(`__lm.addStroke(${JSON.stringify(key)}, ${JSON.stringify(bytes.toString('utf8'))}, ${JSON.stringify({ file: pin.file.split('/').pop(), connected: pin.connected })})`);
      else await page.evaluate(`__lm.addFont(${JSON.stringify(key)}, ${JSON.stringify(bytes.toString('base64'))}, ${JSON.stringify({ file: pin.file.split('/').pop(), weight: pin.weight, family: pin.family })})`);
    }
    try {
      server = await listenFrameSocket(env, listenImpl);
      server.on('connection', (socket) => {
        socket.on('message', (data) => {
          const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
          const waiter = waiters.shift();
          if (waiter) waiter(bytes); else queue.push(bytes);
        });
      });
      await page.evaluate(`__lm.connect('ws://127.0.0.1:${server.address().port}')`);
    } catch (error) {
      listenError = error;
      if (server) { await new Promise((resolve) => server.close(() => resolve())); server = null; }
      egress = 'cdp-pull';
      log(`frame socket unavailable (${error.code ?? ''} ${error.message}); using the per-frame CDP pull of the same readback buffer`);
    }
    const nextBytes = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve)));
    return {
      renderer: browser.renderer,
      flags: browser.flags,
      software: browser.software,
      egress,
      listenError: listenError ? `${listenError.code ?? ''} ${listenError.message}`.trim() : null,
      async init(config) {
        const init = await page.evaluate(`__lm.init(${JSON.stringify(config)})`);
        this.maskReadFormat = init.maskReadFormat;
        return init;
      },
      async frame(n, options) {
        const meta = await page.evaluate(`__lm.frame(${n}, ${JSON.stringify({ ...options, egress: egress === 'ws' ? 'ws' : 'pull' })})`);
        let bytes;
        if (egress === 'ws') bytes = await nextBytes();
        else {
          const base64 = await page.evaluate('__lm.pull()');
          if (!base64) throw new Error(`CDP pull returned no frame for ${n}${listenError ? ` (listen failed: ${listenError.message})` : ''}`);
          bytes = Buffer.from(base64, 'base64');
        }
        return { bytes, meta };
      },
      seek: () => page.evaluate('__lm.seek()'),
      perf: (frames) => page.evaluate(`__lm.perf(${JSON.stringify(frames)})`),
      sheet: async (frames, columns, samples, shutter) => Buffer.from(await page.evaluate(`__lm.sheet(${JSON.stringify(frames)}, ${columns}, ${samples}, ${shutter})`), 'base64'),
      close: cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
