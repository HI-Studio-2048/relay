import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { broadcasts, tags } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";
import { contactsWithTag } from "@/lib/store";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    const db = await getDb();
    const rows = await db
      .select()
      .from(broadcasts)
      .where(eq(broadcasts.botId, botId))
      .orderBy(desc(broadcasts.createdAt));
    return json({ broadcasts: rows });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      botId?: string;
      name?: string;
      text?: string;
      tagId?: string;
    }>(request);
    if (!body.botId || !body.text?.trim() || !body.tagId) {
      return json({ error: "botId, tagId, and text are required. Broadcasts are tag-scoped." }, 400);
    }
    const db = await getDb();
    const [tag] = await db.select().from(tags).where(eq(tags.id, body.tagId)).limit(1);
    if (!tag || tag.botId !== body.botId) return json({ error: "Tag not found for this bot" }, 404);
    const audience = await contactsWithTag(body.botId, body.tagId);
    const [broadcast] = await db
      .insert(broadcasts)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        name: body.name?.trim() || `Broadcast to ${tag.name}`,
        body: body.text.trim(),
        tagId: body.tagId,
        status: "awaiting_confirm",
        totalCount: audience.length,
      })
      .returning();
    return json({ broadcast, audienceCount: audience.length });
  } catch (error) {
    return fail(error);
  }
}
