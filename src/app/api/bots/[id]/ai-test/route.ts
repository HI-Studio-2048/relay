import { eq } from "drizzle-orm";
import { AiUnavailableError, converse, readAiSettings, type HistoryLine } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";

/**
 * AI playground: chat with the assistant using the persona and knowledge on screen (saved or not),
 * as a test customer. Nothing is sent to anyone and nothing is stored.
 */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ settings?: unknown; history?: HistoryLine[] }>(request);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, id)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((line) => (line?.direction === "inbound" || line?.direction === "outbound") && typeof line.body === "string")
      .slice(-20)
      .map((line) => ({ direction: line.direction, body: line.body.slice(0, 1000) }));
    if (history.at(-1)?.direction !== "inbound") return json({ error: "Write a message first" }, 400);
    const settings = readAiSettings({ ai: body.settings ?? bot.settings?.ai });
    const result = await converse({
      settings,
      brandName: bot.name,
      contact: { id: "playground", telegramUserId: "playground", username: "test_customer", firstName: "Alex", lastName: null, email: null, phone: null, customFields: {}, tags: [] },
      history,
    });
    return json({ reply: result.reply, handoff: result.handoff });
  } catch (error) {
    if (error instanceof AiUnavailableError) return json({ error: error.message }, 503);
    return fail(error);
  }
}
