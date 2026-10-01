import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { readBotFields } from "@/lib/template";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json({ botFields: readBotFields(bot.settings) });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ botFields?: unknown }>(request);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const botFields = readBotFields({ botFields: body.botFields });
    await db.update(bots).set({ settings: { ...(bot.settings ?? {}), botFields }, updatedAt: new Date() }).where(eq(bots.id, id));
    return json({ botFields });
  } catch (error) {
    return fail(error);
  }
}
