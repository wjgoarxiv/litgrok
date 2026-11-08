# Zig — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `zls`
- **Extensions:** `.zig .zon`
- **Install hint:** `https://github.com/zigtools/zls`

## Install

ZLS (the Zig Language Server) must be built against the **same Zig version** you use.
See `https://github.com/zigtools/zls`.

- **macOS:** `brew install zls`
- **Linux:** download a prebuilt release matching your Zig version, or `zig build -Doptimize=ReleaseSafe` from the zls source
- **Windows:** download the matching release from the zls GitHub releases, or build from source

Confirm it resolves:

```bash
command -v zls
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

None.

## Troubleshooting
- **VERSION MATCH (critical):** zls version MUST match your zig version — build/install zls against the exact same Zig. A mismatch causes crashes, parse errors, or silent failures. After upgrading Zig, upgrade/rebuild zls too.
- **PATH:** `zls` must be on PATH; reopen the shell after install.
- **zig not found:** zls invokes `zig` for builds — make sure `zig` itself is also on PATH.

## Verify

```bash
command -v zls
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
