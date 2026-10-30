import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Inside the Publish workflow (LITGROK_PUBLISH_FROM_CI=1) the suite already ran in ci.yml, so this gate
// only confirms that ci.yml passed on the very commit being published and stops the release if not.
// A publish from anywhere else runs npm test exactly as before.
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/u;

function git(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

export async function checkCiRun({ env, request = fetch, runGit = git }) {
  const sha = env.GITHUB_SHA ?? '';
  const repository = env.GITHUB_REPOSITORY ?? '';
  if (env.GITHUB_ACTIONS !== 'true' || !SHA_PATTERN.test(sha) || !REPOSITORY_PATTERN.test(repository)) {
    return { passed: false, why: 'this is not a GitHub Actions run with a commit and a repository' };
  }
  if (runGit(['rev-parse', 'HEAD']) !== sha) return { passed: false, why: `the checkout is not ${sha}` };
  if (runGit(['status', '--porcelain']) !== '') return { passed: false, why: 'the checkout has local changes' };

  const url = `https://api.github.com/repos/${repository}/actions/workflows/ci.yml/runs`
    + `?head_sha=${sha}&status=success&event=push&per_page=1`;
  const headers = { accept: 'application/vnd.github+json' };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;

  let payload;
  try {
    const response = await request(url, { headers });
    if (!response.ok) return { passed: false, why: `the GitHub API answered ${response.status}` };
    payload = await response.json();
  } catch (error) {
    return { passed: false, why: `the GitHub API could not be reached: ${error?.message ?? String(error)}` };
  }

  const run = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs[0] : undefined;
  if (run?.head_sha !== sha || run?.conclusion !== 'success') {
    return { passed: false, why: `ci.yml has no successful push run for ${sha}` };
  }
  return { passed: true, why: `ci.yml run ${run.id} passed on ${sha}` };
}

function runSuite() {
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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.LITGROK_PUBLISH_FROM_CI === '1') {
    const verdict = await checkCiRun({ env: process.env });
    if (verdict.passed) {
      process.stdout.write(`prepublish test gate: ${verdict.why}; the suite is not run again\n`);
    } else {
      process.stderr.write(`prepublish test gate refused: ${verdict.why}\n`);
      process.exitCode = 1;
    }
  } else {
    runSuite();
  }
}
