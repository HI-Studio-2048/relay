import { describe, expect, it } from "vitest";
import { buildTeamReport, formatDuration, type ReportMessage } from "@/lib/team-report";

const t = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 9, minutes));
const msg = (contactId: string, minutes: number, direction: string, source: string, author: string | null = null): ReportMessage => ({
  contactId,
  direction,
  source,
  author,
  createdAt: t(minutes),
});

describe("team report", () => {
  it("measures first response per teammate and skips bot-answered waits", () => {
    const report = buildTeamReport([
      msg("a", 0, "inbound", "user"),
      msg("a", 2, "inbound", "user"),
      msg("a", 10, "outbound", "agent", "Maya"), // waited 10m from the first unanswered message
      msg("a", 11, "outbound", "agent", "Maya"), // follow-up, no wait
      msg("b", 0, "inbound", "user"),
      msg("b", 1, "outbound", "flow"), // the bot answered
      msg("b", 30, "outbound", "agent", "Jordan"),
      msg("c", 0, "inbound", "user"),
      msg("c", 4, "outbound", "agent", "Jordan"),
      msg("c", 5, "outbound", "broadcast"),
    ]);
    expect(report.humanReplies).toBe(4);
    expect(report.automatedReplies).toBe(1);
    expect(report.agents).toEqual([
      { name: "Maya", replies: 2, conversations: 1, medianResponseMs: 10 * 60000, csat: null, ratings: 0 },
      { name: "Jordan", replies: 2, conversations: 2, medianResponseMs: 4 * 60000, csat: null, ratings: 0 },
    ]);
    expect(report.medianResponseMs).toBe(7 * 60000);
  });

  it("scores CSAT ratings against the last teammate who replied", () => {
    const report = buildTeamReport([
      msg("a", 0, "inbound", "user"),
      msg("a", 3, "outbound", "agent", "Maya"),
      { ...msg("a", 9, "inbound", "user"), body: "[rating] 3/3 😀 Great" },
      msg("b", 0, "inbound", "user"),
      msg("b", 5, "outbound", "agent", "Maya"),
      { ...msg("b", 9, "inbound", "user"), body: "[rating] 1/3 🙁 Not good" },
    ]);
    expect(report.agents[0]).toMatchObject({ name: "Maya", csat: 0.5, ratings: 2 });
    expect(report.csat).toBe(0.5);
    expect(report.medianResponseMs).toBe(4 * 60000);
  });

  it("formats durations", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(20_000)).toBe("<1m");
    expect(formatDuration(5 * 60000)).toBe("5m");
    expect(formatDuration(90 * 60000)).toBe("1.5h");
    expect(formatDuration(3 * 86_400_000)).toBe("3d");
  });
});
