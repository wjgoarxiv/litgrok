# C# — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `csharp-ls`
- **Extensions:** `.cs`
- **Install hint:** `dotnet tool install -g csharp-ls`

## Install

Requires the **.NET SDK**. Install the tool globally:

- **macOS:** `dotnet tool install -g csharp-ls`
- **Linux:** `dotnet tool install -g csharp-ls`
- **Windows:** `dotnet tool install -g csharp-ls`

Global .NET tools land in `~/.dotnet/tools` — ensure that directory is on PATH (Windows: `%USERPROFILE%\.dotnet\tools`).

Confirm it resolves:

```bash
command -v csharp-ls
```

## Server settings

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

## Razor / Blazor

Razor and Blazor files use a separate server, `roslyn-language-server --stdio`.

Install it (requires **v5.8.0+**; see [dotnet/razor](https://github.com/dotnet/razor)):

```bash
dotnet tool install -g roslyn-language-server --prerelease
command -v roslyn-language-server
```

## Alternatives

**OmniSharp** — legacy C# language server. Still works but is being superseded by
the Roslyn-based servers; prefer `csharp-ls` / `roslyn-language-server`.

## Troubleshooting

- **PATH:** `csharp-ls` / `roslyn-language-server` on PATH (`~/.dotnet/tools`); reopen shell after install.
- **No .NET SDK:** install the SDK (not just the runtime) before installing the tool.
- **No symbols:** run `dotnet restore`; an unrestored solution yields empty results.
- **Razor needs v5.8.0+:** older `roslyn-language-server` builds lack the `--stdio` Razor support — install with `--prerelease`.

## Verify

```bash
command -v csharp-ls
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
