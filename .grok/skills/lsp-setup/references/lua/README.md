# Lua — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `lua-language-server`
- **Extensions:** `.lua`
- **Install hint:** `https://github.com/LuaLS/lua-language-server`

## Install

See `https://github.com/LuaLS/lua-language-server`.

- **macOS:** `brew install lua-language-server`
- **Linux:** download a release from GitHub, or `pacman -S lua-language-server` (Arch) / AUR
- **Windows:** download a release from the GitHub releases page and add its `bin` to PATH

Confirm it resolves:

```bash
command -v lua-language-server
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
- **PATH:** `lua-language-server` must be on PATH; reopen the shell after install.
- **Undefined `vim` global:** add `vim` to `diagnostics.globals` and set `workspace.library` in `.luarc.json` (see above) for Neovim work.
- **Wrong runtime version:** set `runtime.version` (`LuaJIT`, `Lua 5.4`, etc.) to match your interpreter, or stdlib functions report as undefined.

## Verify

```bash
command -v lua-language-server
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
