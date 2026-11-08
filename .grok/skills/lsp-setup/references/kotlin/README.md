# Kotlin — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `kotlin-lsp`
- **Extensions:** `.kt .kts`
- **Install hint:** `https://github.com/Kotlin/kotlin-lsp`

## Install

The official **JetBrains Kotlin LSP** is pre-release. Download a build from the [Kotlin/kotlin-lsp](https://github.com/Kotlin/kotlin-lsp) releases and put the `kotlin-lsp` launcher on PATH.

- **macOS:** Download the release archive, extract, then symlink the launcher: `ln -s /path/to/kotlin-lsp/kotlin-lsp.sh /usr/local/bin/kotlin-lsp`
- **Linux:** Same as macOS — extract the release and place/symlink `kotlin-lsp` on PATH.
- **Windows:** Extract the release and add the directory containing `kotlin-lsp.bat` to PATH (invoke as `kotlin-lsp`).

Requires a **JDK** on the machine to run the server.

Confirm it resolves:

```bash
command -v kotlin-lsp
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

The server resolves classpath from Gradle/Maven; keep the build descriptor
importable.

## Alternatives

**`fwcd/kotlin-language-server`** — older community server. Still usable but less
actively maintained than the official JetBrains one; launch its own launcher
instead if you prefer it.

## Troubleshooting

- **PATH:** `kotlin-lsp` on PATH; reopen shell after install.
- **Pre-release churn:** the JetBrains server is early; pin a known-good release and expect occasional breakage.
- **No JDK:** server fails to start — install a JDK and/or set `JAVA_HOME`.
- **Slow first import:** Gradle resolution on first open can be slow on large projects; let it complete.
- **`.kts` scripts:** build/script files resolve more slowly than `.kt` sources; this is expected.

## Verify

```bash
command -v kotlin-lsp
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
