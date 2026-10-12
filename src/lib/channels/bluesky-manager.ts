import { eq } from "drizzle-orm";
import { accountFromRow } from "@/lib/channels";
import { acceptBlueskyConvo, blueskyEventId, explainBlueskyError, pollBlueskyLog } from "@/lib/channels/bluesky";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

const POLL_MS = 10_000;
const MAX_PAGES = 10;

/** Held on globalThis so a dev reload does not start a second poller beside the first. */
const store = globalThis as unknown as { __relayBlueskyBusy?: Set<string>; __relayBlueskyTimer?: ReturnType<typeof setInterval> };
const busy = (store.__relayBlueskyBusy ??= new Set<string>());

type Row = typeof bots.$inferSelect;

async function record(row: Row, error: string | null, cursor: string | null) {
  const settings = { ...(row.settings ?? {}), blueskyCursor: cursor };
  const changedStatus = error ? row.status !== "error" || row.lastHealthError !== error : row.status !== "connected";
  const changedCursor = cursor !== ((row.settings?.blueskyCursor as string | undefined) ?? null);
  if (!changedStatus && !changedCursor) return;
  const db = await getDb();
  await db
    .update(bots)
    .set({
      settings,
      ...(changedStatus ? { status: error ? "error" : "connected", lastHealthAt: new Date(), lastHealthError: error } : {}),
      updatedAt: new Date(),
    })
    .where(eq(bots.id, row.id));
}

/** Read one account's new DMs and queue them. The cursor only moves after the messages are queued. */
export async function pollBlueskyAccount(row: Row) {
  if (busy.has(row.id)) return;
  busy.add(row.id);
  let cursor = (row.settings?.blueskyCursor as string | undefined) ?? null;
  try {
    const account = accountFromRow(row);
    const seen = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await pollBlueskyLog(account, cursor);
      for (const event of result.events) {
        if (!seen.has(event.convoId)) {
          seen.add(event.convoId);
          await acceptBlueskyConvo(account, event.convoId);
        }
        await enqueueWebhook({ kind: "webhook", botId: row.id, update: event, eventId: blueskyEventId(event) });
      }
      cursor = result.cursor;
      if (!result.more) break;
    }
    if (seen.size > 0 && shouldRunWorker()) void drainJobs(5);
    await record(row, null, cursor);
  } catch (error) {
    const message = explainBlueskyError(error);
    log.warn("Bluesky poll failed", row.id, message);
    await record(row, message, cursor).catch(() => undefined);
  } finally {
    busy.delete(row.id);
  }
}

export async function pollBlueskyAccounts() {
  const db = await getDb();
  const rows = (await db.select().from(bots)).filter((row) => row.channel === "bluesky");
  await Promise.all(rows.map((row) => pollBlueskyAccount(row)));
}

/**
 * Bluesky does not push DMs, so check every connected account every few seconds. Only the process that
 * runs the worker polls: a second one would queue every message twice (the event id would drop the
 * duplicate, but the extra calls are waste).
 */
export function startBlueskyPolling() {
  if (store.__relayBlueskyTimer) return;
  const tick = () => void pollBlueskyAccounts().catch((error) => log.warn("Bluesky sync failed", error instanceof Error ? error.message : error));
  tick();
  store.__relayBlueskyTimer = setInterval(tick, POLL_MS);
  store.__relayBlueskyTimer.unref?.();
}
