import { logActivity } from "@/lib/activity";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { broadcasts, flows } from "@/lib/db/schema";
import { json, fail, type RouteParams } from "@/lib/http";
import { sanitizeSegment } from "@/lib/segments";
import { broadcastAudience } from "@/lib/store";

/** POST — copy a broadcast (copy, audience, A/B, smart timing) into a new one awaiting confirmation. */
export async function POST(request: Request, context: RouteParams<{ id: string }>) {
  try {
    const { id } = await context.params;
    const db = await getDb();
    const [source] = await db.select().from(broadcasts).where(eq(broadcasts.id, id)).limit(1);
    if (!source) return json({ error: "Broadcast not found" }, 404);
    // A flow broadcast whose flow was deleted only has placeholder text: never resend that.
    if (source.flowId) {
      const [flow] = await db.select({ botId: flows.botId }).from(flows).where(eq(flows.id, source.flowId)).limit(1);
      if (!flow || flow.botId !== source.botId) return json({ error: "The flow this broadcast sent no longer exists" }, 409);
    } else if (source.body.startsWith("[flow] ")) {
      return json({ error: "The flow this broadcast sent was deleted. Compose a new broadcast instead." }, 409);
    }
    const segment = sanitizeSegment(source.segment);
    // The audience is recounted now: contacts may have joined, left or unsubscribed since.
    const audience = await broadcastAudience(source.botId, source.tagId, segment);
    const [broadcast] = await db
      .insert(broadcasts)
      .values({
        id: crypto.randomUUID(),
        botId: source.botId,
        name: `${source.name} (copy)`.slice(0, 120),
        body: source.body,
        bodyB: source.bodyB,
        tagId: source.tagId,
        segment: segment.conditions.length ? segment : null,
        flowId: source.flowId,
        smartTiming: source.smartTiming,
        status: "awaiting_confirm",
        totalCount: audience.length,
      })
      .returning();
    await logActivity(request, source.botId, "Duplicated broadcast", source.name);
    return json({ broadcast, audienceCount: audience.length });
  } catch (error) {
    return fail(error);
  }
}
