# Reproduction recipes

Load these recipes when a PostToolUseFailure observation must be converted into a stable, safe experiment. Each recipe keeps one causal dimension fixed and names the evidence needed to distinguish outcomes.

## Recipe 1 — Wrong working directory

### Trigger

A package command, relative path, or generated output is missing even though the repository appears to contain it.

### Reproducer

    1. Record event.cwd and event.workspaceRoot from the failed tool observation.
    2. Resolve the intended product root using a read-only path/status check.
    3. List the named package or target relative to both roots.
    4. Run the narrow documented command from the intended root without changing inputs.

### Expected evidence

The original invocation, both resolved paths, and the second exit status. If changing only cwd changes failure to success, classify working-directory mismatch. If it does not, reject that hypothesis. Do not modify scripts to accommodate an accidental root.

### Cleanup

None, unless the command created cache or evidence files; inventory and remove only disposable files created by the recipe.

## Recipe 2 — Permission denial versus sandbox denial

### Trigger

A read, edit, or shell action reports that access is unavailable.

### Reproducer

    1. Determine whether the host attempted the tool call.
    2. Record the matching permission decision without editing configuration.
    3. Record the active sandbox profile.
    4. Probe a read-only path known to be inside the active profile.
    5. Compare with the exact denied target; do not broaden either boundary.

### Expected evidence

A permission denial means the tool did not receive approval. A sandbox denial follows an approved attempt and identifies an operating boundary in visible output. If both can apply, record both. Reproduction succeeds by classifying the layer, not by making the blocked operation run.

### Cleanup

No permission, sandbox, or trust configuration changed.

## Recipe 3 — Malformed tool input

### Trigger

A tool rejects input before observable work begins, or a rich invocation fails with an ambiguous validation message.

### Reproducer

    Original input: preserve as inert evidence.
    Control input: the smallest documented valid shape.
    Reduction: add one original field at a time until failure returns.
    Conflict check: remove mutually exclusive or duplicate fields.

### Expected evidence

The minimal valid input, the first failing increment, and the exact validation result. The PostToolUseFailure envelope can preserve toolName and toolInput; it does not provide a documented parsed-error object. Redact secrets without changing the structural cause.

### Cleanup

Remove any temporary input file created for reduction. Do not delete the user's original fixture.

## Recipe 4 — Program exit versus assertion failure

### Trigger

A test command reports non-zero but the first meaningful failure layer is unclear.

### Reproducer

    1. Run the smallest named test file or case.
    2. Capture command exit, stderr/stdout, and first failing assertion.
    3. If setup exits before a test runs, classify program/environment failure.
    4. If the assertion runs, preserve expected and actual values.
    5. Change one input dimension and repeat.

### Expected evidence

An explicit count of tests that ran, the first expected/actual mismatch when applicable, and the process exit status. A setup error is not RED for a behavior test. A failing assertion unrelated to proposed behavior is not proof of target cause.

### Cleanup

Check for snapshots, coverage, or generated fixtures. Do not update them to turn the run GREEN unless that update is the authorized behavior.

## Recipe 5 — Timeout, hang, or background continuation

### Trigger

A command exceeds its foreground interval or returns control while work may continue.

### Reproducer

    1. Record the configured foreground timeout.
    2. Determine whether the host backgrounded the command.
    3. Inspect documented task status instead of starting a duplicate.
    4. Capture last emitted progress and whether output advances.
    5. Cancel only when safe and authorized; inspect partial state.

### Expected evidence

One of: completed with status, still running with task identity, timed out with no continuation, cancelled, or hung with a stable no-progress observation. Do not label a running background task failed. Do not label a timeout a test failure without final state.

### Cleanup

Account for the task, child processes, locks, temporary files, and partial artifacts.

## Recipe 6 — Dirty-tree regression comparison

### Trigger

A suite fails after a change and ownership of the failure is uncertain.

### Reproducer

    1. Preserve the dirty tree; record its status.
    2. Run the focused failing command in the current tree.
    3. Create an isolated baseline at HEAD in a bounded temporary worktree when authorized.
    4. Reuse dependencies safely without copying dirty source.
    5. Run the identical command with the identical runtime version.
    6. Compare failing test names and counts.

### Expected evidence

Current-tree and baseline commands, cwd, exit, pass/fail counts, and exact overlapping or unique failures. A baseline failure supports “pre-existing” only for the same failure under comparable conditions. Clean up the temporary worktree without touching the user's dirty state.

### Cleanup

Remove the exact temporary worktree and verify no new branch, process, or archive remains.

## Recipe 7 — Partial write after a failed mutating tool

### Trigger

A write, installer, formatter, or generator reports failure after it may have touched files.

### Reproducer

    1. Stop retries.
    2. Inventory the named destination and adjacent temp/lock files.
    3. Compare bytes or hashes with preflight state when available.
    4. Determine whether operation was atomic, partial, or untouched.
    5. Choose recovery only from verified ownership and conflict policy.

### Expected evidence

A path-by-path state table showing absent, unchanged, created, modified, or unknown. The tool failure event proves failure, not rollback. Do not overwrite foreign content or run broad cleanup to recover.

### Cleanup

Remove only verified disposable remnants created by the failed operation. Preserve unknown state and report it.

## Recipe 8 — Passive hook record absent

### Trigger

A visible tool failure has no matching session-ledger record.

### Reproducer

    1. Confirm the project hook was loaded and trusted.
    2. Drive the command script with documented event JSON on stdin.
    3. Test GROK_HOOK_EVENT present, env absent with stdin hookEventName present,
       and both absent.
    4. Inspect exit, stderr, and exact ledger destination.

### Expected evidence

The driver distinguishes hook configuration, event-name fallback, validation, and ledger-write behavior. Passive stdout is ignored by the host, so success is exit 0 plus expected state. Missing live activation remains a separate uncertainty.

### Cleanup

Use a temporary workspace root and remove it after the receipt.

## Reproduction stop rule

Stop when the next probe needs credentials, destructive recovery, configuration weakening, project trust, external mutation, or scope expansion that was not authorized. Return the supported failure class, evidence already gathered, and exact next decision.
