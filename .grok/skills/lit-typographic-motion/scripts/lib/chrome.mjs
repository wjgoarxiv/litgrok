// Headless Chrome over the DevTools pipe (fd 3 in, fd 4 out, NUL-delimited JSON).
// Mechanism adapted from pdoom-video app/scripts/render.ts (MIT, see NOTICE): launch Chrome with a
// fixed GPU flag rung, open one page, and drive a deterministic still(t) call per frame. No driver
// package and no control port: the pipe is private to this process.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { platform as osPlatform } from 'node:os';
import { BlockedError, EXIT, STAGE } from './constants.mjs';

// MO-SH-09: the one canonical software-rasterizer list (case-insensitive substrings).
export const SOFTWARE_RENDERERS = Object.freeze(['swiftshader', 'llvmpipe', 'softpipe', 'lavapipe', 'apple software renderer', 'microsoft basic render driver']);
export const UNKNOWN_RENDERER = 'unknown (debug-info extension unavailable)';
export const isSoftwareRenderer = (renderer) => SOFTWARE_RENDERERS.some((name) => String(renderer).toLowerCase().includes(name));

// MO-A-51: per-platform GPU rungs, then the SwiftShader rung; the throttling flags ride on every rung.
export const SWIFTSHADER_RUNG = Object.freeze(['--use-angle=swiftshader', '--enable-unsafe-swiftshader']);
export const COMMON_FLAGS = Object.freeze(['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']);
export function gpuRungs(platform = osPlatform()) {
  if (platform === 'darwin') return [['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist']];
  if (platform === 'win32') return [['--use-angle=d3d11', '--enable-gpu-rasterization']];
  return [['--use-angle=gl', '--enable-gpu-rasterization', '--ignore-gpu-blocklist']];
}
export function flagLadder({ softwareOnly = false, platform } = {}) {
  const rungs = softwareOnly ? [SWIFTSHADER_RUNG] : [...gpuRungs(platform), SWIFTSHADER_RUNG];
  return rungs.map((rung) => [...rung, ...COMMON_FLAGS]);
}

// Every launch this skill owns (renders, probes, determinism re-renders, tests) builds its argv here.
// The mock keychain and basic password store keep a custom profile or an isolated HOME from asking
// the macOS keychain for Chrome's safe-storage item, which would surface a dialog on the user's screen.
export const KEYCHAIN_FLAGS = Object.freeze(['--use-mock-keychain', '--password-store=basic']);
export const HOUSEKEEPING = Object.freeze(['--headless=new', '--remote-debugging-pipe', ...KEYCHAIN_FLAGS, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--mute-audio', '--hide-scrollbars', '--disable-component-update', '--disable-features=Translate,MediaRouter']);

// CHROME_PATH, when set, is the only candidate, so a caller can prove the no-Chrome state.
export function resolveChrome(env = process.env) {
  if (env.CHROME_PATH !== undefined) return env.CHROME_PATH && existsSync(env.CHROME_PATH) ? env.CHROME_PATH : null;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export class PipeSession {
  constructor(proc) {
    this.proc = proc;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.buffer = '';
    this.closed = false;
    proc.stdio[4].setEncoding('utf8');
    proc.stdio[4].on('data', (chunk) => this.receive(chunk));
    proc.stdio[4].on('error', () => {});
    proc.stdio[3].on('error', () => {});
    proc.on('exit', () => this.fail(new Error('Chrome exited')));
  }

  receive(chunk) {
    this.buffer += chunk;
    let end;
    while ((end = this.buffer.indexOf('\0')) >= 0) {
      const text = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 1);
      let message;
      try { message = JSON.parse(text); } catch { continue; }
      if (message.id !== undefined && this.pending.has(message.id)) {
        const { resolve, reject, method } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    }
  }

  fail(error) {
    this.closed = true;
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }

  send(method, params = {}, sessionId, timeoutMs = 120000) {
    if (this.closed) return Promise.reject(new Error('Chrome pipe closed'));
    const id = this.nextId++;
    const payload = JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: no reply within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
      this.proc.stdio[3].write(`${payload}\0`);
    });
  }
}

export class Page {
  constructor(session, sessionId) { this.session = session; this.sessionId = sessionId; }

  async evaluate(expression, { timeoutMs = 600000 } = {}) {
    const result = await this.session.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, this.sessionId, timeoutMs);
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'page exception';
      throw new Error(detail);
    }
    return result.result?.value;
  }
}

function firstLine(text) {
  return String(text ?? '').split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

// Launch one rung and return an open page, or throw { launchError } / { webglError }.
async function launchRung(executable, profileDir, flags, { timeoutMs = 30000, extraArgs = [] } = {}) {
  mkdirSync(profileDir, { recursive: true });
  const args = [...HOUSEKEEPING, `--user-data-dir=${profileDir}`, '--window-size=1920,1080', ...flags, ...extraArgs, 'about:blank'];
  let stderr = '';
  let proc;
  try {
    proc = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  } catch (error) {
    throw Object.assign(new Error(error.message), { launchError: true });
  }
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => { if (stderr.length < 16384) stderr += chunk; });
  const spawnError = new Promise((_, reject) => proc.once('error', (error) => reject(Object.assign(new Error(error.message), { launchError: true }))));
  const session = new PipeSession(proc);
  const close = async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      try { await session.send('Browser.close', {}, undefined, 5000); } catch {}
      await new Promise((resolve) => {
        const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 5000);
        proc.once('exit', () => { clearTimeout(timer); resolve(); });
        if (proc.exitCode !== null || proc.signalCode !== null) { clearTimeout(timer); resolve(); }
      });
    }
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  };
  try {
    await Promise.race([spawnError, session.send('Browser.getVersion', {}, undefined, timeoutMs)]);
  } catch (error) {
    await close();
    const detail = firstLine(error.message.includes('no reply') || error.message.includes('exited') ? stderr || error.message : error.message);
    throw Object.assign(new Error(detail || 'Chrome did not start'), { launchError: true });
  }
  const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
  await session.send('Runtime.enable', {}, sessionId);
  const page = new Page(session, sessionId);
  const probe = await page.evaluate(`(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return { webgl2: false };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return { webgl2: true, renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : ${JSON.stringify(UNKNOWN_RENDERER)}, plain: gl.getParameter(gl.RENDERER) };
  })()`, { timeoutMs });
  if (!probe?.webgl2) {
    await close();
    throw Object.assign(new Error(`no WebGL2 context with ${flags.slice(0, 2).join(' ')}${firstLine(stderr) ? ` (${firstLine(stderr)})` : ''}`), { webglError: true });
  }
  return { proc, session, page, renderer: probe.renderer, plainRenderer: probe.plain, flags, software: isSoftwareRenderer(probe.renderer), close, stderr: () => stderr };
}

// Try the MO-A-51 ladder; a rung counts only when getContext('webgl2') succeeds in the page.
export async function openRenderer({ executable, profileDir, softwareOnly = false, platform, timeoutMs, extraArgs } = {}) {
  if (!executable) throw new BlockedError(EXIT.NO_CHROME, 'BLOCKED_NO_CHROME: Chrome/Chromium not found; set CHROME_PATH to a Chrome executable');
  let launchFailure = null;
  let webglFailure = null;
  for (const flags of flagLadder({ softwareOnly, platform })) {
    try {
      return await launchRung(executable, profileDir, flags, { timeoutMs, extraArgs });
    } catch (error) {
      if (error.webglError) webglFailure ??= error.message;
      else launchFailure ??= error.message;
    }
  }
  if (webglFailure) throw new BlockedError(EXIT.NO_WEBGL2, `BLOCKED_NO_WEBGL2: Chrome started but ${webglFailure}`);
  throw new BlockedError(EXIT.NO_CHROME, `BLOCKED_NO_CHROME: Chrome failed to launch headless: ${launchFailure}`);
}

// Stage path (brief section 6d): the software rung only (SwiftShader, CPU raster), so a
// determinism mismatch is always a page leak, plus the compositor and colour flags below. The
// display rate stays capped: an uncapped compositor starves Page.captureScreenshot.
export const STAGE_FLAGS = Object.freeze(['--run-all-compositor-stages-before-draw', '--disable-checker-imaging', '--disable-new-content-rendering-timeout', '--disable-threaded-animation', '--disable-threaded-scrolling', '--disable-image-animation-resync', '--disable-lcd-text', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-pings', '--metrics-recording-only']);

export function stageArgs({ profileDir, width, height }) {
  const args = [...HOUSEKEEPING, `--user-data-dir=${profileDir}`, ...SWIFTSHADER_RUNG, ...COMMON_FLAGS, ...STAGE_FLAGS, `--window-size=${width},${height}`, `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${STAGE.host}`];
  return [...new Set(args), 'about:blank'];
}

// Launch one stage Chrome and attach a page target. Exit 10 when Chrome is missing or never
// answers; WebGL is not probed here (exit 11 applies only when the page asks for it).
export async function launchStage({ executable, profileDir, width, height, timeoutMs = 30000 }) {
  if (!executable) throw new BlockedError(EXIT.NO_CHROME, 'BLOCKED_NO_CHROME: Chrome/Chromium not found; set CHROME_PATH to a Chrome executable');
  mkdirSync(profileDir, { recursive: true });
  const args = stageArgs({ profileDir, width, height });
  let stderr = '';
  let proc;
  try { proc = spawn(executable, args, { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] }); } catch (error) { throw new BlockedError(EXIT.NO_CHROME, `BLOCKED_NO_CHROME: ${error.message}`); }
  proc.stderr.setEncoding('utf8');
  proc.stderr.on('data', (chunk) => { if (stderr.length < 16384) stderr += chunk; });
  const spawnError = new Promise((_, reject) => proc.once('error', (error) => reject(error)));
  const session = new PipeSession(proc);
  const close = async () => {
    if (proc.exitCode === null && proc.signalCode === null) {
      try { await session.send('Browser.close', {}, undefined, 5000); } catch {}
      await new Promise((resolve) => {
        const timer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} resolve(); }, 5000);
        proc.once('exit', () => { clearTimeout(timer); resolve(); });
        if (proc.exitCode !== null || proc.signalCode !== null) { clearTimeout(timer); resolve(); }
      });
    }
    // Chrome's helpers can still be flushing the profile for a moment after the browser exits.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try { rmSync(profileDir, { recursive: true, force: true }); break; } catch { await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
  };
  try {
    await Promise.race([spawnError, session.send('Browser.getVersion', {}, undefined, timeoutMs)]);
  } catch (error) {
    await close();
    throw new BlockedError(EXIT.NO_CHROME, `BLOCKED_NO_CHROME: Chrome failed to launch headless: ${firstLine(stderr) || error.message}`);
  }
  const { targetId } = await session.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await session.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params = {}, timeout) => session.send(method, params, sessionId, timeout);
  return { proc, session, sessionId, send, close, args, on: (listener) => session.listeners.add(listener) };
}
