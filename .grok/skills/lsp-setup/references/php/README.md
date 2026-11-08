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
