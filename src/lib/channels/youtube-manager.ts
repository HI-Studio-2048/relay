import { eq } from "drizzle-orm";
import { accountFromRow } from "@/lib/channels";
import { pollYouTubeComments, youtubeEventId } from "@/lib/channels/youtube";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

/**
 * YouTube does not push comments, so check each connected channel every two minutes. Each look costs one
 * unit of the project's daily quota (10,000 by default), about 720 a day per channel, so raise the
 * quota in Google Cloud before there are more than a dozen channels.
 */
const POLL_MS = 120_000;

const store = globalThis as unknown as { __relayYouTubeBusy?: Set<string>; __relayYouTubeTimer?: ReturnType<typeof setInterval> };
const busy = (store.__relayYouTubeBusy ??= new Set<string>());

type Row = typeof bots.$inferSelect;

async function record(row: Row, error: string | null, since: string | null) {
  const changedStatus = error ? row.status !== "error" || row.lastHealthError !== error : row.status !== "connected";
  const changedSince = since !== ((row.settings?.youtubeCommentsSince as string | undefined) ?? null);
  if (!changedStatus && !changedSince) return;
  const db = await getDb();
  await db
    .update(bots)
    .set({
      settings: { ...(row.settings ?? {}), youtubeCommentsSince: since },
      ...(changedStatus ? { status: error ? "error" : "connected", lastHealthAt: new Date(), lastHealthError: error } : {}),
      updatedAt: new Date(),
    })
    .where(eq(bots.id, row.id));
}

/** Read one channel's new comments and queue them. The position only moves after they are queued. */
export async function pollYouTubeChannel(row: Row) {
  if (busy.has(row.id)) return;
  busy.add(row.id);
  let since = (row.settings?.youtubeCommentsSince as string | undefined) ?? null;
  try {
    const page = await pollYouTubeComments(accountFromRow(row), since);
    for (const event of page.events) await enqueueWebhook({ kind: "webhook", botId: row.id, update: event, eventId: youtubeEventId(event) });
    since = page.since;
    if (page.events.length > 0 && shouldRunWorker()) void drainJobs(5);
    await record(row, null, since);
  } catch (error) {
    const message = error instanceof Error ? error.message : "YouTube check failed";
    log.warn("YouTube poll failed", row.id, message);
    await record(row, message, since).catch(() => undefined);
  } finally {
    busy.delete(row.id);
  }
}

export async function pollYouTubeChannels() {
  const db = await getDb();
  const rows = (await db.select().from(bots)).filter((row) => row.channel === "youtube");
  await Promise.all(rows.map((row) => pollYouTubeChannel(row)));
}

/** Only the process that runs the worker polls, like Bluesky. */
export function startYouTubePolling() {
  if (store.__relayYouTubeTimer) return;
  const tick = () => void pollYouTubeChannels().catch((error) => log.warn("YouTube sync failed", error instanceof Error ? error.message : error));
  tick();
  store.__relayYouTubeTimer = setInterval(tick, POLL_MS);
  store.__relayYouTubeTimer.unref?.();
}
