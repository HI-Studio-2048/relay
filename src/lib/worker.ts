import { eq } from "drizzle-orm";
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

type GlobalWorker = { relayWorkerStarted?: boolean };
const globalForWorker = globalThis as unknown as GlobalWorker;

async function handleBroadcast(broadcastId: string) {
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
    .where(eq(broadcastRecipients.broadcastId, broadcastId));

  let sentCount = broadcast.sentCount;
  let failedCount = broadcast.failedCount;

  for (const recipient of recipients) {
    if (recipient.status !== "pending") continue;
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
        sentCount += 1;
        await db.update(broadcasts).set({ sentCount, failedCount }).where(eq(broadcasts.id, broadcastId));
        continue;
      }
      await acquireSendSlot(broadcast.botId, contact.telegramUserId);
      const record = await loadContactRecord(contact.id);
      const personalized = record ? interpolateTemplate(broadcast.body, record, botFieldValues(bot.settings)) : broadcast.body;
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
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await db
        .update(broadcastRecipients)
        .set({
          status: "failed",
          error: error instanceof Error ? error.message : "Send failed",
        })
        .where(eq(broadcastRecipients.id, recipient.id));
    }
    await db
      .update(broadcasts)
      .set({ sentCount, failedCount })
      .where(eq(broadcasts.id, broadcastId));
  }

  const status = failedCount > 0 && sentCount === 0 ? "failed" : "sent";
  await db
    .update(broadcasts)
    .set({
      status,
      finishedAt: new Date(),
      lastError: status === "failed" ? "All recipients failed" : null,
    })
    .where(eq(broadcasts.id, broadcastId));
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
