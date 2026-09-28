#!/usr/bin/env node

import {
  assertProjectDirectory,
  assertRegularFile,
  cliExitCode,
  ensureFileInProject,
  hostStatusMessage,
  inspectProject,
  isDirectInvocation,
  parseOptions,
} from './lsp-server-table.mjs';
import { resolve } from 'node:path';

function reportFor(status, file, message) {
  return { status, file, message };
}

function main() {
  let options;
  let file;
  let displayFile;
  try {
    options = parseOptions(process.argv.slice(2), { positional: 1 });
    displayFile = resolve(options.positionals[0]);
    file = assertRegularFile(displayFile);
    const project = assertProjectDirectory(options.project ?? process.cwd());
    ensureFileInProject(file, project);

    let host;
    try {
      host = inspectProject(project, options);
    } catch (error) {
      if (error?.code !== 'GROK_INSPECT_FAILED') throw error;
      const report = reportFor('inspect-failed', displayFile, error.message);
      if (options.json) process.stdout.write(`${JSON.stringify(report)}\n`);
      else process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }

    const status = host.status;
    const message = hostStatusMessage(host);
    const report = reportFor(status, displayFile, message);
    if (options.json) process.stdout.write(`${JSON.stringify(report)}\n`);
    else process.stdout.write(`${status.toUpperCase()} ${file}\n${message}\n`);
    process.exitCode = status === 'unconfigured' || status === 'opaque' || status === 'not-exposed' ? 3 : 1;
  } catch (error) {
    process.stderr.write(`${error?.code ?? 'GROK_VERIFY_FAILED'}: ${error?.message ?? String(error)}\n`);
    process.exitCode = cliExitCode(error);
  }
}

if (isDirectInvocation(import.meta.url)) main();
