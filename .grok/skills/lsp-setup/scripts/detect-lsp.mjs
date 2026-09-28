#!/usr/bin/env node

import {
  assertProjectDirectory,
  cliExitCode,
  collectExtensions,
  coverageForExtensions,
  hostStatusMessage,
  inspectProject,
  isDirectInvocation,
  parseOptions,
} from './lsp-server-table.mjs';

function main() {
  try {
    const options = parseOptions(process.argv.slice(2), { maxFiles: true, positional: 1 });
    const project = assertProjectDirectory(options.positionals[0]);
    const extensions = collectExtensions(project, options.maxFiles);
    const host = inspectProject(project, options);
    const report = {
      root: project,
      extensions,
      host,
      coverage: coverageForExtensions(extensions, host),
    };
    if (options.json) {
      process.stdout.write(`${JSON.stringify(report)}\n`);
    } else {
      process.stdout.write(`PASS root=${project} extensions=${extensions.length} status=${host.status}\n`);
      process.stdout.write(`${hostStatusMessage(host)}\n`);
      for (const entry of report.coverage) process.stdout.write(`${entry.extension}: ${entry.status}\n`);
    }
    process.exitCode = 0;
  } catch (error) {
    process.stderr.write(`${error?.code ?? 'GROK_DETECT_FAILED'}: ${error?.message ?? String(error)}\n`);
    process.exitCode = cliExitCode(error);
  }
}

if (isDirectInvocation(import.meta.url)) main();
