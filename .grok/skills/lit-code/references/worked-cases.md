# Worked programming boundary cases

Load these cases when a programming request combines implementation with permission, sandbox, dirty-tree, packaging, or release boundaries. Each case gives concrete input and the expected response shape. Paths and commands are examples; inspect the live repository before using them.

## Case 1 — Allowed edit inside a workspace sandbox

### Input

```text
Goal: make parseMode("AUTO") return auto.
Scope: src/parse-mode.mjs and test/parse-mode.test.mjs.
Sandbox: workspace.
Permission: Read and Edit for src/** and test/**; Bash(npm test) asks.
Dirty state: README.md is already modified and unrelated.
```

### Decision

Read the local rules, source, and nearest test. Preserve `README.md`. Add a focused uppercase-input assertion and run it to RED. Patch only the parser. Request approval for the named test command if the host asks. The workspace profile permits writes under cwd but does not itself authorize them.

### Expected output

```text
CHANGED: src/parse-mode.mjs; test/parse-mode.test.mjs
RED: node --test test/parse-mode.test.mjs, cwd=<repo>, exit 1, 1 failed
GREEN: node --test test/parse-mode.test.mjs, cwd=<repo>, exit 0, 6 passed
PRESERVED: README.md remained modified and untouched
BOUNDARIES: permission rules and sandbox configuration unchanged
```

## Case 2 — Explicit allow but read-only sandbox

### Input

```text
Goal: update src/config.mjs.
Permission: Edit(src/**) allowed.
Sandbox: read-only.
```

### Decision

Do not attempt the source write and do not disable the sandbox. An explicit allow permits the tool call, while `read-only` permits writes only to `~/.grok/` and temp. Read-only reconnaissance may continue within scope.

### Expected output

```text
BLOCKED: src/config.mjs is inside the repository, which the active read-only
sandbox does not permit writing. Edit permission is present but does not expand
sandbox reach. No configuration was changed.
```

## Case 3 — Installer conflict with a foreign file

### Input

```text
Goal: make reinstall idempotent.
Destination: <temp-project>/.grok/rules/00-product.md
Existing bytes: "local team rule\n"
Packaged bytes: "package rule\n"
Contract: never overwrite a foreign file silently.
```

### Decision

Write a failing installer test that creates the foreign destination and asserts that the entire install refuses before mutation. Implement a preflight comparison across all payload paths. Do not add a force option unless the user requested a replacement policy.

### Expected output

```text
exit: non-zero
stderr: names .grok/rules/00-product.md as a conflict
destination after run: byte-identical "local team rule\n"
other payload paths after run: absent
temporary fixture: removed by test cleanup
```

## Case 4 — Documentation reference added to a package

### Input

```text
Goal: add skills/example/references/contract.md and route to it from SKILL.md.
Package files include the whole .grok/skills tree.
No runtime code changes.
```

### Decision

Add a structural test that fails while the reference is missing or unreachable. Write the reference only if it holds an earned contract, table, taxonomy, worked case, or primary-source schema. Update the entry point with a load condition. Run docs tests and inspect dry-pack JSON for the exact path.

### Expected output

```text
RED: structural test reports missing references/contract.md
GREEN: structural test passes and entry point names when to load it
PACK: .grok/skills/example/references/contract.md appears exactly once
CLAIM LIMIT: static and package evidence only; no live-host activation claimed
```

## Case 5 — Test requires child network under strict sandbox

### Input

```text
Goal: run an integration test that downloads a fixture.
Permission: Bash(npm test) allowed.
Sandbox: strict.
Fixture is not cached.
```

### Decision

Do not turn the profile off and do not replace the fixture with guessed data. Check for an offline fixture or narrower test. If none exists, report the child-network boundary.

### Expected output

```text
BLOCKED GATE: npm run test:integration requires a child-network download that
the strict profile is intended to block. The fixture is unavailable locally.
Permission and sandbox settings remain unchanged.
```

## Case 6 — Version preparation without release authority

### Input

```text
Goal: prepare version 0.4.0 and verify the tarball.
Authorized: package metadata edit and dry-pack checks.
Hard stops: no commit, tag, push, publish, or release.
```

### Decision

Update only lockstep fields in scope. Run version checks, tests, and dry pack. Do not authenticate to the registry and do not infer that preparation authorizes publication.

### Expected output

```text
VERSION: all owned metadata reports 0.4.0
TEST: package suite exit 0 with counts
PACK: dry-run JSON inspected; no archive retained
NOT RUN: commit, tag, push, publish, release
```

## Case 7 — Denied tool and tempting substitute

### Input

```text
Goal: edit config/settings.toml.
Permission: Edit(config/**) denied; Bash is allowed.
```

### Decision

Do not use shell redirection, a formatter, or a generator to write the denied path. The effect remains an edit even when the tool label changes.

### Expected output

```text
BLOCKED: the mutation matches an explicit edit denial.
No alternate tool was used to bypass it. Read-only inspection can continue.
```

## Case 8 — Focused test passes but shipped surface is unproven

### Input

```text
Goal: add a command script under .grok/hooks/.
Focused stdin driver: passes.
Package installer: walks the payload tree.
```

### Decision

Run the hook configuration test, verify the command bit, inspect the dry-pack listing, and invoke a temp install. Keep the live-host claim bounded unless a documented event actually drove it.

### Expected output

```text
DRIVER: event JSON -> exit/status/stdout contract passed
CONFIG: event and executable-command validation passed
PACK: hook JSON and executable both listed
INSTALL: both files landed byte-identically in a temporary project
LIMIT: no live Grok Build event was observed in this run
```
