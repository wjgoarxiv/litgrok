# Rust — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `rust-analyzer`
- **Extensions:** `.rs`
- **Install hint:** `rustup component add rust-analyzer`

## Install

- **macOS:** `rustup component add rust-analyzer` (or `brew install rust-analyzer`)
- **Linux:** `rustup component add rust-analyzer`
- **Windows:** `rustup component add rust-analyzer`

The rustup component is the recommended path — it stays pinned to your toolchain.
`rust-analyzer` also needs the `rust-src` component to index the standard library
(`rustup component add rust-src`).

Confirm it resolves:

```bash
command -v rust-analyzer
```

## Server settings

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

## Alternatives

None — `rust-analyzer` is the official and sole Rust language server.

## Troubleshooting
- **PATH:** `rust-analyzer` must be on PATH; reopen shell after install. The rustup shim lives in `~/.cargo/bin`.
- **Exits while loading rust-src:** if rust-analyzer crashes during stdlib indexing, reinstall the source component:

  ```bash
  rustup component remove rust-src && rustup component add rust-src
  ```

- **No proc-macro / build script support:** ensure the project builds with `cargo check`; rust-analyzer reuses the same toolchain.

## Verify

```bash
command -v rust-analyzer
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
