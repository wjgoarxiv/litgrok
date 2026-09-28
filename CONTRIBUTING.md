# Contributing to LitGrok

LitGrok is an independent, dependency-free Node installer and Grok Build payload. Start with a small issue or pull request that explains the observed behavior, expected behavior, and an isolated reproduction. The scoped npm name is a release candidate; use a local checkout for development.

Use Node.js 22, Git, and npm. There is no dependency install or lockfile. Run from the repository root:

```sh
node --check bin/litgrok.mjs
node --check test/skills-and-rules.test.mjs
node .grok/skills/frontend-ui-ux/scripts/verify-canonical-corpus.mjs
npm run check:version
npm test
npm pack --dry-run --json
```

The suite includes package, installer, ownership, hooks, and static documentation checks. Optional scientific tooling may be unavailable; report its explicit skip or degraded result. A local hook fixture does not establish authenticated Grok behavior. Historical installer tests use Git history, so retain a full checkout when running those tests.

For a behavior change, preserve a failing regression and test the corrected path plus a meaningful refusal case. Exercise installations in a disposable project and HOME with separate TMPDIR and npm cache. Interactive writes require a terminal; CI and no-color modes remain no-write previews even with `--yes`. Never use a real user profile as a fixture. Preserve unrelated settings, changed skills, and unsafe destinations; clean only your own temporary resources.

GitHub and npmjs show different READMEs. `README.md` and `README_ko-KR.md` are the GitHub pages and use repository-relative paths. The shorter npm pages live in `docs/npm/` and pin every image and file link to the package version on jsDelivr. `npm pack` swaps them in through the `prepack` and `postpack` scripts and puts the GitHub pages back afterwards. A release that packs or publishes with `--ignore-scripts` skips those scripts, so run `node scripts/readme-for-npm.mjs apply` right before it and `node scripts/readme-for-npm.mjs restore` right after it; run the test suite before `apply`, because the tests read the GitHub pages. `npm run check:npm-readme` checks the npm pages on their own.

Keep npm identity separate from executable aliases and ownership IDs. Do not add dependencies, undocumented host surfaces, or an updater to solve a documentation change. Keep vendor bytes, license notices, accepted artwork, and unrelated changes intact. Product versions and release actions require a separate maintainer decision; CI validates only.

In a pull request, state the trigger and resulting behavior, changed scope, checks with results, unresolved limitations, and cleanup. Remove secrets, transcript excerpts, identifying paths, and credentials from reports. See [security](./SECURITY.md), [privacy](./docs/privacy.md), and the [code of conduct](./CODE_OF_CONDUCT.md).
