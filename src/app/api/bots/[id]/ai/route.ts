import { requireBotAccess } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { aiConfigured, readAiSettings, type BotAiSettings } from "@/lib/ai";
import { readAiProvider } from "@/lib/ai-provider";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json({ configured: aiConfigured(readAiProvider(bot.settings)), settings: readAiSettings(bot.settings) });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const body = await readJson<BotAiSettings>(request);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const ai = readAiSettings({ ai: { ...readAiSettings(bot.settings), ...body } });
    ai.persona = ai.persona?.slice(0, 4000);
    ai.knowledge = ai.knowledge?.slice(0, 60000);
    ai.instructions = ai.instructions?.slice(0, 4000);
    ai.handoffMessage = ai.handoffMessage?.slice(0, 500);
    await db
      .update(bots)
      .set({ settings: { ...(bot.settings ?? {}), ai }, updatedAt: new Date() })
      .where(eq(bots.id, id));
    return json({ configured: aiConfigured(readAiProvider(bot.settings)), settings: ai });
  } catch (error) {
    return fail(error);
  }
}
