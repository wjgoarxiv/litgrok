# Tool-by-tool implementation boundaries

Load this reference when a programming task crosses more than one tool class, when the same operation could be attempted through several tools, or when a safe verification path is unclear. This is a decision table, not a catalog of every host tool.

## Boundary table

| Tool or action | Primary effect | Permission filter | Sandbox concern | Safe programming use | Stop condition |
| --- | --- | --- | --- | --- | --- |
| read a file | observes bytes | `Read` / `read` | source path must be readable | inspect guidance, source, tests, and generated ownership | path is outside authorized scope or contains protected secrets |
| list or search | discovers paths/text | `Grep` / `grep` or read-like rules | traversal remains within readable roots | locate symbols, callers, manifests, and guards | query would scan a prohibited sibling or private root |
| edit existing file | mutates bytes | `Edit` / `edit` | destination must be writable | targeted patch to an owned file after reading it | target is foreign, generated without its generator, or outside scope |
| write new file | creates bytes | write/edit feature and rules | parent directory must be writable | add a required source, test, or reference with a known owner | destination schema is undocumented or conflicts with existing state |
| shell command | launches process | `Bash` / `bash` | child filesystem and network limits apply | run documented tests, syntax checks, and read-only status commands | destructive or external effect lacks explicit authority |
| package test | executes repository scripts | usually shell rules | may write caches or evidence | run from the documented product root and report counts | command is known to mutate protected artifacts without isolation |
| formatter | rewrites source | shell plus write reach | all formatted paths must be writable | run only on named files when formatting is required | repository-wide format would touch unrelated dirty files |
| generator | rewrites derived files | shell plus write reach | output roots must be writable | run the owning generator after source changes | generator scope is unknown or includes protected mirrors |
| package dry run | resolves shipped payload | shell; may read package files | temp/cache paths must be writable | inspect structured JSON listing without publishing | lifecycle scripts have unreviewed external effects |
| network fetch | reaches remote service | `WebFetch`, `WebSearch`, or tool-specific rule | child-network setting may not cover in-process tools | retrieve a named primary source when current facts require it | credentials, purchase, upload, or private data transfer is implied |
| MCP tool | invokes configured server | `MCPTool` / `mcp` | server process and transport have separate reach | use only a configured, documented server and namespaced tool | server identity, arguments, or external effect is unclear |
| background task | persists command beyond turn | shell rules | same child limits continue | bounded long test or monitor with explicit receipt | completion cannot be observed or cancellation would corrupt state |
| worktree operation | creates isolated checkout | shell and filesystem writes | parent and checkout paths must be writable | isolate a baseline or parallel change when authorized | dirty state would be lost or target branch/ref is ambiguous |
| version-control commit | records repository state | shell rules | `.git` must be writable | only with explicit commit authority and explicit staging | broad staging, generated attribution, or unexpected paths appear |
| push, publish, deploy | mutates external state | shell/network rules | credentials and remote reach required | only under explicit release authorization | authorization is absent, version is unresolved, or destination differs |

Permission filters name host matching categories. They do not promise that a particular tool is enabled or that its input schema has a certain shape. Inspect the live tool surface before constructing a call.

## Tool substitution rule

Do not substitute a different tool merely because the intended one is denied. Editing through shell redirection is still an edit. Calling a network-capable server instead of a blocked child process is still a network action. Writing a generated file manually is still mutation of a derived artifact. Authorization follows the effect, not the tool label.

A substitute is acceptable only when it stays within the same authorized effect, its permission and sandbox boundaries are independently satisfied, it preserves validation and cleanup, the evidence still exercises the user-facing path, and it does not bypass a denial or hard stop.

## Read and search boundary

Read the narrowest sources that establish ownership and behavior. A repository search can reveal generated copies, registrations, and tests; it can also cross scope if rooted too high. Resolve the product root before searching. Keep secrets, ignored credentials, and unrelated trees outside the query. Treat matches as pointers, then read the owning context.

Search output is not execution evidence. A symbol existing in source does not prove registration, packaging, or runtime reachability. Follow it to the surface the user touches.

## Edit and write boundary

Before mutation, inspect status, read the exact file and nearest test, decide whether it is source or generated output, resolve conflict policy, add a focused failing test when behavior changes, and prefer a patch that leaves unrelated lines intact.

After mutation, inspect the diff. A parser check does not prove behavior. A focused test does not prove package inclusion. Select the next verification layer based on the changed surface.

## Shell boundary

Shell commands can read, write, spawn children, access the network, and change external state. Classify the command before running it. Avoid combining commands whose exit states matter. Quote paths safely. Keep untrusted text out of interpolation. Use explicit working directories. Treat timeouts as timeouts, and inspect background tasks instead of declaring them failed or complete by elapsed time alone.

Commands that delete, reset, clean, stash, commit, push, publish, deploy, grant trust, or rewrite host configuration require their own authorization. A broad task such as “fix tests” does not imply them.

## Verification boundary

| Change type | First evidence | Adjacent evidence | User-surface evidence |
| --- | --- | --- | --- |
| parser or pure function | focused unit test | module test file | caller integration |
| CLI behavior | argument/exit test | package test | temp-directory invocation |
| installer payload | synthetic conflict test | pack listing | real temp install and file inventory |
| hook command | stdin driver | config-schema test | documented event-shaped invocation |
| documentation contract | structural test | full docs suite | packed path and reachability link |
| generated manifest | generator RED/GREEN | hash or consistency check | packed/install listing |

Use the table to select evidence, not to demand every layer for every edit. State which load-bearing layer was omitted and why.

## External-state boundary

Authentication, host configuration, repository history, remote branches, registries, deployment targets, messages, and purchases are external state. Preparation can be in scope while mutation is not. A task may authorize a version edit without authorizing publication, or authorize a commit without authorizing push. Preserve those distinctions in tool choice and receipts.
