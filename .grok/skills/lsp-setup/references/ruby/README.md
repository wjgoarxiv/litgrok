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

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

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
