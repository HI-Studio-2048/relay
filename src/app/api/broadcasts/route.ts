import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { broadcasts, tags } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";
import { broadcastAudience } from "@/lib/store";

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
      tagId?: string | null;
      /** "all" sends to every subscribed contact; default is the tag audience. */
      audience?: "all" | "tag";
    }>(request);
    const everyone = body.audience === "all";
    if (!body.botId || !body.text?.trim() || (!everyone && !body.tagId)) {
      return json({ error: "botId and text are required, plus a tagId unless audience is \"all\"." }, 400);
    }
    const db = await getDb();
    let tagName: string | null = null;
    if (!everyone && body.tagId) {
      const [tag] = await db.select().from(tags).where(eq(tags.id, body.tagId)).limit(1);
      if (!tag || tag.botId !== body.botId) return json({ error: "Tag not found for this bot" }, 404);
      tagName = tag.name;
    }
    const tagId = everyone ? null : (body.tagId ?? null);
    const audience = await broadcastAudience(body.botId, tagId);
    const [broadcast] = await db
      .insert(broadcasts)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        name: body.name?.trim() || (tagName ? `Broadcast to ${tagName}` : "Broadcast to everyone"),
        body: body.text.trim(),
        tagId,
        status: "awaiting_confirm",
        totalCount: audience.length,
      })
      .returning();
    return json({ broadcast, audienceCount: audience.length });
  } catch (error) {
    return fail(error);
  }
}
