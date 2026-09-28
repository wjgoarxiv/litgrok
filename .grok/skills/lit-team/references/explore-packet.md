# explore delegation packet

Load this format before assigning codebase mapping, source discovery, dependency tracing, or independent review to Grok Build's explore subagent. This packet is workflow text, not a .grok/agents schema.

## Capability boundary

The documented explore type can read, list, and search. It has no shell and no edits. Its strength is a bounded independent reading whose summary returns to the parent. Do not ask it to run tests, inspect process state through shell, create evidence files, or patch a defect.

Use explore when the answer is discoverable from files and the question can be stated independently. Keep a tiny lookup local. Use separate lanes only when questions differ; duplicating the same scan adds coordination noise rather than confidence.

## Required packet

    TASK: one answerable repository question
    DELIVERABLE: paths, symbols, line references, and a concise conclusion
    SCOPE: exact readable root, exclusions, read/list/search only
    VERIFY: cross-check rules for every claim without shell or edits

TASK should ask for a relationship or fact, not “review everything.” DELIVERABLE should distinguish direct evidence from inference and require unresolved uncertainty. SCOPE must prohibit sibling roots, secrets, generated mirrors, or other protected areas where applicable. VERIFY should require at least two source edges when the conclusion depends on reachability.

## Worked packet

    TASK: Determine whether every passive hook wrapper delegates event validation
    to the shared recorder and whether any wrapper supplies an undocumented field.

    DELIVERABLE: A table of hook config, wrapper script, expected event, shared
    helper call, and any exception. Include repository-relative paths and line
    references. Distinguish source evidence from inference.

    SCOPE: Read, list, and search only under .grok/hooks/ and the hook tests.
    Do not open sibling products, run shell commands, edit files, or inspect
    session ledgers outside fixtures.

    VERIFY: Trace each passive JSON command path to its executable wrapper and
    from each wrapper to recordPassiveEvent. Cross-check event names against the
    local documented-event test. Return unresolved mismatches explicitly.

    RETURN FORMAT: INVENTORY / FINDINGS / UNCERTAINTIES / FILES READ.

This works because explore can answer every part using its documented capabilities, while the parent retains runtime driving.

## Invalid packet

    TASK: Explore the hooks and fix any problems.
    DELIVERABLE: Passing tests.
    SCOPE: anything relevant.
    VERIFY: npm test.

It is invalid because explore cannot edit or run shell, the question is unbounded, path scope is missing, and verification requires a capability the type does not have. Changing the type after launch would hide the packet error.

## Evidence quality

Require exact paths and symbols. A search hit is a lead, not proof. The lane should read surrounding context, follow imports or command paths, and state which edge is directly supported. When a negative conclusion depends on exhaustive enumeration, require the enumeration method and root.

The lane must not claim runtime activation from source. It can show a hook config names a command and a test covers its path; only a driver or live host event can establish execution.

For review lanes, require concrete adverse effect before calling something a finding. Style preferences and unverified risks remain suggestions or questions. The parent owns severity and cross-lane deduplication.

## Parallel lane design

Good independent questions include behavior path, test assertion map, safety boundary, integration reachability, documentation accuracy, and regression consumers. Each has a different evidence target. Do not ask all lanes to summarize the same diff.

Two explore lanes may read the same file when their questions differ, but their packets must name the distinction. If conclusions conflict, the parent inspects primary evidence rather than voting.

## Parent acceptance

The parent verifies load-bearing file references, resolves conflicts, and runs any required commands. Reject a result that lacks scope, confuses inference with evidence, claims execution, or omits uncertainty. Do not turn an explore summary into a modified file automatically.

## Return packet

A complete return includes question answered, files read, paths and line references, direct evidence, inference, confirmed findings, rejected concerns, uncertainty, and any protected or unavailable surface. Changed paths must be none.
