# Test lane contract

Load this contract when a review must map changed behavior to executable coverage, distinguish meaningful RED/GREEN evidence, or identify a missing regression.

## Scope

The test lane reads product scripts, the nearest tests, fixtures, helper drivers, and any supplied command receipts. An explore subagent may read, list, and search; it cannot execute a suite. The parent owns command execution and baseline comparison.

The lane evaluates whether tests could fail for each relevant contract, not merely whether test files mention a symbol. It treats setup errors, skipped tests, stale snapshots, and assertions against implementation details as separate risks.

## Contract

Map each changed behavior or review claim to a specific assertion. Check positive, negative, malformed, conflict, idempotence, cleanup, and packaging cases according to the surface. Identify which test would turn RED if the implementation were removed or corrupted.

Read helpers far enough to detect false positives: a driver that calls a script directly does not prove its host matcher routes events; a dry run does not prove live install; a fixture constructed with the expected output cannot independently validate generation.

When failures exist, do not label them pre-existing from memory. Require an isolated comparable baseline using the same command, runtime, and dependency state.

## Pass criteria

- Every material behavior change maps to at least one semantic assertion.
- The focused assertion was observed RED for the intended reason when new behavior was added.
- GREEN evidence names command, cwd, exit, and pass/fail counts.
- Negative and conflict paths assert non-mutation where that is the contract.
- Test helpers exercise the real boundary they claim to cover.
- Packaged or installed surfaces have an appropriate integration probe.

## Fail criteria

- Coverage is only symbol presence, line execution, or snapshot churn.
- A test passes before implementation and was accepted without strengthening.
- A setup error is reported as the behavior's RED state.
- Direct invocation is described as host routing evidence.
- Failures are called pre-existing without a comparable baseline.
- A shipped file is never checked in pack or install output.

## Evidence packet

Return a behavior-to-assertion table, focused RED and GREEN receipts already present, missing cases ranked by consequence, helper limitations, unrun commands, and the minimal new assertion needed for each gap. Cite test names and paths.

Do not run or modify tests in the lane. If supplied receipts are incomplete, say which field is missing. Keep test limitations in the parent report's one methodology paragraph.

## Sample assignment

    TASK: Map passive-hook event fallback to executable assertions.
    DELIVERABLE: Assertion map for env-present, stdin fallback, and both-absent.
    SCOPE: Read/list/search only in hook script and driver tests.
    VERIFY: Explain how each assertion would fail under the old implementation.
