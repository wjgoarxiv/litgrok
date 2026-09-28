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

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

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
