# Swift — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `sourcekit-lsp`
- **Extensions:** `.swift .objc .objcpp`
- **Install hint:** `Included with Xcode or the Swift toolchain`

## Install

`sourcekit-lsp` ships with the Swift toolchain — no separate install.

- **macOS:** `xcode-select --install` (or install full Xcode). It resolves to the active toolchain selected by `xcode-select`.
- **Linux:** Install a swift.org toolchain (`sourcekit-lsp` ships inside it); add the toolchain's `usr/bin` to PATH.
- **Windows:** Install the swift.org Windows toolchain; `sourcekit-lsp` is bundled.

Confirm it resolves:

```bash
command -v sourcekit-lsp
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

**No mainstream alternative.** `sourcekit-lsp` is the official Apple/swift.org
server and the only practical choice.

## Troubleshooting

- **PATH:** `sourcekit-lsp` on PATH; reopen shell after install (or after `xcode-select -s`).
- **Wrong toolchain (macOS):** point `xcode-select` at the right Xcode/toolchain; mismatches cause stale or missing results.
- **No `Package.swift` / compile db:** add a SwiftPM manifest or generate `compile_commands.json` for accurate indexing.
- **Objective-C (`.objc`/`.objcpp`):** needs a compilation database to resolve headers and frameworks.
- **First build slow:** the server builds the module graph on first open; wait for it.

## Verify

```bash
command -v sourcekit-lsp
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
