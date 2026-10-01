import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { broadcasts, flows, tags } from "@/lib/db/schema";
import { json, fail, readJson } from "@/lib/http";
import { describeCondition, sanitizeSegment } from "@/lib/segments";
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
      /** Extra conditions (see segments.ts). */
      segment?: unknown;
      /** Send this flow instead of the text. */
      flowId?: string | null;
    }>(request);
    const everyone = body.audience === "all";
    const flowId = body.flowId?.trim() || null;
    if (!body.botId || (!body.text?.trim() && !flowId) || (!everyone && !body.tagId)) {
      return json({ error: "botId and a message or flow are required, plus a tagId unless audience is \"all\"." }, 400);
    }
    const db = await getDb();
    let tagName: string | null = null;
    if (!everyone && body.tagId) {
      const [tag] = await db.select().from(tags).where(eq(tags.id, body.tagId)).limit(1);
      if (!tag || tag.botId !== body.botId) return json({ error: "Tag not found for this bot" }, 404);
      tagName = tag.name;
    }
    let flowName: string | null = null;
    if (flowId) {
      const [flow] = await db.select().from(flows).where(eq(flows.id, flowId)).limit(1);
      if (!flow || flow.botId !== body.botId) return json({ error: "Flow not found for this account" }, 404);
      flowName = flow.name;
    }
    const segment = sanitizeSegment(body.segment);
    const tagId = everyone ? null : (body.tagId ?? null);
    const audience = await broadcastAudience(body.botId, tagId, segment);
    const fallbackName = [
      flowName ? `Flow "${flowName}"` : "Broadcast",
      tagName ? `to ${tagName}` : "to everyone",
      segment.conditions.length ? `(${segment.conditions.map(describeCondition).join(segment.match === "any" ? " or " : ", ")})` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const [broadcast] = await db
      .insert(broadcasts)
      .values({
        id: crypto.randomUUID(),
        botId: body.botId,
        name: body.name?.trim() || fallbackName.slice(0, 120),
        body: body.text?.trim() || (flowName ? `[flow] ${flowName}` : ""),
        tagId,
        segment: segment.conditions.length ? segment : null,
        flowId,
        status: "awaiting_confirm",
        totalCount: audience.length,
      })
      .returning();
    return json({ broadcast, audienceCount: audience.length });
  } catch (error) {
    return fail(error);
  }
}
