# Historical migration fixtures

These two repository-only archives preserve the exact inputs previously read by
the migration tests through `git archive`. They let the same tests run in a
checkout containing a single commit. Neither archive is installed or published;
the package's `files` allowlist excludes `test/`.

| Fixture | Original commit | Selected paths | Regular files |
| --- | --- | --- | ---: |
| `pre-manifest.tar.gz` | `975f05be5b3a64cd8fb4c5fdff8eaf1fa8b958e7` | `.grok`, `bin/litgrok.mjs` | 497 |
| `before-renames.tar.gz` | `5788915b3e110b9c8e2858e2866d2235cb85e7e9` | `.grok` | 499 |

The first archive includes the actual installer that produced installations
without ownership receipts. The second preserves the complete owned payload
before the skill and agent renames. Tests still create the same ownership
receipt from that payload where required. Complete trees are retained because
the migration assertions cover installation inventory, ownership, moved corpus
files, retired names, refusals, and removal.

`manifest.json` records every file's path, byte count, SHA-256, Git mode, and
original tar mode, plus the source commits, path selections, and archive hashes.
Archive bytes are the selected `git archive --format=tar` output compressed with
gzip level 9 and timestamp zero. Git's original tar modes are retained;
extraction applies the test process's umask and preserves executable bits.
Existing license and attribution files are retained byte for byte.

`restore.mjs` pins the manifest hash, verifies each archive before extraction,
rejects missing or symlinked fixture files, and requires an empty destination.
It reads only these adjacent fixtures and has no Git, network, cache, or external
archive fallback. The historical commits are provenance identifiers; they need
not exist in the checkout running the tests.

Fixture maintenance requires comparison with the original selected Git blobs
and modes before changing any pin. Never regenerate accepted owner bytes from
the current installer or relax integrity checks to make migration tests pass.
Run `node --test test/historical-fixtures.test.mjs` for restoration and corruption
checks, then the native migration tests and package exclusion checks.
