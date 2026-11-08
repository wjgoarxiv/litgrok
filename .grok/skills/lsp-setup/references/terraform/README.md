# Terraform — LSP setup (Grok Build / LitGrok)

- **Recommended server:** `terraform-ls serve`
- **Extensions:** `.tf .tfvars`
- **Install hint:** See https://github.com/hashicorp/terraform-ls

## Install

- **macOS:** `brew install hashicorp/tap/terraform-ls`
- **Linux:** download a release from https://github.com/hashicorp/terraform-ls/releases and place `terraform-ls` on PATH (or `apt`/`dnf` via the HashiCorp repo)
- **Windows:** `choco install terraform-ls` (or download a release zip)

`terraform-ls` requires the `terraform` binary itself to be installed and on PATH.

Confirm both resolve:

```bash
command -v terraform-ls
command -v terraform
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

- `tflint` standalone for opinionated linting (complements the LSP).
- `terraform fmt` for formatting.

## Troubleshooting
- **PATH:** `terraform-ls` AND `terraform` both on PATH; reopen shell after install.
- **No provider completion:** run `terraform init` so the `.terraform/` schema cache exists.
- **`.tfvars` not analyzed:** open the containing module so the server has root context.

## Verify

```bash
command -v terraform-ls
```

A resolving executable is the only claim this reference makes. Whether Grok Build's
built-in code-intelligence tool picks the server up is undocumented; confirm tool
visibility inside the session as the `lsp` skill describes, and fall back to the
project's own checks when it is absent.
