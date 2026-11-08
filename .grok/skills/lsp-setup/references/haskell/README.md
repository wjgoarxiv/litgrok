# Haskell — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `haskell-language-server-wrapper --lsp`
- **Extensions:** `.hs .lhs`
- **Install hint:** `ghcup install hls`

The `-wrapper` binary detects your project's GHC version and dispatches to the matching HLS build.

## Install

- **macOS:** `ghcup install hls` (install ghcup via `brew install ghcup` or the official script)
- **Linux:** `ghcup install hls` (ghcup script from https://www.haskell.org/ghcup/)
- **Windows:** `ghcup install hls` (ghcup is installed via the Windows installer / PowerShell bootstrap)

HLS needs a working GHC plus Cabal and/or Stack. Install a matching toolchain first:

```bash
ghcup install ghc
ghcup install cabal
```

Confirm it resolves:

```bash
command -v haskell-language-server-wrapper
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

- `ghcide` (the core HLS engine, standalone) — largely superseded by HLS.
- `hlint` standalone for lint-only checks; `ormolu`/`fourmolu` for formatting.

## Troubleshooting
- **PATH:** `haskell-language-server-wrapper` on PATH; reopen shell after `ghcup install`.
- **GHC mismatch:** the installed HLS must support your project's GHC version — run `ghcup install hls` for that GHC, or align GHC to a supported one.
- **No cradle:** multi-package repos may need a `hie.yaml`; generate one with `gen-hie > hie.yaml`.
- **Slow first load:** HLS compiles dependencies on first open; let it finish indexing.

## Verify

```bash
command -v haskell-language-server-wrapper
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
