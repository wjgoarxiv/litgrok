# Ruby — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `rubocop --lsp`
- **Extensions:** `.rb .rake .gemspec .ru`
- **Install hint:** `gem install rubocop`

> **Note:** the executable invoked is **`rubocop`** (`rubocop --lsp`). RuboCop must be installed: `gem install rubocop`.

## Install

- **macOS:** `gem install rubocop`
- **Linux:** `gem install rubocop`
- **Windows:** `gem install rubocop`

In a Bundler project, prefer adding `rubocop` to the `Gemfile` and running via `bundle exec`.

Confirm it resolves (check `rubocop`, since that is what runs):

```bash
command -v rubocop
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

- **Shopify `ruby-lsp`** — the standalone `ruby-lsp` executable, richer navigation than RuboCop alone. launch it as `ruby-lsp`.
- **`solargraph`** — older completion/type server; install with `gem install solargraph`, launch it as `solargraph stdio`.

## Troubleshooting

- **PATH:** `rubocop` on PATH (that is the invoked binary); reopen shell after install.
- **`rubocop` not found:** install RuboCop with `gem install rubocop`.
- **Bundler mismatch:** if the project pins RuboCop in its `Gemfile`, run inside the bundle so versions match.
- **No diagnostics:** check `.rubocop.yml` is valid and not disabling everything.

## Verify

```bash
command -v rubocop
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
