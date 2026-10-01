import { eq } from "drizzle-orm";
import { AiUnavailableError, REWRITE_STYLES, readAiSettings, rewriteCopy, type RewriteStyle } from "@/lib/ai";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";

/** POST { botId, text, style } → { text } rewritten in the brand voice. */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; text?: string; style?: string }>(request);
    const text = body.text?.trim();
    if (!body.botId || !text) return json({ error: "botId and text are required" }, 400);
    if (!body.style || !(body.style in REWRITE_STYLES)) return json({ error: "Unknown style" }, 400);
    const db = await getDb();
    const [bot] = await db.select().from(bots).where(eq(bots.id, body.botId)).limit(1);
    if (!bot) return json({ error: "Account not found" }, 404);
    const rewritten = await rewriteCopy({ text, style: body.style as RewriteStyle, settings: readAiSettings(bot.settings), brandName: bot.name });
    return json({ text: rewritten });
  } catch (error) {
    if (error instanceof AiUnavailableError) return json({ error: error.message }, 503);
    return fail(error);
  }
}
