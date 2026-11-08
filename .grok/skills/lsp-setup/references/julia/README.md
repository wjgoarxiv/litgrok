# Julia — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `julia --startup-file=no --history-file=no -e "using LanguageServer; runserver()"`
- **Extensions:** `.jl`
- **Install hint:** `julia -e 'using Pkg; Pkg.add("LanguageServer")'`

The PATH executable is `julia`; LanguageServer.jl is launched through the `-e` snippet, not as its own binary.

## Install

Install Julia (juliaup recommended), then add the `LanguageServer` package:

- **macOS:** `brew install juliaup && juliaup add release`
- **Linux:** `curl -fsSL https://install.julialang.org | sh` (installs juliaup)
- **Windows:** `winget install julia -s msstore` (installs juliaup)

Then add the package — ideally into a shared `@lsp` environment so it is not tied to one project:

```bash
julia --project=@lsp -e 'using Pkg; Pkg.add("LanguageServer")'
```

Confirm Julia resolves (the LSP binary IS `julia`):

```bash
command -v julia
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

- The VS Code Julia extension bundles the same LanguageServer.jl server.

## Troubleshooting
- **PATH:** `julia` on PATH (not a `julials` binary); reopen shell after juliaup install.
- **First run precompiles — be patient:** the initial launch compiles LanguageServer.jl and may take minutes with no output; do not kill it. Subsequent starts are fast.
- **Package not found:** `LanguageServer` must be installed in the environment the server runs in (e.g. `@lsp`); add it there and set `JULIA_PROJECT`.

## Verify

```bash
command -v julia
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
