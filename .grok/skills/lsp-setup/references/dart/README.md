# Dart — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `dart language-server --lsp`
- **Extensions:** `.dart`
- **Install hint:** `Included with the Dart/Flutter SDK`

## Install

The language server ships inside the Dart SDK (and the Flutter SDK, which bundles Dart). There is no separate package to install — just put `dart` (or `flutter`) on PATH.

- **macOS:** `brew install dart` (or install Flutter and use its bundled `dart`)
- **Linux:** install the Dart SDK from your package manager / `https://dart.dev/get-dart`, or install Flutter
- **Windows:** install the Dart SDK or Flutter SDK and add its `bin` to PATH

Confirm it resolves:

```bash
command -v dart
```

## Server settings

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

## Alternatives

None.

## Troubleshooting
- **PATH:** `dart` must be on PATH; reopen the shell after installing the SDK. Flutter users: ensure `<flutter>/bin/cache/dart-sdk/bin` or the Flutter `bin` is exported.
- **Flutter vs Dart:** if you only have Flutter installed, the bundled `dart` works — make sure Flutter's `bin` is on PATH rather than relying on a separate Dart install.
- **SDK out of date:** run `dart --version` / `flutter upgrade` if analysis behaves oddly on newer language features.

## Verify

```bash
command -v dart
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
