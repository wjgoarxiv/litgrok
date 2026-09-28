import { spawnSync } from 'node:child_process';
import process from 'node:process';

const childEnv = { ...process.env };
for (const name of Object.keys(childEnv)) {
  if (name.toLowerCase() === 'npm_config_dry_run') delete childEnv[name];
}

const npmCli = childEnv.npm_execpath;
const command = npmCli ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = npmCli ? [npmCli, 'test'] : ['test'];
const result = spawnSync(command, args, {
  env: childEnv,
  stdio: 'inherit',
  ...(process.platform === 'win32' && !npmCli ? { shell: true } : {}),
});

if (result.error) {
  process.stderr.write(`prepublish test gate could not start npm test: ${result.error.message}\n`);
  process.exitCode = 1;
} else if (result.signal) {
  process.stderr.write(`prepublish test gate interrupted by ${result.signal}\n`);
  process.exitCode = 1;
} else {
  process.exitCode = Number.isInteger(result.status) ? result.status : 1;
}
