#!/usr/bin/env node
// The cost line of the ultra-brainstorm launch question: idea agents, one reducer per 30 of them and one
// judge, as a low-high token range. The per-agent figures come from a real 100-agent run on Grok Build
// 1.0.13 (2026-11-18): each idea agent carries the host's own first-turn prompt, so it used about 21k
// tokens (20k-48k, a few calls retried), a reducer 36k-64k and the judge 46k; 2.75M in all. It is a
// planning figure; Grok Build's own usage view is the real number. One workflow run admits at most 1,024 agent calls, so the idea count stops
// at 950 to leave the reducers and the judge their slots.
// Usage: node estimate.mjs <agents> [--json]   |   node estimate.mjs --answer < reply.txt (the reply only ever on stdin)
import { pathToFileURL } from "node:url";

export const MODELS = Object.freeze({ idea: "grok-4.7-build-fast", reduce: "grok-4.6", judge: "grok-4.7" });
export const IDEA_TOKENS = Object.freeze({ low: 20_000, high: 26_000 });
export const REDUCER_TOKENS = Object.freeze({ low: 35_000, high: 65_000 });
export const JUDGE_TOKENS = Object.freeze({ low: 45_000, high: 50_000 });
export const PER_REDUCER = 30;
export const MAX_AGENTS = 950;
export const RUN_CAP = 1_024;

export const estimate = (agents) => {
  if (!Number.isInteger(agents) || agents < 1) throw new Error("the agent count must be a positive whole number");
  if (agents > MAX_AGENTS) throw new Error(`one run takes at most ${MAX_AGENTS} idea agents; split a larger run`);
  const reducers = Math.ceil(agents / PER_REDUCER);
  const sum = (end) => agents * IDEA_TOKENS[end] + reducers * REDUCER_TOKENS[end] + JUDGE_TOKENS[end];
  return { agents, reducers, judges: 1, agentBudget: agents + reducers + 1, low: sum("low"), high: sum("high") };
};

export const costLine = (agents, models = MODELS) => {
  const { reducers, agentBudget, low, high } = estimate(agents);
  const millions = (tokens) => (tokens / 1_000_000).toFixed(1);
  return `${agents} idea agents (${models.idea}, low) + ${reducers} reducers (${models.reduce}) + 1 judge (${models.judge}) ≈ ${millions(low)}-${millions(high)}M tokens, one workflow run of ${agentBudget} agents`;
};

const STOP_WORDS = new Set(["no", "cancel", "stop", "아니", "아니요", "취소"]);

// The user's reply to the launch question: a typed number, or the full label of the picked option as the
// ask dialog hands it back (`100 (recommended minimum)`, `300명 (Recommended)`). One count runs; two counts
// or none ask again; empty or a stop word ends the skill; a count above the cap offers a split.
export const launchAnswer = (reply) => {
  const text = String(reply ?? "").trim();
  if (text === "" || STOP_WORDS.has(text.toLowerCase().replace(/[.!。]+$/u, ""))) return { kind: "stop" };
  const counts = [...new Set([...text.matchAll(/\d{1,3}(?:,\d{3})+|\d+/gu)].map((match) => Number(match[0].replaceAll(",", ""))))];
  if (counts.length !== 1 || counts[0] < 1) return { kind: "ask" };
  return counts[0] > MAX_AGENTS ? { kind: "split", agents: counts[0] } : { kind: "run", agents: counts[0] };
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [raw, flag] = process.argv.slice(2);
  if (raw === "--answer" && process.argv.length > 3) {
    process.stderr.write("estimate: --answer takes the reply on stdin only, never as an argument\n");
    process.exitCode = 64;
  } else if (raw === "--answer") {
    const { readFileSync } = await import("node:fs");
    process.stdout.write(`${JSON.stringify(launchAnswer(readFileSync(0, "utf8")))}\n`);
  } else {
    try {
      const agents = Number(raw);
      process.stdout.write(`${flag === "--json" ? JSON.stringify(estimate(agents)) : costLine(agents)}\n`);
    } catch (error) {
      process.stderr.write(`estimate: ${error.message}\n`);
      process.exitCode = 64;
    }
  }
}
