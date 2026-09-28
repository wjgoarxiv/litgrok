# Behavior lane contract

Load this contract when a review must determine whether inputs, state transitions, outputs, and error paths implement the requested behavior.

## Scope

The behavior lane reads the target implementation, direct callers, boundary adapters, and tests that state observable outcomes. It does not review style in isolation, run shell commands, mutate files, or propose new features. Give the explore subagent one concrete behavior question, an exact path scope, and the comparison base.

Typical questions are: Which inputs reach this branch? What state changes before failure? Can an empty or repeated input bypass validation? Does a non-zero result leave partial state? Which caller observes the return value?

## Contract

Trace one end-to-end path from accepted input to externally visible result. Record every validation boundary and state transition on that path. Then inspect malformed, empty, boundary, repeated, conflicting, cancellation, and retry behavior where applicable.

Distinguish code evidence from runtime evidence. A branch in source proves that logic exists, not that a packaged or registered surface reaches it. A test proves an expectation, not that it ran in this review. If the comparison base is a diff, inspect unchanged context that controls changed lines.

Report a finding only when a triggering condition, violated contract, and consequence are concrete. Tie it to paths and symbols. A speculative alternate design is not a behavior defect.

## Pass criteria

- Accepted inputs reach the intended result through a traceable path.
- Validation occurs before irreversible mutation.
- Failure and cancellation behavior preserve the documented state contract.
- Empty, malformed, repeated, and conflicting inputs are either handled or explicitly outside scope.
- Return values, exit statuses, and artifacts are consumed consistently by direct callers.
- No changed branch is orphaned from the claimed user-facing entry point.

## Fail criteria

- An input can bypass a required validation or authorization boundary.
- The implementation reports success after a failed or partial operation.
- Failure leaves corrupt, foreign, or unexplained state.
- Caller and callee disagree on status, units, ordering, or idempotence.
- A documented behavior has no reachable implementation path.
- A changed condition breaks a realistic adjacent caller.

## Evidence packet

Return the review question, comparison base, traced path in order, relevant file/symbol references, boundary cases inspected, confirmed findings by severity, rejected concerns, and unresolved runtime evidence. For each finding include trigger, actual behavior, expected contract, consequence, and smallest remediation direction.

The lane summary is read-only evidence for the parent. It does not decide final severity and must not claim a test passed unless current command evidence was supplied by the parent.

## Sample assignment

    TASK: Trace how install handles a foreign file at any payload path.
    DELIVERABLE: One path trace plus confirmed partial-write or refusal findings.
    SCOPE: Read/list/search only in bin/ and installer tests.
    VERIFY: Cite preflight, conflict, and mutation symbols; run no shell.
