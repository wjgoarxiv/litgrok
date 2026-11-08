# Elixir — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `elixir-ls`
- **Extensions:** `.ex .exs`
- **Install hint:** `https://github.com/elixir-lsp/elixir-ls`

## Install

ElixirLS needs Erlang/OTP and Elixir installed first. Build the release from
`https://github.com/elixir-lsp/elixir-ls` and put the `elixir-ls` launcher script on PATH.

- **macOS:** `brew install elixir-ls` (Homebrew provides the launcher), or build the release manually
- **Linux:** clone elixir-ls, run `mix deps.get && mix compile && mix elixir_ls.release2 -o release`, then add `release/` to PATH
- **Windows:** build the release and add the `release` dir (use the `.bat` launcher) to PATH

Confirm it resolves:

```bash
command -v elixir-ls
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

- **lexical**: launch it as `lexical` — fast, modern alternative LSP.
- **next-ls**: launch it as `nextls --stdio` — from the elixir-tools project.

## Troubleshooting
- **PATH:** `elixir-ls` must be on PATH; reopen the shell after install.
- **asdf users:** the launcher is a shim — after `asdf install`, run `asdf reshim elixir` so the `elixir-ls` shim resolves, and ensure the Erlang/Elixir versions match the build.
- **First start is slow:** ElixirLS compiles your deps on first run; initial diagnostics can take a while on large projects.
- **OTP mismatch:** build elixir-ls with the same Erlang/Elixir versions you use for the project to avoid bytecode errors.

## Verify

```bash
command -v elixir-ls
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
