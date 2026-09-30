# Privacy and local data

This describes package source behavior, not Grok or a model provider's privacy policy. The dependency-free installer in `bin/litgrok.mjs` copies and checks local files and contains no direct network or telemetry client. Fetching the package through npm is separate network activity. The installation receipt records package/version, relative payload paths, and SHA-256 hashes.

Passive hooks in `.grok/hooks/record-passive-event.mjs` read hook JSON and record session identity, cwd/workspace paths, event names and time, optional prompt IDs, and tool names with input digests. They inspect optional prompt text for planning activation without persisting raw prompt/tool input in those passive records. Hashed filenames do not anonymize the JSON: records retain the session ID. The hedge guard examines proposed paths and content; Stop may record a plan-gate reason.

Automatic handoff is off by default. When you turn it on, `litgrok auto-handoff` writes `.grok/litgrok/auto-handoff.json` in the project with the on/off choice and your percent. While it is on, the status-line command also writes one small record per session, `context-<hash>.json`, to the temporary `litgrok-hud` folder described in the reference, holding the session ID, Grok's reported context percent, Grok's own compaction percent and a timestamp. The Stop hook then adds `auto-handoff-directive` and `auto-handoff-reload` entries (percent, outcome and a relative path) to the session ledger. It reads a handoff file only to show a short excerpt to the model after you compact, and only when that file carries this session's marker.

Project `.grok/litgrok/` contains package-owned session ledgers and may contain other generated data from installed or older package versions. Older skill-review state is no longer read, migrated, rewritten, or deleted by LitGrok; it remains inert for the owner to manage.

Optional helpers may invoke Grok or external scientific tools; their behavior and dependencies remain separate. No blanket claim that all package-guided work stays offline is made.

Generated learning/session state has no automatic expiry guarantee. Installer uninstall removes owned payload and its receipt, preserving unrelated settings and generated state. Inspect and back up your own state before deleting it manually: removing snapshots or ledgers can remove rollback evidence. Never include real session state, prompts, secrets, or identifying paths in public reports. See [security reporting](../SECURITY.md).
