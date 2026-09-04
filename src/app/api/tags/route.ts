import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const botId = new URL(request.url).searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    const db = await getDb();
    return json({ tags: await db.select().from(tags).where(eq(tags.botId, botId)) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; name?: string; color?: string }>(request);
    if (!body.botId || !body.name?.trim()) return json({ error: "botId and name are required" }, 400);
    const db = await getDb();
    const [tag] = await db
      .insert(tags)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        name: body.name.trim().toLowerCase(),
        color: body.color ?? "#c4a574",
      })
      .returning();
    return json({ tag });
  } catch (error) {
    return fail(error, "Tag already exists");
  }
}
