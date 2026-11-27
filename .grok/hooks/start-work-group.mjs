#!/usr/bin/env node

// Runs one command in its own process group for the start-work run (the Done-when check and approved
// replays), and kills the whole group when the time is up or the command ends, so a child it started in the
// background cannot outlive the budget (C-6). Usage: start-work-group.mjs <ms> <file> [args...]
// Exit 124 with LITGROK_GROUP_TIMEOUT on stderr means it was stopped; 127 means it could not start.
//
// The group leader is a small `/bin/sh` that runs the command, reports its exit status, and then kills its own
// group while it is still alive. Killing the group after the leader has exited is not enough: its children are
// orphaned by then, and on macOS a signal to the group no longer reaches them.
//
// This runner owns both output pipes and exits as soon as the leader exits or the time is up, without waiting for
// the pipes to close: a child that left the group (setsid, a detached spawn) may hold them open for as long as it
// lives, and the hook that waits on this runner must not wait with it (M7).
import { spawn } from 'node:child_process';

const [ms, file, ...args] = process.argv.slice(2);
const posix = process.platform !== 'win32';
const LEADER = '"$@"; s=$?; printf "\\nLITGROK_EXIT %s\\n" "$s" >&2; kill -KILL 0';
const options = { stdio: ['ignore', 'pipe', 'pipe'] };
const child = posix ? spawn('/bin/sh', ['-c', LEADER, 'sh', file, ...args], { ...options, detached: true }) : spawn(file, args, options);
const CAP = 1024 * 1024;
let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => {
  stdout = `${stdout}${chunk}`.slice(-CAP);
});
child.stderr.on('data', (chunk) => {
  stderr = `${stderr}${chunk}`.slice(-CAP);
});
const killGroup = () => {
  try {
    if (posix) process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch {
    // The group is already gone.
  }
};
let done = false;
const finish = (timedOut, code) => {
  if (done) return;
  done = true;
  clearTimeout(timer);
  killGroup();
  child.stdout.destroy();
  child.stderr.destroy();
  const marker = /\nLITGROK_EXIT (\d+)\n/u.exec(stderr);
  const status = timedOut ? 124 : marker ? Number(marker[1]) : code ?? 1;
  const tail = `${stderr.replace(/\nLITGROK_EXIT \d+\n/u, '')}${timedOut ? '\nLITGROK_GROUP_TIMEOUT\n' : ''}`;
  // Leave once our own copies are written, open pipes in a stray child or not; a stuck reader gets 2 s.
  setTimeout(() => process.exit(status), 2000).unref();
  process.stdout.write(stdout, () => process.stderr.write(tail, () => process.exit(status)));
};
const timer = setTimeout(() => finish(true), Number(ms) || 1);
child.on('error', (error) => {
  if (done) return;
  done = true;
  clearTimeout(timer);
  process.stderr.write(`${error.message}\n`);
  process.exit(127);
});
// The leader's exit, not the pipes' close: a detached child may keep the pipes open.
child.on('exit', (code) => setTimeout(() => finish(false, code), 30));
