import { spawnSync } from 'node:child_process';

const MINIMUM = [0, 38, 1];

function atLeast(version, floor) {
  for (let index = 0; index < floor.length; index += 1) {
    if (version[index] > floor[index]) return true;
    if (version[index] < floor[index]) return false;
  }
  return true;
}

export function inspectRenderer(env = process.env) {
  const versionResult = spawnSync('agent-browser', ['--version'], { encoding: 'utf8', env, maxBuffer: 1024 * 1024 });
  const versionText = (versionResult.stdout || versionResult.stderr || '').trim();
  const found = versionText.match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:\b|$)/);
  if (versionResult.status !== 0 || !found) {
    return {
      renderer: { available: false, version: versionText || 'not found', message: 'agent-browser >=0.38.1 is required for PNG export.' },
      chrome: { available: false, version: 'not checked', message: 'Install the renderer first.' },
      setup: 'Install agent-browser >=0.38.1 yourself with: npm install -g agent-browser',
    };
  }
  const version = found.slice(1).map(Number);
  if (!atLeast(version, MINIMUM)) {
    return {
      renderer: { available: false, version: found.slice(1, 4).join('.'), message: 'agent-browser is below the required >=0.38.1 floor.' },
      chrome: { available: false, version: 'not checked', message: 'The installed renderer is too old to check Chrome.' },
      setup: 'Upgrade agent-browser yourself to >=0.38.1 with: npm install -g agent-browser',
    };
  }
  const doctor = spawnSync('agent-browser', ['doctor', '--json'], { encoding: 'utf8', env, maxBuffer: 1024 * 1024 });
  let report = null;
  try { report = JSON.parse(doctor.stdout); } catch {}
  const check = report?.checks?.find((item) => item.id === 'chrome.installed');
  const chromeMessage = check?.message || (doctor.status === 0 ? 'Chrome for Testing 154 was not reported.' : (doctor.stderr || doctor.stdout || 'renderer doctor failed').trim());
  const chromeAvailable = Boolean(report?.success && /(?:^|\D)154(?:\.|\D|$)/.test(chromeMessage));
  return {
    renderer: { available: true, version: found.slice(1, 4).join('.'), message: versionText },
    chrome: { available: chromeAvailable, version: chromeMessage, message: chromeMessage },
    setup: 'Install Chrome for Testing yourself with: agent-browser install',
  };
}
