import { eq } from "drizzle-orm";
import { accountFromRow } from "@/lib/channels";
import { handleSlackPost } from "@/lib/channels/slack-webhook";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, type RouteParams } from "@/lib/http";

/**
 * One URL per Slack app a customer made themselves (the paste-your-own-token route). It uses that app's
 * own signing secret. Workspaces that used Add to Slack go through /api/slack/events instead.
 */
export async function POST(request: Request, context: RouteParams<{ botId: string }>) {
  const { botId } = await context.params;
  const db = await getDb();
  const [bot] = await db.select().from(bots).where(eq(bots.id, botId)).limit(1);
  if (!bot || bot.channel !== "slack") return json({ error: "Unknown account" }, 404);
  return handleSlackPost(request, { secret: accountFromRow(bot).appSecret, resolveBot: async () => bot });
}
