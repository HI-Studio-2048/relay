import { eq } from "drizzle-orm";
import { isBroadcastable } from "@/lib/broadcast";
import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { bots, broadcastRecipients, broadcasts, contacts } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { resumeDueDelays } from "@/lib/flow-resume";
import { dequeueJob, shouldRunWorker, type Job } from "@/lib/queue";
import { acquireSendSlot } from "@/lib/rate-limit";
import { saveMessage } from "@/lib/store";
import { sendMessage } from "@/lib/telegram";
import { processTelegramUpdate } from "@/lib/webhook";
import type { TelegramUpdate } from "@/lib/telegram";

type GlobalWorker = { relayWorkerStarted?: boolean };
const globalForWorker = globalThis as unknown as GlobalWorker;

async function handleBroadcast(broadcastId: string) {
  const db = await getDb();
  const [broadcast] = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1);
  if (!broadcast) return;
  if (broadcast.status !== "queued" && broadcast.status !== "sending") return;

  const [bot] = await db.select().from(bots).where(eq(bots.id, broadcast.botId)).limit(1);
  if (!bot) return;
  const token = decryptSecret(bot.tokenEncrypted);

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
      await acquireSendSlot(broadcast.botId, contact.telegramUserId);
      const sent = await sendMessage(token, contact.telegramUserId, broadcast.body);
      await db
        .update(broadcastRecipients)
        .set({ status: "sent", sentAt: new Date(), error: null })
        .where(eq(broadcastRecipients.id, recipient.id));
      await saveMessage({
        botId: broadcast.botId,
        contactId: contact.id,
        direction: "outbound",
        source: "broadcast",
        body: broadcast.body,
        telegramMessageId: String(sent.message_id),
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
    await processTelegramUpdate(job.botId, job.update as TelegramUpdate);
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
      await drainJobs();
      await resumeDueDelays();
    } catch (error) {
      log.error("Worker tick failed", error instanceof Error ? error.message : error);
    } finally {
      setTimeout(tick, 400);
    }
  };
  void tick();
}
