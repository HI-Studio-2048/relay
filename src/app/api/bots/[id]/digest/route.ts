import { requireBotAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { AiUnavailableError, writeWeeklyDigest } from "@/lib/ai";
import { loadDashboard, loadTeamReport } from "@/lib/dashboard";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";

/** POST → { digest } for the last 7 days, written on demand (it costs a model call). */
export async function POST(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const [data, team] = await Promise.all([loadDashboard(id), loadTeamReport(id, 7)]);
    const facts = {
      newContactsThisWeek: data.newThisWeek,
      newContactsPreviousWeek: data.newPreviousWeek,
      totalContacts: data.totalContacts,
      unsubscribed: data.unsubscribed,
      messagesThisWeek: data.week,
      conversationsWaitingForReply: data.needsReply,
      openConversations: data.openThreads,
      contactsByPlatform: data.platforms,
      topFlows30Days: data.topFlows.map((flow) => ({
        name: flow.name,
        active: flow.isActive,
        runs: flow.stats.runs,
        buttonClickRate: Math.round(flow.stats.ctr * 100) / 100,
        completionRate: Math.round(flow.stats.completionRate * 100) / 100,
        conversions: flow.stats.conversions,
      })),
      conversions30Days: data.conversions,
      revenue30Days: data.revenue,
      liveChat7Days: {
        humanReplies: team.humanReplies,
        automatedReplies: team.automatedReplies,
        medianFirstResponseMinutes: team.medianResponseMs === null ? null : Math.round(team.medianResponseMs / 60000),
        csatGreatShare: team.csat,
        ratings: team.ratings,
      },
    };
    const digest = await writeWeeklyDigest({ brandName: bot.name, facts });
    return json({ digest });
  } catch (error) {
    if (error instanceof AiUnavailableError) return json({ error: error.message }, 503);
    return fail(error);
  }
}
