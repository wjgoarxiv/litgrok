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

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

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
