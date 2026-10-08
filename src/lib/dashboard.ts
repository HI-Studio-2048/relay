import { and, desc, eq, gte, sql } from "drizzle-orm";
import { statsByFlow } from "@/lib/analytics";
import { getDb } from "@/lib/db";
import { bots, contacts, flowEvents, flows, growthLinks, messages, teamMembers } from "@/lib/db/schema";
import { readAiSettings } from "@/lib/ai";
import { buildTeamReport } from "@/lib/team-report";
import { listInboxThreads } from "@/lib/store";
import { readHours } from "@/lib/starters";
import { formatRevenue } from "@/lib/format";

const DAY = 86_400_000;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Everything the Overview page shows, for one account. */
export async function loadDashboard(botId: string, days = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - (days - 1) * DAY);
  since.setUTCHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const day = sql<string>`to_char(${contacts.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;

  const [daily, totals, byPlatform, weekMessages, threads, flowStats, flowRows, goalTotals] = await Promise.all([
    db
      .select({ day, count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(and(eq(contacts.botId, botId), gte(contacts.createdAt, since)))
      .groupBy(day),
    db
      .select({ total: sql<number>`count(*)::int`, unsubscribed: sql<number>`count(*) filter (where ${contacts.unsubscribed})::int` })
      .from(contacts)
      .where(eq(contacts.botId, botId)),
    db
      .select({ platform: contacts.platform, count: sql<number>`count(*)::int` })
      .from(contacts)
      .where(eq(contacts.botId, botId))
      .groupBy(contacts.platform),
    db
      .select({ direction: messages.direction, source: messages.source, count: sql<number>`count(*)::int` })
      .from(messages)
      .where(and(eq(messages.botId, botId), gte(messages.createdAt, weekAgo)))
      .groupBy(messages.direction, messages.source),
    listInboxThreads(botId),
    statsByFlow(botId, days),
    db.select({ id: flows.id, name: flows.name, isActive: flows.isActive }).from(flows).where(eq(flows.botId, botId)),
    db
      .select({ currency: flowEvents.currency, count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${flowEvents.value}), 0)::float8` })
      .from(flowEvents)
      .where(and(eq(flowEvents.botId, botId), eq(flowEvents.kind, "goal"), gte(flowEvents.createdAt, new Date(Date.now() - days * DAY))))
      .groupBy(flowEvents.currency),
  ]);

  const counts = new Map(daily.map((row) => [row.day, Number(row.count)]));
  const series = Array.from({ length: days }, (_, index) => {
    const date = new Date(since.getTime() + index * DAY);
    const key = dayKey(date);
    return { day: key, count: counts.get(key) ?? 0 };
  });

  const sum = (filter: (row: (typeof weekMessages)[number]) => boolean) =>
    weekMessages.filter(filter).reduce((total, row) => total + Number(row.count), 0);
  const inbound = sum((row) => row.direction === "inbound");
  const outbound = sum((row) => row.direction === "outbound");
  const human = sum((row) => row.direction === "outbound" && row.source === "agent");
  const ai = sum((row) => row.direction === "outbound" && row.source === "ai");

  const topFlows = flowRows
    .map((flow) => ({ ...flow, stats: flowStats[flow.id]! }))
    .filter((flow) => flow.stats && flow.stats.runs > 0)
    .sort((a, b) => b.stats.runs - a.stats.runs)
    .slice(0, 5);

  return {
    series,
    newInPeriod: series.reduce((total, point) => total + point.count, 0),
    newThisWeek: series.slice(-7).reduce((total, point) => total + point.count, 0),
    newPreviousWeek: series.slice(-14, -7).reduce((total, point) => total + point.count, 0),
    totalContacts: Number(totals[0]?.total ?? 0),
    unsubscribed: Number(totals[0]?.unsubscribed ?? 0),
    platforms: byPlatform
      .map((row) => ({ platform: row.platform, count: Number(row.count) }))
      .sort((a, b) => b.count - a.count),
    week: { inbound, outbound, human, ai, automated: outbound - human },
    needsReply: threads.filter((thread) => thread.needsReply).length,
    openThreads: threads.filter((thread) => thread.status === "open").length,
    recentThreads: threads.slice(0, 6),
    topFlows,
    // All goals in the period, including payments no flow sent (per-flow stats leave those out).
    conversions: goalTotals.reduce((sum, row) => sum + Number(row.count), 0),
    /** Per currency, e.g. "¥5,000 · $19.99" (never added across currencies); empty when none. */
    revenue: formatRevenue(goalTotals.map((row) => ({ currency: row.currency, value: Number(row.value) })), "en-US"),
  };
}

export type Dashboard = Awaited<ReturnType<typeof loadDashboard>>;

/** Live Chat team performance over the last `days`. */
export async function loadTeamReport(botId: string, days = 30) {
  const db = await getDb();
  const rows = await db
    .select({
      contactId: messages.contactId,
      direction: messages.direction,
      source: messages.source,
      author: messages.author,
      createdAt: messages.createdAt,
      body: sql<string>`case when ${messages.body} like '[rating]%' then ${messages.body} else '' end`,
    })
    .from(messages)
    .where(and(eq(messages.botId, botId), gte(messages.createdAt, new Date(Date.now() - days * DAY))))
    // Newest 50k on very busy accounts, put back in time order for the report.
    .orderBy(desc(messages.createdAt))
    .limit(50_000);
  return buildTeamReport(rows.reverse().map((row) => ({ ...row, createdAt: new Date(row.createdAt) })));
}

export type ChecklistItem = { id: string; label: string; done: boolean; href: string; hint: string };

/** Getting-started steps, each checked off from real data. */
export async function loadChecklist(botId: string): Promise<ChecklistItem[]> {
  const db = await getDb();
  const [[bot], flowRows, links, team, events] = await Promise.all([
    db.select().from(bots).where(eq(bots.id, botId)).limit(1),
    db.select({ isActive: flows.isActive, triggerType: flows.triggerType }).from(flows).where(eq(flows.botId, botId)),
    db.select({ id: growthLinks.id }).from(growthLinks).where(eq(growthLinks.botId, botId)).limit(1),
    db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .innerJoin(bots, eq(bots.ownerId, teamMembers.ownerId))
      .where(eq(bots.id, botId))
      .limit(1),
    db.select({ id: flowEvents.id }).from(flowEvents).where(eq(flowEvents.botId, botId)).limit(1),
  ]);
  const ai = readAiSettings(bot?.settings);
  return [
    { id: "connect", label: "Connect your accounts", done: bot?.status === "connected", href: "/setup", hint: "Zernio brings every network in at once." },
    { id: "ai", label: "Teach the AI your business", done: Boolean(ai.knowledge?.trim()), href: "/ai", hint: "Paste prices, links and FAQs." },
    {
      id: "comment",
      label: "Turn on a comment-to-DM flow",
      done: flowRows.some((flow) => flow.isActive && flow.triggerType === "comment"),
      href: "/flows",
      hint: "Start from the lead magnet template.",
    },
    { id: "live", label: "See your first automation run", done: events.length > 0, href: "/flows", hint: "Use Test in the editor, then go live." },
    { id: "link", label: "Share a growth link or website widget", done: links.length > 0, href: "/growth", hint: "One link, every network." },
    { id: "team", label: "Add your team", done: team.length > 0, href: "/setup", hint: "Assign conversations in Live Chat." },
  ];
}

/**
 * When people write in: inbound messages over the last `days`, by weekday (0 = Monday) and hour, in the
 * account's business-hours time zone. Returns a 7×24 grid of counts.
 */
export async function loadActivityHeatmap(botId: string, days = 28) {
  const db = await getDb();
  const [bot] = await db.select({ settings: bots.settings }).from(bots).where(eq(bots.id, botId)).limit(1);
  const timezone = readHours(bot?.settings).timezone;
  const local = sql`(${messages.createdAt} at time zone ${timezone})`;
  const rows = await db
    .select({
      dow: sql<number>`(extract(isodow from ${local})::int - 1)`,
      hour: sql<number>`extract(hour from ${local})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(messages)
    .where(and(eq(messages.botId, botId), eq(messages.direction, "inbound"), gte(messages.createdAt, new Date(Date.now() - days * DAY))))
    .groupBy(sql`1`, sql`2`);
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const row of rows) {
    const dow = Number(row.dow);
    const hour = Number(row.hour);
    if (grid[dow] && hour >= 0 && hour < 24) grid[dow]![hour] = Number(row.count);
  }
  return { grid, timezone };
}

