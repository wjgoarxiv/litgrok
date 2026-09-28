# Project-rule loading-order contract

This contract explains only documented Grok Build rule and project-configuration behavior. Use it to predict which instruction applies at a path and to diagnose a missing rule without inventing precedence controls.

## Rule families

Grok loads an AGENTS.md family while walking directories from the repository root toward the current working directory (cwd). The documented family includes `AGENTS.md` and compatibility filenames described by the host documentation. A deeper file is closer to the work and therefore has precedence over a broader parent rule when instructions conflict.

Grok also loads Markdown files matching `.grok/rules/*.md`. Treat each discovered file as project instruction. Do not assume an undocumented numeric priority, manifest, or import key. Gitignored rule files are skipped. Use `grok inspect` to examine discovered rules rather than guessing from the directory listing alone.

## Loading decision table

| Location or condition | Loaded scope | Precedence meaning | Verification |
| --- | --- | --- | --- |
| User rule in the documented global location | All applicable projects | Broadest user instruction | Inspect active rules |
| Repository-root `AGENTS.md` | Entire repository | Broad project baseline | Run `grok inspect` at root |
| Child-directory `AGENTS.md` | That subtree | Deeper instruction wins on conflict | Inspect from child cwd |
| Further nested `AGENTS.md` | Its subtree | Closest applicable file | Compare root-to-cwd chain |
| `.grok/rules/*.md` in project | Project rule set | Loaded as project instructions | Inspect discovered rules |
| Gitignored rule file | Not loaded | No authority | Check ignore match and inspect |
| Rule outside root-to-cwd chain | Not inherited through that path | No authority for current cwd | Change cwd only for diagnostic |
| Missing file named only in prose | Not loaded | No implicit import | Inspect actual discovery |
| Conflicting parent and child instructions | Child applies within its subtree | Narrower location prevails | Record both files and cwd |
| Two rules without documented conflict resolution | Do not invent an order | Treat as ambiguity | Rewrite rules to remove conflict |

## Project configuration boundary

Project `.grok/config.toml` contributes only these documented top-level sections:

```toml
[mcp_servers]

[plugins]

[permission]
```

That file is not a general user-settings override. Do not add unrelated feature switches, interface settings, models, or invented sections at project scope. User-level settings belong to their documented user configuration surface.

Project MCP definitions are walked from cwd toward the repository root. A project definition with the same server name replaces the user definition. Plugin entries and permission rules remain within their documented sections. Never modify host or user configuration merely to make a project rule load.

## Trust boundary

Project hooks require trust. The user grants it through `/hooks-trust` or the `--trust` flow, and trusted project state is stored in `~/.grok/trusted_folders.toml`. Rule discovery does not authorize changing that file. If a project hook is present but silent, inspect trust and hook wiring as separate questions.

Trust does not expand rule syntax. A trusted project still cannot rely on undocumented configuration sections or an invented rule manifest. Do not grant trust as a side effect of installing or inspecting a payload.

## Diagnostic procedure

1. Record the exact cwd and repository root.
2. Walk the filesystem path from root to cwd and list actual AGENTS-family files.
3. List `.grok/rules/*.md` files and test whether ignore rules exclude any.
4. Run `grok inspect` from the relevant cwd and compare discovered rules with the filesystem list.
5. Identify the narrowest rule that addresses the behavior.
6. Separate rule discovery from project configuration and hook trust.
7. If instructions conflict without a documented resolution, rewrite the project rules to make the intended scope explicit.

## Authoring rules

Put broad safety, testing, and repository boundaries near the root. Put language-, package-, or directory-specific commands in the nearest applicable subtree. Keep rules directly actionable. Refer to real commands and paths. Avoid duplicating the same instruction across several files, because later edits can create silent contradictions.

Use `.grok/rules/*.md` for cohesive project instruction that should be discovered as a rule file. Use an AGENTS-family file when directory walking and nested precedence are central to the scope. Do not use either surface to smuggle executable code or host configuration.

## Receipt

Report the cwd, repository root, discovered rule files in root-to-cwd order, ignored candidates, `grok inspect` result, applicable project configuration sections, trust state when hooks matter, and unresolved conflicts. This receipt proves loading behavior without claiming an undocumented schema.
