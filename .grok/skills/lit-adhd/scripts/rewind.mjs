#!/usr/bin/env node
// The lit-adhd record collector. Run by absolute path from the SKILL.md procedure; never from the
// working directory or another cached copy.
import { runRewindCli } from "./lib/collect.mjs";

process.exitCode = runRewindCli(process.argv.slice(2));
