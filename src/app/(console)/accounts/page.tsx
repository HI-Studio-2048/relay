import { and, eq, gte, sql } from "drizzle-orm";
import { Building2 } from "lucide-react";
import { PageHeader } from "@/components/chrome/page-header";
import { currentUserId } from "@/lib/auth";
import { listBots } from "@/lib/bots";
import { getDb } from "@/lib/db";
import { contacts, flowEvents, flows } from "@/lib/db/schema";
import { listInboxThreads } from "@/lib/store";
import { AccountsTable, type AccountRow } from "./accounts-table";
import { formatRevenue } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Agencies: every connected account (brand) at a glance, with one-click switching. */
export default async function AccountsPage() {
  const db = await getDb();
  const userId = await currentUserId();
  const bots = userId ? await listBots(userId) : [];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  const rows: AccountRow[] = await Promise.all(
    bots.map(async (bot) => {
      const [[totals], [flowTotals], goals, threads] = await Promise.all([
        db
          .select({
            total: sql<number>`count(*)::int`,
            week: sql<number>`count(*) filter (where ${contacts.createdAt} >= ${weekAgo})::int`,
          })
          .from(contacts)
          .where(eq(contacts.botId, bot.id)),
        db
          .select({ active: sql<number>`count(*) filter (where ${flows.isActive})::int`, total: sql<number>`count(*)::int` })
          .from(flows)
          .where(eq(flows.botId, bot.id)),
        db
          .select({ currency: flowEvents.currency, count: sql<number>`count(*)::int`, value: sql<number>`coalesce(sum(${flowEvents.value}), 0)::float` })
          .from(flowEvents)
          .where(and(eq(flowEvents.botId, bot.id), eq(flowEvents.kind, "goal"), gte(flowEvents.createdAt, monthAgo)))
          .groupBy(flowEvents.currency),
        listInboxThreads(bot.id),
      ]);
      return {
        id: bot.id,
        name: bot.name,
        channel: bot.channel ?? "telegram",
        status: bot.status,
        contacts: Number(totals?.total ?? 0),
        newThisWeek: Number(totals?.week ?? 0),
        needsReply: threads.filter((thread) => thread.needsReply).length,
        activeFlows: Number(flowTotals?.active ?? 0),
        totalFlows: Number(flowTotals?.total ?? 0),
        conversions: goals.reduce((sum, row) => sum + Number(row.count), 0),
        // Per currency, formatted here (one locale) so the table never adds yen to dollars.
        revenue: formatRevenue(goals.map((row) => ({ currency: row.currency, value: Number(row.value) })), "en-US"),
      };
    }),
  );
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="All accounts"
        icon={Building2}
        tone="start"
        description="Every brand you run in Relay, side by side. Open one to work in it; Live Chat, flows and contacts follow the selected account."
      />
      <AccountsTable rows={rows.sort((a, b) => b.needsReply - a.needsReply || b.contacts - a.contacts)} />
    </div>
  );
}
