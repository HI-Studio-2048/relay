import { delKey, incrWithTtl, lpush, rpop } from "@/lib/redis";
import { workerMode } from "@/lib/env";

export type WebhookJob = {
  kind: "webhook";
  botId: string;
  update: unknown;
  /** Provider delivery id (X-Zernio-Event-Id). Retries carry the same id and are dropped. */
  eventId?: string | null;
};

export type BroadcastJob = {
  kind: "broadcast";
  broadcastId: string;
};

export type Job = WebhookJob | BroadcastJob;

const WEBHOOK_KEY = "relay:q:webhook";
const BROADCAST_KEY = "relay:q:broadcast";

export async function enqueueWebhook(job: WebhookJob) {
  const dedupeKey = job.eventId ? `relay:event:${job.botId}:${job.eventId}` : null;
  if (dedupeKey) {
    const seen = await incrWithTtl(dedupeKey, 60 * 60 * 24);
    if (seen > 1) return false;
  }
  try {
    await lpush(WEBHOOK_KEY, JSON.stringify(job));
  } catch (error) {
    // Let the provider's retry through: it carries the same event id.
    if (dedupeKey) await delKey(dedupeKey).catch(() => undefined);
    throw error;
  }
  return true;
}

export async function enqueueBroadcast(job: BroadcastJob) {
  await lpush(BROADCAST_KEY, JSON.stringify(job));
}

export async function dequeueJob(): Promise<Job | null> {
  const broadcast = await rpop(BROADCAST_KEY);
  if (broadcast) return JSON.parse(broadcast) as Job;
  const webhook = await rpop(WEBHOOK_KEY);
  if (webhook) return JSON.parse(webhook) as Job;
  return null;
}

export function shouldRunHttp() {
  const mode = workerMode();
  return mode === "web" || mode === "all";
}

export function shouldRunWorker() {
  const mode = workerMode();
  return mode === "worker" || mode === "all";
}
