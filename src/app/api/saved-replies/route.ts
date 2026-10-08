import { requireBotAccess } from "@/lib/auth";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { savedReplies } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    const db = await getDb();
    const rows = await db.select().from(savedReplies).where(eq(savedReplies.botId, botId)).orderBy(asc(savedReplies.title));
    return json({ replies: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; title?: string; body?: string }>(request);
    const title = body.title?.trim();
    const text = body.body?.trim();
    if (!body.botId || !title || !text) return json({ error: "botId, title and body are required" }, 400);
    await requireBotAccess(body.botId);
    const db = await getDb();
    const [reply] = await db
      .insert(savedReplies)
      .values({ id: crypto.randomUUID(), botId: body.botId, title: title.slice(0, 60), body: text })
      .returning();
    return json({ reply });
  } catch (error) {
    return fail(error);
  }
}
