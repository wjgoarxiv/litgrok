// The one next step a lit-adhd brief offers, chosen by a fixed priority over the collected
// records:
//   1. an open plan with no work running            -> start-plan    (`go`)
//      (with several open, the one plan saved in the last 30 minutes wins)
//   2. otherwise                                    -> none
// A paused start-work boundary is shown as the session's waiting reason, never as an automatic
// step: Grok Build has no hook that can consume a typed approval, so the model reads the box.
// `go` re-collects the brief and continues the offered step: no record is written, because the
// model has no documented way to learn its session id and no hook could hand a record back to it.

const JUST_SAVED_MS = 30 * 60_000;

export const chooseNextStep = (data, sessionId) => {
  const open = data.roadmap.plans.filter((plan) => plan.local && plan.progress.total !== null && plan.progress.done < plan.progress.total);
  const running = (data.workflows ?? []).some((frame) => frame.status === "active" || frame.status === "paused")
    || data.sessions.some((session) => session.status === "active" || session.status === "waiting-on-user");
  if (running) return { kind: "none", target: null };
  const now = Date.parse(data.generatedAt);
  const fresh = open.filter((plan) => plan.changedMs !== null && plan.changedMs !== undefined && now - plan.changedMs <= JUST_SAVED_MS);
  const pick = open.length === 1 ? open[0] : fresh.length === 1 ? fresh[0] : null;
  return pick ? { kind: "start-plan", target: { plan: pick.plan }, say: "go" } : { kind: "none", target: null };
};
