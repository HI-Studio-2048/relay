import { eq } from "drizzle-orm";
import { dailyRunsByFlow, statsByFlow } from "@/lib/analytics";
import { currentBot } from "@/lib/current-bot";
import { getDb } from "@/lib/db";
import { flows } from "@/lib/db/schema";
import { FlowsBoard } from "./flows-board";

export const dynamic = "force-dynamic";

export default async function FlowsPage() {
  const bot = await currentBot();
  if (!bot) {
    return <p className="text-sm text-muted-foreground">Connect an account first.</p>;
  }
  const db = await getDb();
  const [rows, stats, trends] = await Promise.all([db.select().from(flows).where(eq(flows.botId, bot.id)), statsByFlow(bot.id), dailyRunsByFlow(bot.id)]);
  return (
    <FlowsBoard
      botId={bot.id}
      flows={rows
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map((flow) => ({
          id: flow.id,
          name: flow.name,
          triggerType: flow.triggerType,
          triggerValue: flow.triggerValue,
          isActive: flow.isActive,
          folder: flow.folder ?? null,
          updatedAt: new Date(flow.updatedAt).toISOString(),
          stats: stats[flow.id] ?? null,
          trend: trends[flow.id] ?? null,
        }))}
    />
  );
}
