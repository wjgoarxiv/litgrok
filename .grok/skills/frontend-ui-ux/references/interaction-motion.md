Every interactive surface must answer three questions: what can be done here, what is happening
now, what just happened. Settle all three in `inventory.interactions` and `inventory.states`
first.

## State inventory

List the states each element can occupy. A state nobody listed is a state nobody built.

- default, hover, active, focus-visible, disabled, read-only
- selected, expanded, current, checked, indeterminate
- loading, optimistic, retrying, succeeded, failed
- empty, partial, truncated, overflowing, stale

Each maps to one contract state kind: `loading`, `empty`, `error`, `success`, `disabled`,
`permission`, `offline`, `ready`.

## Feedback proportional to consequence

Weigh the response against what the action costs to undo. Cheap actions stay quiet.

| Consequence | Required feedback |
|---|---|
| Reversible, local | Immediate change, no confirmation step |
| Reversible, remote | Inline pending state plus undo for 5-10s |
| Longer than 1s | Progress in place; skeleton only where layout is known |
| Irreversible | Confirmation naming object and effect; typed name for bulk delete |
| Failed | Persistent inline error, input preserved, retry within reach |

## Input and validation timing

Validate when the user can act on the answer, not while it is still being typed.

- one field: validate on blur; cross-field rules: validate on submit
- once a field has failed, revalidate on input so the error clears
- debounce remote checks at 300-500ms and cancel superseded requests

## Focus rules

Focus is application state. Move it on purpose and put it back exactly.

1. On open, focus the first meaningful control, not the container.
2. Contain focus in a modal surface; `Escape` closes unless it discards data silently.
3. On dismissal, return focus to the opener; if it is gone, focus its nearest surviving
   ancestor, never `body`.
4. After deleting a row, focus the next row, or the list when none remains.
5. On route change, focus the new `h1` or the skip target.

## Gestures and their keyboard equivalents

Treat a gesture as an accelerator over a control that already exists. A touch-only path is a
defect.

- swipe to dismiss requires a close control
- drag to reorder requires up and down controls or a position field
- pull to refresh requires a refresh control

## The motion test

Answer all three before adding motion. One "no" removes it.

1. Which relationship does it explain: origin, continuity, hierarchy, or outcome?
2. Does removing it lose information rather than polish?
3. Does it finish within 400ms, with completion never waiting on it?

## Choreography and sequencing

Sequence movement to direct attention. Specify trigger, property, duration, easing, interruption.

- 100-150ms direct feedback, 200-300ms entry and exit, 300-400ms layout change
- stagger 20-40ms per item, capped at five; the remainder arrive together
- animate `transform` and `opacity` only, and never queue a transition

## Reduced motion without lost meaning

Under `prefers-reduced-motion: reduce`, keep the information and drop the travel.

- replace slide and scale with a 100ms opacity change or an instant swap
- keep progress indicators; make them determinate or a static pending label
- the reduced path still shows every confirmation and result announcement

## The record handed to review

Give the independent review pass one entry per interaction, keyed to the design contract hash.
Anything missing counts as untested.

- trigger and target element with its accessible name
- every state, with its visual and its announced change
- keyboard sequence: keys, focus after each, exit path
- async contract: pending threshold, timeout, error text, retry
- motion: property, duration, easing, interruption, reduced path
- evidence: route, viewport, state, and how the state was reached
