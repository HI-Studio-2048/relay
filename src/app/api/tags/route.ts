import { eq, sql } from "drizzle-orm";
import { requireBotAccess } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { contactTags, flows, tags } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const botId = url.searchParams.get("botId");
    if (!botId) return json({ error: "botId is required" }, 400);
    await requireBotAccess(botId);
    const db = await getDb();
    const rows = await db.select().from(tags).where(eq(tags.botId, botId));
    if (!url.searchParams.get("usage")) return json({ tags: rows });
    // Usage for Settings → Tags: contacts carrying it and flows that read or set it (by name).
    const [counts, flowRows] = await Promise.all([
      db
        .select({ tagId: contactTags.tagId, count: sql<number>`count(*)::int` })
        .from(contactTags)
        .innerJoin(tags, eq(tags.id, contactTags.tagId))
        .where(eq(tags.botId, botId))
        .groupBy(contactTags.tagId),
      db.select({ definition: flows.definition }).from(flows).where(eq(flows.botId, botId)),
    ]);
    const flowTexts = flowRows.map((flow) => JSON.stringify(flow.definition).toLowerCase());
    return json({
      tags: rows.map((tag) => ({
        ...tag,
        contacts: counts.find((row) => row.tagId === tag.id)?.count ?? 0,
        flows: flowTexts.filter((text) => text.includes(`"tagname":${JSON.stringify(tag.name.toLowerCase())}`)).length,
      })),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ botId?: string; name?: string; color?: string }>(request);
    if (!body.botId || !body.name?.trim()) return json({ error: "botId and name are required" }, 400);
    await requireBotAccess(body.botId);
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
