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

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

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
