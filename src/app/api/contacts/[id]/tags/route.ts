import { and, eq } from "drizzle-orm";
import { requireRowAccess, requireRowInBot } from "@/lib/auth/resources";
import { getDb } from "@/lib/db";
import { contactTags, tags } from "@/lib/db/schema";
import { json, fail, readJson, type RouteParams } from "@/lib/http";
import { loadContactRecord } from "@/lib/store";

export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const botId = await requireRowAccess("contact", id);
    const body = await readJson<{ tagId?: string; tagName?: string }>(request);
    const db = await getDb();
    let tagId = body.tagId;
    if (!tagId && body.tagName) {
      const [existing] = await db
        .select()
        .from(tags)
        .where(and(eq(tags.botId, botId), eq(tags.name, body.tagName)))
        .limit(1);
      tagId = existing?.id;
    }
    if (!tagId) return json({ error: "tagId is required" }, 400);
    await requireRowInBot("tag", tagId, botId);
    await db.insert(contactTags).values({ contactId: id, tagId }).onConflictDoNothing();
    return json({ contact: await loadContactRecord(id) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    await requireRowAccess("contact", id);
    const tagId = new URL(request.url).searchParams.get("tagId");
    if (!tagId) return json({ error: "tagId is required" }, 400);
    const db = await getDb();
    await db
      .delete(contactTags)
      .where(and(eq(contactTags.contactId, id), eq(contactTags.tagId, tagId)));
    return json({ contact: await loadContactRecord(id) });
  } catch (error) {
    return fail(error);
  }
}
