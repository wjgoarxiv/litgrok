# Python — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `basedpyright-langserver --stdio`
- **Extensions:** `.py .pyi`
- **Install hint:** `pip install basedpyright`

## Install

- **macOS:** `pip install basedpyright` (or `uv tool install basedpyright`)
- **Linux:** `pip install basedpyright` (or `uv tool install basedpyright`)
- **Windows:** `pip install basedpyright`

Prefer `uv tool install basedpyright` when the project uses uv — it keeps the
server isolated from project venvs and always on PATH.

Confirm it resolves:

```bash
command -v basedpyright-langserver
```

## Server settings

Grok reads language servers from project `.grok/lsp.json` and from `~/.grok/lsp.json`. The project file wins when both name the same server. A trusted plugin may add a server; LitGrok does not ship one. The built-in tool stays off until `GROK_LSP_TOOLS=1` or user `[features] lsp_tools` (see the `lsp` skill).

On Grok 1.0.13, `grok inspect --json` listed a server only for a string `command`, a string array `args`, and `extensionToLanguage`. This is the entry that loaded. Use this page's binary as `command` and put flags such as `--stdio` in `args`.

```json
{
  "typescript": {
    "command": "typescript-language-server",
    "args": ["--stdio"],
    "extensionToLanguage": { ".ts": "typescript" }
  }
}
```

The same inspect dropped a `command` that was itself an array, and it dropped a file whose only key was `lspServers`. Do not put the entry in `.grok/config.toml`.

Grok's documentation names the two `lsp.json` paths and does not name these fields. Only that one shape was probed, for one TypeScript server. Other fields, a `command` with no `args`, and the plugin file format were not probed. Installing the binary on PATH is still required, and LitGrok still does not write `lsp.json`.

## Choosing a server

Type checkers and the linter serve different roles. Run a type server, and
optionally `ruff` ALONGSIDE it (not instead). The first column is the string `command` and the second is `args`; do not paste a launch as a JSON array into `command`:

| command | args | install | role |
| --- | --- | --- | --- |
| `basedpyright-langserver` | `--stdio` | `pip install basedpyright` | strictest types, **default** |
| `pyright-langserver` | `--stdio` | `pip install pyright` | upstream Microsoft type checker |
| `ty` | `server` | `pip install ty` | Astral, very fast, pre-1.0/experimental |
| `ruff` | `server` | `pip install ruff` | lint + format only, complements a type server |

Recommended: keep `basedpyright` as the Python server. `ruff` does not
type-check, so if you want lint diagnostics too run it as a separate tool rather
than replacing the type server.

## Troubleshooting
- **PATH:** `basedpyright-langserver` must be on PATH; reopen shell after install. `uv tool install` writes to `~/.local/bin`.
- **Wrong interpreter / missing imports:** the server must see the project venv. Set `python.pythonPath` / `venvPath` in `pyrightconfig.json`, or activate the venv before launching.

## Verify

```bash
command -v basedpyright-langserver
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
