# Bash — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `bash-language-server start`
- **Extensions:** `.sh .bash .zsh .ksh`
- **Install hint:** `npm install -g bash-language-server`

## Install

- **macOS:** `npm install -g bash-language-server`
- **Linux:** `npm install -g bash-language-server`
- **Windows:** `npm install -g bash-language-server` (PowerShell)

For real diagnostics, also install `shellcheck`:

- **macOS:** `brew install shellcheck`
- **Linux:** `apt install shellcheck` (or `dnf install ShellCheck`)
- **Windows:** `scoop install shellcheck`

Confirm it resolves:

```bash
command -v bash-language-server
command -v shellcheck
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

## Alternatives

- `shellcheck` standalone as a linter-only flow (no LSP).
- `shfmt` for formatting (complements, does not replace, the LSP).

## Troubleshooting
- **PATH:** `bash-language-server` on PATH; reopen shell after `npm -g` install.
- **No diagnostics:** `shellcheck` missing — diagnostics are powered by it; install and reopen.
- **Wrong shell dialect:** `.zsh`/`.ksh` are linted as bash; shellcheck may flag shell-specific syntax.

## Verify

```bash
command -v bash-language-server
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
