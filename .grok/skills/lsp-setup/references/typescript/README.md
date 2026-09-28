# TypeScript / JavaScript — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `typescript-language-server --stdio`
- **Extensions:** `.ts .tsx .js .jsx .mjs .cjs .mts .cts`
- **Install hint:** `npm install -g typescript-language-server typescript`

## Install

- **macOS:** `npm install -g typescript-language-server typescript`
- **Linux:** `npm install -g typescript-language-server typescript`
- **Windows:** `npm install -g typescript-language-server typescript` (PowerShell or cmd)

`typescript-language-server` is only a thin wrapper — it needs the `typescript`
package (`tsserver`) present too, either globally or in the project's
`node_modules`. Always install both.

Confirm it resolves:

```bash
command -v typescript-language-server
```

## Server settings

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

## Alternatives

Swap the server launch for your toolchain; each row owns the extensions named in
its description:

| server launch                             | when to choose                          |
| ----------------------------------------- | --------------------------------------- |
| `["deno", "lsp"]`                         | Deno projects (handles `.ts/.tsx/.js`)  |
| `["biome", "lsp-proxy", "--stdio"]`       | Biome lint/format as the LSP            |
| `["vscode-eslint-language-server", "--stdio"]` | ESLint diagnostics                 |
| `["oxlint", "--lsp"]`                     | fast Oxc-based linting                  |
| `["vue-language-server", "--stdio"]`      | `.vue` single-file components           |
| `["svelteserver", "--stdio"]`             | `.svelte` files                         |
| `["astro-ls", "--stdio"]`                 | `.astro` files                          |

`eslint` install: `npm i -g vscode-langservers-extracted`. To run Deno instead
of the default, launch `deno lsp` in place of `typescript-language-server --stdio`.

## Troubleshooting
- **PATH:** `typescript-language-server` must be on PATH; reopen shell after `npm i -g`. Check your global bin with `npm bin -g`.
- **Missing tsserver:** errors like "Could not find tsserver" mean the `typescript` package is absent — install it globally or in the project.

## Verify

```bash
command -v typescript-language-server
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
