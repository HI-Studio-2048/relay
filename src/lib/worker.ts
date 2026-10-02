import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { isBroadcastable } from "@/lib/broadcast";
import { accountFromRow, channelTarget, sendChannelReply } from "@/lib/channels";
import { getDb } from "@/lib/db";
import { bots, broadcastRecipients, broadcasts, contacts } from "@/lib/db/schema";
import { interpolateTemplate } from "@/lib/flow-effects";
import { botFieldValues } from "@/lib/template";
import { log } from "@/lib/logger";
import { resumeDueDelays } from "@/lib/flow-resume";
import { resumeDueSequences } from "@/lib/sequence-resume";
import { releaseDueBroadcasts } from "@/lib/broadcast-dispatch";
import { startFlowForContact } from "@/lib/flow-dispatch";
import { dequeueJob, shouldRunWorker, type Job } from "@/lib/queue";
import { acquireSendSlot } from "@/lib/rate-limit";
import { loadContactRecord, saveMessage } from "@/lib/store";
import { processChannelUpdate } from "@/lib/webhook";

type GlobalWorker = { relayWorkerStarted?: boolean; relayBroadcastsInFlight?: Set<string> };
const globalForWorker = globalThis as unknown as GlobalWorker;

/** Shared across route bundles in this process, so a confirm request and the worker loop do not overlap. */
const inFlight = (globalForWorker.relayBroadcastsInFlight ??= new Set<string>());

async function handleBroadcast(broadcastId: string) {
  if (inFlight.has(broadcastId)) return;
  inFlight.add(broadcastId);
  try {
    await sendBroadcast(broadcastId);
  } finally {
    inFlight.delete(broadcastId);
  }
}

async function bumpCounts(broadcastId: string, sent: number, failed: number) {
  const db = await getDb();
  await db
    .update(broadcasts)
    .set({ sentCount: sql`${broadcasts.sentCount} + ${sent}`, failedCount: sql`${broadcasts.failedCount} + ${failed}` })
    .where(eq(broadcasts.id, broadcastId));
}

async function sendBroadcast(broadcastId: string) {
  const db = await getDb();
  const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1);
  if (!broadcast) return;
  if (broadcast.status !== "queued" && broadcast.status !== "sending") return;

  const [bot] = await db.select().from(bots).where(eq(bots.id, broadcast.botId)).limit(1);
  if (!bot) return;
  const account = accountFromRow(bot);

  await db
    .update(broadcasts)
    .set({ status: "sending", startedAt: broadcast.startedAt ?? new Date() })
    .where(eq(broadcasts.id, broadcastId));

  const recipients = await db
    .select()
    .from(broadcastRecipients)
    .where(and(eq(broadcastRecipients.broadcastId, broadcastId), eq(broadcastRecipients.status, "pending")));

  for (const recipient of recipients) {
    // Smart timing: their usual hour has not come yet; a later tick picks them up.
    if (recipient.sendAt && recipient.sendAt.getTime() > Date.now()) continue;
    // Claim the row first: another worker (or the confirm request) may be sending this broadcast too.
    const [claimed] = await db
      .update(broadcastRecipients)
      .set({ status: "sending" })
      .where(and(eq(broadcastRecipients.id, recipient.id), eq(broadcastRecipients.status, "pending")))
      .returning();
    if (!claimed) continue;
    try {
      const [contact] = await db.select().from(contacts).where(eq(contacts.id, recipient.contactId)).limit(1);
      if (!contact) throw new Error("Contact missing");
      if (!isBroadcastable(contact)) {
        await db
          .update(broadcastRecipients)
          .set({ status: "failed", error: "Unsubscribed" })
          .where(eq(broadcastRecipients.id, recipient.id));
        continue;
      }
      if (broadcast.flowId) {
        // Flow broadcast: each recipient starts the flow fresh (replacing any session they were in).
        await startFlowForContact({ contactId: contact.id, flowId: broadcast.flowId });
        await db
          .update(broadcastRecipients)
          .set({ status: "sent", sentAt: new Date(), error: null })
          .where(eq(broadcastRecipients.id, recipient.id));
        await bumpCounts(broadcastId, 1, 0);
        continue;
      }
      await acquireSendSlot(broadcast.botId, contact.telegramUserId);
      const record = await loadContactRecord(contact.id);
      const body = recipient.variant === "b" && broadcast.bodyB?.trim() ? broadcast.bodyB : broadcast.body;
      const personalized = record ? interpolateTemplate(body, record, botFieldValues(bot.settings)) : body;
      const sent = await sendChannelReply(account, channelTarget(contact), { text: personalized, source: "broadcast" });
      await db
        .update(broadcastRecipients)
        .set({ status: "sent", sentAt: new Date(), error: null })
        .where(eq(broadcastRecipients.id, recipient.id));
      await saveMessage({
        botId: broadcast.botId,
        contactId: contact.id,
        direction: "outbound",
        source: "broadcast",
        body: personalized,
        telegramMessageId: sent.message_id || null,
      });
      await bumpCounts(broadcastId, 1, 0);
    } catch (error) {
      await db
        .update(broadcastRecipients)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "Send failed",
        })
        .where(eq(broadcastRecipients.id, recipient.id));
      await bumpCounts(broadcastId, 0, 1);
    }
  }

  // Finish only when nobody is left waiting (smart timing) or mid-send elsewhere.
  const [open] = await db
    .select({ id: broadcastRecipients.id })
    .from(broadcastRecipients)
    .where(and(eq(broadcastRecipients.broadcastId, broadcastId), inArray(broadcastRecipients.status, ["pending", "sending"])))
    .limit(1);
  if (open) return;
  const [totals] = await db.select({ sent: broadcasts.sentCount, failed: broadcasts.failedCount }).from(broadcasts).where(eq(broadcasts.id, broadcastId));
  const status = (totals?.failed ?? 0) > 0 && (totals?.sent ?? 0) === 0 ? "failed" : "sent";
  await db
    .update(broadcasts)
    .set({
      status,
      finishedAt: new Date(),
      lastError: status === "failed" ? "All recipients failed" : null,
    })
    .where(and(eq(broadcasts.id, broadcastId), eq(broadcasts.status, "sending")));
}

async function handleJob(job: Job) {
  if (job.kind === "webhook") {
    await processChannelUpdate(job.botId, job.update);
    return;
  }
  if (job.kind === "broadcast") {
    await handleBroadcast(job.broadcastId);
  }
}

let lastSmartCheck = 0;

/** Smart-timing broadcasts stay "sending" for up to a day; send whoever's hour has come. */
async function releaseSmartRecipients() {
  if (Date.now() - lastSmartCheck < 30_000) return;
  lastSmartCheck = Date.now();
  const db = await getDb();
  const due = await db
    .selectDistinct({ id: broadcasts.id })
    .from(broadcasts)
    .innerJoin(broadcastRecipients, eq(broadcastRecipients.broadcastId, broadcasts.id))
    .where(
      and(
        eq(broadcasts.status, "sending"),
        eq(broadcasts.smartTiming, true),
        eq(broadcastRecipients.status, "pending"),
        lte(broadcastRecipients.sendAt, new Date()),
      ),
    );
  for (const row of due) await handleBroadcast(row.id);
}

export async function drainJobs(max = 25) {
  for (let i = 0; i < max; i += 1) {
    const job = await dequeueJob();
    if (!job) return;
    try {
      await handleJob(job);
    } catch (error) {
      log.error("Job failed", error instanceof Error ? error.message : error);
    }
  }
}

export function startWorker() {
  if (!shouldRunWorker() || globalForWorker.relayWorkerStarted) return;
  globalForWorker.relayWorkerStarted = true;
  log.info("Worker loop started");
  const tick = async () => {
    try {
      await releaseDueBroadcasts();
      await drainJobs();
      await releaseSmartRecipients();
      await resumeDueDelays();
      await resumeDueSequences();
    } catch (error) {
      log.error("Worker tick failed", error instanceof Error ? error.message : error);
    } finally {
      setTimeout(tick, 400);
    }
  };
  void tick();
}
