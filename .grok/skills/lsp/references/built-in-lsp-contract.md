# Built-in LSP code-intelligence contract

This reference is deliberately narrow. Grok Build documents a built-in code-intelligence tool that is off by default. LitGrok explains how to enable and bound that tool. No language server ships with LitGrok, and no server configuration schema is described here.

## Documented enable paths

The user may enable the built-in tool for a process with:

```text
GROK_LSP_TOOLS=1
```

The documented default is `0`, so omission leaves the tool off.

The user configuration path is:

```toml
[features]
lsp_tools = true
```

The documented default is off. This is a user feature switch, not a project `.grok/config.toml` section. Do not edit user configuration without explicit authorization. Prefer a process-scoped environment switch for a bounded probe when that satisfies the request.

## Decision table

| Situation | Action | Evidence | Stop condition |
| --- | --- | --- | --- |
| Tool absent and no opt-in requested | Leave disabled | Visible tool inventory | Do not change config |
| User authorizes one-session probe | Set process environment to `1` | Launch command and tool visibility | Restore by ending process |
| User authorizes persistent opt-in | Set user feature value to true | Config diff and fresh session | Do not write project config |
| Tool becomes visible | Use only exposed input contract | Tool name and bounded query | Do not infer extra operations |
| Tool remains absent after opt-in | Report unavailable | Setting receipt and inventory | Do not invent server setup |
| Repository language has no result | Treat as no available code-intel result | Query and empty/failed response | Continue with text search |
| Result points outside scope | Discard or narrow request | Returned path | Do not inspect unauthorized path |
| Result conflicts with source text | Inspect source as authority | Result plus current file | Do not treat index as current |
| User asks which server powers it | State documentation limit | Four documented LSP facts | Do not claim a bundled server |
| User asks for plugin server setup | Report undocumented schema boundary | Documentation search receipt | Ship no configuration |

## Operational limits

The documentation exposes an enable switch and the built-in tool, but it does not define supported languages, server selection, server installation, workspace indexing guarantees, freshness guarantees, or a project-level server configuration. Therefore:

- do not promise support for a language before observing a real result;
- do not claim that enabling the switch installs or starts a particular server;
- do not invent initialization, transport, or executable fields;
- do not use a plugin manifest or project server block;
- do not diagnose an empty result as a server crash without evidence;
- do not treat index results as newer than the current file on disk.

Text search and direct source inspection remain the fallback. The built-in tool is an optional navigation aid, not an authority over the source tree or a replacement for tests.

## Bounded probe

1. Record whether the feature is currently visible.
2. Obtain authorization before changing the process environment or user config.
3. Enable one documented switch, not both at once, so the causal path is clear.
4. Start a fresh Grok Build process if the chosen surface requires it.
5. Ask one repository-bounded symbol or reference question whose answer can be checked by source search.
6. Compare the result with current files.
7. Record tool visibility, query, returned paths, and comparison.
8. Roll back the temporary environment by ending the process; reverse persistent config only when authorized.

## Failure taxonomy

`disabled` means neither opt-in is active. `not-exposed` means an opt-in was attempted but the tool is absent. `no-result` means the visible tool returned no match. `stale-result` means the returned location conflicts with current source. `out-of-scope` means the tool returned an unauthorized path. `undocumented-server-request` means the requested setup requires a schema the documentation does not provide.

None of these statuses justifies creating a server definition. The honest remedy is to narrow the claim, use repository-native search, or wait for documented host support.

## Receipt

Report the chosen enable path, authorization boundary, feature visibility before and after, exact bounded query, returned locations, source comparison, fallback used, and rollback state. State plainly that LitGrok ships no server and claims no plugin-supplied server configuration.
