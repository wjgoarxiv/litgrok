# Converge and score

Load this reference when the divergent pass is finished and the ideas need clustering, scoring and a short list. It covers the cluster rules, the scoring table, the short-list card, and two worked cases.

This file is workflow text for Grok Build. Nothing here runs a command or authorizes an action.

## Clustering rules

1. Group by mechanism, meaning how the idea would work, not by subject. Two names for the same app belong together only when they work the same way.
2. Name the cluster with a verb phrase or a short noun phrase for its mechanism ("borrowed harbor vocabulary", "let users vote").
3. Merge ideas with the same mechanism into one entry and write what was merged, so nothing disappears without a trace.
4. Keep a separate outliers group. Do not force a fit.
5. Pick one representative idea per cluster for scoring, the one that shows the mechanism best. Note the runner-up so the user can swap it.
6. A cluster with a single idea stays a cluster. Size is not a measure of value.
7. If one cluster holds more than half of all ideas, the divergent pass was shallow: return to the lenses once before scoring.

## Scoring decision table

Scores run 1 (poor) to 5 (strong) per criterion. A `?` marks a criterion nobody can judge yet.

| Situation | Move | Reason |
|---|---|---|
| A criterion cannot be judged from what is known | Write `?` with the missing fact | A guessed number looks like evidence |
| Two options are within one point | Compare them on the high-weight criteria only | Totals blur close calls |
| One option scores 5 on a high-weight criterion and 1 on another | Keep it and state the trade-off | A spiky option is often the interesting one |
| An option breaks a hard constraint | Drop it with the constraint named | Hard constraints are filters, not scores |
| Two criteria overlap | Merge them and re-score | Double counting tilts the order |
| Every option scores about the same | The criteria are too loose; sharpen one and re-score | Equal scores carry no signal |
| The user's favorite scores low | Show the score and the reason, then ask | Hiding it would steer the pick |
| A score depends on a repository fact | Read the file read-only, then score | Reading beats remembering |
| An idea needs authority the user has not granted | Keep it, label it needs authority, never run it | Ideas stay ideas |
| Fewer than three options survive | Return to a lens that produced outliers | A short list needs a real choice |

## Matrix shape

Use one row per representative idea and one column per criterion, weights in the header:

    | Option | Fit (high) | Cost (medium) | Novelty (low) | Total |
    |---|---|---|---|---|
    | Harbor vocabulary | 4, short | 5, free | 2, common | 11 |
    | User vote | 3, slow | 4, cheap | 5, rare | 12 |

The total orders rows for reading. It never decides. A dash or `?` counts as unscored and the row says so.

## Short list card

Each surviving option gets one card:

- Name and one-sentence description.
- Wins on: the criterion and the score.
- Costs or risks: the main one, in plain words.
- Would have to be true: the assumption the option leans on.
- First cheap test: something a person can do in an afternoon.

Then the wildcard, kept on purpose and marked as such, a line per dropped cluster with its reason, and the recommendation in two sentences.

## Case 1: naming an app

### Input

    lit brainstorm a name for my app. It is a habit tracker for a small team.

### Expected reply excerpt

    Frame: a name a team of five can say in a meeting and spell from memory.
    Criteria: easy to say (high), free domain (medium), fits a team tool (medium).
    22 raw ideas, 6 clusters:
      - Harbor vocabulary (5): Berth, Mooring, Tidewatch ...
      - Streak words (4): Chain, Link ...
      - Outliers (3): ...
    Short list: Berth, Chain, a wildcard (Nobody Reads This).
    Recommendation: Berth. It is short, it scored 5 on easy to say, and the domain is the open question.
    Which one, or which combination?

## Case 2: a direction for onboarding

### Input

    lit ideation: how could new users get to their first win faster?

### Expected reply excerpt

    Frame: fewer steps to the first saved item. Criteria: time to first win (high), build effort (medium), fits the current UI (low).
    The reply lists clusters (remove steps, pre-fill with samples, guided first task, defer sign-up), scores one representative each, marks build effort as `?` where the code was not read, and asks the user to choose.
    After the pick: "pre-fill with samples" is concrete, so the handoff goes to /lit-plan with the criteria and constraints.
