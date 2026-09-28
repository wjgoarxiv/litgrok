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

Grok Build documents no project language-server schema, and LitGrok ships no server
configuration: the only documented code-intelligence surface is the built-in tool
behind `GROK_LSP_TOOLS=1` / `[features] lsp_tools`, which is off by default (see the
`lsp` skill). Installing the server binary on PATH is the whole setup this reference
can vouch for. Do not add a server entry to `.grok/config.toml`; that key is not a
documented Grok Build surface.

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
