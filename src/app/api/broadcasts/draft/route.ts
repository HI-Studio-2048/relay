import { eq } from "drizzle-orm";
import { AiUnavailableError, draftBroadcast, readAiSettings } from "@/lib/ai";
import { requireBotAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";

/** POST { botId, goal } → { a, b } two broadcast versions written by Claude. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; goal?: string }>(request);
    if (!body.botId || !body.goal?.trim()) return json({ error: "Describe what the broadcast is for" }, 400);
    await requireBotAccess(body.botId);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, body.botId)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json(await draftBroadcast({ goal: body.goal.trim(), settings: readAiSettings(bot.settings), brandName: bot.name }));
  } catch (error) {
    if (error instanceof AiUnavailableError) return json({ error: error.message }, 503);
    return fail(error);
  }
}
