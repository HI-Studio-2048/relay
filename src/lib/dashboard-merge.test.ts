import { describe, expect, it } from "vitest";
import { mergeDashboards, type Dashboard } from "@/lib/dashboard";

function dash(partial: Partial<Dashboard> & Pick<Dashboard, "series">): Dashboard {
  return {
    newInPeriod: 0,
    newThisWeek: 0,
    newPreviousWeek: 0,
    totalContacts: 0,
    unsubscribed: 0,
    platforms: [],
    week: { inbound: 0, outbound: 0, human: 0, ai: 0, automated: 0 },
    needsReply: 0,
    openThreads: 0,
    recentThreads: [],
    topFlows: [],
    conversions: 0,
    revenue: "",
    goalTotals: [],
    ...partial,
  };
}

const day = (count: number, offset: number) => ({ day: `2026-10-${String(offset).padStart(2, "0")}`, count });

describe("mergeDashboards", () => {
  it("adds totals across channels and keeps a row for each one", () => {
    const series = [day(1, 1), day(2, 2)];
    const overview = mergeDashboards([
      {
        bot: { id: "tg", name: "Shop", channel: "telegram", status: "connected" },
        data: dash({
          series,
          totalContacts: 4,
          needsReply: 1,
          openThreads: 2,
          week: { inbound: 3, outbound: 1, human: 1, ai: 0, automated: 0 },
          conversions: 2,
          goalTotals: [{ currency: "USD", count: 2, value: 10 }],
          platforms: [{ platform: "telegram", count: 4 }],
          recentThreads: [
            {
              contactId: "c1",
              name: "Ada",
              username: null,
              avatarUrl: null,
              platform: "telegram",
              status: "open",
              snoozedUntil: null,
              lastAt: "2026-10-18T10:00:00.000Z",
              lastBody: "hi",
              lastDirection: "inbound",
              needsReply: true,
              assignedTo: null,
              tags: [],
              botId: "tg",
              botName: "Shop",
              channel: "telegram",
            },
          ],
        }),
      },
      {
        bot: { id: "ig", name: "Brand", channel: "instagram", status: "connected" },
        data: dash({
          series: [day(3, 1), day(0, 2)],
          totalContacts: 6,
          needsReply: 2,
          openThreads: 3,
          week: { inbound: 5, outbound: 4, human: 0, ai: 4, automated: 4 },
          conversions: 1,
          goalTotals: [{ currency: "USD", count: 1, value: 5 }, { currency: "EUR", count: 1, value: 8 }],
          platforms: [{ platform: "instagram", count: 6 }],
          recentThreads: [
            {
              contactId: "c2",
              name: "Bea",
              username: null,
              avatarUrl: null,
              platform: "instagram",
              status: "open",
              snoozedUntil: null,
              lastAt: "2026-10-18T12:00:00.000Z",
              lastBody: "price?",
              lastDirection: "inbound",
              needsReply: true,
              assignedTo: null,
              tags: [],
              botId: "ig",
              botName: "Brand",
              channel: "instagram",
            },
          ],
        }),
      },
    ]);

    expect(overview.totals.totalContacts).toBe(10);
    expect(overview.totals.needsReply).toBe(3);
    expect(overview.totals.openThreads).toBe(5);
    expect(overview.totals.week).toMatchObject({ inbound: 8, outbound: 5, ai: 4 });
    expect(overview.totals.conversions).toBe(3);
    expect(overview.totals.series.map((point) => point.count)).toEqual([4, 2]);
    expect(overview.totals.platforms).toEqual([
      { platform: "instagram", count: 6 },
      { platform: "telegram", count: 4 },
    ]);
    expect(overview.totals.revenue).toContain("15");
    expect(overview.totals.revenue).toContain("8");
    expect(overview.totals.recentThreads.map((thread) => thread.contactId)).toEqual(["c2", "c1"]);
    expect(overview.channels.map((channel) => channel.name)).toEqual(["Shop", "Brand"]);
    expect(overview.channels.map((channel) => channel.messages)).toEqual([4, 9]);
  });
});
