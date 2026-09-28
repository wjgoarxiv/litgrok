# Permission and sandbox decision matrix

Load this contract when an implementation requires a tool call whose permission result or sandbox reach is uncertain. It separates authorization to attempt a call from the operating-system boundary applied after approval. The two decisions must never be collapsed.

## Documented evaluation model

Permission rules evaluate in the order `deny > ask > allow`. A deny wins over a matching allow. Ask pauses for a user decision. Allow permits the tool call to be attempted. Permission modes can change which unmatched calls prompt, but explicit deny rules and `PreToolUse` hooks remain effective.

The sandbox is independent. Its built-in profiles are `off`, `workspace`, `read-only`, `strict`, and `devbox`. LitGrok uses only documented profile behavior and does not infer a custom profile from its name. A managed requirement can pin a profile above lower-precedence choices.

## Profile matrix

| Profile | Filesystem read | Filesystem write | Child network | Implementation consequence |
| --- | --- | --- | --- | --- |
| `off` | unrestricted | unrestricted | allowed | Approval remains necessary where permissions require it; absence of a sandbox is not authorization. |
| `workspace` | everywhere | cwd, `~/.grok/`, temp | allowed | Repository edits fit when cwd is the intended project; writes elsewhere do not. |
| `devbox` | everywhere | top-level directories except `/data` | allowed | Confirm the target is within an allowed top-level directory before mutating. |
| `read-only` | everywhere | `~/.grok/` and temp only | blocked | Review can inspect the repository, but source edits in cwd cannot be assumed possible. |
| `strict` | cwd and system paths | cwd, `~/.grok/`, temp | blocked | Keep reads and writes in the current workspace; external source trees are outside reach. |

Child-network restriction is documented as enforced on Linux and a no-op on macOS for `read-only` and `strict`. Never turn that platform limitation into a claim that network access is authorized. In-process model and web tools are separate from child-process network restrictions.

## Combined decisions

| Permission observation | Sandbox observation | Requested action | Decision | Required evidence |
| --- | --- | --- | --- | --- |
| explicit deny | any profile | run matching tool | stop | Quote the matching deny and the requested tool pattern. |
| ask | boundary permits | run tool | wait for decision | Identify the exact call and why it is needed. |
| ask | boundary blocks | run tool | report both boundaries | Approval alone would not make the call viable. |
| allow | boundary permits | read source | proceed read-only | Record path and actual read result. |
| allow | boundary permits | edit owned file | proceed within scope | Confirm ownership, dirty state, and focused verification. |
| allow | boundary blocks | edit outside cwd | stop | Name the target and active profile; do not relocate the edit. |
| unmatched in Ask mode | boundary permits | execute test | request approval | Do not interpret the sandbox as implicit permission. |
| unmatched in Auto mode | boundary permits | execute test | let the host decide | Capture whether it approved, asked, or denied. |
| unmatched in Always-approve | boundary permits | destructive command | do not infer user authority | Explicit task authorization is still required. |
| remembered allow | dangerous command | `git push` or removal | expect host caution; keep hard stop | A remembered grant does not expand the task. |
| explicit allow | `read-only` | source edit | stop | The sandbox still prevents repository writes. |
| explicit allow | `strict` | child network call | stop or use an authorized documented surface | Do not disable the profile as a workaround. |
| explicit allow | `workspace` | write temp fixture | proceed in temp | Record fixture path and cleanup. |
| explicit allow | custom profile | access named path | inspect actual profile fields | A profile name alone is not evidence of reach. |
| PreToolUse deny | any permission mode | guarded tool call | stop | Preserve the hook reason; only an explicit deny blocks. |
| hook timeout or crash | permission permits | guarded tool call | treat as fail-open host behavior | Do not claim the guard enforced the policy. |

## Action decision procedure

1. Identify the literal tool and action, not a broad goal such as “finish the task.”
2. Check explicit deny, ask, and allow rules for that tool and input pattern.
3. Record the active permission mode only after explicit rules are considered.
4. Identify the active sandbox profile from current state; do not assume the default if configuration or managed policy is present.
5. Map every filesystem path and child-network need against the profile.
6. Apply user scope and hard stops independently of host permission.
7. If all three layers permit the action, attempt it and capture the real result.
8. If any layer blocks it, report the narrow boundary without mutating configuration.

The three layers are user authorization, permission decision, and sandbox reach. The first is conversational scope. The second gates the tool call. The third constrains the approved process. A GREEN result requires all applicable layers plus successful execution.

## Custom-profile reading rule

Custom profiles live in user or project `sandbox.toml`. Documented fields include `extends`, `restrict_network`, `read_only`, `read_write`, and `deny`. A deny entry can be a path or glob and is kernel-enforced when the sandbox can be applied. Before relying on a custom profile:

- read the selected profile rather than a similarly named profile;
- resolve its `extends` base;
- check explicit read-only, read-write, and deny entries;
- treat deny as affecting read plus write and rename;
- account for platform enforcement limits;
- do not modify the profile unless configuration change is itself authorized.

## Stop receipts

When the decision is stop, return the requested action and exact target, the relevant permission rule or unresolved prompt, the active sandbox profile and conflicting boundary, whether the user authorized the action in principle, the smallest safe next step, and confirmation that no permission or sandbox configuration was changed.
