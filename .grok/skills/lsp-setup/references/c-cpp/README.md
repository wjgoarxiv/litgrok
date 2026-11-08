# C / C++ — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `clangd --background-index --clang-tidy`
- **Extensions:** `.c .cpp .cc .cxx .c++ .h .hpp .hh .hxx .h++`
- **Install hint:** `https://clangd.llvm.org/installation`

## Install

- **macOS:** `brew install llvm` (clangd ships in the LLVM keg; add its `bin` to PATH)
- **Linux:** `apt install clangd` (Debian/Ubuntu); use your distro package elsewhere
- **Windows:** install LLVM from `https://releases.llvm.org` or `winget install LLVM.LLVM`

See `https://clangd.llvm.org/installation` for other platforms.

Confirm it resolves:

```bash
command -v clangd
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

## Compile commands

clangd needs a `compile_commands.json` at the project root (or in `build/`) for
accurate diagnostics and cross-file navigation. Generate it with:

- **CMake:** `cmake -B build -DCMAKE_EXPORT_COMPILE_COMMANDS=ON` (symlink/copy `build/compile_commands.json` to the root)
- **Make / other:** `bear -- make`

Without it, clangd falls back to heuristic flags and reports spurious errors.

## Alternatives

`ccls` exists as a third-party server — launch it as `ccls` if you prefer it.

## Troubleshooting
- **PATH:** `clangd` must be on PATH; reopen shell after install. Homebrew LLVM is keg-only — add `$(brew --prefix llvm)/bin` to PATH.
- **Spurious "file not found" / unknown flags:** missing or stale `compile_commands.json` — regenerate it after changing the build.
- **Header-only diagnostics wrong:** ensure the header's translation unit appears in the compile database, or add a `.clangd` `CompileFlags` block.

## Verify

```bash
command -v clangd
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
