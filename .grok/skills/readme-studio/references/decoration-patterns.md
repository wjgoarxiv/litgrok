# README decoration patterns

## Inspection record

Inspected public GitHub repository pages and their README content on **2026-09-21**. Star counts below are transient observations from that date, not quality measures or current counts. Patterns are summarized from inspection; no prose or assets are copied.

| Repository | Observed stars | Observed decoration |
| --- | ---: | --- |
| [Best-README-Template](https://github.com/othneildrew/Best-README-Template) | 16.4k (transient) | Centered logo/title/description and demo links, a distinct badge row, table of contents, built-with logos, and contributor imagery. Its example destinations include placeholders that must be replaced and checked before use. |
| [guodongxiaren/README](https://github.com/guodongxiaren/README) | 7.1k (transient) | Teaches GitHub README features with badges, `<details>`/`<summary>`, and HTML alignment around Markdown content. |
| [assimp/assimp](https://github.com/assimp/assimp) | 13.2k (transient) | Uses section navigation, project activity and star-history graphics, plus contributor imagery. |
| [mermaid-js/mermaid](https://github.com/mermaid-js/mermaid) | 90.3k (transient) | Opens with a compact emoji-marked link row, a product image/demo, and a contents list with clear section labels. |
| [joaomlourenco/novathesis](https://github.com/joaomlourenco/novathesis) | 1.0k (transient; supplemental) | Pairs a logo and short hero with documentation/help links, a linked showcase, star-history imagery, and contributor imagery. |

## Decoration choices

- **Emoji section headers:** use one meaningful emoji as a scan cue for major sections; keep the heading words explicit so meaning survives unsupported emoji rendering.
- **Centered hero:** center a real project logo or wordmark, the verified project name, one concise source-backed purpose, and at most a few useful demo/documentation links. Keep the essential title and summary as normal Markdown too.
- **Badge and logo row:** keep badges in a separate, visually quiet row below the hero. Use a local, repository-owned logo asset or a verified endpoint. Each badge must target a real endpoint for this repository and be checked against the claim ledger; omit any badge with an unknown endpoint or status.
- **Section iconography:** repeat the same small set of semantic icons for navigation, installation, features, support, and contribution. Avoid using icons as the only label.
- **Collapsible details:** use `<details><summary>` only for optional long material such as exhaustive options or implementation notes. Put quick start, key limitations, and other essential facts outside collapsed content.
- **Contributors, star history, and showcases:** use an external contributor image, star-history chart, or showcase only when the exact repository identity, endpoint, availability, and displayed claim are verified. Treat generated activity images as transient. Provide normal text links and a concise Markdown fallback so blocked remote images do not remove the information.
- **Table-based feature grid:** use a compact Markdown table for a small set of source-backed capabilities, with short labels and concise descriptions. Avoid wide tables that fail at narrow viewports; switch to a short list when cells wrap poorly.
- **Footer navigation:** end with a small set of verified links for documentation, support, contributing, license, and repository navigation. Omit destinations that do not exist.
- **Plain-Markdown fallback:** HTML centering and `<details>` are optional decoration. Keep the project name, purpose, links, feature facts, quick start, and important caveats in ordinary Markdown. A renderer that strips HTML must still leave a complete and readable README.

## Facts and endpoint gate

Decoration changes presentation, not truth. Build repository-backed facts from sources recorded in the facts ledger. Verify every badge and embedded image URL, repository name, and displayed status against a live endpoint or the checked-in asset before including it. Never infer CI, release, coverage, stars, contributors, support, or compatibility from a template. Replace all template placeholders; if a claim or endpoint cannot be verified, omit it.
