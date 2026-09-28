# PHP — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `intelephense --stdio`
- **Extensions:** `.php`
- **Install hint:** `npm install -g intelephense`

## Install

Intelephense is a Node package, so Node.js (and npm) must be installed first.

- **macOS:** `npm install -g intelephense`
- **Linux:** `npm install -g intelephense`
- **Windows:** `npm install -g intelephense`

Confirm it resolves:

```bash
command -v intelephense
```

## Server settings

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

## Alternatives

**phpactor** — pure-PHP, no Node dependency. Launch it as
`phpactor language-server`.

## Troubleshooting
- **PATH:** `intelephense` must be on PATH; reopen the shell after a global npm install. If missing, check `npm bin -g` is on PATH.
- **No Node:** Intelephense fails to start without Node.js. Install Node, then reinstall.
- **Wrong PHP version inference:** set `intelephense.environment.phpVersion` (via your editor's init options) to match your project.

## Verify

```bash
command -v intelephense
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
