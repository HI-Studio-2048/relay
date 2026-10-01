/**
 * Live Chat team report: who answered, how many conversations each handled, and how long people
 * waited for a human. Pure so it is testable; feed it a bot's messages oldest first.
 */
export type ReportMessage = {
  contactId: string;
  direction: string;
  source: string;
  author: string | null;
  createdAt: Date;
  body?: string;
};

import { scoreFromBody } from "@/lib/csat";

export type AgentStats = {
  name: string;
  replies: number;
  conversations: number;
  medianResponseMs: number | null;
  /** Share of CSAT ratings that were "Great", or null without ratings. */
  csat: number | null;
  ratings: number;
};

export type TeamReport = {
  agents: AgentStats[];
  humanReplies: number;
  automatedReplies: number;
  /** Median wait from a person's first unanswered message to a teammate's reply. */
  medianResponseMs: number | null;
  csat: number | null;
  ratings: number;
};

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function share(scores: number[]) {
  return scores.length ? scores.filter((score) => score === 3).length / scores.length : null;
}

export function buildTeamReport(rows: ReportMessage[]): TeamReport {
  const waitingSince = new Map<string, number>();
  const byAgent = new Map<string, { replies: number; contacts: Set<string>; waits: number[]; scores: number[] }>();
  const lastAgent = new Map<string, string>();
  const allScores: number[] = [];
  const allWaits: number[] = [];
  let humanReplies = 0;
  let automatedReplies = 0;
  for (const row of rows) {
    const at = row.createdAt.getTime();
    if (row.direction === "inbound") {
      const score = row.body ? scoreFromBody(row.body) : null;
      if (score !== null) {
        // A rating is feedback, not a question waiting for an answer.
        allScores.push(score);
        const agent = byAgent.get(lastAgent.get(row.contactId) ?? "");
        if (agent) agent.scores.push(score);
        continue;
      }
      if (!waitingSince.has(row.contactId)) waitingSince.set(row.contactId, at);
      continue;
    }
    if (row.source === "broadcast") continue;
    const since = waitingSince.get(row.contactId);
    waitingSince.delete(row.contactId);
    if (row.source !== "agent") {
      automatedReplies += 1;
      continue;
    }
    humanReplies += 1;
    const name = row.author?.trim() || "Team";
    const agent = byAgent.get(name) ?? { replies: 0, contacts: new Set<string>(), waits: [], scores: [] };
    lastAgent.set(row.contactId, name);
    agent.replies += 1;
    agent.contacts.add(row.contactId);
    if (since !== undefined) {
      agent.waits.push(at - since);
      allWaits.push(at - since);
    }
    byAgent.set(name, agent);
  }
  return {
    agents: [...byAgent.entries()]
      .map(([name, agent]) => ({
        name,
        replies: agent.replies,
        conversations: agent.contacts.size,
        medianResponseMs: median(agent.waits),
        csat: share(agent.scores),
        ratings: agent.scores.length,
      }))
      .sort((a, b) => b.replies - a.replies),
    humanReplies,
    automatedReplies,
    medianResponseMs: median(allWaits),
    csat: share(allScores),
    ratings: allScores.length,
  };
}

export function formatDuration(ms: number | null) {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
