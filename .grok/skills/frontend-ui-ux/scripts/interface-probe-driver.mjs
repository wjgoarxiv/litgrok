// Driver adapter: the interface probe speaks the LitClaude browser-drive contract
// (probeBrowserDriver/runBrowserCommand), while this package's browser-drive skill exposes
// the older probe() shape. This module translates between them; it changes no behavior
// of the browser-drive skill itself.
import { spawnSync } from "node:child_process";
import { probe } from "../../browser-drive/scripts/capability-probe.mjs";

export const DRIVER_COMMAND = "agent-browser";

// Shape the interface probe consumes: { status, version, command, blocker } where status
// is one of available | beyond-verified | unavailable | unverified-identity and blocker is
// a BLOCKED_REASON key from interface-probe-rules.mjs (or null when ready).
export function probeBrowserDriver() {
  const found = probe();
  if (!found.available) {
    return { status: "unavailable", version: null, command: DRIVER_COMMAND, blocker: "BLOCKED_BROWSER_DRIVER_UNAVAILABLE" };
  }
  if (!found.accepted) {
    return { status: "unverified-identity", version: null, command: DRIVER_COMMAND, blocker: "BLOCKED_BROWSER_IDENTITY_UNVERIFIED" };
  }
  const version = found.version ? `${found.version.major}.${found.version.minor}.${found.version.patch}` : null;
  return { status: found.state === "beyond-verified" ? "beyond-verified" : "available", version, command: DRIVER_COMMAND, blocker: null };
}

// Minimal runBrowserCommand: spawnSync already returns { status, stdout, stderr, error }.
export function runBrowserCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: "utf8",
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    env: options.env,
  });
}
