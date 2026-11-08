# Java — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `jdtls`
- **Extensions:** `.java`
- **Install hint:** `https://github.com/eclipse-jdtls/eclipse.jdt.ls`

## Install

- **macOS:** `brew install jdtls`
- **Linux:** Download from [eclipse-jdtls/eclipse.jdt.ls](https://github.com/eclipse-jdtls/eclipse.jdt.ls) releases, extract, and wrap the launcher as `jdtls` on PATH (some distros package it as `jdtls`/`jdt-language-server`).
- **Windows:** Download the release archive and add the `jdtls` launcher (`bin/jdtls.bat` or the Python wrapper) to PATH.

Requires a **JDK 17+** to run the language server itself (the project may target an older Java version).

Confirm it resolves:

```bash
command -v jdtls
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

Most settings (runtimes, format, import order) come from `settings.java.*`
defaults and work for Maven/Gradle projects with a standard layout.

## Alternatives

**No mainstream alternative.** `jdtls` (Eclipse JDT Language Server) is the
de-facto standard and powers the official VS Code Java extension.

## Troubleshooting

- **PATH:** `jdtls` on PATH; reopen shell after install.
- **No JDK found:** server exits immediately — set `JAVA_HOME` to a JDK 17+.
- **Slow / no completions at first:** the initial classpath index can take a minute or more on large Maven/Gradle projects; wait for it to finish.
- **Stale state:** delete the jdtls workspace data dir to force a clean re-index if results go wrong after big dependency changes.
- **Build tool required:** keep `pom.xml` / `build.gradle` valid; a broken build descriptor breaks symbol resolution.

## Verify

```bash
command -v jdtls
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
