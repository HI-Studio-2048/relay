import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { broadcastRecipients, broadcasts, messages } from "@/lib/db/schema";
import { nextSendAt, preferredHour } from "@/lib/smart-timing";
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

/**
 * Freeze the audience into recipient rows and queue the send. Used on confirm and when a schedule
 * comes due. The status flip is an atomic claim, so two workers (or a double submit) cannot both
 * send the same broadcast; returns null when someone else already claimed it.
 */
export async function materializeBroadcast(broadcastId: string, from: string[] = ["draft", "awaiting_confirm", "scheduled"]) {
  const db = await getDb();
  const [claimed] = await db
    .update(broadcasts)
    .set({ status: "queued" })
    .where(and(eq(broadcasts.id, broadcastId), inArray(broadcasts.status, from)))
    .returning();
  if (!claimed) return null;
  const audience = await broadcastAudience(claimed.botId, claimed.tagId, sanitizeSegment(claimed.segment));
  if (audience.length === 0) {
    await db.update(broadcasts).set({ status: claimed.scheduledAt ? "failed" : "awaiting_confirm", lastError: claimed.scheduledAt ? "Nobody matched the audience" : null }).where(eq(broadcasts.id, broadcastId));
    throw new EmptyAudienceError();
  }

  const sendAt = claimed.smartTiming ? await smartSendTimes(audience.map((contact) => contact.id)) : new Map<string, Date>();
  await db.delete(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, broadcastId));
  await db.insert(broadcastRecipients).values(
    audience.map((contact) => ({
      id: crypto.randomUUID(),
      broadcastId,
      contactId: contact.id,
      status: "pending",
      sendAt: sendAt.get(contact.id) ?? null,
    })),
  );
  const [updated] = await db
    .update(broadcasts)
    .set({ totalCount: audience.length, sentCount: 0, failedCount: 0 })
    .where(eq(broadcasts.id, broadcastId))
    .returning();
  await enqueueBroadcast({ kind: "broadcast", broadcastId });
  return updated!;
}

/** Each contact's next usual active hour (from their last 50 inbound messages); now when unknown. */
async function smartSendTimes(contactIds: string[]) {
  const db = await getDb();
  const now = new Date();
  const result = new Map<string, Date>();
  for (let i = 0; i < contactIds.length; i += 500) {
    const chunk = contactIds.slice(i, i + 500);
    const rows = await db
      .select({ contactId: messages.contactId, createdAt: messages.createdAt })
      .from(messages)
      .where(and(inArray(messages.contactId, chunk), eq(messages.direction, "inbound")))
      .orderBy(desc(messages.createdAt));
    const byContact = new Map<string, Date[]>();
    for (const row of rows) {
      const list = byContact.get(row.contactId) ?? [];
      if (list.length < 50) list.push(new Date(row.createdAt));
      byContact.set(row.contactId, list);
    }
    for (const id of chunk) result.set(id, nextSendAt(now, preferredHour(byContact.get(id) ?? [])));
  }
  return result;
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
      await materializeBroadcast(broadcast.id, ["scheduled"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start";
      log.warn(`Scheduled broadcast ${broadcast.id} did not start`, message);
      await db.update(broadcasts).set({ status: "failed", lastError: message, finishedAt: new Date() }).where(eq(broadcasts.id, broadcast.id));
    }
  }
}
