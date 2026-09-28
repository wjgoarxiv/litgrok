# Documentation lane contract

Load this contract when a review must compare reader-facing claims, operational commands, limits, and provenance against the implemented product.

## Scope

The documentation lane reads landing pages, localized docs, change history, package metadata, installer help, skill entry points, rules, and tests that lock specific claims. It checks accuracy and operational completeness, not preferred voice or visual taste.

The lane does not rewrite prose. It flags a claim only when code, packaging, documented host behavior, or another authoritative product source contradicts it.

## Contract

Extract concrete claims: version, payload count, install command, default destination, flags, overwrite policy, uninstall behavior, trust requirement, verification steps, runtime support, and blocked surfaces. Map each claim to live product evidence.

Check localized documents for semantic parity on commands, paths, safety policy, and limitations. Wording need not be literal. Ensure source provenance remains attributable and does not imply a live runtime probe that was not performed.

Keep limitations centralized according to the artifact's output-channel contract. In an audit report, meaningful limitations belong in one methodology paragraph rather than being repeated after findings.

## Pass criteria

- Commands and flags match the implemented CLI.
- Payload counts and paths match the package listing.
- Conflict, reinstall, uninstall, and dry-run behavior are accurate.
- Project hooks explain trust requirements.
- Verification steps exercise a real installed surface.
- Runtime and unsupported-surface claims are bounded by evidence.
- Localized docs preserve operational meaning.

## Fail criteria

- Documentation describes an obsolete payload or destination.
- A command cannot reach the named behavior.
- A safety limitation is omitted or contradicted.
- Unsupported plugin, server, hook, or config behavior is claimed.
- Static tests are described as live host execution.
- One language tells users to perform a materially different operation.

## Evidence packet

Return a claim-to-source table, contradictions ordered by user impact, missing operational steps, localization mismatches, and claims whose evidence level is unclear. Cite both the reader-facing text and owning implementation or test.

Do not flag harmless wording differences. For every finding state how a user would be misled and the smallest factual correction.

## Sample assignment

    TASK: Check install and hook-trust claims after payload expansion.
    DELIVERABLE: Claim map for both README languages and installer help.
    SCOPE: Read/list/search only in docs, package metadata, installer, tests.
    VERIFY: Tie counts, destinations, flags, and limitations to live files.
