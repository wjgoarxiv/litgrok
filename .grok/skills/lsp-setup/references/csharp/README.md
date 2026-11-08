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
