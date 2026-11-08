# TypeScript / JavaScript — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `typescript-language-server --stdio`
- **Extensions:** `.ts .tsx .js .jsx .mjs .cjs .mts .cts`
- **Install hint:** `npm install -g typescript-language-server typescript@6`

## Install

- **macOS:** `npm install -g typescript-language-server typescript@6`
- **Linux:** `npm install -g typescript-language-server typescript@6`
- **Windows:** `npm install -g typescript-language-server typescript@6` (PowerShell or cmd)

`typescript-language-server` is only a thin wrapper — it needs the `typescript`
package (`tsserver`) present too, either globally or in the project's
`node_modules`. Always install both. Pin `typescript@6`: TypeScript 7 ships no
`lib/tsserver.js`, which `typescript-language-server` loads.

Confirm it resolves:

```bash
command -v typescript-language-server
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

Swap the server for your toolchain. The first column is the string `command` and the second is `args`; do not paste a launch as a JSON array into `command`. Each row owns the extensions named in its description:

| command | args | when to choose |
| --- | --- | --- |
| `deno` | `lsp` | Deno projects (handles `.ts/.tsx/.js`) |
| `biome` | `lsp-proxy`, `--stdio` | Biome lint/format as the LSP |
| `vscode-eslint-language-server` | `--stdio` | ESLint diagnostics |
| `oxlint` | `--lsp` | fast Oxc-based linting |
| `vue-language-server` | `--stdio` | `.vue` single-file components |
| `svelteserver` | `--stdio` | `.svelte` files |
| `astro-ls` | `--stdio` | `.astro` files |

`eslint` install: `npm i -g vscode-langservers-extracted`. To run Deno instead
of the default, launch `deno lsp` in place of `typescript-language-server --stdio`.

## Troubleshooting
- **PATH:** `typescript-language-server` must be on PATH; reopen the shell after `npm install -g typescript-language-server typescript@6`. Check your global bin with `npm bin -g`.
- **Missing tsserver:** errors like "Could not find tsserver" mean the `typescript` package is absent — install `typescript@6` globally or in the project. TypeScript 7 ships no `lib/tsserver.js`.

## Verify

```bash
command -v typescript-language-server
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
