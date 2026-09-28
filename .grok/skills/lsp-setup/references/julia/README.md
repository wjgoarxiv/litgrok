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

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

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
