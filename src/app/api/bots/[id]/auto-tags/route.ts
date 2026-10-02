import { eq } from "drizzle-orm";
import { readAutoTags } from "@/lib/auto-tags";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json({ autoTags: readAutoTags(bot.settings) });
  } catch (error) {
    return fail(error);
  }
}

/** PUT { autoTags: [{ tag, description }] } — the tags Claude may apply from what people write. */
export async function PUT(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ autoTags?: unknown }>(request);
    const autoTags = readAutoTags({ autoTags: body.autoTags });
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    await db.update(bots).set({ settings: { ...(bot.settings ?? {}), autoTags }, updatedAt: new Date() }).where(eq(bots.id, id));
    return json({ autoTags });
  } catch (error) {
    return fail(error);
  }
}
