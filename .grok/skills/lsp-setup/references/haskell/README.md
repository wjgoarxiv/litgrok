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

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

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
