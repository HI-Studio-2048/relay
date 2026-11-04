import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { broadcastRecipients, broadcasts, messages } from "@/lib/db/schema";
import { capToWindow, nextSendAt, preferredHour } from "@/lib/smart-timing";
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
  // Claimed but not queued yet: put it back where a person can retry (a scheduled one is marked failed).
  const giveBack = (lastError: string | null) =>
    db
      .update(broadcasts)
      .set({ status: claimed.scheduledAt ? "failed" : "awaiting_confirm", lastError: claimed.scheduledAt ? lastError : null })
      .where(eq(broadcasts.id, broadcastId));
  try {
    const audience = await broadcastAudience(claimed.botId, claimed.tagId, sanitizeSegment(claimed.segment));
    if (audience.length === 0) {
      await giveBack("Nobody matched the audience");
      throw new EmptyAudienceError();
    }

    const sendAt = claimed.smartTiming ? await smartSendTimes(audience.map((contact) => contact.id)) : new Map<string, Date>();
    const arms = claimed.bodyB?.trim() && !claimed.flowId ? splitArms(audience.length) : null;
    const rows = audience.map((contact, index) => ({
      id: crypto.randomUUID(),
      broadcastId,
      contactId: contact.id,
      status: "pending",
      sendAt: sendAt.get(contact.id) ?? null,
      variant: arms ? arms[index]! : null,
    }));
    // One transaction, so the worker never sees half an audience. Chunked, because a single insert of
    // ten thousand rows runs past Postgres's limit on parameters in one statement.
    const updated = await db.transaction(async (tx) => {
      await tx.delete(broadcastRecipients).where(eq(broadcastRecipients.broadcastId, broadcastId));
      for (let i = 0; i < rows.length; i += 1000) await tx.insert(broadcastRecipients).values(rows.slice(i, i + 1000));
      const [row] = await tx
        .update(broadcasts)
        .set({ totalCount: audience.length, sentCount: 0, failedCount: 0 })
        .where(eq(broadcasts.id, broadcastId))
        .returning();
      return row;
    });
    await enqueueBroadcast({ kind: "broadcast", broadcastId });
    return updated!;
  } catch (error) {
    if (!(error instanceof EmptyAudienceError)) {
      log.error("Broadcast could not be queued", error instanceof Error ? error.message : error);
      await giveBack("Could not prepare the send").catch(() => undefined);
    }
    throw error;
  }
}

/**
 * Each contact's next usual active hour (from their last 50 inbound messages in 60 days), capped to
 * the 24h messaging window; now when unknown.
 */
async function smartSendTimes(contactIds: string[]) {
  const db = await getDb();
  const now = new Date();
  const result = new Map<string, Date>();
  for (let i = 0; i < contactIds.length; i += 500) {
    const chunk = contactIds.slice(i, i + 500);
    const rows = await db
      .select({ contactId: messages.contactId, createdAt: messages.createdAt })
      .from(messages)
      .where(
        and(
          inArray(messages.contactId, chunk),
          eq(messages.direction, "inbound"),
          gte(messages.createdAt, new Date(now.getTime() - 60 * 86_400_000)),
        ),
      )
      .orderBy(desc(messages.createdAt));
    const byContact = new Map<string, Date[]>();
    for (const row of rows) {
      const list = byContact.get(row.contactId) ?? [];
      if (list.length < 50) list.push(new Date(row.createdAt));
      byContact.set(row.contactId, list);
    }
    for (const id of chunk) {
      const history = byContact.get(id) ?? [];
      result.set(id, capToWindow(nextSendAt(now, preferredHour(history)), now, history[0] ?? null));
    }
  }
  return result;
}

/** A/B test: an even, shuffled split of n recipients into "a" and "b". */
export function splitArms(n: number, random = Math.random): ("a" | "b")[] {
  const arms = Array.from({ length: n }, (_, index) => (index % 2 === 0 ? "a" : "b") as "a" | "b");
  for (let i = arms.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arms[i], arms[j]] = [arms[j]!, arms[i]!];
  }
  return arms;
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
