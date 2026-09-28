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

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

## Choosing a server

Type checkers and the linter serve different roles. Run a type server, and
optionally `ruff` ALONGSIDE it (not instead). Launch the server accordingly:

| server launch                        | install                | role                                    |
| ------------------------------------ | ---------------------- | --------------------------------------- |
| `["basedpyright-langserver", "--stdio"]` | `pip install basedpyright` | strictest types, **default**       |
| `["pyright-langserver", "--stdio"]`  | `pip install pyright`  | upstream Microsoft type checker         |
| `["ty", "server"]`                   | `pip install ty`       | Astral, very fast, pre-1.0/experimental |
| `["ruff", "server"]`                 | `pip install ruff`     | lint + format only, complements a type server |

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
