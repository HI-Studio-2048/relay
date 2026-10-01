import { eq } from "drizzle-orm";
import { aiConfigured, readAiSettings, type BotAiSettings } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json({ configured: aiConfigured(), settings: readAiSettings(bot.settings) });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<BotAiSettings>(request);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const ai = readAiSettings({ ai: { ...readAiSettings(bot.settings), ...body } });
    ai.persona = ai.persona?.slice(0, 4000);
    ai.knowledge = ai.knowledge?.slice(0, 60000);
    ai.handoffMessage = ai.handoffMessage?.slice(0, 500);
    await db
      .update(bots)
      .set({ settings: { ...(bot.settings ?? {}), ai }, updatedAt: new Date() })
      .where(eq(bots.id, id));
    return json({ configured: aiConfigured(), settings: ai });
  } catch (error) {
    return fail(error);
  }
}
