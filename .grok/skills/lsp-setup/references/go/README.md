# Go — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `gopls`
- **Extensions:** `.go`
- **Install hint:** `go install golang.org/x/tools/gopls@latest`

## Install

- **macOS:** `go install golang.org/x/tools/gopls@latest` (or `brew install gopls`)
- **Linux:** `go install golang.org/x/tools/gopls@latest`
- **Windows:** `go install golang.org/x/tools/gopls@latest`

Requires the Go toolchain. `go install` drops the binary in `$GOPATH/bin`
(default `~/go/bin`) — that directory must be on PATH.

```bash
export PATH="$PATH:$(go env GOPATH)/bin"
```

Confirm it resolves:

```bash
command -v gopls
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

None — `gopls` is the official and de facto sole Go language server.

## Troubleshooting
- **PATH:** `gopls` must be on PATH; ensure `$(go env GOPATH)/bin` is exported, then reopen the shell.
- **No diagnostics / "no required module":** open the directory containing `go.mod` as the workspace root. Outside a module, gopls degrades. Run `go mod tidy` if dependencies are unresolved.
- **Stale toolchain:** reinstall with `go install golang.org/x/tools/gopls@latest` after upgrading Go.

## Verify

```bash
command -v gopls
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
