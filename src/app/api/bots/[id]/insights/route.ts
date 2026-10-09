import { requireBotAccess } from "@/lib/auth";
import { and, desc, eq, gte, notLike } from "drizzle-orm";
import { AiUnavailableError, analyzeConversations, readAiSettings } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { bots, contacts, messages } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

/** POST { days?: number } → AI read of what people asked recently. */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireBotAccess(id);
    const body = await readJson<{ days?: number }>(request);
    const days = Math.min(90, Math.max(1, Number(body.days) || 14));
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const rows = await db
      .select({ body: messages.body, firstName: contacts.firstName, username: contacts.username })
      .from(messages)
      .innerJoin(contacts, eq(contacts.id, messages.contactId))
      .where(
        and(
          eq(messages.botId, id),
          eq(messages.direction, "inbound"),
          gte(messages.createdAt, new Date(Date.now() - days * 86_400_000)),
          notLike(messages.body, "[button]%"),
          notLike(messages.body, "/start%"),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(400);
    const usable = rows.filter((row) => row.body.replace(/^\[[^\]]+\]\s*/, "").trim().length > 2);
    if (usable.length < 3) return json({ error: "Not enough conversations yet — come back after a few more messages." }, 400);
    const insights = await analyzeConversations({
      settings: readAiSettings(bot.settings),
      brandName: bot.name,
      messages: usable.reverse().map((row) => ({ contact: row.firstName || row.username || "someone", text: row.body })),
    });
    return json({ insights, analyzed: usable.length, days });
  } catch (error) {
    if (error instanceof AiUnavailableError) return json({ error: error.message }, 503);
    return fail(error);
  }
}
