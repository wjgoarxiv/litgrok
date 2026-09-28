import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';

const MANIFEST_SHA256 = '72693c8063fa233c3c24736502fe26288fb1c44dbdfd80bcd2b6db7272a3addb';

function pinnedFile(name, expectedHash) {
  const path = new URL(name, import.meta.url);
  let bytes;
  try {
    if (!lstatSync(path).isFile()) throw new Error('must be a regular file');
    bytes = readFileSync(path);
  } catch (error) {
    throw new Error(`Historical fixture ${name}: ${error.message}`, { cause: error });
  }
  if (createHash('sha256').update(bytes).digest('hex') !== expectedHash) {
    throw new Error(`Historical fixture ${name}: SHA-256 mismatch`);
  }
  return bytes;
}

export function restoreHistoricalFixture(id, destination, { payloadOnly = false } = {}) {
  const manifest = JSON.parse(pinnedFile('manifest.json', MANIFEST_SHA256).toString('utf8'));
  if (!Object.hasOwn(manifest.fixtures, id)) throw new Error(`Unknown historical fixture: ${id}`);
  const fixture = manifest.fixtures[id];
  const archive = pinnedFile(fixture.archive, fixture.sha256);
  if (!lstatSync(destination).isDirectory() || readdirSync(destination).length !== 0) {
    throw new Error('Historical fixture destination must be an empty regular directory');
  }
  // Both pinned archives contain only the recorded regular files and directories.
  execFileSync('tar', ['-xzf', '-', '--no-same-owner', '-C', destination, ...(payloadOnly ? ['.grok'] : [])], { input: archive });
}
