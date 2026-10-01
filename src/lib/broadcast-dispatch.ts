import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { broadcastRecipients, broadcasts } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { enqueueBroadcast } from "@/lib/queue";
import { sanitizeSegment } from "@/lib/segments";
import { broadcastAudience } from "@/lib/store";

export class EmptyAudienceError extends Error {
  constructor(message = "Nobody matches this audience. Nothing to send.") {
    super(message);
    this.name = "EmptyAudienceError";
  }
}

/** Freeze the audience into recipient rows and queue the send. Used on confirm and when a schedule comes due. */
export async function materializeBroadcast(broadcastId: string) {
  const db = await getDb();
  const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1);
  if (!broadcast) throw new Error("Broadcast not found");
  const audience = await broadcastAudience(broadcast.botId, broadcast.tagId, sanitizeSegment(broadcast.segment));
  if (audience.length === 0) throw new EmptyAudienceError();

  await db.delete(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, broadcastId));
  await db.insert(broadcastRecipients).values(
    audience.map((contact) => ({ id: crypto.randomUUID(), broadcastId, contactId: contact.id, status: "pending" })),
  );
  const [updated] = await db
    .update(broadcasts)
    .set({ status: "queued", totalCount: audience.length, sentCount: 0, failedCount: 0 })
    .where(eq(broadcasts.id, broadcastId))
    .returning();
  await enqueueBroadcast({ kind: "broadcast", broadcastId });
  return updated!;
}

/** Worker tick: release scheduled broadcasts whose time has come. */
export async function releaseDueBroadcasts() {
  const db = await getDb();
  const due = await db
    .select()
    .from(broadcasts)
    .where(and(eq(broadcasts.status, "scheduled"), lte(broadcasts.scheduledAt, new Date())));
  for (const broadcast of due) {
    try {
      await materializeBroadcast(broadcast.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start";
      log.warn(`Scheduled broadcast ${broadcast.id} did not start`, message);
      await db.update(broadcasts).set({ status: "failed", lastError: message, finishedAt: new Date() }).where(eq(broadcasts.id, broadcast.id));
    }
  }
}
