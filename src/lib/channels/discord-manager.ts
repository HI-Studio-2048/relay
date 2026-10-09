import { eq } from "drizzle-orm";
import { discordEventId, parseDiscordEvent } from "@/lib/channels/discord";
import { DiscordGateway, type GatewayStatus } from "@/lib/channels/discord-gateway";
import { getDb } from "@/lib/db";
import { bots } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { log } from "@/lib/logger";
import { enqueueWebhook, shouldRunWorker } from "@/lib/queue";
import { drainJobs } from "@/lib/worker";

type Running = { gateway: DiscordGateway; tokenEncrypted: string };

/**
 * Held on globalThis so a dev reload doesn't leave the old connections open next to new ones.
 * One process owns the connections: a second instance would answer every DM twice.
 */
const store = globalThis as unknown as { __relayDiscord?: Map<string, Running> };
const running = (store.__relayDiscord ??= new Map<string, Running>());

async function recordStatus(botId: string, status: GatewayStatus, error?: string | null) {
  // "connecting" is transient and noisy; only the settled states are worth a write.
  if (status === "connecting") return;
  try {
    const db = await getDb();
    await db
      .update(bots)
      .set({
        status: status === "connected" ? "connected" : "error",
        lastHealthAt: new Date(),
        lastHealthError: status === "connected" ? null : error ?? "Disconnected",
        updatedAt: new Date(),
      })
      .where(eq(bots.id, botId));
  } catch (caught) {
    log.warn("Could not record Discord status", caught instanceof Error ? caught.message : caught);
  }
}

/** Bring the live connections in line with the connected Discord accounts: start new, restart changed, stop removed. */
export async function syncDiscordGateways() {
  const db = await getDb();
  const rows = (await db.select().from(bots)).filter((row) => row.channel === "discord");
  const wanted = new Set(rows.map((row) => row.id));

  for (const [botId, entry] of running) {
    if (!wanted.has(botId)) {
      entry.gateway.stop();
      running.delete(botId);
    }
  }

  for (const row of rows) {
    const current = running.get(row.id);
    if (current && current.tokenEncrypted === row.tokenEncrypted) continue;
    current?.gateway.stop();

    const botId = row.id;
    const gateway = new DiscordGateway({
      token: decryptSecret(row.tokenEncrypted),
      onStatus: (status, error) => void recordStatus(botId, status, error),
      onEvent: (event) => {
        if (parseDiscordEvent(event).length === 0) return;
        void enqueueWebhook({ kind: "webhook", botId, update: event, eventId: discordEventId(event) })
          .then(() => (shouldRunWorker() ? drainJobs(5) : undefined))
          .catch((error) => log.error("Discord event was not queued", error instanceof Error ? error.message : error));
      },
    });
    running.set(botId, { gateway, tokenEncrypted: row.tokenEncrypted });
    void gateway.start().catch((error) => log.error("Discord gateway failed to start", error instanceof Error ? error.message : error));
  }
}

/**
 * Open every connected Discord bot now, then re-check every minute so a bot connected through a
 * separate web process (or removed there) is picked up here.
 */
export function startDiscordGateways() {
  const tick = () => void syncDiscordGateways().catch((error) => log.warn("Discord sync failed", error instanceof Error ? error.message : error));
  tick();
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
}

export function discordGatewayState(botId: string) {
  return running.has(botId) ? "running" : "stopped";
}
