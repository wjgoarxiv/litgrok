# Worked comprehension artifacts

These cases show how evidence becomes a portable explanation. Source maps and claim ledgers remain in the internal work record; the file uses direct citations where the reader needs them.

## Case 1 — installer destination

### Input

The reader asks, “Where does the project install place hooks, and why do they not run immediately?” Inspection shows a project `.grok/hooks/` payload, an installer receipt listing copied files, and project trust documentation. No live host session was launched.

### Expected artifact excerpt

> A project install copies the hook definitions and commands into `<project>/.grok/hooks/`. Project hooks run after the project is trusted through `/hooks-trust` or the `--trust` flow. The install guide describes both steps.

Reply note: No live Grok Build session was used to verify runtime execution.

## Case 2 — failing command path

### Input

The reader asks why a file-writing action failed. The session ledger contains a `PostToolUseFailure` event with documented tool name and input, while the error text itself is not part of the documented event payload. A manual reproduction returns a permission denial.

### Expected artifact excerpt

> The recorded event identifies the failing write action and its target. It does not preserve a documented error-message field, so the original failure text cannot be recovered from the hook record. Repeating the same bounded write produced a permission denial; that reproduction, rather than an invented event field, supports the diagnosis.

Reply note: The hook record does not retain the original error text; the bounded reproduction is a separate observation.

## Case 3 — conflicting configuration evidence

### Input

The reader asks whether a project configuration can enable a built-in feature. A user-level configuration document lists the feature, while project configuration documentation limits project sections to `[mcp_servers]`, `[plugins]`, and `[permission]`.

### Expected artifact excerpt

> The built-in feature can be enabled from the documented user configuration surface. The project configuration surface is intentionally narrower and does not accept that feature section. Therefore the project file cannot be used as a portable feature toggle; the user must opt in at user scope.

The explanation cites both configuration contracts and resolves their apparent conflict by scope. It does not invent a project-level field.

## Case 4 — stale passing test

### Input

A prior handoff says a suite passed, but the current working tree contains later edits and the suite has not been rerun.

### Expected artifact excerpt

> The recorded pass applies to the earlier revision named in the handoff. Because the working tree changed afterward, it is historical evidence rather than a current verification result. The present revision remains untested until the suite is rerun.

Reply note: The earlier pass is stale for the edited tree; the current revision still needs the suite run.
