# YAML — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `yaml-language-server --stdio`
- **Extensions:** `.yaml .yml`
- **Install hint:** `npm install -g yaml-language-server`

## Install

- **macOS:** `npm install -g yaml-language-server`
- **Linux:** `npm install -g yaml-language-server`
- **Windows:** `npm install -g yaml-language-server` (PowerShell)

Confirm it resolves:

```bash
command -v yaml-language-server
```

## Server settings

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

## Alternatives

- `redhat.vscode-yaml` bundles the same server in editors.
- `yamllint` standalone for style/lint-only checks.

## Troubleshooting
- **PATH:** `yaml-language-server` on PATH; reopen shell after `npm -g` install.
- **No validation:** no schema matched — add a `$schema` modeline or a `yaml.schemas` mapping in your editor's init options.
- **Wrong schema applied:** SchemaStore guessed by filename; pin explicitly with a modeline.

## Verify

```bash
command -v yaml-language-server
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
