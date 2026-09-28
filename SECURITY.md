# Security

Treat ownership bypasses, unsafe path handling, unintended command execution, or disclosure of session data as security issues. Do not post credentials, real transcripts, private project paths, or a working exploit against another person's installation in public issues.

Use the repository's private vulnerability reporting option if GitHub displays it. Its availability has not been verified for this release candidate. If it is absent, open a minimal issue asking the maintainers for a private reporting channel, without sensitive details; wait for that channel before sharing them. No private email or response deadline is promised here.

Include the affected package version and installation scope, a minimal synthetic reproduction, expected refusal behavior, and impact. Preserve evidence locally and redact it before sharing. Test only in disposable profiles you own.

LitGrok's installer rejects modified, foreign, and unsafe owned destinations. Hooks require project trust through `/hooks-trust` or `--trust`; installation does not grant it. The hedge guard is fail-open on host errors and cannot be treated as a security sandbox. Grok authentication, model execution, and provider retention are host concerns. [Privacy and local data](./docs/privacy.md) describes the package's own boundaries.

Fixes are evaluated against the current development candidate. This project does not promise maintenance or backports for every historical version. Report an old-version issue with its exact version so maintainers can assess it.
