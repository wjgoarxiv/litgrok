# Integration lane contract

Load this contract when a review must prove that source changes are registered, packaged, installed, configured, and discoverable through Grok Build's documented surfaces.

## Scope

The integration lane follows one product-owned feature from source to registry or config, package allowlist, installer copy path, destination, and user-visible discovery or verification command. It reads manifests, package metadata, installer code, tests, and operational docs.

It does not invent a host schema or count source presence as enrollment. If Grok Build does not document a surface, absence can be correct product behavior.

## Contract

Build a reachability chain with no skipped edge:

    source -> product enrollment -> packed payload -> installed destination
           -> documented host discovery -> user verification

For a skill, inspect frontmatter, package inclusion, installation under a documented skill directory, and invocation/discovery claims. For a hook, inspect nested event schema, command path, executable bit, pack/install path, project trust requirement, and event-shaped driver. For rules, inspect supported filenames and loading precedence.

Treat dry pack, synthetic install, real temporary install, and live host activation as distinct evidence levels.

## Pass criteria

- Every shipped path is included by package metadata.
- Installer discovery covers nested references and command scripts.
- Config paths resolve inside the installed tree.
- User docs name actual destinations and verification steps.
- Required project trust or feature switch is visible.
- Unsupported surfaces remain absent with a documented reason.

## Fail criteria

- Source exists but no package or installer path reaches it.
- A config names a missing or non-executable command.
- Documentation claims discovery at an undocumented location.
- A reference exists but its entry point never routes to it.
- A synthetic fixture is presented as a real package install.
- Live-host behavior is claimed from static validation alone.

## Evidence packet

Return the complete reachability chain, exact paths at every edge, structured pack/install evidence supplied by the parent, documented host anchor, verification command, and any missing edge. Classify evidence as source, static contract, packed, installed, or live.

If the primary host documentation does not define a requested schema, report that as a supported blocked surface. Do not recommend a guessed config simply to complete the chain.

## Sample assignment

    TASK: Trace a new skill reference from source to installed project tree.
    DELIVERABLE: Reachability chain and any orphaned-path finding.
    SCOPE: Read/list/search only in skill, package metadata, installer, and tests.
    VERIFY: Cite entry link, files allowlist, tree walk, and temp-install assertion.
