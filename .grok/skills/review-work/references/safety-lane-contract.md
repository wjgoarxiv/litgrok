# Safety lane contract

Load this contract when a review touches trust boundaries, destructive operations, credentials, external state, permission rules, sandbox assumptions, or fail-open guards.

## Scope

The safety lane reads input validation, path resolution, conflict policy, command construction, hook behavior, cleanup, authentication boundaries, and security-relevant tests. It does not perform an exploit, expose secrets, grant trust, change permissions, disable a sandbox, or mutate external state.

Focus on realistic triggers and consequences. Generic cautions without an affected code path remain questions, not findings.

## Contract

Trace untrusted input from entry to mutation or execution. Check normalization, symlinks, traversal, shell interpolation, foreign-file handling, partial failure, timeout, and cancellation. Separate user authorization from host permission and sandbox reach.

For hooks, distinguish blocking and passive events. Only an explicit PreToolUse deny blocks; timeouts, crashes, and malformed output are fail-open, while passive stdout is ignored. A product may add stricter internal validation but must not describe host behavior inaccurately.

For cleanup, verify ownership before deletion. For release or messaging paths, require explicit authorization at the moment of external mutation.

## Pass criteria

- Untrusted data is parsed and validated before mutation or command construction.
- Exact destinations are resolved and foreign content has a clear refusal or identity policy.
- Shell arguments do not rely on unsafe interpolation.
- Partial failures leave an inventoried, recoverable state.
- Destructive and external effects require explicit authority.
- Permission, sandbox, trust, and hook fail-open limits are represented honestly.

## Fail criteria

- Traversal, symlink, or broad target resolution can escape the authorized root.
- A reinstall or cleanup overwrites or deletes foreign content.
- Untrusted text becomes executable shell or configuration.
- A crash is treated as enforcement even though the host fails open.
- Credentials or private data can enter logs or artifacts.
- A broad cleanup, reset, stage, publish, or trust action is inferred from a narrower request.

## Evidence packet

Return each trust boundary inspected, the input-to-effect trace, existing validation and negative controls, concrete findings with trigger and impact, and security-relevant evidence that could not be obtained read-only. Separate exploitable defects, defense-in-depth gaps, and documentation inaccuracies.

Do not include secret values in the packet. Redact only the value, preserving the field, origin, and causal role. The parent sets final severity after comparing evidence with actual reachability.

## Sample assignment

    TASK: Review installer conflict and uninstall ownership safety.
    DELIVERABLE: Path-resolution trace and any overwrite/delete findings.
    SCOPE: Read/list/search only in installer source and tests.
    VERIFY: Cite foreign-file, symlink, idempotence, and modified-payload cases.
