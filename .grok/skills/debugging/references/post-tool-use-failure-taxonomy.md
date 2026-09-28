# PostToolUseFailure evidence taxonomy

Load this taxonomy after a failed tool call when the visible failure and the session ledger must be classified before a fix is considered. It is keyed to Grok Build's documented PostToolUseFailure event without inventing an error-result field.

## Documented evidence envelope

A tool event can provide hookEventName, sessionId, cwd, workspaceRoot, toolName, and toolInput on stdin. The hook environment provides the event, hook name, session id, and workspace root. The documented envelope does not name an error message, exit code, stderr, duration, subagent id, or result object.

Therefore the event proves that the host classified a tool call as failed and identifies its invocation context. The visible tool transcript, command status, generated artifacts, and passive session ledger must supply any additional evidence. Absence of a ledger record does not prove success: passive hooks can be missing, untrusted, timed out, crashed, or disabled.

## Failure taxonomy

| Failure class | Presentation | PostToolUseFailure correlation | Next discriminating action | Do not conclude |
| --- | --- | --- | --- | --- |
| input validation | tool rejects empty, malformed, conflicting, or out-of-range input | toolName and inert toolInput identify the attempted invocation | reduce to the smallest invalid field and compare with documented or tested input | the implementation is broken before valid input is tried |
| discovery | path, command, rule, skill, hook, or config cannot be found | event cwd/workspace may reveal lookup root | resolve actual cwd, inspect discovery rules, and test exact path existence | missing at one lookup root means missing everywhere |
| permission denial | permission system prevents the tool from running | failure event may exist, but permission UI or denial text is primary | identify matching deny/ask rule and whether the call was attempted | sandbox or program logic caused the denial |
| sandbox denial | approved process crosses filesystem or child-network boundary | tool invocation is visible; host event lacks the blocked path unless present in input | record active profile and reproduce with the same permitted target | disabling the sandbox is a program fix |
| executable missing | shell or command cannot locate a program | toolName names the shell-like tool, not the missing executable | inspect PATH and resolve the named command without installing anything | a similarly named binary is the required dependency |
| working-directory mismatch | relative path or package command resolves against the wrong root | compare event cwd and workspaceRoot with intended product root | run a read-only root/status check, then repeat the exact command from documented cwd | the file itself is absent or corrupt |
| program exit | process starts and returns a non-zero status | event establishes failed tool call; transcript supplies status/stderr | preserve exit and reduce program input while holding environment constant | every non-zero exit is the same failure class |
| assertion mismatch | test runs but observed value differs from expected | correlate event with the precise test command and transcript | run the narrow test and identify first semantic mismatch | the entire suite is invalid |
| timeout or hang | foreground result does not arrive within the bounded interval | event may appear only after the host classifies failure | distinguish timeout, background continuation, deadlock, and slow completion | elapsed time alone proves termination |
| cancellation | user or parent cancels a running action | ledger ordering can show the turn boundary but not invented cancellation details | inspect task state and any partial artifacts before retry | cancellation preserved atomicity |
| partial mutation | call fails after creating or changing some state | event input names intended operation, not completed writes | inventory target bytes, temp files, locks, and external effects before recovery | failure means nothing changed |
| environment skew | version, variable, executable, architecture, or cwd differs from expected baseline | session and workspace fields help bind the observation | record exact version and environment fact, then compare one dimension | a clean-HEAD run automatically matches the dirty environment |
| hook recorder failure | passive recorder itself exits non-zero or never records | visible tool failure may exist without a usable ledger line | drive the hook directly with documented JSON and inspect stderr/state | no record means no tool failure |
| evidence ambiguity | transcript is truncated, overwritten, stale, or cannot be attributed | event envelope may identify session/cwd but not missing result | rerun a smaller safe reproducer with bounded output | the most plausible explanation is proven |

## Correlation rules

Correlate on more than the event name:

1. sessionId must name the active investigation.
2. cwd must match the directory from which the failure was attempted.
3. workspaceRoot must match the project being diagnosed.
4. toolName must match the visible failed tool call.
5. toolInput must be treated as sensitive inert data and compared only as needed.
6. Ledger ordering must not be mistaken for a host timestamp contract unless a product-owned recorder added its own timestamp.

If any field disagrees, record a correlation conflict rather than merging the evidence. Multiple failures in one session require ordering and a stable identifier from product-owned evidence; do not invent one in the host event.

## Classification procedure

Start at the earliest failed boundary. Ask whether the tool was invoked. If not, classify permission or discovery first. If invoked, ask whether the operating boundary rejected access. If access was possible, inspect process start, program exit, assertions, and timing. After any mutating call, check partial state before retrying.

Choose one primary class and any contributing classes. For example, “program exit caused by working-directory mismatch” is more actionable than two unrelated labels. Each hypothesis must predict a probe result. Keep the same input while changing one environmental dimension, or keep the same environment while reducing one input dimension.

## Evidence packet

For each classified failure, record the visible symptom and expected result, exact invocation and cwd, primary and contributing classes, PostToolUseFailure fields actually observed, permission and sandbox state, smallest reproducer and status, partial-state inventory, supported and contradicted hypotheses, next safe probe, and inline limitation where evidence is missing.

## Fix gate

A code fix is justified only when the reproducer fails for the predicted reason, the proposed cause explains that observation, and a focused regression can turn GREEN without weakening permissions or sandbox settings. Configuration, environment, and authorization failures need their own remedies; rewriting program code can hide them without solving them.
