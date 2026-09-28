# Repository facts and readable assembly

Read the actual manifest, README, license, executable entry points and relevant docs. For each claim retain an id, exact draft text and repository-relative source paths in the facts ledger. Keep unknown claims out of promotional prose. A private fixture is not a published product. Do not infer platform support, coverage, popularity, affiliations or benchmark results.

Bind README_SKILL_ROOT to the absolute selected SKILL.md parent, README_PROJECT_ROOT to the inspected repository and README_FACTS_FILE to the ledger. From any cwd run:

```sh
node "$README_SKILL_ROOT/scripts/validate-facts.mjs" --root "$README_PROJECT_ROOT" --facts "$README_FACTS_FILE"
```

The report says validation_scope=structure-only, factual_accuracy=not-checked, source_contents_compared=false and badge_truth_checked=false. It verifies bounded regular source files, relative containment, no symlinks, unique claim ids and HTTP(S) badge URLs without credentials. It does not compare source text or fetch endpoints. Even a wrong factual claim may pass structural validation. Read and compare every source yourself, verify badge endpoints when allowed, otherwise omit the badge.

Compose a distinctive cover, compact relevant badges/logo row if verified, concise purpose, immediately visible quick start, concrete features/demo, useful navigation, docs/support/contribution/license links where they exist. Preserve accurate existing anchors/content. Alignment is a choice; prefer restrained emoji. Supply semantic equivalents for any artwork text, and never bake install commands into an image.

Use local asset paths in the task README and templates/picture.md for responsive preview/static fallback. Keep GitHub and npm URL plans separate, with public checks pending. No preview upload or release is part of this workflow.
