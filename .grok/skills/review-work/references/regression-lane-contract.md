# Regression lane contract

Load this contract when a change can affect callers, consumers, shared helpers, serialized state, package paths, or behavior outside the focused test.

## Scope

The regression lane traces outward from changed symbols and files. It reads direct callers, imports, package scripts, fixtures, serialized formats, installers, and tests that share the changed path. It does not speculate about unrelated modules or run broad commands.

The lane is most valuable after the behavior and test lanes identify the primary change. Its question is not “could anything break?” but “which existing consumer receives a different value, path, status, or timing?”

## Contract

Enumerate direct consumers before indirect ones. For each, identify the prior assumption and changed behavior. Check compatibility of names, arguments, return values, exit status, ordering, idempotence, file modes, packed paths, and cleanup.

When a shared helper changes, inspect all call sites. When a payload tree changes, inspect tree walkers, conflict preflight, uninstall ownership, pack allowlists, and install assertions. When event handling changes, check every event wrapper and disagreement/error cases.

Require an adjacent test for realistic affected consumers. Do not demand coverage for a hypothetical consumer that no source or documented contract supports.

## Pass criteria

- All direct consumers were identified and remain contract-compatible.
- Shared helper changes preserve unrelated call sites.
- Serialized or packed paths remain stable or are deliberately migrated.
- Idempotence, conflict, and cleanup behavior remain intact.
- Adjacent tests exercise realistic changed consumers.
- No protected or unrelated tree was rewritten by a broad operation.

## Fail criteria

- A caller assumes an old return, field, path, event name, or exit status.
- A helper fix handles one wrapper but breaks another.
- Package or installer logic omits new nested files.
- Cleanup removes state it no longer owns.
- A focused test masks a package-wide naming or compatibility break.
- A migration changes persistent state without an explicit policy.

## Evidence packet

Return the changed symbol or path, direct-consumer inventory, assumptions checked, adjacent tests mapped to each consumer, confirmed regressions, and unverified edges. Give file and symbol references and distinguish reachable consumers from textual matches.

The parent uses this packet to choose the smallest adjacent suite. The lane must not claim a consumer is safe merely because no failure was found by search.

## Sample assignment

    TASK: Trace event-name fallback through all passive hook wrappers.
    DELIVERABLE: Wrapper inventory and mismatch/fallback regression findings.
    SCOPE: Read/list/search only in passive helper, wrappers, configs, tests.
    VERIFY: Check env present, stdin fallback, disagreement, and missing-both paths.
