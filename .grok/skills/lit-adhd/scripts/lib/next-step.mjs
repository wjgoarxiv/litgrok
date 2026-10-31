// The one next step a lit-adhd brief offers, chosen by a fixed priority over the collected
// records. Other work is counted first. While it is still running, this session is not told to
// resume itself or to continue on `go`. An approval is still offered: that decision is the user's.
//   1. this session's paused frame, and no other work running -> resume (`lit continue`)
//   2. a start-work boundary waiting on the user              -> approve (`lit approve`, not automatic)
//   3. other work still running                               -> none, with `wait`
//   4. this session's own running start-work                  -> continue (`go`)
//   5. one open plan and nothing else running                 -> start-plan (`go`)
//      (with several open, the one plan saved in the last 30 minutes wins)
//   6. otherwise                                              -> none
// `go` re-collects the brief and continues the offered step: no record is written, because the
// model has no documented way to learn its session id and no hook could hand a record back to it.

const JUST_SAVED_MS = 30 * 60_000;

// Another live session, or a herdr agent that is working or blocked and is not this pane.
const busyLanes = (data) => {
  const lanes = new Set((data.sessions ?? [])
    .filter((session) => !session.self && (session.status === "active" || session.status === "waiting-on-user"))
    .map((session) => session.id8));
  for (const [index, agent] of (data.herdr?.agents ?? []).entries()) {
    if (!agent || typeof agent === "string" || agent.self) continue;
    if (agent.status === "working" || agent.status === "blocked") lanes.add(agent.id8 || agent.pane || `herdr-${index}`);
  }
  return lanes.size;
};

const selfId8 = (data, sessionId) => {
  const self = (data.sessions ?? []).find((session) => session.self);
  if (self?.id8) return self.id8;
  return typeof sessionId === "string" ? sessionId.slice(0, 8) : null;
};

const isOwn = (item, sessionId, id8) => Boolean(item) && (item.sessionId === sessionId || item.id8 === id8 || item.id8 === sessionId);

export const chooseNextStep = (data, sessionId) => {
  const lanes = busyLanes(data);
  const id8 = selfId8(data, sessionId);
  const ownPaused = (data.workflows ?? []).find((frame) => frame.status === "paused" && isOwn(frame, sessionId, id8));
  if (sessionId && ownPaused && !lanes) {
    return { kind: "resume-frame", target: { skill: ownPaused.skill, stage: ownPaused.stage }, say: "lit continue" };
  }
  const approval = (data.startWork ?? []).find((work) => work.pendingBoundary);
  if (approval) {
    return {
      kind: "approve-boundary",
      target: { plan: approval.plan, ...approval.pendingBoundary },
      say: "lit approve",
      automatic: false,
    };
  }
  if (lanes) return { kind: "none", target: null, wait: { lanes } };
  const ownRun = (data.startWork ?? []).find((work) => work.status === "active" && sessionId && isOwn(work, sessionId, id8));
  if (ownRun) return { kind: "continue-work", target: { plan: ownRun.plan }, say: "go" };
  const open = data.roadmap.plans.filter((plan) => plan.local && plan.progress.total !== null && plan.progress.done < plan.progress.total);
  const running = (data.workflows ?? []).some((frame) => frame.status === "active" || frame.status === "paused")
    || data.sessions.some((session) => session.status === "active" || session.status === "waiting-on-user");
  if (running) return { kind: "none", target: null };
  const now = Date.parse(data.generatedAt);
  const fresh = open.filter((plan) => plan.changedMs !== null && plan.changedMs !== undefined && now - plan.changedMs <= JUST_SAVED_MS);
  const pick = open.length === 1 ? open[0] : fresh.length === 1 ? fresh[0] : null;
  return pick ? { kind: "start-plan", target: { plan: pick.plan }, say: "go" } : { kind: "none", target: null };
};
