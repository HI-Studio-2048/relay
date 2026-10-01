import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { readHours, readStarters } from "@/lib/starters";
import { syncStarters } from "@/lib/starters-sync";
import { readModeration } from "@/lib/social-triggers";
import { readCsat } from "@/lib/csat";

export async function GET(_request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    return json({ starters: readStarters(bot.settings), hours: readHours(bot.settings), moderation: readModeration(bot.settings), csat: readCsat(bot.settings) });
  } catch (error) {
    return fail(error);
  }
}

/** Save starters + business hours, then push starters to the platforms. */
export async function PUT(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ starters?: unknown; hours?: unknown; moderation?: unknown; csat?: unknown }>(request);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const starters = body.starters !== undefined ? readStarters({ starters: body.starters }) : readStarters(bot.settings);
    const hours = body.hours !== undefined ? readHours({ hours: body.hours }) : readHours(bot.settings);
    const moderation = body.moderation !== undefined ? readModeration({ moderation: body.moderation }) : readModeration(bot.settings);
    const csat = body.csat !== undefined ? readCsat({ csat: body.csat }) : readCsat(bot.settings);
    const settings = { ...(bot.settings ?? {}), starters, hours, moderation, csat };
    const [updated] = await db.update(bots).set({ settings, updatedAt: new Date() }).where(eq(bots.id, id)).returning();
    const sync = body.starters !== undefined ? await syncStarters(updated!) : [];
    return json({ starters, hours, moderation, csat, sync });
  } catch (error) {
    return fail(error);
  }
}
